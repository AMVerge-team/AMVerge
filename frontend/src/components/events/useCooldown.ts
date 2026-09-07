import { useEffect, useState } from "react";

/**
 * Counts a deadline down to zero, one tick a second.
 *
 * The deadline is an epoch millisecond value derived from the seconds the
 * server sent plus this machine's clock at the moment it arrived, so the two
 * clocks never have to agree.
 *
 * Server-side checks are still the real limit; this only drives what the button
 * looks like.
 */
export function useCooldown(until: number | null): number {
  const [remaining, setRemaining] = useState(() => secondsLeft(until));

  useEffect(() => {
    setRemaining(secondsLeft(until));
    if (until === null) return;

    const timer = window.setInterval(() => {
      const next = secondsLeft(until);
      setRemaining(next);
      if (next <= 0) window.clearInterval(timer);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [until]);

  return remaining;
}

function secondsLeft(until: number | null): number {
  if (until === null) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export function formatCooldown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
