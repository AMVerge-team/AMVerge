import { useEffect, useState, type RefObject } from "react";

/**
 * React to the button the icon sits in, not to the icon itself.
 *
 * A 14 px glyph covers about a sixth of a 34 px button, so an icon that
 * listens to its own pointer events stays still for most of the area people
 * actually aim at. react-icons had no behaviour of its own and the app's CSS
 * drove everything from `:hover` on the button, which is the behaviour to
 * keep. So each icon finds the nearest thing that is pressed - a button, a
 * link, a label, anything with a click handler - and follows that.
 *
 * Falls back to the svg itself when the icon is not inside one (a decorative
 * glyph in a card header), which is harmless: nothing hovers those anyway.
 */
const HOST = 'button, a, [role="button"], [role="tab"], [role="menuitem"], label, summary';

export function useIconHost(ref: RefObject<SVGSVGElement | null>) {
  const [hovered, setHovered] = useState(false);
  const [tapped, setTapped] = useState(0);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    let host: Element = svg.closest(HOST) ?? svg;
    // A disabled button fires no pointer events at all, so an icon inside one
    // would never react - the sidebar disables the tab you are already on, and
    // the app itself puts its handlers on the row around it for that reason.
    // Follow the same route: listen to the wrapper instead.
    if ((host as HTMLButtonElement).disabled && host.parentElement) {
      host = host.parentElement;
    }

    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    const tap = () => setTapped((n) => n + 1);

    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    // a press, not a click: it has to fire even when the handler stops the event
    host.addEventListener("pointerdown", tap);
    return () => {
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      host.removeEventListener("pointerdown", tap);
    };
  }, [ref]);

  return { hovered, tapped };
}
