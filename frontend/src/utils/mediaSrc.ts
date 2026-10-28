import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Turn a thumbnail reference into something an `<img>` can load.
 *
 * Almost every thumbnail in the app is a path on disk, which has to go through
 * `convertFileSrc` to be readable from the WebView. Scene Scout is the
 * exception: its thumbnails come back inline from the CLI as base64, already in
 * a form the browser understands, and running `convertFileSrc` over a `data:`
 * URL mangles it into a path that resolves to nothing.
 *
 * Anything already a URL is passed through untouched.
 */
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

/**
 * The thumbnail only if it is an actual image (a file or an inline `data:` URL).
 *
 * WebP-mode episodes imported before the fix carry the source video as their
 * "thumbnail". An `<img>` cannot ask for a byte range, so pointing one at a video
 * made the app read the whole episode into memory for every tile, and it crashed.
 */
export function imageThumbnail(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith("data:") || IMAGE_FILE.test(path.split("?")[0]) ? path : undefined;
}

/**
 * As above, with the import token appended for cache busting.
 *
 * A `data:` URL carries its own content, so a token would only bloat it and
 * defeat the browser's own caching; it is left off in that case.
 */
export function mediaSrcVersioned(pathOrUrl: string, token: string | number): string {
  const resolved = mediaSrc(pathOrUrl);
  return resolved.startsWith("data:") ? resolved : `${resolved}?v=${token}`;
}
