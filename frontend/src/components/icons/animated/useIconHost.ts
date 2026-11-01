import { useEffect, useState, type RefObject } from "react";

/**
 * React to the control the icon sits in, not to the icon itself.
 *
 * A 14 px glyph covers about a sixth of a 34 px button, so an icon that
 * listens to its own pointer events stays still for most of the area people
 * actually aim at. react-icons had no behaviour of its own and the app's CSS
 * drove everything from `:hover` on the button, which is the behaviour to
 * keep. So each icon walks up to the nearest thing that is pressed and
 * follows that.
 *
 * Half the app's controls are not buttons: episode rows, dropdown items,
 * video controls and the clip tiles are divs with an onClick, which the DOM
 * cannot be asked about. A computed `cursor: pointer` is the mark the app
 * puts on every one of them, so that counts as a host too - without it those
 * icons fell back to the svg and read as frozen.
 */
const HOST = 'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], label, summary, [tabindex]:not([tabindex="-1"])';
const MAX_UP = 6;

function pressable(el: Element) {
  if (el.matches(HOST)) return true;
  const cs = getComputedStyle(el);
  return cs.cursor === "pointer" && cs.pointerEvents !== "none";
}

function findHost(svg: SVGSVGElement): Element {
  let el: Element | null = svg.parentElement;
  for (let up = 0; el && up < MAX_UP; up += 1, el = el.parentElement) {
    if (!pressable(el)) continue;
    // A disabled button fires no pointer events at all, so an icon inside one
    // would never react - the sidebar disables the tab you are already on, and
    // the app itself puts its handlers on the row around it for that reason.
    // Follow the same route: listen to the wrapper instead.
    let host: Element = el;
    while (
      ((host as HTMLButtonElement).disabled ||
        getComputedStyle(host).pointerEvents === "none") &&
      host.parentElement
    ) {
      host = host.parentElement;
    }
    return host;
  }
  return svg.parentElement ?? svg;
}

export function useIconHost(ref: RefObject<SVGSVGElement | null>) {
  const [hovered, setHovered] = useState(false);
  const [tapped, setTapped] = useState(0);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const host = findHost(svg);

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
