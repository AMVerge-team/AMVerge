import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FaVideo } from "react-icons/fa";

import ModalShell from "../common/ModalShell";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";
import { useGeneralSettingsStore, type SceneDetectionMethod } from "../../stores/settingsStore";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import { SCENE_DETECTION_OPTIONS } from "../settings/general/options";

const VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "avi"];

type IndexDetection = "transnetv2_gpu" | "keyframe_detection";

/**
 * Add Episode: pick one or more files, then choose how scenes are split before
 * they are indexed. the choice is asked every time and defaults to the last one used
 */
export function useAddEpisodes() {
  const addVideos = useSceneScoutStore((s) => s.addVideos);
  const lastIndexDetection = useSceneScoutStore((s) => s.settings.lastIndexDetection);
  const fallbackDetection = useGeneralSettingsStore((s) => s.sceneDetectionMethod);

  const [pending, setPending] = useState<string[] | null>(null);
  const [method, setMethod] = useState<IndexDetection>("transnetv2_gpu");
  const [error, setError] = useState("");

  const startAddEpisodes = async () => {
    setError("");
    const picked = await open({
      multiple: true,
      filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
    });
    if (!picked) return;
    const paths = Array.isArray(picked) ? (picked as string[]) : [picked as string];
    if (paths.length === 0) return;
    setMethod((lastIndexDetection ?? fallbackDetection) as IndexDetection);
    setPending(paths);
  };

  const confirm = async () => {
    if (!pending) return;
    // ai detection needs its pack; a declined install keeps the popup open to pick keyframes instead
    if (method === "transnetv2_gpu" && !(await useAiDepsStore.getState().ensurePack("ml"))) return;
    const paths = pending;
    setPending(null);
    const result = await addVideos(paths, method);
    if (!result.ok) setError(result.message || "Could not index episode(s).");
  };

  const count = pending?.length ?? 0;
  const modal = pending ? (
    <ModalShell open onClose={() => setPending(null)} label="Index episodes" className="scene-scout-index-modal">
      <div className="denial-notice">
        <FaVideo aria-hidden="true" className="denial-notice-icon" />
        <h2>{count > 1 ? `Index ${count} episodes` : "Index episode"}</h2>
        <p className="events-subtitle ban-notice-note">How should scenes be found before indexing?</p>

        <div className="scene-scout-detection-choices" role="radiogroup" aria-label="Scene detection">
          {SCENE_DETECTION_OPTIONS.map((option) => {
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

  return { startAddEpisodes, modal, error };
}
