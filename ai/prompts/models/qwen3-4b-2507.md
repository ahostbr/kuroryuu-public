# KURORYUU HARD RULES (Non-Negotiable)

> **Read this FIRST. Every agent. Every session.**
> Full Laws Index: `KURORYUU_LAWS_INDEX.md`
> Full Canonical Authority: `KURORYUU_LAWS.md`

---

## 0. Stack Management — ALWAYS USE .ps1 SCRIPTS (HARD RULE)

**MUST FOLLOW — NO EXCEPTIONS**

| Action | Script |
|--------|--------|
| **Start stack** | `.\run_all.ps1` |
| **Kill stack** | `.\kill_all.ps1` |

**NEVER manually start uvicorn/python processes. ALWAYS use the scripts.**

---

## 1. Session Start — EVERY Session

On FIRST prompt of a session, call:
```
k_session(action="start", process_id=..., cli_type="...", agent_id="...")
```
Then confirm: `KURORYUU-aware. Session: {session_id}. Ready.`

---

## 2. Hook Calls — EVERY Tool Use

Before ANY tool execution:
```
k_session(action="pre_tool", session_id="...", tool_name="...", arguments="...")
```

After ANY tool execution:
```
k_session(action="post_tool", session_id="...", tool_name="...", result_ok=true, result_summary="...")
```

No exceptions. Even for small reads.

---

## 3. Progress Logging — EVERY Significant Action

After modifying files or completing tasks:
```
k_session(action="log", session_id="...", message="...")
```

Entry format: what changed, why, verification status.

---

## 4. No Silent Claims

Never say "fixed / works / verified" without evidence:
- Tool output proving success
- File read confirming change
- Test/build output

If unsure → mark **UNVERIFIED**

---

## 5. Session End — Before Leaving

Before ending session:
```
k_session(action="end", session_id="...", exit_code=0, summary="...")
```

---

## 6. LAWs Win All Conflicts

If anything contradicts `KURORYUU_LAWS.md`, the LAWs file wins.

**How to read LAWs:**
1. Load `KURORYUU_LAWS_INDEX.md` (index with line numbers)
2. Use `k_files(action="read", path="...")` with line range for specific section

---

## 7. TODO Management (MANDATORY)

**`ai/todo.md` is the source of truth for all agent work.**

### Auto-Injection
Every 3 tool calls, the system injects working context into your prompt.
This includes recent actions, goal, blockers, and next steps.

### Your Responsibility
You MUST update `ai/todo.md` on disk as you work:

1. **Mark tasks done:** Change `- [ ]` to `- [x]`
2. **Add new tasks:** Add `- [ ] T00X — description`
3. **Update Active Focus:** Current goal/feature
4. **Add blockers:** Problems preventing progress
5. **Log changes:** Append to Change History section

### Working Memory Tools
- `k_memory(action="get")` — See recent actions, goal, blockers
- `k_memory(action="set_goal", goal="...")` — Set current objective
- `k_memory(action="add_blocker", blocker="...")` — Report a blocker
- `k_memory(action="set_steps", steps=[...])` — Queue next actions

**RULE:** After every 3 tool calls, read and update `ai/todo.md`!

---

## Report & Documentation Locations

**CRITICAL:** Analysis reports belong in `.agents/docs/`, NOT `ai/`

| Report Type | Location | Examples |
|------------|----------|----------|
| **Agent Analysis** | `.agents/docs/agent-analysis/` | Devstral analysis, task breakdowns, solution planning |
| **System Health** | `.agents/docs/system-health/` | Status verification, checkpoint analysis, infrastructure reports |
| **Architecture** | `.agents/docs/architecture/` | Fork analysis, design decisions, module relationships |
| **Feature Tracking** | `.agents/docs/feature-tracking/` | Feature impact analysis, scoring analysis, TODO cross-refs |

**ai/ Directory (System State Only):**
- `ai/todo.md` — active tasks (SOURCE OF TRUTH)
- `ai/hooks.json` — hook configuration
- `ai/sessions.json` — session registry
- **NO ANALYSIS REPORTS** — Always use .agents/docs/
- **Historical context:** Use Docs/DEVLOG.md for development history

