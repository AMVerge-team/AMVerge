import type React from "react";
import { useRef, useState } from "react";

// a click with a shaky hand should stay a click
const DRAG_SLOP_PX = 6;

export type ScoutList = "search" | "all";

type DragState = {
  from: ScoutList;
  getPaths: () => string[];
  paths: string[];
  startX: number;
  startY: number;
  dragging: boolean;
  pointerId: number;
};

/**
 * pointer-driven drag between the panel's two lists, like usePackDrag. the
 * window intercepts native drag events, so rows are dragged by hand and the list
 * under the cursor is found with elementFromPoint via `data-scout-list`
 */
export function useScoutDbDrag(onDrop: (paths: string[], to: ScoutList) => void) {
  const [dropList, setDropList] = useState<ScoutList | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; count: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // a drag that ends on a row must not also read as a click on it
  const suppressClickRef = useRef(false);

  const listAt = (x: number, y: number): ScoutList | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const list = el?.closest("[data-scout-list]")?.getAttribute("data-scout-list");
    return list === "search" || list === "all" ? list : null;
  };

  const beginDrag = (from: ScoutList, getPaths: () => string[]) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = {
      from,
      getPaths,
      paths: [],
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      pointerId: e.pointerId,
    };

    const onMove = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state || ev.pointerId !== state.pointerId) return;
      if (!state.dragging) {
        const travelled = Math.abs(ev.clientX - state.startX) + Math.abs(ev.clientY - state.startY);
        if (travelled <= DRAG_SLOP_PX) return;
        state.dragging = true;
        state.paths = state.getPaths();
      }
      const over = listAt(ev.clientX, ev.clientY);
      setDropList(over && over !== state.from ? over : null);
      setGhost({ x: ev.clientX, y: ev.clientY, count: state.paths.length });
    };

    const onUp = (ev: PointerEvent) => {
      const state = dragRef.current;
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDropList(null);
      setGhost(null);
      if (!state || ev.pointerId !== state.pointerId || !state.dragging) return;

      suppressClickRef.current = true;
      const target = listAt(ev.clientX, ev.clientY);
      if (target && target !== state.from && state.paths.length) onDrop(state.paths, target);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return { dropList, ghost, beginDrag, suppressClickRef };
}
