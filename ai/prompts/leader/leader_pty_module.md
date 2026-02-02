# Leader PTY Module

> PTY Coordination Protocol for KURORYUU_LEADER

---

## Overview

**PTY is the PRIMARY channel for leader→worker communication.** Leaders read worker screens and write directly to their terminals.

### Channel Usage

| Direction | Channel | Method |
|-----------|---------|--------|
| Leader → Worker | **PTY (PRIMARY)** | `k_pty(action="send_line", ...)` |
| Leader → Worker | Inbox (fallback) | `k_inbox(action="send", ...)` |
| Worker → Leader | **Inbox (ALWAYS)** | `k_inbox(action="send", ...)` |
| Thinker ↔ Thinker | PTY | `k_thinker_channel` |

---

## 1. PTY Access Rules

### 1.1 PTY is PRIMARY for Leader→Worker

**Leader communicates with workers via direct terminal injection:**

```python
# Resolve worker PTY
result = k_pty(action="resolve", agent_id="worker_abc")
session_id = result["session_id"]

# Send task directly to their terminal
k_pty(action="send_line", session_id=session_id, data="ultrathink - Investigate the API errors...")
```

**Workers reply via k_inbox** (they cannot write to leader terminal).

### 1.2 Evidence Collection

Major PTY interventions SHOULD produce an inbox artifact:
- Command transcript
- Screenshot (if UI involved)
- Diff/patch (if files changed)
- Summary with next steps

### 1.3 Communication Flow Summary

```
LEADER ──[k_pty send_line]──► WORKER terminal (PRIMARY)
LEADER ──[k_inbox send]──────► WORKER inbox (FALLBACK)
WORKER ──[k_inbox send]──────► LEADER inbox (ALWAYS)
```

---

## 2. When to Use PTY

### 2.1 Worker Stuck / Silent

**Symptom:** Worker claimed task but no inbox updates for extended period.

**Protocol (with Targeted Routing):**
```
1. RESOLVE worker's PTY by agent_id:
   k_pty(action="resolve", agent_id="worker_abc")
   → Returns session_id if found, or NOT_FOUND error

   If NOT_FOUND, check if PTY needs adoption:
   k_pty(action="list")
   → Find unowned PTY matching worker's cli_type
   k_pty(action="adopt", session_id=X, owner_agent_id="worker_abc")

2. k_pty(action="read", session_id=X, mode="viewport")
   → Observe current terminal state

3. k_capture(action="screenshot")
   → Visual evidence of stuck state

4. DIAGNOSE:
   - Interactive prompt waiting? → k_pty(action="send_line_to_agent", agent_id="worker_abc", data="Y")
   - Error/crash? → k_pty(action="kill", ...) and reassign
   - Working but slow? → Wait and monitor

5. k_inbox(action="send", ...)
   → Create unblock task or progress note
```

### 2.2 Suspicious Completion

**Symptom:** Worker marked task DONE but evidence seems incomplete/wrong.

**Protocol:**
```
1. k_pty(action="talk", session_id=X, command="git status")
   → Verify working tree state

2. k_pty(action="talk", session_id=X, command="git diff HEAD~1")
   → Review actual changes

3. k_pty(action="talk", session_id=X, command="npm test")  # or equivalent
   → Verify tests pass

4. IF evidence matches claim:
   → Accept completion via k_inbox

5. IF evidence mismatches:
   → k_inbox(action="send", ...) with rejection + specific requirements
```

### 2.3 Urgent Hotfix

**Symptom:** Critical bug discovered, need immediate fix bypassing normal flow.

**Protocol:**
```
1. k_inbox(action="send", title="LEADER: Emergency hotfix initiated", ...)
   → Announce intervention

2. k_pty(action="talk", session_id=X, command="<fix command>")
   → Apply fix

3. k_pty(action="talk", session_id=X, command="git diff")
   → Capture changes

4. k_capture(action="screenshot")
   → Visual evidence if UI involved

5. k_inbox(action="send", ...)
   → Post evidence pack with full audit trail
```

### 2.4 Interactive Prompt Blocking

**Symptom:** Worker stuck on Y/N prompt, password request, or similar.

**Protocol:**
```
1. k_pty(action="read", session_id=X, mode="viewport")
   → Identify the prompt

2. k_pty(action="send_line", session_id=X, data="Y")  # or appropriate response
   → Unblock the prompt

3. k_inbox(action="send", ...)
   → Document intervention
```

