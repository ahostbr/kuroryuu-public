# Plan: CLIProxyAPIPlus Model List Alignment

## Context

The CLIProxyAPIPlus model catalog has evolved to 62+ models across 6 source providers (Antigravity 10, Claude 8, OpenAI 9, GitHub Copilot 21, Kiro 9, Gemini 5). Two canonical source files are already in sync:

- **Python:** `apps/gateway/cli/model_shorthands.py` (STATIC_MODELS + MODEL_SHORTHANDS)
- **TypeScript:** `apps/desktop/src/renderer/services/model-registry.ts` (getStaticCLIProxyModels + formatModelName)

However, **10 other files** across the monorepo still reference stale model IDs, old families, or incomplete shorthands. This plan aligns all of them.

---

## Files to Update (10 files, grouped by independence for parallel execution)

### Group A: Gateway Backend (Python)

**A1.** `apps/gateway/llm/backends/cliproxyapi.py`
- **`_get_model_family()`** — Add antigravity detection (gemini-claude-* prefix, tab_flash_lite_preview, gpt-oss-120b-medium). Reorder checks: kiro→antigravity→claude→gemini→openai→copilot→qwen→other (matches model_shorthands.py logic)
- **`model_supports_tools()`** — Add kiro agentic distinction (`"agentic" in model → True`), add antigravity→False
- **`health_check()`** — Add `"antigravity": "antigravity"` to cli_map
- **Docstring** — Update model examples to current list

### Group B: CLI v2 (TypeScript)

**B1.** `apps/kuroryuu_cli_v2/src/providers/cliproxy.ts`
- **`MODEL_SHORTHANDS`** — Replace 17 entries with full 43 entries from `model_shorthands.py`
- **`resolveModelShorthand()`** — No code change needed (already case-insensitive passthrough)
- **`fetchModelInfo()` family defaults** — Add kiro (200K), copilot (128K), qwen (32K), deepseek (64K) families
- **`CLIProxyProvider.name`** — Note: currently `'cliproxyapiplus'`, leave as-is (intentional)

**B2.** `apps/kuroryuu_cli_v2/src/providers/__tests__/cliproxy.test.ts`
- Update shorthand tests to cover new entries (opus4.5, opus4.1, sonnet4, codex-max, kiro-opus, etc.)
- Add family fallback tests for kiro, copilot, qwen, deepseek

### Group C: CLI v1 (Python)

**C1.** `apps/kuroryuu_cli/providers/cliproxy_provider.py`
- **`fetch_model_info()` family defaults** — Add kiro→200K, copilot→128K, qwen→32K, deepseek→64K, antigravity→200K fallbacks

**C2.** `apps/kuroryuu_cli/providers/claude_provider.py`
- **`CLAUDE_CONTEXT_WINDOWS`** — Add missing models:
  - `claude-sonnet-4-5-20250929`: 200000
  - `claude-haiku-4-5-20251001`: 200000
  - `claude-opus-4-1-20250805`: 200000
  - `claude-opus-4-20250514`: 200000
  - `claude-3-7-sonnet-20250219`: 200000

**C3.** `apps/kuroryuu_cli/tests/test_cliproxy_discovery.py`
- Add family fallback tests for new families (kiro, copilot, antigravity, qwen)

### Group D: Desktop UI (TypeScript)

**D1.** `apps/desktop/src/renderer/types/settings.ts`
- **`AVAILABLE_MODELS`** — Replace 13 stale entries with current models. Keep it as a curated "quick pick" list (not full 62):
  - Claude (8): haiku-4-5, sonnet-4-5, opus-4-5, opus-4-1, opus-4, sonnet-4, 3.7-sonnet, 3.5-haiku
  - OpenAI (9): gpt-5, gpt-5-codex, gpt-5-codex-mini, gpt-5.1, gpt-5.1-codex, gpt-5.1-codex-mini, gpt-5.1-codex-max, gpt-5.2, gpt-5.2-codex
  - Gemini (5): 2.5-pro, 2.5-flash, 2.5-flash-lite, 3-pro-preview, 3-flash-preview

