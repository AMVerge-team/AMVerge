import { invoke } from "@tauri-apps/api/core";
import { useAppStateStore } from "../../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { claimProcess } from "../processes/singleProcess";
import { finishEpisodeClips, hasClipsToFinish, resumableScenes } from "./resumeEpisode";

// one re-encode at a time, in three lanes, highest first:
// queue: what the user is looking at or asked for (handed-off imports, resume, an opened episode), with progress
// hits: scene scout results still uncut, so a search's clips are ready first; quiet
// background: scene scout imports, a few scenes at a time at low priority with rests between; quiet

type Lane = "hits" | "queue" | "background";
type Job = { id: string; lane: Lane; scenes?: number[] };

const RANK: Record<Lane, number> = { background: 0, hits: 1, queue: 2 };
// a background batch, then a rest as long as it took, so it uses about half the cpu it could
const BACKGROUND_BATCH = 4;
const MIN_BACKGROUND_REST_MS = 1000;
// runs in a row that cut nothing before an episode leaves the scout lanes
const MAX_STRIKES = 3;
const strikes = new Map<string, number>();

let running: { job: Job; run: Promise<void> } | null = null;
let pumping = false;
let pumpAgain = false;
let restTimer: number | null = null;
// set while this queue stops its own run, so that run never counts as one that cut nothing
let abortRequested = false;
let hitScenes = new Map<string, number[]>();
let background: string[] = [];

function setQueue(update: (queue: string[]) => string[]) {
  useAppStateStore.setState((s) => ({ reencodeQueue: update(s.reencodeQueue) }));
}

function isImporting(id: string): boolean {
  return useAppStateStore.getState().liveImportEpisodeIds.includes(id);
}

function nextJob(): Job | undefined {
  const queue = useAppStateStore.getState().reencodeQueue;
  const opened = useEpisodePanelRuntimeStore.getState().openedEpisodeId;
  const queued = opened && queue.includes(opened) ? opened : queue[0];
  if (queued) return { id: queued, lane: "queue" };

  for (const [id, scenes] of hitScenes) {
    const todo = resumableScenes(id).filter((scene) => scenes.includes(scene));
    if (todo.length > 0 && !isImporting(id)) return { id, lane: "hits", scenes: todo };
    if (todo.length === 0) hitScenes.delete(id);
  }

  // background cuts wait for any foreground job (import, export, indexing) and for their rest
  if (restTimer !== null || useAppStateStore.getState().activeOperation) return undefined;
  background = background.filter(hasClipsToFinish);
  const id = background.find((bg) => !isImporting(bg) && !queue.includes(bg));
  return id ? { id, lane: "background", scenes: resumableScenes(id).slice(0, BACKGROUND_BATCH) } : undefined;
}

function sameJob(a: Job, b: Job): boolean {
  return a.id === b.id && a.lane === b.lane;
}

function start(job: Job) {
  const startedAt = Date.now();
  const before = resumableScenes(job.id).length;
  const run = finishEpisodeClips(job.id, {
    scenes: job.scenes,
    quiet: job.lane !== "queue",
    lowPriority: job.lane === "background",
  }).finally(() => {
    const stoppedHere = abortRequested;
    running = null;
    abortRequested = false;
    // done, failed or deleted: off the queue. paused by a switch: it still has clips and stays
    if (job.lane === "queue" && !hasClipsToFinish(job.id)) setQueue((queue) => queue.filter((q) => q !== job.id));
    // runs that keep cutting nothing (source gone, cli missing) are given up on instead of retried forever
    const cutNothing = !stoppedHere && resumableScenes(job.id).length >= before;
    const count = cutNothing ? (strikes.get(job.id) ?? 0) + 1 : 0;
    strikes.set(job.id, count);
    if (count >= MAX_STRIKES) {
      background = background.filter((id) => id !== job.id);
      hitScenes.delete(job.id);
    }
    if (job.lane === "background") rest(Math.max(MIN_BACKGROUND_REST_MS, Date.now() - startedAt));
    void pump();
  });
  running = { job, run };
}

