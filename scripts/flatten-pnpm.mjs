#!/usr/bin/env node
/**
 * Flatten pnpm's symlinked node_modules into a portable flat layout.
 *
 * pnpm structure:
 *   node_modules/<pkg> → symlink → .pnpm/<pkg@ver>/node_modules/<pkg>
 *   node_modules/.pnpm/<hash>/node_modules/<dep> — real files for transitive deps
 *
 * This script:
 * 1. Walks .pnpm/ to find all real package directories
 * 2. Copies them to a flat _flat/ directory (first-wins for dedup)
 * 3. Swaps node_modules/ with _flat/
 */

import { readdirSync, existsSync, mkdirSync, rmSync, renameSync, lstatSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";

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
let skipped = 0;

/**
 * Copy a package directory to the flat layout.
 * @param {string} srcDir - Source directory (real files)
 * @param {string} pkgName - Package name (e.g., "grammy" or "@buape/carbon")
 */
function copyPackage(srcDir, pkgName) {
  const targetDir = join(flatDir, pkgName);
  if (existsSync(targetDir)) {
    skipped++;
    return; // First wins
  }
  mkdirSync(join(flatDir, pkgName.includes("/") ? pkgName.split("/")[0] : ""), { recursive: true });
  try {
    cpSync(srcDir, targetDir, { recursive: true, dereference: true });
    copied++;
  } catch (e) {
    console.error(`Failed to copy ${pkgName}: ${e.message}`);
  }
}

console.log("=== Flattening pnpm node_modules ===");

// Phase 1: Copy the top-level symlink targets first (these are the "correct" versions).
// This ensures we get the right version when there are multiple in the store.
console.log("Phase 1: Resolving top-level symlinks...");
import { realpathSync } from "node:fs";
for (const entry of readdirSync(nmDir)) {
  if (entry === ".pnpm" || entry.startsWith(".")) {
    continue;
  }
  const entryPath = join(nmDir, entry);
  try {
    const stat = lstatSync(entryPath);
    if (entry.startsWith("@") && stat.isDirectory()) {
      // Scoped package directory — check contents
      for (const sub of readdirSync(entryPath)) {
        const subPath = join(entryPath, sub);
        const subStat = lstatSync(subPath);
        if (subStat.isSymbolicLink()) {
          const realPath = realpathSync(subPath);
          const pkgName = `${entry}/${sub}`;
          const targetDir = join(flatDir, pkgName);
          if (!existsSync(targetDir)) {
            mkdirSync(join(flatDir, entry), { recursive: true });
            cpSync(realPath, targetDir, { recursive: true, dereference: true });
            copied++;
          }
        }
      }
    } else if (stat.isSymbolicLink()) {
      const realPath = realpathSync(entryPath);
      const targetDir = join(flatDir, entry);
      if (!existsSync(targetDir)) {
        cpSync(realPath, targetDir, { recursive: true, dereference: true });
        copied++;
      }
    }
  } catch {
    // Broken symlink or permission issue — skip
  }
}
console.log(`Phase 1: ${copied} top-level packages resolved`);

// Phase 2: Walk .pnpm store for transitive deps not at top level.
console.log("Phase 2: Extracting transitive deps from .pnpm store...");
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

  for (const entry of entries) {
    const entryPath = join(innerNm, entry);
    let stat;
    try {
      stat = lstatSync(entryPath);
    } catch {
      continue;
    }

    if (entry.startsWith(".")) {
      continue;
    }

    if (entry.startsWith("@")) {
      // Scoped package: @scope/name
      let scopeEntries;
      try {
        scopeEntries = readdirSync(entryPath);
      } catch {
        continue;
      }
      for (const scopeEntry of scopeEntries) {
        const scopePkgDir = join(entryPath, scopeEntry);
        const pkgName = `${entry}/${scopeEntry}`;
        try {
          const s = lstatSync(scopePkgDir);
          if (s.isDirectory() || s.isSymbolicLink()) {
            copyPackage(scopePkgDir, pkgName);
          }
        } catch {
          continue;
        }
      }
    } else if (stat.isDirectory() || stat.isSymbolicLink()) {
      copyPackage(entryPath, entry);
    }
  }
}

console.log(`Copied ${copied} packages, skipped ${skipped} duplicates`);

// Swap
console.log("Swapping node_modules...");
rmSync(nmDir, { recursive: true, force: true });
renameSync(flatDir, nmDir);

// Verify
const finalSize = readdirSync(nmDir).filter((e) => !e.startsWith(".")).length;
console.log(`Final node_modules: ${finalSize} top-level entries`);

// Quick check for key packages
const keyPkgs = ["grammy", "@buape/carbon", "express", "better-sqlite3", "sharp"];
for (const pkg of keyPkgs) {
  const pkgDir = join(nmDir, pkg);
  const status = existsSync(pkgDir) ? "✓" : "✗ MISSING";
  console.log(`  ${status} ${pkg}`);
}
