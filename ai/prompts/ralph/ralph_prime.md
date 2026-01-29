---
description: Initialize Ralph leader session
hackathon_stats: 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions
---

# Ralph Prime

> **Hackathon Stats:** 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions

Initialize the Ralph leader session for autonomous task orchestration.

## Purpose

This prompt runs at START of a Ralph session. It establishes the worker connection and identifies the first task.

## Initialization Steps

### Step 1: Start Kuroryuu Session

```python
k_session(action="start", process_id="claude_code", agent_type="claude")
```

### Step 2: Register as Leader with Gateway

```http
POST http://127.0.0.1:8200/v1/agents/register
{
  "agent_id": "{{agent_id}}",
  "role": "leader",
  "personality": "ralph",
  "capabilities": ["orchestration", "intervention", "pty_control"]
}
```

### Step 3: Locate and Adopt Worker PTY

```python
# List available PTYs
result = k_pty(action="list")

# Find the Claude worker terminal (cli_type="claude", no owner, role="worker")
# Adopt it
k_pty(
    action="adopt",
    session_id="<worker_session_id>",
    owner_agent_id="worker",
    owner_role="worker",
    label="Claude Worker"
)
```

### Step 3.5: Check k_pccontrol Availability (Opt-In)

If user has enabled Full Desktop Access in Desktop Settings, k_pccontrol will be available.

```python
# Check if k_pccontrol is available (requires Full Desktop Access enabled in Desktop Settings)
pccontrol_status = k_pccontrol(action="status")

if pccontrol_status.get("ok") and pccontrol_status.get("armed"):
    # Desktop automation available (armed via flag file)
    capabilities.append("desktop_automation")
    print("[Ralph] k_pccontrol available - desktop automation enabled")
else:
    # Not available (opt-in feature, not armed in Desktop Settings)
    print("[Ralph] k_pccontrol not available - terminal-only mode")
```

### Step 4: Load Tasks from todo.md

Read `ai/todo.md` and identify incomplete tasks in `## Claude Tasks` section.

Parse format: `- [ ] T###: description @agent [worklog: pending] (created: timestamp)`

### Step 5: Verify Worker Ready

```python
# Send a simple test to worker
k_pty(action="send_line", session_id=worker_pty, data="echo RALPH_READY_CHECK")

# Read response (with timeout)
result = k_pty(action="read", session_id=worker_pty, timeout_ms=5000)

# Verify worker is responsive
```

### Step 6: Initialize State

Create `ai/ralph/state.json`:
```json
{
  "session_id": "{{session_id}}",
  "worker_pty": "{{worker_session_id}}",
  "current_task": null,
  "iteration": 0,
  "started_at": "{{timestamp}}",
  "capabilities": {
    "desktop_automation": true|false
  }
}
```

### Step 7: Begin Loop

Load `ai/prompts/ralph/ralph_loop.md` and begin iteration.

---

## Output Report

```
═══════════════════════════════════════════════════════════════════
KURORYUU RALPH — Session Initialized
═══════════════════════════════════════════════════════════════════

SESSION
├── Agent: {{agent_id}}
├── Role: leader (Ralph personality)
└── Model: Opus

CAPABILITIES
├── Terminal Control: Yes (k_pty)
├── Desktop Automation: {{yes|no}} (k_pccontrol)
└── Mode: {{terminal-only|full-desktop}}

WORKER
├── PTY Session: {{worker_session_id}}
├── Status: Ready
└── Label: Claude Worker

TASKS
├── Pending: {{count}}
├── First Task: {{task_id}}: {{description}}
└── Source: ai/todo.md

READY TO BEGIN LOOP
═══════════════════════════════════════════════════════════════════
```

---

## Error Handling

| Error | Action |
|-------|--------|
| No worker PTY found | Prompt user to spawn worker via Desktop wizard |
| Worker unresponsive | Retry 3x, then alert user |
| No tasks in todo.md | Report "No tasks available" and wait |
| Gateway unreachable | Continue without registration (degraded mode) |
