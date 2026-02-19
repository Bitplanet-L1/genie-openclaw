import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import {
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  ensureAgentWorkspace,
  loadWorkspaceBootstrapFiles,
} from "./workspace.js";

describe("loadWorkspaceBootstrapFiles", () => {
  it("includes MEMORY.md when present", async () => {
    const tempDir = await makeTempWorkspace("openclaw-workspace-");
    await writeWorkspaceFile({ dir: tempDir, name: "MEMORY.md", content: "memory" });

    const files = await loadWorkspaceBootstrapFiles(tempDir);
    const memoryEntries = files.filter((file) =>
      [DEFAULT_MEMORY_FILENAME, DEFAULT_MEMORY_ALT_FILENAME].includes(file.name),
    );

    expect(memoryEntries).toHaveLength(1);
    expect(memoryEntries[0]?.missing).toBe(false);
    expect(memoryEntries[0]?.content).toBe("memory");
  });

  it("includes memory.md when MEMORY.md is absent", async () => {
    const tempDir = await makeTempWorkspace("openclaw-workspace-");
    await writeWorkspaceFile({ dir: tempDir, name: "memory.md", content: "alt" });

    const files = await loadWorkspaceBootstrapFiles(tempDir);
    const memoryEntries = files.filter((file) =>
      [DEFAULT_MEMORY_FILENAME, DEFAULT_MEMORY_ALT_FILENAME].includes(file.name),
    );

    expect(memoryEntries).toHaveLength(1);
    expect(memoryEntries[0]?.missing).toBe(false);
    expect(memoryEntries[0]?.content).toBe("alt");
  });

  it("omits memory entries when no memory files exist", async () => {
    const tempDir = await makeTempWorkspace("openclaw-workspace-");

    const files = await loadWorkspaceBootstrapFiles(tempDir);
    const memoryEntries = files.filter((file) =>
      [DEFAULT_MEMORY_FILENAME, DEFAULT_MEMORY_ALT_FILENAME].includes(file.name),
    );

    expect(memoryEntries).toHaveLength(0);
  });

  it("reads bootstrap files from memorySubdir when provided", async () => {
    const tempDir = await makeTempWorkspace("openclaw-workspace-");
    const memorySubdir = "GenieBrain";
    const memoryDir = path.join(tempDir, memorySubdir);
    await fs.mkdir(memoryDir, { recursive: true });
    await writeWorkspaceFile({ dir: tempDir, name: DEFAULT_SOUL_FILENAME, content: "root-soul" });
    await writeWorkspaceFile({
      dir: memoryDir,
      name: DEFAULT_SOUL_FILENAME,
      content: "subdir-soul",
    });

    const files = await loadWorkspaceBootstrapFiles(tempDir, memorySubdir);
    const soulEntry = files.find((file) => file.name === DEFAULT_SOUL_FILENAME);

    expect(soulEntry?.missing).toBe(false);
    expect(soulEntry?.content).toBe("subdir-soul");
    expect(soulEntry?.path).toBe(path.join(memoryDir, DEFAULT_SOUL_FILENAME));
  });
});

describe("ensureAgentWorkspace", () => {
  it("creates memorySubdir and writes bootstrap templates there", async () => {
    const tempDir = await makeTempWorkspace("openclaw-workspace-");
    const memorySubdir = "GenieBrain";
    const ws = await ensureAgentWorkspace({
      dir: tempDir,
      ensureBootstrapFiles: true,
      memorySubdir,
    });
    const memoryDir = path.join(tempDir, memorySubdir);

    expect(ws.dir).toBe(tempDir);
    expect(ws.soulPath).toBe(path.join(memoryDir, DEFAULT_SOUL_FILENAME));
    await expect(fs.access(memoryDir)).resolves.toBeUndefined();
    await expect(fs.access(path.join(memoryDir, DEFAULT_SOUL_FILENAME))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tempDir, DEFAULT_SOUL_FILENAME))).rejects.toThrow();
  });
});
