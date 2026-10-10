// where the hero search bar sat when the first search fired; the top toolbar reads it once
// on mount and slides its own search bar from there, so the bar appears to travel upward
let pending: DOMRect | null = null;

export function setHeroFlip(rect: DOMRect): void {
  pending = rect;
}

export function takeHeroFlip(): DOMRect | null {
  const rect = pending;
  pending = null;
  return rect;
}

/** slides `el` from where the hero bar was to where it is now */
export function playHeroFlip(el: HTMLElement | null): boolean {
  const from = takeHeroFlip();
  if (!el || !from) return false;
  const to = el.getBoundingClientRect();
  if (!to.width) return false;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width;
  el.animate(
    [
      { transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scaleX(${sx})` },
      { transformOrigin: "top left", transform: "none" },
    ],
    { duration: 480, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
  );
  return true;
}
