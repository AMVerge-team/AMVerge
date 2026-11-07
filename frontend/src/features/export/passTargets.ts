import { create } from "zustand";

import type { ClipItem } from "../../types/domain";
import { isFeatureEnabled } from "../featureToggles";
import type { PostExportPassKind, PostExportPasses } from "./postPasses";

// which selected clips get each post-export pass; asked in PassTargetsModal before an export starts

export type PassTargetKind = PostExportPassKind;

/** clip ids picked for each pass; a pass that won't run has none */
export type PassClipPicks = Record<PassTargetKind, Set<string>>;

/** the passes that will run: switched on in Settings > Features and in the pass's own toggle */
export function activePassKinds(passes: PostExportPasses): PassTargetKind[] {
  const kinds: PassTargetKind[] = [];
  if (passes.depth.enabled && isFeatureEnabled("depthPass")) kinds.push("depth");
  if (passes.upscale.enabled && isFeatureEnabled("upscalePass")) kinds.push("upscale");
  return kinds;
}

type Request = {
  clips: ClipItem[];
  kinds: PassTargetKind[];
  mergeEnabled: boolean;
  resolve: (picks: PassClipPicks | null) => void;
};

export const usePassTargetsStore = create<{ request: Request | null }>(() => ({ request: null }));

function picksFor(clips: ClipItem[], kinds: PassTargetKind[]): PassClipPicks {
  const all = () => new Set(clips.map((c) => c.id));
  return {
    depth: kinds.includes("depth") ? all() : new Set(),
    upscale: kinds.includes("upscale") ? all() : new Set(),
  };
}

/** null when the user cancels the export; one clip or no active pass skips the question */
export function pickPassTargets(
  clips: ClipItem[],
  passes: PostExportPasses,
  mergeEnabled: boolean,
): Promise<PassClipPicks | null> {
  const kinds = activePassKinds(passes);
  if (kinds.length === 0 || clips.length < 2) return Promise.resolve(picksFor(clips, kinds));
  // a second export while the picker is open is dropped
  if (usePassTargetsStore.getState().request) return Promise.resolve(null);
  return new Promise((resolve) => {
    usePassTargetsStore.setState({ request: { clips, kinds, mergeEnabled, resolve } });
  });
}
