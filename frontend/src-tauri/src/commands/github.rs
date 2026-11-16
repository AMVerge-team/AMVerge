use serde::{Deserialize, Serialize};

use super::backend::http_client;

const CONTRIBUTORS_URL: &str =
    "https://api.github.com/repos/AMVerge-team/AMVerge/contributors?per_page=100";
const EXCLUDED_LOGINS: &[&str] = &["0xkhaosoccured"];

#[derive(Debug, Deserialize)]
struct ApiContributor {
    login: String,
    avatar_url: String,
    html_url: String,
    contributions: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubContributor {
    pub login: String,
    pub avatar_url: String,
    pub html_url: String,
    pub contributions: u32,
}

#[tauri::command]
pub async fn fetch_github_contributors() -> Result<Vec<GithubContributor>, String> {
    let client = http_client()?;
    let response = client
        .get(CONTRIBUTORS_URL)
        .header("User-Agent", "AMVerge")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed to reach GitHub: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API returned HTTP {}", response.status().as_u16()));
    }

    let raw = response
        .json::<Vec<ApiContributor>>()
        .await
        .map_err(|e| format!("Failed to parse GitHub contributors: {e}"))?;

    let mut contributors: Vec<GithubContributor> = raw
        .into_iter()
        .filter(|c| {
            !c.login.ends_with("[bot]")
                && !EXCLUDED_LOGINS
                    .iter()
                    .any(|excluded| c.login.eq_ignore_ascii_case(excluded))
        })
        .map(|c| GithubContributor {
            login: c.login,
            avatar_url: c.avatar_url,
            html_url: c.html_url,
            contributions: c.contributions,
        })
        .collect();

    contributors.sort_by(|a, b| b.contributions.cmp(&a.contributions));
    Ok(contributors)
}
