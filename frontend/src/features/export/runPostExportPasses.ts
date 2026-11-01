import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { useAiDepsStore } from "../../stores/aiDepsStore";
import { usePassRunStore } from "../../stores/passRunStore";
import { AI_PACKS } from "../aiDeps/packs";
import { isFeatureEnabled } from "../featureToggles";
import {
  anyPassEnabled,
  deadframesArgs,
  depthArgs,
  interpolationArgs,
  PASS_SUFFIX,
  type PostExportPasses,
} from "./postPasses";

type CliPass = "depth" | "deadframes" | "interpolate";

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
  interpolation: boolean;
  /** dir + stem the outputs are named from, when they shouldn't land beside the input (a staged merge) */
  outputStem?: string;
};

/** every enabled pass on each file */
export function everyPassTargets(paths: string[]): PassTarget[] {
  return paths.map((path) => ({ path, depth: true, interpolation: true }));
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
): { jobs: Job[]; interpOutputs: string[]; deadframesOutputs: string[] } {
  const jobs: Job[] = [];
  const interpOutputs: string[] = [];
  const deadframesOutputs: string[] = [];
  for (const target of targets) {
    const out = target.path;
    const { dir, stem, ext, sep } = splitPath(out);
    const base = target.outputStem ?? `${dir}${sep}${stem}`;
    const path = (suffix: string) => `${base}${suffix}.${ext}`;

    if (passes.depth.enabled && target.depth) {
      const output = path(PASS_SUFFIX.depth);
      jobs.push({
        label: `Depth map · ${stem}`,
        calls: [{ pass: "depth", input: out, output, args: depthArgs(passes.depth) }],
      });
    }
    if (passes.interpolation.enabled && target.interpolation) {
      // dead frames first, then interpolation; keeping the copy just means not deleting it
      const keepDeadframes = passes.deadframes.exportCopy;
      const deadframesOut = keepDeadframes ? path(PASS_SUFFIX.deadframes) : path("_df_tmp");
      const output = path(PASS_SUFFIX.interpolation);
      interpOutputs.push(output);
      if (keepDeadframes) deadframesOutputs.push(deadframesOut);
      jobs.push({
        label: `Interpolation · ${stem}`,
        calls: [
          { pass: "deadframes", input: out, output: deadframesOut, args: deadframesArgs(passes.deadframes) },
          {
            pass: "interpolate",
            input: deadframesOut,
            output,
            args: interpolationArgs(passes.interpolation),
            deleteInput: !keepDeadframes,
          },
        ],
      });
    }
  }
  return { jobs, interpOutputs, deadframesOutputs };
}

/** runs each target's enabled passes in sequence, driving the pass modal; stop is honored between and within jobs */
export async function runPostExportPasses(
  targets: PassTarget[],
  passes: PostExportPasses,
): Promise<{ interpolated: string[]; deadframes: string[] }> {
  if (targets.length === 0 || !anyPassEnabled(passes)) return { interpolated: [], deadframes: [] };

  // depth and interpolation need the AI env, which a removed pack or foreign settings file may lack
  const effective: PostExportPasses = { ...passes };
  // a pass switched off in Settings > Features never runs, whatever its own toggle says
  if (!isFeatureEnabled("depthPass")) effective.depth = { ...effective.depth, enabled: false };
  if (!isFeatureEnabled("interpolationPass")) effective.interpolation = { ...effective.interpolation, enabled: false };
  // no file picked for a pass: don't install or ask for its pack
  if (!targets.some((t) => t.depth)) effective.depth = { ...effective.depth, enabled: false };
  if (!targets.some((t) => t.interpolation)) effective.interpolation = { ...effective.interpolation, enabled: false };
  if (!anyPassEnabled(effective)) return { interpolated: [], deadframes: [] };
  const skipped: string[] = [];
  const skipNote = (packId: "depth" | "interpolation") =>
    `[skipped] ${packId} pass: ${AI_PACKS[packId].dependencyName} is not installed`;

  if (effective.depth.enabled && !(await useAiDepsStore.getState().ensurePack("depth"))) {
    effective.depth = { ...effective.depth, enabled: false };
    skipped.push(skipNote("depth"));
  }
  if (
    effective.interpolation.enabled &&
    !(await useAiDepsStore.getState().ensurePack("interpolation"))
  ) {
    effective.interpolation = { ...effective.interpolation, enabled: false };
    skipped.push(skipNote("interpolation"));
  }
  if (!anyPassEnabled(effective)) return { interpolated: [], deadframes: [] };

  const { jobs, interpOutputs, deadframesOutputs } = buildJobs(targets, effective);
  if (jobs.length === 0) return { interpolated: [], deadframes: [] };

  const store = usePassRunStore.getState();
  store.begin(jobs.length);
  // after begin(), which clears the log
  skipped.forEach((line) => store.pushLog(line));

  const unlisteners = await Promise.all([
    listen<{ pass: string; percent: number; message: string }>("pass_progress", (e) => {
      usePassRunStore.getState().setProgress(e.payload.percent, e.payload.message);
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
        try {
          await invoke("run_export_pass", {
            pass: call.pass,
            inputPath: call.input,
            outputPath: call.output,
            args: call.args,
            deleteInput: call.deleteInput ?? false,
          });
        } catch (err) {
          jobOk = false;
          usePassRunStore.getState().pushLog(`[error] ${job.label}: ${String(err)}`);
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

  return { interpolated: interpOutputs, deadframes: deadframesOutputs };
}
