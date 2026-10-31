import Tooltip from "../common/Tooltip";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";

/** scene scout's add episode: the same Import button as home's import episode */
export function AddEpisodeButton({
  hint,
  onClick,
  disabled,
}: {
  hint: string;
  onClick: () => void;
  disabled: boolean;
}) {
  const indexing = useSceneScoutStore((s) => s.indexing);
  return (
    // wrapper span: a disabled button fires no pointer events, so the tooltip listens on it instead
    <Tooltip content={indexing ? "Indexing..." : hint}>
      <span className="tooltip-anchor" data-scout-tour="add-episode">
        <button
          type="button"
          className="import-button icon-action-button import-text-button"
          onClick={onClick}
          disabled={disabled || Boolean(indexing)}
        >
          Import
        </button>
      </span>
    </Tooltip>
  );
}
