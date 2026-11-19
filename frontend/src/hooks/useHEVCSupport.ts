import { useEffect } from "react";
import { useAppStateStore } from "../stores/appStore";
import { useGeneralSettingsStore } from "../stores/settingsStore";

export default function useHEVCSupport() {
  const setUserHasHEVC = useAppStateStore((state) => state.setUserHasHEVC);
  const userHasHEVC = useAppStateStore((state) => state.userHasHEVC);
  const previewTranscodeMode = useGeneralSettingsStore((s) => s.previewTranscodeMode);
  const previewTranscodeModeUserSet = useGeneralSettingsStore((s) => s.previewTranscodeModeUserSet);

  useEffect(() => {
    try {
      const candidates = [
        'video/mp4; codecs="hvc1"',
        'video/mp4; codecs="hev1"',
        'video/mp4; codecs="hvc1.1.6.L93.B0"',
        'video/mp4; codecs="hev1.1.6.L93.B0"',
      ];

      const mediaSourceSupported = typeof (window as any).MediaSource !== "undefined";
      const isTypeSupported = mediaSourceSupported
        ? (mime: string) => (window as any).MediaSource.isTypeSupported(mime)
        : () => false;

      const videoEl = document.createElement("video");

      const hasHEVC = candidates.some((mime) => {
        const result = videoEl.canPlayType(mime);
        return isTypeSupported(mime) || result === "probably";
      });
      setUserHasHEVC(hasHEVC);
    } catch {
      setUserHasHEVC(false);
    }
  }, [setUserHasHEVC]);

  // a PC that already plays HEVC defaults Re-encode Previews to off; only an explicit pick in Settings sticks.
  // set straight on the store so the default is not recorded as the user's choice
  useEffect(() => {
    if (!userHasHEVC || previewTranscodeModeUserSet) return;
    if (previewTranscodeMode !== "hevc") return;
    useGeneralSettingsStore.setState({ previewTranscodeMode: "off" });
  }, [userHasHEVC, previewTranscodeMode, previewTranscodeModeUserSet]);
}
