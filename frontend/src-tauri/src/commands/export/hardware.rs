use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::utils::process::apply_no_window;

use super::types::{GpuEncoderCapabilitiesPayload, NvidiaEncoderDetectionPayload};

const GPU_BACKEND_PRIORITY: [&str; 5] = ["nvidia", "amd", "intel", "videotoolbox", "vaapi"];
const NVIDIA_MAX_PARALLEL_EXPORTS: u8 = 12;
const NON_NVIDIA_MAX_PARALLEL_EXPORTS: u8 = 1;

fn backend_encoder_name(backend: &str, family: &str) -> Option<&'static str> {
    match (backend, family) {
        ("nvidia", "h264") => Some("h264_nvenc"),
        ("nvidia", "h265") => Some("hevc_nvenc"),
        ("nvidia", "av1") => Some("av1_nvenc"),
        ("amd", "h264") => Some("h264_amf"),
        ("amd", "h265") => Some("hevc_amf"),
        ("amd", "av1") => Some("av1_amf"),
        ("intel", "h264") => Some("h264_qsv"),
        ("intel", "h265") => Some("hevc_qsv"),
        ("intel", "av1") => Some("av1_qsv"),
        ("videotoolbox", "h264") => Some("h264_videotoolbox"),
        ("videotoolbox", "h265") => Some("hevc_videotoolbox"),
        ("videotoolbox", "av1") => Some("av1_videotoolbox"),
        ("vaapi", "h264") => Some("h264_vaapi"),
        ("vaapi", "h265") => Some("hevc_vaapi"),
        ("vaapi", "av1") => Some("av1_vaapi"),
        _ => None,
    }
}

fn parse_available_video_encoders(stdout: &str) -> HashSet<String> {
    let mut encoders = HashSet::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let mut parts = trimmed.split_whitespace();
        let flags = parts.next().unwrap_or_default();
        let encoder = parts.next().unwrap_or_default();

        let looks_like_encoder_name = encoder
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_');

        if flags.len() == 6 && flags.contains('V') && looks_like_encoder_name {
            encoders.insert(encoder.to_string());
        }
    }

    encoders
}

fn probe_encoder_available(ffmpeg_path: &Path, encoder: &str) -> bool {
    let mut cmd = Command::new(ffmpeg_path);
    apply_no_window(&mut cmd);

    let output = cmd
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=64x64:r=1",
            "-frames:v",
            "1",
            "-an",
            "-c:v",
            encoder,
            "-pix_fmt",
            "yuv420p",
            "-f",
            "null",
            "-",
        ])
        .output();

    match output {
        Ok(value) => value.status.success(),
        Err(_) => false,
    }
}

fn infer_nvidia_profile_from_name(gpu_name: &str) -> String {
    let name = gpu_name.trim().to_ascii_lowercase();
    if !name.contains("nvidia") {
        return "unsupported".to_string();
    }
    if name.contains("rtx 50") || name.contains("blackwell") {
        return "blackwell".to_string();
    }
    if name.contains("rtx 40")
        || name.contains(" ada")
        || name.contains(" l40")
        || name.contains(" l4")
    {
        return "ada".to_string();
    }
    if name.contains("rtx 30")
        || name.contains("rtx a2000")
        || name.contains("rtx a3000")
        || name.contains("rtx a4000")
        || name.contains("rtx a4500")
        || name.contains("rtx a5000")
        || name.contains("rtx a5500")
        || name.contains("rtx a6000")
        || name.contains("a10")
        || name.contains("a16")
        || name.contains("a2")
        || name.contains("a30")
        || name.contains("a40")
        || name.contains("ampere")
    {
        return "ampere".to_string();
    }
    if name.contains("rtx 20")
        || name.contains("gtx 16")
        || name.contains("titan rtx")
        || name.contains("quadro rtx")
        || name.contains("t4")
        || name.contains("turing")
    {
        return "turing".to_string();
    }
    if name.contains("gtx 10")
        || name.contains("p40")
        || name.contains("p4")
        || name.contains("pascal")
    {
        return "pascal".to_string();
    }
    if name.contains("gtx 9") || name.contains("maxwell") {
        return "maxwell_2".to_string();
    }
    "unknown".to_string()
}

