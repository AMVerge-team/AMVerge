import type React from "react";
import { FaImage, FaVideo } from "react-icons/fa";
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

  // import method is fixed per episode, but episodes imported before the field
  // existed don't carry it — infer those from whether their clips have cut video
  // files, the same rule the grid uses to pick its preview mode.
  const isWebpEpisode =
    episode.importMethod === "webp_files" ||
    (episode.importMethod === undefined &&
      !episode.clips.some((clip) => Boolean(clip.clipPath)));

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
      <span
        className="episode-panel-import-icon"
        aria-label={isWebpEpisode ? "WebP preview episode" : "Video preview episode"}
        title={isWebpEpisode ? "Imported as WebP previews" : "Imported as video files"}
      >
        {isWebpEpisode ? <FaImage /> : <FaVideo />}
      </span>
    </div>
  );
}