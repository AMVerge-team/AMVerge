/// every pack shares this env (GPU decode needs 3.13, below)
pub(crate) const AI_ENV_PYTHON_VERSION: &str = "3.12";

/// CUDA wheel index used when an NVIDIA GPU is present
pub(crate) const TORCH_CUDA_INDEX: &str = "https://download.pytorch.org/whl/cu128";

// GPU decode (Nelux/NVDEC): opt-in, because cu130 drops every pre-Turing GPU

/// Nelux ships no wheels below this
pub(crate) const AI_ENV_PYTHON_VERSION_GPU_DECODE: &str = "3.13";

/// the only index carrying a torch new enough for Nelux (cu128 stops at 2.11)
pub(crate) const TORCH_CUDA_INDEX_GPU_DECODE: &str = "https://download.pytorch.org/whl/cu130";

/// pinned, not a floor: Nelux checks torch's minor on import and refuses a mismatch
pub(crate) const TORCH_PIN_GPU_DECODE: &str = "torch==2.14.*";

/// built for torch 2.14; 0.21 fixed a read_frame deadlock 0.18 hit at random on long 10-bit hevc.
/// its metadata names no torch, so move both pins together
pub(crate) const NELUX_PIN_GPU_DECODE: &str = "nelux==0.21.*";

/// Turing. read from `nvidia-smi --query-gpu=compute_cap`, so no torch needed
pub(crate) const GPU_DECODE_MIN_COMPUTE: f32 = 7.5;

/// both from the CUDA index: torchvision is ABI-locked to its torch build
pub(crate) const TORCH_FAMILY: &[&str] = &["torch", "torchvision"];

/// one AI capability: its amverge extra, and the distributions that prove it
pub(crate) struct Pack {
    pub(crate) id: &'static str,
    pub(crate) extra: &'static str,
    /// distribution names (as `uv pip list` reports them) that must all be present
    pub(crate) requires: &'static [&'static str],
}

pub(crate) const PACKS: &[Pack] = &[
    Pack {
        id: "ml",
        extra: "ml",
        requires: &["torch", "transnetv2-pytorch"],
    },
    Pack {
        id: "depth",
        extra: "depth",
        // the model code is vendored in amverge (>= 0.10), so it has no distribution of its own
        requires: &["torch", "torchvision", "opencv-python-headless"],
    },
    Pack {
        id: "scout",
        extra: "scout",
        requires: &["torch", "transformers", "pillow"],
    },
    Pack {
        id: "upscale",
        extra: "upscale",
        requires: &["torch", "spandrel", "onnxruntime", "opencv-python-headless"],
    },
];

pub(crate) fn pack_by_id(id: &str) -> Result<&'static Pack, String> {
    PACKS
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("Unknown AI pack: {id}"))
}
