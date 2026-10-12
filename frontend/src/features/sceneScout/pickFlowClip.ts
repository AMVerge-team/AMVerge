import { open } from "@tauri-apps/plugin-dialog";

import type { FlowSource } from "./types";

const VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "avi", "webm", "m4v"];

/** asks for a video file to run Flow from; null when the picker is cancelled */
export async function pickFlowClip(): Promise<FlowSource | null> {
  const picked = await open({ multiple: false, filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }] });
  if (typeof picked !== "string") return null;
  return { path: picked, label: picked.split(/[/\\]/).pop() ?? picked };
}
