// stub-sidecar.mjs
//
// The platform config lists the release sidecar as bundle resources, and
// tauri_build checks that every resource exists at compile time, `tauri dev`
// included. The sidecar is a 400+ MB PyInstaller build that a dev build never
// runs (sidecar.rs sends debug builds to the CLI venv), so without this a fresh
// clone cannot start the app until it builds one.
//
//   node stub-sidecar.mjs           stand in empty files for any that are missing
//   node stub-sidecar.mjs --check   fail if any are missing or still stand-ins,
//                                   so a stand-in can never ship in a release

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TAURI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src-tauri");

// the file Tauri merges on its own for this OS, which is the one `tauri dev` reads
const PLATFORM_CONFIG = {
  win32: "tauri.windows.conf.json",
  darwin: "tauri.macos.conf.json",
  linux: "tauri.linux.conf.json",
}[process.platform];

function resources() {
  if (!PLATFORM_CONFIG) return [];
  const file = path.join(TAURI_DIR, PLATFORM_CONFIG);
  if (!existsSync(file)) return [];
  const list = JSON.parse(readFileSync(file, "utf8")).bundle?.resources ?? [];
  return Array.isArray(list) ? list : Object.keys(list);
}

const toPosix = (p) => p.replace(/\\/g, "/");
const isGlob = (p) => p.includes("*");

const isUv = (p) => toPosix(p).startsWith("bin/uv/");
const globRoot = (p) => {
  const parts = toPosix(p).split("/");
  return parts.slice(0, parts.findIndex((s) => s.includes("*"))).join("/");
};

function stub() {
  const created = [];
  for (const rel of resources()) {
    if (isUv(rel)) continue;
    if (isGlob(rel)) {
      mkdirSync(path.join(TAURI_DIR, globRoot(rel)), { recursive: true });
      continue;
    }
    const abs = path.join(TAURI_DIR, rel);
    if (existsSync(abs)) continue;
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, "");
    created.push(rel);
  }

  if (!created.length) return;
  console.log("Stood in empty files for the release sidecar, which tauri dev never runs:");
  for (const rel of created) console.log("  " + rel);
  console.log("`npm run build:sidecar` replaces them with the real build.");
}

// named files only. a real `_internal` legitimately holds empty files such as
// `py.typed`, so a glob's matches cannot be judged by size
function check() {
  const problems = [];
  for (const rel of resources()) {
    if (isGlob(rel)) continue;
    const abs = path.join(TAURI_DIR, rel);
    if (!existsSync(abs)) problems.push(rel + " is missing");
    else if (statSync(abs).size === 0) problems.push(rel + " is an empty dev stand-in");
  }

  if (!problems.length) return;
  console.error("Refusing to build a release without the real sidecar:");
  for (const p of problems) console.error("  " + p);
  console.error("Run `npm run build:sidecar` (and `npm run fetch:uv`) first.");
  process.exit(1);
}

if (process.argv.includes("--check")) check();
else stub();
