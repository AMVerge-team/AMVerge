// fetch-uv.mjs
//
// Stage the `uv` binary the app ships as a Tauri resource. At runtime the Rust
// side uses it to provision the optional AI Python environment (standalone
// CPython + torch + the amverge AI extras) under app data, see
// src-tauri/src/commands/deps.rs. Nothing here is needed to build the sidecar;
// this is purely the runtime installer.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function getBuildTargetTriple() {
  return (
    getArgValue("--target") ||
    process.env.SIDECAR_TARGET_TRIPLE ||
    process.env.TAURI_ENV_TARGET_TRIPLE ||
    process.env.CARGO_BUILD_TARGET ||
    getHostTargetTriple()
  );
}

function getHostTargetTriple() {
  if (process.platform === "win32") return "x86_64-pc-windows-msvc";

  if (process.platform === "darwin") {
    return process.arch === "arm64"
      ? "aarch64-apple-darwin"
      : "x86_64-apple-darwin";
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

// uv publishes one archive per target triple; the name matches the triple we
// already use for the sidecar directories.
function assetNameFor(triple) {
  const ext = triple.includes("windows") ? "zip" : "tar.gz";
  return `uv-${triple}.${ext}`;
}

function downloadUrl(triple) {
  const asset = assetNameFor(triple);
  const version = process.env.AMVERGE_UV_VERSION;
  return version
    ? `https://github.com/astral-sh/uv/releases/download/${version}/${asset}`
    : `https://github.com/astral-sh/uv/releases/latest/download/${asset}`;
}

// Windows ships bsdtar at System32\tar.exe, which reads .zip. Whatever `tar` is
// first on PATH may be GNU tar (Git for Windows), which cannot, so name the
// system one explicitly.
function tarBinary() {
  if (process.platform !== "win32") return "tar";
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const bsdtar = path.join(systemRoot, "System32", "tar.exe");
  return existsSync(bsdtar) ? bsdtar : "tar";
}

// bsdtar (Windows 10+) and GNU tar both extract .zip and .tar.gz, so one code
// path covers every platform we build for. Paths stay relative to `workDir`:
// GNU tar (which Git for Windows puts on PATH) reads an absolute "C:\..." as a
// remote host and fails with "Cannot connect to C".
function extract(workDir, archiveName, destName) {
  const result = spawnSync(tarBinary(), ["-xf", archiveName, "-C", destName], {
    cwd: workDir,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`tar exited with code ${result.status}`);
  }
}

// The Windows zip holds uv.exe at the root; the tarballs nest it inside a
// uv-<triple>/ directory. Walk instead of guessing.
async function findBinary(dir, exeName) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findBinary(full, exeName);
      if (found) return found;
    } else if (entry.name === exeName) {
      return full;
    }
  }
  return null;
}

async function main() {
  const isWindows = process.platform === "win32";
  const triple = getBuildTargetTriple();
  const exeName = triple.includes("windows") ? "uv.exe" : "uv";

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendDir = path.resolve(scriptDir, "..");
  const destDir = path.join(frontendDir, "src-tauri", "bin", "uv", triple);
  const destExe = path.join(destDir, exeName);

  // Already staged (and not forced): keep it. Re-downloading on every build
  // would make offline rebuilds fail for no gain.
  if (!process.argv.includes("--force")) {
    try {
      const stat = await fs.stat(destExe);
      if (stat.isFile() && stat.size > 0) {
        console.log(`uv already staged: ${destExe}`);
        return;
      }
    } catch {
      // Not staged yet, fall through and download.
    }
  }

  const url = downloadUrl(triple);
  console.log(`Downloading uv: ${url}`);

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to download uv (${response.status}): ${url}`);
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "amverge-uv-"));
  try {
    const archiveName = assetNameFor(triple);
    await fs.writeFile(
      path.join(workDir, archiveName),
      Buffer.from(await response.arrayBuffer())
    );

    const extractDir = path.join(workDir, "extract");
    await fs.mkdir(extractDir, { recursive: true });
    extract(workDir, archiveName, "extract");

    const found = await findBinary(extractDir, exeName);
    if (!found) {
      throw new Error(`${exeName} not found inside ${assetNameFor(triple)}`);
    }

    await fs.rm(destDir, { recursive: true, force: true });
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(found, destExe);
    if (!isWindows) await fs.chmod(destExe, 0o755);

    console.log(`Staged uv: ${destExe}`);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
