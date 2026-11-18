import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

// startup splash: the wordmark lifts away to reveal the app; unmounted after, skippable by click or key

const FADE_IN_MS = 900;
const HOLD_MS = 900;
const FADE_OUT_MS = 550;

interface SplashScreenProps {
  /** called once the exit animation has finished and it can be unmounted */
  onFinished: () => void;
}

export default function SplashScreen({ onFinished }: SplashScreenProps) {
  const { t } = useTranslation("shell");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // one timer chain cleared together, so a fast skip can't leave a late unmount
    const timers: number[] = [];

    const leave = () => {
      setLeaving(true);
      timers.push(window.setTimeout(onFinished, FADE_OUT_MS));
    };

    timers.push(window.setTimeout(leave, FADE_IN_MS + HOLD_MS));

    const skip = () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", skip);
      timers.forEach(window.clearTimeout);
      timers.length = 0;
      leave();
    };

    // a held key's repeats never skip it
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      skip();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", skip);

    return () => {
      timers.forEach(window.clearTimeout);
      window.removeEventListener("keydown", onKey);
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
        <p className="splash-tagline">{t("splash.tagline")}</p>
      </div>
    </div>
  );
}
