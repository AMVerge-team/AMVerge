/**
 * decides whether previews must be re-encoded before they can play.
 *
 * clips are cut with a stream copy, so an hevc episode produces hevc clips. a
 * webview without the hevc extension renders those black while the audio still
 * plays, so previews are served from a transcoded h.264 proxy instead.
 *
 * shared by the grid tiles and the preview panel so both make the same call.
 */
import { useAppStateStore } from "../../stores/appStore";
import {
  PREVIEW_TRANSCODE_PRESETS,
  useGeneralSettingsStore,
  type PreviewTranscodeQuality,
} from "../../stores/settingsStore";

export type PreviewTranscode = {
  /** true when the proxy must re-encode video rather than stream copy it. */
  needed: boolean;
  /** encode target for the current quality setting. */
  preset: (typeof PREVIEW_TRANSCODE_PRESETS)[PreviewTranscodeQuality];
};

export function usePreviewTranscode(): PreviewTranscode {
  const mode = useGeneralSettingsStore((s) => s.previewTranscodeMode);
  const quality = useGeneralSettingsStore((s) => s.previewTranscodeQuality);
  const videoIsHEVC = useAppStateStore((s) => s.videoIsHEVC);
  const userHasHEVC = useAppStateStore((s) => s.userHasHEVC);

  // the last clause ignores the setting on purpose: with no decoder the tile is
  // black whatever the user picked, so "off" must not be able to break playback.
  const needed =
    mode === "always" ||
    (mode === "hevc" && videoIsHEVC === true) ||
    (videoIsHEVC === true && userHasHEVC === false);

  return { needed, preset: PREVIEW_TRANSCODE_PRESETS[quality] };
}
