import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";

import Tooltip from "./common/Tooltip";
import BackgroundJobCard, { type JobLine, type JobLineKind } from "./BackgroundJobCard";

interface ImportTerminalProps {
  progress: number;
  progressMsg: string;
  batchTotal: number;
  batchDone: number;
  batchCurrentFile: string;
  onAbort: () => void;
  operation?: "import" | "export" | "scout_add" | "scout_open" | "scout_search" | "scout_thumbnails" | "resume" | "previews";
  commandLabel?: string;
  /** scene detection method for the synthesized command line (e.g. keyframe_detection) */
  detectionMethod?: string;
  /** import method for the synthesized command line (video_files / webp_files) */
  importMethod?: string;
  /** whether an export merges, for the synthesized command line */
  exportMerges?: boolean;
  /** collapsed into a small draggable card with the progress bar attached */
  minimized?: boolean;
  /** toggle between the centered terminal and the minimized card */
  onToggleMinimize?: () => void;
  /** dismiss the minimized card (abort + clear background progress) */
  onClose?: () => void;
  /** BgProgressBar (in `attached` mode) rendered below the minimized card */
  bgBar?: ReactNode;
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

// braille spinner frames, same family the rich CLI progress uses in a real TTY
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BAR_WIDTH = 30;
const MAX_LINES = 500;

// rust echoes PROGRESS events as console lines; the live bar shows them, so they stay out of the log
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
  exportMerges = false,
  minimized = false,
  onToggleMinimize,
  onClose,
  bgBar,
}: ImportTerminalProps) {
  const [lines, setLines] = useState<JobLine[]>([]);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const idRef = useRef(0);
  const startedRef = useRef<number>(Date.now());
  const headerPushedRef = useRef(false);

  const pushLine = (kind: JobLineKind, text: string) => {
    setLines((prev) => {
      const next = [...prev, { id: idRef.current++, kind, text }];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  };

  // seeds the command header once, guarded against StrictMode's double mount
  useEffect(() => {
    if (headerPushedRef.current) return;
    headerPushedRef.current = true;
    if (operation === "export") {
      const target = commandLabel ? `"${commandLabel}"` : "<clips>";
      pushLine("cmd", `amverge export ${target}${exportMerges ? " --merge" : ""}`);
    } else if (operation === "scout_add") {
      const target = commandLabel ? `"${commandLabel}"` : "<video>";
      pushLine("cmd", `amverge scout add ${target}`);
    } else if (operation === "scout_open") {
      const target = commandLabel ? `"${commandLabel}"` : "<database>";
      pushLine("cmd", `amverge scout open ${target}`);
    } else if (operation === "scout_thumbnails") {
      const target = commandLabel ? `"${commandLabel}"` : "<database>";
      pushLine("cmd", `amverge scout generate-thumbnails --db ${target}`);
    } else if (operation === "resume") {
      const target = commandLabel ? `"${commandLabel}"` : "<episode>";
      pushLine("cmd", `amverge materialize-clips ${target} --resume`);
    } else if (operation === "previews") {
      const target = commandLabel ? `"${commandLabel}"` : "<episode>";
      pushLine("cmd", `ffmpeg libwebp ${target} --scene-previews`);
    } else {
      const target = commandLabel ? `"${commandLabel}"` : "<video>";
      pushLine("cmd", `amverge backend ${target} ${detectionMethod} ${importMethod}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // stream CLI stderr lines + clip/phase events while the import runs
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let disposed = false;

    // the cli streams counted stages often; print the header once, then each 20% step once
    const lastStep: Record<string, number> = {};
    const pushCounted = (stage: string, header: string, label: string, done: number, total: number) => {
      if (!(stage in lastStep)) {
        lastStep[stage] = 0;
        pushLine("event", header);
      }
      if (total <= 0 || done <= 0) return;
      const step = Math.floor((done * 5) / total);
      if (step > lastStep[stage]) {
        lastStep[stage] = step;
        pushLine("event", `${label} ${done}/${total}`);
      }
    };

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
        // a webp episode's scene previews, encoded by the app's own ffmpeg rather than the cli
        listen<{ sceneId: string; path: string }>("scene_webp_ready", (e) => {
          const scene = e.payload.sceneId.split("::")[0].split("_").pop();
          pushLine("event", `✓ scene ${scene} · preview`);
        }),
        listen("phase1_complete", () => {
          pushLine(
            "event",
            detectionMethod.startsWith("keyframe")
              ? "keyframe clips ready"
              : "scenes detected · encoding exact previews"
          );
        }),
        listen<{ stage: string; done: number; total: number; video?: string | null }>(
          "scout_progress",
          (e) => {
            const { stage, done, total } = e.payload;
            if (stage === "loading_model") {
              pushLine("event", "loading SigLIP 2 model weights…");
            } else if (stage === "detecting") {
              // repeats as detection streams its percent; the live bar shows that
              if (!(stage in lastStep)) {
                lastStep[stage] = 0;
                pushLine("event", "detecting scenes…");
              }
            } else if (stage === "sampling") {
              pushCounted(stage, `sampling ${total} representative frames…`, "sampled frames", done, total);
            } else if (stage === "embedding") {
              pushCounted(stage, `embedding ${total} scenes…`, "embedding scenes", done, total);
            } else if (stage === "thumbnails") {
              pushCounted(stage, `making ${total} thumbnails…`, "thumbnails", done, total);
            } else if (stage === "done") {
              // a batch of episodes repeats every stage, so the next one prints its own steps
              for (const key of Object.keys(lastStep)) delete lastStep[key];
              pushLine("event", `indexed ${total} scenes successfully`);
            }
          }
        ),
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

  // spinner + elapsed timer tick
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

  // keep the newest line in view; the minimized card scrolls its own log
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines, minimized]);

  const clamped = Math.max(0, Math.min(100, progress));
  const done = clamped >= 100;

  const renderBar = (pct: number) => {
    const filled = Math.round((pct / 100) * BAR_WIDTH);
    return (
      <span className="it-bar">
        <span className="it-bar-filled">{"━".repeat(filled)}</span>
        <span className="it-bar-empty">{"─".repeat(BAR_WIDTH - filled)}</span>
      </span>
    );
  };

  // batchDone is the 0-based index of the current video, so also the count finished
  const isBatch = batchTotal > 1;
  const currentVideoNum = Math.min(batchDone + 1, batchTotal);
  // smooth overall progress: finished videos + the current one's fraction
  const overallPct = isBatch
    ? Math.round(((batchDone + clamped / 100) / batchTotal) * 100)
    : clamped;

  if (minimized) {
    return (
      <BackgroundJobCard
        id="cli"
        ariaLabel="Import progress (minimized)"
        done={done}
        lines={lines}
        title={
          isBatch
            ? (operation === "scout_add" ? "Embedding videos" : "Importing videos")
            : progressMsg || (operation === "scout_add" ? "Embedding scenes…" : operation === "scout_open" ? "Opening database…" : operation === "scout_search" ? "Searching scenes…" : operation === "scout_thumbnails" ? "Generating thumbnails…" : operation === "previews" ? "Generating previews…" : "Finishing import…")
        }
        onExpand={onToggleMinimize}
        onClose={onClose}
        // In batch mode the batch rows are the progress; the per-clip bgBar
        // would be redundant/misleading, so only show it for single import.
        footer={isBatch ? null : bgBar}
      >
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
      </BackgroundJobCard>
    );
  }

  return (
    <div className="loading-overlay">
      <div className="import-terminal" role="log" aria-label="AMVerge CLI output">
        <div className="it-header">
          <span className="it-title">
            {operation === "scout_add"
              ? "Scene Scout - Indexing"
              : operation === "scout_open"
              ? "Scene Scout - Database"
              : operation === "scout_search"
              ? "Scene Scout - Search"
              : operation === "scout_thumbnails"
              ? "Scene Scout - Thumbnails"
              : "AMVerge CLI"}
          </span>
          {onToggleMinimize ? (
            <Tooltip content="Minimize">
              <button
                type="button"
                className="it-min"
                onClick={onToggleMinimize}
                aria-label="Minimize"
              >
                ─
              </button>
            </Tooltip>
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
          {isBatch && (
            <div className="it-progress">
              <span className="it-bar-label">Overall</span>
              {renderBar(overallPct)}
              <span className="it-pct">{overallPct}%</span>
              <span className="it-elapsed">{formatElapsed(elapsed)}</span>
            </div>
          )}
          <div className="it-progress">
            {isBatch && <span className="it-bar-label">Current</span>}
            {renderBar(clamped)}
            <span className="it-pct">{clamped}%</span>
            {!isBatch && <span className="it-elapsed">{formatElapsed(elapsed)}</span>}
          </div>

          {isBatch && (
            <div className="it-batch">
              {operation === "scout_add" ? "Embedding videos" : "Cutting videos"} {batchDone + 1}/{batchTotal} · {batchCurrentFile}
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
