import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import Tooltip from "./common/Tooltip";
import BackgroundJobCard from "./BackgroundJobCard";
import { ConfirmModal } from "./settings/general/ConfirmModal";
import { useEscapeToClose } from "./common/useEscapeToClose";
import { useAiDepsStore } from "../stores/aiDepsStore";
import {
  AI_PACKS,
  VISIBLE_PACK_IDS,
  estimateDownloadMb,
  formatSizeMb,
  isPackInstalled,
  plannedTorchVariant,
} from "../features/aiDeps/packs";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/** confirm-then-install dialog for an AI pack, opened by `ensurePack`; resolves once installed or declined */
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
  const gpuPreference = useAiDepsStore((s) => s.gpuPreference);
  const job = useAiDepsStore((s) => s.job);
  const conflict = useAiDepsStore((s) => s.conflict);
  const conflictCanceling = useAiDepsStore((s) => s.conflictCanceling);

  // Escape declines the offer, or minimizes a running install rather than abandoning it
  useEscapeToClose(() => {
    const store = useAiDepsStore.getState();
    if (store.stage === "installing") store.minimize();
    else store.close();
  }, open);

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

  // one set of listeners for the app's lifetime; the backend serializes installs
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

  const conflictModal = conflict ? (
    <ConfirmModal
      title="Another dependency is installing"
      message={
        <>
          <strong>{conflict.activeLabel}</strong> is still installing. Keep it running, or cancel it
          to install <strong>{conflict.requestedLabel}</strong> instead?
        </>
      }
      cancelLabel="Keep installing"
      confirmLabel={conflictCanceling ? "Canceling…" : "Cancel current install"}
      busy={conflictCanceling}
      onClose={() => void useAiDepsStore.getState().resolveConflict("keep")}
      onConfirm={() => void useAiDepsStore.getState().resolveConflict("cancel-current")}
    />
  ) : null;

  const minimized = !open && Boolean(pack) && stage !== "confirm";
  if ((!open && !minimized) || !pack) return conflictModal;

  const missingNames = VISIBLE_PACK_IDS.filter((id) => !isPackInstalled(status, id)).map(
    (id) => AI_PACKS[id].dependencyName,
  );
  const info =
    pack === "all"
      ? {
          label: "All AI features",
          dependencyName: "all AI features",
          description:
            missingNames.length > 0
              ? `Installs ${missingNames.join(", ")} together so every AI feature is ready to use.`
              : "Installs all AI feature dependencies together.",
        }
      : AI_PACKS[pack];
  const sizeMb = estimateDownloadMb(status, pack, gpuPreference);
  const variant = plannedTorchVariant(status, gpuPreference);
  // "no GPU" is only sayable when the probe actually ran and found none
  const gpuUndetermined = status?.gpuProbe === "unknown" || Boolean(status?.statusError);
  const close = () => useAiDepsStore.getState().close();
  const install = () => void useAiDepsStore.getState().startInstall();
  const cancel = () => useAiDepsStore.getState().cancel();

  // extract speed (e.g. "24.5MB/s" or "12.3 MiB/s") and size (e.g. "450MB / 2.7GB") if present
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

  const modalTitle =
    stage === "done"
      ? job?.done ?? `${info.dependencyName} installed`
      : stage === "error"
        ? job
          ? `${job.title} failed`
          : `${info.dependencyName} install failed`
        : job?.title ?? info.label;

  if (minimized) {
    const jobLines = logs.map((text, idx) => ({ id: idx, kind: "log" as const, text }));
    const clampedPct = Math.max(0, Math.min(100, Math.round(percent)));
    return (
      <>
        <BackgroundJobCard
          id="ai-install"
          ariaLabel="Feature installation (minimized)"
          done={stage === "done"}
          lines={jobLines}
          title={stage === "installing" ? (message || modalTitle) : modalTitle}
          onExpand={() => useAiDepsStore.getState().openModal()}
          onClose={stage === "installing" ? cancel : close}
          closeLabel={stage === "installing" ? "Cancel" : "Close"}
          footer={
            stage === "error" && error ? (
              <p className="pxm-errors">{error}</p>
            ) : stage === "installing" && (speedText || transferredText) ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "0 12px 8px", fontSize: "0.72rem", color: "rgba(255, 255, 255, 0.65)" }}>
                {speedText && (
                  <span>Speed: <strong style={{ color: "#38bdf8", fontFamily: "monospace" }}>{speedText}</strong></span>
                )}
                {transferredText && (
                  <span>Size: <strong style={{ color: "#ffffff", fontFamily: "monospace" }}>{transferredText}</strong></span>
                )}
                <span>Elapsed: <strong style={{ color: "#ffffff", fontFamily: "monospace" }}>{formatDuration(elapsed)}</strong></span>
              </div>
            ) : null
          }
        >
          <div className="lm-progress">
            <div className="progress-bar lm-progress-bar">
              <div
                className={`progress-fill${indeterminate ? " aid-fill-indeterminate" : ""}`}
                style={{ width: indeterminate ? "100%" : `${clampedPct}%` }}
              />
            </div>
            <span className="lm-pct">{indeterminate ? "…" : `${clampedPct}%`}</span>
          </div>
        </BackgroundJobCard>
        {conflictModal}
      </>
    );
  }

  return (
    <>
    <div className="pxm-overlay">
      <div className="pxm-modal aid-modal">
        <header className="pxm-header">
          <span className="pxm-title">{modalTitle}</span>
          <div className="pxm-actions">
            {stage === "installing" ? (
              <Tooltip content="Minimize">
                <button
                  type="button"
                  className="pxm-btn"
                  onClick={() => useAiDepsStore.getState().minimize()}
                  aria-label="Minimize"
                >
                  🗕
                </button>
              </Tooltip>
            ) : (
              <Tooltip content="Close">
                <button type="button" className="pxm-btn" onClick={close} aria-label="Close">
                  ✕
                </button>
              </Tooltip>
            )}
          </div>
        </header>

        {stage === "confirm" ? (
          <>
            <p className="aid-lede">
              {pack === "all" ? (
                <>
                  Install <strong>all remaining AI features</strong> now?
                </>
              ) : (
                <>
                  You don't have <strong>{info.dependencyName}</strong> installed. Would you like to
                  install it now?
                </>
              )}
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
                      ? gpuPreference === "cuda"
                        ? "GPU / CUDA"
                        : "GPU / CUDA (NVIDIA GPU detected)"
                      : gpuUndetermined
                        ? "CPU (failed to check for NVIDIA GPU)"
                        : "CPU (no NVIDIA GPU detected)"}
                </dd>
              </div>
            </dl>
            {!status?.torchVersion && variant === "cpu" ? (
              <p className="aid-note">
                {gpuUndetermined
                  ? "AMVerge couldn't run nvidia-smi to check for a GPU, so it's planning the CPU build."
                  : "No NVIDIA GPU was found, planning the CPU build."}{" "}
                <button
                  type="button"
                  className="aid-link-btn"
                  onClick={() => useAiDepsStore.getState().setGpuPreference("cuda")}
                >
                  Install the GPU build anyway
                </button>
              </p>
            ) : null}
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
                    <span>Elapsed: <strong style={{ color: "#ffffff", fontFamily: "monospace" }}>{formatDuration(elapsed)}</strong></span>                  </div>
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
                <button type="button" className="aid-btn" onClick={cancel}>
                  Cancel
                </button>
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
    {conflictModal}
    </>
  );
}
