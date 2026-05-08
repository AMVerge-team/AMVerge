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
pub struct InitialClipsPayload {
    pub clips_json: String,
}

#[derive(Serialize, Clone)]
pub struct ThumbnailReadyPayload {
    pub position: u32,
}

#[derive(Serialize, Clone)]
pub struct PairResultPayload {
    pub pos_a: u32,
    pub pos_b: u32,
    pub should_merge: bool,
}
