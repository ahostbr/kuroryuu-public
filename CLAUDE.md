## Task Tracking (HARD RULE)

**Use `TaskCreate` for ALL work in Kuroryuu.**

```
TaskCreate: "Implement feature X"
TaskCreate: "Fix bug Y"
TaskCreate: "Refactor Z"
```

Tasks sync to `ai/todo.md` `## Claude Tasks` section automatically via PostToolUse hook.

**When complete:** `TaskUpdate: status=completed` → marks `[x]` with timestamp

**Why this matters:**
- Tasks persist across sessions (project-global)
- Desktop monitor shows real-time progress (MONITOR → Claude Tasks)
- Git-tracked history with evidence chains
- Worklogs can link to specific tasks

---

## Checkpoint Rule (HARD RULE)
Always **append to current checkpoint** - do not create new checkpoints each save. Update the existing one.

---

## Search Priority (HARD RULE)
!!!MUST FOLLOW THIS SEARCH PATTERN !!!

!!Use The MCP TOOLS YOU HAVE FIRST THEN > GO IN ORDER TO FALLBACK!!!

!!! Always search in this order: **k_rag → k_repo_intel → git → fallback** !!!

```
1. k_rag          →  Keyword search (fastest, indexed)
2. k_repo_intel   →  Structured reports (symbols, routes, deps)
3. git            →  History, blame, diffs
4. Fallback       →  Glob, Grep, Read, Task agents
```

Check freshness first: `k_rag(action="status")`, `k_repo_intel(action="status")`

---

## RAG Interactive Mode (Human-in-the-Loop)

Let user select which RAG results to keep before using them.

**Trigger phrases:**
- "search X interactively"
- "rag interactive search X"
- "let me pick the results for X"

**CLI Workflow** (uses AskUserQuestion - works in terminal):
1. Run `k_rag(action="query", query="X", top_k=5)`
2. Present results via `AskUserQuestion` with `multiSelect: true`
3. Question format: `"[query] - Select results to keep:"`
4. Only use the results user selected

**Desktop Workflow** (uses k_interact - requires Kuroryuu Desktop):
- Toggle: "rag interactive on/off/status"
- Runs: `rag-interactive-toggle.ps1`
- Flag file: `.enable-rag-interactive`
- Hook blocks queries → forces `query_interactive` action
- `query_interactive` calls k_interact for GUI selection

---

## Inbox Location

**Canonical Location**: `<PROJECT_ROOT>/ai/inbox`

- Maildir structure: `new/`, `cur/`, `done/`, `dead/`, `tmp/`
- JSON indexes: `.index/by_agent.json`, `.index/by_thread.json`
- Environment override: `KURORYUU_INBOX_ROOT` (optional)

---

## Claude Task Evidence (Linking Worklogs)

After completing significant work, link your worklog to the task:

1. Find your task in `ai/todo.md` `## Claude Tasks` section
2. Change `[worklog: pending]` → `[worklog: Docs/worklogs/KiroWorkLog_YYYYMMDD_...]`

**Task format:** `- [ ] T###: description @agent [worklog: pending] (created: timestamp)`

**Monitor:** Desktop → MONITOR → Claude Tasks (donut chart + Gantt timeline)

---

## Cross-Reference Rules (HARD RULE)

All persistence artifacts MUST be bidirectionally linked:

### Checkpoint Data Requirements
When saving checkpoints, ALWAYS include:
```json
{
  "plan_file": "Docs/Plans/xxx.md",        // Active plan (or null)
  "worklog_files": ["Docs/worklogs/..."],  // Worklogs this session
  "task_ids": ["T001", "T002"]             // Tasks being worked on
}
```

### Worklog Header Requirements
Every worklog MUST include in header:
```markdown
**Checkpoint:** cp_YYYYMMDD_HHMMSS_xxx
**Plan:** Docs/Plans/xxx.md (or "None")
**Tasks:** T001, T002
```

### Task Format (Updated)
```markdown
- [ ] T###: desc @agent [checkpoint: pending] [worklog: pending] (created: ts)
- [x] T###: desc @agent [checkpoint: cp_...] [worklog: path] (completed: ts)
```

---

## Windows "nul" File Bug (IMPORTANT)

**Problem:** Claude Code's Bash tool runs through Unix-style shell (WSL/Git Bash). When commands use Windows-style null redirection (`> nul` or `2>nul`), bash creates a literal file named "nul" instead of discarding output.

**Symptoms:** 0 KB files named `nul` appearing in project directories.

**Fix for scripts:**
```bash
# WRONG - creates file on Windows bash
command 2>nul

# CORRECT - works in bash
command 2>/dev/null
```

**Cleanup:** Use WSL to delete (Windows cmd can't delete reserved names):
```bash
wsl rm -f "/mnt/e/path/to/nul"
```

---

# STOP. Read KURORYUU_BOOTSTRAP.md FIRST.

> **Location:** `KURORYUU_BOOTSTRAP.md` (this directory)

## On Session Start

1. Read `KURORYUU_BOOTSTRAP.md`
2. Call: `kuroryuu_session_start(process_id, "claude", "your_agent_id")`
3. Confirm: `KURORYUU-aware. Session: {session_id}. Ready.`
