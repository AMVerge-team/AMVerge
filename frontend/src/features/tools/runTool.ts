import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";

import { useAiDepsStore } from "../../stores/aiDepsStore";
import { useAppPersistedStore } from "../../stores/appStore";
import { useToolsStore, type ToolKind } from "../../stores/toolsStore";
import { depthArgs, PASS_SUFFIX, upscaleArgs } from "../export/postPasses";
import { claimProcess, registerToolsAbort, useToolsRunState } from "../processes/singleProcess";
import { isOutdatedCliError, passErrorMessage } from "../export/passErrors";
import type { FlowSource } from "../sceneScout/types";

let stopRequested = false;

/**
 * which frame a live preview shows, from the "n/total" count in the progress line around it: upscale sends a
 * frame's preview before its count (so it is frame n), depth sends the count first (so it is frame n - 1)
 */
const PREVIEW_FRAME_OFFSET: Record<ToolKind, number> = { upscale: 0, depth: -1 };

function dirOf(path: string): string {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return idx > 0 ? path.slice(0, idx) : path;
}

function stemOf(name: string): string {
  const file = name.split(/[/\\]/).pop() ?? name;
  const dot = file.lastIndexOf(".");
  return (dot > 0 ? file.slice(0, dot) : file) || "clip";
}

/** `1m05s` for a range's start, so two scenes of one episode never share a name */
function rangeTag(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, "0")}s`;
}

/** where an export starts: the app's last export folder, shared with the main export, else beside the clip */
export function lastExportDir(source: FlowSource | null): string | null {
  const exportDir = useAppPersistedStore.getState().exportDir;
  if (exportDir) return exportDir;
  return source ? dirOf(source.path) : null;
}

/** asks to install the kind's AI pack when it is missing; false when the user declines */
export function ensureToolPack(kind: ToolKind): Promise<boolean> {
  return useAiDepsStore.getState().ensurePack(kind);
}

function passArgs(kind: ToolKind): string[] {
  const { upscale, depth } = useToolsStore.getState();
  return kind === "upscale" ? upscaleArgs({ enabled: true, ...upscale }) : depthArgs({ enabled: true, ...depth });
}

/** the name a result is saved under, before any "(1)" a taken name gets */
function resultBase(source: FlowSource, kind: ToolKind): string {
  const stem = stemOf(source.label) + (source.startMs !== undefined ? `_${rangeTag(source.startMs)}` : "");
  return `${stem}${PASS_SUFFIX[kind]}`;
}

/**
 * Generate: renders the clip into the app cache, showing each frame beside the original as it goes; nothing is
 * saved until Export
 */
export async function runTool(): Promise<void> {
  const { source, kind } = useToolsStore.getState();
  if (!source || useToolsRunState.getState().running) return;
  if (!(await ensureToolPack(kind))) return;
  if (!(await claimProcess("tools"))) return;

  stopRequested = false;
  useToolsRunState.setState({ running: true });
  const { setRun } = useToolsStore.getState();
  setRun({
    status: "preparing",
    percent: 0,
    message: "Preparing the clip...",
    error: null,
    liveFrame: null,
    liveAt: null,
    compare: null,
    outputPath: null,
    exportedPath: null,
  });

  // the newest "n/total" from the cli, which places each live frame on the original's timeline
  let count = 0;
  let total = 0;

  // each live frame is encoded the way the export encodes it, newest first: a frame that arrives mid-encode
  // replaces the one waiting, so the viewer never falls behind the run
  let passInput = "";
  let encoding = false;
  let waiting: { path: string; seq: number; at: number | null } | null = null;
  const encodeNewest = async () => {
    if (encoding || !waiting) return;
    encoding = true;
    const job = waiting;
    waiting = null;
    try {
      const encoded = await invoke<string>("tools_encode_live_frame", {
        framePath: job.path,
        inputPath: passInput,
        kind,
        quality: useToolsStore.getState().upscale.quality,
        seq: job.seq,
      });
      if (useToolsStore.getState().status === "running") {
        setRun({ liveFrame: `${convertFileSrc(encoded)}?v=${job.seq}`, liveAt: job.at });
      }
    } catch (err) {
      console.warn("[tools] live frame skipped:", err);
    } finally {
      encoding = false;
      void encodeNewest();
    }
  };
  const unlisteners = await Promise.all([
    listen<{ pass: string; percent: number; message: string }>("pass_progress", (event) => {
      if (event.payload.pass !== kind || useToolsStore.getState().status !== "running") return;
      const counted = event.payload.message.match(/(\d+)\s*\/\s*(\d+)/);
      if (counted) {
        count = Number(counted[1]);
        total = Number(counted[2]);
      }
      setRun({ percent: event.payload.percent, message: event.payload.message });
    }),
    listen<{ pass: string; path: string; seq: number }>("pass_preview", (event) => {
      if (event.payload.pass !== kind || useToolsStore.getState().status !== "running") return;
      const frame = Math.max(0, count + PREVIEW_FRAME_OFFSET[kind]);
      // the middle of that frame's slot, so the original lands on it and not the frame before
      const at = total > 0 ? Math.min(1, (frame + 0.5) / total) : null;
      const { path, seq } = event.payload;
      // copied straight away: the cli alternates between two files and would overwrite this one
      void invoke<string>("tools_snapshot_live_frame", { framePath: path, seq })
        .then((snapshot) => {
          waiting = { path: snapshot, seq, at };
          void encodeNewest();
        })
        .catch((err) => console.warn("[tools] live frame missed:", err));
    }),
  ]);

  const runPass = (input: string, output: string) => {
    if (stopRequested) throw new Error("Stopped.");
    count = 0;
    total = 0;
    passInput = input;
    setRun({ status: "running", percent: 0, message: kind === "upscale" ? "Upscaling..." : "Mapping depth..." });
    return invoke("run_export_pass", { pass: kind, inputPath: input, outputPath: output, args: passArgs(kind), deleteInput: false });
  };

  try {
    const output = await invoke<string>("tools_generated_output", { base: resultBase(source, kind) });
    const range =
      source.startMs !== undefined && source.endMs !== undefined
        ? { startSec: source.startMs / 1000, endSec: source.endMs / 1000 }
        : { startSec: null, endSec: null };

    const prepare = (force: boolean) => invoke<string>("tools_prepare_input", { inputPath: source.path, ...range, force });
    let input = await prepare(false);
    try {
      await runPass(input, output);
    } catch (err) {
      // a file the pass couldn't read as it is gets one more try as an H.264 copy; an outdated cli fails either way
      if (stopRequested || input !== source.path || isOutdatedCliError(err)) throw err;
      console.warn("[tools] direct run failed, converting the input first:", err);
      setRun({ status: "preparing", percent: 0, message: "Converting the video so it can be read..." });
      input = await prepare(true);
      await runPass(input, output);
    }

    setRun({
      status: "done",
      percent: 100,
      message: "Done",
      outputPath: output,
      liveFrame: null,
      liveAt: null,
      // the exact frames the pass read, beside what it made
      compare: { original: input, processed: output },
    });
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (stopRequested) setRun({ status: "stopped", message: "Stopped", error: null, liveFrame: null, liveAt: null });
    else {
      console.error("[tools] run failed:", text);
      setRun({ status: "error", error: passErrorMessage(err), liveFrame: null, liveAt: null });
    }
  } finally {
    unlisteners.forEach((off) => off());
    useToolsRunState.setState({ running: false });
  }
}

/**
 * Export: a save dialog opened in the last export folder with a free name filled in; the copy goes where the user
 * picks, and that folder becomes the app's export folder (the main export starts there too)
 */
export async function exportTool(): Promise<void> {
  const { source, kind, outputPath, status } = useToolsStore.getState();
  if (!source || !outputPath || status !== "done") return;

  const dir = lastExportDir(source);
  const sep = dir?.includes("\\") ? "\\" : "/";
  const base = dir
    ? await invoke<string>("unique_export_base_name", { dir, base: resultBase(source, kind), extension: "mp4", suffixes: [] })
    : resultBase(source, kind);
  const picked = await save({
    title: kind === "upscale" ? "Export upscale" : "Export depth map",
    defaultPath: dir ? `${dir}${sep}${base}.mp4` : `${base}.mp4`,
    filters: [{ name: "MP4 video", extensions: ["mp4"] }],
  });
  if (!picked) return;

  const target = /\.mp4$/i.test(picked) ? picked : `${picked}.mp4`;
  // the dialog already asked before handing back a name that's taken
  const saved = await invoke<string>("tools_export_result", { from: outputPath, to: target, overwrite: true });
  useAppPersistedStore.getState().setExportDir(dirOf(saved));
  useToolsStore.getState().setRun({ exportedPath: saved });
}

/** stops the run: the input conversion and the pass are both killed through the export abort */
export async function stopTool(): Promise<void> {
  if (!useToolsRunState.getState().running) return;
  stopRequested = true;
  await invoke("abort_export").catch((err) => console.warn("[tools] abort failed:", err));
}

registerToolsAbort(stopTool);
