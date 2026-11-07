import { useEffect, useLayoutEffect, useRef, useState, type PointerEventHandler, type ReactNode } from "react";

import Tooltip from "./common/Tooltip";

export type JobLineKind = "cmd" | "log" | "warn" | "error" | "event";

export type JobLine = {
  id: number;
  kind: JobLineKind;
  text: string;
};

// braille spinner frames, same family the rich CLI progress uses in a real TTY
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// where each card was last dragged to, so minimizing again puts it back there
const lastPositions = new Map<string, { x: number; y: number }>();

type BackgroundJobCardProps = {
  /** keys the remembered position, one per kind of job */
  id: string;
  title: string;
  done: boolean;
  lines: JobLine[];
  ariaLabel: string;
  onExpand?: () => void;
  onClose?: () => void;
  closeLabel?: string;
  /** the progress rows between the title and the log */
  children: ReactNode;
  footer?: ReactNode;
};

/** the minimized card a long job tucks into: draggable, progress on top, its log streaming below */
export default function BackgroundJobCard({
  id,
  title,
  done,
  lines,
  ariaLabel,
  onExpand,
  onClose,
  closeLabel = "Dismiss",
  children,
  footer,
}: BackgroundJobCardProps) {
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [cardPos, setCardPos] = useState<{ x: number; y: number } | null>(() => lastPositions.get(id) ?? null);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const spin = window.setInterval(() => setSpinnerFrame((f) => (f + 1) % SPINNER.length), 90);
    return () => window.clearInterval(spin);
  }, []);

  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  const clampCardPos = (x: number, y: number) => {
    const el = cardRef.current;
    if (!el) return { x, y };
    const rect = el.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(8, window.innerHeight - rect.height - 8);
    return { x: Math.min(maxX, Math.max(8, x)), y: Math.min(maxY, Math.max(8, y)) };
  };

  useEffect(() => {
    if (!cardPos) return;
    lastPositions.set(id, cardPos);
    const onResize = () => setCardPos((p) => (p ? clampCardPos(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [cardPos, id]);

  const handleCardPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0) return;
    // don't start a drag when a control (expand/close) is pressed
    if ((event.target as HTMLElement).closest("button")) return;
    const el = cardRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setDragging(true);
    event.preventDefault();

    const onMove = (moveEvent: PointerEvent) => {
      const offset = dragOffsetRef.current;
      if (!offset) return;
      setCardPos(clampCardPos(moveEvent.clientX - offset.x, moveEvent.clientY - offset.y));
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

  const cardStyle = cardPos
    ? { left: `${cardPos.x}px`, top: `${cardPos.y}px`, right: "auto", bottom: "auto" }
    : undefined;

  return (
    <div
      ref={cardRef}
      className={`loading-minimized${dragging ? " dragging" : ""}`}
      style={cardStyle}
      role="status"
      aria-label={ariaLabel}
    >
      <div className="lm-head" onPointerDown={handleCardPointerDown}>
        <span className="lm-spinner">{done ? "✓" : SPINNER[spinnerFrame]}</span>
        <span className="lm-title">{title}</span>
        <div className="lm-actions">
          {onExpand ? (
            <Tooltip content="Expand">
              <button type="button" className="lm-btn" onClick={onExpand} aria-label="Expand">
                ▢
              </button>
            </Tooltip>
          ) : null}
          {onClose ? (
            <Tooltip content={closeLabel}>
              <button type="button" className="lm-btn lm-close" onClick={onClose} aria-label={closeLabel}>
                ✕
              </button>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {children}

      <div className="lm-body" ref={bodyRef}>
        {lines.map((line) => (
          <div key={line.id} className={`it-line it-line-${line.kind}`}>
            {line.kind === "cmd" && <span className="it-prompt">$ </span>}
            {line.text}
          </div>
        ))}
      </div>
      {footer}
    </div>
  );
}
