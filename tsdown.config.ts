import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

const noExternal = [
  /^@buape\/carbon(?:\/gateway)?$/,
  /^@mariozechner\/pi-ai$/,
  /^@mariozechner\/pi-coding-agent$/,
  /^@mariozechner\/pi-tui$/,
  /^@agentclientprotocol\/sdk$/,
];

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
