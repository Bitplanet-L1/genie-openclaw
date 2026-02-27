#!/usr/bin/env node
/**
 * Flatten pnpm's symlinked node_modules into a portable flat layout.
 *
 * pnpm structure:
 *   node_modules/<pkg> → symlink → .pnpm/<pkg@ver>/node_modules/<pkg>
 *   node_modules/.pnpm/<hash>/node_modules/<dep> — real files or symlinks to other store entries
 *
 * This script:
 * 1. Walks .pnpm/ to find all real package directories
 * 2. Collects version-specific dependency requirements
 * 3. Copies to flat _flat/ directory with nested deps for version conflicts
 */

import {
  readdirSync,
  existsSync,
  mkdirSync,
  rmSync,
  renameSync,
  lstatSync,
  cpSync,
  realpathSync,
  readFileSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";

const root = resolve(".");
const nmDir = join(root, "node_modules");
const pnpmDir = join(nmDir, ".pnpm");
const flatDir = join(root, "_flat");

if (!existsSync(pnpmDir)) {
  console.log("No .pnpm directory found — nothing to flatten.");
  process.exit(0);
}

mkdirSync(flatDir, { recursive: true });

let copied = 0;
let _skipped = 0;
let nestedCopied = 0;

/**
 * Resolve a symlink target to real files. Returns null if broken.
 */
function resolveEntry(entryPath) {
  try {
    const stat = lstatSync(entryPath);
    if (stat.isSymbolicLink()) {
      const realPath = realpathSync(entryPath);
      return { realPath, isReal: false };
    }
    if (stat.isDirectory()) {
      return { realPath: entryPath, isReal: true };
    }
    return null;
  } catch {
    return null; // broken symlink
  }
}

/**
 * Copy a package to the flat layout.
 */
function copyToFlat(srcDir, pkgName) {
  const targetDir = join(flatDir, pkgName);
  if (existsSync(targetDir)) {
    _skipped++;
    return false;
  }
  mkdirSync(dirname(targetDir), { recursive: true });
  try {
    cpSync(srcDir, targetDir, { recursive: true, dereference: true });
    copied++;
    return true;
  } catch (err) {
    console.error(`Failed to copy ${pkgName}: ${err.message}`);
    return false;
  }
}

/**
 * Get package version from a directory.
 */
function getVersion(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

console.log("=== Flattening pnpm node_modules ===");

// Phase 1: Walk ALL .pnpm store entries and build a dependency graph.
// For each store entry <pkg@ver>/node_modules/, catalog which version of each dep it needs.
// Map: pkgName → { version, realDir }[] (all versions available)
const versionMap = new Map(); // pkgName → [{ version, realDir }]
// Map: storeEntry → { pkgName, depVersions: Map<depName, version> }
const storeEntries = [];

console.log("Phase 1: Cataloging .pnpm store...");
for (const hashEntry of readdirSync(pnpmDir)) {
  const hashDir = join(pnpmDir, hashEntry);
  const innerNm = join(hashDir, "node_modules");
  if (!existsSync(innerNm)) {
    continue;
  }

  let entries;
  try {
    entries = readdirSync(innerNm);
  } catch {
    continue;
  }

  // Build list of {name, dir} for all packages in this store entry
  const pkgsInEntry = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) {
      continue;
    }
    const entryPath = join(innerNm, entry);

    if (entry.startsWith("@")) {
      let scopeEntries;
      try {
        scopeEntries = readdirSync(entryPath);
      } catch {
        continue;
      }
      for (const sub of scopeEntries) {
        const scopePkgPath = join(entryPath, sub);
        const resolved = resolveEntry(scopePkgPath);
        if (resolved) {
          const pkgName = `${entry}/${sub}`;
          const version = getVersion(resolved.realPath);
          pkgsInEntry.push({ pkgName, realPath: resolved.realPath, version });
        }
      }
    } else {
      const resolved = resolveEntry(entryPath);
      if (resolved) {
        const version = getVersion(resolved.realPath);
        pkgsInEntry.push({ pkgName: entry, realPath: resolved.realPath, version });
      }
    }
  }

  // Determine which package this store entry "owns" (matches hash name)
  // e.g., proper-lockfile@4.1.2/node_modules/ → owns "proper-lockfile"
  const ownerMatch = hashEntry.match(/^(?:(@[^+]+)\+)?([^@]+)@/);
  let ownerName = null;
  if (ownerMatch) {
    ownerName = ownerMatch[1]
      ? `${ownerMatch[1].replace(/\+/g, "/")}/${ownerMatch[2]}`
      : ownerMatch[2];
  }

  storeEntries.push({ hashEntry, innerNm, pkgsInEntry, ownerName });

  // Register all versions in the version map
  for (const pkg of pkgsInEntry) {
    if (!versionMap.has(pkg.pkgName)) {
      versionMap.set(pkg.pkgName, []);
    }
    const existing = versionMap.get(pkg.pkgName);
    if (!existing.find((e) => e.version === pkg.version)) {
      existing.push({ version: pkg.version, realPath: pkg.realPath });
    }
  }
}

