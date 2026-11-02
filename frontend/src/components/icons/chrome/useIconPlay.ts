import { useEffect, useRef, useState } from "react";
import { useIconHost } from "../animated/useIconHost";

/**
 * The play state of a hand-drawn chrome icon, on the same terms as the
 * generated pack: hover holds its clip until the pointer leaves, a press
 * runs once and returns on a timer.
 *
 * The timer is not onAnimationComplete: that handler sits on the parent svg,
 * which animates nothing and finishes at once, cutting the children short.
 */
export function useIconPlay(pressMs: number) {
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  const [playing, setPlaying] = useState<"rest" | "hover" | "press">("rest");

  useEffect(() => {
    setPlaying((now) =>
      hovered ? (now === "rest" ? "hover" : now) : now === "hover" ? "rest" : now,
    );
  }, [hovered]);

  useEffect(() => {
    if (!tapped) return;
    setPlaying("press");
    const done = setTimeout(() => setPlaying("rest"), pressMs);
    return () => clearTimeout(done);
  }, [tapped, pressMs]);

  return { hostRef, playing };
}
