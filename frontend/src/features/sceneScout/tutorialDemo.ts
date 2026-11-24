import type { EpisodeEntry } from "../../types/domain";
import type { ScoutDatabase, ScoutHit, ScoutVideo } from "./types";

export const R2_TUTORIAL_BASE = "https://amverge.tsukyio.com/tutorial";
export const TUTORIAL_DB_PATH = "__tutorial__/Demo Anime.scoutdb";
export const TUTORIAL_DB_NAME = "Demo Anime";

export type TutorialClip = {
  id: string;
  title: string;
  prompt: string;
  keywords: string[];
  videoUrl: string;
  durationSec: number;
};

export const TUTORIAL_CLIPS: TutorialClip[] = [
  {
    id: "sword-fight",
    title: "Episode 04 - Sword Fight.mp4",
    prompt: "sword fight",
    keywords: ["sword", "fight", "blade", "action", "battle", "attack"],
    videoUrl: `${R2_TUTORIAL_BASE}/sword-fight.mp4`,
    durationSec: 4.5,
  },
  {
    id: "crying-rain",
    title: "Episode 07 - Crying in Rain.mp4",
    prompt: "crying in the rain",
    keywords: ["crying", "rain", "sad", "tears", "water"],
    videoUrl: `${R2_TUTORIAL_BASE}/crying-rain.mp4`,
    durationSec: 4.0,
  },
  {
    id: "open-up-eyes",
    title: "Episode 02 - Open Up Eyes.mp4",
    prompt: "open up eyes",
    keywords: ["open", "eyes", "eye", "face", "close", "stare", "look"],
    videoUrl: `${R2_TUTORIAL_BASE}/open-up-eyes.mp4`,
    durationSec: 3.5,
  },
  {
    id: "sunset-sky",
    title: "Episode 11 - Sunset Sky.mp4",
    prompt: "sunset sky",
    keywords: ["sunset", "sky", "clouds", "orange", "horizon", "sun"],
    videoUrl: `${R2_TUTORIAL_BASE}/sunset-sky.mp4`,
    durationSec: 5.0,
  },
];

export function isRemoteMediaUrl(pathOrUrl: string | null | undefined): boolean {
  return Boolean(pathOrUrl && (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")));
}

export function makeTutorialDatabase(videoCount: number, name = TUTORIAL_DB_NAME): ScoutDatabase {
  return {
    name: name.trim() || TUTORIAL_DB_NAME,
    path: TUTORIAL_DB_PATH,
    videoCount,
    sceneCount: videoCount,
    sizeBytes: videoCount > 0 ? videoCount * 32_000 : 8_192,
    modelVersion: "tutorial",
    createdAt: new Date().toISOString(),
  };
}

export function makeTutorialVideos(selectedUrls?: string[] | null): ScoutVideo[] {
  const now = Date.now() / 1000;
  const list =
    selectedUrls && selectedUrls.length > 0
      ? TUTORIAL_CLIPS.filter((c) => selectedUrls.includes(c.videoUrl))
      : TUTORIAL_CLIPS;
  const active = list.length > 0 ? list : TUTORIAL_CLIPS;
  return active.map((clip, i) => ({
    id: i + 1,
    name: clip.title,
    filepath: clip.videoUrl,
    sceneCount: 1,
    status: "indexed",
    modifiedAt: now,
  }));
}

export function makeTutorialLibraryEpisodes(): EpisodeEntry[] {
  const now = Date.now();
  return TUTORIAL_CLIPS.map((clip, i) => ({
    id: `tutorial_ep_${clip.id}`,
    name: clip.title,
    displayName: clip.title,
    videoPath: clip.videoUrl,
    folderId: null,
    importedAt: now - i * 1000,
    clips: [
      {
        id: `tutorial_clip_${clip.id}`,
        src: clip.videoUrl,
        clipPath: clip.videoUrl,
        thumbnail: "",
        originalPath: clip.videoUrl,
        originalName: clip.title,
        sceneIndex: 0,
        startSec: 0,
        endSec: clip.durationSec,
      },
    ],
  }));
}

export function searchTutorialHits(
  query: string,
  dbName = TUTORIAL_DB_NAME,
  selectedUrls?: string[] | null
): ScoutHit[] {
  const q = query.trim().toLowerCase();
  const pool =
    selectedUrls && selectedUrls.length > 0
      ? TUTORIAL_CLIPS.filter((c) => selectedUrls.includes(c.videoUrl))
      : TUTORIAL_CLIPS;
  const active = pool.length > 0 ? pool : TUTORIAL_CLIPS;
  const scored = active.map((clip, idx) => {
    let score = 0.74 - idx * 0.03;
    if (clip.prompt === q) score = 0.96;
    else if (clip.keywords.some((k) => q.includes(k))) score = 0.92;
    else if (q.split(/\s+/).some((w) => w.length > 2 && clip.prompt.includes(w))) score = 0.88;
    return { clip, score };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.map(({ clip, score }, idx) => ({
    database: dbName.trim() || TUTORIAL_DB_NAME,
    videoPath: clip.videoUrl,
    sceneIndex: idx + 1,
    startMs: 0,
    endMs: Math.round(clip.durationSec * 1000),
    startSec: 0,
    endSec: clip.durationSec,
    score,
    thumbnailB64: null,
    motion: null,
  }));
}
