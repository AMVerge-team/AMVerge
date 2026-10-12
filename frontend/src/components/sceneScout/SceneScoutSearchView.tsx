import { useLayoutEffect, useRef } from "react";

import ClipsContainer from "../clipsGrid/ClipsContainer";
import { playHeroFlip } from "../../features/sceneScout/heroTransition";
import { ScoutSearchField } from "./ScoutSearchField";

/**
 * The Search tab's left pane: the search bar above the results grid. The bar
 * lives here, not in the toolbar, so the toolbar keeps home's one-row height.
 */
export function SceneScoutSearchView() {
  // arriving from the first-visit layout: slide the bar up from where it sat there
  const fieldRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    playHeroFlip(fieldRef.current);
  }, []);

  return (
    <div className="scene-scout-view">
      <div className="scene-scout-search-row">
        <ScoutSearchField fieldRef={fieldRef} />
      </div>

      <div className="scene-scout-view-grid">
        <ClipsContainer />
      </div>
    </div>
  );
}
