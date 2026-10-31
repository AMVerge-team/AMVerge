import InfoButton from "../common/InfoButton";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";

/** the "how does this work" popover, shared by the first-visit layout and the top toolbar; explains whichever tab is open */
export function ScoutInfoButton() {
  const mode = useSceneScoutStore((s) => s.mode);
  return mode === "flow" ? <FlowInfo /> : <SearchInfo />;
}

function SearchInfo() {
  return (
    <InfoButton title="Scene Scout: Search" variant="toolbar">
      <p>
        Scene Scout searches your indexed episodes by description rather than by filename. Type what
        you remember of a scene and it finds the closest matches.
      </p>

      <h4>Getting started</h4>
      <ol>
        <li>Create or open a database in the left panel. One per series works well.</li>
        <li>
          Move it into Searching by double-clicking it, dragging it up, or right-clicking it. All
          databases lists everything you have; only the ones in Searching are searched.
        </li>
        <li>
          Press Import and pick one or more videos. Indexing watches every scene once and stores a
          fingerprint of each, which takes a while but only happens once per episode.
        </li>
        <li>Describe the scene you want in plain language and press Enter.</li>
      </ol>

      <h4>Search settings</h4>
      <p>
        Results controls how many matches come back. Scene detection is chosen each time you add
        episodes.
      </p>
    </InfoButton>
  );
}

function FlowInfo() {
  return (
    <InfoButton title="Scene Scout: Flow" variant="toolbar">
      <p>
        Flow finds scenes that could come right after a clip you already have. It looks at the clip's
        last frame and returns the scenes in your databases that look most like it, so the cut between
        them feels continuous.
      </p>

      <h4>How to use it</h4>
      <ol>
        <li>Add the databases to search to the Searching list on the left.</li>
        <li>
          Press Import and pick a video file, or select one clip in your Library or in Search
          results and click Find clips that flow.
        </li>
        <li>Click a match to play it in the preview pane, and export it from there as usual.</li>
      </ol>

      <h4>Tips</h4>
      <p>
        Drag the bar between the clip and the results to give either more room. The refresh button runs
        the same clip again, for example after changing which databases are searched.
      </p>
    </InfoButton>
  );
}

export default ScoutInfoButton;
