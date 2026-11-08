import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import ModalShell from "../common/ModalShell";
import Dropdown from "../common/Dropdown";
import Tooltip from "../common/Tooltip";
import ToolsViewer from "./ToolsViewer";
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaExpand,
  FaFileExport,
  FaFileVideo,
  FaLayerGroup,
  FaPlay,
  FaTimes,
} from "../icons/animated";
import { useUIStateStore } from "../../stores/UIStore";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { useAppPersistedStore } from "../../stores/appStore";
import { useToolsStore, type ToolKind } from "../../stores/toolsStore";
import { useToolsRunState } from "../../features/processes/singleProcess";
import { isPackInstalled } from "../../features/aiDeps/packs";
import { pickFlowClip } from "../../features/sceneScout/pickFlowClip";
import { ensureToolPack, exportTool, lastExportDir, runTool, stopTool } from "../../features/tools/runTool";
import {
  DEPTH_COLORMAP_OPTIONS,
  DEPTH_ENCODER_OPTIONS,
  UPSCALE_MODEL_OPTIONS,
  UPSCALE_QUALITY_OPTIONS,
  type DepthColormap,
  type DepthEncoder,
  type UpscaleModel,
  type UpscaleQuality,
} from "../../features/export/postPasses";

const TABS: { kind: ToolKind; label: string; icon: typeof FaExpand; blurb: string }[] = [
  {
    kind: "upscale",
    label: "Upscale",
    icon: FaExpand,
    blurb: "A sharper and higher resolution copy of the clip",
  },
  {
    kind: "depth",
    label: "Depth map",
    icon: FaLayerGroup,
    blurb: "A video of how far each part of the frame is from the camera, used for compositing",
  },
];

const RUN_LABEL: Record<ToolKind, string> = { upscale: "Generate Upscale", depth: "Generate Depth Map" };
// once there is a result, running it again replaces it
const RERUN_LABEL: Record<ToolKind, string> = { upscale: "Regenerate Upscale", depth: "Regenerate Depth Map" };
const PACK_NAME: Record<ToolKind, string> = { upscale: "Upscaling", depth: "Depth mapping" };


/** whether the kind's AI pack is there; dev builds run from the CLI checkout, so always yes */
function usePackReady(kind: ToolKind): boolean {
  const status = useAiDepsStore((s) => s.status);
  useEffect(() => {
    if (!useAiDepsStore.getState().status) void useAiDepsStore.getState().refresh();
  }, []);
  if (!status) return true;
  return !status.managed || isPackInstalled(status, kind);
}

