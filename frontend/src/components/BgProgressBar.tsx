import { useEffect, useRef, useState } from "react";

import Tooltip from "./common/Tooltip";

type BgProgress = {
  clipDone?: number;
  clipTotal?: number;
  clipLabel?: string;
  importDone?: number;
  importTotal?: number;
  webpDone?: number;
  webpTotal?: number;
  webpLabel?: string;
  aiDone?: number;
  aiTotal?: number;
  aiLabel?: string;
  onAiClick?: () => void;
  onClose: () => void;
  /** render inline (no fixed positioning, drag, or header) so a parent can
   * attach it below the minimized loading card */
  attached?: boolean;
};

export default function BgProgressBar({
  clipDone = 0,
  clipTotal = 0,
  clipLabel = "Processing clips",
  importDone = 0,
  importTotal = 0,
  webpDone = 0,
  webpTotal = 0,
  webpLabel = "Loading previews",
  aiDone = 0,
  aiTotal = 0,
  aiLabel = "Installing AI models",
  onAiClick,
  onClose,
  attached = false,
}: BgProgress) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const clipPercent = clipTotal > 0 ? Math.round((clipDone / clipTotal) * 100) : 0;
  const importPercent = importTotal > 0 ? Math.round((importDone / importTotal) * 100) : 0;
  const webpPercent = webpTotal > 0 ? Math.round((webpDone / webpTotal) * 100) : 0;
  const aiPercent = Math.min(100, Math.max(0, Math.round(aiDone)));
  const showClipProgress = clipTotal > 0;
  const showImportProgress = importTotal > 0;
  const showWebpProgress = webpTotal > 0;
  const showAiProgress = aiTotal > 0;

  const clampPosition = (x: number, y: number) => {
    const element = containerRef.current;
    if (!element) return { x, y };

    const rect = element.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(8, window.innerHeight - rect.height - 8);

    return {
      x: Math.min(maxX, Math.max(8, x)),
      y: Math.min(maxY, Math.max(8, y)),
    };
  };

  useEffect(() => {
    if (!position) return;

    const onResize = () => {
      setPosition((prev) => {
        if (!prev) return prev;
        return clampPosition(prev.x, prev.y);
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [position]);

  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0) return;

    const target = event.target as HTMLElement;
    if (target.closest(".bg-progress-close")) return;

    const element = containerRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setDragging(true);
    event.preventDefault();

    const onMove = (moveEvent: PointerEvent) => {
      const offset = dragOffsetRef.current;
      if (!offset) return;

      const next = clampPosition(
        moveEvent.clientX - offset.x,
        moveEvent.clientY - offset.y
      );
      setPosition(next);
    };

    const onUp = () => {
      dragOffsetRef.current = null;
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // attached mode flows inside a parent card: no fixed positioning, no drag,
  // and no header (the parent card owns the title + controls)
  const anchoredStyle = attached
    ? undefined
    : position
      ? { left: `${position.x}px`, top: `${position.y}px`, right: "auto", bottom: "auto" }
      : undefined;

  return (
    <div
      ref={containerRef}
      className={`bg-progress-bar${attached ? " bg-progress-bar--attached" : ""}`}
      style={anchoredStyle}
    >
      {!attached ? (
        <div className={`bg-progress-head${dragging ? " dragging" : ""}`} onPointerDown={handlePointerDown}>
          <span className="bg-progress-label header">Background tasks</span>
          <Tooltip content="Close">
            <button
              type="button"
              className="bg-progress-close"
              onClick={onClose}
              aria-label="Close processing indicator"
            >
              x
            </button>
          </Tooltip>
        </div>
      ) : null}
      {showClipProgress ? (
        <>
          <p className="bg-progress-label">{clipLabel} {clipDone}/{clipTotal}</p>
          <div className="progress-bar" style={{ width: "100%", marginTop: 4, marginLeft: 0, marginRight: 0 }}>
            <div className="progress-fill" style={{ width: `${clipPercent}%` }} />
          </div>
        </>
      ) : null}

      {showImportProgress ? (
        <>
          <div className="progress-bar" style={{ width: "100%", marginTop: 6, marginLeft: 0, marginRight: 0 }}>
            <div className="progress-fill" style={{ width: `${importPercent}%` }} />
          </div>
          <span className="bg-progress-label">Importing {importDone}/{importTotal} videos</span>
        </>
      ) : null}

      {showWebpProgress ? (
        <>
          <p className="bg-progress-label">{webpLabel} {webpDone}/{webpTotal}</p>
          <div className="progress-bar" style={{ width: "100%", marginTop: 4, marginLeft: 0, marginRight: 0 }}>
            <div className="progress-fill" style={{ width: `${webpPercent}%` }} />
          </div>
        </>
      ) : null}

      {showAiProgress ? (
        <Tooltip content="Click to view full installation details">
        <div
          onClick={onAiClick}
          style={{ cursor: onAiClick ? "pointer" : "default", marginTop: 6 }}
        >
          <p className="bg-progress-label" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{aiLabel}</span>
            <strong style={{ color: "var(--accent)" }}>{aiPercent}%</strong>
          </p>
          <div className="progress-bar" style={{ width: "100%", marginTop: 4, marginLeft: 0, marginRight: 0 }}>
            <div className="progress-fill" style={{ width: `${aiPercent}%` }} />
          </div>
        </div>
        </Tooltip>
      ) : null}
    </div>
  );
}
