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
//! Between commands, [`DiscordIpc::poll`] checks the pipe without blocking —
//! that is what notices Discord closing, and what answers a ping before Discord
//! decides we went silent.
//!
//! Reads are buffered: a chunk can split a frame or carry several, and a
//! non-blocking peek can hand back half a header.
//!
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

/// One wording for a dead pipe, whichever layer notices it first.
pub const CLOSED: &str = "connection closed by Discord";

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

/// Bytes readable on a named pipe, or `None` once it is broken.
#[cfg(windows)]
fn peek_named_pipe(file: &std::fs::File) -> Option<u32> {
    use std::os::windows::io::AsRawHandle;

    #[link(name = "kernel32")]
    extern "system" {
        fn PeekNamedPipe(
            pipe: *mut std::ffi::c_void,
            buffer: *mut std::ffi::c_void,
            buffer_size: u32,
            bytes_read: *mut u32,
            total_available: *mut u32,
            bytes_left: *mut u32,
        ) -> i32;
    }

    let mut available: u32 = 0;
    // Null buffer of size 0: ask how much is queued, copy nothing.
    let ok = unsafe {
        PeekNamedPipe(
            file.as_raw_handle() as *mut std::ffi::c_void,
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            &mut available,
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        None
    } else {
        Some(available)
    }
}

pub struct DiscordIpc {
    transport: Transport,
    /// Bytes read from the pipe but not yet framed.
    buf: Vec<u8>,
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
                buf: Vec::new(),
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
        self.set_activity_raw(activity).map(|_| ())
    }

    /// Same, but hands back Discord's reply. The reply echoes the activity as
    /// the client stored it, which is the only honest way to see which fields it
    /// kept and which it dropped without a word.
    pub fn set_activity_raw(&mut self, activity: Option<Value>) -> Result<Value, String> {
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
        Ok(reply)
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

    /// Pull one complete frame out of the buffer, or `None` while it holds less
    /// than a whole one.
    fn take_frame(&mut self) -> Result<Option<(u32, Value)>, String> {
        if self.buf.len() < 8 {
            return Ok(None);
        }
        let op = u32::from_le_bytes([self.buf[0], self.buf[1], self.buf[2], self.buf[3]]);
        let len = u32::from_le_bytes([self.buf[4], self.buf[5], self.buf[6], self.buf[7]]);
        if len > MAX_FRAME_LEN {
            return Err(format!("oversized frame ({len} bytes)"));
        }
        let total = 8 + len as usize;
        if self.buf.len() < total {
            return Ok(None);
        }
        let msg: Value = serde_json::from_slice(&self.buf[8..total]).unwrap_or(Value::Null);
        self.buf.drain(..total);
        Ok(Some((op, msg)))
    }

    /// Block until the pipe hands over more bytes. Zero bytes means the other
    /// end went away.
    fn fill(&mut self) -> Result<usize, String> {
        let mut chunk = [0u8; 4096];
        match self.transport.read(&mut chunk) {
            Ok(0) => Err(CLOSED.to_string()),
            Ok(n) => {
                self.buf.extend_from_slice(&chunk[..n]);
                Ok(n)
            }
            Err(e) => Err(e.to_string()),
        }
    }

    fn read_frame(&mut self) -> Result<(u32, Value), String> {
        loop {
            if let Some(frame) = self.take_frame()? {
                return Ok(frame);
            }
            self.fill()?;
        }
    }

    /// Service the pipe without blocking: answer any ping waiting on it and say
    /// whether the connection is still alive.
    ///
    /// Without this the worker would only learn Discord had quit the next time
    /// it wrote - up to a heartbeat later - and a ping would sit unanswered just
    /// as long, which is itself grounds for Discord to hang up on us.
    pub fn poll(&mut self) -> bool {
        loop {
            match self.fill_nonblocking() {
                Ok(0) => return true, // nothing waiting, still connected
                Ok(_) => {}
                Err(_) => return false,
            }
            // Drain what completed; a half-arrived frame stays buffered for the
            // next pass.
            loop {
                match self.take_frame() {
                    Ok(Some((OP_PING, msg))) => {
                        if self.write_frame(OP_PONG, &msg).is_err() {
                            return false;
                        }
                    }
                    Ok(Some((OP_CLOSE, _))) => return false,
                    // An answer to something nobody is waiting on any more; the
                    // nonce match in read_until is what pairs replies up.
                    Ok(Some(_)) => {}
                    Ok(None) => break,
                    Err(_) => return false,
                }
            }
        }
    }

    /// Bytes waiting on the pipe, appended to the buffer. `Ok(0)` means "nothing
    /// right now"; `Err` means the pipe is gone.
    #[cfg(windows)]
    fn fill_nonblocking(&mut self) -> Result<usize, String> {
        let Transport::Pipe(file) = &self.transport;
        // PeekNamedPipe is the sanctioned way to look at a blocking pipe without
        // consuming or waiting. PIPE_NOWAIT exists but is discouraged, and it
        // would change the semantics of every other read in this file.
        let available = peek_named_pipe(file).ok_or(CLOSED)?;
        if available == 0 {
            return Ok(0);
        }
        self.fill()
    }

    #[cfg(unix)]
    fn fill_nonblocking(&mut self) -> Result<usize, String> {
        let Transport::Socket(sock) = &self.transport;
        sock.set_nonblocking(true).map_err(|e| e.to_string())?;
        let mut chunk = [0u8; 4096];
        let outcome = match self.transport.read(&mut chunk) {
            Ok(0) => Err(CLOSED.to_string()),
            Ok(n) => {
                self.buf.extend_from_slice(&chunk[..n]);
                Ok(n)
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(0),
            Err(e) => Err(e.to_string()),
        };
        // Back to blocking: every other read in this file expects to wait.
        let Transport::Socket(sock) = &self.transport;
        let _ = sock.set_nonblocking(false);
        outcome
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
                let why = msg.get("message").and_then(Value::as_str).unwrap_or(CLOSED);
                return Err(why.to_string());
            }
            if want(op, &msg) {
                return Ok(msg);
            }
        }
        Err("no answer from Discord".to_string())
    }
}
