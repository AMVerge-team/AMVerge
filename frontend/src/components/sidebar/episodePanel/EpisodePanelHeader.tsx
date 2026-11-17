import { FaFolderOpen, FaFolderPlus, FaSortAlphaDown, FaSortAlphaUp, FaTrashAlt } from '../../icons/animated';
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

import Tooltip from "../../common/Tooltip";
import { useGeneralSettingsStore } from "../../../stores/settingsStore";

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
  const { t } = useTranslation("library");
  const episodesPath = useGeneralSettingsStore((s) => s.episodesPath);
  const sortLabel = nextSortDirection === "asc" ? t("episodePanel.header.sortAsc") : t("episodePanel.header.sortDesc");
  const SortIcon = nextSortDirection === "asc" ? FaSortAlphaDown : FaSortAlphaUp;
  const deleteDisabled =
    multiSelectedCount === 0 && !selectedEpisodeId && !selectedFolderId;
  const deleteLabel = deleteDisabled
    ? t("episodePanel.header.deleteDisabled")
    : multiSelectedCount > 1
      ? t("episodePanel.header.deleteSelectedEpisodes", { count: multiSelectedCount })
      : selectedEpisodeId
        ? t("episodePanel.header.deleteSelectedEpisode")
        : t("episodePanel.header.deleteSelectedFolder");

  const handleOpenStorage = async () => {
    if (episodesPath) {
      try {
        await invoke("reveal_in_file_manager", { filePath: episodesPath });
      } catch (err) {
        console.warn("Could not reveal storage path:", err);
      }
    }
  };

  return (
    <div className="episode-panel-header">
      <div className="episode-panel-title">{t("episodePanel.header.title")}</div>

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

        <Tooltip content={t("episodePanel.header.newFolder")}>
          <button
            type="button"
            className="episode-panel-action icon-only"
            onClick={() => openNewFolderModal(null)}
            aria-label={t("episodePanel.header.newFolder")}
          >
            <FaFolderPlus aria-hidden="true" />
          </button>
        </Tooltip>

        {episodesPath && (
          <Tooltip content={t("episodePanel.header.showInFolder")}>
            <button
              type="button"
              className="episode-panel-action icon-only"
              onClick={handleOpenStorage}
              aria-label={t("episodePanel.header.showInFolder")}
            >
              <FaFolderOpen aria-hidden="true" />
            </button>
          </Tooltip>
        )}

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
