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
shopt -s nullglob
for dir in extensions/*/; do
  ext="$(basename "$dir")"
  if [[ "$ext" != "telegram" && "$ext" != "shared" ]]; then
    echo "Removing extension: $ext"
    rm -rf "$dir"
  fi
done
shopt -u nullglob

# 2) Remove TypeScript source not needed at runtime.
rm -rf src/

# 3) Remove large packages that Genie doesn't need.
#    These are NOT imported by dist/ code (verified via grep).
#    IMPORTANT: Only remove from top-level AND .pnpm together to avoid broken symlinks.
REMOVE_PACKAGES=(
  # Verified NOT in dist/ imports:
  "@homebridge/ciao"
  "@larksuiteoapi/node-sdk"
  "@lydell/node-pty"
  "pdfjs-dist"
)

# Large transitive deps that are NOT direct imports of dist/ code.
# These are only used by removed extensions or optional features.
REMOVE_PNPM_ONLY=(
  # LLM inference — ~664 MB. Genie uses Deva proxy.
  "@node-llama-cpp"
  "node-llama-cpp"
  # LanceDB vector store — ~267 MB. Genie uses sqlite-vec.
  "@lancedb"
  "lancedb"
  # Canvas rendering — ~124 MB.
  "@napi-rs/canvas"
  "@napi-rs/canvas-linux-x64-gnu"
  "@napi-rs/canvas-linux-x64-musl"
  "@napi-rs/canvas-linux-arm64-gnu"
  "@napi-rs/canvas-linux-arm64-musl"
  # Matrix SDK — ~22 MB.
  "@matrix-org"
  # Dev tools
  "oxlint"
  "oxfmt"
  "tsdown"
  "vitest"
  "typescript"
)

# Remove from top-level node_modules
for pkg in "${REMOVE_PACKAGES[@]}" "${REMOVE_PNPM_ONLY[@]}"; do
  pkg_path="node_modules/$pkg"
  if [[ -d "$pkg_path" || -L "$pkg_path" ]]; then
    echo "Removing: $pkg"
    rm -rf "$pkg_path"
  fi
done

# Clean .pnpm store for the removed packages (disk savings, won't be dereferenced)
if [[ -d "node_modules/.pnpm" ]]; then
  PNPM_PATTERNS=(
    "@node-llama-cpp+*" "node-llama-cpp@*"
    "@lancedb+*" "lancedb@*"
    "@napi-rs+canvas-*"
    "@matrix-org+*"
    "oxlint@*" "oxfmt@*"
    "tsdown@*" "@rolldown+*"
    "vitest@*" "@vitest+*"
    "typescript@*" "@typescript+*"
    "@homebridge+ciao@*"
    "@lydell+node-pty@*"
    "@larksuiteoapi+*"
    "pdfjs-dist@*"
  )
  for pattern in "${PNPM_PATTERNS[@]}"; do
    for p in node_modules/.pnpm/$pattern; do
      [[ -e "$p" ]] || continue
      echo "Removing .pnpm: $(basename "$p")"
      rm -rf "$p"
    done
  done
fi

# 4) Clean non-runtime files from remaining packages.
#    Note: follows symlinks to clean actual .pnpm store entries.
find -L node_modules -type d \( -name "__tests__" -o -name "test" -o -name "tests" \) -prune -exec rm -rf {} + 2>/dev/null || true
find -L node_modules -type f \( -name "*.test.*" -o -name "*.spec.*" \) -exec rm -f {} + 2>/dev/null || true
find -L node_modules -type f -name "*.map" -exec rm -f {} + 2>/dev/null || true
# Remove TypeScript source files but keep declaration files (.d.ts) and JavaScript (.js)
find -L node_modules -type f -name "*.ts" ! -name "*.d.ts" -exec rm -f {} + 2>/dev/null || true

# 5) Remove broken symlinks (from .pnpm cleanup).
find node_modules -maxdepth 3 -type l ! -exec test -e {} \; -delete 2>/dev/null || true

# 6) Verify all external packages imported by dist/*.js still resolve.
echo ""
echo "=== Verifying dist imports ==="
missing=0
for pkg in $(grep -roh "from ['\"][^'\"]*['\"]" dist/*.js 2>/dev/null \
    | sed "s/from ['\"]//;s/['\"]$//" \
    | grep -v "^\.\|^node:\|^/\|^https:" \
    | awk -F/ '$0 ~ /^@/ {print $1"/"$2; next} {print $1}' \
    | sort -u); do
  if [[ ! -e "node_modules/$pkg" && ! -L "node_modules/$pkg" ]]; then
    echo "MISSING: $pkg"
    missing=1
  fi
done
if [[ $missing -eq 1 ]]; then
  echo "ERROR: Some dist-imported packages are missing!"
  exit 1
fi
echo "All dist-imported packages present."

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
