import { useRef } from "react";
import { FaFolderOpen } from "react-icons/fa";

import { useSceneScoutStore } from "../../../stores/sceneScoutStore";
import { setHeroFlip } from "../../../features/sceneScout/heroTransition";
import { pickFlowClip } from "../../../features/sceneScout/pickFlowClip";
import { FlowPlayer } from "./FlowPlayer";

/**
 * The Flow tab's part of the first-visit layout: the empty clip player with
 * Choose clip inside it. Picking a clip records where the player sits, so the
 * top layout slides it up from here (the same hand-off the search bar uses).
 *
 * `blockedHint` says why nothing can be searched yet (no database selected, or
 * an empty one); while it is set the button stays disabled and shows the hint.
 */
export function FlowHeroClip({ blockedHint }: { blockedHint: string | null }) {
  const playerRef = useRef<HTMLDivElement>(null);
  const startFlowSearch = useSceneScoutStore((s) => s.startFlowSearch);

  const chooseClip = async () => {
    const source = await pickFlowClip();
    if (!source) return;
    const rect = playerRef.current?.getBoundingClientRect();
    if (rect) setHeroFlip(rect);
    void startFlowSearch(source);
  };

  const chooseButton = (
    <div className="scene-scout-flow-hero-pick">
      <button
        type="button"
        className="import-button events-action-button"
        onClick={() => void chooseClip()}
        disabled={Boolean(blockedHint)}
      >
        <FaFolderOpen aria-hidden="true" style={{ marginRight: 6 }} />
        Choose clip…
      </button>
      <span>{blockedHint ?? "Pick the clip you are cutting from"}</span>
    </div>
  );

  return (
    <div ref={playerRef} className="scene-scout-flow-input">
      <FlowPlayer source={null} empty={chooseButton} />
    </div>
  );
}
