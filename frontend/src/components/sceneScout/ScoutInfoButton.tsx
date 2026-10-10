import InfoButton from "../common/InfoButton";

/** the "how does this work" popover, shared by the first-visit layout and the top toolbar */
export function ScoutInfoButton() {
  return (
    <InfoButton title="Scene Scout Information">
      <p>
        Scene Scout searches your indexed episodes by description rather than by filename. Type what
        you remember of a scene and it finds the closest matches.
      </p>

      <h4>Getting started</h4>
      <ol>
        <li>Create a database. One per series works well.</li>
        <li>
          Select it, press Add Episode and pick one or more videos. Indexing watches every scene once
          and stores a fingerprint of each, which takes a while but only happens once per episode.
        </li>
        <li>Search for what you want in plain language.</li>
      </ol>

      <h4>Search settings</h4>
      <p>
        Results controls how many matches come back. Min score hides results below that score. Scene
        detection is chosen each time you add episodes.
      </p>
    </InfoButton>
  );
}

export default ScoutInfoButton;
