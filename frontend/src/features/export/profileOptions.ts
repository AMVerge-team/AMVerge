import {
  ExportAudioMode,
  ExportCodec,
  ExportCodecFamily,
  ExportContainer,
  ExportHardwareMode,
  ExportProfile,
  ExportProfileIcon,
  ExportWorkflow,
  NvidiaEncoderProfile,
} from "./profileTypes";

export const SAFE_DEFAULT_PARALLEL_EXPORTS = 8;

export const NVIDIA_ENCODER_SUPPORT_MATRIX_URL =
  "https://developer.nvidia.com/video-encode-decode-support-matrix";

export const EXPORT_WORKFLOW_OPTIONS: { value: ExportWorkflow; label: string }[] = [
  { value: "video_encode", label: "Export video (re-encode)" },
  { value: "video_remux", label: "Export video (stream copy / remux)" },
];

export const EXPORT_CODEC_OPTIONS: { value: ExportCodec; label: string }[] = [
  { value: "h264_main", label: "H.264 / AVC - Main" },
  { value: "h264_high", label: "H.264 / AVC - High" },
  { value: "h264_high10", label: "H.264 / AVC - High 10" },
  { value: "h264_high422", label: "H.264 / AVC - High 4:2:2" },
  { value: "h265_main", label: "H.265 / HEVC - Main" },
  { value: "h265_main10", label: "H.265 / HEVC - Main 10" },
  { value: "h265_main12", label: "H.265 / HEVC - Main 12" },
  { value: "h265_main422_10", label: "H.265 / HEVC - Main 4:2:2 10" },
  { value: "prores_422_lt", label: "ProRes 422 LT" },
  { value: "prores_422", label: "ProRes 422" },
  { value: "prores_422_hq", label: "ProRes 422 HQ" },
  { value: "prores_4444", label: "ProRes 4444" },
  { value: "prores_4444_xq", label: "ProRes 4444 XQ" },
];

export const EXPORT_AUDIO_OPTIONS: { value: ExportAudioMode; label: string }[] = [
  { value: "copy", label: "Keep audio copy" },
  { value: "aac", label: "AAC 192 kbps" },
  { value: "aac_320", label: "AAC 320 kbps" },
  { value: "pcm16", label: "PCM 16-bit" },
  { value: "pcm24", label: "PCM 24-bit" },
  { value: "mp3", label: "MP3 320 kbps" },
  { value: "none", label: "No audio" },
];

export const EXPORT_CONTAINER_OPTIONS: { value: ExportContainer; label: string }[] = [
  { value: "mp4", label: "MP4" },
  { value: "mov", label: "MOV" },
];

export const EXPORT_HARDWARE_OPTIONS: { value: ExportHardwareMode; label: string }[] = [
  { value: "auto", label: "Auto GPU / CPU" },
  { value: "gpu", label: "GPU" },
  { value: "cpu", label: "CPU" },
];

export const EXPORT_PROFILE_ICON_OPTIONS: { value: ExportProfileIcon; label: string }[] = [
  { value: "video", label: "Video" },
  { value: "remux", label: "Remux" },
  { value: "h264", label: "H.264" },
  { value: "h265", label: "H.265" },
  { value: "prores", label: "ProRes" },
  { value: "custom", label: "Custom" },
];

export const EXPORT_PROFILE_ICON_VALUES: ExportProfileIcon[] = [
  "video",
  "remux",
  "h264",
  "h265",
  "prores",
  "custom",
];

export const LEGACY_PROFILE_ICON_MAP: Record<string, ExportProfileIcon> = {
  av1: "h265",
  cineform: "prores",
  dnxhr: "prores",
  uncompressed: "prores",
  premiere: "video",
  after_effects: "video",
  resolve: "video",
  capcut: "video",
};

export const LEGACY_WORKFLOW_MAP: Record<string, ExportWorkflow> = {
  editor_encode: "video_encode",
  editor_remux: "video_remux",
};

export const NVIDIA_ENCODER_PROFILE_OPTIONS: {
  value: NvidiaEncoderProfile;
  label: string;
  maxParallelExports: number;
  supportedCodecs: ExportCodec[];
}[] = [
  {
    value: "unknown",
    label: "Unknown / verify NVIDIA matrix",
    maxParallelExports: 1,
    supportedCodecs: ["h264_main", "h264_high", "h265_main", "h265_main10"],
  },
  {
    value: "blackwell",
    label: "GeForce RTX 50 / Blackwell",
    maxParallelExports: 12,
    supportedCodecs: [
      "h264_main",
      "h264_high",
      "h264_high10",
      "h264_high422",
      "h265_main",
      "h265_main10",
      "h265_main12",
      "h265_main422_10",
      "av1_main",
    ],
  },
  {
    value: "ada",
    label: "GeForce RTX 40 / Ada",
    maxParallelExports: 12,
    supportedCodecs: ["h264_main", "h264_high", "h265_main", "h265_main10", "av1_main"],
  },
  {
    value: "ampere",
    label: "GeForce RTX 30 / Ampere",
    maxParallelExports: 12,
    supportedCodecs: ["h264_main", "h264_high", "h265_main", "h265_main10"],
  },
  {
    value: "turing",
    label: "GeForce GTX 16 / RTX 20 / Turing",
    maxParallelExports: 6,
    supportedCodecs: ["h264_main", "h264_high", "h265_main", "h265_main10"],
  },
  {
    value: "pascal",
    label: "GeForce GTX 10 / Pascal",
    maxParallelExports: 4,
    supportedCodecs: ["h264_main", "h264_high", "h265_main", "h265_main10"],
  },
  {
    value: "maxwell_2",
    label: "GeForce GTX 900 / Maxwell 2nd Gen",
    maxParallelExports: 2,
    supportedCodecs: ["h264_main", "h264_high"],
  },
  {
    value: "unsupported",
    label: "No supported NVIDIA NVENC",
    maxParallelExports: 1,
    supportedCodecs: [],
  },
];

