import { useTranslation } from "react-i18next";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import Tooltip from "./common/Tooltip";
import BackgroundJobCard from "./BackgroundJobCard";
import { useEscapeToClose } from "./common/useEscapeToClose";
import { useStorageMoveStore } from "../stores/storageMoveStore";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/** Live CLI-style progress & log modal for moving Episodes or AI storage, with minimize-to-card support */
export default function StorageMoveModal() {
  const { t } = useTranslation("storage");
  const open = useStorageMoveStore((s) => s.open);
  const title = useStorageMoveStore((s) => s.title);
  const stage = useStorageMoveStore((s) => s.stage);
  const percent = useStorageMoveStore((s) => s.percent);
  const indeterminate = useStorageMoveStore((s) => s.indeterminate);
  const message = useStorageMoveStore((s) => s.message);
  const logs = useStorageMoveStore((s) => s.logs);
  const error = useStorageMoveStore((s) => s.error);

  useEscapeToClose(() => {
    const store = useStorageMoveStore.getState();
    if (store.stage === "moving") store.minimize();
    else store.close();
  }, open);

  const logRef = useRef<HTMLDivElement | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (stage === "moving") {
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

  useEffect(() => {
    const unlisteners = [
      listen<{ percent: number; indeterminate: boolean; message: string }>(
        "storage_move_progress",
        (e) => {
          useStorageMoveStore
            .getState()
            .applyProgress(e.payload.percent, e.payload.indeterminate, e.payload.message);
        },
      ),
      listen<{ line: string }>("storage_move_log", (e) => {
        useStorageMoveStore.getState().pushLog(e.payload.line);
      }),
    ];
    return () => {
      unlisteners.forEach((p) => p.then((stop) => stop()).catch(() => {}));
    };
  }, []);

  const minimized = !open && stage !== null;
  if (!open && !minimized) return null;

  const close = () => useStorageMoveStore.getState().close();

  const matchSpeed = message.match(/(\d+(?:\.\d+)?\s*(?:MB|MiB|KB|KiB)\/s)/i);
  const speedText = matchSpeed ? matchSpeed[1] : null;
  const matchTransferred = message.match(
    /(\d+(?:\.\d+)?\s*(?:GB|GiB|MB|MiB|KB|B)\s*\/\s*\d+(?:\.\d+)?\s*(?:GB|GiB|MB|MiB|KB|B))/i,
  );
  const transferredText = matchTransferred ? matchTransferred[1] : null;

  const clampedPct = Math.max(0, Math.min(100, Math.round(percent)));
  const modalTitle =
    stage === "done"
      ? t("storage:titleComplete", { title })
      : stage === "error"
        ? t("storage:titleFailed", { title })
        : title || t("storage:movingStorage");

  if (minimized) {
    const jobLines = logs.map((text, idx) => ({ id: idx, kind: "log" as const, text }));
    return (
      <BackgroundJobCard
        id="storage-move"
        ariaLabel={t("storage:minimized")}
        done={stage === "done"}
        lines={jobLines}
        title={stage === "moving" ? message || modalTitle : modalTitle}
        onExpand={() => useStorageMoveStore.getState().openModal()}
        onClose={stage === "moving" ? undefined : close}
        closeLabel={t("storage:close")}
        footer={
          stage === "error" && error ? (
            <p className="pxm-errors">{error}</p>
          ) : stage === "moving" && (speedText || transferredText) ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                padding: "0 12px 8px",
                fontSize: "0.72rem",
                color: "rgba(255, 255, 255, 0.65)",
              }}
            >
              {speedText && (
                <span>
                  {t("storage:speed")}{" "}
                  <strong style={{ color: "#38bdf8", fontFamily: "monospace" }}>{speedText}</strong>
                </span>
              )}
              {transferredText && (
                <span>
                  {t("storage:size")}{" "}
                  <strong style={{ color: "#ffffff", fontFamily: "monospace" }}>
                    {transferredText}
                  </strong>
                </span>
              )}
              <span>
                {t("storage:elapsed")}{" "}
                <strong style={{ color: "#ffffff", fontFamily: "monospace" }}>
                  {formatDuration(elapsed)}
                </strong>
              </span>
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
    );
  }

  return (
    <div className="pxm-overlay">
      <div className="pxm-modal aid-modal">
        <header className="pxm-header">
          <span className="pxm-title">{modalTitle}</span>
          <div className="pxm-actions">
            {stage === "moving" ? (
              <Tooltip content={t("storage:minimize")}>
                <button
                  type="button"
                  className="pxm-btn"
                  onClick={() => useStorageMoveStore.getState().minimize()}
                  aria-label={t("storage:minimize")}
                >
                  🗕
                </button>
              </Tooltip>
            ) : (
              <Tooltip content={t("storage:close")}>
                <button type="button" className="pxm-btn" onClick={close} aria-label={t("storage:close")}>
                  ✕
                </button>
              </Tooltip>
            )}
          </div>
        </header>

        <div className="pxm-progress">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              marginBottom: 4,
            }}
          >
            <span className="pxm-bar-label">{t("storage:progress")}</span>
            {stage === "moving" && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  fontSize: "0.75rem",
                  color: "rgba(255, 255, 255, 0.65)",
                }}
              >
                {speedText && (
                  <span>
                    {t("storage:speed")}{" "}
                    <strong style={{ color: "#38bdf8", fontFamily: "monospace" }}>
                      {speedText}
                    </strong>
                  </span>
                )}
                {transferredText && (
                  <span>
                    {t("storage:size")}{" "}
                    <strong style={{ color: "#ffffff", fontFamily: "monospace" }}>
                      {transferredText}
                    </strong>
                  </span>
                )}
                <span>
                  {t("storage:elapsed")}{" "}
                  <strong style={{ color: "#ffffff", fontFamily: "monospace" }}>
                    {formatDuration(elapsed)}
                  </strong>
                </span>
              </div>
            )}
          </div>
          <div className="progress-bar pxm-bar">
            <div
              className={`progress-fill${indeterminate ? " aid-fill-indeterminate" : ""}`}
              style={{ width: indeterminate ? "100%" : `${clampedPct}%` }}
            />
          </div>
          <span className="pxm-pct">{indeterminate ? "…" : `${clampedPct}%`}</span>
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
          {stage === "moving" ? (
            <button
              type="button"
              className="aid-btn"
              onClick={() => useStorageMoveStore.getState().minimize()}
            >
              {t("storage:minimize")}</button>
          ) : (
            <button type="button" className="aid-btn aid-btn-primary" onClick={close}>
              {stage === "done" ? t("storage:done") : t("storage:close")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
