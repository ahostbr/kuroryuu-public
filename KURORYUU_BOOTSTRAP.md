# KURORYUU BOOTSTRAP

> Minimal startup. Full rules: `KURORYUU_LAWS.md`
>
> **Hackathon Stats:** 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions

## Quick Start

```
k_session(action="start", process_id=<PID>, cli_type="claude", agent_id="<id>")
k_rag(action="status")        # Check index
k_repo_intel(action="status") # Check reports
```
→ `KURORYUU-aware. Session: {id}. Ready.`

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

## Task Tracking (HARD RULE)

**Use `TaskCreate` for ALL work in Kuroryuu.**

When starting any task, create a Claude Code task:
```
TaskCreate: "Implement feature X" or "Fix bug Y" or "Refactor Z"
```

This syncs to `ai/todo.md` `## Claude Tasks` section via PostToolUse hook.

**Why:**
- Tasks persist across sessions (project-global, not session-scoped)
- Desktop monitor shows real-time progress (MONITOR → Claude Tasks)
- Evidence chains link tasks to worklogs
- Git-tracked history

**When complete:**
```
TaskUpdate: status=completed
```
→ Task marked `[x]` with timestamp in todo.md

---

## Use-Case Flows

### "I need to find code"
```
k_rag(action="status")                    # Fresh? If not: k_rag(action="index")
k_rag(action="query", query="pattern")    # Search
```

### "I need architecture info"
```
k_repo_intel(action="status")             # Fresh? If not: k_repo_intel(action="run")
k_repo_intel(action="get", report="routes|hooks|symbol_map|todos")
```

### "I'm the first agent"
→ Read `KURORYUU_LEADER.md` → Register as leader

### "Leader already exists"
→ Read `KURORYUU_WORKER.md` → Register as worker

### "I need to use PTY"
→ **LEADER-ONLY**. See LAWS §4.

### "I need specialist analysis"
Specialists auto-trigger on task keywords. Check:
- **Security Auditor**: security, auth, vulnerability, CVE
- **Performance Optimizer**: performance, slow, optimize, memory
- **Doc Writer**: documentation, docs, README
- **Test Generator**: test, testing, coverage, TDD

### "I want to learn from past tasks" (Collective Intelligence)
```
k_collective(action="query_patterns", query="refactoring large files")
```
→ Returns past successes/failures for similar tasks

### "I finished a task" (Worker Completion)
**Step 1:** Update todo.md (SOURCE OF TRUTH):
```python
from apps.gateway.orchestration.todo_md import TodoMdParser
parser = TodoMdParser()
parser.mark_task_done(task_id, "Summary of what was done")
```

**Step 2:** Report to leader via inbox:
```python
k_inbox(action="send", to_agent="leader", subject="DONE: T053", body="<promise>DONE</promise>...")
```

### "I'm finalizing a task" (Leader Finalization)
```
k_session(action="log", session_id="...", message="...")
```
**REQUIRED at finalization** - Leaders must record outcomes:
```
k_collective(action="record_success", task_type="...", approach="...", evidence="...")
k_collective(action="record_failure", task_type="...", approach="...", reason="...")  # if any
k_collective(action="update_skill", agent_id="worker_X", skill_type="...", delta=1)
```
→ See `leader_finalize.md` Step 6 for details

### "Worker context running low" (Leader monitors)
→ Leader sees ≤20% in `latest.jpg` (CLI warning threshold)
→ Automatic sequence: ESC → /savenow → /compact → /loadnow
→ Must complete before 5% (auto-compact threshold)
→ Worker continues with fresh context after leader reassigns task
→ See KURORYUU_LEADER.md §13 for full intervention sequence

### "I want to self-compact (no leader)" (Worker, on-demand)
⚠️ **OPTIONAL** - Only when user explicitly requests self-compacting

