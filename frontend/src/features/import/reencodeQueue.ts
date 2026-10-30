import { invoke } from "@tauri-apps/api/core";
import { useAppStateStore } from "../../stores/appStore";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore";
import { claimProcess } from "../processes/singleProcess";
import { finishEpisodeClips, hasClipsToFinish } from "./resumeEpisode";

// one re-encode at a time: the opened episode first (switching when another is opened), then queue order

let running: { id: string; run: Promise<void> } | null = null;
let pumping = false;
let pumpAgain = false;

function setQueue(update: (queue: string[]) => string[]) {
  useAppStateStore.setState((s) => ({ reencodeQueue: update(s.reencodeQueue) }));
}

function nextEpisode(queue: string[]): string | undefined {
  const opened = useEpisodePanelRuntimeStore.getState().openedEpisodeId;
  return opened && queue.includes(opened) ? opened : queue[0];
}

function start(id: string) {
  const run = finishEpisodeClips(id).finally(() => {
    running = null;
    // done, failed or deleted: off the queue. paused by a switch: it still has clips and stays
    if (!hasClipsToFinish(id)) setQueue((queue) => queue.filter((q) => q !== id));
    void pump();
  });
  running = { id, run };
}

async function pump(): Promise<void> {
  if (pumping) {
    pumpAgain = true;
    return;
  }
  pumping = true;
  try {
    for (;;) {
      const next = nextEpisode(useAppStateStore.getState().reencodeQueue);
      if (!next || running?.id === next) return;
      if (!running) {
        start(next);
        return;
      }
      // another episode was opened: pause the running one, then go round again
      const current = running;
      await invoke("abort_resume_episode");
      await current.run;
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

/** the sidebar's resume button: asks to stop another job first, unless it is this queue */
export async function resumeEpisode(episodeId: string): Promise<void> {
  if (!hasClipsToFinish(episodeId)) return;
  const queue = useAppStateStore.getState().reencodeQueue;
  if (queue.length === 0 && !(await claimProcess("resume"))) return;
  setQueue((q) => [episodeId, ...q.filter((id) => id !== episodeId)]);
  void pump();
}

/** takes one episode off the queue (it is being deleted), stopping it if it is the one running */
export async function dropFromReencodeQueue(episodeId: string): Promise<void> {
  setQueue((queue) => queue.filter((id) => id !== episodeId));
  const current = running;
  if (current?.id !== episodeId) return;
  await invoke("abort_resume_episode");
  await current.run;
}

/** empties the queue; the caller stops the running resume (App's abort) */
export function clearReencodeQueue() {
  setQueue(() => []);
}

// opening a queued episode moves its re-encode up immediately
useEpisodePanelRuntimeStore.subscribe((state, prev) => {
  if (state.openedEpisodeId !== prev.openedEpisodeId) void pump();
});
