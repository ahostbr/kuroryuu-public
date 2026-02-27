# Fix ExcalidrawTerminal "Flash & Exit" After cmd /c Wrapping

## Context

The ExcalidrawTerminal "Start Terminal" button was failing with "File not found" (daemon mode didn't wrap `.cmd` shims in `cmd /c`). The cmd/c wrapping fix was applied to `index.ts:setupPtyIpcHandlersDaemon()` and is already in the build. The terminal no longer throws "File not found" but now **flashes briefly and disappears** — the process starts then immediately exits.

**Root cause**: ExcalidrawTerminal passes `noBootstrap: true` with no `promptPath`, so `buildCliConfig()` returns **empty args** (`args: []`). Claude CLI spawns bare with nothing to do. Both `EXCALIDRAW_BOOTSTRAP.md` and `MARKETING_BOOTSTRAP.md` exist in `ai/skills/` but are never referenced by their respective terminal components.

The `useSpawnTerminalAgent` hook already supports `promptPath` — it maps to `specialistPromptPath` in the AgentConfig, and `buildCliConfig` adds it as a `@file` arg. The fix is to use this existing mechanism.

## Changes

### 1. `apps/desktop/src/renderer/components/excalidraw/ExcalidrawTerminal.tsx` (line 26-30)

Replace `noBootstrap: true` with the Excalidraw specialist prompt:

```tsx
// BEFORE:
spawn({
  name: 'Excalidraw Agent',
  role: 'specialist',
  capabilities: ['excalidraw'],
  noBootstrap: true,
  onReady: ...

// AFTER:
spawn({
  name: 'Excalidraw Agent',
  role: 'specialist',
  capabilities: ['excalidraw'],
  promptPath: 'ai/skills/excalidraw/EXCALIDRAW_BOOTSTRAP.md',
  onReady: ...
```

This makes `buildCliConfig` produce `args: ['@ai/skills/excalidraw/EXCALIDRAW_BOOTSTRAP.md']`, giving Claude the Excalidraw specialist system prompt.

### 2. `apps/desktop/src/renderer/components/marketing/MarketingTerminal.tsx` (line 26-30)

Same fix — replace `noBootstrap: true` with marketing prompt:

```tsx
// BEFORE:
spawn({
  name: 'Marketing Specialist',
  role: 'specialist',
  capabilities: ['marketing'],
  noBootstrap: true,

// AFTER:
spawn({
  name: 'Marketing Specialist',
  role: 'specialist',
  capabilities: ['marketing'],
  promptPath: 'ai/skills/marketing/MARKETING_BOOTSTRAP.md',
```

### 3. `apps/desktop/src/main/index.ts` — Already applied (keep as-is)

The `cmd /c` wrapping in `setupPtyIpcHandlersDaemon()` (lines 646-685) is correct and needed. Without it, `.cmd` shims fail with "File not found" in daemon mode ConPTY.

## Files

| File | Action |
|------|--------|
| `apps/desktop/src/renderer/components/excalidraw/ExcalidrawTerminal.tsx` | Replace `noBootstrap: true` with `promptPath` |
| `apps/desktop/src/renderer/components/marketing/MarketingTerminal.tsx` | Replace `noBootstrap: true` with `promptPath` |
| `apps/desktop/src/main/index.ts` | Already fixed (cmd /c wrapping) |

## Reused Existing Code

- `useSpawnTerminalAgent` hook `promptPath` option (line 26) — maps to `specialistPromptPath`
- `buildCliConfig()` lines 49-57 — already handles `specialistPromptPath` as `@file` arg
- `ai/skills/excalidraw/EXCALIDRAW_BOOTSTRAP.md` — existing specialist prompt
- `ai/skills/marketing/MARKETING_BOOTSTRAP.md` — existing specialist prompt

## Verification

1. `cd apps/desktop && npm run build` — must compile cleanly
2. Launch the app
3. Navigate to Excalidraw page → "Start Terminal" → terminal should spawn and stay open with the Excalidraw specialist prompt active
4. Navigate to Marketing page → "Start Terminal" → same
5. Open regular Terminals page → spawn a worker → should still work (unaffected)
