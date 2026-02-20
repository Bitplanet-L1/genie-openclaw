# Complete `memoryDir` Config Threading — Implementation Plan

**Status:** Proposed
**Date:** 2026-02-20
**Related:** [ADR-001 Fork Decisions](../../../../genie-architecture/specs/fork-diverge-openclaw/ADR-001-FORK-DECISIONS.md) | [Genie Workspace Spec](../../../../genie-architecture/specs/fork-diverge-openclaw/GENIE-WORKSPACE-SPEC.md)

---

## Context

PR #2 added `memoryDir` to the core workspace functions in `src/agents/workspace.ts`, enabling agent memory files to live at `workspace/GenieBrain/` instead of the workspace root. Six call sites correctly pass this config. Thirteen do not — spread across 4 files. This plan completes the threading.

**Scope boundary:** Config threading only. No branding, templates, or migration scripts (separate ADR items).

---

## File 1: `src/agents/workspace.ts`

### Prerequisite: Export `resolveMemoryWorkspaceDir`

**Line 258** — Currently a private function. Add `export` so other modules can resolve memory paths without duplicating the join logic.

```diff
-function resolveMemoryWorkspaceDir(workspaceDir: string, memoryDir?: string): string {
+export function resolveMemoryWorkspaceDir(workspaceDir: string, memoryDir?: string): string {
```

No tests needed — already covered by existing `workspace.test.ts` tests that exercise `ensureAgentWorkspace` and `loadWorkspaceBootstrapFiles` with `memoryDir`.

---

## File 2: `src/gateway/server-methods/agents.ts`

This file has **8 broken call sites**. All have access to config via `loadConfig()`.

### 2a. `resolveAgentWorkspaceFileOrRespondError` helper (lines 64-93)

Returns `{ cfg, agentId, workspaceDir, name }`. The `agents.files.get` and `agents.files.set` handlers use `workspaceDir` to construct file paths — wrong when `memoryDir` is set.

**Fix:** Also return the resolved memory directory.

```diff
-  return { cfg, agentId, workspaceDir, name };
+  const memoryDir = cfg.agents?.defaults?.memoryDir;
+  const memoryDir = resolveMemoryWorkspaceDir(workspaceDir, memoryDir);
+  return { cfg, agentId, workspaceDir, memoryDir, name };
```

Import `resolveMemoryWorkspaceDir` from `../../agents/workspace.js`.

### 2b. `listAgentFiles` function (lines 115-170)

Takes `workspaceDir: string` and joins all bootstrap/memory file paths directly against it.

**Fix:** Add `memoryDir` to options, resolve a `memoryDir`, use it for all file path construction.

```diff
-async function listAgentFiles(workspaceDir: string, options?: { hideBootstrap?: boolean }) {
+async function listAgentFiles(workspaceDir: string, options?: { hideBootstrap?: boolean; memoryDir?: string }) {
+  const memoryDir = resolveMemoryWorkspaceDir(workspaceDir, options?.memoryDir);
   // ...
-    const filePath = path.join(workspaceDir, name);
+    const filePath = path.join(memoryDir, name);
   // ... (same for MEMORY.md paths at lines 143-165)
```

### 2c. `agents.create` handler (lines 273-291)

Two issues:

- **Line 274:** `ensureAgentWorkspace` missing `memoryDir`
- **Line 283:** `path.join(workspaceDir, DEFAULT_IDENTITY_FILENAME)` ignores subdir

```diff
 const skipBootstrap = Boolean(nextConfig.agents?.defaults?.skipBootstrap);
-await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: !skipBootstrap });
+const memoryDir = nextConfig.agents?.defaults?.memoryDir;
+await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: !skipBootstrap, memoryDir });
 // ...
-const identityPath = path.join(workspaceDir, DEFAULT_IDENTITY_FILENAME);
+const identityPath = path.join(resolveMemoryWorkspaceDir(workspaceDir, memoryDir), DEFAULT_IDENTITY_FILENAME);
```

### 2d. `agents.update` handler (lines 340-349)

Same pattern as `agents.create`:

```diff
 const skipBootstrap = Boolean(nextConfig.agents?.defaults?.skipBootstrap);
-await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: !skipBootstrap });
+const memoryDir = nextConfig.agents?.defaults?.memoryDir;
+await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: !skipBootstrap, memoryDir });
 // ...
-const identityPath = path.join(workspace, DEFAULT_IDENTITY_FILENAME);
+const identityPath = path.join(resolveMemoryWorkspaceDir(workspace, memoryDir), DEFAULT_IDENTITY_FILENAME);
```

Note: `agents.update` uses variable name `workspace` (line 346), not `workspaceDir`.

### 2e. `agents.files.list` handler (line 433)

