import { useEffect, useRef } from "react";

/** Escape closes only the topmost open dialog; taken at the window in capture phase so nothing underneath also reacts */
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
