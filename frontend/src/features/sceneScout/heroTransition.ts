// where the first-visit search bar sat when first used; the top layout slides its bar from there
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

/** slides `el` (the search field) from where the hero's bar was to where it is now, stretching sideways only */
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
