import type { DropdownOption } from "../../common/Dropdown";
import type {
  importMethod,
  PreviewTranscodeMode,
  PreviewTranscodeQuality,
  SceneDetectionMethod,
} from "../../../stores/settingsStore";

export const SCENE_DETECTION_OPTIONS: DropdownOption<SceneDetectionMethod>[] = [
  {
    value: "transnetv2_gpu",
    label: "AI Scene Detection",
    description: "The most accurate way to find scene cuts. Uses AI.",
  },
  {
    value: "keyframe_detection",
    label: "Keyframe Detection",
    description: "Fast, and works on any PC. Cuts at keyframes.",
  },
];

export const PREVIEW_METHOD_OPTIONS: DropdownOption<importMethod>[] = [
  {
    value: "video_files",
    label: "Video Files",
    description: "Cuts a real video clip per scene. Hover to play it.",
  },
  {
    value: "webp_files",
    label: "WebP Files",
    description: "Makes small animated previews instead of video clips.",
  },
];

export const PREVIEW_TRANSCODE_MODE_OPTIONS: DropdownOption<PreviewTranscodeMode>[] = [
  {
    value: "off",
    label: "Off",
    description: "Play clips as they are. Needs HEVC support on this PC.",
  },
  {
    value: "hevc",
    label: "HEVC Only",
    description: "Only re-encode when the source is HEVC.",
  },
  {
    value: "always",
    label: "Always",
    description: "Re-encode every preview, whatever the source is.",
  },
];

export const PREVIEW_TRANSCODE_QUALITY_OPTIONS: DropdownOption<PreviewTranscodeQuality>[] = [
  { value: "360p", label: "360p", description: "Smallest and fastest to generate." },
  { value: "480p", label: "480p", description: "Balanced. Recommended." },
  { value: "720p", label: "720p", description: "Sharper previews, slower to generate." },
  { value: "1080p", label: "1080p", description: "Full detail. Slowest, largest cache." },
];
