import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { FlowSource } from "../features/sceneScout/types";
import {
  DEFAULT_POST_EXPORT_PASSES,
  UPSCALE_MODEL_OPTIONS,
  type DepthPassConfig,
  type UpscalePassConfig,
} from "../features/export/postPasses";
import { useUIStateStore } from "./UIStore";

/** what a Tools run makes: one or the other, never both */
export type ToolKind = "upscale" | "depth";

export type ToolStatus = "idle" | "preparing" | "running" | "done" | "error" | "stopped";

/** the finished run: the frames the pass read and what it made, played side by side */
export type ToolCompare = {
  original: string;
  processed: string;
};

type UpscaleChoice = Omit<UpscalePassConfig, "enabled">;
type DepthChoice = Omit<DepthPassConfig, "enabled">;

type ToolsState = {
  /** the clip: a whole file, or a range inside a source video (a library scene with no cut file) */
  source: FlowSource | null;
  kind: ToolKind;
  upscale: UpscaleChoice;
  depth: DepthChoice;

  status: ToolStatus;
  percent: number;
  message: string;
  error: string | null;
  /** the generated result, in the app cache until it is exported */
  outputPath: string | null;
  /** where Export saved it; null until then */
  exportedPath: string | null;
  compare: ToolCompare | null;
  /** the newest frame of a run, shown while it renders */
  liveFrame: string | null;
  /** where that frame sits in the clip, 0..1, so the original shows the same one */
  liveAt: number | null;
};

type RunFields = Pick<
  ToolsState,
  "status" | "percent" | "message" | "error" | "outputPath" | "exportedPath" | "compare" | "liveFrame" | "liveAt"
>;

type ToolsStore = ToolsState & {
  setSource: (source: FlowSource | null) => void;
  setKind: (kind: ToolKind) => void;
  setUpscale: (changes: Partial<UpscaleChoice>) => void;
  setDepth: (changes: Partial<DepthChoice>) => void;
  setRun: (changes: Partial<RunFields>) => void;
};

const { enabled: _upscaleEnabled, ...DEFAULT_UPSCALE } = DEFAULT_POST_EXPORT_PASSES.upscale;
const { enabled: _depthEnabled, ...DEFAULT_DEPTH } = DEFAULT_POST_EXPORT_PASSES.depth;

const IDLE_RUN: RunFields = {
  status: "idle",
  percent: 0,
  message: "",
  error: null,
  outputPath: null,
  exportedPath: null,
  compare: null,
  liveFrame: null,
  liveAt: null,
};

export const useToolsStore = create<ToolsStore>()(
  persist(
    (set) => ({
      source: null,
      kind: "upscale",
      upscale: DEFAULT_UPSCALE,
      depth: DEFAULT_DEPTH,
      ...IDLE_RUN,

      // a new clip, kind or setting starts fresh: a result made another way must not be exported as this one
      setSource: (source) => set({ source, ...IDLE_RUN }),
      setKind: (kind) => set({ kind, ...IDLE_RUN }),
      setUpscale: (changes) => set((s) => ({ upscale: { ...s.upscale, ...changes }, ...IDLE_RUN })),
      setDepth: (changes) => set((s) => ({ depth: { ...s.depth, ...changes }, ...IDLE_RUN })),
      setRun: (changes) => set(changes),
    }),
    {
      name: "amverge.tools.v1",
      // the choices are kept, never the clip or a run
      partialize: (s) => ({ kind: s.kind, upscale: s.upscale, depth: s.depth }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ToolsState>;
        const upscale = { ...DEFAULT_UPSCALE, ...(p.upscale ?? {}) };
        // a model since removed from the app falls back to the default
        if (!UPSCALE_MODEL_OPTIONS.some((option) => option.value === upscale.model)) {
          upscale.model = DEFAULT_UPSCALE.model;
        }
        return {
          ...current,
          kind: p.kind === "depth" ? "depth" : "upscale",
          upscale,
          depth: { ...DEFAULT_DEPTH, ...(p.depth ?? {}) },
        };
      },
    }
  )
);

/** opens Tools, with a clip already in it when one is given (the clip's right-click "Open in Tools") */
export function openTools(source?: FlowSource | null): void {
  if (source) useToolsStore.getState().setSource(source);
  useUIStateStore.getState().openTools();
}
