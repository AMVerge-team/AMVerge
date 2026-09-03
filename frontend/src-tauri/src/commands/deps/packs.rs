/// Python the AI env is built on. the CLI itself allows >=3.11, but
/// depth-anything-v2 requires >=3.12, and the env is shared by every pack
pub(crate) const AI_ENV_PYTHON_VERSION: &str = "3.12";

/// CUDA wheel index used when an NVIDIA GPU is present. matches the index the
/// sidecar used to be built against
pub(crate) const TORCH_CUDA_INDEX: &str = "https://download.pytorch.org/whl/cu128";

/// distributions that must come from the CUDA index together. torchvision is
/// pulled in by depth-anything-v2 and is ABI-locked to its torch build, so a
/// CPU torchvision beside a CUDA torch is not a usable combination
pub(crate) const TORCH_FAMILY: &[&str] = &["torch", "torchvision"];

/// a pack: one user-facing AI capability, its amverge extra, and the
/// distributions that prove it is installed
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
        requires: &["torch", "depth-anything-v2", "opencv-python-headless"],
    },
    Pack {
        id: "interpolation",
        extra: "interpolation",
        requires: &["torch", "scipy", "opencv-python-headless"],
    },
    Pack {
        id: "upscale",
        extra: "upscale",
        requires: &["torch", "spandrel", "onnxruntime"],
    },
];

pub(crate) fn pack_by_id(id: &str) -> Result<&'static Pack, String> {
    PACKS
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("Unknown AI pack: {id}"))
}
