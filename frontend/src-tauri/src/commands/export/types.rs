#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptionsPayload {
    // Part of the frontend payload contract; not consumed on the Rust side.
    #[allow(dead_code)]
    pub(super) profile_id: String,
    pub(super) workflow: String,
    #[allow(dead_code)]
    pub(super) editor_target: String,
    pub(super) codec: String,
    pub(super) audio_mode: String,
    pub(super) hardware_mode: String,
    pub(super) parallel_exports: u8,
}

impl ExportOptionsPayload {
    pub(super) fn workflow(&self) -> &str {
        &self.workflow
    }

    pub(super) fn parallel_exports(&self) -> usize {
        self.parallel_exports.max(1) as usize
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NvidiaEncoderDetectionPayload {
    pub has_nvidia_gpu: bool,
    pub gpu_name: Option<String>,
    pub profile: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuEncoderCapabilitiesPayload {
    pub has_gpu_encoder: bool,
    pub preferred_backend: String,
    pub available_backends: Vec<String>,
    pub available_video_encoders: Vec<String>,
    pub h264_encoder: Option<String>,
    pub h265_encoder: Option<String>,
    pub av1_encoder: Option<String>,
    pub max_parallel_exports: u8,
}

impl Default for GpuEncoderCapabilitiesPayload {
    fn default() -> Self {
        Self {
            has_gpu_encoder: false,
            preferred_backend: "none".to_string(),
            available_backends: Vec::new(),
            available_video_encoders: Vec::new(),
            h264_encoder: None,
            h265_encoder: None,
            av1_encoder: None,
            max_parallel_exports: 1,
        }
    }
}