```diff
-const files = await listAgentFiles(workspaceDir, { hideBootstrap });
+const memoryDir = cfg.agents?.defaults?.memoryDir;
+const files = await listAgentFiles(workspaceDir, { hideBootstrap, memoryDir });
```

### 2f. `agents.files.get` handler (line 455)

```diff
-const { agentId, workspaceDir, name } = resolved;
-const filePath = path.join(workspaceDir, name);
+const { agentId, workspaceDir, memoryDir, name } = resolved;
+const filePath = path.join(memoryDir, name);
```

### 2g. `agents.files.set` handler (lines 505-507)

```diff
-const { agentId, workspaceDir, name } = resolved;
-await fs.mkdir(workspaceDir, { recursive: true });
-const filePath = path.join(workspaceDir, name);
+const { agentId, workspaceDir, memoryDir, name } = resolved;
+await fs.mkdir(memoryDir, { recursive: true });
+const filePath = path.join(memoryDir, name);
```

### Tests for File 2

**File:** `src/gateway/server-methods/agents-mutate.test.ts`

- Assert `ensureAgentWorkspace` mock is called with `memoryDir` in `agents.create` and `agents.update`
- Add test: `listAgentFiles` with `memoryDir` constructs paths under the subdir
- Add test: `agents.files.get` / `agents.files.set` resolve paths through `memoryDir`

---

## File 3: `src/agents/sandbox/workspace.ts`

### 3a. `ensureSandboxWorkspace` function (lines 15-51)

No `memoryDir` parameter. Seeds files from `path.join(seed, name)` — wrong when memory files live in a subdir.

**Fix:** Add `memoryDir?: string` param. Resolve seed source and destination paths through it.

```diff
 export async function ensureSandboxWorkspace(
   workspaceDir: string,
   seedFrom?: string,
   skipBootstrap?: boolean,
+  memoryDir?: string,
 ) {
-  await fs.mkdir(workspaceDir, { recursive: true });
+  const memoryDir = resolveMemoryWorkspaceDir(workspaceDir, memoryDir);
+  await fs.mkdir(memoryDir, { recursive: true });
   if (seedFrom) {
-    const seed = resolveUserPath(seedFrom);
+    const seedMemoryDir = resolveMemoryWorkspaceDir(resolveUserPath(seedFrom), memoryDir);
     // ...
-      const src = path.join(seed, name);
-      const dest = path.join(workspaceDir, name);
+      const src = path.join(seedMemoryDir, name);
+      const dest = path.join(memoryDir, name);
   }
-  await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: !skipBootstrap });
+  await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: !skipBootstrap, memoryDir });
 }
```

Import `resolveMemoryWorkspaceDir` from `../workspace.js`.

---

## File 4: `src/agents/sandbox/context.ts`

### 4a. `ensureSandboxWorkspaceLayout` caller (lines 43-47)

```diff
 await ensureSandboxWorkspace(
   sandboxWorkspaceDir,
   agentWorkspaceDir,
   params.config?.agents?.defaults?.skipBootstrap,
+  params.config?.agents?.defaults?.memoryDir,
 );
```

### Tests for Files 3-4

Add test that `ensureSandboxWorkspace` with `memoryDir` set:

- Seeds files from `seedFrom/<subdir>/SOUL.md` to `workspaceDir/<subdir>/SOUL.md`
- Passes `memoryDir` to `ensureAgentWorkspace`

---

## File 5: `extensions/voice-call/src/core-bridge.ts`

### 5a. Type stub (line 50)

```diff
-  ensureAgentWorkspace: (params?: { dir: string }) => Promise<void>;
+  ensureAgentWorkspace: (params?: { dir: string; memoryDir?: string }) => Promise<void>;
```

---

## File 6: `extensions/voice-call/src/response-generator.ts`

### 6a. Workspace call (line 70)

`CoreConfig` has `[key: string]: unknown`, so `agents` is accessible:

```diff
-  await deps.ensureAgentWorkspace({ dir: workspaceDir });
+  const agentDefaults = (cfg as Record<string, unknown>).agents as
+    | { defaults?: { memoryDir?: string } }
+    | undefined;
+  await deps.ensureAgentWorkspace({ dir: workspaceDir, memoryDir: agentDefaults?.defaults?.memoryDir });
```

---

## Verification

```bash
pnpm install
pnpm build
pnpm check
pnpm test

# targeted:
npx vitest run src/agents/workspace.test.ts
npx vitest run src/gateway/server-methods/agents-mutate.test.ts
```

## Execution Order

Files 1 → 2 → 3+4 → 5+6. Tests alongside each file, not deferred. Files 2, 3+4, and 5+6 are independent and could be parallelized across engineers.