**Flow:**
1. `k_capture(action="screenshot")` → identify your terminal coordinates
2. Note your terminal's X,Y pixel position from screenshot
3. Run script (then **STOP IMMEDIATELY** - 10s countdown):
```powershell
ai/scripts/self_compact.ps1 -X <x> -Y <y> -Message "Task T###: <context>" -Verbose
```
4. Script clicks terminal, types `/compact <message>`, presses Enter
5. After ASCII art appears → `/loadnow` to restore checkpoint

**Coordinate identification:**
```python
k_capture(action="list_monitors")  # Get monitor layout with coordinates
k_capture(action="screenshot")      # Capture desktop, read to find terminal position
```
→ See `ai/scripts/self_compact.ps1` for full parameters
→ Prefer leader-managed flow (KURORYUU_LEADER.md §13) when leader available

### "I want buffer-first monitoring" (Leader, opt-in)
```bash
export KURORYUU_TERM_BUFFER_ACCESS=leader_only  # or "all"
```
→ Use `k_pty(action="term_read", session_id="...", mode="tail")`
→ <200ms latency vs ~10s for vision
→ Delta mode for efficient polling
→ See `Docs/Guides/buffer-monitoring-opt-in.md`
→ Prompts: `leader_prime_buffer.md`, `leader_monitor_buffer.md`

### "I learned something significant" (Worker)
```
k_collective(
    action="record_success",
    task_type="zustand state management",  # freeform
    approach="Used selector pattern to prevent re-renders",
    evidence="Component renders 3x instead of 47x",
    agent_id="worker_A"  # REQUIRED for skill matrix
)
```
→ Only for genuinely useful learnings, not routine tasks
→ See KURORYUU_WORKER.md §6.1

**Decision tree: "Is this worth recording?"**
```
Was this a non-obvious solution? → YES → Record
Did I discover a framework quirk? → YES → Record
Would future agents try the same (failed) approach? → YES → Record
Is this routine/documented? → YES → Skip
Is this task-specific with no reuse value? → YES → Skip
```

### "Starting a new subtask" (Leader)
→ Query k_collective for relevant patterns
→ Write patterns to `ai/collective/patterns_<worker_id>.md`
→ Notify worker via k_inbox to read before starting
→ Create focused, right-sized task (see §2.3.2 auto-sizing)
→ See KURORYUU_LEADER.md §2.3.1 and §2.3.2

### "I'm ending session"
```
k_session(action="end", session_id="...", summary="...")
```

### "I need to save my state" (Checkpoints)
```
k_checkpoint(action="save", name="meaningful_name", summary="What I did", data={...})
```
→ Saves to `ai/checkpoints/{name}/checkpoint_{timestamp}.json`
→ Use at: 80% context, before risky operations, end of significant work

### "I need to resume from checkpoint"
```
k_checkpoint(action="list", limit=10)              # See recent checkpoints
k_checkpoint(action="load", id="cp_20260111_...")  # Load specific one
```

### "I need to write a worklog"
→ Write to: `Docs/worklogs/KiroWorkLog_YYYYMMDD_HHMMSS_Description.md`
→ Use at: End of significant session, major feature complete, multi-file changes

### "I need to link checkpoint ↔ worklog ↔ plan" (Cross-References)
**After /savenow:**
1. Get checkpoint ID from save output
2. Add to worklog header: `**Checkpoint:** cp_xxx`
3. Add to worklog header: `**Plan:** Docs/Plans/xxx.md` (if applicable)
4. Checkpoint data should include: `plan_file`, `worklog_files`, `task_ids`

**Verification:** Desktop CheckpointDetailPanel shows related docs automatically.

