// where the first-visit centrepiece sat when it was first used (the search bar, or the flow
// players); the top layout reads it once on mount and slides its own copy from there
let pending: DOMRect | null = null;

export function setHeroFlip(rect: DOMRect): void {
  pending = rect;
}

/** true while a hero slide is waiting to play, without using it up */
export function heroFlipPending(): boolean {
  return pending !== null;
}

export function takeHeroFlip(): DOMRect | null {
  const rect = pending;
  pending = null;
  return rect;
}

/**
 * slides `el` from where the hero centrepiece was to where it is now. a thin bar
 * (the search field) only stretches sideways; `keepAspect` scales both ways so
 * something with a picture in it (the flow players) is never squashed
 */
export function playHeroFlip(el: HTMLElement | null, keepAspect = false): boolean {
  const from = takeHeroFlip();
  if (!el || !from) return false;
  const to = el.getBoundingClientRect();
  if (!to.width) return false;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width;
  const scale = keepAspect ? `scale(${sx})` : `scaleX(${sx})`;
  el.animate(
    [
      { transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) ${scale}` },
      { transformOrigin: "top left", transform: "none" },
    ],
    { duration: 480, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
  );
  return true;
}
