import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];
    if (!key?.startsWith("--") || !value) {
      continue;
    }
    parsed[key.slice(2)] = value;
    i += 1;
  }
  if (!parsed.armApp || !parsed.x64App || !parsed.outApp) {
    throw new Error(
      "Usage: node merge-universal-macos-app.mjs --armApp <path> --x64App <path> --outApp <path>"
    );
  }
  return parsed;
}

async function pathExists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeResourcePattern(resource) {
  return resource.replace(/\*\*\/?\*?$/, "").replace(/\*+$/, "");
}

async function ensureParent(targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
}

async function listFilesRecursively(rootDir) {
  const files = new Map();

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, absolutePath);

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile() || entry.isSymbolicLink()) {
        files.set(relPath, absolutePath);
      }
    }
  }

  await walk(rootDir);
  return files;
}

function isMachOBinary(filePath) {
  try {
    const output = execFileSync("file", ["-b", filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.includes("Mach-O");
  } catch {
    return false;
  }
}

function lipoCreateUniversal(armPath, x64Path, outPath) {
  execFileSync("lipo", ["-create", armPath, x64Path, "-output", outPath], {
    stdio: "inherit",
  });
}

async function copyIfMissing(sourcePath, destinationPath) {
  if (await pathExists(destinationPath)) {
    return;
  }
  await ensureParent(destinationPath);
  await fs.cp(sourcePath, destinationPath, { recursive: true });
}

function adHocCodesign(appPath) {
  try {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
      stdio: "inherit",
    });
  } catch (error) {
    throw new Error(`codesign failed: ${error.message}`);
  }
}

async function main() {
  const { armApp, x64App, outApp, config } = parseArgs();

  if (!(await pathExists(armApp))) {
    throw new Error(`arm app not found: ${armApp}`);
  }
  if (!(await pathExists(x64App))) {
    throw new Error(`x64 app not found: ${x64App}`);
  }

  await fs.rm(outApp, { recursive: true, force: true });
  await fs.mkdir(path.dirname(outApp), { recursive: true });
  await fs.cp(armApp, outApp, { recursive: true });

  const armFiles = await listFilesRecursively(armApp);
  const x64Files = await listFilesRecursively(x64App);

  for (const [relPath, x64Absolute] of x64Files.entries()) {
    const outAbsolute = path.join(outApp, relPath);

    if (!armFiles.has(relPath)) {
      await copyIfMissing(x64Absolute, outAbsolute);
      continue;
    }

    const armAbsolute = armFiles.get(relPath);
    if (!armAbsolute) {
      continue;
    }

    const armIsMachO = isMachOBinary(armAbsolute);
    const x64IsMachO = isMachOBinary(x64Absolute);

    if (armIsMachO && x64IsMachO) {
      lipoCreateUniversal(armAbsolute, x64Absolute, outAbsolute);
    }
  }

  const outResources = path.join(outApp, "Contents", "Resources");

  if (config) {
    const configText = await fs.readFile(config, "utf8");
    const parsedConfig = JSON.parse(configText);
    const expectedResources = parsedConfig?.bundle?.resources ?? [];

    for (const relResource of expectedResources) {
      const normalized = normalizeResourcePattern(relResource);
      const resourcePath = path.join(outResources, normalized);
      if (!(await pathExists(resourcePath))) {
        throw new Error(`Missing merged resource declared in config: ${relResource}`);
      }
    }
  }

  adHocCodesign(outApp);
  console.log(`Universal app created at: ${outApp}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
