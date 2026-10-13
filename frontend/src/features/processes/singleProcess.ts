import { create } from "zustand";

import { useAppStateStore } from "../../stores/appStore";

/**
 * one long job at a time
 *
 * importing, exporting, resuming an episode, indexing a scene scout database and
 * generating its thumbnails each own the progress window and lean on the same cpu,
 * gpu and disk. starting one while another runs asks first (ProcessConflictModal):
 * stop the running job and go on, or keep it and drop the new one. every job calls
 * `claimProcess` before it starts
 */

export type ProcessKind = "import" | "export" | "resume" | "scout_add" | "scout_thumbnails";

export const PROCESS_LABELS: Record<ProcessKind, string> = {
  import: "importing an episode",
  export: "exporting clips",
  resume: "resuming an episode",
  scout_add: "adding episodes to a Scene Scout database",
  scout_thumbnails: "generating Scene Scout thumbnails",
};

/** the job running right now, read from the state every job already keeps */
export function runningProcess(): ProcessKind | null {
  const s = useAppStateStore.getState();
  if (s.resumingEpisodeId) return "resume";
  if (s.activeOperation === "export") return "export";
  if (s.activeOperation === "scout_add") return "scout_add";
  if (s.activeOperation === "scout_thumbnails") return "scout_thumbnails";
  if (s.activeOperation === "import") return "import";
  // an import keeps cutting and re-encoding clips in the background after its loader closes
  if (s.bgProgress || s.bgImportProgress || s.reencodeProgress) return "import";
  return null;
}

/** stops whatever is running; App registers its abort, the one the progress window's ✕ uses */
let abortRunning: (() => Promise<void>) | null = null;
export function registerProcessAbort(abort: () => Promise<void>): void {
  abortRunning = abort;
}

type Conflict = {
  running: ProcessKind;
  next: ProcessKind;
  resolve: (go: boolean) => void;
};

/** drives ProcessConflictModal */
export const useProcessConflictStore = create<{ conflict: Conflict | null; stopping: boolean }>(() => ({
  conflict: null,
  stopping: false,
}));

/**
 * call right before starting a long job. resolves true when nothing else runs, or
 * once the user chose to stop it and it has stopped; false means do not start
 */
export function claimProcess(next: ProcessKind): Promise<boolean> {
  const running = runningProcess();
  if (!running) return Promise.resolve(true);
  // a second request while the question is open is dropped, never queued behind it
  if (useProcessConflictStore.getState().conflict) return Promise.resolve(false);
  return new Promise((resolve) => {
    useProcessConflictStore.setState({ conflict: { running, next, resolve }, stopping: false });
  });
}

/** an aborted job still has to unwind its own finally blocks before the next can start */
const STOP_TIMEOUT_MS = 15000;

function waitUntilIdle(): Promise<boolean> {
  if (!runningProcess()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      stopWatching();
      resolve(false);
    }, STOP_TIMEOUT_MS);
    const stopWatching = useAppStateStore.subscribe(() => {
      if (runningProcess()) return;
      window.clearTimeout(timer);
      stopWatching();
      resolve(true);
    });
  });
}

/** the modal's answer: stop the running job and start the new one, or keep it */
export async function answerConflict(stopRunning: boolean): Promise<void> {
  const { conflict } = useProcessConflictStore.getState();
  if (!conflict) return;
  if (!stopRunning) {
    useProcessConflictStore.setState({ conflict: null });
    conflict.resolve(false);
    return;
  }

  useProcessConflictStore.setState({ stopping: true });
  await abortRunning?.();
  const idle = await waitUntilIdle();
  if (!idle) console.warn("[process] the running job did not stop in time; the new one was not started");
  useProcessConflictStore.setState({ conflict: null, stopping: false });
  conflict.resolve(idle);
}
