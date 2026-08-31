//! Discord sign-in for event hosts.
//!
//! Authorization-code + PKCE against a loopback redirect (RFC 8252). The
//! desktop app holds no Discord client secret: it posts the code to the AMVerge
//! backend, which performs the exchange and returns an AMVerge session token.
//!
//! The session token stays in this process and in the OS credential store. It
//! is never handed to the webview, never written to localStorage, and never
//! appears in an `invoke` payload — the frontend only ever sees the profile.

use std::sync::Mutex;
use std::time::Duration;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

use super::backend::{api_base_url, api_url, http_client, read_config_var};

const BUILD_DISCORD_APP_CLIENT_ID: Option<&str> = option_env!("AMVERGE_DISCORD_APP_CLIENT_ID");

const KEYRING_SERVICE: &str = "AMVerge";
const KEYRING_ACCOUNT: &str = "discord-session";

/// How long the loopback listener waits for the browser to come back before it
/// gives up and frees the port.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

/// Cap on the callback request we are willing to read. A browser redirect is a
/// few hundred bytes; anything larger is not the request we are waiting for.
const MAX_CALLBACK_REQUEST_BYTES: usize = 8 * 1024;

/// Discord matches `redirect_uri` against its registered list exactly — it does
/// not grant loopback the any-port allowance RFC 8252 asks for. So the port
/// cannot be arbitrary: these are tried in order until one is free, and every
/// one of them has to be registered on the Discord application as
/// `http://127.0.0.1:<port>/callback`.
const CALLBACK_PORTS: [u16; 3] = [53421, 53422, 53423];

