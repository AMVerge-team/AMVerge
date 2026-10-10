import type { ExportAudioMode, ExportContainer } from "./profileTypes";

export type ExportSourceStreams = {
  videoCodec: string | null;
  audioCodecs: string[];
};

const SOURCE_CONTAINER_RE = /\.([a-z0-9]+)$/i;
const PRESERVED_CONTAINERS = new Set<ExportContainer>(["avi", "mp4", "mov"]);

// Defaults are deliberately conservative. The CLI checks the actual muxer
// before it writes anything, which remains necessary for profile/tag details.
const VIDEO_CONTAINER_DEFAULTS: Record<string, ExportContainer> = {
  h264: "mp4",
  avc: "mp4",
  hevc: "mp4",
  h265: "mp4",
  prores: "mov",
  lagarith: "avi",
  huffyuv: "avi",
  msmpeg4v3: "avi",
};

export function remuxContainerForSource(
  sourcePath: string,
  videoCodec: string | null | undefined
): ExportContainer {
  const extension = sourcePath.match(SOURCE_CONTAINER_RE)?.[1]?.toLowerCase();
  if (extension && PRESERVED_CONTAINERS.has(extension as ExportContainer)) {
    return extension as ExportContainer;
  }
  return VIDEO_CONTAINER_DEFAULTS[(videoCodec ?? "").toLowerCase()] ?? "mp4";
}

function canCopyAudio(codec: string, container: ExportContainer): boolean {
  const normalized = codec.toLowerCase();
  if (container === "avi") return ["mp3", "pcm_s16le", "pcm_s24le", "pcm_s32le"].includes(normalized);
  if (container === "mov") {
    return ["aac", "ac3", "eac3", "mp3", "alac", "pcm_s16le", "pcm_s16be", "pcm_s24le", "pcm_s24be", "pcm_s32le", "pcm_f32le", "qdm2"].includes(normalized);
  }
  return ["aac", "ac3", "eac3", "mp3", "alac", "opus"].includes(normalized);
}

/** A user-selected encode mode wins; only an incompatible audio copy is auto-adjusted. */
export function remuxAudioModeForSource(
  requested: ExportAudioMode,
  container: ExportContainer,
  audioCodecs: string[]
): ExportAudioMode {
  if (requested !== "copy" || audioCodecs.every((codec) => canCopyAudio(codec, container))) {
    return requested;
  }
  // AVI has broad legacy support for MP3; 320 kbps is the user-facing MP3 mode.
  return container === "avi" ? "mp3" : "aac";
}
