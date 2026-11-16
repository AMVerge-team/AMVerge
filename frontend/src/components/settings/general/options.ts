import type { DropdownOption } from "../../common/Dropdown";
import { t } from "../../../i18n";
import type {
  importMethod,
  PreviewTranscodeMode,
  PreviewTranscodeQuality,
  SceneDetectionMethod,
} from "../../../stores/settingsStore";

function allSceneDetectionOptions(): DropdownOption<SceneDetectionMethod>[] {
  return [
    {
      value: "transnetv2_gpu",
      label: t("settings:options.sceneDetection.ai.label"),
      description: t("settings:options.sceneDetection.ai.description"),
    },
    {
      value: "keyframe_detection",
      label: t("settings:options.sceneDetection.keyframe.label"),
      description: t("settings:options.sceneDetection.keyframe.description"),
    },
  ];
}

/** the detection choices; AI Scene Detection leaves the list while it is switched off in Settings > Features */
export function sceneDetectionOptions(aiSceneDetectionEnabled: boolean): DropdownOption<SceneDetectionMethod>[] {
  const options = allSceneDetectionOptions();
  return aiSceneDetectionEnabled
    ? options
    : options.filter((option) => option.value !== "transnetv2_gpu");
}

export function previewMethodOptions(): DropdownOption<importMethod>[] {
  return [
    {
      value: "video_files",
      label: t("settings:options.previewMethod.video.label"),
      description: t("settings:options.previewMethod.video.description"),
    },
    {
      value: "webp_files",
      label: t("settings:options.previewMethod.webp.label"),
      description: t("settings:options.previewMethod.webp.description"),
    },
  ];
}

export function previewTranscodeModeOptions(): DropdownOption<PreviewTranscodeMode>[] {
  return [
    {
      value: "off",
      label: t("common:off"),
      description: t("settings:options.transcodeMode.off.description"),
    },
    {
      value: "hevc",
      label: t("settings:options.transcodeMode.hevc.label"),
      description: t("settings:options.transcodeMode.hevc.description"),
    },
    {
      value: "always",
      label: t("settings:options.transcodeMode.always.label"),
      description: t("settings:options.transcodeMode.always.description"),
    },
  ];
}

export function previewTranscodeQualityOptions(): DropdownOption<PreviewTranscodeQuality>[] {
  return [
    { value: "360p", label: "360p", description: t("settings:options.transcodeQuality.360p") },
    { value: "480p", label: "480p", description: t("settings:options.transcodeQuality.480p") },
    { value: "720p", label: "720p", description: t("settings:options.transcodeQuality.720p") },
    { value: "1080p", label: "1080p", description: t("settings:options.transcodeQuality.1080p") },
  ];
}
