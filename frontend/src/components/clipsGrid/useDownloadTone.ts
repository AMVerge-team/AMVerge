import { useCallback, useEffect, useRef, useState } from "react";
import { cancelIdle, scheduleIdle } from "../../utils/idle.ts";

const SAMPLE_SIZE = 24;
const SOURCE_SIZE = 34;
const SAMPLE_MARGIN = 6;
const LUMINANCE_THRESHOLD = 158;

export type DownloadTone = "light" | "dark";

// picks a light or dark download icon by sampling the thumbnail's top-right corner
export function useDownloadTone() {
  const [tone, setTone] = useState<DownloadTone>("light");
  const idleRef = useRef<number | null>(null);

  const sample = useCallback((img: HTMLImageElement | null) => {
    if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) return;

    // getImageData forces a sync decode plus pixel readback, so defer to idle time
    // and coalesce with any pending sample to keep it off scroll frames
    if (idleRef.current !== null) cancelIdle(idleRef.current);
    idleRef.current = scheduleIdle(() => {
      idleRef.current = null;
      if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) return;
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        const sourceW = Math.min(SOURCE_SIZE, img.naturalWidth);
        const sourceH = Math.min(SOURCE_SIZE, img.naturalHeight);
        const sx = Math.max(0, img.naturalWidth - sourceW - SAMPLE_MARGIN);
        const sy = Math.max(0, SAMPLE_MARGIN);

        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        ctx.drawImage(img, sx, sy, sourceW, sourceH, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

        const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
        let luminanceSum = 0;
        let alphaSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] / 255;
          luminanceSum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * a;
          alphaSum += a;
        }

        const avg = alphaSum > 0 ? luminanceSum / alphaSum : 128;
        setTone(avg >= LUMINANCE_THRESHOLD ? "dark" : "light");
      } catch {
        // keep the previous tone if sampling fails
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (idleRef.current !== null) cancelIdle(idleRef.current);
    };
  }, []);

  return { tone, sample };
}
