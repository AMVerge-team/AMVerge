use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewAudioStream {
    pub audio_stream_index: u32,
    pub label: String,
    /// just the language name, for a picker that only needs that
    pub language_label: String,
    /// the track's own title, which tells same-language tracks apart; empty when untitled
    pub title: String,
    /// raw ffprobe language tag ("eng"), empty when the stream is untagged
    pub language: String,
}

/// codec names as ffprobe reports them, source facts only; the CLI decides what can be muxed
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSourceStreams {
    pub video_codec: Option<String>,
    pub audio_codecs: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneWebpJob {
    pub scene_id: String,
    pub source_path: String,
    pub start: f64,
    pub end: f64,
    pub fps: Option<u32>,
    pub episode_cache_id: Option<String>,
    pub custom_path: Option<String>,
    pub kind: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneWebpResult {
    pub scene_id: String,
    pub path: String,
    pub duration: f64,
    pub cached: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneWebpBatchItem {
    pub scene_id: String,
    pub path: Option<String>,
    pub duration: Option<f64>,
    pub cached: bool,
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneWebpBatchResult {
    pub items: Vec<SceneWebpBatchItem>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SceneWebpReadyPayload {
    pub(crate) scene_id: String,
    pub(crate) path: String,
}
