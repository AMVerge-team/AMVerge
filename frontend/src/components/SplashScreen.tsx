import { useEffect, useState } from "react";

/**
 * Startup splash: the wordmark in the user's accent colour, a subtitle, then it
 * lifts away to reveal the app.
 *
 * Mounted over everything and unmounted once it has finished, so nothing it
 * draws stays in the tree or keeps an animation running. Skippable by a click
 * or any key, because a splash a user has already read is an obstacle.
 */

const FADE_IN_MS = 900;
const HOLD_MS = 900;
const FADE_OUT_MS = 550;

interface SplashScreenProps {
  /** called once the exit animation has finished and it can be unmounted */
  onFinished: () => void;
}

export default function SplashScreen({ onFinished }: SplashScreenProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // one timer chain, cleared together, so a fast skip cannot leave a pending
    // callback that unmounts the splash after the app is already interactive
    const timers: number[] = [];

    const leave = () => {
      setLeaving(true);
      timers.push(window.setTimeout(onFinished, FADE_OUT_MS));
    };

    timers.push(window.setTimeout(leave, FADE_IN_MS + HOLD_MS));

    const skip = () => {
      timers.forEach(window.clearTimeout);
      timers.length = 0;
      leave();
    };

    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, { once: true });

    return () => {
      timers.forEach(window.clearTimeout);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [onFinished]);

  return (
    <div className={`splash${leaving ? " splash-leaving" : ""}`} role="presentation">
      <div className="splash-inner">
        {/* split the same way the navbar does: accent "AMV", white "erge" */}
        <h1 className="splash-logo">
          <span>AMV</span>erge
        </h1>
        <p className="splash-tagline">Scene selection made easy.</p>
      </div>
    </div>
  );
}
