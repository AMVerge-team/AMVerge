import { convertFileSrc } from "@tauri-apps/api/core";

/** a thumbnail an <img> can load: paths through convertFileSrc, urls (incl. scout's data urls) untouched */
export function mediaSrc(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (
    pathOrUrl.startsWith("data:") ||
    pathOrUrl.startsWith("blob:") ||
    pathOrUrl.startsWith("http:") ||
    pathOrUrl.startsWith("https:")
  ) {
    return pathOrUrl;
  }
  return convertFileSrc(pathOrUrl);
}

const IMAGE_FILE = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

/** the thumbnail only if it's an image; old WebP episodes stored the video, which an <img> reads whole */
export function imageThumbnail(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith("data:") || IMAGE_FILE.test(path.split("?")[0]) ? path : undefined;
}

/** as above with the import token for cache busting, skipped for data urls */
export function mediaSrcVersioned(pathOrUrl: string, token: string | number): string {
  const resolved = mediaSrc(pathOrUrl);
  return resolved.startsWith("data:") ? resolved : `${resolved}?v=${token}`;
}
