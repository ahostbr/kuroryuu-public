# KURORYUU LAWS (Canonical)

> **Version**: 0.3.0
> **Last Updated**: 2026-01-27

This file is the **canonical authority** for all Kuroryuu governance.
For quick start, see: `KURORYUU_BOOTSTRAP.md`

**Hackathon Stats:** 23 days | 437 sessions | 431 tasks | 17 MCP tools → 126 actions

---

## 1. STACK MANAGEMENT

### 1.1 Script Requirement (HARD RULE)

| Action | Script |
|--------|--------|
| Start all servers | `.\run_all.ps1` |
| Stop all servers | `.\kill_all.ps1` |

**NEVER** manually start uvicorn/python processes. The scripts ensure proper startup order, port management, and clean shutdown.

---

## 2. SESSION LIFECYCLE

### 2.1 Session Start

On FIRST prompt of every session:

```
k_session(action="start", process_id=<PID>, cli_type="claude|kiro|copilot", agent_id="<your_id>")
k_rag(action="status")
k_repo_intel(action="status")
```

Confirm: `KURORYUU-aware. Session: {id}. Indexes: fresh|stale. Ready.`

### 2.2 Hook Calls (EVERY Tool Use)

Before ANY tool:
```
k_session(action="pre_tool", session_id="...", tool_name="...", arguments="...")
```

After ANY tool:
```
k_session(action="post_tool", session_id="...", tool_name="...", result_ok=true|false, result_summary="...")
```

### 2.3 Progress Logging

After modifying files or completing tasks:
```
k_session(action="log", session_id="...", message="<what changed, why, verification>")
```

### 2.4 Session End

Before ending:
```
k_session(action="end", session_id="...", exit_code=0, summary="...")
```

---

## 3. EVIDENCE REQUIREMENTS

### 3.1 No Silent Claims (HARD RULE)

Never say "fixed / works / verified" without evidence:
- Tool output proving success
- File read confirming change
- Test/build output

If unsure → mark **UNVERIFIED**

### 3.2 PTY Evidence Pack

Any PTY action MUST produce inbox artifact with:
1. Command transcript
2. Screenshot (if UI)
3. Diff/patch (if files changed)
4. Summary with next steps

---

## 4. PTY GOVERNANCE

### 4.1 Access Control

All agents (leaders and workers) can use `k_pty` for direct PTY communication.
`k_inbox` remains available as a backup coordination method when k_pty is unavailable.

Workers can:
- Use `send_line_to_agent` to message other agents
- Use `talk` to execute commands
- Use `term_read` to read terminal buffers

The leader role is still tracked for UI purposes but does not restrict k_pty access.

### 4.2 Coordination Guidelines

| Situation | Recommended Approach |
|-----------|---------------------|
| Quick command execution | `k_pty(action="talk")` |
| Cross-agent messaging | `k_pty(action="send_line_to_agent")` |
| k_pty unavailable | Use `k_msg` or `k_inbox` as backup |
| Complex coordination | Leader can use escalation ladder below |

### 4.3 Escalation Ladder (Optional)

Leaders may use this ladder for coordination:

| Level | When | Action |
|-------|------|--------|
| 0 WAIT | Worker active | Let them work |
| 1 OBSERVE | No activity 5+ min | `k_pty(action="read")` |
| 2 VERIFY | Claims wrong | Run verification commands |
| 3 INTERVENE | Confirmed stuck | Send hint via inbox/PTY |
| 4 EMERGENCY | Critical blocked | Direct fix + commit |

Start at Level 0. Escalate only when previous level fails.

### 4.4 Sentinel Pattern

All PTY commands use:
```
command; echo __KR_DONE_<unique_id>__\r\n
```

### 4.5 Line Endings

Windows PowerShell: Always use `\r\n` (CRLF).

---

## 5. TODO MANAGEMENT

### 5.1 Source of Truth

`ai/todo.md` is the canonical task list.

