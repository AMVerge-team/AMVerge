import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

import { useEscapeToClose } from "./common/useEscapeToClose";
import { PASS_LABEL } from "../features/export/postPasses";
import {
  usePassTargetsStore,
  type PassClipPicks,
  type PassTargetKind,
} from "../features/export/passTargets";
import { imageThumbnail, mediaSrc } from "../utils/mediaSrc";
import { usePreviewTranscode, type PreviewTranscode } from "../features/preview/usePreviewTranscode";
import type { ClipItem } from "../types/domain";

const TOGGLE_NAME: Record<PassTargetKind, string> = { depth: "Depth", upscale: "Upscale" };

function answerPassTargets(picks: PassClipPicks | null) {
  const req = usePassTargetsStore.getState().request;
  if (!req) return;
  usePassTargetsStore.setState({ request: null });
  req.resolve(picks);
}

/** a file the webview can play for the hover: the cut clip (proxied when undecodable), else a short cut of its source range */
function resolvePreview(clip: ClipItem, { needed, preset }: PreviewTranscode): Promise<string> | null {
  const cut = clip.clipPath ?? clip.mergedSrcs?.[0];
  if (cut) {
    return needed
      ? invoke<string>("ensure_preview_proxy", {
          clipPath: cut,
          transcodeVideo: true,
          previewHeight: preset.height,
          previewCrf: preset.crf,
        })
      : Promise.resolve(cut);
  }
  const source = clip.originalPath ?? clip.src;
  const { startSec, endSec } = clip;
  if (!source || !Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec! <= startSec!) return null;
  return invoke<string>("ensure_scene_range_preview", {
    videoPath: source,
    startSec,
    endSec,
    previewHeight: preset.height,
    previewCrf: preset.crf,
  });
}

/** asks which of the selected clips get each post-export pass (see passTargets.ts) */
export default function PassTargetsModal() {
  const request = usePassTargetsStore((s) => s.request);
  if (!request) return null;
  return <PassTargetsDialog key={request.clips.map((c) => c.id).join("|")} />;
}

function PassTargetsDialog() {
  const request = usePassTargetsStore((s) => s.request)!;
  const { clips, kinds, mergeEnabled } = request;
  const [picks, setPicks] = useState<PassClipPicks>(() => ({
    depth: new Set(kinds.includes("depth") ? clips.map((c) => c.id) : []),
    upscale: new Set(kinds.includes("upscale") ? clips.map((c) => c.id) : []),
  }));
  const dialogRef = useRef<HTMLDivElement>(null);
  const transcode = usePreviewTranscode();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const requestedRef = useRef(new Set<string>());
  const cancel = () => answerPassTargets(null);
  useEscapeToClose(cancel, true);

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!hoveredId || requestedRef.current.has(hoveredId)) return;
    const clip = clips.find((c) => c.id === hoveredId);
    const request = clip ? resolvePreview(clip, transcode) : null;
    if (!request) return;
    requestedRef.current.add(hoveredId);
    request
      .then((path) => setPreviews((prev) => ({ ...prev, [hoveredId]: convertFileSrc(path) })))
      // a failed preview just keeps the thumbnail
      .catch((err) => {
        requestedRef.current.delete(hoveredId);
        console.warn("pass picker preview failed", err);
      });
  }, [hoveredId, clips, transcode]);

  const toggle = (kind: PassTargetKind, id: string) =>
    setPicks((prev) => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [kind]: next };
    });

  const setAll = (kind: PassTargetKind, on: boolean) =>
    setPicks((prev) => ({ ...prev, [kind]: new Set(on ? clips.map((c) => c.id) : []) }));

  return createPortal(
    <div className="episode-modal-overlay" onMouseDown={cancel}>
      <div
        ref={dialogRef}
        className="episode-modal pass-targets-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choose clips for each pass"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="episode-modal-title">Choose clips for each pass</div>
        <div className="episode-modal-message">
          {mergeEnabled
            ? "The clips picked for a pass are merged into that pass's own file."
            : "Each picked clip gets its own output file for that pass."}
        </div>

        <div className="pass-targets-header">
          {kinds.map((kind) => (
            <div key={kind} className="pass-targets-summary">
              <span className="pass-targets-summary-label">{PASS_LABEL[kind]}</span>
              <span className="pass-targets-count">
                {picks[kind].size}/{clips.length}
              </span>
              <button type="button" className="pass-targets-link" onClick={() => setAll(kind, true)}>
                All
              </button>
              <button type="button" className="pass-targets-link" onClick={() => setAll(kind, false)}>
                None
              </button>
            </div>
          ))}
        </div>

        <div className="pass-targets-grid">
          {clips.map((clip, index) => {
            const thumb = imageThumbnail(clip.thumbnail);
            const picked = kinds.some((kind) => picks[kind].has(clip.id));
            return (
              <div
                key={clip.id}
                className={`pass-targets-tile${picked ? " picked" : ""}`}
                onMouseEnter={() => setHoveredId(clip.id)}
                onMouseLeave={() => setHoveredId((id) => (id === clip.id ? null : id))}
              >
                <button
                  type="button"
                  className="pass-targets-thumb"
                  onClick={kinds.length === 1 ? () => toggle(kinds[0], clip.id) : undefined}
                  tabIndex={kinds.length === 1 ? 0 : -1}
                  title={clip.originalName}
                >
                  {thumb ? <img src={mediaSrc(thumb)} alt="" draggable={false} /> : null}
                  {hoveredId === clip.id && previews[clip.id] ? (
                    <video src={previews[clip.id]} autoPlay muted loop playsInline />
                  ) : null}
                  <span className="pass-targets-index">{index + 1}</span>
                </button>
                <div className={`pass-targets-toggles${kinds.length > 1 ? " stacked" : ""}`}>
                  {kinds.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className={`pass-targets-toggle ${kind}${picks[kind].has(clip.id) ? " on" : ""}`}
                      aria-pressed={picks[kind].has(clip.id)}
                      onClick={() => toggle(kind, clip.id)}
                    >
                      {picks[kind].has(clip.id)
                        ? `${TOGGLE_NAME[kind]} Enabled`
                        : "Disabled"}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="episode-modal-actions">
          <button type="button" className="episode-modal-btn" onClick={cancel}>
            Cancel
          </button>
          <button
            type="button"
            className="episode-modal-btn primary"
            onClick={() => answerPassTargets(picks)}
          >
            Export
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
