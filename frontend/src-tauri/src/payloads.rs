use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct ProgressPayload {
    pub percent: u8,
    pub message: String,
}

#[derive(Serialize, Clone)]
pub struct ConsoleLogPayload {
    pub source: String,
    pub level: String,
    pub message: String,
}

#[derive(Serialize, Clone)]
pub struct PassProgressPayload {
    pub pass: String,
    pub percent: u8,
    pub message: String,
}

#[derive(Serialize, Clone)]
pub struct PassPreviewPayload {
    pub pass: String,
    pub path: String,
    pub seq: u64,
}

#[derive(Serialize, Clone)]
pub struct PassLogPayload {
    pub pass: String,
    pub line: String,
}

#[derive(Serialize, Clone)]
pub struct InitialClipsPayload {
    pub clips_json: String,
    /// Which episode this belongs to. A batch import has several running at
    /// once (one still re-encoding while the next is cut), and the listeners
    /// key clips by episode - without this they would patch the wrong one.
    pub episode_cache_id: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct ThumbnailReadyPayload {
    pub position: u32,
    pub episode_cache_id: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct ClipReadyPayload {
    pub scene_index: u32,
    /// Absolute path to the cut clip, or None if cutting failed.
    pub clip_path: Option<String>,
    pub clip_mode: String,
    pub episode_cache_id: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct PairResultPayload {
    pub pos_a: u32,
    pub pos_b: u32,
    pub should_merge: bool,
}

#[derive(Serialize, Clone)]
pub struct ReencodeProgressPayload {
    pub done: u32,
    pub total: u32,
    pub episode_cache_id: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct Phase1CompletePayload {
    pub episode_cache_id: Option<String>,
}
