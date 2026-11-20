/** Parse and validate announcement video URLs (YouTube or direct video files). */

export type ParsedAnnouncementVideo =
  | {
      kind: "youtube";
      id: string;
      embedUrl: string;
      hoverEmbedUrl: string;
      watchUrl: string;
    }
  | {
      kind: "direct";
      src: string;
    };

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const DIRECT_VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

function extractYouTubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const seg = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return YOUTUBE_ID_RE.test(seg) ? seg : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && YOUTUBE_ID_RE.test(v)) return v;
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      parts.length >= 2 &&
      (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") &&
      YOUTUBE_ID_RE.test(parts[1])
    ) {
      return parts[1];
    }
  }
  return null;
}

export function parseAnnouncementVideo(raw: string | null | undefined): ParsedAnnouncementVideo | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const ytId = extractYouTubeId(url);
  if (ytId) {
    return {
      kind: "youtube",
      id: ytId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1`,
      hoverEmbedUrl: `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&modestbranding=1&rel=0`,
      watchUrl: `https://www.youtube.com/watch?v=${ytId}`,
    };
  }

  if (DIRECT_VIDEO_EXT_RE.test(url.pathname)) {
    return {
      kind: "direct",
      src: url.toString(),
    };
  }

  return null;
}

export function isValidAnnouncementVideoUrl(raw: string): boolean {
  return parseAnnouncementVideo(raw) !== null;
}
