/** every video type the import picker, drag-drop, Scene Scout and Flow accept, so they never disagree */
export const VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "webm", "avi", "m4v", "ts"];

export function isVideoPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.includes(ext);
}
