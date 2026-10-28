import { useEffect, useRef } from "react";

/**
 * Escape closes whichever dialog or popover is on top, and only that one.
 *
 * every modal registers while it is open; they stack in the order they opened, so a
 * confirm opened over Settings closes before Settings does. the key is taken at the
 * window in the capture phase, before any other listener, so it never also closes
 * the dialog underneath or opens the quick menu behind it. with nothing open it is
 * left alone, and the quick menu's own Escape works as before
 */
const stack: Array<{ close: () => void }> = [];
let listening = false;

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape" || stack.length === 0) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  stack[stack.length - 1].close();
}

/** how many dialogs and popovers are open right now */
export function openOverlayCount(): number {
  return stack.length;
}

/** registers `onClose` as an Escape target while `active` (a busy dialog passes false) */
export function useEscapeToClose(onClose: () => void, active = true): void {
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    if (!active) return;
    if (!listening) {
      window.addEventListener("keydown", onKeyDown, true);
      listening = true;
    }
    const entry = { close: () => latest.current() };
    stack.push(entry);
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
    };
  }, [active]);
}