const multiVersionPkgs = [...versionMap.entries()].filter(([, v]) => v.length > 1);
if (multiVersionPkgs.length > 0) {
  console.log(`Found ${multiVersionPkgs.length} packages with multiple versions:`);
  for (const [name, versions] of multiVersionPkgs) {
    console.log(`  ${name}: ${versions.map((v) => v.version).join(", ")}`);
  }
}

// Phase 2: Copy top-level symlink targets first (these are the "primary" versions).
console.log("Phase 2: Resolving top-level symlinks...");
for (const entry of readdirSync(nmDir)) {
  if (entry === ".pnpm" || entry.startsWith(".")) {
    continue;
  }
  const entryPath = join(nmDir, entry);

  try {
    const stat = lstatSync(entryPath);
    if (entry.startsWith("@") && (stat.isDirectory() || stat.isSymbolicLink())) {
      let subEntries;
      try {
        subEntries = readdirSync(entryPath);
      } catch {
        continue;
      }
      for (const sub of subEntries) {
        const subPath = join(entryPath, sub);
        const resolved = resolveEntry(subPath);
        if (resolved) {
          copyToFlat(resolved.realPath, `${entry}/${sub}`);
        }
      }
    } else if (stat.isSymbolicLink()) {
      const resolved = resolveEntry(entryPath);
      if (resolved) {
        copyToFlat(resolved.realPath, entry);
      }
    }
  } catch {
    // skip
  }
}
console.log(`Phase 2: ${copied} top-level packages`);

// Phase 3: Copy remaining packages from .pnpm store.
console.log("Phase 3: Filling in transitive deps...");
const phase2Count = copied;
for (const { pkgsInEntry } of storeEntries) {
  for (const pkg of pkgsInEntry) {
    copyToFlat(pkg.realPath, pkg.pkgName);
  }
}
console.log(`Phase 3: ${copied - phase2Count} additional packages`);

// Phase 4: Handle version conflicts — install nested deps.
// For each store entry, if it needs a DIFFERENT version of a dep than what's at top-level in _flat,
// install that specific version inside the package's own node_modules.
console.log("Phase 4: Resolving version conflicts...");
for (const { pkgsInEntry, ownerName } of storeEntries) {
  if (!ownerName) {
    continue;
  }
  const ownerDir = join(flatDir, ownerName);
  if (!existsSync(ownerDir)) {
    continue;
  }

  for (const dep of pkgsInEntry) {
    if (dep.pkgName === ownerName) {
      continue;
    } // skip self

    // Check if the flat version differs from what this store entry needs
    const flatDir2 = join(flatDir, dep.pkgName);
    if (!existsSync(flatDir2)) {
      continue;
    }

    const flatVersion = getVersion(flatDir2);
    if (flatVersion && dep.version && flatVersion !== dep.version) {
      // Need nested dep
      const nestedDir = join(ownerDir, "node_modules", dep.pkgName);
      if (!existsSync(nestedDir)) {
        mkdirSync(dirname(nestedDir), { recursive: true });
        try {
          cpSync(dep.realPath, nestedDir, { recursive: true, dereference: true });
          nestedCopied++;
          console.log(
            `  Nested: ${ownerName}/node_modules/${dep.pkgName} (${dep.version} vs flat ${flatVersion})`,
          );
        } catch (err) {
          console.error(`  Failed nested ${dep.pkgName} in ${ownerName}: ${err.message}`);
        }
      }
    }
  }
}
console.log(`Phase 4: ${nestedCopied} nested deps for version conflicts`);

// Swap
console.log("Swapping node_modules...");
rmSync(nmDir, { recursive: true, force: true });
renameSync(flatDir, nmDir);

// Verify
const finalEntries = readdirSync(nmDir).filter((e) => !e.startsWith("."));
console.log(`Final node_modules: ${finalEntries.length} top-level entries`);

// Quick check for key packages
const keyPkgs = ["grammy", "express", "proper-lockfile", "signal-exit"];
for (const pkg of keyPkgs) {
  const pkgDir = join(nmDir, pkg);
  if (existsSync(pkgDir)) {
    const ver = getVersion(pkgDir);
    console.log(`  ✓ ${pkg} (${ver})`);
    // Check for nested deps
    const nestedNm = join(pkgDir, "node_modules");
    if (existsSync(nestedNm)) {
      const nested = readdirSync(nestedNm);
      console.log(`    nested: ${nested.join(", ")}`);
    }
  } else {
    console.log(`  ✗ ${pkg} — MISSING`);
  }
}

// Final check: verify proper-lockfile can find signal-exit
const plDir = join(nmDir, "proper-lockfile");
if (existsSync(plDir)) {
  const nestedSe = join(plDir, "node_modules", "signal-exit");
  const topSe = join(nmDir, "signal-exit");
  const seDir = existsSync(nestedSe) ? nestedSe : topSe;
  if (existsSync(seDir)) {
    const seVer = getVersion(seDir);
    console.log(
      `  proper-lockfile will use signal-exit@${seVer} from ${existsSync(nestedSe) ? "nested" : "top-level"}`,
    );
  } else {
    console.log(`  ⚠ signal-exit not found for proper-lockfile!`);
  }
}
