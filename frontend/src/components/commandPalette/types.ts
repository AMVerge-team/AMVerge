import React from "react";
import { FaSearch, FaPlay, FaLayerGroup, FaBolt, FaCog, FaTerminal, FaSearchPlus } from "react-icons/fa";
import type { FeatureId } from "../../features/featureToggles";

export type CategoryFilter = "all" | "episodes" | "scenepacks" | "sceneScout" | "actions" | "settings" | "menu";

export interface CommandItem {
  id: string;
  category: Exclude<CategoryFilter, "all">;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  action: () => void;
  /** the feature it belongs to: greyed out while off, left out when disabled features are hidden */
  feature?: FeatureId;
  /** set by buildCommands when its feature is off */
  disabled?: boolean;
  preview?: {
    thumbnail?: string | null;
    metaLine1?: string;
    metaLine2?: string;
    filePath?: string;
    shortcut?: string;
    description?: string;
  };
}

export const CATEGORY_CHIPS: {
  id: CategoryFilter;
  label: string;
  icon: any;
  feature?: FeatureId;
}[] = [
  { id: "all", label: "All", icon: FaSearch },
  { id: "episodes", label: "Episodes", icon: FaPlay },
  { id: "scenepacks", label: "Scenepacks", icon: FaLayerGroup, feature: "scenepacks" },
  { id: "sceneScout", label: "Scene Scout", icon: FaSearchPlus, feature: "sceneScout" },
  { id: "actions", label: "Actions", icon: FaBolt },
  { id: "settings", label: "Settings", icon: FaCog },
  { id: "menu", label: "System & Menu", icon: FaTerminal },
];

// a query prefix picks a category directly, so typing "@" jumps to episodes
export const PREFIX_FILTERS: Record<string, Exclude<CategoryFilter, "all">> = {
  "@": "episodes",
  "#": "scenepacks",
  "!": "sceneScout",
  ">": "actions",
  "?": "settings",
  "/": "menu",
};