export const DEFAULT_EXPORT_PROFILE_ID = "default-video-encode";

export const DEFAULT_EXPORT_PROFILE: ExportProfile = {
  id: DEFAULT_EXPORT_PROFILE_ID,
  name: "Default MP4",
  icon: "video",
  workflow: "video_encode",
  editorTarget: "none",
  codec: "h264_high",
  audioMode: "pcm16",
  container: "mp4",
  mergeEnabled: true,
  hardwareMode: "auto",
  nvidiaEncoderProfile: "unknown",
  parallelExports: 1,
};

export const DEFAULT_EXPORT_PROFILES: ExportProfile[] = [
  DEFAULT_EXPORT_PROFILE,
  {
    id: "h265-main10-master",
    name: "H.265 Main10",
    icon: "h265",
    workflow: "video_encode",
    editorTarget: "none",
    codec: "h265_main10",
    audioMode: "aac",
    container: "mp4",
    mergeEnabled: true,
    hardwareMode: "auto",
    nvidiaEncoderProfile: "unknown",
    parallelExports: 1,
  },
  {
    id: "prores-422-hq-master",
    name: "ProRes 422 HQ",
    icon: "prores",
    workflow: "video_encode",
    editorTarget: "none",
    codec: "prores_422_hq",
    audioMode: "pcm16",
    container: "mov",
    mergeEnabled: true,
    hardwareMode: "cpu",
    nvidiaEncoderProfile: "unknown",
    parallelExports: 1,
  },
  {
    id: "prores-4444-master",
    name: "ProRes 4444",
    icon: "prores",
    workflow: "video_encode",
    editorTarget: "none",
    codec: "prores_4444",
    audioMode: "pcm16",
    container: "mov",
    mergeEnabled: true,
    hardwareMode: "cpu",
    nvidiaEncoderProfile: "unknown",
    parallelExports: 1,
  },
  {
    id: "remux-fast-mov",
    name: "Fast Remux MOV",
    icon: "remux",
    workflow: "video_remux",
    editorTarget: "none",
    codec: "h264_high",
    audioMode: "copy",
    container: "mov",
    mergeEnabled: false,
    hardwareMode: "cpu",
    nvidiaEncoderProfile: "unknown",
    parallelExports: 1,
  },
];

export const CODEC_LABELS: Record<ExportCodec, string> = {
  h264_main: "H.264 Main",
  h264_high: "H.264 High",
  h264_high10: "H.264 High 10",
  h264_high422: "H.264 High 4:2:2",
  h265_main: "H.265 Main",
  h265_main10: "H.265 Main 10",
  h265_main12: "H.265 Main 12",
  h265_main422_10: "H.265 Main 4:2:2 10",
  av1_main: "AV1 Main",
  prores_422_lt: "ProRes 422 LT",
  prores_422: "ProRes 422",
  prores_422_hq: "ProRes 422 HQ",
  prores_4444: "ProRes 4444",
  prores_4444_xq: "ProRes 4444 XQ",
  h264: "H.264 High",
  h265: "H.265 Main",
  av1: "AV1 Main",
};

export const AUDIO_MODE_LABELS: Record<ExportAudioMode, string> = {
  copy: "Audio copy",
  aac: "AAC",
  aac_320: "AAC 320k",
  pcm16: "PCM 16-bit",
  pcm24: "PCM 24-bit",
  flac: "FLAC",
  alac: "ALAC",
  opus: "Opus",
  mp3: "MP3",
  none: "No audio",
};

export const CODEC_FAMILY_LABELS: Record<ExportCodecFamily, string> = {
  h264: "H.264 / AVC",
  h265: "H.265 / HEVC",
  av1: "AV1",
  prores: "ProRes",
};

export const CODEC_FAMILY_TO_CODECS: Record<ExportCodecFamily, ExportCodec[]> = {
  h264: ["h264_main", "h264_high", "h264_high10", "h264_high422"],
  h265: ["h265_main", "h265_main10", "h265_main12", "h265_main422_10"],
  av1: ["av1_main"],
  prores: ["prores_422_lt", "prores_422", "prores_422_hq", "prores_4444", "prores_4444_xq"],
};

export const LEGACY_CODEC_MAP: Record<string, ExportCodec> = {
  h264: "h264_high",
  h265: "h265_main",
  av1: "h265_main",
  av1_main: "h265_main",
  cineform: "h264_high",
  dnxhr_lb: "h264_high",
  dnxhr_sq: "h264_high",
  dnxhr_hq: "h264_high",
  dnxhr_hqx: "h264_high",
  dnxhr_444: "h264_high",
  uncompressed_rgb8: "h264_high",
  uncompressed_rgb10: "h264_high",
  uncompressed_rgba8: "h264_high",
  uncompressed_rgba16: "h264_high",
};

export const LEGACY_AUDIO_MODE_MAP: Record<string, ExportAudioMode> = {
  aac192: "aac",
  aac_192: "aac",
  pcm: "pcm16",
  pcm_s16: "pcm16",
  opus_160: "opus",
  mp3_320: "mp3",
};

export const EXPORT_CODEC_FAMILY_OPTIONS: { value: ExportCodecFamily; label: string }[] = (
  Object.keys(CODEC_FAMILY_LABELS) as ExportCodecFamily[]
).filter((family) => family !== "av1")
  .map((family) => ({
    value: family,
    label: CODEC_FAMILY_LABELS[family],
  }));
