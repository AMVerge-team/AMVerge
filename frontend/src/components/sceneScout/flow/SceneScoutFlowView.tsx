import ClipsContainer from "../../clipsGrid/ClipsContainer";
import { useSceneScoutStore } from "../../../stores/sceneScoutStore";
import { FlowPlayer } from "./FlowPlayer";

/**
 * The Flow tab: the clip being cut from on top, every scene that could follow
 * it underneath. Clicking a result plays it in the regular preview pane, which
 * also exports it, exactly as on the Search tab.
 */
export function SceneScoutFlowView() {
  const flowFrom = useSceneScoutStore((s) => s.flowFrom);

  return (
    <div className="scene-scout-view">
      <div className="scene-scout-flow-input">
        <FlowPlayer source={flowFrom} empty="Choose a clip, or select one on Home and click Find flowing clips." />
      </div>

      <div className="scene-scout-view-grid">
        <ClipsContainer />
      </div>
    </div>
  );
}
