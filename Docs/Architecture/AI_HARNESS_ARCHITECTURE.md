# AI Harness & Governance Architecture

**Document Version:** 1.0
**Last Updated:** 2026-02-17
**Authority:** KURORYUU_LAWS.md (canonical, wins all conflicts)
**Scope:** ai/ directory + root governance files

---

## Table of Contents

1. [Overview](#1-overview)
2. [Governance Hierarchy](#2-governance-hierarchy)
3. [Harness State Files](#3-harness-state-files)
4. [MCP Tools Reference](#4-mcp-tools-reference)
5. [Leader-Worker System](#5-leader-worker-system)
6. [Prompt System](#6-prompt-system)
7. [Collective Intelligence](#7-collective-intelligence)
8. [Identity System (Ash)](#8-identity-system-ash)
9. [Task Management](#9-task-management)
10. [Context Management](#10-context-management)
11. [Communication Channels](#11-communication-channels)
12. [PRD-First Workflow](#12-prd-first-workflow)
13. [Hook System](#13-hook-system)
14. [RAG and Repo Intel](#14-rag-and-repo-intel)
15. [Configuration Files](#15-configuration-files)
16. [Documentation Structure](#16-documentation-structure)

---

## 1. Overview

The AI Harness is the operational layer that governs how agents are initialized, how they coordinate, how work is tracked, and how the system recovers state across sessions. It spans approximately 56,035 lines of code in the `ai/` directory plus 3,213 lines across root governance files.

The harness is not a framework — it is a ruleset enforced through prompts, hooks, and MCP tools. Agents are expected to follow the laws explicitly. The system was developed over 23 days of active hackathon-style development, resulting in 437 sessions, 431 tasks, and 17 MCP tools serving 126 actions.

### Core Design Principles

- **Laws over prompts:** KURORYUU_LAWS.md wins all conflicts.
- **Source of truth:** ai/todo.md is the single authoritative task list.
- **Evidence required:** No silent claims. Every fix must show proof.
- **PRD is north star:** Created once, never regenerated, consulted at every planning step.
- **Collective memory:** Agents learn from prior successes and failures via k_collective.

---

## 2. Governance Hierarchy

```
KURORYUU_LAWS.md         (CANONICAL — wins all conflicts)
    |
    +-- KURORYUU_BOOTSTRAP.md    (quick start, session init, search priority)
    |
    +-- KURORYUU_LEADER.md       (leader 6-phase workflow, ~1,240 LOC)
    |
    +-- KURORYUU_WORKER.md       (worker 4-phase loop + promise protocol, ~717 LOC)
    |
    +-- AGENTS.md                (agent type definitions, ~400 LOC)
    |
    +-- CLAUDE.md                (Claude Code session memory, project rules)
```

### Law Sections

| Section | Title | Key Rule |
|---------|-------|----------|
| 1 | Stack Management | Use run_all.ps1 / kill_all.ps1 only. NEVER manually start uvicorn. |
| 2 | Session Lifecycle | k_session start/end/pre_tool/post_tool on every session and tool call |
| 3 | Evidence Requirements | No silent claims. Every fix requires tool output, file read, or test result. |
| 4 | PTY Governance | All agents can use k_pty. Workers cannot write to leader terminal. |
| 5 | Todo Management | ai/todo.md is the SOURCE OF TRUTH. Use TaskCreate, never manual edits. |
| 6 | Leader-Follower | First agent checks GET /v1/agents/leader. Null = become leader. |
| 7 | MCP Tools | 17 tools, 126 actions. All use routed action pattern. |
| 8 | RAG & Repo Intel | Search order: k_rag -> k_repo_intel -> git -> fallback. |
| 9 | File Locations | Canonical paths for harness state, reports, prompts. |
| 10 | Lifecycle Events | 7 named events from SessionStart to TaskNotification. |
| 11 | Specialists & Collective | Specialists auto-trigger on keywords. k_collective records patterns. |
| 12 | Conflict Resolution | LAWS wins. Load sections via KURORYUU_LAWS_INDEX.md. |

---

## 3. Harness State Files

### Canonical Files (Active)

| File | Purpose | Notes |
|------|---------|-------|
| `ai/todo.md` | Task source of truth | Sections: Backlog, Active, Delayed, Done |
| `ai/hooks.json` | Hook configuration | 4 todo_sot_enforcer hooks |
| `ai/sessions.json` | Session registry | Written by k_session |
| `ai/checkpoints/` | State snapshots | Format: cp_YYYYMMDD_HHMMSS_xxx |
| `ai/working_memory.json` | Working memory state | Written/read by k_memory |
| `ai/task-meta.json` | Task metadata sidecar | description, priority, category, complexity, worklog, checkpoint, createdAt, contextFiles |
| `ai/collective/patterns.jsonl` | Collective intelligence patterns | Append-only JSONL |
| `ai/collective/skill_matrix.json` | Agent skill scores | agent_id -> {skill_type: float 0.0-1.0} |
| `ai/config/domain-config.json` | Domain settings | Per-domain configuration |
| `ai/config/pccontrol-armed.flag` | k_pccontrol opt-in | Create this file to enable desktop automation |

### Documentation Files

| File | Purpose |
|------|---------|
| `Docs/DEVLOG.md` | Development history (replaces deprecated ai/progress.md) |
| `Docs/worklogs/` | Session worklogs (KuroRyuuWorkLog_YYYYMMDD_HHMMSS_Description.md) |
| `Docs/Plans/` | Active implementation plans (130+) |
| `Docs/Plans/Archive/` | Completed/archived plans |

### Deprecated Files (DO NOT USE)

| File | Deprecated | Replacement |
|------|------------|-------------|
| `ai/progress.md` | 2026-01-23 | `Docs/DEVLOG.md` |
| `ai/feature_list.json` | 2026-01-23 | `ai/todo.md` |

These files were removed because multiple overlapping state files caused harness drift — agents could not determine which file to trust, leading to inconsistent decisions and stale data.

---

## 4. MCP Tools Reference

All tools use the routed action pattern to prevent tool bloat:

```
tool(action="verb", param1=value1, ...)
```

Gateway endpoint: `http://127.0.0.1:8200/v1/mcp/call`

### Tool Catalog (17 Tools, 126 Actions)

| Tool | Action Count | Primary Purpose |
|------|-------------|-----------------|
| `k_rag` | 12 | Multi-strategy codebase search (BM25, semantic, hybrid, agentic, reflective) |
| `k_pty` | 12 | PTY terminal control — list, create, send_line, talk, term_read, resolve, spawn_cli |
| `k_inbox` | 8 | Maildir messaging — send, list, read, claim, complete, stats, archive, delete |
| `k_msg` | 8 | Simplified inter-agent messaging — send, check, read, reply, complete, broadcast, list_agents, help |
| `k_capture` | 8 | Screen capture — start, stop, screenshot, poll, get_latest, list, delete, configure |
| `k_pccontrol` | 8 | Desktop automation (OPT-IN) — click, type, keypress, launch_app, get_windows, status |
| `k_session` | 7 | Session lifecycle — start, end, pre_tool, post_tool, log, context, list |
| `k_memory` | 7 | Working memory — get, set_goal, add_blocker, set_steps, reset, history, clear |
| `k_graphiti_migrate` | 6 | Knowledge graph migration — status, migrate, rollback, verify, list, configure |
| `k_collective` | 6 | Collective intelligence — record_success, record_failure, query_patterns, get_skill_matrix, update_skill, reset |
| `k_repo_intel` | 5 | Structured analysis reports — status, run, get, list, refresh |
| `k_files` | 5 | File operations — read, write, list, delete, move |
| `k_checkpoint` | 4 | Session persistence — save, list, load, delete |
| `k_thinker_channel` | 3 | Thinker debate channel — send_line, read, list |
| `k_MCPTOOLSEARCH` | 2 | Tool discovery — search, list |
| `k_tts` | 2 | Text-to-speech — speak (fire-and-forget), smart (AI-summarized, then spoken) |
| `k_help` | 1 | Help system |

### OPT-IN Tools

`k_pccontrol` requires explicit opt-in:
- Enable "Full Desktop Access" in Desktop Settings, OR
- Create the flag file: `ai/config/pccontrol-armed.flag`
- DPI note: Use 100% display scaling for accurate click coordinates

---

## 5. Leader-Worker System

### Role Determination

```
Agent starts
    |
    v
GET /v1/agents/leader
    |
    +-- null returned --> Register as LEADER
    |                     Read KURORYUU_LEADER.md
    |
    +-- leader exists --> Register as WORKER
                          Read KURORYUU_WORKER.md
```

### Leader: 6-Phase Workflow

```
Phase 1: PRIME
  - Load checkpoint (k_checkpoint load latest)
  - Register: POST /v1/agents/register { "role": "leader" }
  - Read active PRD from ai/prds/
  - Read ai/todo.md (source of truth)
  - Check worker count and status
  - Start visual monitoring (k_capture start, fps=1.0, digest=True)

Phase 2: PLAN FEATURE
  - Verify PRD alignment (mission, MVP scope, tech stack, user stories)
  - Search codebase (k_rag -> k_repo_intel -> git -> fallback)
  - Create plan file in Docs/Plans/
  - NO CODE WRITTEN in this phase — plan only

Phase 3: BREAKDOWN
  - Parse plan: phases, tasks, dependencies, validation commands
  - Build dependency graph (tasks within phase = parallel, across phases = sequential)
  - Query k_collective for relevant historical patterns
  - Write patterns to ai/collective/patterns_{worker_id}.md
  - Assign iteration budget per task complexity (see table below)
  - Inject context into each subtask

Phase 4: MONITOR
  - Read worker terminals via vision (k_capture) or buffer (k_pty term_read, max_lines=5-10)
  - Check context % in status bar
  - 20% threshold: begin intervention sequence
  - 5% threshold: auto-compact fires (too late for meaningful save)

Phase 5: NUDGE
  - Detect stuck worker (STUCK promise or 5+ min silence with task claimed)
  - Capture BEFORE state (screenshot, PTY output, git status)
  - Classify: code_issue / ui_issue / external
  - Send nudge via PTY (PRIMARY) or k_msg/k_inbox (FALLBACK)
  - Capture AFTER state
  - Generate evidence pack

Phase 6: FINALIZE
  - Verify all subtasks show status=DONE and last_promise=DONE
  - Run final validation (lint, type check, tests, integration)
  - Generate execution report
  - Trigger code review and system review
  - Record outcomes to k_collective (REQUIRED — see Section 11)
  - Update Docs/DEVLOG.md
  - Mark task [x] in ai/todo.md
```

**Leader exclusive powers:** k_interact for GUI selection, finalization authority, thinker spawning.

### Iteration Budget by Complexity

| Complexity | Max Iterations | Description |
|------------|----------------|-------------|
| Simple (1-2) | 2 | Single file change, clear pattern |
| Medium (3-5) | 4-5 | Multiple files, some decision-making |
| Complex (5-7) | 6-8 | Architecture decisions, integration work |
| Very Complex (7-10) | 8-15 | Cross-cutting, significant research |
| Extreme (10+) | 15-30 | Full system redesign |

The leader uses judgment to auto-size and auto-split tasks. Tasks that span multiple distinct concerns (schema + backend + frontend + tests) should be split into independent subtasks, each scoped to fit within one context window.

### Worker: 4-Phase Loop

```
                    WORKER LIFECYCLE

  +----------+    +----------+    +-----------+
  | RECEIVE  | -> |  CLAIM   | -> |  EXECUTE  |
  | PTY(1st) |    | k_inbox  |    | iterate.md|
  | inbox(2) |    | claim    |    |           |
  +----------+    +----------+    +-----+-----+
       ^                                |
       |          +----------+          |
       +----------+  REPORT  | <--------+
                  | k_msg or |
                  | k_inbox  |
                  +----+-----+
                       |
             +---------+---------+
             |                   |
          [DONE]           [PROGRESS/BLOCKED/STUCK]
          loop             check budget -> loop or escalate
```

**Phase 1 RECEIVE:** Task arrives via k_pty send_line (PRIMARY) or k_inbox/k_msg (FALLBACK).

**Phase 2 CLAIM:**
```http
POST /v1/orchestration/subtasks/{subtask_id}/claim
Content-Type: application/json
{ "agent_id": "{{agent_id}}" }
```
409 Conflict = another worker claimed it, poll again.

**Phase 3 EXECUTE:** Load worker_iterate.md with full subtask context. Use MCP tools to implement and verify. Workers read historical patterns from `ai/collective/patterns_{worker_id}.md` before starting.

**Phase 4 REPORT:** Update ai/todo.md (SOURCE OF TRUTH). Send one promise per response via k_msg or k_inbox.

### Promise Protocol

Every worker response MUST contain exactly one promise tag:

| Tag | Meaning |
|-----|---------|
| `<promise>DONE</promise>` | Task complete, verified |
| `<promise>PROGRESS:60%</promise>` | Partial progress with percentage |
| `<promise>BLOCKED:reason</promise>` | Need external input to continue |
| `<promise>STUCK:reason</promise>` | Cannot proceed after 3+ attempts |

Workers CANNOT write to the leader's terminal. All worker-to-leader communication goes through k_msg or k_inbox.

### Escalation Ladder (Leader)

| Level | Trigger | Action |
|-------|---------|--------|
| 0 WAIT | Worker active | Let them work |
| 1 OBSERVE | No activity 5+ min | k_pty read terminal buffer |
| 2 VERIFY | Claims appear wrong | Run verification commands independently |
| 3 INTERVENE | Confirmed stuck | Send hint via inbox or PTY with file:line references |
| 4 EMERGENCY | Critical blocker | Direct code fix + commit |

Start at Level 0. Escalate only when previous level insufficient.

### PTY Sentinel Pattern

All PTY commands append a sentinel for reliable completion detection:

```
command; echo __KR_DONE_<unique_id>__\r\n
```

Windows PowerShell requires CRLF (`\r\n`).

---

## 6. Prompt System

### Directory Structure

```
ai/prompts/
    leader/             (12 files)
    worker/             (4 files)
    workflows/          (12 files)
    ralph/              (3 files)
    models/             (3 files)
    PTY_Training/       (8 files)

ai/prompt_packs/
    thinkers/           (13 files)
    specialists/        (4 files)
    workflow_specialists/ (12 files)
    pen_testers/        (13 files)
    quizmasterplanner/  (4 files)
    brainstormer/       (1 file)
```

### Leader Prompts (ai/prompts/leader/)

| File | Phase | Purpose |
|------|-------|---------|
| `leader_prime.md` | 1 | Initialize session, load checkpoint, load PRD, start monitoring |
| `leader_prime_buffer.md` | 1 | Variant using buffer monitoring instead of visual |
| `leader_plan_feature.md` | 2 | PRD alignment check, codebase search, create plan file |
| `leader_breakdown.md` | 3 | Parse plan, build dependency graph, assign iteration budgets |
| `leader_monitor.md` | 4 | Visual monitoring via k_capture screenshot, context % tracking |
| `leader_monitor_buffer.md` | 4 | Buffer-based monitoring variant via k_pty term_read |
| `leader_nudge.md` | 5 | Detect stuck workers, send hints with evidence packs |
| `leader_finalize.md` | 6 | Verify completion, run validation, record to k_collective |
| `leader_escalate.md` | 5 | Escalation ladder execution |
| `leader_escalate_v2.md` | 5 | Updated escalation variant |
| `leader_pty_module.md` | any | PTY coordination module (reusable) |
| `leader_thinker_orchestration.md` | any | Spawn and synthesize thinker debates |

### Worker Prompts (ai/prompts/worker/)

| File | Purpose |
|------|---------|
| `worker_loop.md` | Core lifecycle: register, poll, claim, execute, report |
| `worker_loop_v2.md` | Updated variant with additional coordination patterns |
| `worker_iterate.md` | Single iteration execution: read context, implement, verify |
| `worker_iterate_v2.md` | Updated variant with extended verification steps |

### Workflow Prompts (ai/prompts/workflows/)

| File | Status | Purpose |
|------|--------|---------|
| `create-prd.md` | Active | Create PRD from user requirements |
| `plan-feature.md` | Active | Plan a feature against the PRD |
| `code-review.md` | Active | Code review workflow |
| `system-review.md` | Active | System-level architecture review |
| `execution-report.md` | Active | Post-execution report generation |
| `hackathon-complete.md` | Active | Hackathon finalization workflow |
| `do-work-task-prompt.md` | Active | Direct task execution |
| `prime.md` | Deprecated | Replaced by leader_prime.md |
| `plan.md` | Deprecated | Replaced by leader_plan_feature.md |
| `execute.md` | Deprecated | Replaced by worker_iterate.md |
| `review.md` | Deprecated | Replaced by code-review.md |
| `validate.md` | Deprecated | Replaced by prd_validator |

### Thinker Prompt Packs (ai/prompt_packs/thinkers/)

Thinkers are spawned by the leader for decisions with significant trade-offs. Each thinker has a distinct perspective and communicates via k_thinker_channel.

| File | Role |
|------|------|
| `_base_thinker.md` | Template — base identity all thinkers extend |
| `_tool_profile.md` | Tool access profile for thinkers |
| `visionary.md` | Long-term vision, ambitious scale, "what could be" |
| `skeptic.md` | Challenge assumptions, find gaps, demand evidence |
| `pragmatist.md` | Simplicity, maintainability, "what works now" |
| `devils_advocate.md` | Argue the opposing position unconditionally |
| `first_principles.md` | Decompose to fundamentals, rebuild from ground up |
| `systems_thinker.md` | Holistic view, emergent behavior, second-order effects |
| `user_advocate.md` | End-user perspective, usability, friction points |
| `synthesizer.md` | Find convergence, distill debate into decision |
| `red_team.md` | Adversarial attack perspective |
| `blue_team.md` | Defense and hardening perspective |

### Recommended Thinker Pairings

| Decision Type | Pair | Rationale |
|---------------|------|-----------|
| Feature ideation | visionary + skeptic | Balance innovation with critique |
| Security review | red_team + blue_team | Adversarial coverage |
| Architecture | first_principles + systems_thinker | Deep decomposition + holistic view |
| UX decisions | user_advocate + pragmatist | User needs vs. implementation cost |
| Risky trade-offs | devils_advocate + synthesizer | Force opposing view then converge |

Thinker debates are reserved for decisions with significant trade-offs. Do not spawn thinkers for simple implementation tasks, clear-cut decisions, or time-critical hotfixes.

### Specialist Prompt Packs (ai/prompt_packs/specialists/)

Specialists auto-trigger based on task keyword matching. They operate read-only except in their defined domain.

| Specialist | Trigger Keywords | Write Access |
|------------|-----------------|--------------|
| `security_auditor.md` | security, auth, vulnerability, CVE, injection, XSS | Read-only analysis |
| `performance_optimizer.md` | performance, slow, optimize, memory, profile | Read-only analysis |
| `test_generator.md` | test, testing, coverage, TDD | Write to test files only |
| `doc_writer.md` | documentation, docs, README, changelog | Write to *.md only |

Configuration: `ai/prompt_packs/specialists/index.json`

### PRD Workflow Specialists (ai/prompt_packs/workflow_specialists/)

These specialists handle distinct phases of the PRD-first execution pipeline:

| File | Role |
|------|------|
| `prd_primer.md` | Loads and validates PRD, establishes context |
| `prd_generator.md` | Generates PRD from user requirements |
| `prd_executor.md` | Executes one step from an active implementation plan |
| `prd_reviewer.md` | Reviews implementation against PRD requirements |
| `prd_system_reviewer.md` | System-level review of architecture decisions |
| `prd_validator.md` | Validates implementation completeness |
| `prd_code_reviewer.md` | Code-level review (style, correctness, patterns) |
| `prd_reporter.md` | Generates execution report |
| `prd_hackathon_finalizer.md` | Finalization for hackathon-style sessions |
| `prd_validator_v2.md` | Updated validator variant |
| `prd_code_reviewer_v2.md` | Updated code reviewer variant |
| `prd_hackathon_finalizer_v2.md` | Updated finalizer variant |

### Claude Code Agents (.claude/agents/)

These are Claude Code subagent definitions used within the project:

| Agent | Purpose |
|-------|---------|
| `prd-primer.md` | PRD loading and context establishment |
| `prd-generator.md` | PRD generation from requirements |
| `prd-executor.md` | Single-step plan execution |
| `prd-reviewer.md` | PRD requirement review |
| `prd-system-reviewer.md` | System architecture review |
| `prd-validator.md` | Completeness validation |
| `prd-code-reviewer.md` | Code-level review |
| `prd-reporter.md` | Execution report generation |
| `prd-hackathon-finalizer.md` | Hackathon finalization |
| `kuroryuu-explorer.md` | Codebase exploration agent |
| `kuroryuu-explorer-opus.md` | High-capacity codebase explorer (Opus model) |
| `meta-agent.md` | Meta-level orchestration |
| `mp-validator.md` | Multi-plan validation |
| `mp-builder.md` | Multi-plan construction |
| `do-work-builder.md` | Direct work task builder |

---

## 7. Collective Intelligence

The collective intelligence system allows agents to learn from prior successes and failures, injecting that knowledge into future tasks.

### Storage Format

**ai/collective/patterns.jsonl** — Append-only, one JSON object per line:

```json
{
  "type": "success|failure",
  "task_type": "refactoring|adding FastAPI endpoint|...",
  "approach": "description of what was tried",
  "evidence": "what proved it worked (success) or null",
  "reason": "why it failed (failure) or null",
  "agent_id": "worker_shell_1234",
  "timestamp": "2026-01-14T02:00:44.850068+00:00"
}
```

**ai/collective/skill_matrix.json** — Agent skill scores:

```json
{
  "worker_shell_1234": {
    "typescript": 0.85,
    "python": 0.70,
    "refactoring": 0.90
  }
}
```

### Recording Responsibilities

| Role | When | What to Record |
|------|------|----------------|
| Worker | Inline, upon discovering novel solution | Non-obvious approaches, framework quirks, gotchas |
| Leader | At finalization (REQUIRED) | Aggregate successes, failures, skill score updates |
| Thinker | After debate convergence | Winning argument patterns, synthesis approaches |

Leader recording at finalization is not optional. See `leader_finalize.md` Step 6.

### Context Enrichment Workflow

Before creating subtasks, the leader queries collective patterns for the task domain:

```python
patterns = k_collective(action="query_patterns", query="<subtask domain keywords>")

if patterns["successes"] or patterns["failures"]:
    # Write matched patterns to file for worker
    write_file(f"ai/collective/patterns_{worker_id}.md", formatted_patterns)
    # Notify worker to read before starting
    k_msg(action="send", to=worker_id, subject="Read patterns before starting",
          body="Check ai/collective/patterns_{worker_id}.md")
```

Workers read this file at the start of Phase 3 EXECUTE. This prevents repeating known failures and builds on proven approaches.

### k_collective API

```python
# Record a successful approach
k_collective(action="record_success",
             task_type="react-component",
             approach="extract-hook-pattern",
             evidence="reduced component from 400 to 80 lines, tests pass")

# Record a failed approach
k_collective(action="record_failure",
             task_type="react-component",
             approach="class-component-migration",
             reason="increased coupling, broke 3 tests")

# Query for relevant patterns before starting
k_collective(action="query_patterns", query="typescript refactoring large files")

# Get skill matrix for worker assignment
k_collective(action="get_skill_matrix")

# Update agent skill score
k_collective(action="update_skill", agent_id="worker_abc", skill="typescript", score=0.9)
```

---

## 8. Identity System (Ash)

Ash is the persistent agent identity maintained across sessions. Not a persona — a genuine role definition that shapes how the agent approaches the codebase.

### Identity Files

| File | Purpose |
|------|---------|
| `ai/identity/soul.md` | Core identity: who Ash is, working rules, quality bar |
| `ai/identity/user.md` | Ryan's profile: background, preferences, context |
| `ai/identity/heartbeat.md` | Standing sweep instructions, wave status tracking |
| `ai/identity/memory.md` | Long-term milestones (major events only) |
| `ai/identity/memory/YYYY-MM-DD.md` | Daily context files with session-specific detail |
| `ai/identity/actions.json` | Action log (sweeps, heartbeats, proposals, outcomes) |
| `ai/identity/mutations.jsonl` | Identity mutation log (changes to soul/user/heartbeat) |
| `ai/identity/.bootstrap_complete` | Marker file — exists when bootstrap is done |

### Core Identity (from soul.md)

Ash operates as a **colleague and thinking partner**, not an executor of instructions. The working model is:

- **Architect, then surgeon.** Plans first with exact files and line numbers. Ryan reviews. Then execute.
- **Proactive.** Flags regressions, verifies fixes, tracks LOC reduction without being asked.
- **The gardener.** Dozens of agents built features in isolation. Ash sweeps the whole field afterward.
- **Direct and honest.** Casual tone, show reasoning, match Ryan's energy.

**Quality bar:** "Get the code to a point John Carmack would say 'wow I learned something.'"

### Heartbeat Pattern

Each heartbeat runs a standing set of checks:

1. Wave progress (check consolidation wave status table)
2. Regression check (git diff, broken imports, TypeScript errors, nul files)
3. Inbox check (k_msg check for pending messages)
4. LOC tracking (baseline ~250,000 LOC, track reduction)
5. New issues (document in Docs/reviews/T{NNN}-*.md)
6. Identity refresh (update soul.md current phase if major shift occurred)

Heartbeats should complete in under 30 minutes. Review-only, no execution without explicit instruction.

---

## 9. Task Management

### Source of Truth

`ai/todo.md` is the canonical task list. It is the ONLY file that defines what is pending, in progress, or done. No other file has authority over task state.

### Task Format

```markdown
- [ ] T083: Implement JWT token validation @worker_abc [checkpoint: cp_20260213_110248_fc2d05af] [worklog: Docs/worklogs/KuroRyuuWorkLog_20260213_...md] (created: 2026-02-13 11:02) (completed: 2026-02-13 13:45)
```

Fields:
- `T###` — Sequential ID assigned by PostToolUse hook
- `@agent` — Assigned agent ID
- `[checkpoint: ...]` — Checkpoint where this task was last saved
- `[worklog: ...]` — Path to detailed worklog
- `(created: timestamp)` — Required for Gantt timeline in Monitor UI
- `(completed: timestamp)` — Added by hook on TaskUpdate completion

### Task Creation (HARD RULE)

**Always use TaskCreate tool. Never write to ai/todo.md manually.**

```
TaskCreate: subject="Implement feature X" description="Details..."
```

The PostToolUse hook fires automatically and writes the task with proper T### ID and timestamp. Manual edits skip the hook and produce tasks without timestamps, which break the Gantt timeline in the Monitor UI.

### Task Completion

```
TaskUpdate: taskId="1" status="completed"
```

The hook adds `(completed: timestamp)` and changes `[ ]` to `[x]`.

### Session IDs vs Todo IDs (CRITICAL)

This distinction causes persistent errors if misunderstood:

| ID Type | Example | Source | Use For |
|---------|---------|--------|---------|
| Session-local | #1, #2 | TaskCreate return value | TaskUpdate within the same session only |
| Todo T### | T080, T081 | PostToolUse hook writes to ai/todo.md | Checkpoints, worklogs, cross-references, k_checkpoint task_id param |

```
CORRECT: k_checkpoint(task_id="T080")
WRONG:   k_checkpoint(task_id="1")

CORRECT: Worklog header "Tasks: T080, T081"
WRONG:   Worklog header "Tasks: #1, #2"
```

Before saving any checkpoint or worklog, read `ai/todo.md` to find the actual T### IDs.

### Task Metadata Sidecar (ai/task-meta.json)

The sidecar provides rich metadata not stored in the todo.md format:

```json
{
  "T083": {
    "description": "Full task description text",
    "priority": "high",
    "category": "backend",
    "complexity": 5,
    "worklog": "Docs/worklogs/KuroRyuuWorkLog_20260213_...",
    "checkpoint": "cp_20260213_110248_fc2d05af",
    "createdAt": "2026-02-13T11:02:00Z",
    "contextFiles": ["apps/gateway/server.py", "apps/web/src/stores/"]
  }
}
```

The sidecar is written by:
- The PostToolUse hook on TaskCreate (description)
- k_checkpoint when `task_id` param is provided (checkpoint link)
- Gateway PUT /v1/tasks/{id}/meta endpoint

### Gateway Task API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/tasks/list` | GET | All tasks, merged with sidecar metadata |
| `/v1/tasks/{id}` | GET | Single task with sidecar |
| `/v1/tasks/{id}/meta` | PUT | Write sidecar fields |
| `/v1/tasks/create` | POST | Create task (also writes sidecar) |

---

## 10. Context Management

### Monitoring Modes

**Visual monitoring (leader_monitor.md):**
```python
k_capture(action="start", fps=1.0, digest=True)
# Then read latest.jpg via multimodal vision each poll cycle
```

**Buffer monitoring (leader_monitor_buffer.md):**
```python
k_pty(action="term_read", session_id=worker_session, mode="tail", max_lines=5)
# max_lines=5-10 is the HARD RULE — large reads bloat leader context
```

### Context Thresholds

```
100%  ────────────────────────────────────────────
       Normal operation
 20%  ──────────────────────────────── WARN LINE ──
       CLI warning appears in worker terminal
       Leader MUST begin intervention now
       15% window to complete: ESC -> /savenow -> /compact -> /loadnow
  5%  ──────────────────────────────── DANGER LINE─
       Auto-compact fires (too late for meaningful save)
  0%  ────────────────────────────────────────────
```

### Context Recovery Sequence (Worker)

When leader sees worker at 20%:

```
1. Send ESC to worker terminal (cancel current input)
2. Send /savenow command (save checkpoint)
3. Send /compact command (trigger context compaction)
4. Wait for compact to complete
5. Send /loadnow command (restore checkpoint)
6. Worker re-registers and resumes task
```

### Checkpoint Format

```json
{
  "summary": "Brief description of session state",
  "plan_file": "Docs/Plans/active-plan.md",
  "worklog_files": ["Docs/worklogs/KuroRyuuWorkLog_20260213_...md"],
  "task_ids": ["T080", "T081"],
  "worker_status": {
    "worker_abc": "executing T080",
    "worker_def": "idle"
  }
}
```

The `plan_file`, `worklog_files`, and `task_ids` fields are required for cross-reference integrity. Checkpoints without these fields break the Monitor UI's timeline view.

### PTY Read Best Practice

```python
# CORRECT: start small
k_pty(action="term_read", session_id=sid, mode="tail", max_lines=5)

# WRONG: bloats leader context unnecessarily
k_pty(action="term_read", session_id=sid, mode="tail", max_lines=200)
```

Start at 5-10 lines and only request more if the initial read is insufficient.

---

## 11. Communication Channels

### Channel Map

```
LEADER ──[k_pty send_line]──────────────► WORKER terminal  (PRIMARY)
LEADER ──[k_inbox send / k_msg send]────► WORKER inbox     (FALLBACK)

WORKER ──[k_msg send / k_inbox send]────► LEADER inbox     (ONLY valid path)
WORKER  ✗  CANNOT write to leader terminal

THINKER ──[k_thinker_channel send_line]─► THINKER         (debate channel)
LEADER ──[k_thinker_channel read]────────► LEADER          (read debate)

ANY AGENT ──[k_capture screenshot]───────► SCREEN CAPTURE  (one-way read)
```

### k_msg vs k_inbox

`k_msg` is a simplified wrapper around `k_inbox` for common operations:

| Use k_msg when... | Use k_inbox when... |
|-------------------|---------------------|
| Sending one-shot messages | Need Maildir semantics (new/cur folders) |
| Broadcasting to all agents | Need claim/complete workflow |
| Checking inbox quickly | Need stats or archive operations |
| Replying to a message | Need fine-grained control |

Both tools write to the same Maildir structure under `ai/inbox/`.

### Inbox Structure

```
ai/inbox/
    new/          <- Unread messages
    cur/          <- Claimed messages
    done/         <- Completed messages
    dead/         <- Failed/expired messages
    tmp/          <- In-flight writes
    .index/
        by_agent.json    <- Messages indexed by recipient agent_id
        by_thread.json   <- Messages indexed by thread_id
```

### Agent Registration (Required for Messaging)

```python
k_session(action="start", process_id=<PID>, cli_type="claude", agent_id="<your_id>")
```

Must register before using k_msg inter-agent communication. The agent_id is how other agents address messages.

---

## 12. PRD-First Workflow

### Philosophy

The PRD (Product Requirements Document) is the north star for all development. It is created once at project inception and never regenerated. All planning and implementation must be verified against it before proceeding.

```
PRD = single source of requirements truth
Plan = implementation blueprint derived from PRD
Subtasks = atomic units of work derived from Plan
Code = output of subtask execution
```

### Flow

```
User request
    |
    v
Does PRD exist?
    |
    +-- NO --> Alert human. Use create-prd.md. STOP.
    |
    +-- YES
         |
         v
    Leader PRIME (Phase 1)
    Load PRD, load checkpoint, check workers
         |
         v
    Leader PLAN FEATURE (Phase 2)
    Verify PRD alignment, search codebase, write plan file
         |
         v
    Leader BREAKDOWN (Phase 3)
    Parse plan, query collective, assign budgets, inject context
         |
         v
    Workers EXECUTE in parallel
    Receive -> Claim -> Execute -> Report
         |
         v
    Leader MONITOR (Phase 4)
    Watch context %, intervene at 20% threshold
         |
         v
    Leader NUDGE (Phase 5) [if needed]
    Analyze stuck workers, send hints, generate evidence packs
         |
         v
    Leader FINALIZE (Phase 6) [when all DONE]
    Validate, report, review, record to collective, update DEVLOG
```

### PRD Alignment Check (Before Any Planning)

```markdown
| Check | Result | Notes |
|-------|--------|-------|
| Mission alignment | PASS/FAIL | Does this feature serve the stated mission? |
| In MVP scope | PASS/FAIL | Is this in the defined MVP boundary? |
| Tech stack fit | PASS/FAIL | Does it use the approved technology? |
| User story coverage | PASS/FAIL | Which user story does it address? |
```

If any check FAILS: STOP and clarify with human. Do not proceed with misaligned work.

### PRD Locations

| Artifact | Location |
|----------|----------|
| PRD files | `ai/prd/` (or `apps/ai/prd/`) |
| Active PRD index | `apps/ai/prd/index.json` |
| Implementation plans | `Docs/Plans/` |
| Archived plans | `Docs/Plans/Archive/` |
| Execution reports | `ai/reports/` |
| Code reviews | `ai/reviews/` |

---

## 13. Hook System

### Hook Configuration (ai/hooks.json)

```json
{
  "spec_version": "kuroryuu-hooks-config/0.1",
  "enabled": true,
  "defaults": {
    "timeout_ms": 2000,
    "continue_on_error": true
  },
  "hooks": [...]
}
```

### Active Hooks

| Hook ID | Event | Priority | Target |
|---------|-------|----------|--------|
| `todo_sot_enforcer` | Kuroryuu.SessionStart | 5 | builtins.todo_sot_enforcer:on_session_start |
| `todo_sot_enforcer_prompt` | Kuroryuu.UserPromptSubmit | 5 | builtins.todo_sot_enforcer:on_user_prompt |
| `todo_sot_enforcer_post_tool` | Kuroryuu.PostToolUse | 30 | builtins.todo_sot_enforcer:on_post_tool |
| `todo_sot_enforcer_response` | Kuroryuu.ModelResponseDone | 30 | builtins.todo_sot_enforcer:on_model_response |

The `todo_sot_enforcer` hooks are the primary enforcement mechanism ensuring ai/todo.md is consulted as source of truth. The PostToolUse hook also fires on TaskCreate to assign T### IDs and timestamps.

### Lifecycle Events

| Event | Trigger |
|-------|---------|
| `Kuroryuu.SessionStart` | Agent session begins |
| `Kuroryuu.SessionEnd` | Agent session ends |
| `Kuroryuu.UserPromptSubmit` | User sends a prompt |
| `Kuroryuu.PreToolUse` | Before any tool executes |
| `Kuroryuu.PostToolUse` | After any tool executes |
| `Kuroryuu.ProgressAppend` | Progress entry appended |
| `Kuroryuu.TaskNotification` | Task assigned to agent (auto-injected) |

### Windows Hook Constraints

Windows-specific behavior (observed on v2.1.37): Standalone hook arrays for certain events break Claude Code terminal input — keyboard input becomes completely unresponsive. Affected events: SessionStart, SessionEnd, SubagentStart, PreCompact, PermissionRequest, PostToolUseFailure, PreToolUse (standalone).

**Workaround:** Only append hooks to event arrays that already contain other hooks (piggyback pattern). Safe events for standalone hooks: Stop, PostToolUse, UserPromptSubmit, SubagentStop, Notification.

### Cross-Reference Requirements (HARD RULE)

Every artifact (checkpoint, worklog, task) must be bidirectionally linked:

**Checkpoint must include:**
```json
{
  "plan_file": "Docs/Plans/xxx.md",
  "worklog_files": ["Docs/worklogs/KuroRyuuWorkLog_..."],
  "task_ids": ["T080", "T081"]
}
```

**Worklog header must include:**
```markdown
**Checkpoint:** cp_YYYYMMDD_HHMMSS_xxx
**Plan:** Docs/Plans/xxx.md
**Tasks:** T080, T081
```

**Task entry must reference checkpoint and worklog:**
```markdown
- [x] T080: description @agent [checkpoint: cp_...] [worklog: Docs/worklogs/...] (created: ts) (completed: ts)
```

---

## 14. RAG and Repo Intel

### Search Priority (HARD RULE)

```
1. k_rag          -> Keyword search (BM25, pre-indexed, fastest)
2. k_repo_intel   -> Structured reports (symbol_map, routes, module_graph)
3. git            -> History, blame, diffs
4. Fallback       -> Glob, Grep, Read, Task agents
```

Check freshness before any search:

```python
k_rag(action="status")         # Check RAG index age
k_repo_intel(action="status")  # Check report age
```

Stale index = wrong answers. If RAG is stale by more than 1 hour after a session start, or after any major code change, refresh before searching.

### Decision Matrix

| Question | Primary Tool |
|----------|-------------|
| "Where is X defined?" | `k_rag(query="def X")` |
| "What API routes exist?" | `k_repo_intel(report="routes")` |
| "What depends on this module?" | `k_repo_intel(report="module_graph")` |
| "When was X last changed?" | `git log --follow -p -- path/to/file` |
| "Find files matching pattern" | Glob (only if k_rag insufficient) |
| "Find React hooks" | `k_repo_intel(report="hooks")` |
| "Find TODOs in codebase" | `k_repo_intel(report="todos")` |

### k_rag Actions

| Action | Use Case |
|--------|----------|
| `query` | Standard BM25 keyword search |
| `hybrid` | Combined BM25 + semantic search |
| `semantic` | Pure embedding similarity search |
| `agentic` | Multi-step reasoning search |
| `reflective` | Self-correcting iterative search |
| `index` | Rebuild index (use `force=true` after major changes) |
| `status` | Check index freshness and size |

### k_repo_intel Reports

| Report Name | Contents |
|-------------|----------|
| `symbol_map` | All function/class/type definitions |
| `public_api` | Exported symbols per module |
| `module_graph` | Import/dependency relationships |
| `routes` | All API routes (FastAPI, Express, Next.js) |
| `components` | React component hierarchy |
| `hooks` | React hooks and their usage |
| `todos` | All TODO/FIXME/HACK comments |
| `dependencies` | Package dependencies (package.json, requirements.txt) |

### Refresh Policy

| Situation | Action |
|-----------|--------|
| Session start, index > 1 hour old | Refresh both |
| After writing or editing code | Refresh before next search |
| After major refactor or deletion | Full refresh with `force=true` |

---

## 15. Configuration Files

### Agent Configuration

| File | Purpose |
|------|---------|
| `.claude/agents/` | 15 Claude Code subagent definitions |
| `.claude/commands/` | 30 slash commands |
| `.claude/rules/` | 3 project rule files (bootstrap, persistence, structure) |
| `AGENTS.md` | Agent type definitions (~400 LOC) |

### Slash Commands (.claude/commands/)

| Command | Purpose |
|---------|---------|
| `k-start.md` | Start a Kuroryuu session |
| `k-leader.md` | Initialize as leader |
| `k-worker.md` | Initialize as worker |
| `k-thinker.md` | Initialize as thinker |
| `k-inbox.md` | Check inbox messages |
| `k-save.md` | Save checkpoint |
| `k-load.md` | Load checkpoint |
| `k-memory.md` | Working memory operations |
| `k-rag.md` | RAG search operations |
| `k-status.md` | Session and system status |
| `k-plan.md` | Plan a feature |
| `k-plan-w-quizmaster.md` | Plan with Quizmaster skill |
| `k-start-worker-loop.md` | Start worker polling loop |
| `k-spawnteam.md` | Spawn a worker team |
| `k-find-app.md` | Find application code |
| `k-ralph.md` | Ralph intervention workflow |
| `savenow.md` | Immediate checkpoint save |
| `loadnow.md` | Immediate checkpoint load |
| `ralph_done.md` | Ralph DONE promise |
| `ralph_done_v2.md` | Ralph DONE promise v2 |
| `ralph_progress.md` | Ralph PROGRESS promise |
| `ralph_stuck.md` | Ralph STUCK promise |
| `max-swarm.md` | Maximum parallel swarm |
| `max-subagents-parallel.md` | Maximum parallel subagents |
| `question_toggle.md` | Toggle question mode |
| `find-skill-sh.md` | Find skill files |
| `ao-search.md` | AO search |
| `ao-browse.md` | AO browse |
| `ao-ask.md` | AO ask |
| `ao-answer.md` | AO answer |

### Stack Management Scripts

| Script | Purpose |
|--------|---------|
| `run_all.ps1` | Start all servers in correct order with port management |
| `kill_all.ps1` | Stop all servers with clean shutdown |

**NEVER** manually start uvicorn or Python processes. The scripts enforce startup order and port management.

---

## 16. Documentation Structure

### Docs Directory Layout

```
Docs/
    Architecture/           <- 5+ architecture specification files
        AI_HARNESS_ARCHITECTURE.md   (this file)
        HARNESS_FILES_SPECIFICATION.md
        ...
    Guides/                 <- 18 developer and user guides
    Plans/                  <- 130+ active implementation plans
        Archive/            <- Completed and archived plans
    reviews/                <- 17 pain-point audit documents (T100-T111 + others)
    worklogs/               <- 175+ session worklogs (KuroRyuuWorkLog_*)
    CaseStudies/            <- 13 deep-dive case studies
    DEVLOG.md               <- Development history (authoritative history log)
```

### The Twelve Pain Points (T100-T111)

Documented audit findings for the largest systemic issues in the codebase:

| Task | Issue | Review File |
|------|-------|-------------|
| T100 | Dojo/PRD — no solid creation path | `Docs/reviews/T100-dojo-prd-audit.md` |
| T101 | Chatbot — /compact broken, persistence 90% done | `Docs/reviews/T101-chatbot-compact-persistence.md` |
| T102 | Kuroryuu Agents vs Terminal Agents redundancy | `Docs/reviews/T102-agents-redundancy.md` |
| T103 | GenUI theme — 5 failed attempts at modern toggle | `Docs/reviews/T103-genui-theme-toggle.md` |
| T104 | Code Editor — minimap blank/bugged | `Docs/reviews/T104-code-editor-minimap.md` |
| T105 | Capture — same imperial theme stuck issue | `Docs/reviews/T105-capture-imperial-theme.md` |
| T106 | Marketing — clones repos then ignores them | `Docs/reviews/T106-marketing-repo-disconnect.md` |
| T107 | Observability timelines — visually unappealing | `Docs/reviews/T107-observability-timelines.md` |
| T108 | Restic backup — untested | `Docs/reviews/T108-restic-backup-untested.md` |
| T109 | Auto-update — no test strategy | `Docs/reviews/T109-auto-update-test-strategy.md` |
| T110 | Kuroryuu-CLI — 3 broken versions, model switch bug | `Docs/reviews/T110-kuroryuu-cli-audit.md` |
| T111 | Codebase-wide consolidation (meta-task) | `Docs/reviews/T111-codebase-consolidation.md` |

These reviews informed the 6-wave consolidation plan executed in 2026-02. See `Docs/Plans/polished-juggling-perlis.md` for wave details.

### Worklog Naming Convention

```
KuroRyuuWorkLog_YYYYMMDD_HHMMSS_Description.md
```

Example: `KuroRyuuWorkLog_20260213_110248_ConsolidationWave3.md`

Note: The prefix was renamed from `KiroWorkLog_` to `KuroRyuuWorkLog_` as of 2026-02-13.

### Worklog Header Template

```markdown
# Worklog: [Description]

**Date:** YYYY-MM-DD HH:MM
**Agent:** [agent_id]
**Checkpoint:** [cp_YYYYMMDD_HHMMSS_xxx]
**Plan:** [Docs/Plans/xxx.md or "None"]
**Tasks:** [T080, T081]

---

## Summary
...
```

All four cross-reference fields (Checkpoint, Plan, Tasks) are required. Worklogs without them cannot be linked from the Monitor UI's Gantt timeline.

---

## Appendix A: Windows-Specific Gotchas

| Issue | Symptom | Fix |
|-------|---------|-----|
| `> nul` in bash | Creates literal file named "nul" | Use `> /dev/null` in bash scripts |
| PowerShell BOM | `[System.Text.Encoding]::UTF8` writes BOM | Use `UTF8Encoding($false)` |
| Python BOM read | JSON parse fails on BOM-prefixed files | Use `encoding='utf-8-sig'` |
| WSL path mangling | `wsl rm -f /mnt/e/...` gets converted to `C:/Program Files/Git/mnt/...` | Use `powershell.exe -Command "wsl rm -f /mnt/e/..."` |
| Hook keyboard freeze | Standalone hooks on some events freeze terminal input | Piggyback on existing hook arrays only |

---

## Appendix B: Session Startup Checklist

```
1. k_session(action="start", process_id=<PID>, cli_type="claude", agent_id="<id>")
2. k_rag(action="status")           <- Check index freshness
3. k_repo_intel(action="status")    <- Check report freshness
4. Read ai/todo.md                  <- Current task state
5. Read Docs/DEVLOG.md last 3 entries <- Recent history
6. Check GET /v1/agents/leader      <- Leader or worker?
7. Confirm: "KURORYUU-aware. Session: {id}. Indexes: {fresh|stale}. Ready."
```

---

## Appendix C: Deprecated API Patterns

Do not use these patterns. They were replaced due to harness drift or inconsistency.

| Deprecated | Replaced By | Reason |
|------------|-------------|--------|
| Manual writes to `ai/todo.md` | `TaskCreate` tool | Hook timestamps required for Gantt |
| Reading `ai/progress.md` | `Docs/DEVLOG.md` | Eliminated duplicate state |
| Reading `ai/feature_list.json` | `ai/todo.md` | Unified task tracking |
| Session-local IDs in checkpoints | T### from ai/todo.md | Cross-session references require stable IDs |
| `start_line` / `end_line` in k_rag | `k_files(action="read", start_line=X)` | Cleaner separation of search vs file read |
