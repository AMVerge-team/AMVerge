//! wire types: camelCase, matching the cli's json and `frontend/src/features/sceneScout/types.ts`

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoutDatabase {
    pub name: String,
    pub path: String,
    pub video_count: u64,
    pub scene_count: u64,
    pub size_bytes: u64,
    pub model_version: String,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoutVideo {
    pub id: i64,
    pub filepath: String,
    pub name: String,
    pub scene_count: u64,
    pub status: String,
    #[serde(default)]
    pub modified_at: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoutHit {
    pub video_path: String,
    pub scene_index: i64,
    pub start_ms: i64,
    pub end_ms: i64,
    pub start_sec: f64,
    pub end_sec: f64,
    pub score: f64,
    pub database: String,
    #[serde(default)]
    pub thumbnail_b64: Option<String>,
    /// `{start, end}` motion tags; absent for scenes indexed without motion
    #[serde(default)]
    pub motion: Option<serde_json::Value>,
}

/// the clip a flow search continues: a whole file, or a range inside one
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutFlowFrom {
    pub path: String,
    #[serde(default)]
    pub start_ms: Option<i64>,
    #[serde(default)]
    pub end_ms: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoutStatus {
    pub model_available: bool,
    pub model_version: String,
    #[serde(default)]
    pub device: Option<String>,
    pub root: String,
    pub database_count: u64,
}

/// a progress line from the cli, forwarded to the webview as `scout_progress`
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoutIndexProgress {
    pub stage: String,
    pub done: u64,
    pub total: u64,
    #[serde(default)]
    pub video: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoutGenerateThumbnailsResult {
    pub done: bool,
    pub generated: u64,
    pub database: String,
}

/// search options, mirroring the app's search settings dropdown
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutSearchArgs {
    pub query: String,
    #[serde(default)]
    pub databases: Vec<String>,
    #[serde(default)]
    pub videos: Vec<String>,
    #[serde(default)]
    pub top_k: Option<u32>,
    #[serde(default)]
    pub threshold: Option<f64>,
    #[serde(default)]
    pub include_thumbnails: Option<bool>,
    #[serde(default)]
    pub keep_model_in_memory: Option<bool>,
    #[serde(default)]
    pub gpu_standby: Option<bool>,
    /// rank scenes by how much they look like this clip's last frame
    #[serde(default)]
    pub flow_from: Option<ScoutFlowFrom>,
}

#[derive(Deserialize)]
pub(super) struct DatabaseEnvelope {
    pub database: ScoutDatabase,
}

#[derive(Deserialize)]
pub(super) struct DatabasesEnvelope {
    pub databases: Vec<ScoutDatabase>,
}

#[derive(Deserialize)]
pub(super) struct DeletedEnvelope {
    pub deleted: bool,
}

#[derive(Deserialize)]
pub(super) struct VideosEnvelope {
    pub videos: Vec<ScoutVideo>,
}

#[derive(Deserialize)]
pub(super) struct ResultsEnvelope {
    pub results: Vec<ScoutHit>,
    #[serde(default)]
    pub error: Option<String>,
}
