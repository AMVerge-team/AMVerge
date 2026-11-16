import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Trans, useTranslation } from "react-i18next";

import Tooltip from "./common/Tooltip";
import { useEscapeToClose } from "./common/useEscapeToClose";
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

/** confirm-then-install dialog for an AI pack, opened by `ensurePack`; resolves once installed or declined */
export default function AiInstallModal() {
  const { t } = useTranslation("jobs");
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

  if (!open || !pack) return null;

  const info = AI_PACKS[pack];
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

  return (
    <div className="pxm-overlay">
      <div className="pxm-modal aid-modal">
        <header className="pxm-header">
          <span className="pxm-title">
            {stage === "done"
              ? job?.done ?? t("aiInstall.installedTitle", { name: info.dependencyName })
              : stage === "error"
                ? job
                  ? t("aiInstall.jobFailedTitle", { title: job.title })
                  : t("aiInstall.installFailedTitle", { name: info.dependencyName })
                : job?.title ?? info.label}
          </span>
          <div className="pxm-actions">
            {stage === "installing" ? (
              <Tooltip content={t("aiInstall.minimize")}>
                <button
                  type="button"
                  className="pxm-btn"
                  onClick={() => useAiDepsStore.getState().minimize()}
                  aria-label={t("aiInstall.minimize")}
                >
                  🗕
                </button>
              </Tooltip>
            ) : (
              <Tooltip content={t("common:close")}>
                <button type="button" className="pxm-btn" onClick={close} aria-label={t("common:close")}>
                  ✕
                </button>
              </Tooltip>
            )}
          </div>
        </header>

        {stage === "confirm" ? (
          <>
            <p className="aid-lede">
              <Trans
                t={t}
                i18nKey="aiInstall.lede"
                values={{ name: info.dependencyName }}
                components={{ strong: <strong /> }}
              />
            </p>
            <p className="aid-note">{info.description}</p>
            <dl className="aid-facts">
              <div>
                <dt>{t("aiInstall.download")}</dt>
                <dd>~{formatSizeMb(sizeMb)}</dd>
              </div>
              <div>
                <dt>{t("aiInstall.torchBuild")}</dt>
                <dd>
                  {status?.torchVersion
                    ? t("aiInstall.torchAlreadyInstalled", { variant: status.torchVariant?.toUpperCase() })
                    : variant === "cuda"
                      ? gpuPreference === "cuda"
                        ? "GPU / CUDA"
                        : t("aiInstall.torchCudaDetected")
                      : gpuUndetermined
                        ? t("aiInstall.torchCpuUnknown")
                        : t("aiInstall.torchCpuNoGpu")}
                </dd>
              </div>
            </dl>
            {!status?.torchVersion && variant === "cpu" ? (
              <p className="aid-note">
                {gpuUndetermined
                  ? t("aiInstall.cpuPlanUnknown")
                  : t("aiInstall.cpuPlanNoGpu")}{" "}
                <button
                  type="button"
                  className="aid-link-btn"
                  onClick={() => useAiDepsStore.getState().setGpuPreference("cuda")}
                >
                  {t("aiInstall.installGpuAnyway")}
                </button>
              </p>
            ) : null}
            {status && !status.uvAvailable ? (
              <p className="pxm-errors">
                {t("aiInstall.uvMissing")}
              </p>
            ) : null}
            <div className="aid-buttons">
              <button type="button" className="aid-btn" onClick={close}>
                {t("aiInstall.notNow")}
              </button>
              <button
                type="button"
                className="aid-btn aid-btn-primary"
                onClick={install}
                disabled={Boolean(status && !status.uvAvailable)}
              >
                {t("aiInstall.install")}
              </button>
            </div>
          </>
        ) : null}

        {stage === "installing" || stage === "done" || stage === "error" ? (
          <>
            <div className="pxm-progress">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 4 }}>
                <span className="pxm-bar-label">{t("aiInstall.progress")}</span>
                {stage === "installing" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.65)" }}>
                    {speedText && (
                      <span>{t("aiInstall.speed")}<strong style={{ color: "#38bdf8", fontFamily: "monospace" }}>{speedText}</strong></span>
                    )}
                    {transferredText && (
                      <span>{t("aiInstall.size")}<strong style={{ color: "#ffffff", fontFamily: "monospace" }}>{transferredText}</strong></span>
                    )}
                    <span>{t("aiInstall.elapsed")}<strong style={{ color: "#ffffff", fontFamily: "monospace" }}>{formatDuration(elapsed)}</strong></span>                  </div>
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
                  <Tooltip content={t("aiInstall.keepDownloading")}>
                    <button
                      type="button"
                      className="aid-btn"
                      onClick={() => useAiDepsStore.getState().minimize()}
                    >
                      {t("aiInstall.runInBackground")}
                    </button>
                  </Tooltip>
                  <button type="button" className="aid-btn" onClick={cancel}>
                    {t("common:cancel")}
                  </button>
                </>
              ) : (
                <>
                  {stage === "error" ? (
                    <button type="button" className="aid-btn" onClick={install}>
                      {t("aiInstall.tryAgain")}
                    </button>
                  ) : null}
                  <button type="button" className="aid-btn aid-btn-primary" onClick={close}>
                    {stage === "done" ? t("aiInstall.done") : t("common:close")}
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
