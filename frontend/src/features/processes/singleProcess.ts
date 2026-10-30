import { create } from "zustand";

import { useAppStateStore } from "../../stores/appStore";

// one long job at a time: starting one while another runs asks to stop it or drop the new one; every job calls `claimProcess`

export type ProcessKind = "import" | "export" | "resume" | "scout_add" | "scout_thumbnails";

export const PROCESS_LABELS: Record<ProcessKind, string> = {
  import: "importing an episode",
  export: "exporting clips",
  resume: "finishing episode clips",
  scout_add: "adding episodes to a Scene Scout database",
  scout_thumbnails: "generating Scene Scout thumbnails",
};

/** the job running right now, read from the state every job already keeps */
export function runningProcess(): ProcessKind | null {
  const s = useAppStateStore.getState();
  if (s.activeOperation === "export") return "export";
  if (s.activeOperation === "scout_add") return "scout_add";
  if (s.activeOperation === "scout_thumbnails") return "scout_thumbnails";
  // an import (a batch included) wins over the re-encode queue running beside it
  if (s.activeOperation === "import" || s.bgImportProgress) return "import";
  // the re-encode queue, between its episodes too
  if (s.resumingEpisodeId || s.reencodeQueue.length > 0) return "resume";
  // an import keeps cutting clips in the background after its loader closes
  if (s.bgProgress) return "import";
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

/** true when nothing runs or the user stopped it; false means don't start */
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

/** stops the running long job (the ✕) and resolves once unwound; used before deleting what it writes to */
export async function stopRunningProcess(): Promise<boolean> {
  if (!runningProcess()) return true;
  await abortRunning?.();
  return waitUntilIdle();
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
  const idle = await stopRunningProcess();
  if (!idle) console.warn("[process] the running job did not stop in time; the new one was not started");
  useProcessConflictStore.setState({ conflict: null, stopping: false });
  conflict.resolve(idle);
}
