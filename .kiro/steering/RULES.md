# Kuroryuu Steering Rules

> Hard rules that MUST be followed by all agents working in this repo.

---

## Core Rules

### 1. Work in Small Chunks
- One feature at a time
- One task per tool loop
- Mark completion before starting next

### 2. Use Tools for Evidence
- Do NOT hallucinate file contents
- Use `k_rag(action="query")` to search before claiming knowledge
- Use `k_repo_intel` for structured reports, Grep for exact patterns
- Tool results are ground truth

### 3. Update Progress Log
- Append to `ai/progress.md` after meaningful work
- Include: Feature ID, What changed, Evidence, Next steps
- Never edit existing entries (append-only)

### 4. Do Not Mark Done Without Evidence
- Acceptance criteria require tool-verified evidence
- At least one tool must have succeeded
- Progress.md must contain evidence entries
- Use `/validate` before marking done

### 5. Stay Within Repo
- Never write outside `<PROJECT_ROOT>`
- Never leak secrets or API keys
- Never access network except MCP_CORE

### 6. Handle Tool Failures
- Max 8 tool calls per session
- Retry once on transient errors
- Report failures, don't hide them
- Fall back to "chat-only" if MCP unavailable

---

## Status Transitions

| From | Allowed To |
|------|------------|
| `todo` | `in_progress`, `blocked` |
| `in_progress` | `done`, `blocked` |
| `blocked` | `in_progress` |
| `done` | (terminal) |

**Cannot transition directly:** `todo` → `done`

---

## Harness Files

| File | Purpose | Rule |
|------|---------|------|
| `ai/feature_list.json` | Feature tracking | Update via harness endpoints only |
| `ai/progress.md` | Devlog | Append-only, never delete |
| `ai/prompts/*.md` | Workflow prompts | Read-only reference |

---

## Environment Boundaries

```
ALLOWED:
- <PROJECT_ROOT>/**
- http://127.0.0.1:8100 (MCP_CORE)
- http://127.0.0.1:8200 (Gateway)
- LM Studio / Claude API

NOT ALLOWED:
- Parent directories
- Other network hosts
- System files
- User home directories
```
