# Genie OpenClaw Distribution

## Overview

Genie OpenClaw is distributed through two channels:

1. **Public npm** (`genie-openclaw`) — used for snapshot creation (new server images)
2. **GitHub Releases tarball** (`genie-lite`) — used for production server upgrades

## Why Two Channels?

**npm** eliminates the need for GitHub Personal Access Tokens (PATs) during snapshot builds. Anyone can `npm install genie-openclaw` without authentication.

**Tarball** (via `genie-upgrade.sh`) is deterministic and pre-built — no live dependency resolution during production upgrades. This is safer for fleet-wide rollouts orchestrated by content-server.

## For Snapshot Creation

Snapshots use `npm i -g genie-openclaw@<version>` in `genie_setup.sh`. No PAT or `.npmrc` configuration needed.

## For Server Upgrades

Existing servers upgrade via `genie-upgrade.sh`, which downloads the pre-built tarball from GitHub Releases. This path is unchanged.

## Update Checker

The built-in update checker reads the package name from `package.json` and queries the correct npm registry entry. Managed servers can disable the checker via config:

```json
{
  "update": {
    "checkOnStart": false
  }
}
```

## Package Name

- **npm:** `genie-openclaw` (unscoped, public)
- **Previous:** `@bitplanet-l1/genie-openclaw` (scoped, GitHub Packages, required PAT)
