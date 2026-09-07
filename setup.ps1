<#
.SYNOPSIS
    One-shot developer setup for AMVerge V2 on Windows.

.DESCRIPTION
    Clones AMVerge-CLI next to this repo, builds its virtualenv, installs the
    CLI into that venv in editable mode, points this app's .env at it, and
    installs the frontend dependencies.

    The app resolves the CLI from a venv, never from a global pip install: in a
    dev build the Rust side runs `<AMVERGE_CLI_DIR>/.venv/Scripts/amverge.exe`
    directly (see frontend/src-tauri/src/utils/sidecar.rs). Installing the CLI
    globally would leave that path empty and every import would fail.

    Safe to re-run. An existing checkout is updated rather than recloned, an
    existing venv is reused, and an existing .env is never overwritten.

.PARAMETER Ai
    Also install the optional AI extras (TransNetV2, depth maps, interpolation).
    These pull in torch and are several GB; without them the app runs fine and
    only the AI features report a missing pack.

.PARAMETER CliDir
    Where to put the CLI checkout. Defaults to a sibling of this repo.

.PARAMETER CliRepo
    Git URL to clone the CLI from.

.EXAMPLE
    .\setup.ps1
    .\setup.ps1 -Ai
#>
[CmdletBinding()]
param(
    [switch]$Ai,
    [string]$CliDir,
    [string]$CliRepo = "https://github.com/AMVerge-team/AMVerge-CLI.git"
)

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"
if (-not $CliDir) {
    # a sibling of the app repo, not a child: nesting one git checkout inside
    # another confuses status, ignores and most editors' source control
    $CliDir = Join-Path (Split-Path -Parent $RepoRoot) "AMVerge-CLI"
}

function Write-Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "  $text" -ForegroundColor Green }
function Write-Note($text) { Write-Host "  $text" -ForegroundColor DarkGray }
function Write-Warn($text) { Write-Host "  $text" -ForegroundColor Yellow }

function Test-Command($name) {
    $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

<#
    Finds an interpreter that satisfies the CLI's requires-python (>=3.11).

    The Windows launcher is tried per-version first: `python` on PATH is often a
    3.9, or the WindowsApps stub that opens the Store instead of running.
#>
function Resolve-Python {
    $candidates = @()
    if (Test-Command "py") {
        foreach ($v in @("3.13", "3.12", "3.11")) {
            $candidates += ,@("py", @("-$v"))
        }
    }
    $candidates += ,@("python", @())
    $candidates += ,@("python3", @())

    foreach ($candidate in $candidates) {
        $exe = $candidate[0]
        $prefix = $candidate[1]
        if (-not (Test-Command $exe)) { continue }
        try {
            $probeArgs = @($prefix) + @("-c", "import sys; print('%d.%d' % sys.version_info[:2])")
            $out = & $exe @probeArgs 2>$null
            if ($LASTEXITCODE -ne 0 -or -not $out) { continue }
            $parts = ($out.Trim() -split '\.')
            $major = [int]$parts[0]
            $minor = [int]$parts[1]
            if ($major -eq 3 -and $minor -ge 11) {
                return [PSCustomObject]@{ Exe = $exe; Prefix = $prefix; Version = $out.Trim() }
            }
        } catch {
            continue
        }
    }
    return $null
}

# ---------------------------------------------------------------------------
Write-Step "Checking prerequisites"

$missing = @()
if (-not (Test-Command "git"))  { $missing += "git         https://git-scm.com/download/win" }
if (-not (Test-Command "node")) { $missing += "node 20+    https://nodejs.org/en/download" }
if (-not (Test-Command "npm"))  { $missing += "npm         (ships with Node.js)" }
if (-not (Test-Command "cargo")) { $missing += "rust        https://rustup.rs" }

$python = Resolve-Python
if (-not $python) { $missing += "python 3.11+ https://www.python.org/downloads/windows/" }

if ($missing.Count -gt 0) {
    Write-Host "`nMissing prerequisites:" -ForegroundColor Red
    foreach ($m in $missing) { Write-Host "  - $m" -ForegroundColor Red }
    Write-Host "`nInstall these, open a new terminal, and run this script again." -ForegroundColor Red
    exit 1
}

Write-Ok "git, node, npm, cargo found"
Write-Ok "python $($python.Version) found"

# Tauri renders through WebView2. It ships with Windows 11 and current Windows
# 10, but a stripped or LTSC image can be missing it, and the failure at that
# point is an empty window rather than a build error.
$webview = @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
) | Where-Object { Test-Path $_ }
if (-not $webview) {
    Write-Warn "WebView2 runtime not detected. If the app window opens blank, install it:"
    Write-Warn "https://developer.microsoft.com/microsoft-edge/webview2/"
}

