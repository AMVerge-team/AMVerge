import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { useAiDepsStore } from "../../stores/aiDepsStore";
import { usePassRunStore } from "../../stores/passRunStore";
import { AI_PACKS } from "../aiDeps/packs";
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

function buildJobs(outputs: string[], passes: PostExportPasses): Job[] {
  const jobs: Job[] = [];
  for (const out of outputs) {
    const { dir, stem, ext, sep } = splitPath(out);
    const path = (suffix: string) => `${dir}${sep}${stem}${suffix}.${ext}`;

    if (passes.depth.enabled) {
      const output = path(PASS_SUFFIX.depth);
      jobs.push({
        label: `Depth map · ${stem}`,
        calls: [{ pass: "depth", input: out, output, args: depthArgs(passes.depth) }],
      });
    }
    if (passes.deadframes.enabled) {
      const output = path(PASS_SUFFIX.deadframes);
      jobs.push({
        label: `Dead frames · ${stem}`,
        calls: [{ pass: "deadframes", input: out, output, args: deadframesArgs(passes.deadframes) }],
      });
    }
    if (passes.interpolation.enabled) {
      // Interpolation = dead frames first, then interpolate on top. The dead
      // frames intermediate is temporary and deleted after interpolation.
      const tmp = path("_df_tmp");
      const output = path(PASS_SUFFIX.interpolation);
      jobs.push({
        label: `Interpolation · ${stem}`,
        calls: [
          { pass: "deadframes", input: out, output: tmp, args: deadframesArgs(passes.deadframes) },
          { pass: "interpolate", input: tmp, output, args: interpolationArgs(passes.interpolation), deleteInput: true },
        ],
      });
    }
  }
  return jobs;
}

/**
 * Run all enabled post-export passes on the given export output files. Drives
 * the pass-run modal store and forwards CLI progress/preview/log events. Passes
 * run sequentially; stop is honored between and within jobs.
 */
export async function runPostExportPasses(
  outputs: string[],
  passes: PostExportPasses,
): Promise<void> {
  if (outputs.length === 0 || !anyPassEnabled(passes)) return;

  // Depth and interpolation run on the optional AI env. It is normally in place
  // (the settings toggle installs it), but a removed pack or a settings file
  // from another machine would otherwise surface as a failed pass here.
  const effective: PostExportPasses = { ...passes };
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
  if (!anyPassEnabled(effective)) return;

  const jobs = buildJobs(outputs, effective);
  if (jobs.length === 0) return;

  const store = usePassRunStore.getState();
  store.begin(jobs.length);
  // After begin(), which clears the log.
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
}
