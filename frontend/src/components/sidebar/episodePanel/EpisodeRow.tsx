import type React from "react";
import { FaFolderOpen, FaImage, FaPlay, FaVideo } from "react-icons/fa";
import Tooltip from "../../common/Tooltip";
import { useAppStateStore } from "../../../stores/appStore";
import { isEpisodePaused } from "../../../features/import/resumeEpisode";
import { resumeEpisode } from "../../../features/import/reencodeQueue";
import { useWebpLoadingStore } from "../../../stores/webpLoadingStore";
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

  // import method is fixed per episode, but episodes imported before the field
  // existed don't carry it - infer those from whether their clips have cut video
  // files, the same rule the grid uses to pick its preview mode
  const isWebpEpisode =
    episode.importMethod === "webp_files" ||
    (episode.importMethod === undefined &&
      !episode.clips.some((clip) => Boolean(clip.clipPath)));

  const handleReveal = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRevealEpisode?.(episode.id);
  };

  // paused: its import stopped early (mini window or app closed) with clips left to cut
  const liveImportEpisodeIds = useAppStateStore((s) => s.liveImportEpisodeIds);
  const reencodeQueue = useAppStateStore((s) => s.reencodeQueue);
  // a webp episode pauses its preview encodes instead, when its progress card is closed
  const webpPaused = useWebpLoadingStore((s) => s.pausedEpisodeId === episode.id);
  const isPaused = webpPaused || isEpisodePaused(episode, liveImportEpisodeIds, reencodeQueue);

  const handleResume = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (webpPaused) useWebpLoadingStore.getState().resume();
    else void resumeEpisode(episode.id);
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
      <Tooltip
        content={isWebpEpisode ? "Imported as WebP previews" : "Imported as video files"}
        side="right"
      >
        <span
          className="episode-panel-media-icon"
          aria-label={isWebpEpisode ? "WebP preview episode" : "Video preview episode"}
        >
          {isWebpEpisode ? <FaImage /> : <FaVideo />}
        </span>
      </Tooltip>

      <Tooltip content={episode.videoPath} side="right" maxWidth={360}>
        <span className="episode-panel-episode-name">
          {episode.displayName}
        </span>
      </Tooltip>
      {isPaused && (
        // stays enabled while something else runs: resuming then asks whether to stop it
        <Tooltip content="Processing paused · resume" side="right">
          <span>
            <button
              type="button"
              className="episode-panel-import-icon episode-resume-btn"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={handleResume}
              aria-label="Resume processing"
            >
              <FaPlay />
            </button>
          </span>
        </Tooltip>
      )}
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