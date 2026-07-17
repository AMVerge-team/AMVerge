import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEventHandler,
} from "react";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";

interface ImportTerminalProps {
  progress: number;
  progressMsg: string;
  batchTotal: number;
  batchDone: number;
  batchCurrentFile: string;
  onAbort: () => void;
  /** Which CLI operation this overlay is showing (drives the command header). */
  operation?: "import" | "export";
  /** Video file name for the synthesized command header line. */
  commandLabel?: string;
  /** Scene detection method for the synthesized command line (e.g. keyframe_detection). */
  detectionMethod?: string;
  /** Import method for the synthesized command line (video_files / webp_files). */
  importMethod?: string;
  /** Collapsed into a small draggable card with the progress bar attached. */
  minimized?: boolean;
  /** Toggle between the centered terminal and the minimized card. */
  onToggleMinimize?: () => void;
  /** Dismiss the minimized card (abort + clear background progress). */
  onClose?: () => void;
  /** BgProgressBar (in `attached` mode) rendered below the minimized card. */
  bgBar?: ReactNode;
}

type LineKind = "cmd" | "log" | "warn" | "error" | "event";

interface TerminalLine {
  id: number;
  kind: LineKind;
  text: string;
}

interface ConsoleLogEvent {
  source: "frontend" | "rust" | "python" | "system";
  level: "log" | "warn" | "error";
  message: string;
}

interface ClipReadyEvent {
  scene_index: number;
  clip_path: string | null;
  clip_mode: string;
}

// Braille spinner frames — same family the rich CLI progress uses in a real TTY.
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BAR_WIDTH = 30;
const MAX_LINES = 500;

// Rust re-emits every PROGRESS| event as a "PROGRESS xx% - msg" console line.
// Those are represented by the live bar, so keep them out of the scroll log.
const isProgressEcho = (msg: string) => /^PROGRESS\s+\d/.test(msg.trim());

