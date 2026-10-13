import { useSceneScoutStore } from "../../../stores/sceneScoutStore";
import { pickFlowClip } from "../../../features/sceneScout/pickFlowClip";
import { FindMatchesIcon } from "../../icons/ToolbarIcons";

/**
 * The Flow tab's part of the first-visit layout: a dashed bar, the same size as
 * the Search tab's search bar, that picks the clip to continue.
 *
 * `blockedHint` says why nothing can be searched yet (no database selected, or
 * an empty one); while it is set the bar stays disabled and shows the hint.
 */
export function FlowHeroClip({ blockedHint }: { blockedHint: string | null }) {
  const startFlowSearch = useSceneScoutStore((s) => s.startFlowSearch);

  const chooseClip = async () => {
    const source = await pickFlowClip();
    if (source) void startFlowSearch(source);
  };

  return (
    <button
      type="button"
      className="scene-scout-flow-hero-input"
      onClick={() => void chooseClip()}
      disabled={Boolean(blockedHint)}
    >
      <FindMatchesIcon />
      <span>{blockedHint ?? "Input a file to find scene matches"}</span>
    </button>
  );
}
