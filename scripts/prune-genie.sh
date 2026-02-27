#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -d node_modules ]]; then
  echo "node_modules not found. Run pnpm install before pruning."
  exit 1
fi

echo "=== Genie-Lite Prune Script ==="

before_total="$(du -sh . --exclude=.git 2>/dev/null | cut -f1 || true)"
before_nm="$(du -sh node_modules 2>/dev/null | cut -f1 || true)"
before_ext="$(du -sh extensions 2>/dev/null | cut -f1 || true)"
before_dist="$(du -sh dist 2>/dev/null | cut -f1 || true)"

echo ""
echo "=== Pre-prune sizes ==="
echo "node_modules: ${before_nm:-missing}"
echo "extensions:   ${before_ext:-missing}"
echo "dist:         ${before_dist:-missing}"
echo "total:        ${before_total:-unknown}"

# 1) Remove all extensions except telegram and shared.
#    This is the biggest win — extensions have their own node_modules.
shopt -s nullglob
for dir in extensions/*/; do
  ext="$(basename "$dir")"
  if [[ "$ext" != "telegram" && "$ext" != "shared" ]]; then
    echo "Removing extension: $ext"
    rm -rf "$dir"
  fi
done
shopt -u nullglob

# 2) Remove TypeScript source not needed in runtime artifact.
# Note: .github/ is excluded from tarball but NOT deleted here (CI needs it for cleanup).
rm -rf src/

# 3) Remove top-level deps confirmed NOT imported by dist/ code.
#    IMPORTANT: Many deps look unused but are eagerly imported by the bundled dist.
#    Only remove packages verified absent from: grep -rh "from ['\"]@" dist/*.js
REMOVE_DEPS=(
  "@homebridge/ciao"
  "@larksuiteoapi/node-sdk"
  "@lydell/node-pty"
  "discord-api-types"
  "pdfjs-dist"
  "signal-utils"
)

for dep in "${REMOVE_DEPS[@]}"; do
  dep_path="node_modules/$dep"
  if [[ -d "$dep_path" || -L "$dep_path" ]]; then
    echo "Removing dep: $dep"
    rm -rf "$dep_path"
  fi
done

# 4) Deep clean the pnpm store (.pnpm/) — this is where the biggest savings are.
#    These are transitive deps from removed extensions, or dev tools that leaked in.
REMOVE_PNPM_PATTERNS=(
  # LLM inference (node-llama-cpp + CUDA/Vulkan) — ~664 MB total. Genie uses Deva proxy.
  "@node-llama-cpp+*"
  "node-llama-cpp@*"
  # LanceDB vector store — ~267 MB. Genie uses sqlite-vec.
  "@lancedb+*"
  "lancedb@*"
  # FFI library — ~77 MB. Transitive dep, not used directly.
  "koffi@*"
  # Canvas rendering — ~124 MB. Not used by Genie servers.
  "@napi-rs+canvas-*"
  # Matrix SDK — ~22 MB. Channel not used.
  "@matrix-org+*"
  # Dev tools that shouldn't be in prod
  "oxlint@*"
  "@oxlint-tsgolint+*"
  "oxfmt@*"
  "tsdown@*"
  "@rolldown+*"
  "vitest@*"
  "@vitest+*"
  # Unused channel pnpm deps (safe — verified not imported by dist)
  "@homebridge+ciao@*"
  "@lydell+node-pty@*"
  "@larksuiteoapi+*"
  "signal-utils@*"
  "pdfjs-dist@*"
  # Electron/desktop — not needed on server
  "electron@*"
  "electron-*"
)

pnpm_dir="node_modules/.pnpm"
if [[ -d "$pnpm_dir" ]]; then
  for pattern in "${REMOVE_PNPM_PATTERNS[@]}"; do
    for p in "$pnpm_dir"/$pattern; do
      [[ -e "$p" ]] || continue
      echo "Removing .pnpm: $(basename "$p")"
      rm -rf "$p"
    done
  done
fi

# 5) Remove broken symlinks left by pnpm store cleanup.
find node_modules -maxdepth 3 -type l ! -exec test -e {} \; -delete 2>/dev/null || true

# 6) Clean non-runtime files from node_modules.
find node_modules -type d \( -name "__tests__" -o -name "test" -o -name "tests" \) -prune -exec rm -rf {} + 2>/dev/null || true
find node_modules -type f \( -name "*.test.*" -o -name "*.spec.*" \) -exec rm -f {} + 2>/dev/null || true
find node_modules -type f -name "*.map" -exec rm -f {} + 2>/dev/null || true
find node_modules -type f -name "*.ts" ! -name "*.d.ts" -exec rm -f {} + 2>/dev/null || true

echo ""
echo "=== Post-prune sizes ==="
after_nm="$(du -sh node_modules 2>/dev/null | cut -f1 || true)"
after_ext="$(du -sh extensions 2>/dev/null | cut -f1 || true)"
after_dist="$(du -sh dist 2>/dev/null | cut -f1 || true)"
after_total="$(du -sh . --exclude=.git 2>/dev/null | cut -f1 || true)"

echo "node_modules: ${after_nm:-missing}"
echo "extensions:   ${after_ext:-missing}"
echo "dist:         ${after_dist:-missing}"
echo "total:        ${after_total:-unknown}"