### "I need multiple perspectives on a decision" (Leader)
```python
# 1. Spawn thinker debate via k_pty
k_pty(action="spawn_cli", cli_provider="claude", role="worker",
      custom_prompt="{visionary_prompt}")
k_pty(action="spawn_cli", cli_provider="claude", role="worker",
      custom_prompt="{skeptic_prompt}")

# 2. Inject debate topic
k_thinker_channel(action="send_line", target_agent_id="visionary_001",
                  data="Topic: Should we use PostgreSQL or keep file-based storage?")

# 3. Monitor via k_capture
k_capture(action="get_latest")
```
→ See KURORYUU_LEADER.md §14 for full orchestration guide

### "I want to consult a thinker mid-task" (Worker)
```python
# Send question to active thinker
k_thinker_channel(action="send_line", target_agent_id="skeptic_001",
                  data="Quick check: Is this approach sound?")

# Read response (with timeout)
k_thinker_channel(action="read", target_agent_id="skeptic_001", timeout_ms=10000)
```
→ Workers CANNOT spawn thinkers (leader-only). Use existing thinkers only.
→ See KURORYUU_WORKER.md §11

### "I just ran /compact or /clear" (Worker Reconnection) ⚠️ VERY COMMON
**Problem:** PTY still active but MCP registration lost after context reset

**Symptoms:**
- `k_pty` returns `SESSION_NOT_FOUND`
- Terminal works but MCP tools fail

**3-Step Fix:**
```bash
# 1. Load checkpoint to get PTY identity
/loadnow

# 2. Restart k_session with checkpoint's agent_id and process_id
k_session(action="start", process_id=<from_checkpoint>, cli_type="claude", agent_id="<from_checkpoint>")

# 3. Re-register PTY with MCP Core
curl -X POST http://127.0.0.1:8100/v1/pty/register \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<pty_session_id>","source":"desktop","desktop_url":"http://127.0.0.1:8201","cli_type":"claude","pid":<process_id>,"owner_agent_id":"<agent_id>","owner_session_id":"<session_id>","owner_role":"worker","label":"Worker 1"}'

# 4. Verify
k_pty(action="term_read", session_id="<pty_session_id>", mode="tail")
```
→ Full guide: `Docs/Guides/worker-reconnection-after-compact.md`
→ See KURORYUU_WORKER.md §7.1.1

### Thinker Pairings
| Use Case | Pair | Why |
|----------|------|-----|
| Feature ideation | visionary + skeptic | Balance innovation with critique |
| Security review | red_team + blue_team | Adversarial testing |
| Architecture | first_principles + systems_thinker | Deep analysis |
| UX decisions | user_advocate + pragmatist | User focus + feasibility |

→ Full personas: `ai/prompt_packs/thinkers/`

---

## Tool Quick Ref (16 Tools → 118 Actions)

| Tool | Actions | Key Actions |
|------|---------|-------------|
| `k_rag` | 12 | query, index, status, hybrid, semantic, agentic |
| `k_pty` | 12 | list, term_read, send_line, talk, resolve, spawn_cli |
| `k_inbox` | 8 | send, list, claim, complete, stats |
| `k_capture` | 8 | start, stop, screenshot, poll, get_latest |
| `k_pccontrol` | 8 | click, type, launch, find_element (OPT-IN) |
| `k_session` | 7 | start, end, log, context |
| `k_memory` | 7 | get, set_goal, add_blocker, set_steps |
| `k_graphiti_migrate` | 6 | status, migrate, rollback, verify |
| `k_collective` | 6 | record_success, record_failure, query_patterns |
| `k_repo_intel` | 5 | get, run, status, list |
| `k_files` | 5 | read, write, list, delete |
| `k_checkpoint` | 4 | save, load, list, delete |
| `k_thinker_channel` | 3 | send_line, read, list |
| `k_MCPTOOLSEARCH` | 2 | search, list |
| `k_help` | - | Help system |

**OPT-IN:** `k_pccontrol` (PowerShell desktop automation) requires explicit enable via Desktop Settings.
**DPI NOTE:** For accurate click coordinates, use 100% display scaling (Windows Settings → Display).

---

## Canonical File Locations

