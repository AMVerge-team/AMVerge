import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { useAiDepsStore } from "../../stores/aiDepsStore";
import { usePassRunStore } from "../../stores/passRunStore";
import { AI_PACKS } from "../aiDeps/packs";
import { isFeatureEnabled } from "../featureToggles";
import {
  anyPassEnabled,
  depthArgs,
  PASS_LABEL,
  PASS_SUFFIX,
  POST_EXPORT_PASS_KINDS,
  upscaleArgs,
  type PostExportPassKind,
  type PostExportPasses,
} from "./postPasses";

type CliPass = PostExportPassKind;

const PASS_FEATURE = { depth: "depthPass", upscale: "upscalePass" } as const;

// the subcommand run_export_pass spawns, for the log's command line
const CLI_COMMAND: Record<CliPass, string> = { depth: "depth-map", upscale: "upscale" };

type CliCall = {
  pass: CliPass;
  input: string;
  output: string;
  args: string[];
  deleteInput?: boolean;
};

type Job = { label: string; calls: CliCall[] };

/** one file and the passes it gets; the pass settings still have to enable each */
export type PassTarget = {
  path: string;
  depth: boolean;
  upscale: boolean;
  /** dir + stem the outputs are named from, when they shouldn't land beside the input (a staged merge) */
  outputStem?: string;
};

/** every enabled pass on each file */
export function everyPassTargets(paths: string[]): PassTarget[] {
  return paths.map((path) => ({ path, depth: true, upscale: true }));
}

function splitPath(p: string): { dir: string; stem: string; ext: string; sep: string } {
  const sep = p.includes("\\") ? "\\" : "/";
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  const dir = idx >= 0 ? p.slice(0, idx) : ".";
  const file = idx >= 0 ? p.slice(idx + 1) : p;
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot + 1) : "mp4";
  return { dir, stem, ext, sep };
}

function buildJobs(
  targets: PassTarget[],
  passes: PostExportPasses
): { jobs: Job[] } {
  const jobs: Job[] = [];
  for (const target of targets) {
    const out = target.path;
    const { dir, stem, ext, sep } = splitPath(out);
    const base = target.outputStem ?? `${dir}${sep}${stem}`;
    const path = (suffix: string) => `${base}${suffix}.${ext}`;

    if (passes.depth.enabled && target.depth) {
      const output = path(PASS_SUFFIX.depth);
      jobs.push({
        label: `${PASS_LABEL.depth} · ${stem}`,
        calls: [{ pass: "depth", input: out, output, args: depthArgs(passes.depth) }],
      });
    }

    if (passes.upscale.enabled && target.upscale) {
      const output = path(PASS_SUFFIX.upscale);
      jobs.push({
        label: `${PASS_LABEL.upscale} · ${stem}`,
        calls: [{ pass: "upscale", input: out, output, args: upscaleArgs(passes.upscale) }],
      });
    }
  }
  return { jobs };
}

/** runs each target's enabled passes in sequence, driving the pass modal; stop is honored between and within jobs */
export async function runPostExportPasses(
  targets: PassTarget[],
  passes: PostExportPasses,
): Promise<void> {
  if (targets.length === 0 || !anyPassEnabled(passes)) return;

  // passes need the AI env, which a removed pack or foreign settings file may lack
  const effective: PostExportPasses = {
    depth: { ...passes.depth },
    upscale: { ...passes.upscale },
  };
  const skipped: string[] = [];
  for (const kind of POST_EXPORT_PASS_KINDS) {
    // a pass switched off in Settings > Features never runs, whatever its own toggle says
    if (!isFeatureEnabled(PASS_FEATURE[kind])) effective[kind].enabled = false;
    // no file picked for a pass: don't install or ask for its pack
    if (!targets.some((t) => t[kind])) effective[kind].enabled = false;
    if (effective[kind].enabled && !(await useAiDepsStore.getState().ensurePack(kind))) {
      effective[kind].enabled = false;
      skipped.push(`[skipped] ${kind} pass: ${AI_PACKS[kind].dependencyName} is not installed`);
    }
  }
  if (!anyPassEnabled(effective)) return;

  const { jobs } = buildJobs(targets, effective);
  if (jobs.length === 0) return;

  const store = usePassRunStore.getState();
  store.begin(jobs.length);
  // after begin(), which clears the log
  skipped.forEach((line) => store.pushLog(line, "warn"));

  // the bar shows every progress tick; the log gets one line each time the stage changes ("Downloading…", "Upscaling…")
  let lastStage = "";
  const unlisteners = await Promise.all([
    listen<{ pass: string; percent: number; message: string }>("pass_progress", (e) => {
      const { percent, message } = e.payload;
      usePassRunStore.getState().setProgress(percent, message);
      const stage = message.replace(/[\d.]+/g, "#");
      // the cli's closing "Saved: <path>" and "Error: ..." repeat the ✓ and error lines this loop writes
      if (!message.trim() || stage === lastStage || /^(saved|error):/i.test(message)) return;
      lastStage = stage;
      // the count belongs to the bar: "Upscaling... 1/42" logs as "Upscaling..."
      usePassRunStore.getState().pushLog(message.replace(/\s*[\d.]+\s*(%|\/\s*\d+)\s*$/, ""), "event");
    }),
    listen<{ pass: string; path: string; seq: number }>("pass_preview", (e) => {
      usePassRunStore.getState().setPreview(`${convertFileSrc(e.payload.path)}?v=${e.payload.seq}`);
    }),
    listen<{ pass: string; line: string }>("pass_log", (e) => {
      usePassRunStore.getState().pushLog(e.payload.line);
    }),
  ]);

  try {
    for (const job of jobs) {
      if (usePassRunStore.getState().stopRequested) break;
      usePassRunStore.getState().startJob(job.label);

      let jobOk = true;
      for (const call of job.calls) {
        if (usePassRunStore.getState().stopRequested) {
          jobOk = false;
          break;
        }
        lastStage = "";
        usePassRunStore
          .getState()
          .pushLog(`amverge ${CLI_COMMAND[call.pass]} "${splitPath(call.input).stem}" ${call.args.join(" ")}`, "cmd");
        try {
          await invoke("run_export_pass", {
            pass: call.pass,
            inputPath: call.input,
            outputPath: call.output,
            args: call.args,
            deleteInput: call.deleteInput ?? false,
          });
          const out = splitPath(call.output);
          usePassRunStore.getState().pushLog(`✓ ${out.stem}.${out.ext}`, "event");
        } catch (err) {
          jobOk = false;
          usePassRunStore.getState().pushLog(`${job.label}: ${String(err)}`, "error");
          break;
        }
      }

      if (!jobOk && !usePassRunStore.getState().stopRequested) {
        usePassRunStore.getState().addError(job.label);
      }
      usePassRunStore.getState().completeJob();
    }
  } finally {
    unlisteners.forEach((stop) => stop());
    usePassRunStore.getState().finish();
  }
}
