export type ExportWorkflow =
  | "video_encode"
  | "video_remux";

export type ExportCodecFamily =
  | "h264"
  | "h265"
  | "av1"
  | "prores";

export type ExportCodec =
  | "h264_main"
  | "h264_high"
  | "h264_high10"
  | "h264_high422"
  | "h265_main"
  | "h265_main10"
  | "h265_main12"
  | "h265_main422_10"
  | "av1_main"
  | "prores_422_lt"
  | "prores_422"
  | "prores_422_hq"
  | "prores_4444"
  | "prores_4444_xq"
  // legacy values kept for persisted data compatibility
  | "h264"
  | "h265"
  | "av1";

export type ExportAudioMode =
  | "copy"
  | "aac"
  | "aac_320"
  | "pcm16"
  | "pcm24"
  | "flac"
  | "alac"
  | "opus"
  | "mp3"
  | "none";
export type ExportContainer = "mp4" | "mov" | "mxf";
export type ExportHardwareMode = "auto" | "gpu" | "cpu";
export type ExportEditorTarget =
  | "none";
export type ExportProfileIcon =
  | "video"
  | "remux"
  | "h264"
  | "h265"
  | "prores"
  | "custom";
export type NvidiaEncoderProfile =
  | "unknown"
  | "blackwell"
  | "ada"
  | "ampere"
  | "turing"
  | "pascal"
  | "maxwell_2"
  | "unsupported";

export type ExportProfile = {
  id: string;
  name: string;
  icon: ExportProfileIcon;
  customIconPath?: string | null;
  workflow: ExportWorkflow;
  editorTarget: ExportEditorTarget;
  codec: ExportCodec;
  audioMode: ExportAudioMode;
  container: ExportContainer;
  mergeEnabled: boolean;
  hardwareMode: ExportHardwareMode;
  nvidiaEncoderProfile: NvidiaEncoderProfile;
  parallelExports: number;
};

export type NvidiaDetectionResult = {
  hasNvidiaGpu: boolean;
  gpuName: string | null;
  profile: NvidiaEncoderProfile;
};

export type GpuEncoderCapabilities = {
  hasGpuEncoder: boolean;
  preferredBackend: string;
  availableBackends: string[];
  availableVideoEncoders: string[];
  h264Encoder: string | null;
  h265Encoder: string | null;
  av1Encoder: string | null;
  maxParallelExports: number;
};