---

## 3. Targeted PTY Routing

### 3.1 Overview

Target specific worker PTYs by owner identity instead of session_id. **Never broadcasts** - ambiguity is an explicit error.

### 3.2 Ownership Metadata

Each PTY can have owner metadata:
- `owner_agent_id` - Primary routing key (e.g., "worker_abc123")
- `owner_session_id` - k_session.session_id (secondary key)
- `owner_role` - "leader" or "worker"
- `label` - Human-friendly name (e.g., "Worker A")

### 3.3 Workflow Options

**Option A: PTY registered with owner metadata (preferred)**
```python
# Desktop app passes owner metadata when spawning PTY
# Worker's PTY is already associated with their agent_id
# Use resolve or send_line_to_agent directly
```

**Option B: Adopt existing PTY**
```python
# 1. List sessions to find the target
k_pty(action="list")
# Returns sessions with owner_* fields (null if unassigned)

# 2. Adopt the PTY (assign owner metadata)
k_pty(
    action="adopt",
    session_id="shell_abc123",
    owner_agent_id="worker_A",
    owner_role="worker",
    label="Worker A"
)
```

### 3.4 Targeting Workers

```python
# Resolve: Find PTY by owner identity (returns exactly 1 or error)
k_pty(action="resolve", agent_id="worker_A")
# Returns: {"ok": true, "session_id": "shell_abc123", "session": {...}}

# Errors:
# - NOT_FOUND: No PTY matches
# - AMBIGUOUS: Multiple PTYs match (use more specific criteria)

# Send line to specific worker (convenience wrapper)
k_pty(
    action="send_line_to_agent",
    agent_id="worker_A",
    data="git status"
)
# Internally: resolve -> send_line
```

### 3.5 Disowning

```python
# Clear ownership metadata
k_pty(action="disown", session_id="shell_abc123")
```

---

## 4. PTY Tool Reference

### 4.1 List Sessions

```python
k_pty(action="list")
```

Returns:
```json
{
  "ok": true,
  "sessions": [
    {
      "session_id": "shell_abc123",
      "source": "desktop",
      "cli_type": "claude",
      "pid": 12345,
      "owner_agent_id": "worker_A",
      "owner_session_id": "sess_xyz",
      "owner_role": "worker",
      "label": "Worker A",
      "created_at": "2026-01-10T09:30:00Z",
      "last_heartbeat": "2026-01-10T09:45:00Z"
    }
  ]
}
```

### 4.2 Create Session

```python
k_pty(
    action="create",
    shell="powershell.exe",  # or "pwsh", "cmd.exe"
    cwd="E:\\SAS\\Kuroryuu",
    cols=120,
    rows=30
)
```

Returns:
```json
{
  "ok": true,
  "session_id": "pty_xyz789"
}
```

### 4.3 Send a Line (Recommended)

```python
k_pty(
    action="send_line",
    session_id="pty_abc123",
    data="Get-Process"
)
```

**Rule:** Always send **plain text**, then send Enter separately (or use `send_line`).

**Note:** The `write` action is deprecated. Use `send_line` which automatically appends Enter:
```python
k_pty(action="send_line", session_id="pty_abc123", data="Get-Process")
```

Avoid sending `\r\n` embedded in the same `data` string for terminal nudges.

### 4.4 Read from Session

```python
k_pty(
    action="read",
    session_id="pty_abc123",
    mode="viewport",
    max_bytes=4096,
    timeout_ms=5000
)
```

Returns:
```json
{
  "ok": true,
  "output": "...",
  "bytes_read": 1234
}
```

### 4.5 Talk (Send Command with Sentinel)

```python
k_pty(
    action="talk",
    session_id="pty_abc123",
    command="git status",
    timeout_ms=30000
)
```

Returns:
```json
{
  "ok": true,
  "output": "On branch master\nnothing to commit, working tree clean\n",
  "exit_code": 0
}
```

**Note:** Sentinel is auto-generated. See `Docs/Specs/PTY_DAEMON_SPEC.md` for details.

### 4.6 Resize Session

```python
k_pty(
    action="resize",
    session_id="pty_abc123",
    cols=200,
    rows=50
)
```

### 4.7 Kill Session

```python
k_pty(
    action="kill",
    session_id="pty_abc123"
)
```

---

### 4.8 Targeted Routing Actions

