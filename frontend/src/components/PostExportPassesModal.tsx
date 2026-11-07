import { useEffect, useLayoutEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

import Tooltip from "./common/Tooltip";
import BackgroundJobCard from "./BackgroundJobCard";
import { useEscapeToClose } from "./common/useEscapeToClose";
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

  // Escape closes a finished run, and tucks a running one into its mini card rather than stopping it
  useEscapeToClose(() => {
    const store = usePassRunStore.getState();
    if (store.finished) store.close();
    else store.setMinimized(true);
  }, active && !minimized);

  const logRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs, minimized]);

  // auto-close a short while after everything finishes with no errors
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
    const shownOverall = finished ? 100 : overallPct;
    return (
      <BackgroundJobCard
        id="passes"
        ariaLabel="Post-export passes (minimized)"
        done={finished}
        lines={logs}
        title={
          finished
            ? errors.length > 0
              ? "Passes finished with errors"
              : "Passes complete"
            : message || "Post-export passes"
        }
        onExpand={() => setMinimized(false)}
        onClose={finished ? close : stop}
        closeLabel={finished ? "Close" : "Stop"}
        footer={finished && errors.length > 0 ? <p className="pxm-errors">Failed: {errors.join(", ")}</p> : null}
      >
        <div className="lm-batch-row">
          <span className="lm-batch-count">{finished ? "Done" : `Pass ${currentJobNum}/${jobTotal}`}</span>
          {label ? <span className="lm-batch-file">{label}</span> : null}
        </div>
        {jobTotal > 1 ? (
          <>
            <div className="lm-progress">
              <span className="lm-bar-label">Overall</span>
              <div className="progress-bar lm-progress-bar">
                <div className="progress-fill" style={{ width: `${shownOverall}%` }} />
              </div>
              <span className="lm-pct">{shownOverall}%</span>
            </div>
            <div className="lm-progress">
              <span className="lm-bar-label">Current</span>
              <div className="progress-bar lm-progress-bar">
                <div className="progress-fill" style={{ width: `${finished ? 100 : percent}%` }} />
              </div>
              <span className="lm-pct">{finished ? 100 : percent}%</span>
            </div>
          </>
        ) : (
          <div className="lm-progress">
            <div className="progress-bar lm-progress-bar">
              <div className="progress-fill" style={{ width: `${shownOverall}%` }} />
            </div>
            <span className="lm-pct">{shownOverall}%</span>
          </div>
        )}
      </BackgroundJobCard>
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
            <Tooltip content="Minimize">
              <button type="button" className="pxm-btn" onClick={() => setMinimized(true)} aria-label="Minimize">
                ─
              </button>
            </Tooltip>
            {finished ? (
              <Tooltip content="Close">
                <button type="button" className="pxm-btn" onClick={close} aria-label="Close">
                  ✕
                </button>
              </Tooltip>
            ) : (
              <Tooltip content="Stop">
                <button type="button" className="pxm-btn pxm-stop" onClick={stop} aria-label="Stop">
                  ✕
                </button>
              </Tooltip>
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
          {logs.map((line) => (
            <div key={line.id} className={`pxm-log-line it-line it-line-${line.kind}`}>
              {line.kind === "cmd" && <span className="it-prompt">$ </span>}
              {line.text}
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