### Governance (Root)
| What | Where |
|------|-------|
| Laws | `KURORYUU_LAWS.md` |
| Leader bootstrap | `KURORYUU_LEADER.md` |
| Worker bootstrap | `KURORYUU_WORKER.md` |
| Agent definitions | `AGENTS.md` |

### AI Harness (`ai/`)
| What | Where |
|------|-------|
| **Tasks (SOURCE OF TRUTH)** | `ai/todo.md` |
| Checkpoints | `ai/checkpoints/` |
| Execution reports | `ai/reports/` |
| Workflow formulas | `ai/formulas/` |
| Hooks configuration | `ai/hooks.json` |
| Session registry | `ai/sessions.json` |

> **IMPORTANT:** `ai/todo.md` is THE canonical source for all tasks.
> - Leaders read Backlog for pending work
> - Workers mark tasks done when complete
> - Orchestration API is for coordination only (in-memory)
> - For historical context, use `Docs/DEVLOG.md`

### Prompts (`ai/prompts/`)
| What | Where |
|------|-------|
| Workflow prompts | `ai/prompts/workflows/` |
| Leader prompts | `ai/prompts/leader/` |
| Worker prompts | `ai/prompts/worker/` |
| Phase prompts | `ai/prompts/phases/` |
| Model system prompts | `ai/prompts/models/` |
| Thinker personas | `ai/prompt_packs/thinkers/` |
| **Specialist personas** | `ai/prompt_packs/specialists/` |
| Kiro IDE prompts | `.kiro/prompts/` |

### Collective Intelligence (`ai/collective/`)
| What | Where |
|------|-------|
| Pattern library | `ai/collective/patterns.jsonl` |
| Skill matrix | `ai/collective/skill_matrix.json` |

### Documentation (`Docs/`)
| What | Where |
|------|-------|
| **Development history** | `Docs/DEVLOG.md` |
| Active plans | `Docs/Plans/` |
| Archived plans | `Docs/Plans/Archive/` |
| Architecture docs | `Docs/Architecture/` |
| User/dev guides | `Docs/Guides/` |
| Case studies | `Docs/CaseStudies/` |
| Session worklogs | `Docs/worklogs/` |
| PRD | `Docs/PRD.md` |

### Scripts (`scripts/`)
| What | Where |
|------|-------|
| Context status | `scripts/context_status.ps1` |

### Apps (Code Only - NO docs inside)
| What | Where |
|------|-------|
| MCP Core (16 tools, 118 actions) | `apps/mcp_core/` |
| Gateway (21 routers) | `apps/gateway/` |
| Desktop (235 components) | `apps/desktop/` |
| Web | `apps/web/` |
| Kuroryuu CLI (9,030 LOC) | `apps/kuroryuu_cli/` |
| Tray Companion | `apps/tray_companion/` |

### Repo Intel Reports
| What | Where |
|------|-------|
| All reports | `Reports/RepoIntel/` |

---

## Deprecated Files (DO NOT USE)

The following files have been removed from the canonical harness specification:

| File | Deprecated | Replacement | Reason |
|------|------------|-------------|--------|
| `ai/progress.md` | 2026-01-23 | `Docs/DEVLOG.md` | Harness drift; duplicate state |
| `ai/feature_list.json` | 2026-01-23 | `ai/todo.md` | Redundant; tasks ARE features |

**IMPORTANT:** Do NOT read or write these files. Use the replacements specified above.

→ Full specification: `Docs/Architecture/HARNESS_FILES_SPECIFICATION.md`

---

## Hard Rules (Summary)

1. **Stack**: `.\run_all.ps1` / `.\kill_all.ps1` only
2. **Indexes**: Check freshness before search
3. **Evidence**: No silent claims
4. **PTY**: All agents (k_inbox for coordination)
5. **Conflicts**: LAWS wins
6. **Deprecated files**: NEVER use progress.md or feature_list.json

→ Details: `KURORYUU_LAWS.md`
