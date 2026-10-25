import type { AiPackId } from "./aiDeps/packs";
import { useGeneralSettingsStore, type GeneralSettings } from "../stores/settingsStore";

/**
 * the major features a user can switch on and off in Settings > Features.
 *
 * a switched-off feature is greyed out and unclickable wherever it appears, or
 * removed from the ui entirely when "Hide disabled features" is on. switching an
 * ai feature on downloads its pack; switching it off keeps the files, so turning
 * it back on is instant
 */
export type FeatureId = "aiSceneDetection" | "sceneScout" | "scenepacks" | "depthPass" | "interpolationPass";

type FeatureDef = {
  id: FeatureId;
  label: string;
  description: string;
  /** the persisted switch */
  setting: keyof Pick<
    GeneralSettings,
    | "aiSceneDetectionEnabled"
    | "sceneScoutEnabled"
    | "scenepacksEnabled"
    | "depthPassEnabled"
    | "interpolationPassEnabled"
  >;
  /** the ai pack it needs, downloaded when it is switched on */
  pack?: AiPackId;
};

export const FEATURES: FeatureDef[] = [
  {
    id: "aiSceneDetection",
    label: "AI Scene Detection",
    description:
      "Finds scene cuts with AI (TransNetV2), the most accurate way to import. On a supported NVIDIA GPU it also decodes video on the GPU.",
    setting: "aiSceneDetectionEnabled",
    pack: "ml",
  },
  {
    id: "sceneScout",
    label: "Scene Scout",
    description: "Search your episodes by describing a scene, and find clips that flow into each other.",
    setting: "sceneScoutEnabled",
    pack: "scout",
  },
  {
    id: "scenepacks",
    label: "Scenepacks",
    description: "Group clips into themed collections.",
    setting: "scenepacksEnabled",
  },
  {
    id: "depthPass",
    label: "Depth Map Pass",
    description: "Creates a depth map of each exported file.",
    setting: "depthPassEnabled",
    pack: "depth",
  },
  {
    id: "interpolationPass",
    label: "Interpolation Pass",
    description: "Smooths motion by adding frames to each exported file.",
    setting: "interpolationPassEnabled",
    pack: "interpolation",
  },
];

export function featureDef(id: FeatureId): FeatureDef {
  return FEATURES.find((feature) => feature.id === id)!;
}

/**
 * how a feature shows up: `enabled` it works; otherwise `hidden` means leave it out
 * of the ui, and not hidden means show it greyed out and unclickable
 */
export function useFeature(id: FeatureId): { enabled: boolean; hidden: boolean } {
  const setting = featureDef(id).setting;
  const enabled = useGeneralSettingsStore((s) => s[setting]);
  const hideDisabled = useGeneralSettingsStore((s) => s.hideDisabledFeatures);
  return { enabled, hidden: !enabled && hideDisabled };
}

/** non-hook read, for code outside components (import pipeline, post-export passes) */
export function isFeatureEnabled(id: FeatureId): boolean {
  return useGeneralSettingsStore.getState()[featureDef(id).setting];
}