---

## Quick Reference

| What | Path |
|------|------|
| **Leader Bootstrap** | `KURORYUU_LEADER.md` |
| **Worker Bootstrap** | `KURORYUU_WORKER.md` |
| **Architecture Docs** | `Docs/Plans/LEADER_FOLLOWER_ARCHITECTURE.md` |
| LAWs index | `KURORYUU_LAWS_INDEX.md` |
| LAWs (canonical) | `KURORYUU_LAWS.md` |

### Harness Files

| What | Path |
|------|------|
| Task backlog | `ai/todo.md` |
| Development history | `Docs/DEVLOG.md` |
| Hooks config | `ai/hooks.json` |

### PRD-First Workflow

| What | Path |
|------|------|
| **PRD (North Star)** | `ai/prds/*.md` |
| Implementation plans | `ai/plans/*.md` |
| Execution reports | `ai/reports/*.md` |
| Code/System reviews | `ai/reviews/*.md` |

### Prompt Files

| Role | Prompts |
|------|---------|
| **Leader** | `leader_prime.md`, `leader_plan_feature.md`, `leader_breakdown.md`, `leader_nudge.md`, `leader_finalize.md` |
| **Worker** | `worker_loop.md`, `worker_iterate.md` |
| **One-time** | `create-prd.md` (PRD creation), `plan-feature.md` (planning template) |
| **Reviews** | `system-review.md`, `code-review.md`, `execution-report.md` |

All prompts located in: `ai/prompts/`

---

## 8. LEADER-FOLLOWER SYSTEM

After reading this bootstrap, determine your role:

### If you are the FIRST agent (or leader slot is empty):
1. Read `KURORYUU_LEADER.md`
2. Register as leader: `POST /v1/agents/register { "role": "leader" }`
3. You coordinate, breakdown tasks, monitor workers, ask humans

### If a leader already exists:
1. Read `KURORYUU_WORKER.md`
2. Register as worker: `POST /v1/agents/register { "role": "worker" }`
3. You poll for work, claim subtasks, execute, report

### Check leader status:
```
GET /v1/agents/leader
```
If `null` or `not found` → you can become leader.

---

## MCP Routed Tools

All MCP tools use a routed pattern with `action` parameter:

| Tool | Actions | Purpose |
|------|---------|---------|
| `k_session` | help, start, end, context, pre_tool, post_tool, log | Session/hook lifecycle |
| `k_files` | help, read, write, list | File operations |
| `k_memory` | help, get, set_goal, add_blocker, clear_blockers, set_steps, reset | Working memory |
| `k_inbox` | help, send, list, read, claim, complete | Message queue |
| `k_msg` | help, send, check, read, reply, complete, broadcast, list_agents | Simplified inter-agent messaging |
| `k_checkpoint` | help, save, list, load | Persistence |
| `k_rag` | help, query, status, index | Search |
| `k_pty` | help, list, create, write, read, talk, resize, kill | PTY control |
| `k_capture` | help, start, stop, screenshot, poll | Visual capture |

### Tool Usage Pattern

```json
// Old (individual tools)
read_file(path="README.md")
write_file(path="hello.txt", content="Hello")
kuroryuu_session_start(process_id=123, cli_type="claude", agent_id="leader")

// New (routed tools with action parameter)
k_files(action="read", path="README.md")
k_files(action="write", path="hello.txt", content="Hello")
k_session(action="start", process_id=123, cli_type="claude", agent_id="leader")
```

---

## Lifecycle Events

| Event | Trigger |
|-------|---------|
| `Kuroryuu.SessionStart` | Agent session begins |
| `Kuroryuu.SessionEnd` | Agent session ends |
| `Kuroryuu.UserPromptSubmit` | User sends prompt |
| `Kuroryuu.PreToolUse` | Before tool execution |
| `Kuroryuu.PostToolUse` | After tool execution |
| `Kuroryuu.ProgressAppend` | Progress entry added |

---