### 5.2 Session IDs vs Todo IDs (HARD RULE)

**Session-local task IDs (#1, #2) ≠ ai/todo.md T### IDs (T080, T081).**

| ID Type | Example | Source | Use For |
|---------|---------|--------|---------|
| Session-local | #1, #2 | `TaskCreate` return value | `TaskUpdate` within same session |
| Todo T### | T080, T081 | PostToolUse hook writes to `ai/todo.md` | Checkpoints, worklogs, cross-references |

- **NEVER** put session-local IDs in checkpoint `task_ids` or worklog headers
- **ALWAYS** read `ai/todo.md` to find the real T### IDs before saving checkpoints
- `k_checkpoint(task_id="T080")` — correct. `k_checkpoint(task_id="1")` — WRONG.

### 5.3 Your Responsibilities

1. Mark done: `- [ ]` → `- [x]`
2. Add tasks: `- [ ] T00X — description`
3. Update Active Focus
4. Add blockers
5. Log changes

### 5.3 Working Memory Tools

| Action | Purpose |
|--------|---------|
| `k_memory(action="get")` | See goal, blockers, recent actions |
| `k_memory(action="set_goal", goal="...")` | Set current objective |
| `k_memory(action="add_blocker", blocker="...")` | Report blocker |
| `k_memory(action="set_steps", steps=[...])` | Queue next actions |

---

## 6. LEADER-FOLLOWER SYSTEM

### 6.1 Role Determination

**First agent (or leader slot empty):**
1. Read `KURORYUU_LEADER.md`
2. Register: `POST /v1/agents/register { "role": "leader" }`

**Leader exists:**
1. Read `KURORYUU_WORKER.md`
2. Register: `POST /v1/agents/register { "role": "worker" }`

### 6.2 Check Leader Status

```
GET /v1/agents/leader
```
Returns `null` → you can become leader.

### 6.3 Task Notification

Workers receive instant notifications via Direct Context Injection - no polling.

---

## 7. MCP TOOLS REFERENCE (17 Tools → 126 Actions)

All tools use routed pattern: `tool(action="...", ...)` to prevent tool bloat.

| Tool | Actions | Count | Purpose |
|------|---------|-------|---------|
| `k_rag` | query, status, index, hybrid, semantic, agentic, reflective... | 12 | Multi-strategy code search |
| `k_pty` | list, create, send_line, talk, term_read, resolve, spawn_cli... | 12 | PTY control (all agents) |
| `k_inbox` | send, list, read, claim, complete, stats, archive, delete | 8 | Maildir messaging |
| `k_msg` | send, check, read, reply, complete, broadcast, list_agents, help | 8 | Simplified inter-agent messaging |
| `k_capture` | start, stop, screenshot, poll, get_latest, list, delete, configure | 8 | Screen capture |
| `k_pccontrol` | click, doubleclick, rightclick, type, keypress, launch_app, get_windows, status | 8 | PowerShell/Win32 desktop automation (OPT-IN) |
| `k_session` | start, end, pre_tool, post_tool, log, context, list | 7 | Session lifecycle |
| `k_memory` | get, set_goal, add_blocker, set_steps, reset, history, clear | 7 | Working memory |
| `k_graphiti_migrate` | status, migrate, rollback, verify, list, configure | 6 | Knowledge graph migration |
| `k_collective` | record_success, record_failure, query_patterns, get_skill_matrix, update_skill, reset | 6 | Collective intelligence |
| `k_repo_intel` | status, run, get, list, refresh | 5 | Structured analysis |
| `k_files` | read, write, list, delete, move | 5 | File operations |
| `k_checkpoint` | save, list, load, delete | 4 | Session persistence |
| `k_thinker_channel` | send_line, read, list | 3 | Thinker debate channel |
| `k_MCPTOOLSEARCH` | search, list | 2 | Tool discovery |
| `k_help` | - | - | Help system |

**OPT-IN Tools:**
- `k_pccontrol` — Enable Full Desktop Access in Desktop Settings (flag file: `ai/config/pccontrol-armed.flag`)
  - **DPI NOTE:** For accurate click coordinates, use 100% display scaling

---

## 8. RAG & REPO INTEL

### 8.0 Search Priority Order (HARD RULE)

When searching or exploring the codebase, use tools in this priority order:

```
1. k_rag          →  Keyword search (fastest, indexed)
2. k_repo_intel   →  Structured reports (symbols, routes, deps)
3. git            →  History, blame, diffs
4. Fallback       →  Glob, Grep, Read, Task agents
```

**Rationale:**
- k_rag: Pre-indexed BM25 search, sub-second results
- k_repo_intel: Pre-computed reports, no re-scanning needed
- git: Always available, good for history/blame
- Fallback: Use only when above tools insufficient

**Decision Flow:**

| Question | Tool |
|----------|------|
| "Where is X defined?" | k_rag first, then k_repo_intel symbol_map |
| "What API routes exist?" | k_repo_intel routes |
| "What depends on X?" | k_repo_intel module_graph |
| "When was X changed?" | git log/blame |
| "Find files matching pattern" | Glob (only if k_rag insufficient) |

### 8.1 Index Freshness (HARD RULE)

Before ANY search query, check freshness:

```
k_rag(action="status")
k_repo_intel(action="status")
```

**Stale Index = Wrong Answers.**

| Situation | Action |
|-----------|--------|
| Session start | Check, refresh if > 1 hour |
| After writing code | Refresh before next search |
| Major refactor | Full refresh with `force=true` |

### 8.2 k_rag (Keyword Search)

```
k_rag(action="query", query="WorktreeManager", top_k=10)
k_rag(action="query", query="def create", exts=[".py"])
k_rag(action="index", force=true)  // Rebuild
```

Use for: definitions, patterns, imports, quick lookups.

### 8.3 k_repo_intel (Structured Reports)

```
k_repo_intel(action="get", report="routes")
k_repo_intel(action="get", report="symbol_map", query="Worktree")
k_repo_intel(action="run", full=true)  // Rebuild
```

**Reports:** symbol_map, public_api, module_graph, routes, components, hooks, todos, dependencies

Use for: architecture, endpoints, hooks, deps, TODOs.

### 8.4 Decision Matrix

| Need | Tool |
|------|------|
| Find definition | `k_rag(query="def X")` |
| List API routes | `k_repo_intel(report="routes")` |
| Find React hooks | `k_repo_intel(report="hooks")` |
| Search pattern | `k_rag(query="pattern")` |
| Module deps | `k_repo_intel(report="module_graph")` |
| Find TODOs | `k_repo_intel(report="todos")` |

---

## 9. FILE LOCATIONS

### 9.1 Harness State

| File | Purpose |
|------|---------|
| `ai/todo.md` | Task backlog (SOURCE OF TRUTH) |
| `ai/hooks.json` | Hook configuration |
| `ai/sessions.json` | Session registry |
| `ai/checkpoints/` | State recovery |

**Historical context:** Use `Docs/DEVLOG.md` for development history.

### 9.2 Reports & Analysis

| Type | Location |
|------|----------|
| Agent analysis | `.agents/docs/agent-analysis/` |
| System health | `.agents/docs/system-health/` |
| Architecture | `.agents/docs/architecture/` |
| Repo intel | `Reports/RepoIntel/*.json` |

### 9.3 PRD-First Workflow

| Type | Location |
|------|----------|
| PRD (north star) | `ai/prds/*.md` |
| Plans | `ai/plans/*.md` |
| Reports | `ai/reports/*.md` |
| Reviews | `ai/reviews/*.md` |

### 9.4 Prompts

| Role | Files |
|------|-------|
| Leader | `leader_prime.md`, `leader_nudge.md`, `leader_escalate.md` |
| Worker | `worker_loop.md`, `worker_iterate.md` |

Location: `ai/prompts/`

### 9.5 Deprecated Harness Files

**NEVER use these files. They have been removed from the canonical specification.**

| File | Deprecated | Replacement | Reason |
|------|------------|-------------|--------|
| `ai/progress.md` | 2026-01-23 | `Docs/DEVLOG.md` | Harness drift; duplicate state between progress.md and todo.md led to inconsistency and stale data |
| `ai/feature_list.json` | 2026-01-23 | `ai/todo.md` | Redundant with todo.md; tasks ARE features; added unnecessary complexity |

**Why removed:**
- **Harness drift:** Multiple overlapping state files caused inconsistency
- **Unclear ownership:** Agents didn't know which file to trust as source of truth
- **Maintenance burden:** Updates required in multiple places
- **Stale data:** Files fell out of sync, leading to wrong decisions

**Enforcement:**
- Do NOT read these files
- Do NOT write to these files
- Update any prompts/docs that reference them

**Full specification:** `Docs/Architecture/HARNESS_FILES_SPECIFICATION.md`

---

## 10. LIFECYCLE EVENTS

| Event | Trigger |
|-------|---------|
| `Kuroryuu.SessionStart` | Agent session begins |
| `Kuroryuu.SessionEnd` | Agent session ends |
| `Kuroryuu.UserPromptSubmit` | User sends prompt |
| `Kuroryuu.PreToolUse` | Before tool execution |
| `Kuroryuu.PostToolUse` | After tool execution |
| `Kuroryuu.ProgressAppend` | Progress entry added |
| `Kuroryuu.TaskNotification` | Task assigned (auto-injected) |

---

## 11. SPECIALIST AGENTS & COLLECTIVE INTELLIGENCE

### 11.1 Specialist Agents

Specialists auto-trigger based on task keywords. Located in: `ai/prompt_packs/specialists/`

| Specialist | Triggers | Capability |
|------------|----------|------------|
| Security Auditor | security, auth, vulnerability, CVE, injection, XSS | Read-only analysis |
| Performance Optimizer | performance, slow, optimize, memory, profile | Read-only analysis |
| Documentation Writer | documentation, docs, README, changelog | Write to `*.md` only |
| Test Generator | test, testing, coverage, TDD | Write to test files only |

Configuration: `ai/prompt_packs/specialists/index.json`

### 11.2 Collective Intelligence

The `k_collective` tool enables agents to learn from past experiences.

**Recording outcomes:**
```
k_collective(action="record_success", task_type="refactoring", approach="extract-method", evidence="reduced complexity 30%")
k_collective(action="record_failure", task_type="refactoring", approach="inline-all", reason="increased coupling")
```

**Querying patterns:**
```
k_collective(action="query_patterns", query="refactoring large files")
```

**Storage:**
| File | Purpose |
|------|---------|
| `ai/collective/patterns.jsonl` | Success/failure patterns |
| `ai/collective/skill_matrix.json` | Agent skill scores |

#### Recording Workflow (WHO records WHEN)

| Role | When | What |
|------|------|------|
| **Leader** | At finalization (after all subtasks DONE) | Aggregate patterns: successes, failures, skill updates |
| **Worker** | Inline, when discovering novel solution | Non-obvious approaches, workarounds, gotchas |
| **Thinker** | After debate convergence | Winning arguments, synthesis patterns |

**Leader recording is REQUIRED** at finalization. See `leader_finalize.md` Step 6.

### 11.3 Context Enrichment

When breaking down tasks, the orchestrator automatically:
1. Queries collective for relevant patterns
2. Injects past learnings into subtask context
3. **Leader records outcomes after completion** (see 11.2)

---

## 12. CONFLICT RESOLUTION

If anything contradicts this file, **LAWS wins**.

Load specific sections via:
1. Read `KURORYUU_LAWS_INDEX.md` (line numbers)
2. Use `k_files(action="read", path="...", start_line=X, end_line=Y)`
