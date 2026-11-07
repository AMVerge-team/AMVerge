import { useEffect } from "react";

import { useContextMenuStore } from "../stores/contextMenuStore";

// every right-click menu in the app renders with this class
const MENU = ".episode-context-menu";
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

function insideMenu(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(MENU) !== null;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** scrolling the page closes an open right-click menu, so it never floats over content that moved; a long menu still scrolls itself */
export default function useContextMenuCloseOnScroll() {
  useEffect(() => {
    const closeIfOpen = () => {
      if (document.querySelector(MENU)) useContextMenuStore.getState().closeAllContextMenus();
    };

    const onWheel = (e: WheelEvent) => {
      if (!insideMenu(e.target)) closeIfOpen();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key) && !isTyping(e.target)) closeIfOpen();
    };

    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
}
