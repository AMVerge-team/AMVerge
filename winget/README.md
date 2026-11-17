# Windows Package Manager (Winget) Manifests for AMVerge

This directory contains the official package manifests for publishing **AMVerge** to the Windows Package Manager repository ([microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs)).

## Package Identity

- **Identifier:** `AMVerge.AMVerge`
- **Version:** `2.0.2`
- **Installer Type:** `nullsoft` (NSIS)
- **Architecture:** `x64`

## Directory Structure

```text
manifests/a/AMVerge/AMVerge/2.0.2/
├── AMVerge.AMVerge.yaml                 # Version manifest
├── AMVerge.AMVerge.installer.yaml       # Installer manifest (download URL, SHA256, switches)
└── AMVerge.AMVerge.locale.en-US.yaml    # Default locale manifest (metadata, license, description)
```

## How to Install via Winget

Once merged upstream by Microsoft:

```powershell
winget install AMVerge
```
