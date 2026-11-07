import type { ClipItem } from "../../types/domain";

/** matches Rust's `ClipSpec` (commands/export.rs): `export_clips` rejects bare paths */
export type ClipExportSpec = {
  input: string;
  start_sec?: number;
  end_sec?: number;
  /** fills the "####" in a separate export's file name; the cli numbers by position without it */
  scene_index?: number;
};

/** each spec's file number for a separate export: the clips' own scene numbers when they are distinct and in grid order, else their positions */
export function separateExportNumbers(clips: ClipItem[]): number[] {
  const own = clips.map((c) => (clipExportSpecs(c).length === 1 ? c.sceneIndex : undefined));
  const usable =
    own.every((n): n is number => Number.isInteger(n) && (n as number) >= 0) &&
    own.every((n, i) => i === 0 || n > own[i - 1]!);
  // outputs come back sorted by number, so numbers out of grid order would mismatch the pass targets
  return usable ? own : clips.flatMap(clipExportSpecs).map((_, i) => i);
}

/** an episode clip exports its source range (so copy snaps to keyframes); Scenepack clips export their own file */
export function clipExportSpecs(c: ClipItem): ClipExportSpec[] {
  if (c.mergedSrcs && c.mergedSrcs.length > 0) return c.mergedSrcs.map((input) => ({ input }));
  if (
    !c.sourceKind &&
    c.originalPath &&
    Number.isFinite(c.startSec) &&
    Number.isFinite(c.endSec)
  ) {
    return [{ input: c.originalPath, start_sec: c.startSec, end_sec: c.endSec }];
  }
  if (c.clipPath) return [{ input: c.clipPath }];
  return [{ input: c.src, start_sec: c.startSec, end_sec: c.endSec }];
}
