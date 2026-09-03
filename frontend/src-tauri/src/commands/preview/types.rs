use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewAudioStream {
    pub audio_stream_index: u32,
    pub label: String,
    /// just the language name ("English"), for a picker that only needs to say
    /// which language a track is in
    pub language_label: String,
    /// the track's own title, which is what tells two tracks in the same
    /// language apart. empty when the stream is untitled
    pub title: String,
    /// raw ffprobe language tag ("eng"), empty when the stream is untagged
    pub language: String,
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
