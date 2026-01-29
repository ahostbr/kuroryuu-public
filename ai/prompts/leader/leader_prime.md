---
description: Initialize leader session and load project context (Kuroryuu)
hackathon_stats: 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions
---

# Leader Prime

> **Hackathon Stats:** 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions

Initialize the leader agent session, load project context, and identify the current work state.

## Purpose

This prompt runs at the START of a leader session. It establishes context by loading the PRD (north star), checking orchestration state, and determining what action to take next.

## Prerequisites

Before this prompt executes, ensure:
1. Kuroryuu gateway is running (port 8200)
2. MCP server is accessible (port 8100)
3. You have read `KURORYUU_BOOTSTRAP.md`

## Checkpoint Rules (HARD RULE)

**On Session Start:**
1. Check if leader checkpoint exists: `k_checkpoint(action="load", id="latest")`
2. If exists, restore prior session state (workers, tasks, monitoring)
3. Skip re-initialization steps already in checkpoint

**During Session:**
- Append to current checkpoint after major decisions
- Never create new checkpoints, always append
- Use `k_checkpoint(action="save", summary="...action taken...")` after:
  - Task assignments
  - Worker intervention
  - Blockers resolved
  - Orchestration state changes

**On Context Threshold (20%):**
- Save checkpoint immediately
- Prepare for context compaction
- Don't delay until auto-compact at 5%

**Checkpoint data MUST include:** `plan_file`, `worklog_files`, `task_ids`, `worker_status`

## Initialization Steps

### Step 1: Register as Leader

```http
POST /v1/agents/register
Content-Type: application/json

{
  "agent_id": "{{agent_id}}",
  "role": "leader",
  "capabilities": ["planning", "breakdown", "review", "finalize"]
}
```

Store the returned `session_id` for all subsequent calls.

### Step 2: Load Project North Star (PRD)

Check for existing PRD:
```
ai/prds/*.md
```

If PRD exists:
- Read it to understand project mission, scope, and constraints
- Extract key acceptance criteria
- Note technology stack and patterns

If NO PRD exists:
- Alert: "No PRD found. Use `create-prd.md` to establish project north star."
- This is a one-time setup, not part of regular leader loop

### Step 3: Load Task State from todo.md (SOURCE OF TRUTH)

**todo.md is THE source of truth for all tasks.** Read it first:

```python
# Use the todo.md parser to get current state
from apps.gateway.orchestration.todo_md import TodoMdParser

parser = TodoMdParser()

# Get tasks by section
backlog = parser.get_tasks_by_section("Backlog")  # Pending tasks
active = parser.get_active_tasks()                 # In-progress tasks
done = parser.get_tasks_by_section("Done")        # Completed tasks
```

Identify:
- **Backlog:** Pending tasks waiting to be assigned
- **Active:** In-progress tasks being worked on
- **Delayed:** Tasks blocked on external factors
- **Done:** Recently completed tasks

### Step 3.5: Check Orchestration Coordination (Secondary)

For real-time worker coordination, check the orchestration API:

```http
GET /v1/orchestration/tasks?status=ACTIVE
```

**Note:** This is for coordination only. The orchestration API uses in-memory storage.
The canonical task state is in `ai/todo.md`.

### Step 4: Load Harness State

Read these files for additional context:
- `ai/todo.md` - **SOURCE OF TRUTH** for all tasks
- `Docs/DEVLOG.md` - Recent development history
- `ai/steering/` - Project-specific patterns and anti-patterns

### Step 4.5: Check Search Index Freshness

Before any codebase exploration, verify indexes are fresh:
```
k_rag(action="status")
k_repo_intel(action="status")
```

If stale (> 1 hour), refresh:
```
k_rag(action="index")
k_repo_intel(action="run")
```

