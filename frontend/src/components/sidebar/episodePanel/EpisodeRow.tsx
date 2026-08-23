import type React from "react";
import { FaFolderOpen } from "react-icons/fa";
import Tooltip from "../../common/Tooltip";
import type { EpisodePanelProps, PointerDragSource } from "../types";

type Episode = EpisodePanelProps["episodes"][number];

type EpisodeRowProps = {
  episode: Episode;
  folderId: string | null;
  depth?: number;

  openedEpisodeId: string | null;
  selectedEpisodeId: string | null;
  multiSelectedIds: Set<string>;
  isDropTarget: boolean;

  beginPointerDrag: (
    source: PointerDragSource
  ) => (e: React.PointerEvent) => void;

  handleEpisodeClick: (episodeId: string) => (e: React.MouseEvent) => void;
  openContextMenu: (episodeId: string, e: React.MouseEvent) => void;
  onOpenEpisode: (episodeId: string) => void;
  onRevealEpisode?: (episodeId: string) => void;
};

export default function EpisodeRow({
  episode,
  folderId,
  depth = 0,
  openedEpisodeId,
  selectedEpisodeId,
  multiSelectedIds,
  isDropTarget,
  beginPointerDrag,
  handleEpisodeClick,
  openContextMenu,
  onOpenEpisode,
  onRevealEpisode,
}: EpisodeRowProps) {
  const isOpen = openedEpisodeId === episode.id;
  const isSelected = selectedEpisodeId === episode.id;
  const isMultiSelected = multiSelectedIds.has(episode.id);

  let rowClass = "episode-panel-row episode-row";
  if (isOpen) rowClass += " is-open";
  else if (isSelected) rowClass += " is-focused";
  if (isMultiSelected) rowClass += " is-multi-selected";
  if (isDropTarget) rowClass += " is-drop-target";

  const paddingLeft =
    folderId === null ? undefined : `${8 + depth * 12 + 28}px`;

  const handleReveal = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRevealEpisode?.(episode.id);
  };

  return (
    <div
      className={rowClass}
      data-episode-id={episode.id}
      data-episode-folder-id={folderId ?? ""}
      style={paddingLeft ? { paddingLeft } : undefined}
      onPointerDown={beginPointerDrag({ type: "episode", id: episode.id })}
      onClick={handleEpisodeClick(episode.id)}
      onDoubleClick={() => onOpenEpisode(episode.id)}
      onContextMenu={(e) => openContextMenu(episode.id, e)}
    >
      <Tooltip content={episode.videoPath} side="right" maxWidth={360}>
        <span className="episode-panel-episode-name">
          {episode.displayName}
        </span>
      </Tooltip>
      <Tooltip content="Show in File Explorer" side="right">
        <button
          type="button"
          className="episode-panel-import-icon episode-folder-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleReveal}
          aria-label="Show in File Explorer"
        >
          <FaFolderOpen />
        </button>
      </Tooltip>
    </div>
  );
}