# ---------------------------------------------------------------------------
Write-Step "AMVerge-CLI checkout"

if (Test-Path (Join-Path $CliDir ".git")) {
    Write-Note "Already cloned at $CliDir"
    Write-Note "Pulling latest..."
    git -C $CliDir pull --ff-only
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Pull failed (local changes?). Continuing with the checkout as-is."
    }
} elseif (Test-Path $CliDir) {
    throw "$CliDir exists but is not a git checkout. Move or delete it, then re-run."
} else {
    Write-Note "Cloning $CliRepo"
    git clone $CliRepo $CliDir
    if ($LASTEXITCODE -ne 0) { throw "Failed to clone the CLI repository." }
}
Write-Ok "CLI at $CliDir"

# ---------------------------------------------------------------------------
Write-Step "CLI virtualenv"

$VenvDir = Join-Path $CliDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

if (Test-Path $VenvPython) {
    Write-Note "Reusing existing venv"
} else {
    Write-Note "Creating venv at $VenvDir"
    $venvArgs = @($python.Prefix) + @("-m", "venv", $VenvDir)
    & $python.Exe @venvArgs
    if ($LASTEXITCODE -ne 0) { throw "Failed to create the virtualenv." }
}

& $VenvPython -m pip install --upgrade pip --quiet
if ($LASTEXITCODE -ne 0) { throw "Failed to upgrade pip inside the venv." }

# Editable, and from this checkout rather than PyPI: the published wheel lags
# the extras the app's AI packs expect, so a PyPI install produces a CLI that
# cannot satisfy them. Editable also means a developer's CLI edits take effect
# without reinstalling.
if ($Ai) {
    Write-Note "Installing CLI (editable) with AI extras. This downloads torch and takes a while."
    & $VenvPython -m pip install -e "$CliDir[all]"
} else {
    Write-Note "Installing CLI (editable), base dependencies only"
    & $VenvPython -m pip install -e $CliDir
}
if ($LASTEXITCODE -ne 0) { throw "Failed to install the CLI into the venv." }

$AmvergeExe = Join-Path $VenvDir "Scripts\amverge.exe"
if (-not (Test-Path $AmvergeExe)) {
    throw "Install finished but $AmvergeExe is missing. The app resolves the CLI from this exact path."
}
Write-Ok "amverge installed in the venv"
& $AmvergeExe version

# ---------------------------------------------------------------------------
Write-Step "Environment file"

$EnvFile = Join-Path $RepoRoot ".env"
$EnvExample = Join-Path $RepoRoot ".env.example"

if (-not (Test-Path $EnvFile)) {
    Copy-Item $EnvExample $EnvFile
    Write-Ok "Created .env from .env.example"
} else {
    Write-Note ".env already exists, leaving its values alone"
}

# forward slashes: this value is read by Rust and by dotenv, and a backslash run
# is an escape sequence to some .env parsers
$CliDirForEnv = ($CliDir -replace '\\', '/')
$envLines = Get-Content $EnvFile
if ($envLines -match '^AMVERGE_CLI_DIR=') {
    $envLines = $envLines -replace '^AMVERGE_CLI_DIR=.*', "AMVERGE_CLI_DIR=$CliDirForEnv"
} else {
    $envLines += "AMVERGE_CLI_DIR=$CliDirForEnv"
}
Set-Content -Path $EnvFile -Value $envLines -Encoding UTF8
Write-Ok "AMVERGE_CLI_DIR points at the venv checkout"

# ---------------------------------------------------------------------------
Write-Step "Frontend dependencies"

Push-Location $FrontendDir
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
    Write-Ok "node_modules installed"

    # Staged now rather than on first run: tauri:dev fetches it anyway, and
    # surfacing a network failure here is clearer than mid-launch.
    Write-Note "Staging the uv binary used to provision AI environments"
    npm run fetch:uv
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "fetch:uv failed. Not fatal; tauri:dev retries it."
    }
} finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
Write-Step "Done"

Write-Host ""
Write-Host "  Start the app:" -ForegroundColor White
Write-Host "    cd frontend"
Write-Host "    npm run tauri:dev"
Write-Host ""
Write-Host "  The first Rust build takes several minutes; later runs are cached." -ForegroundColor DarkGray
Write-Host ""

if (-not $Ai) {
    Write-Note "AI features (TransNetV2, depth, interpolation) are not installed."
    Write-Note "Add them any time with:  .\setup.ps1 -Ai"
    Write-Host ""
}

Write-Warn "Optional, only if you need them:"
Write-Warn "  AMVERGE_DISCORD_APP_CLIENT_ID   Discord sign-in and hosting events"
Write-Warn "  AMVERGE_BUG_REPORT_*            submitting bug reports"
Write-Warn "Both come from a maintainer. Everything else works without them."
Write-Host ""
