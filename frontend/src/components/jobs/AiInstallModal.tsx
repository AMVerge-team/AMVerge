import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Trans, useTranslation } from "react-i18next";

import Tooltip from "../common/Tooltip";
import BackgroundJobCard from "./BackgroundJobCard";
import { ConfirmModal } from "../settings/general/ConfirmModal";
import { useEscapeToClose } from "../common/useEscapeToClose";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import {
  AI_PACKS,
  VISIBLE_PACK_IDS,
  estimateDownloadMb,
  formatSizeMb,
  isPackInstalled,
  plannedTorchVariant,
  type AiEnvStatus,
} from "../../features/aiDeps/packs";

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
  const [movingStorage, setMovingStorage] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
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
      title={t("release202:conflictTitle")}
      message={
        <>
          <Trans t={t} i18nKey="release202:conflictMessage" values={{ active: conflict.activeLabel, requested: conflict.requestedLabel }} components={{ strong: <strong /> }} />
        </>
      }
      cancelLabel={t("release202:keepInstalling")}
      confirmLabel={conflictCanceling ? t("release202:canceling") : t("release202:cancelInstall")}
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
          label: t("release202:allAi"),
          dependencyName: t("release202:allAiName"),
          description:
            missingNames.length > 0
              ? t("release202:allAiDescription", { names: missingNames.join(", ") })
              : t("release202:allAiDescriptionFallback"),
        }
      : AI_PACKS[pack];
  const sizeMb = estimateDownloadMb(status, pack, gpuPreference);
  const variant = plannedTorchVariant(status, gpuPreference);
  // "no GPU" is only sayable when the probe actually ran and found none
  const gpuUndetermined = status?.gpuProbe === "unknown" || Boolean(status?.statusError);
  const close = () => useAiDepsStore.getState().close();
  const install = () => void useAiDepsStore.getState().startInstall();
  const cancel = () => useAiDepsStore.getState().cancel();
  const chooseStorage = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t("storage:pickAi"),
    });
    if (!selected || typeof selected !== "string") return;
    setMovingStorage(true);
    setStorageError(null);
    try {
      const next = await invoke<AiEnvStatus>("move_ai_storage_to_new_dir", {
        newDir: selected,
      });
      useAiDepsStore.setState({ status: next });
    } catch (err) {
      setStorageError(String(err));
    } finally {
      setMovingStorage(false);
    }
  };

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
      ? job?.done ?? t("aiInstall.installedTitle", { name: info.dependencyName })
      : stage === "error"
        ? job
          ? t("aiInstall.jobFailedTitle", { title: job.title })
          : t("aiInstall.installFailedTitle", { name: info.dependencyName })
        : job?.title ?? info.label;

  if (minimized) {
    const jobLines = logs.map((text, idx) => ({ id: idx, kind: "log" as const, text }));
    const clampedPct = Math.max(0, Math.min(100, Math.round(percent)));
    return (
      <>
        <BackgroundJobCard
          id="ai-install"
          ariaLabel={t("release202:installMinimized")}
          done={stage === "done"}
          lines={jobLines}
          title={stage === "installing" ? (message || modalTitle) : modalTitle}
          onExpand={() => useAiDepsStore.getState().openModal()}
          onClose={stage === "installing" ? cancel : close}
          closeLabel={stage === "installing" ? t("common:cancel") : t("common:close")}
          footer={
            stage === "error" && error ? (
              <p className="pxm-errors">{error}</p>
            ) : stage === "installing" && (speedText || transferredText) ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "0 12px 8px", fontSize: "0.72rem", color: "rgba(255, 255, 255, 0.65)" }}>
                {speedText && (
                  <span>{t("jobs:aiInstall.speed")}<strong style={{ color: "#38bdf8", fontFamily: "monospace" }}>{speedText}</strong></span>
                )}
                {transferredText && (
                  <span>{t("jobs:aiInstall.size")}<strong style={{ color: "#ffffff", fontFamily: "monospace" }}>{transferredText}</strong></span>
                )}
                <span>{t("jobs:aiInstall.elapsed")}<strong style={{ color: "#ffffff", fontFamily: "monospace" }}>{formatDuration(elapsed)}</strong></span>
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
              <Tooltip content={t("shell:navbar.minimize")}>
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
              {pack === "all" ? (
                <>
                  <Trans t={t} i18nKey="release202:installAllQuestion" components={{ strong: <strong /> }} />
                </>
              ) : (
                <>
                  <Trans t={t} i18nKey="aiInstall.lede" values={{ name: info.dependencyName }} components={{ strong: <strong /> }} />
                </>
              )}
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
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <span className="aid-note" style={{ margin: 0 }}>
                {t("storage:aiPath")}: {status?.aiCustomPath || status?.aiRootPath || t("storage:defaultLocation")}
              </span>
              <button type="button" className="aid-link-btn" onClick={() => void chooseStorage()} disabled={movingStorage}>
                {movingStorage ? t("storage:movingAi") : t("storage:changeAi")}
              </button>
            </div>
            {storageError ? <p className="pxm-errors">{storageError}</p> : null}
            <div className="aid-buttons">
              <button type="button" className="aid-btn" onClick={close}>
                {t("aiInstall.notNow")}
              </button>
              <button
                type="button"
                className="aid-btn aid-btn-primary"
                onClick={install}
                disabled={movingStorage || Boolean(status && !status.uvAvailable)}
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
                <button type="button" className="aid-btn" onClick={cancel}>
                  {t("common:cancel")}</button>
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
    {conflictModal}
    </>
  );
}
