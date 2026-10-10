export function formatClipTime(seconds?: number | null): string | null {
  if (typeof seconds !== "number" || isNaN(seconds)) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatClipTimeframe(
  startSec?: number | null,
  endSec?: number | null,
  includeDuration: boolean = false
): string | null {
  if (typeof startSec !== "number" || isNaN(startSec)) return null;
  const startStr = formatClipTime(startSec);
  if (typeof endSec !== "number" || isNaN(endSec) || endSec <= startSec) {
    return startStr;
  }
  const endStr = formatClipTime(endSec);
  if (includeDuration) {
    const diff = endSec - startSec;
    const durStr = diff < 60 ? `${diff.toFixed(1).replace(/\.0$/, "")}s` : formatClipTime(diff);
    return `${startStr} - ${endStr} (${durStr})`;
  }
  return `${startStr} - ${endStr}`;
}

export type ScoreConfidenceTier = "low" | "fair" | "good" | "high" | "very_high";

export interface ScoreConfidence {
  label: string;
  tier: ScoreConfidenceTier;
}

export function getScoreConfidence(score?: number | null): ScoreConfidence | null {
  if (typeof score !== "number" || isNaN(score)) return null;
  if (score >= 0.30) return { label: "Very High Confidence", tier: "very_high" };
  if (score >= 0.24) return { label: "High Confidence", tier: "high" };
  if (score >= 0.18) return { label: "Good Confidence", tier: "good" };
  if (score >= 0.12) return { label: "Fair Confidence", tier: "fair" };
  return { label: "Low Confidence", tier: "low" };
}

export function formatScoreWithConfidence(score?: number | null): string | null {
  if (typeof score !== "number" || isNaN(score)) return null;
  const pct = Math.round(score * 100);
  const conf = getScoreConfidence(score);
  return conf ? `Match: ${pct}% (${conf.label})` : `Match: ${pct}%`;
}
