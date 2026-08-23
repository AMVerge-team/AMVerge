// episode Panel toolbar. Renders Sort, New Folder, and Delete-selected-episode actions.
import { FaFolderPlus, FaSortAlphaDown, FaSortAlphaUp, FaTrashAlt } from "react-icons/fa";

import Tooltip from "../../common/Tooltip";

type EpisodePanelHeaderProps = {
  nextSortDirection: "asc" | "desc";
  setNextSortDirection: React.Dispatch<
    React.SetStateAction<"asc" | "desc">
  >;

  onSortEpisodePanel: (direction: "asc" | "desc") => void;
  openNewFolderModal: (parentFolderId: string | null) => void;
  selectedEpisodeId: string | null;
  selectedFolderId: string | null;
  multiSelectedCount: number;
  onDeleteSelectedEpisode: () => void;
};

export default function EpisodePanelHeader({
  nextSortDirection,
  setNextSortDirection,
  onSortEpisodePanel,
  openNewFolderModal,
  selectedEpisodeId,
  selectedFolderId,
  multiSelectedCount,
  onDeleteSelectedEpisode,
}: EpisodePanelHeaderProps) {
  const sortLabel = nextSortDirection === "asc" ? "Sort A-Z" : "Sort Z-A";
  const SortIcon = nextSortDirection === "asc" ? FaSortAlphaDown : FaSortAlphaUp;
  const deleteDisabled =
    multiSelectedCount === 0 && !selectedEpisodeId && !selectedFolderId;
  const deleteLabel = deleteDisabled
    ? "Delete selected item (select an episode or folder first)"
    : multiSelectedCount > 1
      ? `Delete ${multiSelectedCount} selected episodes`
      : selectedEpisodeId
        ? "Delete selected episode"
        : "Delete selected folder";

  return (
    <div className="episode-panel-header">
      <div className="episode-panel-title">Episode Panel</div>

      <div className="episode-panel-actions">
        <Tooltip content={sortLabel}>
          <button
            type="button"
            className="episode-panel-action icon-only"
            onClick={() => {
              onSortEpisodePanel(nextSortDirection);

              setNextSortDirection((prev) =>
                prev === "asc" ? "desc" : "asc"
              );
            }}
            aria-label={sortLabel}
          >
            <SortIcon aria-hidden="true" />
          </button>
        </Tooltip>

        <Tooltip content="New folder">
          <button
            type="button"
            className="episode-panel-action icon-only"
            onClick={() => openNewFolderModal(null)}
            aria-label="New folder"
          >
            <FaFolderPlus aria-hidden="true" />
          </button>
        </Tooltip>

        {/* wrapper span: the delete action is disabled until something is
            selected, and that is when its label is worth reading */}
        <Tooltip content={deleteLabel}>
          <span className="tooltip-anchor">
            <button
              type="button"
              className="episode-panel-action icon-only"
              onClick={onDeleteSelectedEpisode}
              disabled={deleteDisabled}
              aria-label={deleteLabel}
            >
              <FaTrashAlt aria-hidden="true" />
            </button>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}
