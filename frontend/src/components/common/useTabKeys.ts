import { useEffect, useRef } from "react";
import { openOverlayCount } from "./useEscapeToClose";

/** fields that use the arrow and number keys themselves */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(el.type);
}

/** ←/→ step through a window's tabs, 1-9 jump to one, only while nothing sits on top and no field is focused */
export function useTabKeys(keys: string[], active: string, setActive: (key: string) => void): void {
  const latest = useRef({ keys, active, setActive });
  latest.current = { keys, active, setActive };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target) || openOverlayCount() > 1) return;
      const { keys, active, setActive } = latest.current;
      const index = keys.indexOf(active);

      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const step = e.key === "ArrowRight" ? 1 : -1;
        setActive(keys[(index + step + keys.length) % keys.length]);
      } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= keys.length) {
        e.preventDefault();
        setActive(keys[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
