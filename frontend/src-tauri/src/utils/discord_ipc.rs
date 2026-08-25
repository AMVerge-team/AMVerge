//! Minimal Discord IPC client — one named pipe (Windows) or unix socket, framed
//! JSON, no external crate.
//!
//! The official `discord-rpc` C++ library is deprecated, and the local protocol
//! is a page long, so we speak it directly (reference:
//! `discord/discord-rpc/documentation/hard-mode.md`):
//!
//! * Discord listens on `discord-ipc-0` … `-9` — Stable, PTB and Canary can run
//!   side by side, each holding its own — so we probe 0→9 and keep the first
//!   that answers.
//! * A frame is `[opcode u32 LE][len u32 LE][utf8 JSON]`, written in a **single**
//!   write: splitting the header from the body interleaves them on a Windows
//!   pipe and breaks the connection.
//! * `0 HANDSHAKE {v:1, client_id}` → Discord replies `DISPATCH`/`READY` with the
//!   logged-in user.
//! * `3 PING` must be answered with `4 PONG` carrying the nonce verbatim, or
//!   Discord drops us.
//!
//! Every command gets a reply frame, so the client is synchronous: write, then
//! read until the answer shows up. Unsolicited PINGs are answered along the way.
//! Discord not running is the nominal case, not a failure — [`DiscordIpc::connect`]
//! just returns an error and the caller retries later.

use std::io::{Read, Write};

use serde_json::{json, Value};

const OP_HANDSHAKE: u32 = 0;
const OP_FRAME: u32 = 1;
const OP_CLOSE: u32 = 2;
const OP_PING: u32 = 3;
const OP_PONG: u32 = 4;

/// `discord-ipc-0` … `discord-ipc-9`.
const PIPE_COUNT: u8 = 10;
/// A frame larger than this is a desync, not a message — bail instead of
/// allocating whatever the other end claims.
const MAX_FRAME_LEN: u32 = 1024 * 1024;
/// Frames read while waiting for a specific reply (pings, events we ignore).
const MAX_SKIPPED_FRAMES: usize = 32;

/// The Discord account the client is signed in as, for the settings screen.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DiscordUser {
    pub username: Option<String>,
    pub global_name: Option<String>,
}

impl DiscordUser {
    /// What the UI shows: display name first, handle as a fallback.
    pub fn label(&self) -> Option<String> {
        self.global_name
            .as_ref()
            .filter(|s| !s.is_empty())
            .or_else(|| self.username.as_ref().filter(|s| !s.is_empty()))
            .cloned()
    }
}

enum Transport {
    #[cfg(windows)]
    Pipe(std::fs::File),
    #[cfg(unix)]
    Socket(std::os::unix::net::UnixStream),
}

impl Transport {
    fn open(index: u8) -> std::io::Result<Self> {
        #[cfg(windows)]
        {
            let path = format!(r"\\?\pipe\discord-ipc-{index}");
            let file = std::fs::OpenOptions::new().read(true).write(true).open(path)?;
            Ok(Transport::Pipe(file))
        }

        #[cfg(unix)]
        {
            // Discord follows the XDG runtime dir; inside Flatpak/Snap it nests
            // the sockets one level down.
            let base = std::env::var("XDG_RUNTIME_DIR")
                .or_else(|_| std::env::var("TMPDIR"))
                .unwrap_or_else(|_| "/tmp".to_string());
            let mut last =
                std::io::Error::new(std::io::ErrorKind::NotFound, "no discord socket");
            for sub in ["", "app/com.discordapp.Discord", "snap.discord"] {
                let path = std::path::Path::new(&base)
                    .join(sub)
                    .join(format!("discord-ipc-{index}"));
                match std::os::unix::net::UnixStream::connect(path) {
                    Ok(sock) => {
                        // A socket that accepts but never answers must not wedge
                        // the worker thread for good.
                        let _ =
                            sock.set_read_timeout(Some(std::time::Duration::from_secs(10)));
                        return Ok(Transport::Socket(sock));
                    }
                    Err(e) => last = e,
                }
            }
            Err(last)
        }
    }
}

impl Read for Transport {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        match self {
            #[cfg(windows)]
            Transport::Pipe(f) => f.read(buf),
            #[cfg(unix)]
            Transport::Socket(s) => s.read(buf),
        }
    }
}

impl Write for Transport {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        match self {
            #[cfg(windows)]
            Transport::Pipe(f) => f.write(buf),
            #[cfg(unix)]
            Transport::Socket(s) => s.write(buf),
        }
    }

    fn flush(&mut self) -> std::io::Result<()> {
        match self {
            #[cfg(windows)]
            Transport::Pipe(f) => f.flush(),
            #[cfg(unix)]
            Transport::Socket(s) => s.flush(),
        }
    }
}

pub struct DiscordIpc {
    transport: Transport,
    pub user: Option<DiscordUser>,
}

