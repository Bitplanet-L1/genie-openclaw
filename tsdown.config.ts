import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

// Bundle these packages inline — they ship TypeScript-only / broken dist
// and don't work after flat npm install. Do NOT add packages with native
// addons here (e.g. koffi, sharp) — they'll fail the build.
const noExternal = [/^@buape\/carbon(\/.*)?$/];

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    fixedExtension: false,
    noExternal,
    platform: "node",
  },
  {
    entry: "src/entry.ts",
    env,
    fixedExtension: false,
    noExternal,
    platform: "node",
  },
  {
    // Ensure this module is bundled as an entry so legacy CLI shims can resolve its exports.
    entry: "src/cli/daemon-cli.ts",
    env,
    fixedExtension: false,
    noExternal,
    platform: "node",
  },
  {
    entry: "src/infra/warning-filter.ts",
    env,
    fixedExtension: false,
    noExternal,
    platform: "node",
  },
  {
    entry: "src/plugin-sdk/index.ts",
    outDir: "dist/plugin-sdk",
    env,
    fixedExtension: false,
    noExternal,
    platform: "node",
  },
  {
    entry: "src/plugin-sdk/account-id.ts",
    outDir: "dist/plugin-sdk",
    env,
    fixedExtension: false,
    noExternal,
    platform: "node",
  },
  {
    entry: "src/extensionAPI.ts",
    env,
    fixedExtension: false,
    noExternal,
    platform: "node",
  },
  {
    entry: ["src/hooks/bundled/*/handler.ts", "src/hooks/llm-slug-generator.ts"],
    env,
    fixedExtension: false,
    noExternal,
    platform: "node",
  },
]);
