import React from "react";
import { FaSearch, FaPlay, FaLayerGroup, FaBolt, FaCog, FaTerminal } from "react-icons/fa";

export type CategoryFilter = "all" | "episodes" | "scenepacks" | "actions" | "settings" | "menu";

export interface CommandItem {
  id: string;
  category: Exclude<CategoryFilter, "all">;
  title: string;
  subtitle?: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  action: () => void;
  preview?: {
    thumbnail?: string | null;
    metaTags?: string[];
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
  prefix: string;
}[] = [
  { id: "all", label: "All", icon: FaSearch, prefix: "" },
  { id: "episodes", label: "Episodes", icon: FaPlay, prefix: "@" },
  { id: "scenepacks", label: "Scenepacks", icon: FaLayerGroup, prefix: "#" },
  { id: "actions", label: "Actions", icon: FaBolt, prefix: ">" },
  { id: "settings", label: "Settings", icon: FaCog, prefix: "?" },
  { id: "menu", label: "System & Menu", icon: FaTerminal, prefix: "/" },
];

// a query prefix picks a category directly, so typing "@" jumps to episodes
export const PREFIX_FILTERS: Record<string, Exclude<CategoryFilter, "all">> = {
  "@": "episodes",
  "#": "scenepacks",
  ">": "actions",
  "?": "settings",
  "/": "menu",
};