impl DiscordIpc {
    /// Probe `discord-ipc-0` … `-9` and handshake with the first pipe that
    /// answers `READY`. `Err` means "no Discord here right now" — retry later.
    pub fn connect(app_id: &str) -> Result<Self, String> {
        let mut last = "Discord is not running".to_string();
        for index in 0..PIPE_COUNT {
            let transport = match Transport::open(index) {
                Ok(t) => t,
                Err(e) => {
                    last = e.to_string();
                    continue;
                }
            };
            let mut client = DiscordIpc {
                transport,
                user: None,
            };
            match client.handshake(app_id) {
                Ok(()) => return Ok(client),
                // The pipe exists but is not a usable Discord (another program
                // squatting the name, a client still booting) — try the next.
                Err(e) => last = e,
            }
        }
        Err(last)
    }

    fn handshake(&mut self, app_id: &str) -> Result<(), String> {
        self.write_frame(OP_HANDSHAKE, &json!({ "v": 1, "client_id": app_id }))?;
        let ready = self.read_until(|op, msg| {
            op == OP_FRAME
                && msg.get("cmd").and_then(Value::as_str) == Some("DISPATCH")
                && msg.get("evt").and_then(Value::as_str) == Some("READY")
        })?;
        self.user = ready
            .get("data")
            .and_then(|d| d.get("user"))
            .map(|u| DiscordUser {
                username: u.get("username").and_then(Value::as_str).map(String::from),
                global_name: u
                    .get("global_name")
                    .and_then(Value::as_str)
                    .map(String::from),
            });
        Ok(())
    }

    /// Publish an activity, or clear the presence with `None`.
    pub fn set_activity(&mut self, activity: Option<Value>) -> Result<(), String> {
        let nonce = uuid::Uuid::new_v4().to_string();
        self.write_frame(
            OP_FRAME,
            &json!({
                "cmd": "SET_ACTIVITY",
                // `pid` is mandatory; a null activity is how Discord clears one.
                "args": { "pid": std::process::id(), "activity": activity },
                "nonce": nonce,
            }),
        )?;
        // Consume the ack so it cannot be mistaken for the next command's reply.
        let reply = self.read_until(|op, msg| {
            op == OP_FRAME && msg.get("nonce").and_then(Value::as_str) == Some(nonce.as_str())
        })?;
        if reply.get("evt").and_then(Value::as_str) == Some("ERROR") {
            let detail = reply
                .get("data")
                .and_then(|d| d.get("message"))
                .and_then(Value::as_str)
                .unwrap_or("discord rejected the activity");
            return Err(detail.to_string());
        }
        Ok(())
    }

    /// Best-effort goodbye: clearing the presence before the pipe dies keeps a
    /// stale "playing AMVerge" from lingering on the profile.
    pub fn close(&mut self) {
        let _ = self.set_activity(None);
        let _ = self.write_frame(OP_CLOSE, &json!({}));
        let _ = self.transport.flush();
    }

    fn write_frame(&mut self, op: u32, payload: &Value) -> Result<(), String> {
        let body = serde_json::to_vec(payload).map_err(|e| e.to_string())?;
        let mut frame = Vec::with_capacity(8 + body.len());
        frame.extend_from_slice(&op.to_le_bytes());
        frame.extend_from_slice(&(body.len() as u32).to_le_bytes());
        frame.extend_from_slice(&body);
        // One write: a split header/body interleaves on a Windows pipe.
        self.transport.write_all(&frame).map_err(|e| e.to_string())?;
        self.transport.flush().map_err(|e| e.to_string())
    }

    fn read_frame(&mut self) -> Result<(u32, Value), String> {
        let mut header = [0u8; 8];
        self.transport
            .read_exact(&mut header)
            .map_err(|e| e.to_string())?;
        let op = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
        let len = u32::from_le_bytes([header[4], header[5], header[6], header[7]]);
        if len > MAX_FRAME_LEN {
            return Err(format!("oversized frame ({len} bytes)"));
        }
        let mut body = vec![0u8; len as usize];
        self.transport
            .read_exact(&mut body)
            .map_err(|e| e.to_string())?;
        let msg: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
        Ok((op, msg))
    }

    /// Read frames until `want` matches, answering pings and surfacing `CLOSE`.
    fn read_until(&mut self, want: impl Fn(u32, &Value) -> bool) -> Result<Value, String> {
        for _ in 0..MAX_SKIPPED_FRAMES {
            let (op, msg) = self.read_frame()?;
            if op == OP_PING {
                // Nonce echoed verbatim, or Discord hangs up on us.
                self.write_frame(OP_PONG, &msg)?;
                continue;
            }
            if op == OP_CLOSE {
                let why = msg
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("connection closed by Discord");
                return Err(why.to_string());
            }
            if want(op, &msg) {
                return Ok(msg);
            }
        }
        Err("no answer from Discord".to_string())
    }
}
