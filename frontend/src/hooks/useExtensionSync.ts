import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

import { EpisodeEntry } from "../types/domain";
import { useEpisodePanelRuntimeStore } from "../stores/episodeStore";
import {
  useThemeSettingsStore,
} from "../stores/settingsStore";
import { fileNameFromPath } from "../utils/episodeUtils";

const POLL_INTERVAL_MS = 3000;
const THEME_LAST_APPLIED_KEY = "amverge_extension_theme_last_applied";
const EPISODES_HYDRATED_KEY = "amverge_extension_episodes_hydrated";

function parseExtensionTheme(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.source !== "extension") return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseClipsFromManifest(manifest: any, episodeId: string) {
  const raw = Array.isArray(manifest?.initialClips)
    ? manifest.initialClips
    : Array.isArray(manifest?.scenes)
      ? manifest.scenes
      : [];

  return raw.map((s: any, index: number) => ({
    id: `${episodeId}_${typeof s?.scene_index === "number" ? s.scene_index : index}`,
    src: s.path ?? s.clip_path ?? "",
    thumbnail: s.thumbnail ?? s.path ?? "",
    thumbnailReady: s.thumbnail_ready !== false,
    originalName: s.original_file,
    originalPath: s.original_path,
    sceneIndex: typeof s.scene_index === "number" ? s.scene_index : undefined,
    startSec: typeof s.start_sec === "number" ? s.start_sec : undefined,
    endSec: typeof s.end_sec === "number" ? s.end_sec : undefined,
    clipPath: typeof s.clip_path === "string" ? s.clip_path : undefined,
    clipMode: typeof s.clip_mode === "string" && s.clip_mode ? s.clip_mode : undefined,
  }));
}

export default function useExtensionSync() {
  const appliedThemeUnixRef = useRef<number>(
    Number(window.localStorage.getItem(THEME_LAST_APPLIED_KEY)) || 0
  );
  const hydratedRef = useRef<Set<string>>(
    new Set(
      JSON.parse(window.localStorage.getItem(EPISODES_HYDRATED_KEY) || "[]") as string[]
    )
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const syncTheme = async () => {
      try {
        const raw = await invoke<string | null>("read_extension_sync_theme");
        if (!raw) return;

        const theme = parseExtensionTheme(raw);
        if (!theme) return;

        const updatedAt = Number(theme.updatedAtUnix) || 0;
        if (updatedAt <= appliedThemeUnixRef.current) return;

        const patch: Record<string, unknown> = {};
        if (typeof theme.accentColor === "string" && theme.accentColor) {
          patch.accentColor = theme.accentColor;
        }
        if (typeof theme.backgroundGradientColor === "string" && theme.backgroundGradientColor) {
          patch.backgroundGradientColor = theme.backgroundGradientColor;
        }
        if (typeof theme.backgroundImagePath === "string") {
          patch.backgroundImagePath = theme.backgroundImagePath;
        }
        if (typeof theme.backgroundOpacity === "number") {
          patch.backgroundOpacity = theme.backgroundOpacity;
        }
        if (typeof theme.backgroundBlur === "number") {
          patch.backgroundBlur = theme.backgroundBlur;
        }
        if (typeof theme.gridPreviewSpeed === "number") {
          patch.gridPreviewSpeed = theme.gridPreviewSpeed;
        }
        if (typeof theme.showClipTimestamps === "boolean") {
          patch.showClipTimestamps = theme.showClipTimestamps;
        }

        const patchKeys = Object.keys(patch);
        if (patchKeys.length > 0) {
          useThemeSettingsStore.setState((prev) => ({ ...prev, ...patch }));
          appliedThemeUnixRef.current = updatedAt;
          window.localStorage.setItem(THEME_LAST_APPLIED_KEY, String(updatedAt));
          console.info("[extension-sync] theme applied from extension", patch);
        }
      } catch (err) {
        console.warn("[extension-sync] theme sync failed", err);
      }
    };

    const syncEpisodes = async () => {
      try {
        const manifests = await invoke<string[]>("list_extension_sync_episodes");
        const runtime = useEpisodePanelRuntimeStore.getState();

        for (const raw of manifests) {
          let manifest: any;
          try {
            manifest = JSON.parse(raw);
          } catch {
            continue;
          }
          const id = manifest?.source?.episodeCacheId;
          if (!id || hydratedRef.current.has(id)) continue;

          const clips = parseClipsFromManifest(manifest, id);
          if (clips.length === 0) continue;

          const videoPath =
            typeof manifest?.source?.videoPath === "string"
              ? manifest.source.videoPath
              : clips[0]?.originalPath || "";
          const entry: EpisodeEntry = {
            id,
            displayName: clips[0]?.originalName || fileNameFromPath(videoPath) || id,
            videoPath,
            folderId: null,
            importedAt: Number(manifest?.createdAtUnix) * 1000 || Date.now(),
            clips,
            importMethod: "video_files",
          };
          runtime.setEpisodes((prev) => [entry, ...prev.filter((ep) => ep.id !== id)]);
          hydratedRef.current.add(id);
          window.localStorage.setItem(
            EPISODES_HYDRATED_KEY,
            JSON.stringify([...hydratedRef.current])
          );
          console.info("[extension-sync] episode hydrated from extension", id);
        }
      } catch (err) {
        console.warn("[extension-sync] episode sync failed", err);
      }
    };

    const tick = async () => {
      if (cancelled) return;
      await Promise.allSettled([syncTheme(), syncEpisodes()]);
      if (!cancelled) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);
}