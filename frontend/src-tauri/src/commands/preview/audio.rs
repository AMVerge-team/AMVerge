use std::process::Command;

use tauri::AppHandle;

use crate::utils::ffmpeg::resolve_bundled_tool;
use crate::utils::process::apply_no_window;

use super::types::PreviewAudioStream;

pub(crate) fn normalize_language_label(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "jpn" | "ja" => "Japanese".to_string(),
        "eng" | "en" => "English".to_string(),
        "spa" | "es" => "Spanish".to_string(),
        "fra" | "fre" | "fr" => "French".to_string(),
        "deu" | "ger" | "de" => "German".to_string(),
        "ita" | "it" => "Italian".to_string(),
        "por" | "pt" => "Portuguese".to_string(),
        "rus" | "ru" => "Russian".to_string(),
        "kor" | "ko" => "Korean".to_string(),
        "zho" | "chi" | "zh" => "Chinese".to_string(),
        "ara" | "ar" => "Arabic".to_string(),
        "hin" | "hi" => "Hindi".to_string(),
        "tha" | "th" => "Thai".to_string(),
        "vie" | "vi" => "Vietnamese".to_string(),
        "ind" | "id" => "Indonesian".to_string(),
        "tur" | "tr" => "Turkish".to_string(),
        "pol" | "pl" => "Polish".to_string(),
        "nld" | "dut" | "nl" => "Dutch".to_string(),
        "swe" | "sv" => "Swedish".to_string(),
        "nor" | "no" => "Norwegian".to_string(),
        "dan" | "da" => "Danish".to_string(),
        "fin" | "fi" => "Finnish".to_string(),
        "ukr" | "uk" => "Ukrainian".to_string(),
        "ces" | "cze" | "cs" => "Czech".to_string(),
        "ron" | "rum" | "ro" => "Romanian".to_string(),
        "hun" | "hu" => "Hungarian".to_string(),
        _ => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                "Unknown".to_string()
            } else {
                trimmed.to_string()
            }
        }
    }
}

#[tauri::command]
pub async fn get_audio_streams(app: AppHandle, video_path: String) -> Result<Vec<PreviewAudioStream>, String> {
    if video_path.trim().is_empty() {
        return Err("video_path is empty".to_string());
    }

    let ffprobe = resolve_bundled_tool(&app, "ffprobe")?;

    let ffprobe_output = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new(&ffprobe);
        apply_no_window(&mut cmd);
        cmd.args([
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index:stream_tags=language,title",
            "-of",
            "json",
            &video_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe ({}): {e}", ffprobe.display()))
    })
    .await
    .map_err(|e| format!("ffprobe task panicked: {e}"))??;

    if !ffprobe_output.status.success() {
        let stderr = String::from_utf8_lossy(&ffprobe_output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "ffprobe failed while reading audio streams".to_string()
        } else {
            format!("ffprobe failed while reading audio streams: {stderr}")
        });
    }

    let parsed: serde_json::Value = serde_json::from_slice(&ffprobe_output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe json: {e}"))?;

    let streams = parsed
        .get("streams")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out: Vec<PreviewAudioStream> = Vec::with_capacity(streams.len());
    for (audio_order_index, stream) in streams.into_iter().enumerate() {
        let tags = stream.get("tags").and_then(|v| v.as_object());
        let language_raw = tags
            .and_then(|t| t.get("language"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let title = tags
            .and_then(|t| t.get("title"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        let language = normalize_language_label(language_raw);
        // the trailing track number was only there to disambiguate two streams
        // sharing a language; the title already does that when present, and a
        // bare number next to "English" reads like part of the language name
        let label = if title.is_empty() {
            language.clone()
        } else {
            format!("{} - {}", language, title)
        };

        out.push(PreviewAudioStream {
            audio_stream_index: audio_order_index as u32,
            label,
            language_label: language.clone(),
            title: title.clone(),
            language: language_raw.trim().to_lowercase(),
        });
    }

    Ok(out)
}