async function stopRunning(current: { run: Promise<void> }) {
  abortRequested = true;
  await invoke("abort_resume_episode");
  await current.run;
}

// holds the background lane back for a while; the other lanes still run meanwhile
function rest(ms: number) {
  if (restTimer !== null) window.clearTimeout(restTimer);
  restTimer = window.setTimeout(() => {
    restTimer = null;
    void pump();
  }, ms);
}

async function pump(): Promise<void> {
  if (pumping) {
    pumpAgain = true;
    return;
  }
  pumping = true;
  try {
    for (;;) {
      const next = nextJob();
      if (!next || (running && sameJob(running.job, next))) return;
      if (!running) {
        start(next);
        return;
      }
      // a higher lane, or another opened episode in the queue lane, takes over
      const current = running;
      const takesOver =
        RANK[next.lane] > RANK[current.job.lane] || (next.lane === "queue" && current.job.lane === "queue");
      if (!takesOver) return;
      await stopRunning(current);
    }
  } finally {
    pumping = false;
    if (pumpAgain) {
      pumpAgain = false;
      void pump();
    }
  }
}

/** queues the episode's unfinished clips behind the others */
export function queueReencode(episodeId: string) {
  setQueue((queue) => (queue.includes(episodeId) ? queue : [...queue, episodeId]));
  void pump();
}

/** finishes the episode's clips slowly whenever nothing else is cutting */
export function queueBackgroundReencode(episodeId: string) {
  if (!background.includes(episodeId)) background.push(episodeId);
  void pump();
}

/** picks up the background cuts of earlier sessions (episodes scene scout cut into the library) */
export function resumeBackgroundCuts() {
  for (const episode of useEpisodePanelRuntimeStore.getState().episodes) {
    if (episode.cutsInBackground && hasClipsToFinish(episode.id)) queueBackgroundReencode(episode.id);
  }
}

/** cuts these scenes before anything else; each call replaces the last one's (the newest search wins) */
export function prioritizeScenes(scenesByEpisode: Map<string, number[]>) {
  hitScenes = scenesByEpisode;
  void pump();
}

/** the sidebar's resume button: asks to stop another job first, unless it is this queue */
export async function resumeEpisode(episodeId: string): Promise<void> {
  if (!hasClipsToFinish(episodeId)) return;
  const queue = useAppStateStore.getState().reencodeQueue;
  if (queue.length === 0 && !(await claimProcess("resume"))) return;
  setQueue((q) => [episodeId, ...q.filter((id) => id !== episodeId)]);
  void pump();
}

/** takes one episode off every lane (it is being deleted), stopping it if it is the one running */
export async function dropFromReencodeQueue(episodeId: string): Promise<void> {
  setQueue((queue) => queue.filter((id) => id !== episodeId));
  background = background.filter((id) => id !== episodeId);
  hitScenes.delete(episodeId);
  const current = running;
  if (current?.job.id !== episodeId) return;
  await stopRunning(current);
}

/** empties the queue lane; the caller stops the running resume (App's abort). background cuts carry on later */
export function clearReencodeQueue() {
  setQueue(() => []);
  hitScenes = new Map();
}

/** an opened video-mode episode with uncut clips starts finishing, with progress, when no other job runs */
function finishOpenedEpisode(episodeId: string | null) {
  if (!episodeId || useAppStateStore.getState().activeOperation || isImporting(episodeId)) return;
  const episode = useEpisodePanelRuntimeStore.getState().episodes.find((e) => e.id === episodeId);
  if (episode?.importMethod === "video_files" && hasClipsToFinish(episodeId)) queueReencode(episodeId);
}

// opening an episode moves its re-encode up immediately, or starts it when idle
useEpisodePanelRuntimeStore.subscribe((state, prev) => {
  if (state.openedEpisodeId === prev.openedEpisodeId) return;
  finishOpenedEpisode(state.openedEpisodeId);
  void pump();
});

// a foreground job ending lets the background lane go on
useAppStateStore.subscribe((state, prev) => {
  if (prev.activeOperation && !state.activeOperation) void pump();
});
