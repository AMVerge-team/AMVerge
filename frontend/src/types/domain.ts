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
  startSec?: number;
  endSec?: number;
  clipPath?: string;
  thumbnail: string;
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
};
