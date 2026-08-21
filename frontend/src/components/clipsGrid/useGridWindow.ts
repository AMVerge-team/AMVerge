import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type GridWindowArgs = {
  scrollRef: React.RefObject<HTMLElement | null>;
  /** State, not a ref: the grid remounts on import, and the observers have to
   *  rebind to the new element when it does. */
  gridEl: HTMLDivElement | null;
  itemCount: number;
  columns: number;
  /** Rows kept mounted above and below the viewport. */
  overscanRows?: number;
};

export type GridWindow = {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
};

/** Rows rendered before the first measurement lands. */
const SEED_ROWS = 4;

/**
 * Windows a uniform CSS grid: only the rows near the viewport stay mounted, and
 * the rest is replaced by padding on the grid itself (padding adds no extra gap,
 * unlike spacer children). An episode with a thousand scenes mounts a few dozen
 * tiles instead of a thousand IntersectionObservers and video elements.
 */
export function useGridWindow({
  scrollRef,
  gridEl,
  itemCount,
  columns,
  overscanRows = 3,
}: GridWindowArgs): GridWindow {
  const [window_, setWindow] = useState<GridWindow>({
    start: 0,
    end: Math.min(itemCount, SEED_ROWS * Math.max(1, columns)),
    padTop: 0,
    padBottom: 0,
  });

  // Measured once per layout: row pitch (tile + gap), the grid's offset inside
  // the scroller, and the grid's own padding before we start adding to it.
  const rowPitchRef = useRef(0);
  const gridTopRef = useRef(0);
  const basePadRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    const scroller = scrollRef.current;
    const grid = gridEl;
    const firstTile = grid?.firstElementChild as HTMLElement | null;
    if (!scroller || !grid || !firstTile) return false;

    const styles = getComputedStyle(grid);
    if (basePadRef.current === null) {
      basePadRef.current = parseFloat(styles.paddingTop) || 0;
    }
    const gap = parseFloat(styles.rowGap) || 0;
    const tileHeight = firstTile.getBoundingClientRect().height;
    if (tileHeight <= 0) return false;

    rowPitchRef.current = tileHeight + gap;
    gridTopRef.current =
      grid.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop +
      basePadRef.current;
    return true;
  }, [gridEl, scrollRef]);

  const update = useCallback(() => {
    const scroller = scrollRef.current;
    const pitch = rowPitchRef.current;
    if (!scroller || itemCount === 0) return;
    if (pitch <= 0) {
      // unmeasured: keep a seed batch on screen rather than collapsing to none
      setWindow((prev) =>
        prev.end > 0
          ? prev
          : {
              start: 0,
              end: Math.min(itemCount, SEED_ROWS * Math.max(1, columns)),
              padTop: 0,
              padBottom: 0,
            }
      );
      return;
    }

    const cols = Math.max(1, columns);
    const rows = Math.ceil(itemCount / cols);
    const viewTop = scroller.scrollTop - gridTopRef.current;
    const viewBottom = viewTop + scroller.clientHeight;

    const firstRow = Math.max(0, Math.floor(viewTop / pitch) - overscanRows);
    const lastRow = Math.min(rows, Math.ceil(viewBottom / pitch) + overscanRows);

    setWindow((prev) => {
      const next = {
        start: firstRow * cols,
        end: Math.min(itemCount, lastRow * cols),
        padTop: firstRow * pitch,
        padBottom: Math.max(0, (rows - lastRow) * pitch),
      };
      return prev.start === next.start &&
        prev.end === next.end &&
        prev.padTop === next.padTop &&
        prev.padBottom === next.padBottom
        ? prev
        : next;
    });
  }, [columns, itemCount, overscanRows, scrollRef]);

  const schedule = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      update();
    });
  }, [update]);

  // Re-measure whenever the layout inputs change; tile height follows column
  // count and container width, so both invalidate the pitch.
  useLayoutEffect(() => {
    if (measure()) {
      update();
      return;
    }
    // Nothing to measure yet - the pitch comes from a rendered tile, so an empty
    // window can never measure its way out. Seed a first batch to break that.
    if (itemCount > 0) {
      setWindow((prev) => {
        const seedEnd = Math.min(itemCount, SEED_ROWS * Math.max(1, columns));
        return prev.end >= seedEnd
          ? prev
          : { start: 0, end: seedEnd, padTop: 0, padBottom: 0 };
      });
    }
  }, [measure, update, columns, itemCount]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !gridEl) return;

    scroller.addEventListener("scroll", schedule, { passive: true });

    const observer = new ResizeObserver(() => {
      if (measure()) update();
    });
    observer.observe(scroller);
    observer.observe(gridEl);

    return () => {
      scroller.removeEventListener("scroll", schedule);
      observer.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [gridEl, measure, schedule, scrollRef, update]);

  return window_;
}
