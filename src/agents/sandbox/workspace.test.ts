import { describe, expect, it, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => ({
  ensureAgentWorkspace: vi.fn(async () => {}),
  fsMkdir: vi.fn(async () => undefined),
  fsAccess: vi.fn(async () => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  }),
  fsReadFile: vi.fn<[string, ...unknown[]], string>(async () => "seed content"),
  fsWriteFile: vi.fn<[string, ...unknown[]], void>(async () => {}),
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  const patched = {
    ...actual,
    mkdir: mocks.fsMkdir,
    access: mocks.fsAccess,
    readFile: mocks.fsReadFile,
    writeFile: mocks.fsWriteFile,
  };
  return { ...patched, default: patched };
});

vi.mock("../../utils.js", () => ({
  resolveUserPath: (p: string) => p,
}));

vi.mock("../workspace.js", async () => {
  const actual = await vi.importActual<typeof import("../workspace.js")>("../workspace.js");
  return {
    ...actual,
    ensureAgentWorkspace: mocks.ensureAgentWorkspace,
  };
});

const { ensureSandboxWorkspace } = await import("./workspace.js");

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe("ensureSandboxWorkspace with memoryDir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fsAccess.mockImplementation(async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mocks.fsReadFile.mockResolvedValue("seed content");
  });

  it("creates memoryDir (not workspaceDir root) when memoryDir is set", async () => {
    await ensureSandboxWorkspace("/ws", undefined, false, "GenieBrain");

    expect(mocks.fsMkdir).toHaveBeenCalledWith("/ws/GenieBrain", { recursive: true });
    expect(mocks.fsMkdir).not.toHaveBeenCalledWith("/ws", { recursive: true });
  });

  it("passes memoryDir to ensureAgentWorkspace", async () => {
    await ensureSandboxWorkspace("/ws", undefined, false, "GenieBrain");

    expect(mocks.ensureAgentWorkspace).toHaveBeenCalledWith({
      dir: "/ws",
      ensureBootstrapFiles: true,
      memoryDir: "GenieBrain",
    });
  });

  it("seeds files from seedFrom/memoryDir/ to workspaceDir/memoryDir/", async () => {
    await ensureSandboxWorkspace("/ws", "/seed", false, "GenieBrain");

    const readCalls = mocks.fsReadFile.mock.calls.map((c) => String(c[0]));
    const writeCalls = mocks.fsWriteFile.mock.calls.map((c) => String(c[0]));

    expect(readCalls.every((p) => p.startsWith("/seed/GenieBrain/"))).toBe(true);
    expect(writeCalls.every((p) => p.startsWith("/ws/GenieBrain/"))).toBe(true);
  });

  it("falls back to workspaceDir root when memoryDir is absent", async () => {
    await ensureSandboxWorkspace("/ws", undefined, false, undefined);

    expect(mocks.fsMkdir).toHaveBeenCalledWith("/ws", { recursive: true });
  });

  it("passes undefined memoryDir to ensureAgentWorkspace when not set", async () => {
    await ensureSandboxWorkspace("/ws", undefined, false, undefined);

    expect(mocks.ensureAgentWorkspace).toHaveBeenCalledWith({
      dir: "/ws",
      ensureBootstrapFiles: true,
      memoryDir: undefined,
    });
  });
});
