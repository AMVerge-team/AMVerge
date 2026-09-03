import type React from "react";
import { useRef, useState } from "react";

// a click with a shaky hand should stay a click
const DRAG_SLOP_PX = 6;

type DragState = {
  packId: string;
  startX: number;
  startY: number;
  dragging: boolean;
  pointerId: number;
};

/**
 * pointer-driven drag, like the episode panel's. the window intercepts native
 * drag events so `draggable` never fires here: rows are dragged by hand and the
 * row under the cursor is found with elementFromPoint
 */
export function usePackDrag(moveScenepackToFolder: (packId: string, folderId: string | null) => void) {
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // a drag that ends on a row must not also read as a click on it
  const suppressClickRef = useRef(false);

  const dropTargetAt = (clientX: number, clientY: number): string | "root" | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return null;

    const folderEl = el.closest("[data-scenepack-folder-id]") as HTMLElement | null;
    if (folderEl) return folderEl.getAttribute("data-scenepack-folder-id");

    // a pack row counts as its own folder, so dropping onto a sibling files the
    // dragged pack beside it rather than doing nothing
    const packEl = el.closest("[data-scenepack-folder-of]") as HTMLElement | null;
    if (packEl) return packEl.getAttribute("data-scenepack-folder-of") || "root";

    return el.closest('[data-scenepacks-root="true"]') ? "root" : null;
  };

  const beginPackDrag = (packId: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = {
      packId,
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
      }
      setDropTarget(dropTargetAt(ev.clientX, ev.clientY));
    };

    const onUp = (ev: PointerEvent) => {
      const state = dragRef.current;
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDropTarget(null);
      if (!state || ev.pointerId !== state.pointerId || !state.dragging) return;

      suppressClickRef.current = true;
      const target = dropTargetAt(ev.clientX, ev.clientY);
      if (target !== null) {
        moveScenepackToFolder(state.packId, target === "root" ? null : target);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return { dropTarget, beginPackDrag, suppressClickRef };
}
