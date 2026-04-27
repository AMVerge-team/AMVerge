import type React from "react";
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
      title={episode.videoPath}
    >
      <span className="episode-panel-episode-name">
        {episode.displayName}
      </span>
    </div>
  );
}