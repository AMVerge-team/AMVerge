/** whether previews need an h.264 proxy: stream-copied hevc clips render black without the hevc extension */
import { useAppStateStore } from "../../stores/appStore";
import {
  PREVIEW_TRANSCODE_PRESETS,
  useGeneralSettingsStore,
  type PreviewTranscodeQuality,
} from "../../stores/settingsStore";

export type PreviewTranscode = {
  /** true when the proxy must re-encode video rather than stream copy it */
  needed: boolean;
  /** encode target for the current quality setting */
  preset: (typeof PREVIEW_TRANSCODE_PRESETS)[PreviewTranscodeQuality];
};

export function usePreviewTranscode(): PreviewTranscode {
  const mode = useGeneralSettingsStore((s) => s.previewTranscodeMode);
  const quality = useGeneralSettingsStore((s) => s.previewTranscodeQuality);
  const videoIsHEVC = useAppStateStore((s) => s.videoIsHEVC);
  const userHasHEVC = useAppStateStore((s) => s.userHasHEVC);

  // the last clause ignores the setting: without a decoder "off" would only break playback
  const needed =
    mode === "always" ||
    (mode === "hevc" && videoIsHEVC === true) ||
    (videoIsHEVC === true && userHasHEVC === false);

  return { needed, preset: PREVIEW_TRANSCODE_PRESETS[quality] };
}
