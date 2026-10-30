import type { AiPackId } from "./aiDeps/packs";
import { useGeneralSettingsStore, type GeneralSettings } from "../stores/settingsStore";

/** the features switched in Settings > Features; off greys them out (or hides them), AI files are kept */
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
      "Finds scene cuts with AI (TransNetV2), the most accurate way to import.",
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

/** `enabled` works; otherwise `hidden` leaves it out, else it shows greyed out */
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
