import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const windows = process.platform === "win32";
const triple = process.env.SIDECAR_TARGET_TRIPLE || (windows
  ? "x86_64-pc-windows-msvc"
  : `${process.arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`);
const sidecar = path.join(frontend, "src-tauri", "bin", `amverge-${triple}`);
const exe = (name) => `${name}${windows ? ".exe" : ""}`;
const cli = path.join(sidecar, exe("amverge"));
const ffmpeg = path.join(sidecar, "_internal", exe("ffmpeg"));
const ffprobe = path.join(sidecar, "_internal", exe("ffprobe"));

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${path.basename(command)} failed:\n${result.stderr}`);
  return result;
}

for (const file of [cli, ffmpeg, ffprobe]) assert.ok(existsSync(file), `missing ${file}`);

const root = mkdtempSync(path.join(tmpdir(), "amverge-中文导入-"));
try {
  const video = path.join(root, "测试 视频.mp4");
  const output = path.join(root, "切分 结果");
  run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=duration=3:size=160x90:rate=24",
    "-c:v", "libx264", "-g", "24", "-keyint_min", "24", "-sc_threshold", "0",
    "-pix_fmt", "yuv420p", "-an", video,
  ]);

  const result = run(cli, ["backend", video, output, "keyframe_detection", "video_files"]);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.scenes.length, 3, "one scene per one-second keyframe interval");
  const lines = result.stderr.split(/\r?\n/);
  const initialLine = lines.find((line) => line.startsWith("INITIAL_CLIPS_READY|"));
  assert.ok(initialLine, "the frontend receives its initial clip list");
  const initial = JSON.parse(initialLine.slice("INITIAL_CLIPS_READY|".length));
  assert.equal(initial.length, 3);
  assert.equal(lines.filter((line) => line.startsWith("CLIP_READY|")).length, 3);
  assert.ok(lines.includes("PHASE1_COMPLETE"), "the import releases its progress window");

  for (const [index, scene] of payload.scenes.entries()) {
    assert.ok(Math.abs(scene.start_sec - index) < 0.1, "scene starts at its keyframe");
    assert.ok(Math.abs(scene.end_sec - index - 1) < 0.1, "scene ends at the next boundary");
    assert.ok(statSync(scene.clip_path).size > 0, "the cut video exists");
    const thumbnail = scene.thumbnail || initial[index].thumbnail;
    assert.ok(thumbnail && statSync(thumbnail).size > 0, "the grid poster exists");
    const probe = JSON.parse(run(ffprobe, [
      "-v", "error", "-select_streams", "v:0", "-show_entries",
      "stream=codec_name,width,height:format=duration", "-of", "json", scene.clip_path,
    ]).stdout);
    assert.equal(probe.streams[0].codec_name, "h264");
    assert.equal(probe.streams[0].width, 160);
    assert.equal(probe.streams[0].height, 90);
    assert.ok(Math.abs(Number(probe.format.duration) - 1) < 0.15, "each cut contains one second of video");
  }
  console.log("sidecar import check passed: Chinese/spaced paths, 3 playable cuts, posters, and streaming IPC events");
} finally {
  rmSync(root, { recursive: true, force: true });
}
