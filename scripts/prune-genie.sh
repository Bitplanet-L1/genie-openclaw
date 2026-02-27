#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -d node_modules ]]; then
  echo "node_modules not found. Run npm install before pruning."
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

# 3) Remove large packages from node_modules that Genie doesn't need.
#    NOTE: Many channel deps (@buape/carbon, @slack/*, @whiskeysockets/baileys, etc.)
#    ARE eagerly imported by the bundled dist/ code and CANNOT be removed without
#    causing ERR_MODULE_NOT_FOUND. Only remove packages NOT imported by dist/.
REMOVE_PACKAGES=(
  # Verified NOT imported by dist/ code:
  "@homebridge/ciao"
  "@larksuiteoapi/node-sdk"
  "@lydell/node-pty"
  "pdfjs-dist"

  # Large transitive deps not needed by Genie:
  "@node-llama-cpp"
  "node-llama-cpp"
  "@lancedb"
  "lancedb"
  "koffi"
  "@napi-rs/canvas"
  "@napi-rs/canvas-linux-x64-gnu"
  "@napi-rs/canvas-linux-x64-musl"
  "@napi-rs/canvas-linux-arm64-gnu"
  "@napi-rs/canvas-linux-arm64-musl"
  "@matrix-org"

  # Dev tools that shouldn't be in production:
  "oxlint"
  "@oxlint-tsgolint"
  "oxfmt"
  "tsdown"
  "@rolldown"
  "vitest"
  "@vitest"
  "typescript"
  "@typescript"
  "@typescript/native-preview"
)

for pkg in "${REMOVE_PACKAGES[@]}"; do
  pkg_path="node_modules/$pkg"
  if [[ -d "$pkg_path" ]]; then
    echo "Removing: $pkg"
    rm -rf "$pkg_path"
  fi
done

# Also clean pnpm virtual store if present (when run on pnpm-installed node_modules)
if [[ -d "node_modules/.pnpm" ]]; then
  REMOVE_PNPM_PATTERNS=(
    "@node-llama-cpp+*" "node-llama-cpp@*"
    "@lancedb+*" "lancedb@*"
    "koffi@*"
    "@napi-rs+canvas-*"
    "@matrix-org+*"
    "oxlint@*" "@oxlint-tsgolint+*" "oxfmt@*"
    "tsdown@*" "@rolldown+*"
    "vitest@*" "@vitest+*"
    "typescript@*" "@typescript+*"
    "@homebridge+ciao@*"
    "@lydell+node-pty@*"
    "@larksuiteoapi+*"
    "pdfjs-dist@*"
  )
  for pattern in "${REMOVE_PNPM_PATTERNS[@]}"; do
    for p in node_modules/.pnpm/$pattern; do
      [[ -e "$p" ]] || continue
      echo "Removing .pnpm: $(basename "$p")"
      rm -rf "$p"
    done
  done
  # Remove broken symlinks
  find node_modules -maxdepth 3 -type l ! -exec test -e {} \; -delete 2>/dev/null || true
fi

# 4) Clean non-runtime files from node_modules.
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
