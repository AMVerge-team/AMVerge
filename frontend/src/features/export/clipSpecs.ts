import type { ClipItem } from "../../types/domain";

/** matches Rust's `ClipSpec` (commands/export.rs): `export_clips` rejects bare paths */
export type ClipExportSpec = { input: string; start_sec?: number; end_sec?: number };

/**
 * what a clip contributes to an export: its own cut file when it has one, the
 * parts of a merged clip, or the source video plus an in/out pair for clips that
 * only exist as a range over it (WebP import mode).
 */
export function clipExportSpecs(c: ClipItem): ClipExportSpec[] {
  if (c.mergedSrcs && c.mergedSrcs.length > 0) return c.mergedSrcs.map((input) => ({ input }));
  if (c.clipPath) return [{ input: c.clipPath }];
  return [{ input: c.src, start_sec: c.startSec, end_sec: c.endSec }];
}