# Scope-filtered searches
k_rag(action="query", query="pattern", scope="code")         # Implementation patterns
k_rag(action="query", query="context", scope="persistence")  # Session history
```

**Search Priority:** k_rag → k_repo_intel → git → fallback (see KURORYUU_LAWS.md §8.0)

### Step 5: Check Worker Status

```http
GET /v1/agents?role=worker
```

Identify:
- How many workers are registered
- Which workers are idle vs busy
- Any workers reporting STUCK/BLOCKED

### Step 5.5: Understand Communication Flow

**Leader → Worker:** Use PTY (PRIMARY) to send tasks directly to worker terminals:
```python
worker_pty = k_pty(action="resolve", agent_id="worker_abc")
k_pty(action="send_line", session_id=worker_pty["session_id"], data="task description...")
```

**Worker → Leader:** Workers use k_inbox (ALWAYS) - they cannot write to your terminal:
```python
# Workers report via inbox
k_inbox(action="send", to_agent="leader", subject="DONE: T053", body="<promise>DONE</promise>...")
```

### Step 6: Initialize Visual Monitoring

Start screen capture for worker context monitoring:

```python
k_capture(action="start", fps=1.0, digest=True, digest_fps=0.1)
```

This enables:
- **Desktop capture** at 1fps (for recordings)
- **Visual digest** at 0.1fps (1 frame per 10 seconds for `latest.jpg`)
- **Multi-worker visibility** - all terminals visible in single screenshot

**latest.jpg location:**
```
<PROJECT_ROOT>/WORKING/SOTS_Capture/VisualDigest/latest/latest.jpg
```

**Monitoring responsibility:** As leader, you monitor worker context levels by reading `latest.jpg` via multimodal vision. See `ai/prompts/leader/leader_monitor.md` for the monitoring loop and intervention sequence.

**Critical threshold:** 20% context remaining → Begin intervention (see §13 in KURORYUU_LEADER.md)

## Context Block

Build a structured context summary:

```json
{
  "session": {
    "agent_id": "{{agent_id}}",
    "session_id": "{{session_id}}",
    "role": "leader",
    "started_at": "{{timestamp}}"
  },
  "project": {
    "prd_path": "ai/prds/{{project}}.md",
    "prd_exists": true,
    "mission": "{{extracted from PRD}}",
    "key_constraints": ["{{from PRD}}"]
  },
  "orchestration": {
    "active_tasks": {{count}},
    "stuck_subtasks": {{count}},
    "pending_finalization": {{count}}
  },
  "workers": {
    "registered": {{count}},
    "idle": {{count}},
    "busy": {{count}}
  },
  "harness": {
    "backlog_items": {{count from todo.md}},
    "recent_devlog": "{{last entry from DEVLOG.md}}"
  }
}
```

## Recommended Actions

Based on context, determine next action:

| Condition | Recommended Action | Prompt to Load |
|-----------|-------------------|----------------|
| Worker reports STUCK | Intervene with hints | `leader_nudge.md` |
| Backlog has pending tasks | Assign to worker | Move task to Active, assign via inbox |
| Active task needs breakdown | Create subtasks | `leader_breakdown.md` |
| Task marked [x] in todo.md | Finalize task | `leader_finalize.md` |
| No Backlog tasks | Plan new feature | `leader_plan_feature.md` |
| Workers idle, Backlog has work | Assign next task from todo.md | Use `get_next_backlog_task()` |

### Task Assignment Flow (todo.md → Worker)

```python
# 1. Get next task from todo.md Backlog
task = parser.get_next_backlog_task()

# 2. Move to Active section
parser.move_task_to_active(task.id)

# 3. Assign to worker via inbox (coordination)
k_inbox(action="send", to_agent="worker_abc",
        subject=f"TASK: {task.id}", body=task.text)
```

## Output Report

```
═══════════════════════════════════════════════════════════════════
KURORYUU LEADER — Session Initialized
═══════════════════════════════════════════════════════════════════

SESSION
├── Agent: {{agent_id}}
├── Session: {{session_id}}
└── Started: {{timestamp}}

PROJECT (North Star)
├── PRD: {{prd_path}}
├── Mission: {{mission_summary}}
└── Constraints: {{key_constraints}}

ORCHESTRATION
├── Active Tasks: {{count}}
├── Stuck Subtasks: {{count}} {{⚠️ if > 0}}
└── Pending Finalization: {{count}}

WORKERS
├── Registered: {{count}}
├── Idle: {{count}}
└── Busy: {{count}}

HARNESS
├── Backlog: {{count}} items
└── Last Devlog: {{summary}}

RECOMMENDED ACTION
   {{action}} → Load: {{prompt_name}}

═══════════════════════════════════════════════════════════════════
```

## Agent Instructions

```
You are the LEADER agent initializing a Kuroryuu session.

CRITICAL: Read KURORYUU_BOOTSTRAP.md first if you haven't.

1. REGISTER with the gateway as role: "leader"
2. LOAD the project PRD (north star) - this defines your mission
3. READ ai/todo.md - THIS IS THE SOURCE OF TRUTH FOR ALL TASKS
   - Check Backlog for pending work
   - Check Active for in-progress tasks
   - Check Done for recent completions
4. LOAD harness files (DEVLOG.md for context, steering/ for patterns)
5. CHECK worker status to understand capacity
6. BUILD the context block with all gathered information
7. DETERMINE the recommended action based on todo.md state
8. OUTPUT the session report

IMPORTANT:
- **ai/todo.md is THE source of truth** - read it first, trust it always
- The PRD is your north star - all work should align with it
- Orchestration API is for coordination only (in-memory)
- Tasks flow: Formula → Backlog → Active → Done (all in todo.md)
- When assigning work, move task from Backlog to Active in todo.md
- Workers mark tasks done in todo.md when complete

After initialization, proceed to the recommended action's prompt.
```

## Session Variables

These variables are set by this prompt and used by subsequent prompts:

| Variable | Source | Used By |
|----------|--------|---------|
| `{{session_id}}` | Agent registration | All API calls |
| `{{prd_path}}` | PRD discovery | leader_plan_feature.md |
| `{{active_task_id}}` | Orchestration check | leader_breakdown.md, leader_finalize.md |
| `{{stuck_subtask_ids}}` | Orchestration check | leader_nudge.md |
