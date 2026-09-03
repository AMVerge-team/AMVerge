export type ClipItem = {
  id: string;
  src: string;
  srcList?: string[];
  thumbnail: string;
  originalName?: string;
  originalPath?: string;
  sceneIndex?: number;
  startSec?: number;
  endSec?: number;
  thumbnailReady?: boolean;
  mergedSrcs?: string[];
  clipPath?: string;
  clipMode?: string;
  episodeId?: string;
  // Scenepack clips only: the ORIGINAL source type before materialization
  // every Scenepack clip gets its own clipPath (a materialized copy) once
  // added, so clipPath presence alone can no longer tell video-mode and
  // webp-mode clips apart the way it does for Home-page clips
  sourceKind?: "video" | "webp";
};

export type EpisodeFolder = {
  id: string;
  name: string;
  parentId: string | null;
  isExpanded: boolean;
};

export type EpisodeEntry = {
  id: string;
  displayName: string;
  videoPath: string;
  folderId: string | null;
  importedAt: number;
  clips: ClipItem[];
  importMethod?: "video_files" | "webp_files";
};

export type ScenepackClip = {
  episodeId: string;
  sceneIndex: number;
  input: string;
  originalPath?: string;
  startSec?: number;
  endSec?: number;
  clipPath?: string;
  thumbnail: string;
  sourceKind?: "video" | "webp";
};

export type ScenepackFolder = {
  id: string;
  name: string;
  parentId: string | null;
  isExpanded: boolean;
};

export type ScenepackEntry = {
  id: string;
  name: string;
  folderId: string | null;
  createdAt: number;
  clips: ScenepackClip[];
  /**
   * cover image for the panel tile. unset falls back to the first clip's
   * thumbnail, which is the sensible default and what every existing pack has.
   */
  thumbnail?: string | null;
};
