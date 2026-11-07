// tiles sliding under a still pointer while the grid scrolls would each mount a video; hover waits until scrolling settles
const SETTLE_MS = 150;

let scrolling = false;
let settleTimer: number | null = null;
const waiters = new Set<() => void>();

export function noteGridScroll(): void {
  scrolling = true;
  if (settleTimer !== null) window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    settleTimer = null;
    scrolling = false;
    const pending = [...waiters];
    waiters.clear();
    pending.forEach((run) => run());
  }, SETTLE_MS);
}

export function isGridScrolling(): boolean {
  return scrolling;
}

/** runs once scrolling stops; returns a cancel */
export function whenGridScrollSettles(run: () => void): () => void {
  waiters.add(run);
  return () => {
    waiters.delete(run);
  };
}
