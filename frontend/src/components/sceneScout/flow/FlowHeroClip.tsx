import { useSceneScoutStore } from "../../../stores/sceneScoutStore";
import { pickFlowClip } from "../../../features/sceneScout/pickFlowClip";
import { FindMatchesIcon } from "../../icons/ToolbarIcons";

/** the Flow tab's first-visit clip picker; `blockedHint` disables it and says why nothing can be searched yet */
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
