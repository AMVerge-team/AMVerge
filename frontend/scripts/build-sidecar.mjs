// build-sidecar.mjs

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.error) throw result.error;

  if (result.status !== 0) {
    throw new Error(`${cmd} exited with code ${result.status}`);
  }
}

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
    getRustTargetTriple()
  );
}

function getRustTargetTriple() {
  if (process.platform === "win32") return "x86_64-pc-windows-msvc";

  if (process.platform === "darwin") {
    return process.arch === "arm64"
      ? "aarch64-apple-darwin"
      : "x86_64-apple-darwin";
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

// Resolve an ffmpeg-family tool: prefer the explicit bin dir (CI stages the
// binaries there and sets FFMPEG_BIN_DIR), else fall back to PATH so a local
// dev with ffmpeg installed can build the sidecar without staging anything.
function resolveTool(binDir, toolName, isWindows) {
  const exeName =
    isWindows && !toolName.toLowerCase().endsWith(".exe")
      ? `${toolName}.exe`
      : toolName;

  const staged = path.join(binDir, exeName);
  if (existsSync(staged)) return staged;

  const whichCmd = isWindows ? "where" : "which";
  const result = spawnSync(whichCmd, [exeName], { encoding: "utf8" });
  if (result.status === 0 && result.stdout) {
    const first = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (first && existsSync(first)) return first;
  }

  throw new Error(
    `Could not find ${exeName}. Set FFMPEG_BIN_DIR to a directory containing ` +
      `ffmpeg and ffprobe, or install them on PATH. Looked in "${binDir}" and PATH.`
  );
}

async function main() {
  const isWindows = process.platform === "win32";
  const triple = getBuildTargetTriple();

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendDir = path.resolve(scriptDir, "..");
  const repoRoot = path.resolve(frontendDir, "..");

  // Local CLI checkout: used ONLY to build the default (dev) install spec, so
  // local CLI edits flow into the app. CI installs the published wheel via
  // AMVERGE_CLI_INSTALL_SPEC and never touches this path.
  const cliDir = process.env.AMVERGE_CLI_DIR || path.join(repoRoot, "AMVerge-CLI");

  // Neutral working dir for the packaging step (build venv + PyInstaller output),
  // independent of the CLI source so PyPI installs need no CLI checkout in CI.
  const buildRoot =
    process.env.AMVERGE_SIDECAR_BUILD_DIR ||
    path.join(frontendDir, ".sidecar-build");

  // The CLI is installed into an isolated build venv (not the editable dev venv)
  // so the bundle is a clean, reproducible install. AMVERGE_BUILD_VENV can point
  // at an existing venv to reuse it.
  const buildVenvDir =
    process.env.AMVERGE_BUILD_VENV || path.join(buildRoot, ".venv-build");
  const venvBin = isWindows ? "Scripts" : "bin";
  const buildPython = isWindows
    ? path.join(buildVenvDir, venvBin, "python.exe")
    : path.join(buildVenvDir, venvBin, "python");

  // PyInstaller entry: a tiny launcher kept in the app repo so the CLI repo is
  // never modified just to be packaged. It imports amverge from the CLI venv.
  const entryScript = path.join(scriptDir, "amverge_entry.py");

  // ffmpeg/ffprobe ship inside the sidecar _internal (both the CLI and Rust
  // resolve them there). CI stages them and sets FFMPEG_BIN_DIR; a local dev
  // falls back to whatever ffmpeg/ffprobe are on PATH.
  const ffmpegBinDir =
    process.env.FFMPEG_BIN_DIR || path.join(frontendDir, ".ffmpeg-bin");

  const distDir = path.join(buildRoot, "dist", "amverge");

  const tauriSidecarDir = path.join(
    frontendDir,
    "src-tauri",
    "bin",
    `amverge-${triple}`
  );

  const sep = isWindows ? ";" : ":";

  const ffmpegBin = resolveTool(ffmpegBinDir, "ffmpeg", isWindows);
  const ffprobeBin = resolveTool(ffmpegBinDir, "ffprobe", isWindows);

  // --- Provision the build venv and install the CLI via pip ------------------
  const basePython = process.env.PYTHON || (isWindows ? "python" : "python3");
  const extras = process.env.AMVERGE_CLI_EXTRAS || "edge,discord,dev";
  const installSpec =
    process.env.AMVERGE_CLI_INSTALL_SPEC || `${cliDir}[${extras}]`;
  const torchIndexUrl = process.env.AMVERGE_TORCH_INDEX_URL ?? "";
  const neluxSpec = process.env.AMVERGE_NELUX_SPEC ?? "";

  // Fat bundle (the pre-optional-deps behaviour): only when torch is asked for
  // explicitly. Otherwise torch must not end up in the sidecar at all.
  const withMl =
    /(^|[,[])ml($|[,\]])/.test(extras) ||
    /\[[^\]]*\bml\b[^\]]*\]/.test(installSpec) ||
    Boolean(torchIndexUrl);

  const isX64Mac =
    process.platform === "darwin" && triple === "x86_64-apple-darwin";
  const runPython = (pythonExe, pythonArgs, options = {}) => {
    if (isX64Mac) {
      run("arch", ["-x86_64", pythonExe, ...pythonArgs], options);
    } else {
      run(pythonExe, pythonArgs, options);
    }
  };

  await fs.mkdir(buildRoot, { recursive: true });

  // The build venv is reused between builds for speed, but pip never removes a
  // package just because it left the install spec. A venv left over from a
  // torch-carrying build ([ml,dev]) would silently re-bundle torch, because
  // PyInstaller collects anything importable and the CLI does `import torch`
  // behind a try/except. So: whenever the install configuration changes, throw
  // the venv away and build a clean one.
  const buildConfig = JSON.stringify({
    installSpec,
    extras,
    torchIndexUrl,
    neluxSpec,
  });
  const buildConfigPath = path.join(buildRoot, "build-config.json");
  const ownsVenv = !process.env.AMVERGE_BUILD_VENV;

  let previousConfig = null;
  try {
    previousConfig = await fs.readFile(buildConfigPath, "utf8");
  } catch {
    previousConfig = null;
  }

  if (previousConfig !== null && previousConfig !== buildConfig && ownsVenv) {
    console.log("Install spec changed since the last build, recreating the build venv.");
    await fs.rm(buildVenvDir, { recursive: true, force: true });
  } else if (previousConfig !== null && previousConfig !== buildConfig) {
    console.warn(
      "WARNING: the install spec changed but AMVERGE_BUILD_VENV points at an external venv. " +
        "Stale packages (e.g. torch from an [ml] build) will be bundled. Recreate it manually."
    );
  }

  let buildPythonExists = false;
  try {
    buildPythonExists = (await fs.stat(buildPython)).isFile();
  } catch {
    buildPythonExists = false;
  }
  if (!buildPythonExists) {
    runPython(basePython, ["-m", "venv", buildVenvDir]);
  }
  await fs.writeFile(buildConfigPath, buildConfig, "utf8");

  runPython(buildPython, ["-m", "pip", "install", "--upgrade", "pip"]);
  runPython(buildPython, ["-m", "pip", "install", "--upgrade", installSpec]);
  if (torchIndexUrl) {
    runPython(buildPython, [
      "-m", "pip", "install", "--upgrade",
      "torch", "--index-url", torchIndexUrl,
    ]);
  }
  // nelux is Windows-only (NVDEC GPU decode); other platforms fall back to the
  // CLI's FFmpeg parallel decode and don't need it.
  if (isWindows && neluxSpec) {
    runPython(buildPython, ["-m", "pip", "install", "--upgrade", neluxSpec]);
  }
  // Backstop: PyInstaller bundles whatever is importable, so a stray torch in
  // the build venv adds gigabytes to the installer and quietly undoes the
  // install-on-demand design. Catch it here rather than at release time.
  if (!withMl) {
    const stray = spawnSync(
      buildPython,
      [
        "-c",
        "import importlib.util as u, sys; " +
          "found = [n for n in ('torch','transnetv2_pytorch','spandrel','onnxruntime') if u.find_spec(n)]; " +
          "print(','.join(found)); sys.exit(1 if found else 0)",
      ],
      { encoding: "utf8" }
    );
    if (stray.status !== 0) {
      throw new Error(
        `The build venv contains AI packages that must not be bundled: ` +
          `${(stray.stdout || "").trim()}. Delete "${buildVenvDir}" and rebuild.`
      );
    }
  }
  // ---------------------------------------------------------------------------

  await fs.rm(distDir, { recursive: true, force: true });

  const pyinstallerArgs = [
    "-m",
    "PyInstaller",
    entryScript,
    "--onedir",
    "--clean",
    "--noconfirm",
    "--name",
    "amverge",
    "--add-binary",
    `${ffmpegBin}${sep}.`,
    "--add-binary",
    `${ffprobeBin}${sep}.`,
    "--collect-data",
    "amverge",
  ];

  if (withMl) {
    pyinstallerArgs.push("--collect-data", "transnetv2_pytorch");
  }

  if (process.platform === "darwin") {
    if (triple === "x86_64-apple-darwin") {
      pyinstallerArgs.push("--target-arch", "x86_64");
    } else if (triple === "aarch64-apple-darwin") {
      pyinstallerArgs.push("--target-arch", "arm64");
    }
  }

  if (isWindows) {
    pyinstallerArgs.push("--noconsole");
  }
  if (isWindows && neluxSpec) {
    pyinstallerArgs.push("--collect-all", "nelux");
  }

  runPython(buildPython, pyinstallerArgs, { cwd: buildRoot });

  await fs.rm(tauriSidecarDir, { recursive: true, force: true });
  await fs.mkdir(tauriSidecarDir, { recursive: true });
  await fs.cp(distDir, tauriSidecarDir, { recursive: true });

  const versionProbe = spawnSync(
    buildPython,
    ["-c", "import importlib.metadata as m; print(m.version('amverge'))"],
    { encoding: "utf8" }
  );
  const cliVersion = (versionProbe.stdout || "").trim();
  if (versionProbe.status !== 0 || !cliVersion) {
    throw new Error(
      `Could not read the installed amverge version from the build venv: ${
        versionProbe.stderr || versionProbe.error || "no output"
      }`
    );
  }
  await fs.mkdir(path.join(tauriSidecarDir, "_internal"), { recursive: true });
  await fs.writeFile(
    path.join(tauriSidecarDir, "_internal", "cli-version.txt"),
    `${cliVersion}\n`,
    "utf8"
  );
  console.log(`Sidecar CLI version: ${cliVersion}`);

  const exeName = isWindows ? "amverge.exe" : "amverge";
  const exePath = path.join(tauriSidecarDir, exeName);
  const baseLib = path.join(tauriSidecarDir, "_internal", "base_library.zip");
  const ffmpegName = isWindows ? "ffmpeg.exe" : "ffmpeg";
  const ffprobeName = isWindows ? "ffprobe.exe" : "ffprobe";
  const internalDir = path.join(tauriSidecarDir, "_internal");

  async function ensureInternalTool(toolName) {
    const internalPath = path.join(internalDir, toolName);
    const rootPath = path.join(tauriSidecarDir, toolName);

    try {
      const stat = await fs.stat(internalPath);
      if (stat.isFile()) return internalPath;
    } catch {
      // Continue to root fallback.
    }

    try {
      const rootStat = await fs.stat(rootPath);
      if (rootStat.isFile()) {
        await fs.mkdir(internalDir, { recursive: true });
        await fs.copyFile(rootPath, internalPath);
        return internalPath;
      }
    } catch {
      // Missing in both root and _internal. 
    }

    return null;
  }

  try {
    const exeStat = await fs.stat(exePath);
    if (!exeStat.isFile()) throw new Error(`${exeName} is not a file`);

    const baseStat = await fs.stat(baseLib);
    if (!baseStat.isFile()) throw new Error("base_library.zip is not a file");

    const ffmpegPath = await ensureInternalTool(ffmpegName);
    if (!ffmpegPath) throw new Error("ffmpeg sidecar binary is missing");

    const ffprobePath = await ensureInternalTool(ffprobeName);
    if (!ffprobePath) throw new Error("ffprobe sidecar binary is missing");
  } catch {
    throw new Error(
      `Sidecar sync finished, but required files are missing. Expected ${exePath}, ${baseLib}, and ffmpeg/ffprobe in either root or _internal of ${tauriSidecarDir}.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});