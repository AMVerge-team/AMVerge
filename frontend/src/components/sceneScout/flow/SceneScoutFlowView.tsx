import { useRef } from "react";
import type { PointerEvent } from "react";

import ClipsContainer from "../../clipsGrid/ClipsContainer";
import Tooltip from "../../common/Tooltip";
import { ImportIcon } from "../../icons/ToolbarIcons";
import { pickFlowClip } from "../../../features/sceneScout/pickFlowClip";
import { useSceneScoutStore } from "../../../stores/sceneScoutStore";
import { useUIStateStore } from "../../../stores/UIStore";
import { FlowPlayer } from "./FlowPlayer";

/** the clip and the grid each keep at least this much height while dragging the bar */
const MIN_PLAYER_PX = 120;
const MIN_GRID_PX = 160;

/** the Flow tab: the inputted clip on top, the scenes that could follow it below, a draggable bar between */
export function SceneScoutFlowView() {
  const flowFrom = useSceneScoutStore((s) => s.flowFrom);
  const noDatabase = useSceneScoutStore((s) => s.selectedDatabases.length === 0);
  const startFlowSearch = useSceneScoutStore((s) => s.startFlowSearch);
  const playerHeight = useUIStateStore((s) => s.flowPlayerHeightPx);
  const setPlayerHeight = useUIStateStore((s) => s.setFlowPlayerHeightPx);
  const viewRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  // past this height the video is already full width, so more would only add empty space
  const fullVideoHeight = (input: HTMLDivElement) => {
    const style = getComputedStyle(input);
    const innerWidth = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const box = input.querySelector(".scene-scout-flow-player-box");
    const frame = input.querySelector(".scene-scout-flow-player-frame");
    const labelBlock = box && frame ? frame.getBoundingClientRect().top - box.getBoundingClientRect().top : 0;
    return parseFloat(style.paddingTop) + labelBlock + (innerWidth * 9) / 16;
  };

  const pickClip = async () => {
    const source = await pickFlowClip();
    if (source) void startFlowSearch(source);
  };

  const startResize = (e: PointerEvent<HTMLDivElement>) => {
    const view = viewRef.current;
    const input = inputRef.current;
    if (!view || !input) return;
    const startY = e.clientY;
    // what is on screen, which the css cap may have made smaller than the saved height
    const startHeight = input.getBoundingClientRect().height;
    const maxHeight = Math.min(view.clientHeight - MIN_GRID_PX, fullVideoHeight(input));
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);

    const onMove = (ev: globalThis.PointerEvent) => {
      const next = startHeight + ev.clientY - startY;
      setPlayerHeight(Math.round(Math.max(MIN_PLAYER_PX, Math.min(maxHeight, next))));
    };
    const onUp = () => {
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
    };
    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp);
  };

  return (
    <div ref={viewRef} className="scene-scout-view scene-scout-flow-view">
      <div ref={inputRef} className="scene-scout-flow-input" style={{ height: playerHeight }}>
        <FlowPlayer
          source={flowFrom}
          empty={
            <Tooltip content={noDatabase ? "Add a database to the Searching list on the left first" : "Input a file to find scene matches"}>
              {/* wrapper span: a disabled button fires no pointer events, so the tooltip listens on it instead */}
              <span className="tooltip-anchor">
                <button type="button" className="event-host-btn scout-add-pick" onClick={() => void pickClip()} disabled={noDatabase}>
                  <ImportIcon />
                  Input episode
                </button>
              </span>
            </Tooltip>
          }
        />
      </div>

      <div
        className="scene-scout-split-handle"
        onPointerDown={startResize}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize clip and results"
      />

      <div className="scene-scout-view-grid">
        <ClipsContainer />
      </div>
    </div>
  );
}
