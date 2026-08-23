import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { useAiDepsStore } from "../stores/aiDepsStore";
import {
  AI_PACKS,
  estimateDownloadMb,
  formatSizeMb,
  plannedTorchVariant,
} from "../features/aiDeps/packs";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/**
 * Confirm-then-install dialog for the optional AI dependencies. Opened by
 * `useAiDepsStore.ensurePack` whenever a locked feature is picked; the caller's
 * promise resolves once the pack is installed or the user declines.
 */
export default function AiInstallModal() {
  const open = useAiDepsStore((s) => s.open);
  const pack = useAiDepsStore((s) => s.pack);
  const stage = useAiDepsStore((s) => s.stage);
  const percent = useAiDepsStore((s) => s.percent);
  const indeterminate = useAiDepsStore((s) => s.indeterminate);
  const message = useAiDepsStore((s) => s.message);
  const logs = useAiDepsStore((s) => s.logs);
  const error = useAiDepsStore((s) => s.error);
  const status = useAiDepsStore((s) => s.status);

  const logRef = useRef<HTMLDivElement | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (stage === "installing") {
      startTimeRef.current = Date.now();
      setElapsed(0);
      const timer = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(timer);
    } else {
      startTimeRef.current = null;
    }
  }, [stage]);

  // One set of listeners for the app's lifetime — installs are serialized by the
  // backend, so there is only ever one stream to follow.
  useEffect(() => {
    const unlisteners = [
      listen<{ pack: string; percent: number; indeterminate: boolean; message: string }>(
        "ai_install_progress",
        (e) => {
          useAiDepsStore
            .getState()
            .applyProgress(e.payload.percent, e.payload.indeterminate, e.payload.message);
        },
      ),
      listen<{ pack: string; line: string }>("ai_install_log", (e) => {
        useAiDepsStore.getState().pushLog(e.payload.line);
      }),
    ];
    return () => {
      unlisteners.forEach((p) => p.then((stop) => stop()).catch(() => {}));
    };
  }, []);

  if (!open || !pack) return null;

  const info = AI_PACKS[pack];
  const sizeMb = estimateDownloadMb(status, pack);
  const variant = plannedTorchVariant(status);
  const close = () => useAiDepsStore.getState().close();
  const install = () => void useAiDepsStore.getState().startInstall();
  const cancel = () => useAiDepsStore.getState().cancel();

  // Compute ETA if progress is non-zero
  let etaText = "Calculating…";
  if (stage === "installing") {
    if (percent > 3 && elapsed > 2) {
      const remainingSec = (elapsed / (percent / 100)) - elapsed;
      if (remainingSec > 0 && Number.isFinite(remainingSec)) {
        etaText = formatDuration(remainingSec);
      }
    }
  }

  // Extract speed (e.g. "24.5MB/s" or "12.3 MiB/s") and size (e.g. "450MB / 2.7GB") if present
  let speedText: string | null = null;
  let transferredText: string | null = null;

  const matchSpeed = message.match(/(\d+(?:\.\d+)?\s*(?:MB|MiB|KB|KiB)\/s)/i);
  if (matchSpeed) {
    speedText = matchSpeed[1];
  }
  const matchTransferred = message.match(/(\d+(?:\.\d+)?\s*(?:GB|GiB|MB|MiB)\s*\/\s*\d+(?:\.\d+)?\s*(?:GB|GiB|MB|MiB))/i);
  if (matchTransferred) {
    transferredText = matchTransferred[1];
  }

  return (
    <div className="pxm-overlay">
      <div className="pxm-modal aid-modal">
        <header className="pxm-header">
          <span className="pxm-title">
            {stage === "done"
              ? `${info.dependencyName} installed`
              : stage === "error"
                ? `${info.dependencyName} install failed`
                : `${info.label}`}
          </span>
          <div className="pxm-actions">
            {stage === "installing" ? (
              <button
                type="button"
                className="pxm-btn"
                onClick={() => useAiDepsStore.getState().minimize()}
                title="Minimize and run in background"
              >
                🗕
              </button>
            ) : (
              <button type="button" className="pxm-btn" onClick={close} title="Close">
                ✕
              </button>
            )}
          </div>
        </header>

        {stage === "confirm" ? (
          <>
            <p className="aid-lede">
              You don't have <strong>{info.dependencyName}</strong> installed. Would you like to
              install it now?
            </p>
            <p className="aid-note">{info.description}</p>
            <dl className="aid-facts">
              <div>
                <dt>Download</dt>
                <dd>~{formatSizeMb(sizeMb)}</dd>
              </div>
              <div>
                <dt>PyTorch build</dt>
                <dd>
                  {status?.torchVersion
                    ? `already installed (${status.torchVariant?.toUpperCase()})`
                    : variant === "cuda"
                      ? "GPU / CUDA (NVIDIA GPU detected)"
                      : "CPU (no NVIDIA GPU detected)"}
                </dd>
              </div>
            </dl>
            {status && !status.uvAvailable ? (
              <p className="pxm-errors">
                The installer component is missing from this build, so AMVerge can't add the
                dependency automatically. Reinstalling AMVerge restores it.
              </p>
            ) : null}
            <div className="aid-buttons">
              <button type="button" className="aid-btn" onClick={close}>
                Not now
              </button>
              <button
                type="button"
                className="aid-btn aid-btn-primary"
                onClick={install}
                disabled={Boolean(status && !status.uvAvailable)}
              >
                Install
              </button>
            </div>
          </>
        ) : null}

        {stage === "installing" || stage === "done" || stage === "error" ? (
          <>
            <div className="pxm-progress">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 4 }}>
                <span className="pxm-bar-label">Progress</span>
                {stage === "installing" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.65)" }}>
                    {speedText && (
                      <span>Speed: <strong style={{ color: "#38bdf8", fontFamily: "monospace" }}>{speedText}</strong></span>
                    )}
                    {transferredText && (
                      <span>Size: <strong style={{ color: "#ffffff", fontFamily: "monospace" }}>{transferredText}</strong></span>
                    )}
                    <span>Elapsed: <strong style={{ color: "#ffffff", fontFamily: "monospace" }}>{formatDuration(elapsed)}</strong></span>
                    <span>ETA: <strong style={{ color: "var(--accent)", fontFamily: "monospace" }}>{etaText}</strong></span>
                  </div>
                )}
              </div>
              <div className="progress-bar pxm-bar">
                <div
                  className={`progress-fill${indeterminate ? " aid-fill-indeterminate" : ""}`}
                  style={{ width: indeterminate ? "100%" : `${percent}%` }}
                />
              </div>
              <span className="pxm-pct">{indeterminate ? "…" : `${percent}%`}</span>
            </div>
            <p className="pxm-message">{message}</p>

            <div className="pxm-logs" ref={logRef}>
              {logs.map((line, i) => (
                <div key={i} className="pxm-log-line">
                  {line}
                </div>
              ))}
            </div>

            {error ? <p className="pxm-errors">{error}</p> : null}

            <div className="aid-buttons">
              {stage === "installing" ? (
                <>
                  <button
                    type="button"
                    className="aid-btn"
                    onClick={() => useAiDepsStore.getState().minimize()}
                    title="Keep downloading in the background"
                  >
                    Run in background
                  </button>
                  <button type="button" className="aid-btn" onClick={cancel}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {stage === "error" ? (
                    <button type="button" className="aid-btn" onClick={install}>
                      Try again
                    </button>
                  ) : null}
                  <button type="button" className="aid-btn aid-btn-primary" onClick={close}>
                    {stage === "done" ? "Done" : "Close"}
                  </button>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
