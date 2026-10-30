import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { exportForV2, useV2UpgradeStore } from "../stores/v2UpgradeStore";

const FALLBACK_NOTES = [
  "- **AI Scene Detection** finds cuts more accurately than keyframes",
  "- **Scene Scout**: search your episodes by describing a scene",
  "- **Scenepacks**, post-export passes, and a faster, redesigned app",
].join("\n");

type Stage = { kind: "idle" } | { kind: "downloading"; percent: number | null } | { kind: "installing" } | { kind: "error"; message: string };

/** offers AMVerge 2 in place of the usual update dialog, and installs it from inside the app */
export default function V2UpgradeModal() {
  const update = useV2UpgradeStore((s) => s.update);
  const dismissed = useV2UpgradeStore((s) => s.dismissed);
  const dismiss = useV2UpgradeStore((s) => s.dismiss);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  if (!update || dismissed) return null;
  const busy = stage.kind === "downloading" || stage.kind === "installing";

  const install = async () => {
    setStage({ kind: "downloading", percent: null });
    try {
      // fresh export right before V1 is replaced, so nothing changed since launch is lost
      await exportForV2();

      let total = 0;
      let received = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          setStage({ kind: "downloading", percent: total ? Math.round((received / total) * 100) : null });
        }
        if (event.event === "Finished") setStage({ kind: "installing" });
      });
    } catch (error) {
      console.error("[v2-upgrade] install failed:", error);
      setStage({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <div className="startup-notification-overlay" role="dialog" aria-modal="true" aria-labelledby="v2-upgrade-title">
      <div className="startup-notification-modal startup-notification-modal--update">
        {!busy ? (
          <button type="button" className="startup-notification-icon-close" aria-label="Later" onClick={dismiss}>
            x
          </button>
        ) : null}

        <h2 id="v2-upgrade-title" className="startup-notification-title">
          AMVerge 2 is here
        </h2>

        <div className="startup-notification-body startup-notification-body--update">
          <ReactMarkdown>{update.body?.trim() || FALLBACK_NOTES}</ReactMarkdown>
          <p>Your settings and episodes come with you. AMVerge 2 replaces this version once it installs.</p>
        </div>

        {stage.kind === "downloading" ? (
          <p className="startup-notification-body">
            Downloading{stage.percent !== null ? ` ${stage.percent}%` : "…"}
          </p>
        ) : null}
        {stage.kind === "installing" ? (
          <p className="startup-notification-body">
            Installing… AMVerge will close and AMVerge 2 will open.
          </p>
        ) : null}
        {stage.kind === "error" ? (
          <p className="startup-notification-body">Couldn't install AMVerge 2: {stage.message}</p>
        ) : null}

        <div className="startup-notification-actions">
          <button type="button" className="startup-notification-close" onClick={dismiss} disabled={busy}>
            Later
          </button>
          <button type="button" className="startup-notification-close" onClick={() => void install()} disabled={busy}>
            {stage.kind === "error" ? "Try again" : "Download & install"}
          </button>
        </div>
      </div>
    </div>
  );
}
