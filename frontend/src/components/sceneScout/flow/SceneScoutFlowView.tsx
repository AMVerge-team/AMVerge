import { useRef } from "react";
import type { PointerEvent } from "react";

import ClipsContainer from "../../clipsGrid/ClipsContainer";
import { useSceneScoutStore } from "../../../stores/sceneScoutStore";
import { useUIStateStore } from "../../../stores/UIStore";
import { FlowPlayer } from "./FlowPlayer";

/** the clip and the grid each keep at least this much height while dragging the bar */
const MIN_PLAYER_PX = 120;
const MIN_GRID_PX = 160;

/**
 * The Flow tab: the clip being cut from on top, every scene that could follow
 * it underneath, with a draggable bar between them. Clicking a result plays it
 * in the regular preview pane, which also exports it, exactly as on the Search tab.
 */
export function SceneScoutFlowView() {
  const flowFrom = useSceneScoutStore((s) => s.flowFrom);
  const playerHeight = useUIStateStore((s) => s.flowPlayerHeightPx);
  const setPlayerHeight = useUIStateStore((s) => s.setFlowPlayerHeightPx);
  const viewRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  // the tallest the clip area can usefully be: past this the video is already as wide as
  // the pane, so a taller area would only add empty space above it
  const fullVideoHeight = (input: HTMLDivElement) => {
    const style = getComputedStyle(input);
    const innerWidth = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const box = input.querySelector(".scene-scout-flow-player-box");
    const frame = input.querySelector(".scene-scout-flow-player-frame");
    const labelBlock = box && frame ? frame.getBoundingClientRect().top - box.getBoundingClientRect().top : 0;
    return parseFloat(style.paddingTop) + labelBlock + (innerWidth * 9) / 16;
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
        <FlowPlayer source={flowFrom} empty="Input a file, or select a clip on Home and click Find flowing clips." />
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