**D2.** `apps/desktop/src/renderer/services/model-registry.ts`
- **`getClaudeModels()`** — Update from 4 old models to the current 8 Claude models (matching STATIC_MODELS)

**D3.** `apps/desktop/src/renderer/types/domain-config.ts`
- **`getModelDisplayName()`** — Add missing entries for all 62 models. Cross-reference from `formatModelName()` in model-registry.ts which is already up to date.

### Group E: Tray Companion (TypeScript)

**E1.** `apps/tray_companion/src/main/lmstudio-integration.ts`
- **`getStaticCLIProxyModels()`** — Replace 18 stale entries with the full 62 model list (matching model-registry.ts)
- **`formatModelName()`** — Align with `formatModelName()` from model-registry.ts

### Group F: Gateway Tests (Python)

**F1.** `apps/gateway/tests/test_cliproxy_discovery.py`
- Add parametrized tests for antigravity family detection (gemini-claude-sonnet-4-5-thinking, tab_flash_lite_preview, gpt-oss-120b-medium)
- Add kiro agentic vs base tool support tests
- Add copilot special model tests (grok-code-fast-1, oswe-vscode-prime)
- Update cli_map assertions in health_check tests

---

## Execution Strategy

All 6 groups (A-F) are **file-independent** and can execute in parallel. Within each group, changes are sequential (e.g., update source before tests).

**Parallel agents (6):**
1. Agent A → cliproxyapi.py backend updates
2. Agent B → CLI v2 provider + tests
3. Agent C → CLI v1 providers + tests
4. Agent D → Desktop UI types + services
5. Agent E → Tray companion
6. Agent F → Gateway tests

---

## Verification

After all changes:

1. **Gateway tests:** `cd apps/gateway && python -m pytest tests/test_cliproxy_discovery.py -v`
2. **CLI v1 tests:** `cd apps/kuroryuu_cli && python -m pytest tests/test_cliproxy_discovery.py -v`
3. **CLI v2 tests:** `cd apps/kuroryuu_cli_v2 && npx vitest run src/providers/__tests__/cliproxy.test.ts`
4. **TypeScript type check:** `cd apps/kuroryuu_cli_v2 && npx tsc --noEmit`
5. **Desktop build check:** `cd apps/desktop && npx tsc --noEmit` (verify no type errors in settings.ts, domain-config.ts, model-registry.ts)
6. **Manual:** Open Domain Configuration dialog in Desktop → verify model groups show correct counts (Claude 8, OpenAI 9, Antigravity 10, Copilot 21, Kiro 9, Gemini 5)

---

## Critical Files Reference

| File | Role | Status |
|------|------|--------|
| `apps/gateway/cli/model_shorthands.py` | Python canonical source | **IN SYNC** (do not modify) |
| `apps/desktop/src/renderer/services/model-registry.ts` | TS canonical source | Partially update (getClaudeModels only) |
| `apps/gateway/llm/backends/cliproxyapi.py` | Gateway backend | **STALE** — needs family/tool/health updates |
| `apps/kuroryuu_cli_v2/src/providers/cliproxy.ts` | CLI v2 provider | **STALE** — needs shorthand + fallback updates |
| `apps/kuroryuu_cli/providers/cliproxy_provider.py` | CLI v1 provider | **STALE** — needs fallback updates |
| `apps/kuroryuu_cli/providers/claude_provider.py` | CLI v1 claude | **STALE** — needs context window updates |
| `apps/desktop/src/renderer/types/settings.ts` | Desktop model list | **STALE** — needs full replacement |
| `apps/desktop/src/renderer/types/domain-config.ts` | Desktop display names | **STALE** — needs new entries |
| `apps/tray_companion/src/main/lmstudio-integration.ts` | Tray models | **STALE** — needs full replacement |
| `apps/gateway/tests/test_cliproxy_discovery.py` | Gateway tests | **STALE** — needs antigravity/kiro-agentic tests |
| `apps/kuroryuu_cli_v2/src/providers/__tests__/cliproxy.test.ts` | CLI v2 tests | **STALE** — needs shorthand test updates |
| `apps/kuroryuu_cli/tests/test_cliproxy_discovery.py` | CLI v1 tests | **STALE** — needs family fallback tests |
