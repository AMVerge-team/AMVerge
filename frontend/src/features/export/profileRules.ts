import {
  ExportAudioMode,
  ExportCodec,
  ExportCodecFamily,
  ExportContainer,
  ExportEditorTarget,
  ExportHardwareMode,
  ExportProfile,
  ExportProfileIcon,
  ExportWorkflow,
  NvidiaEncoderProfile,
} from "./profileTypes";
import {
  AUDIO_MODE_LABELS,
  CODEC_FAMILY_TO_CODECS,
  CODEC_LABELS,
  DEFAULT_EXPORT_PROFILE,
  EXPORT_AUDIO_OPTIONS,
  EXPORT_CODEC_OPTIONS,
  EXPORT_CONTAINER_OPTIONS,
  EXPORT_PROFILE_ICON_VALUES,
  LEGACY_AUDIO_MODE_MAP,
  LEGACY_CODEC_MAP,
  LEGACY_PROFILE_ICON_MAP,
  LEGACY_WORKFLOW_MAP,
  NVIDIA_ENCODER_PROFILE_OPTIONS,
} from "./profileOptions";

export function coerceExportCodec(codec: string | undefined | null): ExportCodec {
  if (!codec) return "h264_high";
  if ((EXPORT_CODEC_OPTIONS as { value: string }[]).some((option) => option.value === codec)) {
    return codec as ExportCodec;
  }
  return LEGACY_CODEC_MAP[codec] ?? "h264_high";
}

export function coerceExportProfileIcon(icon: string | undefined | null): ExportProfileIcon {
  if (!icon) return "video";
  if ((EXPORT_PROFILE_ICON_VALUES as string[]).includes(icon)) {
    return icon as ExportProfileIcon;
  }
  return LEGACY_PROFILE_ICON_MAP[icon] ?? "video";
}

export function coerceExportAudioMode(audioMode: string | undefined | null): ExportAudioMode {
  if (!audioMode) return "copy";
  if ((EXPORT_AUDIO_OPTIONS as { value: string }[]).some((option) => option.value === audioMode)) {
    return audioMode as ExportAudioMode;
  }
  return LEGACY_AUDIO_MODE_MAP[audioMode] ?? "copy";
}

export function getExportCodecLabel(codec: ExportCodec): string {
  return CODEC_LABELS[codec] ?? "Unknown codec";
}

export function getCodecFamily(codec: ExportCodec): ExportCodecFamily {
  const normalized = coerceExportCodec(codec);

  if (normalized.startsWith("h264_")) return "h264";
  if (normalized.startsWith("h265_")) return "h265";
  if (normalized === "av1_main") return "h265";
  if (normalized.startsWith("prores_")) return "prores";
  return "h264";
}

export function getCodecOptionsForFamily(
  family: ExportCodecFamily
): { value: ExportCodec; label: string }[] {
  const allowed = CODEC_FAMILY_TO_CODECS[family];
  return EXPORT_CODEC_OPTIONS.filter((option) => allowed.includes(option.value));
}

export function coerceExportContainer(container: string | undefined | null): ExportContainer {
  if (!container) return "mp4";
  if ((EXPORT_CONTAINER_OPTIONS as { value: string }[]).some((option) => option.value === container)) {
    return container as ExportContainer;
  }
  return "mp4";
}

export function usesEncoding(workflow: ExportWorkflow): boolean {
  return workflow === "video_encode";
}

export function usesEditorTarget(workflow: ExportWorkflow): boolean {
  switch (workflow) {
    case "video_encode":
    case "video_remux":
      return false;
    default:
      return false;
  }
}

export function supportsClipMerge(workflow: ExportWorkflow): boolean {
  switch (workflow) {
    case "video_encode":
    case "video_remux":
      return true;
    default:
      return false;
  }
}

export function supportsAudioMode(workflow: ExportWorkflow): boolean {
  switch (workflow) {
    case "video_encode":
    case "video_remux":
      return true;
    default:
      return false;
  }
}

export function supportsContainerSelection(workflow: ExportWorkflow): boolean {
  switch (workflow) {
    case "video_encode":
    case "video_remux":
      return true;
    default:
      return false;
  }
}

export function isQuickDownloadCompatibleWorkflow(workflow: ExportWorkflow): boolean {
  switch (workflow) {
    case "video_encode":
    case "video_remux":
      return true;
    default:
      return false;
  }
}

export function isExportCodecContainerCompatible(
  codec: ExportCodec,
  container: ExportContainer
): boolean {
  const family = getCodecFamily(codec);

  switch (container) {
    case "mp4":
      return family === "h264" || family === "h265" || family === "av1";
    case "mov":
      return family === "h264" || family === "h265" || family === "av1" || family === "prores";
    case "mxf":
      return family === "prores";
    default:
      return true;
  }
}

export function getRecommendedContainerForCodec(codec: ExportCodec): ExportContainer {
  const family = getCodecFamily(codec);
  if (family === "prores") return "mov";
  return "mp4";
}

export function coerceExportWorkflow(workflow: string | undefined | null): ExportWorkflow {
  if (!workflow) return "video_encode";
  if (workflow === "video_encode" || workflow === "video_remux") {
    return workflow;
  }
  return LEGACY_WORKFLOW_MAP[workflow] ?? "video_encode";
}

export function getNvidiaEncoderProfile(profile: NvidiaEncoderProfile) {
  return (
    NVIDIA_ENCODER_PROFILE_OPTIONS.find((option) => option.value === profile) ??
    NVIDIA_ENCODER_PROFILE_OPTIONS[0]
  );
}

