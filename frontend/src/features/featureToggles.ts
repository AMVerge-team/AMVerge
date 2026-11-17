import type { AiPackId } from "./aiDeps/packs";
import { useGeneralSettingsStore, type GeneralSettings } from "../stores/settingsStore";
import { t } from "../i18n";

/** the features switched in Settings > Features; off greys them out (or hides them), AI files are kept */
export type FeatureId = "aiSceneDetection" | "sceneScout" | "scenepacks" | "depthPass" | "upscalePass";

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
    | "upscalePassEnabled"
  >;
  /** the ai pack it needs, downloaded when it is switched on */
  pack?: AiPackId;
};

type FeatureSpec = Omit<FeatureDef, "label" | "description">;

// label and description are getters so they translate at read time
function defineFeature(spec: FeatureSpec): FeatureDef {
  return Object.defineProperties({ ...spec }, {
    label: { enumerable: true, get: () => t(`settingsExport:features.items.${spec.id}.label`) },
    description: { enumerable: true, get: () => t(`settingsExport:features.items.${spec.id}.description`) },
  }) as FeatureDef;
}

export const FEATURES: FeatureDef[] = [
  defineFeature({ id: "aiSceneDetection", setting: "aiSceneDetectionEnabled", pack: "ml" }),
  defineFeature({ id: "sceneScout", setting: "sceneScoutEnabled", pack: "scout" }),
  defineFeature({ id: "scenepacks", setting: "scenepacksEnabled" }),
  defineFeature({ id: "depthPass", setting: "depthPassEnabled", pack: "depth" }),
  defineFeature({ id: "upscalePass", setting: "upscalePassEnabled", pack: "upscale" }),
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
