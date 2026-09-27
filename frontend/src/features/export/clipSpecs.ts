import type { ClipItem } from "../../types/domain";

/** matches Rust's `ClipSpec` (commands/export.rs): `export_clips` rejects bare paths */
export type ClipExportSpec = { input: string; start_sec?: number; end_sec?: number };

/**
 * what a clip contributes to an export: an episode clip uses its original
 * source range so copy exports can snap against source keyframes and encode
 * exports can cut the detected timestamps. Scenepacks remain self-contained
 * and export their materialized clip instead.
 */
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