async fn bind_callback_listener() -> Result<(TcpListener, u16), String> {
    let mut last_error = None;

    for port in CALLBACK_PORTS {
        match TcpListener::bind(("127.0.0.1", port)).await {
            Ok(listener) => return Ok((listener, port)),
            Err(e) => last_error = Some(e),
        }
    }

    Err(match last_error {
        Some(e) => format!("Could not open the sign-in listener on any allowed port: {e}"),
        None => "No sign-in callback ports are configured.".to_string(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordUser {
    pub id: String,
    pub username: String,
    pub avatar_hash: Option<String>,
}

impl DiscordUser {
    /// Discord's CDN is reachable from the webview: `img-src` is unconstrained,
    /// only `connect-src` is locked down.
    pub fn avatar_url(&self) -> Option<String> {
        self.avatar_hash.as_ref().map(|hash| {
            format!(
                "https://cdn.discordapp.com/avatars/{}/{}.png?size=64",
                self.id, hash
            )
        })
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordProfile {
    pub id: String,
    pub username: String,
    pub avatar_url: Option<String>,
}

impl From<&DiscordUser> for DiscordProfile {
    fn from(user: &DiscordUser) -> Self {
        DiscordProfile {
            id: user.id.clone(),
            username: user.username.clone(),
            avatar_url: user.avatar_url(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct StoredSession {
    token: String,
    user: DiscordUser,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LoginResult {
    ok: bool,
    message: Option<String>,
    profile: Option<DiscordProfile>,
}

#[derive(Default)]
pub struct DiscordAuthState {
    pending: Mutex<Option<JoinHandle<()>>>,
}

impl DiscordAuthState {
    fn set_pending(&self, handle: JoinHandle<()>) {
        let previous = match self.pending.lock() {
            Ok(mut guard) => guard.replace(handle),
            Err(_) => None,
        };

        // Starting a second login abandons the first, so its listener must go
        // or the port stays bound until the timeout.
        if let Some(previous) = previous {
            previous.abort();
        }
    }

    fn take_pending(&self) -> Option<JoinHandle<()>> {
        self.pending.lock().ok().and_then(|mut guard| guard.take())
    }
}

/// Session tokens are signed by the server that issued them, so one from a
/// local API is meaningless to production and vice versa. Scoping the
/// credential to its API host keeps a development build and a release build
/// from overwriting each other's session and presenting the wrong token —
/// which the server can only report as an invalid signature.
fn keyring_account() -> String {
    match api_base_url() {
        Ok(base) => format!("{KEYRING_ACCOUNT}@{base}"),
        Err(_) => KEYRING_ACCOUNT.to_string(),
    }
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, &keyring_account())
        .map_err(|e| format!("Credential store is unavailable: {e}"))
}

fn load_session() -> Option<StoredSession> {
    let entry = keyring_entry().ok()?;
    let raw = entry.get_password().ok()?;
    serde_json::from_str::<StoredSession>(&raw).ok()
}

fn save_session(session: &StoredSession) -> Result<(), String> {
    let raw = serde_json::to_string(session)
        .map_err(|e| format!("Failed to serialize session: {e}"))?;
    keyring_entry()?
        .set_password(&raw)
        .map_err(|e| format!("Failed to store session: {e}"))
}

fn clear_session() {
    if let Ok(entry) = keyring_entry() {
        // A missing entry is the desired end state either way.
        let _ = entry.delete_credential();
    }
}

/// Drops a session the server has refused. A stored token the API will not
/// accept — because it was signed by a different deployment, or its secret was
/// rotated — is worse than none: every request fails until it is cleared, and
/// the app has no way to explain why.
pub fn discard_rejected_session() {
    clear_session();
}

/// Bearer token for the authenticated event routes. Lives in this process only.
pub fn session_token() -> Option<String> {
    load_session().map(|session| session.token)
}

fn random_token() -> String {
    // Two v4 UUIDs give 32 random bytes; hex keeps it inside the PKCE verifier
    // charset without pulling in another encoder.
    format!(
        "{}{}",
        hex::encode(uuid::Uuid::new_v4().as_bytes()),
        hex::encode(uuid::Uuid::new_v4().as_bytes())
    )
}

fn code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn percent_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

/// Reads `code` and `state` out of the callback request line. Returns `None`
/// for anything that is not a GET of the callback path, so a stray probe on the
/// port cannot complete a login.
fn parse_callback(request: &str) -> Option<(String, String)> {
    let request_line = request.lines().next()?;
    let mut parts = request_line.split_whitespace();

    if parts.next()? != "GET" {
        return None;
    }

    let target = parts.next()?;
    let (path, query) = target.split_once('?')?;
    if path != "/callback" {
        return None;
    }

    let mut code = None;
    let mut state = None;

    for pair in query.split('&') {
        let Some((key, value)) = pair.split_once('=') else {
            continue;
        };
        match key {
            "code" => code = Some(decode_component(value)),
            "state" => state = Some(decode_component(value)),
            _ => {}
        }
    }

    Some((code?, state?))
}

fn decode_component(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(byte) => {
                        out.push(byte);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }

    String::from_utf8_lossy(&out).into_owned()
}

fn browser_response(title: &str, detail: &str) -> String {
    // Static strings only — nothing from the request is echoed back.
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>AMVerge</title>\
<style>body{{background:#111;color:#eee;font-family:system-ui,sans-serif;display:flex;\
align-items:center;justify-content:center;height:100vh;margin:0}}\
div{{text-align:center}}h1{{font-weight:400}}p{{color:#aaa}}</style></head>\
<body><div><h1>{title}</h1><p>{detail}</p></div></body></html>"
    );

    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExchangeResponse {
    session_token: Option<String>,
    user: Option<DiscordUser>,
    message: Option<String>,
}

async fn exchange_code(
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<StoredSession, String> {
    let endpoint = api_url("/api/auth/discord/exchange")?;
    let client = http_client()?;

    let response = client
        .post(endpoint)
        .json(&serde_json::json!({
            "client": "app",
            "code": code,
            "codeVerifier": verifier,
            "redirectUri": redirect_uri,
        }))
        .send()
        .await
        .map_err(|e| format!("Could not reach AMVerge to complete sign-in: {e}"))?;

    let status = response.status();
    let parsed = response.json::<ExchangeResponse>().await.ok();

    if !status.is_success() {
        return Err(parsed
            .and_then(|body| body.message)
            .unwrap_or_else(|| format!("Sign-in failed with HTTP {}.", status.as_u16())));
    }

    let parsed = parsed.ok_or_else(|| "AMVerge returned an unreadable response.".to_string())?;
    let token = parsed
        .session_token
        .ok_or_else(|| "AMVerge did not return a session token.".to_string())?;
    let user = parsed
        .user
        .ok_or_else(|| "AMVerge did not return a Discord profile.".to_string())?;

    Ok(StoredSession { token, user })
}

/// Starts the login. Returns the Discord authorize URL for the frontend to open
/// in the system browser; the result of the login arrives as a `discord-login`
/// event once the browser comes back to the loopback listener.
#[tauri::command]
pub async fn begin_discord_login(
    app: AppHandle,
    auth: tauri::State<'_, DiscordAuthState>,
) -> Result<String, String> {
    let client_id = read_config_var(
        "AMVERGE_DISCORD_APP_CLIENT_ID",
        BUILD_DISCORD_APP_CLIENT_ID,
    )
    .ok_or_else(|| "Discord sign-in is not configured on this build.".to_string())?;

    // Bind before anything else: without a port there is no redirect URI to put
    // in the authorize URL.
    let (listener, port) = bind_callback_listener().await?;

    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let verifier = random_token();
    let expected_state = random_token();

    let authorize_url = format!(
        "https://discord.com/oauth2/authorize?client_id={}&response_type=code&redirect_uri={}&scope=identify&state={}&code_challenge={}&code_challenge_method=S256&prompt=consent",
        percent_encode(&client_id),
        percent_encode(&redirect_uri),
        percent_encode(&expected_state),
        percent_encode(&code_challenge(&verifier)),
    );

    let task_app = app.clone();
    let task_redirect = redirect_uri.clone();

    let handle = tokio::spawn(async move {
        let outcome = tokio::time::timeout(LOGIN_TIMEOUT, async {
            loop {
                let (mut stream, _) = match listener.accept().await {
                    Ok(accepted) => accepted,
                    Err(e) => return Err(format!("Sign-in listener failed: {e}")),
                };

                let mut buffer = vec![0_u8; MAX_CALLBACK_REQUEST_BYTES];
                let read = match stream.read(&mut buffer).await {
                    Ok(read) => read,
                    Err(_) => continue,
                };

                let request = String::from_utf8_lossy(&buffer[..read]).into_owned();
                let Some((code, state)) = parse_callback(&request) else {
                    // Favicon requests and port scans land here; keep waiting
                    // for the real redirect.
                    let _ = stream
                        .write_all(browser_response("AMVerge", "Waiting for Discord.").as_bytes())
                        .await;
                    let _ = stream.shutdown().await;
                    continue;
                };

                // The state check is what stops someone else's authorization
                // code from being fed to this listener.
                if state != expected_state {
                    let _ = stream
                        .write_all(
                            browser_response(
                                "Sign-in failed",
                                "The sign-in request did not match. Try again from AMVerge.",
                            )
                            .as_bytes(),
                        )
                        .await;
                    let _ = stream.shutdown().await;
                    return Err("Sign-in state did not match. Start the login again.".to_string());
                }

                let result = exchange_code(&code, &verifier, &task_redirect).await;

                let page = match &result {
                    Ok(_) => browser_response("Signed in", "You can close this tab and return to AMVerge."),
                    Err(_) => browser_response("Sign-in failed", "Return to AMVerge and try again."),
                };
                let _ = stream.write_all(page.as_bytes()).await;
                let _ = stream.shutdown().await;

                return result;
            }
        })
        .await;

        let payload = match outcome {
            Ok(Ok(session)) => {
                let profile = DiscordProfile::from(&session.user);
                match save_session(&session) {
                    Ok(()) => LoginResult {
                        ok: true,
                        message: None,
                        profile: Some(profile),
                    },
                    Err(message) => LoginResult {
                        ok: false,
                        message: Some(message),
                        profile: None,
                    },
                }
            }
            Ok(Err(message)) => LoginResult {
                ok: false,
                message: Some(message),
                profile: None,
            },
            Err(_) => LoginResult {
                ok: false,
                message: Some("Sign-in timed out. Try again.".to_string()),
                profile: None,
            },
        };

        let _ = task_app.emit("discord-login", payload);
    });

    auth.set_pending(handle);

    Ok(authorize_url)
}

/// Drops the loopback listener when the user backs out of the login, rather
/// than leaving the port bound until the timeout.
#[tauri::command]
pub fn cancel_discord_login(auth: tauri::State<'_, DiscordAuthState>) {
    if let Some(handle) = auth.take_pending() {
        handle.abort();
    }
}

#[tauri::command]
pub fn discord_session() -> Option<DiscordProfile> {
    load_session().map(|session| DiscordProfile::from(&session.user))
}

#[tauri::command]
pub fn discord_logout(auth: tauri::State<'_, DiscordAuthState>) {
    if let Some(handle) = auth.take_pending() {
        handle.abort();
    }
    clear_session();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_callback_request() {
        let request = "GET /callback?code=abc&state=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        assert_eq!(
            parse_callback(request),
            Some(("abc".to_string(), "xyz".to_string()))
        );
    }

    #[test]
    fn rejects_other_paths_and_methods() {
        assert!(parse_callback("GET /favicon.ico?code=a&state=b HTTP/1.1\r\n").is_none());
        assert!(parse_callback("POST /callback?code=a&state=b HTTP/1.1\r\n").is_none());
        assert!(parse_callback("GET /callback HTTP/1.1\r\n").is_none());
    }

    #[test]
    fn decodes_percent_escapes() {
        let request = "GET /callback?code=a%2Bb&state=c%20d HTTP/1.1\r\n";
        assert_eq!(
            parse_callback(request),
            Some(("a+b".to_string(), "c d".to_string()))
        );
    }

    #[test]
    fn derives_the_documented_pkce_challenge() {
        // RFC 7636 appendix B.
        assert_eq!(
            code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }
}