export function inferNvidiaProfileFromGpuName(gpuName: string | null | undefined): NvidiaEncoderProfile {
  const normalized = (gpuName ?? "").trim().toLowerCase();
  if (!normalized.includes("nvidia")) return "unsupported";

  if (normalized.includes("rtx 50") || normalized.includes("blackwell")) return "blackwell";
  if (
    normalized.includes("rtx 40") ||
    normalized.includes(" ada") ||
    normalized.includes(" l40") ||
    normalized.includes(" l4")
  ) {
    return "ada";
  }
  if (
    normalized.includes("rtx 30") ||
    normalized.includes("rtx a2000") ||
    normalized.includes("rtx a3000") ||
    normalized.includes("rtx a4000") ||
    normalized.includes("rtx a4500") ||
    normalized.includes("rtx a5000") ||
    normalized.includes("rtx a5500") ||
    normalized.includes("rtx a6000") ||
    normalized.includes("a10") ||
    normalized.includes("a16") ||
    normalized.includes("a2") ||
    normalized.includes("a30") ||
    normalized.includes("a40") ||
    normalized.includes("ampere")
  ) {
    return "ampere";
  }
  if (
    normalized.includes("rtx 20") ||
    normalized.includes("gtx 16") ||
    normalized.includes("titan rtx") ||
    normalized.includes("quadro rtx") ||
    normalized.includes("t4") ||
    normalized.includes("turing")
  ) {
    return "turing";
  }
  if (normalized.includes("gtx 10") || normalized.includes("p40") || normalized.includes("p4") || normalized.includes("pascal")) {
    return "pascal";
  }
  if (normalized.includes("gtx 9") || normalized.includes("maxwell")) return "maxwell_2";

  return "unknown";
}

export function isCodecGpuEligible(codec: ExportCodec): boolean {
  const normalized = coerceExportCodec(codec);
  return (
    normalized === "h264_main" ||
    normalized === "h264_high" ||
    normalized === "h264_high10" ||
    normalized === "h264_high422" ||
    normalized === "h265_main" ||
    normalized === "h265_main10" ||
    normalized === "h265_main12" ||
    normalized === "h265_main422_10" ||
    normalized === "av1_main"
  );
}

export const isCodecNvencEligible = isCodecGpuEligible;

export function isCodecSupportedByNvidiaProfile(
  codec: ExportCodec,
  nvidiaProfile: NvidiaEncoderProfile
): boolean {
  const support = getNvidiaEncoderProfile(nvidiaProfile);
  return support.supportedCodecs.includes(coerceExportCodec(codec));
}

export function getParallelExportLimit(profile: ExportProfile): number {
  if (!usesEncoding(profile.workflow) || profile.hardwareMode === "cpu") return 1;

  const codec = coerceExportCodec(profile.codec);
  if (!isCodecGpuEligible(codec)) return 1;

  const support = getNvidiaEncoderProfile(profile.nvidiaEncoderProfile);
  if (support.value === "unknown" || support.value === "unsupported") return 1;
  if (!support.supportedCodecs.includes(codec)) return 1;

  return Math.max(1, support.maxParallelExports);
}

export function getExportProfileSummary(profile: ExportProfile): string {
  const codec = coerceExportCodec(profile.codec);
  const codecLabel = usesEncoding(profile.workflow)
    ? getExportCodecLabel(codec)
    : "Stream copy";
  const audioLabel = AUDIO_MODE_LABELS[profile.audioMode] || "Audio copy";
  const containerLabel = profile.container.toUpperCase();

  return `${codecLabel} • ${audioLabel} • ${containerLabel}`;
}

export function getActiveExportProfile(
  profiles: ExportProfile[],
  activeProfileId: string
): ExportProfile {
  return profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? DEFAULT_EXPORT_PROFILE;
}

export function normalizeExportProfile(profile: ExportProfile): ExportProfile {
  const workflow: ExportWorkflow = coerceExportWorkflow(profile.workflow as string | undefined);
  const codec = coerceExportCodec(profile.codec);
  const icon = coerceExportProfileIcon((profile.icon as string | undefined) ?? null);
  const customIconPath =
    typeof profile.customIconPath === "string" && profile.customIconPath.trim() !== ""
      ? profile.customIconPath
      : null;
  const editorTarget: ExportEditorTarget = "none";
  let container = coerceExportContainer(profile.container);

  if (usesEncoding(workflow) && !isExportCodecContainerCompatible(codec, container)) {
    container = getRecommendedContainerForCodec(codec);
  }

  const nvidiaEncoderProfile = profile.nvidiaEncoderProfile || "unknown";

  let hardwareMode: ExportHardwareMode = usesEncoding(workflow)
    ? profile.hardwareMode || "auto"
    : "cpu";

  if (hardwareMode !== "cpu" && !isCodecGpuEligible(codec)) {
    hardwareMode = "cpu";
  }

  const normalized: ExportProfile = {
    ...profile,
    icon: icon === "custom" && !customIconPath ? "video" : icon,
    customIconPath,
    workflow,
    codec,
    editorTarget,
    hardwareMode,
    nvidiaEncoderProfile,
    name: typeof profile.name === "string" ? profile.name : "Export Profile",
    audioMode: coerceExportAudioMode(profile.audioMode),
    container,
    mergeEnabled: profile.mergeEnabled ?? false,
    parallelExports: Number.isFinite(profile.parallelExports) ? profile.parallelExports : 1,
  };

  const limit = getParallelExportLimit(normalized);
  const parallelExports = Math.max(1, Math.min(limit, Math.round(normalized.parallelExports || 1)));

  return {
    ...normalized,
    parallelExports,
  };
}

export function createExportProfile(index: number): ExportProfile {
  return normalizeExportProfile({
    ...DEFAULT_EXPORT_PROFILE,
    id: `export-profile-${Date.now()}-${index}`,
    name: `Export Profile ${index}`,
  });
}