```python
# Resolve owner to PTY
k_pty(action="resolve", agent_id="worker_A")
k_pty(action="resolve", owner_session_id="sess_xyz")
k_pty(action="resolve", label="Worker A")

# Adopt PTY (assign owner)
k_pty(
    action="adopt",
    session_id="shell_abc123",
    owner_agent_id="worker_A",
    owner_role="worker",
    label="Worker A"
)

# Disown PTY (clear owner)
k_pty(action="disown", session_id="shell_abc123")

# Send line to agent's PTY
k_pty(action="send_line_to_agent", agent_id="worker_A", data="git status")
```

---

## 5. Evidence Collection Patterns

### 5.1 Command Evidence

```
1. k_pty(action="talk", command="<cmd>")
2. Capture output in evidence pack:
   {
     "type": "pty_transcript",
     "command": "<cmd>",
     "output": "<output>",
     "timestamp": "<ISO8601>",
     "session_id": "<id>"
   }
3. k_inbox(action="send", payload=evidence_pack)
```

### 5.2 Screenshot Evidence

```
1. k_capture(action="screenshot")
2. Link in evidence pack:
   {
     "type": "screenshot",
     "capture_id": "<id>",
     "timestamp": "<ISO8601>",
     "description": "<what it shows>"
   }
```

### 5.3 Combined Evidence Pack

```json
{
  "intervention_type": "stuck_worker_recovery",
  "session_id": "pty_abc123",
  "timestamp": "2026-01-10T09:45:00Z",
  "evidence": [
    {
      "type": "pty_transcript",
      "command": "git status",
      "output": "..."
    },
    {
      "type": "screenshot",
      "capture_id": "cap_xyz",
      "description": "Terminal showing stuck state"
    }
  ],
  "action_taken": "Sent Y to confirm prompt",
  "result": "Worker unblocked, proceeding"
}
```

---

## 6. Common Patterns

### 6.1 Health Check

```python
# Check if worker session is responsive
result = k_pty(action="talk", session_id=X, command="echo PING", timeout_ms=5000)
if result["ok"] and "PING" in result["output"]:
    # Session healthy
else:
    # Session stuck or dead
```

### 6.2 File Verification

```python
# Verify a file was created/modified
result = k_pty(action="talk", session_id=X, command="Test-Path 'path/to/file'")
if "True" in result["output"]:
    # File exists
```

### 6.3 Git State Check

```python
# Standard git verification sequence
k_pty(action="talk", command="git status")
k_pty(action="talk", command="git log --oneline -5")
k_pty(action="talk", command="git diff HEAD~1 --stat")
```

---

## 7. Anti-Patterns (DO NOT)

| Anti-Pattern | Why Bad | Instead Do |
|--------------|---------|------------|
| Use PTY for worker-to-worker comms | Bypasses audit trail | Use k_inbox |
| Skip evidence collection | Unauditable | Always create evidence pack |
| PTY for routine tasking | Inefficient, no tracking | Use k_inbox |
| Long-running PTY sessions | Resource leak | Create → Use → Kill |
| Ignore sentinel timeouts | Hidden failures | Handle timeouts explicitly |

---

## 8. Integration with Leader Loop

The Leader's core operating loop (from `KURORYUU_LEADER.md`) integrates PTY as follows:

```
LEADER LOOP:
┌─────────────────────────────────────────┐
│ 1. SCAN INBOX                           │
│    k_inbox(action="list", folder="new") │
├─────────────────────────────────────────┤
│ 2. TRIAGE                               │
│    Classify each item                   │
├─────────────────────────────────────────┤
│ 3. DISPATCH                             │
│    k_inbox(action="send", ...)          │
├─────────────────────────────────────────┤
│ 4. MONITOR                              │
│    k_inbox(action="list", folder="cur") │
│    IF stalled → PTY ESCALATION          │◄── PTY ENTRY POINT
├─────────────────────────────────────────┤
│ 5. VERIFY                               │
│    Check evidence in inbox              │
│    IF suspicious → PTY VERIFICATION     │◄── PTY ENTRY POINT
├─────────────────────────────────────────┤
│ 6. INTEGRATE                            │
│    Merge results, create follow-ups     │
└─────────────────────────────────────────┘
```

---

## See Also

- `Docs/Specs/PTY_DAEMON_SPEC.md` - Technical specification
- `KURORYUU_LEADER.md` - Full leader bootstrap
- `KURORYUU_LAWS.md` - Governance rules