pub(super) async fn detect_gpu_encoder_capabilities_inner(
    ffmpeg_path: PathBuf,
) -> Result<GpuEncoderCapabilitiesPayload, String> {
    let probe = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new(&ffmpeg_path);
        apply_no_window(&mut cmd);
        let output = cmd.args(["-hide_banner", "-encoders"]).output()?;

        if !output.status.success() {
            return Ok::<GpuEncoderCapabilitiesPayload, std::io::Error>(
                GpuEncoderCapabilitiesPayload::default(),
            );
        }

        let raw = String::from_utf8_lossy(&output.stdout);
        let available_video_encoders = parse_available_video_encoders(&raw);
        let mut listed_backends: Vec<String> = Vec::new();
        let mut validated_backends: Vec<String> = Vec::new();

        for backend in GPU_BACKEND_PRIORITY {
            let Some(h264_encoder) = backend_encoder_name(backend, "h264") else {
                continue;
            };

            if !available_video_encoders.contains(h264_encoder) {
                continue;
            }

            listed_backends.push(backend.to_string());

            if probe_encoder_available(&ffmpeg_path, h264_encoder) {
                validated_backends.push(backend.to_string());
            }
        }

        let available_backends = if !validated_backends.is_empty() {
            validated_backends
        } else {
            listed_backends
        };

        let preferred_backend = available_backends
            .first()
            .cloned()
            .unwrap_or_else(|| "none".to_string());

        let select_encoder_for_family = |family: &str| -> Option<String> {
            for backend in &available_backends {
                let Some(name) = backend_encoder_name(backend, family) else {
                    continue;
                };

                if available_video_encoders.contains(name) {
                    return Some(name.to_string());
                }
            }
            None
        };

        let h264_encoder = select_encoder_for_family("h264");
        let h265_encoder = select_encoder_for_family("h265");
        let av1_encoder = select_encoder_for_family("av1");
        let has_gpu_encoder =
            h264_encoder.is_some() || h265_encoder.is_some() || av1_encoder.is_some();

        let max_parallel_exports = if preferred_backend == "nvidia" {
            NVIDIA_MAX_PARALLEL_EXPORTS
        } else if has_gpu_encoder {
            NON_NVIDIA_MAX_PARALLEL_EXPORTS
        } else {
            1
        };

        let mut available_video_encoders_sorted =
            available_video_encoders.into_iter().collect::<Vec<_>>();
        available_video_encoders_sorted.sort();

        Ok::<GpuEncoderCapabilitiesPayload, std::io::Error>(GpuEncoderCapabilitiesPayload {
            has_gpu_encoder,
            preferred_backend,
            available_backends,
            available_video_encoders: available_video_encoders_sorted,
            h264_encoder,
            h265_encoder,
            av1_encoder,
            max_parallel_exports,
        })
    })
    .await
    .map_err(|e| format!("ffmpeg encoder probe task panicked: {e}"))?;

    probe.map_err(|e| format!("Failed to probe ffmpeg encoders: {e}"))
}

pub(super) async fn detect_nvidia_encoder_profile_inner(
) -> Result<NvidiaEncoderDetectionPayload, String> {
    let probe = tokio::task::spawn_blocking(|| {
        let mut cmd = Command::new("nvidia-smi");
        apply_no_window(&mut cmd);
        cmd.args(["--query-gpu=name", "--format=csv,noheader"])
            .output()
    })
    .await
    .map_err(|e| format!("nvidia-smi task panicked: {e}"))?;

    let output = match probe {
        Ok(output) => output,
        Err(_) => {
            return Ok(NvidiaEncoderDetectionPayload {
                has_nvidia_gpu: false,
                gpu_name: None,
                profile: "unsupported".to_string(),
            });
        }
    };

    if !output.status.success() {
        return Ok(NvidiaEncoderDetectionPayload {
            has_nvidia_gpu: false,
            gpu_name: None,
            profile: "unsupported".to_string(),
        });
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let gpu_name = raw
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.split(',').next().unwrap_or(line).trim().to_string());

    if let Some(name) = gpu_name {
        let profile = infer_nvidia_profile_from_name(&name);
        Ok(NvidiaEncoderDetectionPayload {
            has_nvidia_gpu: !matches!(profile.as_str(), "unsupported"),
            gpu_name: Some(name),
            profile,
        })
    } else {
        Ok(NvidiaEncoderDetectionPayload {
            has_nvidia_gpu: false,
            gpu_name: None,
            profile: "unsupported".to_string(),
        })
    }
}