function ToolsPage() {
  const source = useToolsStore((s) => s.source);
  const kind = useToolsStore((s) => s.kind);
  const upscale = useToolsStore((s) => s.upscale);
  const depth = useToolsStore((s) => s.depth);
  const status = useToolsStore((s) => s.status);
  const percent = useToolsStore((s) => s.percent);
  const message = useToolsStore((s) => s.message);
  const error = useToolsStore((s) => s.error);
  const outputPath = useToolsStore((s) => s.outputPath);
  const exportedPath = useToolsStore((s) => s.exportedPath);
  const running = useToolsRunState((s) => s.running);
  const dragging = useUIStateStore((s) => s.isDragging);
  // the export button names the folder its save dialog opens in
  useAppPersistedStore((s) => s.exportDir);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // an export error belongs to the result it was about
  useEffect(() => setExportError(null), [outputPath]);

  // the players get exactly the height the rest of the modal leaves on screen, so it always fits without scrolling
  const pageRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const page = pageRef.current;
    const viewer = viewerRef.current;
    if (!page || !viewer) return;
    const fit = () => {
      const modal = page.closest(".app-modal") as HTMLElement | null;
      const overlay = modal?.parentElement;
      const pad = overlay
        ? parseFloat(getComputedStyle(overlay).paddingTop) + parseFloat(getComputedStyle(overlay).paddingBottom)
        : 0;
      const border = modal ? modal.offsetHeight - modal.clientHeight : 0;
      const rest = page.scrollHeight - viewer.getBoundingClientRect().height;
      const room = Math.max(160, Math.floor(window.innerHeight - pad - border - rest));
      viewer.style.setProperty("--tools-viewer-max-h", `${room}px`);
    };
    fit();
    // the bar wraps to two rows on narrow windows, which changes what is left for the players
    const observer = new ResizeObserver(fit);
    observer.observe(page);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  const packReady = usePackReady(kind);
  const store = useToolsStore.getState();
  const tab = TABS.find((t) => t.kind === kind)!;
  const exportDir = lastExportDir(source);
  const fullRun = status === "preparing" || status === "running";
  const canExport = status === "done" && Boolean(outputPath) && !running;

  const chooseKind = (next: ToolKind) => {
    if (running || next === kind) return;
    store.setKind(next);
    // picking a tool whose models are missing asks to install them right away
    void ensureToolPack(next);
  };

  const pickFile = async () => {
    if (running) return;
    const picked = await pickFlowClip();
    if (picked) store.setSource(picked);
  };

  const reveal = (path: string) => {
    void invoke("reveal_in_file_manager", { filePath: path }).catch((err) => console.warn(err));
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportTool();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  // one line above the buttons, in the label row, so whatever it says never moves them out of line
  let statusLine: React.ReactNode = null;
  if (fullRun) {
    statusLine = (
      <>
        <span className="tools-run-status-text">{message}</span>
        {percent > 0 && <span className="tools-run-status-pct">{percent}%</span>}
      </>
    );
  } else if (exportedPath) {
    statusLine = (
      <>
        <FaCheckCircle className="tools-done-icon" aria-hidden="true" />
        <Tooltip content={exportedPath} maxWidth={420}>
          <span className="tools-run-status-text tools-run-status-done">Saved {exportedPath.split(/[/\\]/).pop()}</span>
        </Tooltip>
        <button type="button" className="tools-link-btn tools-run-status-link" onClick={() => reveal(exportedPath)}>
          Show
        </button>
      </>
    );
  } else if (status === "stopped") {
    statusLine = <span className="tools-run-status-text">Stopped. Nothing was saved.</span>;
  } else if (status === "error") {
    statusLine = <span className="tools-run-status-text tools-run-status-error">It didn't finish. The reason is below.</span>;
  }

  return (
    <div className="menu-page tools-page" ref={pageRef}>
      <div className="menu-header">
        <div className="menu-nav" role="tablist" aria-label="Tool">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.kind}
                type="button"
                role="tab"
                aria-selected={kind === t.kind}
                className={`menu-nav-btn${kind === t.kind ? " active" : ""}`}
                onClick={() => chooseKind(t.kind)}
                disabled={running && kind !== t.kind}
              >
                <Icon className="menu-nav-icon" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="tools-workspace">
        <section className="tools-viewer-col">
          <div ref={viewerRef} className={`tools-viewer${!source ? " is-empty" : ""}${dragging ? " is-drop-target" : ""}`}>
            {source ? (
              <ToolsViewer />
            ) : (
              <button type="button" className="tools-drop" onClick={() => void pickFile()}>
                <FaFileVideo className="tools-drop-icon" aria-hidden="true" />
                <span className="tools-drop-title">{dragging ? "Drop it here" : "Drop a video here"}</span>
                <span className="tools-drop-hint">or click to choose one. Any format works.</span>
              </button>
            )}
          </div>
        </section>

        <section className="tools-bottom about-card">
          <div className="tools-bottom-intro">
            <div className="tools-panel-head">
              <h3 className="tools-panel-title">{tab.label}</h3>
              <p className="tools-panel-blurb">{tab.blurb}</p>
            </div>

            {!packReady && (
              <div className="tools-notice">
                <FaExclamationTriangle aria-hidden="true" />
                <span>{PACK_NAME[kind]} isn't installed yet.</span>
                <button type="button" className="event-secondary-btn tools-small-btn" onClick={() => void ensureToolPack(kind)}>
                  Install
                </button>
              </div>
            )}
          </div>

          <div className="tools-fields">
            {kind === "upscale" ? (
              <>
                <label className="tools-field">
                  <span className="tools-field-label">Model</span>
                  <Dropdown
                    className="settings-wide-dropdown"
                    preferredDirection="up"
                    options={UPSCALE_MODEL_OPTIONS}
                    value={upscale.model}
                    onChange={(model) => store.setUpscale({ model: model as UpscaleModel })}
                    disabled={running}
                  />
                </label>
                <label className="tools-field">
                  <span className="tools-field-label">File quality</span>
                  <Dropdown
                    className="settings-wide-dropdown"
                    preferredDirection="up"
                    options={UPSCALE_QUALITY_OPTIONS}
                    value={upscale.quality}
                    onChange={(quality) => store.setUpscale({ quality: quality as UpscaleQuality })}
                    disabled={running}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="tools-field">
                  <span className="tools-field-label">Model</span>
                  <Dropdown
                    className="settings-wide-dropdown"
                    preferredDirection="up"
                    options={DEPTH_ENCODER_OPTIONS}
                    value={depth.encoder}
                    onChange={(encoder) => store.setDepth({ encoder: encoder as DepthEncoder })}
                    disabled={running}
                  />
                </label>
                <label className="tools-field">
                  <span className="tools-field-label">Colors</span>
                  <Dropdown
                    className="settings-wide-dropdown"
                    preferredDirection="up"
                    options={DEPTH_COLORMAP_OPTIONS}
                    value={depth.colormap}
                    onChange={(colormap) => store.setDepth({ colormap: colormap as DepthColormap })}
                    disabled={running || depth.grayscale}
                  />
                </label>
                <div className="tools-field tools-field-inline">
                  <span className="tools-field-label">Grayscale</span>
                  <label className="custom-checkbox" aria-label="Grayscale">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={depth.grayscale}
                      onChange={(e) => store.setDepth({ grayscale: e.target.checked })}
                      disabled={running}
                    />
                    <span className="checkmark"></span>
                  </label>
                </div>
              </>
            )}

          </div>

          <div className="tools-field tools-run">
            <div className="tools-run-status" role="status">{statusLine}</div>

            {running ? (
              <button type="button" className="event-secondary-btn tools-run-btn" onClick={() => void stopTool()}>
                <FaTimes aria-hidden="true" /> Stop
              </button>
            ) : (
              <div className="tools-run-buttons">
                <button
                  type="button"
                  className={`${canExport ? "event-secondary-btn" : "event-host-btn"} tools-run-btn`}
                  onClick={() => void runTool()}
                  disabled={!source || exporting}
                >
                  <FaPlay aria-hidden="true" /> {canExport ? RERUN_LABEL[kind] : RUN_LABEL[kind]}
                </button>
                <Tooltip content={exportDir ? `Opens in ${exportDir}` : "Choose where to save it"} maxWidth={420}>
                  <button
                    type="button"
                    className="event-host-btn tools-run-btn"
                    onClick={() => void handleExport()}
                    disabled={!canExport || exporting}
                  >
                    <FaFileExport aria-hidden="true" /> {exporting ? "Exporting..." : "Export"}
                  </button>
                </Tooltip>
              </div>
            )}

            {fullRun && (
              <div className="progress-bar tools-run-bar">
                <div
                  className={`progress-fill${percent <= 0 ? " tools-progress-indeterminate" : ""}`}
                  style={{ width: percent <= 0 ? "35%" : `${percent}%` }}
                />
              </div>
            )}
            {status === "error" && error && (
              <div className="bugreport-alert error tools-alert" role="alert">
                {error}
              </div>
            )}
            {exportError && (
              <div className="bugreport-alert error tools-alert" role="alert">
                {exportError}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Tools: one clip in, an upscaled copy or a depth map out, the two played side by side; most of the screen, Menu's shell */
export default function ToolsModal() {
  const open = useUIStateStore((s) => s.toolsOpen);
  const closeTools = useUIStateStore((s) => s.closeTools);
  return (
    <ModalShell open={open} onClose={closeTools} label="Tools" className="tools-modal">
      <ToolsPage />
    </ModalShell>
  );
}
