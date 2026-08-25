import { useEffect, useState } from "react";

import {
  useDiscordAppInfo,
  type DiscordActivity,
  type DiscordAppInfo,
} from "../../hooks/useDiscordRPC";
import localLogo from "../../assets/amverge-logo.png";

/** "07:12" / "1:02:33" — the shape of Discord's own session timer. */
function formatElapsed(startSec: number, nowSec: number) {
  const total = Math.max(0, nowSec - startSec);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  const rest = `${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return hours > 0 ? `${hours}:${rest}` : rest;
}

/**
 * An asset key resolves to the art published on the developer portal; without it
 * Discord falls back to the application icon. The preview makes the same fallback
 * so it never shows an image nobody will see — and drops to the bundled logo when
 * the machine is offline.
 */
function resolveAsset(info: DiscordAppInfo | null, key: string | undefined) {
  if (!key) return null;
  return info?.assets?.[key] ?? null;
}

/**
 * The activity card as it appears on a Discord profile. The content is whatever
 * Rust says it would publish (`status.activity`), never rebuilt here: a second
 * implementation would drift from the real thing the moment a rule changed.
 *
 * Profile buttons are left out on purpose. Discord never renders them on your
 * own profile — only other people see them — so drawing them here would show
 * the user something their own Discord will not.
 */
export default function DiscordPresencePreview({
  activity,
  dim,
}: {
  activity: DiscordActivity | null;
  dim: boolean;
}) {
  const info = useDiscordAppInfo();
  const start = activity?.timestamps?.start;

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [largeBroken, setLargeBroken] = useState(false);
  const [smallBroken, setSmallBroken] = useState(false);

  useEffect(() => {
    if (!start) return;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [start]);

  // A new URL deserves a fresh attempt; without this a single CDN hiccup would
  // stick for the rest of the session.
  const largeUrl = resolveAsset(info, activity?.assets?.large_image) ?? info?.icon ?? null;
  const smallUrl = resolveAsset(info, activity?.assets?.small_image);
  useEffect(() => setLargeBroken(false), [largeUrl]);
  useEffect(() => setSmallBroken(false), [smallUrl]);

  const largeSrc = largeUrl && !largeBroken ? largeUrl : localLogo;
  const showSmall = !!smallUrl && !smallBroken;
  const empty = !activity?.details && !activity?.state && !start;

  return (
    <div className={`discord-preview${dim ? " discord-preview--dim" : ""}`}>
      <p className="discord-preview-heading">Playing a game</p>

      <div className="discord-preview-body">
        <div className="discord-preview-art">
          <img
            className="discord-preview-large"
            src={largeSrc}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setLargeBroken(true)}
          />
          {showSmall && (
            // The small badge overlaps the corner of the large art, exactly as
            // Discord stacks them.
            <img
              className="discord-preview-small"
              src={smallUrl}
              alt=""
              title={activity?.assets?.small_text}
              referrerPolicy="no-referrer"
              onError={() => setSmallBroken(true)}
            />
          )}
        </div>

        <div className="discord-preview-lines">
          {/* The name comes from the developer portal, not from our branding:
              that is the one your friends actually read. */}
          <p className="discord-preview-name">{info?.name || "AMVerge"}</p>
          {activity?.details && <p className="discord-preview-line">{activity.details}</p>}
          {activity?.state && <p className="discord-preview-line">{activity.state}</p>}
          {start ? (
            <p className="discord-preview-line discord-preview-elapsed">
              {formatElapsed(start, now)} elapsed
            </p>
          ) : null}
        </div>
      </div>

      {empty && <p className="discord-preview-empty">Nothing to show yet.</p>}
    </div>
  );
}
