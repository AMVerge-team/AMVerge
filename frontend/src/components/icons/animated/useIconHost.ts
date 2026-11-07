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

function findControl(svg: SVGSVGElement): Element | null {
  let el: Element | null = svg.parentElement;
  for (let up = 0; el && up < MAX_UP; up += 1, el = el.parentElement) {
    if (pressable(el)) return el;
  }
  return null;
}

function hostFor(control: Element): Element {
  // A disabled button fires no pointer events at all, so an icon inside one
  // would never react - the sidebar disables the tab you are already on, and
  // the app itself puts its handlers on the row around it for that reason.
  // Follow the same route: listen to the wrapper instead.
  let host: Element = control;
  while (host.parentElement && cannotFire(host)) {
    // only a wrapper hugging the button: a whole toolbar row would animate this icon for every button in it
    if ((host as HTMLButtonElement).disabled && !hugs(host.parentElement, host)) break;
    host = host.parentElement;
  }
  return host;
}

function hugs(outer: Element, inner: Element) {
  const a = outer.getBoundingClientRect();
  const b = inner.getBoundingClientRect();
  return a.width * a.height <= b.width * b.height * 2;
}

// a none inherited from a parent means hidden for now (hover-revealed controls), so the control itself is still the host
function cannotFire(el: Element) {
  if ((el as HTMLButtonElement).disabled) return true;
  return (
    getComputedStyle(el).pointerEvents === "none" &&
    (!el.parentElement || getComputedStyle(el.parentElement).pointerEvents !== "none")
  );
}

export function useIconHost(ref: RefObject<SVGSVGElement | null>) {
  const [hovered, setHovered] = useState(false);
  const [tapped, setTapped] = useState(0);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const control = findControl(svg);

    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    const tap = () => setTapped((n) => n + 1);

    let host: Element | null = null;
    const unbind = () => {
      if (!host) return;
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      host.removeEventListener("pointerdown", tap);
    };
    const bind = () => {
      unbind();
      host = control ? hostFor(control) : svg.parentElement ?? svg;
      host.addEventListener("pointerenter", enter);
      host.addEventListener("pointerleave", leave);
      host.addEventListener("pointercancel", leave);
      // a press, not a click: it has to fire even when the handler stops the event
      host.addEventListener("pointerdown", tap);
    };

    bind();
    // a button disabled only for a moment (refresh while loading) must get its own events back
    const observer = new MutationObserver(() => {
      setHovered(false);
      bind();
    });
    if (control) observer.observe(control, { attributes: true, attributeFilter: ["disabled"] });
    return () => {
      observer.disconnect();
      unbind();
    };
  }, [ref]);

  return { hovered, tapped };
}
