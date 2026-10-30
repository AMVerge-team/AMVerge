import { useEffect, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-shell";

import {
  useDiscordAppInfo,
  type DiscordActivity,
  type DiscordAppInfo,
} from "../../hooks/useDiscordRPC";
import Tooltip from "../common/Tooltip";
import localLogo from "../../assets/amverge-logo.png";

/** "07:12" / "1:02:33": the shape of Discord's own session timer */
function formatElapsed(startSec: number, nowSec: number) {
  const total = Math.max(0, nowSec - startSec);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  const rest = `${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return hours > 0 ? `${hours}:${rest}` : rest;
}

function resolveAsset(info: DiscordAppInfo | null, key: string | undefined) {
  return key ? info?.assets?.[key] ?? null : null;
}

/** clickable when the activity has a url for this element; the destination shows in a tooltip */
function Linked({
  url,
  className,
  children,
}: {
  url?: string;
  className: string;
  children: ReactNode;
}) {
  if (!url) return <div className={className}>{children}</div>;
  return (
    <Tooltip content={url} maxWidth={320}>
      <button
        type="button"
        className={`${className} discord-preview-linked`}
        onClick={() => void open(url).catch(() => {})}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** the activity card as on a Discord profile, rendering the exact payload rust publishes */
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

  // falls back like Discord: named asset, app icon, then the bundled logo offline
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
          <Linked url={activity?.assets?.large_url} className="discord-preview-large-wrap">
            <img
              className="discord-preview-large"
              src={largeSrc}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setLargeBroken(true)}
            />
          </Linked>
          {showSmall && (
            <Linked url={activity?.assets?.small_url} className="discord-preview-small-wrap">
              <img
                className="discord-preview-small"
                src={smallUrl}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setSmallBroken(true)}
              />
            </Linked>
          )}
        </div>

        <div className="discord-preview-lines">
          {/* The name comes from the developer portal, not from our branding:
              that is the one your friends actually read. */}
          <p className="discord-preview-name">{info?.name || "AMVerge"}</p>
          {activity?.details && (
            <Linked url={activity.details_url} className="discord-preview-line">
              {activity.details}
            </Linked>
          )}
          {activity?.state && (
            <Linked url={activity.state_url} className="discord-preview-line">
              {activity.state}
            </Linked>
          )}
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
