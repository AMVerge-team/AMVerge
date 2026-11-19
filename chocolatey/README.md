# Chocolatey Package for AMVerge

This directory contains the Chocolatey package definition for publishing **AMVerge** to the [Chocolatey Community Repository](https://community.chocolatey.org/).

## Package Identity

- **Package ID**: `amverge`
- **Version**: `2.0.5`
- **Installer Type**: NSIS (`x64`)

## Directory Structure

```text
chocolatey/
├── amverge.nuspec                   # Package metadata
├── tools/
│   ├── chocolateyinstall.ps1        # Silent NSIS installer script
│   └── chocolateyuninstall.ps1      # Silent NSIS uninstaller script
└── README.md
```

## Local Pack & Test (Windows)

```powershell
cd chocolatey
choco pack amverge.nuspec
choco install amverge --source . --yes
choco uninstall amverge --yes
```

## Install via Chocolatey

Once published to the Chocolatey Community Repository:

```powershell
choco install amverge
```
