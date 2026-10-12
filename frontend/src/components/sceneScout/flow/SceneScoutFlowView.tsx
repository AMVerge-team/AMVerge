import { useMemo, useRef, useState } from "react";
import { FaArrowRight, FaPlay } from "react-icons/fa";

import ClipsContainer from "../../clipsGrid/ClipsContainer";
import Tooltip from "../../common/Tooltip";
import { useAppStateStore } from "../../../stores/appStore";
import { useSceneScoutStore } from "../../../stores/sceneScoutStore";
import { flowSourceForClip } from "../../../features/sceneScout/motion";
import { FlowPlayer } from "./FlowPlayer";

/** how much of the input clip's ending Preview cut plays before handing over */
const CUT_LEAD_SECONDS = 1.5;

/**
 * The Flow tab: the clip being continued on the left, the result being
 * previewed on the right, and every scene that continues it underneath.
 * Clicking a tile previews it; Preview cut plays the end of the left clip
 * straight into the start of the right one, which is the edit being judged.
 */
export function SceneScoutFlowView() {
  const flowFrom = useSceneScoutStore((s) => s.flowFrom);
  const flowTags = useSceneScoutStore((s) => s.flowTags);
  const flowMeasuring = useSceneScoutStore((s) => s.flowMeasuring);
  const startFlowSearch = useSceneScoutStore((s) => s.startFlowSearch);

  const clips = useAppStateStore((s) => s.clips);
  const focusedClipId = useAppStateStore((s) => s.focusedClipId);
  const focused = useMemo(
    () => (focusedClipId ? clips.find((c) => c.id === focusedClipId) ?? null : null),
    [clips, focusedClipId]
  );
  const previewSource = useMemo(() => (focused ? flowSourceForClip(focused) : null), [focused]);

  const leftRef = useRef<HTMLVideoElement>(null);
  const rightRef = useRef<HTMLVideoElement>(null);
  const [cutting, setCutting] = useState(false);
  const handedOff = useRef(false);

  const handOff = () => {
    if (handedOff.current) return;
    handedOff.current = true;
    leftRef.current?.pause();
    const right = rightRef.current;
    if (right) {
      right.currentTime = 0;
      void right.play();
    }
    setCutting(false);
  };

  const previewCut = () => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right || !Number.isFinite(left.duration)) return;
    handedOff.current = false;
    setCutting(true);
    right.pause();
    right.currentTime = 0;
    left.currentTime = Math.max(0, left.duration - CUT_LEAD_SECONDS);
    void left.play();
  };

  const canCut = Boolean(flowFrom && previewSource);

  return (
    <div className="scene-scout-flow-view">
      <div className="scene-scout-flow-players">
        <FlowPlayer
          ref={leftRef}
          role="Your clip"
          source={flowFrom}
          tagsLabel="ends"
          tags={flowTags?.end ?? null}
          tagsNote={flowMeasuring ? "reading motion…" : undefined}
          loop={!cutting}
          empty="Choose a clip, or select one on Home and click Find flowing clips."
          onEnded={() => cutting && handOff()}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (cutting && Number.isFinite(v.duration) && v.currentTime >= v.duration - 0.06) handOff();
          }}
        />

        <div className="scene-scout-flow-actions">
          <Tooltip content={canCut ? "Play the end of your clip straight into the previewed scene" : "Click a result to preview it first"}>
            <span>
              <button type="button" className="buttons scene-scout-flow-cut" onClick={previewCut} disabled={!canCut}>
                <FaPlay aria-hidden="true" />
                Preview cut
              </button>
            </span>
          </Tooltip>
          <Tooltip content={previewSource ? "Make the previewed scene your clip and find what flows from it" : "Click a result to preview it first"}>
            <span>
              <button
                type="button"
                className="buttons scene-scout-flow-chain"
                onClick={() => previewSource && void startFlowSearch(previewSource)}
                disabled={!previewSource}
              >
                Continue from this
                <FaArrowRight aria-hidden="true" />
              </button>
            </span>
          </Tooltip>
        </div>

        <FlowPlayer
          ref={rightRef}
          role="Preview"
          source={previewSource}
          tagsLabel="starts"
          tags={focused?.motion?.start ?? null}
          loop={!cutting}
          empty={flowFrom ? "Click a result below to preview it here." : "Results show up below once you pick a clip."}
        />
      </div>

      <div className="scene-scout-flow-grid">
        <ClipsContainer />
      </div>
    </div>
  );
}
