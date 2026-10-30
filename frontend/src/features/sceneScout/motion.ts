import type { ClipItem } from "../../types/domain";
import type { FlowSource, MotionSubject, MotionTags } from "./types";

const ARROWS: Record<string, string> = {
  right: "→",
  "down-right": "↘",
  down: "↓",
  "down-left": "↙",
  left: "←",
  "up-left": "↖",
  up: "↑",
  "up-right": "↗",
  still: "•",
  unclear: "?",
};

/** one glyph for a subject direction (or still / unclear) */
export function subjectArrow(subject: MotionSubject | string): string {
  return ARROWS[subject] ?? "?";
}

/** "pan ←", "zoom in", "static" or "unclear" */
export function cameraLabel(camera: string): string {
  if (camera.startsWith("pan-")) return `pan ${subjectArrow(camera.slice(4))}`;
  if (camera === "zoom-in") return "zoom in";
  if (camera === "zoom-out") return "zoom out";
  return camera;
}

/** "moving right, fast · camera pan ←" */
export function describeMotion(tags: MotionTags): string {
  const subject =
    tags.subject === "still"
      ? "subject still"
      : tags.subject === "unclear"
        ? "subject unclear"
        : `moving ${tags.subject}${tags.speed ? `, ${tags.speed}` : ""}`;
  return `${subject} · camera ${cameraLabel(tags.camera)}`;
}

/** the file (or range of the source) a grid clip plays, for a flow search; merged clips have no single ending */
export function flowSourceForClip(clip: ClipItem): FlowSource | null {
  if (clip.mergedSrcs?.length) return null;
  const label = clip.originalName ?? clip.src.split(/[/\\]/).pop() ?? "clip";
  if (clip.clipPath) return { path: clip.clipPath, label };
  const source = clip.originalPath || clip.src;
  if (!source || clip.startSec === undefined || clip.endSec === undefined) return null;
  return {
    path: source,
    startMs: Math.round(clip.startSec * 1000),
    endMs: Math.round(clip.endSec * 1000),
    label,
  };
}
