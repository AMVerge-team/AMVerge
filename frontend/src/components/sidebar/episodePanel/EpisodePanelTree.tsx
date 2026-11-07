// recursive Episode Panel tree renderer. displays folders, nested folders, and episode rows
import React, { useMemo, useRef } from "react";
import EpisodeRow from "./EpisodeRow";
import FolderRow from "./FolderRow";
import type { EpisodePanelProps, PointerDragSource, PointerDropTarget } from "../types";

type Episode = EpisodePanelProps["episodes"][number];
type Folder = EpisodePanelProps["episodeFolders"][number];

type EpisodePanelTreeProps = {
  rootEpisodes: Episode[];
  foldersByParentId: Map<string | null, Folder[]>;
  episodesByFolderId: Map<string, Episode[]>;
  dropTarget: PointerDropTarget | null;

  openedEpisodeId: string | null;
  selectedEpisodeId: string | null;
  selectedFolderId: string | null;
  multiSelectedIds: Set<string>;

  beginPointerDrag: (
    source: PointerDragSource
  ) => (e: React.PointerEvent) => void;

  handleEpisodeClick: (episodeId: string) => (e: React.MouseEvent) => void;

  handleClickWithOptionalDouble: (opts: {
    key: string;
    onSingle: () => void;
    onDouble: () => void;
  }) => () => void;

  openContextMenu: (episodeId: string, e: React.MouseEvent) => void;
  openFolderContextMenu: (folderId: string, e: React.MouseEvent) => void;

  onOpenEpisode: (episodeId: string) => void;
  onRevealEpisode?: (episodeId: string) => void;
  onSelectFolder: (folderId: string | null) => void;
  onToggleFolderExpanded: (folderId: string) => void;
  forceExpanded?: boolean;
};

export default function EpisodePanelTree({
  rootEpisodes,
  foldersByParentId,
  episodesByFolderId,
  dropTarget,
  openedEpisodeId,
  selectedEpisodeId,
  selectedFolderId,
  multiSelectedIds,
  beginPointerDrag,
  handleEpisodeClick,
  handleClickWithOptionalDouble,
  openContextMenu,
  openFolderContextMenu,
  onOpenEpisode,
  onRevealEpisode,
  onSelectFolder,
  onToggleFolderExpanded,
  forceExpanded = false,
}: EpisodePanelTreeProps) {
  // stable handlers that call the newest ones, so memoized rows skip renders they don't need
  const latest = useRef({ beginPointerDrag, handleEpisodeClick, openContextMenu, onOpenEpisode, onRevealEpisode });
  latest.current = { beginPointerDrag, handleEpisodeClick, openContextMenu, onOpenEpisode, onRevealEpisode };
  const rowHandlers = useMemo(
    () => ({
      beginPointerDrag: (source: PointerDragSource) => (e: React.PointerEvent) =>
        latest.current.beginPointerDrag(source)(e),
      handleEpisodeClick: (episodeId: string) => (e: React.MouseEvent) =>
        latest.current.handleEpisodeClick(episodeId)(e),
      openContextMenu: (episodeId: string, e: React.MouseEvent) =>
        latest.current.openContextMenu(episodeId, e),
      onOpenEpisode: (episodeId: string) => latest.current.onOpenEpisode(episodeId),
      onRevealEpisode: (episodeId: string) => latest.current.onRevealEpisode?.(episodeId),
    }),
    []
  );

  const renderEpisodeRow = (
    episode: Episode,
    folderId: string | null,
    depth: number
  ) => {
    const isDrop =
      dropTarget?.kind === "episode" &&
      dropTarget.episodeId === episode.id;

    return (
      <EpisodeRow
        key={episode.id}
        episode={episode}
        folderId={folderId}
        depth={depth}
        isOpen={openedEpisodeId === episode.id}
        isSelected={selectedEpisodeId === episode.id}
        isMultiSelected={multiSelectedIds.has(episode.id)}
        isDropTarget={isDrop}
        {...rowHandlers}
      />
    );
  };

  const renderFolder = (folder: Folder, depth: number) => {
    const folderEpisodes = episodesByFolderId.get(folder.id) ?? [];
    const childFolders = foldersByParentId.get(folder.id) ?? [];

    const isDropFolder =
      (dropTarget?.kind === "folder" && dropTarget.folderId === folder.id) ||
      (dropTarget?.kind === "folder-reorder" && dropTarget.folderId === folder.id);

    const isExpanded = forceExpanded || folder.isExpanded;

    return (
      <div key={folder.id} className="episode-panel-folder">
        <FolderRow
          folder={folder}
          depth={depth}
          isSelected={selectedFolderId === folder.id}
          isDropTarget={isDropFolder}
          beginPointerDrag={beginPointerDrag}
          handleClickWithOptionalDouble={handleClickWithOptionalDouble}
          openFolderContextMenu={openFolderContextMenu}
          onSelectFolder={onSelectFolder}
          onToggleFolderExpanded={onToggleFolderExpanded}
        />

        {isExpanded && (childFolders.length > 0 || folderEpisodes.length > 0) && (
          <div className="episode-panel-folder-children">
            {childFolders.map((child) => renderFolder(child, depth + 1))}
            {folderEpisodes.map((episode) =>
              renderEpisodeRow(episode, folder.id, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };
  const rootFolders = foldersByParentId.get(null) ?? [];

  return (
    <>
      {rootFolders.map((folder) => renderFolder(folder, 0))}

      {rootEpisodes.map((episode) =>
        renderEpisodeRow(episode, null, 0)
      )}
    </>
  );
}