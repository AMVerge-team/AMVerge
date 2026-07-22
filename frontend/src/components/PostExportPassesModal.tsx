import { useEffect, useLayoutEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

import { usePassRunStore } from "../stores/passRunStore";

export default function PostExportPassesModal() {
  const active = usePassRunStore((s) => s.active);
  const minimized = usePassRunStore((s) => s.minimized);
  const label = usePassRunStore((s) => s.label);
  const jobDone = usePassRunStore((s) => s.jobDone);
  const jobTotal = usePassRunStore((s) => s.jobTotal);
  const percent = usePassRunStore((s) => s.percent);
  const message = usePassRunStore((s) => s.message);
  const previewSrc = usePassRunStore((s) => s.previewSrc);
  const logs = usePassRunStore((s) => s.logs);
  const finished = usePassRunStore((s) => s.finished);
  const errors = usePassRunStore((s) => s.errors);

  const logRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs, minimized]);

  // Auto-close a short while after everything finishes with no errors.
  useEffect(() => {
    if (!active || !finished || errors.length > 0) return;
    const t = window.setTimeout(() => usePassRunStore.getState().close(), 2500);
    return () => window.clearTimeout(t);
  }, [active, finished, errors.length]);

  if (!active) return null;

  const overallPct =
    jobTotal > 0 ? Math.round(((jobDone + (finished ? 0 : percent / 100)) / jobTotal) * 100) : 0;
  const currentJobNum = Math.min(jobDone + 1, jobTotal);

  const stop = () => {
    usePassRunStore.getState().requestStop();
    invoke("abort_export").catch(() => {});
  };
  const close = () => usePassRunStore.getState().close();
  const setMinimized = (v: boolean) => usePassRunStore.getState().setMinimized(v);

  if (minimized) {
    return (
      <div className="pxm-mini" role="status" aria-label="Post-export passes (minimized)">
        <div className="pxm-mini-head">
          <span className="pxm-mini-title">
            {finished ? "Passes complete" : label || "Post-export passes"}
          </span>
          <div className="pxm-actions">
            <button type="button" className="pxm-btn" onClick={() => setMinimized(false)} title="Expand">
              ▢
            </button>
            {finished ? (
              <button type="button" className="pxm-btn" onClick={close} title="Close">
                ✕
              </button>
            ) : (
              <button type="button" className="pxm-btn pxm-stop" onClick={stop} title="Stop">
                ✕
              </button>
            )}
          </div>
        </div>
        <div className="pxm-progress">
          <span className="pxm-bar-label">{finished ? "Done" : `Pass ${currentJobNum}/${jobTotal}`}</span>
          <div className="progress-bar pxm-bar">
            <div className="progress-fill" style={{ width: `${finished ? 100 : overallPct}%` }} />
          </div>
          <span className="pxm-pct">{finished ? 100 : overallPct}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pxm-overlay">
      <div className="pxm-modal">
        <header className="pxm-header">
          <span className="pxm-title">
            {finished
              ? errors.length > 0
                ? "Post-export passes finished with errors"
                : "Post-export passes complete"
              : "Post-export passes"}
          </span>
          <div className="pxm-actions">
            <button type="button" className="pxm-btn" onClick={() => setMinimized(true)} title="Minimize">
              ─
            </button>
            {finished ? (
              <button type="button" className="pxm-btn" onClick={close} title="Close">
                ✕
              </button>
            ) : (
              <button type="button" className="pxm-btn pxm-stop" onClick={stop} title="Stop">
                ✕
              </button>
            )}
          </div>
        </header>

        <div className="pxm-preview">
          {previewSrc ? (
            <img className="pxm-preview-img" src={previewSrc} alt="Pass preview" draggable={false} />
          ) : (
            <span className="pxm-preview-empty">Waiting for first preview frame…</span>
          )}
        </div>

        <div className="pxm-status">
          <span className="pxm-job">
            {finished ? "Done" : `Pass ${currentJobNum}/${jobTotal}`}
          </span>
          <span className="pxm-label">{label}</span>
        </div>

        <div className="pxm-progress">
          <span className="pxm-bar-label">Overall</span>
          <div className="progress-bar pxm-bar">
            <div className="progress-fill" style={{ width: `${finished ? 100 : overallPct}%` }} />
          </div>
          <span className="pxm-pct">{finished ? 100 : overallPct}%</span>
        </div>
        <div className="pxm-progress">
          <span className="pxm-bar-label">Current</span>
          <div className="progress-bar pxm-bar">
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="pxm-pct">{percent}%</span>
        </div>
        <p className="pxm-message">{message}</p>

        <div className="pxm-logs" ref={logRef}>
          {logs.map((line, i) => (
            <div key={i} className="pxm-log-line">
              {line}
            </div>
          ))}
        </div>

        {finished && errors.length > 0 ? (
          <p className="pxm-errors">Failed: {errors.join(", ")}</p>
        ) : null}
      </div>
    </div>
  );
}