function fileNameOf(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ImportTerminal({
  progress,
  progressMsg,
  batchTotal,
  batchDone,
  batchCurrentFile,
  onAbort,
  operation = "import",
  commandLabel,
  detectionMethod = "transnetv2_gpu",
  importMethod = "video_files",
  minimized = false,
  onToggleMinimize,
  onClose,
  bgBar,
}: ImportTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const miniBodyRef = useRef<HTMLDivElement | null>(null);
  const idRef = useRef(0);
  const startedRef = useRef<number>(Date.now());
  const headerPushedRef = useRef(false);

  // Minimized-card drag state. The card floats free of the dark backdrop so the
  // grid stays visible while thumbnails/reencodes stream in behind it.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardPos, setCardPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

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
    const onResize = () => setCardPos((p) => (p ? clampCardPos(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [cardPos]);

  const handleCardPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0) return;
    // Don't start a drag when a control (expand/close) is pressed.
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

  const pushLine = (kind: LineKind, text: string) => {
    setLines((prev) => {
      const next = [...prev, { id: idRef.current++, kind, text }];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  };

  // Seed the synthesized command header once. Guarded so React StrictMode's
  // double-invoked mount effect can't push it twice.
  useEffect(() => {
    if (headerPushedRef.current) return;
    headerPushedRef.current = true;
    if (operation === "export") {
      const target = commandLabel ? `"${commandLabel}"` : "<clips>";
      pushLine("cmd", `amverge export ${target} --merge`);
    } else {
      const target = commandLabel ? `"${commandLabel}"` : "<video>";
      pushLine("cmd", `amverge backend ${target} ${detectionMethod} ${importMethod}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stream CLI stderr lines + clip/phase events while the import runs.
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let disposed = false;

    const attach = async () => {
      const stops = await Promise.all([
        listen<ConsoleLogEvent>("console_log", (e: Event<ConsoleLogEvent>) => {
          const { source, level, message } = e.payload;
          if (source !== "python") return;
          if (!message.trim() || isProgressEcho(message)) return;
          pushLine(level === "log" ? "log" : level, message);
        }),
        listen<ClipReadyEvent>("clip_ready", (e: Event<ClipReadyEvent>) => {
          const { scene_index, clip_path, clip_mode } = e.payload;
          const name = clip_path ? fileNameOf(clip_path) : `scene_${scene_index}`;
          pushLine("event", `✓ ${name} · ${clip_mode || "done"}`);
        }),
        listen("phase1_complete", () => {
          pushLine("event", "phase 1 complete · keyframe clips ready");
        }),
      ]);

      if (disposed) {
        stops.forEach((s) => s());
        return;
      }
      unlisteners.push(...stops);
    };

    attach();

    return () => {
      disposed = true;
      unlisteners.forEach((stop) => stop());
    };
  }, []);

  // Spinner + elapsed timer tick.
  useEffect(() => {
    const spin = window.setInterval(
      () => setSpinnerFrame((f) => (f + 1) % SPINNER.length),
      90
    );
    const clock = window.setInterval(
      () => setElapsed(Date.now() - startedRef.current),
      250
    );
    return () => {
      window.clearInterval(spin);
      window.clearInterval(clock);
    };
  }, []);

  // Keep the newest line in view (whichever body — full or mini — is mounted).
  useLayoutEffect(() => {
    for (const body of [bodyRef.current, miniBodyRef.current]) {
      if (body) body.scrollTop = body.scrollHeight;
    }
  }, [lines, minimized]);

  const clamped = Math.max(0, Math.min(100, progress));
  const filled = Math.round((clamped / 100) * BAR_WIDTH);
  const barFilled = "━".repeat(filled);
  const barEmpty = "─".repeat(BAR_WIDTH - filled);
  const done = clamped >= 100;

  // Batch import (multiple videos). batchDone is the 0-based index of the video
  // being processed, so it's also the count already finished.
  const isBatch = batchTotal > 1;
  const currentVideoNum = Math.min(batchDone + 1, batchTotal);
  // Smooth overall progress: finished videos + the current one's fraction.
  const overallPct = isBatch
    ? Math.round(((batchDone + clamped / 100) / batchTotal) * 100)
    : clamped;

  if (minimized) {
    const cardStyle = cardPos
      ? { left: `${cardPos.x}px`, top: `${cardPos.y}px`, right: "auto", bottom: "auto" }
      : undefined;
    return (
      <div
        ref={cardRef}
        className={`loading-minimized${dragging ? " dragging" : ""}`}
        style={cardStyle}
        role="status"
        aria-label="Import progress (minimized)"
      >
        <div className="lm-head" onPointerDown={handleCardPointerDown}>
          <span className="lm-spinner">{done ? "✓" : SPINNER[spinnerFrame]}</span>
          <span className="lm-title">
            {isBatch ? "Importing videos" : progressMsg || "Finishing import…"}
          </span>
          <div className="lm-actions">
            <button
              type="button"
              className="lm-btn"
              onClick={onToggleMinimize}
              aria-label="Expand"
              title="Expand"
            >
              ▢
            </button>
            {onClose ? (
              <button
                type="button"
                className="lm-btn lm-close"
                onClick={onClose}
                aria-label="Dismiss"
                title="Dismiss"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>

        {isBatch ? (
          <>
            <div className="lm-batch-row">
              <span className="lm-batch-count">
                Video {currentVideoNum}/{batchTotal}
              </span>
              {batchCurrentFile ? (
                <span className="lm-batch-file">{batchCurrentFile}</span>
              ) : null}
            </div>
            <div className="lm-progress">
              <span className="lm-bar-label">Overall</span>
              <div className="progress-bar lm-progress-bar">
                <div className="progress-fill" style={{ width: `${overallPct}%` }} />
              </div>
              <span className="lm-pct">{overallPct}%</span>
            </div>
            <div className="lm-progress">
              <span className="lm-bar-label">Current</span>
              <div className="progress-bar lm-progress-bar">
                <div className="progress-fill" style={{ width: `${clamped}%` }} />
              </div>
              <span className="lm-pct">{clamped}%</span>
            </div>
          </>
        ) : (
          <div className="lm-progress">
            <div className="progress-bar lm-progress-bar">
              <div className="progress-fill" style={{ width: `${clamped}%` }} />
            </div>
            <span className="lm-pct">{clamped}%</span>
          </div>
        )}

        <div className="lm-body" ref={miniBodyRef}>
          {lines.map((line) => (
            <div key={line.id} className={`it-line it-line-${line.kind}`}>
              {line.kind === "cmd" && <span className="it-prompt">$ </span>}
              {line.text}
            </div>
          ))}
        </div>
        {/* In batch mode the batch rows above are the progress; the per-clip
            bgBar would be redundant/misleading, so only show it for single import. */}
        {isBatch ? null : bgBar}
      </div>
    );
  }

  return (
    <div className="loading-overlay">
      <div className="import-terminal" role="log" aria-label="AMVerge CLI output">
        <div className="it-header">
          <span className="it-title">AMVerge CLI</span>
          {onToggleMinimize ? (
            <button
              type="button"
              className="it-min"
              onClick={onToggleMinimize}
              aria-label="Minimize"
              title="Minimize"
            >
              ─
            </button>
          ) : null}
        </div>
        <div className="it-body" ref={bodyRef}>
          {lines.map((line) => (
            <div key={line.id} className={`it-line it-line-${line.kind}`}>
              {line.kind === "cmd" && <span className="it-prompt">$ </span>}
              {line.text}
            </div>
          ))}
        </div>

        <div className="it-live">
          <div className="it-status">
            <span className="it-spinner">{done ? "✓" : SPINNER[spinnerFrame]}</span>
            <span className="it-stage">{progressMsg || "Working…"}</span>
          </div>
          <div className="it-progress">
            <span className="it-bar">
              <span className="it-bar-filled">{barFilled}</span>
              <span className="it-bar-empty">{barEmpty}</span>
            </span>
            <span className="it-pct">{clamped}%</span>
            <span className="it-elapsed">{formatElapsed(elapsed)}</span>
          </div>

          {batchTotal > 1 && (
            <div className="it-batch">
              Cutting videos {batchDone + 1}/{batchTotal} · {batchCurrentFile}
            </div>
          )}

          <button className="abort-button it-abort" onClick={onAbort}>
            Abort
          </button>
        </div>
      </div>
    </div>
  );
}
