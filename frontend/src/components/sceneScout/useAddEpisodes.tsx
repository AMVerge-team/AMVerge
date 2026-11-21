import { useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FaCheck, FaVideo } from '../icons/animated';

import ModalShell from "../common/ModalShell";
import { ImportIcon } from "../icons/ToolbarIcons";
import { samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { isPackInstalled } from "../../features/aiDeps/packs";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { useGeneralSettingsStore, type SceneDetectionMethod } from "../../stores/settingsStore";
import { sceneDetectionOptions } from "../settings/general/options";
import { episodeSceneRanges, precutEpisodes, type SceneRange } from "../../features/sceneScout/precutEpisodes";
import { VIDEO_EXTENSIONS } from "../../utils/videoExtensions";


type IndexDetection = "transnetv2_gpu" | "keyframe_detection" | "single_scene";

/** Add Episode: reuse a home episode's scenes, or pick a full video and choose detection; no home episodes skips to the picker */
export function useAddEpisodes() {
  const addVideos = useSceneScoutStore((s) => s.addVideos);
  const lastIndexDetection = useSceneScoutStore((s) => s.settings.lastIndexDetection);
  const fallbackDetection = useGeneralSettingsStore((s) => s.sceneDetectionMethod);
  const aiSceneDetectionEnabled = useGeneralSettingsStore((s) => s.aiSceneDetectionEnabled);
  const aiStatus = useAiDepsStore((s) => s.status);
  const mlInstalled = isPackInstalled(aiStatus, "ml");
  const aiAvailable = aiSceneDetectionEnabled && mlInstalled;
  const homeEpisodes = useEpisodePanelRuntimeStore((s) => s.episodes);
  const targetDatabase = useSceneScoutStore((s) => s.openedDatabase || s.selectedDatabases[0] || null);
  const targetName = useSceneScoutStore((s) =>
    targetDatabase
      ? s.displayNames[targetDatabase] ?? s.databases.find((d) => samePath(d.path, targetDatabase))?.name ?? null
      : null
  );
  const indexedVideos =useSceneScoutStore((s) => (targetDatabase ? s.videosByDatabase[targetDatabase] : undefined));

  const [choosing, setChoosing] = useState(false);
  const [sourceTab, setSourceTab] = useState<"computer" | "library">("computer");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // the episode a shift-click ranges from
  const anchorRef = useRef<string | null>(null);
  const [pending, setPending] = useState<string[] | null>(null);
  const [method, setMethod] = useState<IndexDetection>("transnetv2_gpu");
  const [error, setError] = useState("");

  const offered = useMemo(() => precutEpisodes(homeEpisodes), [homeEpisodes]);
  const alreadyIndexed = (videoPath: string) => (indexedVideos ?? []).some((v) => samePath(v.filepath, videoPath));

  const startAddEpisodes = async () => {
    setError("");
    if (offered.length > 0) {
      setPicked(new Set());
      anchorRef.current = null;
      setChoosing(true);
      return;
    }
    await pickFullEpisodes();
  };

  // right side: a video file from disk, scenes detected the way the user picks next
  const pickFullEpisodes = async () => {
    setChoosing(false);
    const files = await open({
      multiple: true,
      filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
    });
    if (!files) return;
    const paths = Array.isArray(files) ? (files as string[]) : [files as string];
    if (paths.length === 0) return;
    // ai detection switched off in Settings > Features: keyframes is the only choice
    const preferred = (lastIndexDetection ?? fallbackDetection) as IndexDetection;
    setMethod(aiSceneDetectionEnabled ? preferred : "keyframe_detection");
    setPending(paths);
  };

  // left side: home episodes, indexed on the scenes they were already cut into
  const addPrecut = async () => {
    const chosen = offered.filter((episode) => picked.has(episode.id));
    if (chosen.length === 0) return;
    setChoosing(false);
    const scenesByVideo: Record<string, SceneRange[]> = {};
    for (const episode of chosen) scenesByVideo[episode.videoPath] = episodeSceneRanges(episode);
    const result = await addVideos(Object.keys(scenesByVideo), undefined, scenesByVideo);
    if (!result.ok && result.message) setError(result.message);
  };

  const confirm = async () => {
    if (!pending) return;
    // ai detection needs its pack; a declined install keeps the popup open to pick keyframes instead
    if (method === "transnetv2_gpu" && !(await useAiDepsStore.getState().ensurePack("ml"))) return;
    const paths = pending;
    setPending(null);
    const result = await addVideos(paths, method);
    if (!result.ok && result.message) setError(result.message);
  };

  // a click toggles one episode; shift-click picks every episode from the last clicked one to this one
  const pickEpisode = (id: string, shift: boolean) => {
    const anchor = anchorRef.current;
    anchorRef.current = id;
    setPicked((prev) => {
      const next = new Set(prev);
      const from = anchor ? offered.findIndex((e) => e.id === anchor) : -1;
      const to = offered.findIndex((e) => e.id === id);
      if (shift && from >= 0 && to >= 0) {
        for (const episode of offered.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(episode.id);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chooser = choosing ? (
    <ModalShell open onClose={() => setChoosing(false)} label="Add videos" className="scout-add-modal">
      <div className="scout-add">
        <h2 className="scout-add-title">{targetName ? `Add videos to ${targetName}` : "Add videos"}</h2>

        <div className="scene-scout-mode-tabs" role="tablist" aria-label="Video source" style={{ marginBottom: 14, alignSelf: "flex-start" }}>
          <button
            type="button"
            role="tab"
            aria-selected={sourceTab === "computer"}
            className={`scene-scout-mode-tab${sourceTab === "computer" ? " is-active" : ""}`}
            onClick={() => setSourceTab("computer")}
          >
            From your computer
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sourceTab === "library"}
            className={`scene-scout-mode-tab${sourceTab === "library" ? " is-active" : ""}`}
            onClick={() => setSourceTab("library")}
          >
            From Library ({offered.length})
          </button>
        </div>

        {sourceTab === "computer" ? (
          <section className="scout-add-column scout-add-full" style={{ width: "100%", padding: "20px 12px" }}>
            <h3>Choose episodes or pre-cut clips</h3>
            <p className="events-subtitle" style={{ fontSize: 12, margin: "0 0 12px", opacity: 0.7 }}>
              Pick full anime episodes or already-cut clip files (e.g. flow clips / scenepacks).
            </p>
            <button type="button" className="event-host-btn scout-add-pick" onClick={() => void pickFullEpisodes()}>
              <ImportIcon />
              Choose video files…
            </button>
          </section>
        ) : (
          <section className="scout-add-column" style={{ width: "100%" }}>
            <h3>Pick episodes already in your Library</h3>
            <p className="events-subtitle" style={{ fontSize: 12, margin: "0 0 8px", opacity: 0.7 }}>
              Reuses your existing scene cuts — skips scene detection.
            </p>
            <div className="scout-add-list" role="listbox" aria-multiselectable="true" aria-label="Library episodes">
              {offered.map((episode) => {
                const isPicked = picked.has(episode.id);
                const sceneCount = episodeSceneRanges(episode).length;
                return (
                  <button
                    key={episode.id}
                    type="button"
                    role="option"
                    aria-selected={isPicked}
                    className={`scout-add-row${isPicked ? " is-picked" : ""}`}
                    onClick={(e) => pickEpisode(episode.id, e.shiftKey)}
                    onMouseDown={(e) => {
                      // shift-click would otherwise select the list's text
                      if (e.shiftKey) e.preventDefault();
                    }}
                    title={episode.videoPath}
                  >
                    <span className="scout-add-check" aria-hidden="true">{isPicked && <FaCheck />}</span>
                    <span className="scout-add-name">{episode.displayName}</span>
                    <span className="scout-add-meta">
                      {alreadyIndexed(episode.videoPath) ? "in collection · " : ""}
                      {sceneCount} scenes
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="event-host-btn scout-add-go"
              onClick={() => void addPrecut()}
              disabled={picked.size === 0}
            >
              {picked.size > 1 ? `Add ${picked.size} episodes` : "Add to collection"}
            </button>
          </section>
        )}
      </div>
    </ModalShell>
  ) : null;

  const count = pending?.length ?? 0;
  const detectionModal = pending ? (
    <ModalShell open onClose={() => setPending(null)} label="Add videos" className="scene-scout-index-modal">
      <div className="denial-notice">
        <FaVideo aria-hidden="true" className="denial-notice-icon" />
        <h2>{count > 1 ? `Add ${count} videos` : "Add video"}</h2>
        <p className="events-subtitle ban-notice-note">How should AMVerge split scenes before scanning?</p>

        <div className="scene-scout-detection-choices" role="radiogroup" aria-label="Scene detection">
          {sceneDetectionOptions(aiAvailable).map((option) => {
            const active = option.value === method;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={`scene-scout-detection-choice${active ? " is-active" : ""}${option.muted ? " is-muted" : ""}`}
                onClick={async () => {
                  if (option.value === "transnetv2_gpu" && !aiAvailable) {
                    if (!mlInstalled) {
                      const installed = await useAiDepsStore.getState().ensurePack("ml");
                      if (!installed) return;
                    }
                    useGeneralSettingsStore.setState({ aiSceneDetectionEnabled: true });
                  }
                  setMethod(option.value as SceneDetectionMethod as IndexDetection);
                }}
                onDoubleClick={() => void confirm()}
              >
                <span className="scene-scout-detection-choice-label">{option.label}</span>
                <span className="scene-scout-detection-choice-desc">{option.description}</span>
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={method === "single_scene"}
            className={`scene-scout-detection-choice${method === "single_scene" ? " is-active" : ""}`}
            onClick={() => setMethod("single_scene")}
            onDoubleClick={() => void confirm()}
          >
            <span className="scene-scout-detection-choice-label">Already cut clips (Skip detection)</span>
            <span className="scene-scout-detection-choice-desc">
              Each file is already a single clip (e.g. flow clips or a scenepack folder). Skips scene detection and indexes 1 scene per file.
            </span>
          </button>
        </div>

        <div className="denial-notice-actions">
          <button
            type="button"
            className="event-host-btn"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
            onClick={() => setPending(null)}
          >
            Cancel
          </button>
          <button type="button" className="event-host-btn" onClick={() => void confirm()}>
            Add to collection
          </button>
        </div>
      </div>
    </ModalShell>
  ) : null;

  return {
    startAddEpisodes,
    modal: (
      <>
        {chooser}
        {detectionModal}
      </>
    ),
    error,
  };
}
