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
    id: "close-up-eyes",
    title: "Episode 02 - Close Up Eyes.mp4",
    prompt: "close up eyes",
    keywords: ["close", "eyes", "eye", "face", "stare", "look"],
    videoUrl: `${R2_TUTORIAL_BASE}/close-up-eyes.mp4`,
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

export function makeTutorialDatabase(withClips: boolean): ScoutDatabase {
  return {
    name: TUTORIAL_DB_NAME,
    path: TUTORIAL_DB_PATH,
    videoCount: withClips ? TUTORIAL_CLIPS.length : 0,
    sceneCount: withClips ? TUTORIAL_CLIPS.length : 0,
    sizeBytes: withClips ? 128_000 : 8_192,
    modelVersion: "tutorial",
    createdAt: new Date().toISOString(),
  };
}

export function makeTutorialVideos(): ScoutVideo[] {
  const now = Date.now() / 1000;
  return TUTORIAL_CLIPS.map((clip, i) => ({
    id: i + 1,
    name: clip.title,
    filepath: clip.videoUrl,
    sceneCount: 1,
    status: "indexed",
    modifiedAt: now,
  }));
}

export function searchTutorialHits(query: string): ScoutHit[] {
  const q = query.trim().toLowerCase();
  const scored = TUTORIAL_CLIPS.map((clip, idx) => {
    let score = 0.74 - idx * 0.03;
    if (clip.prompt === q) score = 0.96;
    else if (clip.keywords.some((k) => q.includes(k))) score = 0.92;
    else if (q.split(/\s+/).some((w) => w.length > 2 && clip.prompt.includes(w))) score = 0.88;
    return { clip, score };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.map(({ clip, score }, idx) => ({
    database: TUTORIAL_DB_NAME,
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
