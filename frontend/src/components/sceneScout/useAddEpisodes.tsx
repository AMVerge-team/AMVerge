import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FaCheck, FaVideo } from "react-icons/fa";

import ModalShell from "../common/ModalShell";
import { ImportIcon } from "../icons/ToolbarIcons";
import { samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { useGeneralSettingsStore, type SceneDetectionMethod } from "../../stores/settingsStore";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { sceneDetectionOptions } from "../settings/general/options";
import { episodeSceneRanges, precutEpisodes, type SceneRange } from "../../features/sceneScout/precutEpisodes";

const VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "avi"];

type IndexDetection = "transnetv2_gpu" | "keyframe_detection";

/**
 * Add Episode, in two ways. The first popup offers both: episodes already imported
 * on home (left), whose scenes are reused so detection is skipped, or a full video
 * file (right), which then asks how scenes should be found, defaulting to the last
 * choice. With no home episodes to offer it goes straight to the file picker.
 */
export function useAddEpisodes() {
  const addVideos = useSceneScoutStore((s) => s.addVideos);
  const lastIndexDetection = useSceneScoutStore((s) => s.settings.lastIndexDetection);
  const fallbackDetection = useGeneralSettingsStore((s) => s.sceneDetectionMethod);
  const aiSceneDetectionEnabled = useGeneralSettingsStore((s) => s.aiSceneDetectionEnabled);
  const homeEpisodes = useEpisodePanelRuntimeStore((s) => s.episodes);
  const targetDatabase = useSceneScoutStore((s) => s.openedDatabase || s.selectedDatabases[0] || null);
  const indexedVideos = useSceneScoutStore((s) => (targetDatabase ? s.videosByDatabase[targetDatabase] : undefined));

  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string[] | null>(null);
  const [method, setMethod] = useState<IndexDetection>("transnetv2_gpu");
  const [error, setError] = useState("");

  const offered = useMemo(() => precutEpisodes(homeEpisodes), [homeEpisodes]);
  const alreadyIndexed = (videoPath: string) => (indexedVideos ?? []).some((v) => samePath(v.filepath, videoPath));

  const startAddEpisodes = async () => {
    setError("");
    if (offered.length > 0) {
      setPicked(new Set());
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

  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chooser = choosing ? (
    <ModalShell open onClose={() => setChoosing(false)} label="Add episodes" className="scout-add-modal">
      <div className="scout-add">
        <h2 className="scout-add-title">Add episodes</h2>

        <div className="scout-add-columns">
          <section className="scout-add-column">
            <h3>Import a pre-cut episode</h3>
            <p className="scout-add-hint">
              Episodes already in your Library. Their scenes are reused, so scene detection is skipped.
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
                    onClick={() => togglePicked(episode.id)}
                    title={episode.videoPath}
                  >
                    <span className="scout-add-check" aria-hidden="true">{isPicked && <FaCheck />}</span>
                    <span className="scout-add-name">{episode.displayName}</span>
                    <span className="scout-add-meta">
                      {alreadyIndexed(episode.videoPath) ? "in database · " : ""}
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
              {picked.size > 1 ? `Add ${picked.size} episodes` : "Add episode"}
            </button>
          </section>

          <div className="scout-add-divider" aria-hidden="true" />

          <section className="scout-add-column scout-add-full">
            <h3>Import a full episode</h3>
            <p className="scout-add-hint">
              Pick a video file from your computer. Its scenes are detected before indexing.
            </p>
            <button type="button" className="event-host-btn scout-add-pick" onClick={() => void pickFullEpisodes()}>
              <ImportIcon />
              Choose video…
            </button>
          </section>
        </div>
      </div>
    </ModalShell>
  ) : null;

  const count = pending?.length ?? 0;
  const detectionModal = pending ? (
    <ModalShell open onClose={() => setPending(null)} label="Index episodes" className="scene-scout-index-modal">
      <div className="denial-notice">
        <FaVideo aria-hidden="true" className="denial-notice-icon" />
        <h2>{count > 1 ? `Index ${count} episodes` : "Index episode"}</h2>
        <p className="events-subtitle ban-notice-note">How should scenes be found before indexing?</p>

        <div className="scene-scout-detection-choices" role="radiogroup" aria-label="Scene detection">
          {sceneDetectionOptions(aiSceneDetectionEnabled).map((option) => {
            const active = option.value === method;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={`scene-scout-detection-choice${active ? " is-active" : ""}`}
                onClick={() => setMethod(option.value as SceneDetectionMethod as IndexDetection)}
                onDoubleClick={() => void confirm()}
              >
                <span className="scene-scout-detection-choice-label">{option.label}</span>
                <span className="scene-scout-detection-choice-desc">{option.description}</span>
              </button>
            );
          })}
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
            Index
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
