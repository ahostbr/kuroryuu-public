# Worker Reconnection After /compact or /clear

> **CRITICAL:** This is a VERY common occurrence. Workers MUST follow this pattern after context resets.

---

## THE PROBLEM

After `/compact` or `/clear` commands, workers experience a **context reset** but their **PTY session remains active**. This creates a disconnect:

- ✅ **Desktop App:** PTY session still running
- ✅ **Terminal:** Still active and receiving input
- ❌ **MCP Core:** PTY registration lost
- ❌ **Worker Agent:** New session ID, lost PTY connection

**Result:** Worker cannot access Kuroryuu systems (k_pty, k_inbox, etc.) because they're not properly registered.

---

## THE SOLUTION: 3-STEP RECONNECTION

### Step 1: Load Checkpoint with `/loadnow`

```bash
/loadnow
```

This loads the most recent checkpoint which contains your **PTY identity**:

```json
{
  "agent_id": "worker_shell_1768694781614",
  "session_id": "claude_worker_shell_1768694781614_e93a16c9",
  "pty_session_id": "bfa23893d25595c0",
  "pty_internal_id": "bfa23893d25595c0",
  "terminal_name": "term-worker_shell_1768694781614",
  "owner_role": "worker"
}
```

### Step 2: Restart k_session with PTY Info

Use the **exact** agent_id and process_id from the checkpoint:

```python
# Extract from checkpoint
agent_id = "worker_shell_1768694781614"
process_id = 1768694781614  # From agent_id timestamp
pty_session_id = "bfa23893d25595c0"

# Restart session with worker identity
k_session(
    action="start",
    process_id=process_id,
    cli_type="claude",
    agent_id=agent_id
)
```

**Why this matters:**
- Your PTY is still running with the original agent_id
- You need to "become" that agent again to access the PTY
- The process_id must match for proper registration

### Step 3: Re-register PTY with MCP Core

The PTY session exists in Desktop but is **not registered** with MCP Core after compact. Re-register it:

```bash
curl -s -X POST http://127.0.0.1:8100/v1/pty/register \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "bfa23893d25595c0",
    "source": "desktop",
    "desktop_url": "http://127.0.0.1:8201",
    "cli_type": "claude",
    "pid": 1768694781614,
    "owner_agent_id": "worker_shell_1768694781614",
    "owner_session_id": "claude_worker_shell_1768694781614_e93a16c9",
    "owner_role": "worker",
    "label": "Worker 1"
  }'
```

**Expected response:**
```json
{"ok": true, "created": true}
```

### Step 4: Verify Reconnection

Test PTY access with k_pty:

```python
k_pty(
    action="term_read",
    session_id="bfa23893d25595c0",
    mode="tail",
    max_lines=5  # Start small (5), work up as needed to save tokens
)
```

**If you get error:** `TERM_READ_DISABLED`
- Click the shield icon (🛡️) in Desktop app header to enable buffer access

**If you get error:** `SESSION_NOT_FOUND`
- Step 3 failed - PTY not registered with MCP Core
- Check MCP Core is running: `curl http://127.0.0.1:8100/health`
- Verify PTY session exists: `curl http://127.0.0.1:8100/v1/pty/sessions`

**Success:** You see terminal buffer output ✅

---

## AUTOMATED RECONNECTION SCRIPT

Create `scripts/worker-reconnect.ps1`:

```powershell
# Worker Reconnection Script
# Run after /compact or /clear

param(
    [Parameter(Mandatory=$true)]
    [string]$AgentId,

    [Parameter(Mandatory=$true)]
    [string]$PtySessionId,

    [Parameter(Mandatory=$true)]
    [string]$OwnerSessionId,

    [Parameter(Mandatory=$true)]
    [int]$Pid
)

Write-Host "🔄 Reconnecting worker..." -ForegroundColor Cyan

# Step 1: Re-register PTY with MCP Core
$body = @{
    session_id = $PtySessionId
    source = "desktop"
    desktop_url = "http://127.0.0.1:8201"
    cli_type = "claude"
    pid = $Pid
    owner_agent_id = $AgentId
    owner_session_id = $OwnerSessionId
    owner_role = "worker"
    label = "Worker 1"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://127.0.0.1:8100/v1/pty/register" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

if ($response.ok) {
    Write-Host "✅ PTY registered with MCP Core" -ForegroundColor Green
    Write-Host "   Session: $PtySessionId" -ForegroundColor Gray
    Write-Host "   Agent: $AgentId" -ForegroundColor Gray
} else {
    Write-Host "❌ PTY registration failed" -ForegroundColor Red
    Write-Host $response | ConvertTo-Json
    exit 1
}

# Step 2: Verify registration
$sessions = Invoke-RestMethod -Uri "http://127.0.0.1:8100/v1/pty/sessions"
$found = $sessions.sessions | Where-Object { $_.session_id -eq $PtySessionId }

if ($found) {
    Write-Host "✅ PTY session verified in registry" -ForegroundColor Green
} else {
    Write-Host "⚠️  PTY session not found in registry" -ForegroundColor Yellow
}

Write-Host "`n🎉 Reconnection complete!" -ForegroundColor Cyan
Write-Host "You can now use k_pty and other Kuroryuu tools." -ForegroundColor Gray
```

**Usage from checkpoint data:**

```bash
# Extract values from checkpoint, then run:
.\scripts\worker-reconnect.ps1 `
  -AgentId "worker_shell_1768694781614" `
  -PtySessionId "bfa23893d25595c0" `
  -OwnerSessionId "claude_worker_shell_1768694781614_e93a16c9" `
  -Pid 1768694781614
```

---

## WHY THIS HAPPENS

### Root Cause

1. **Desktop App** manages PTY sessions independently
2. **MCP Core** tracks PTY registration in-memory (not persisted)
3. `/compact` or `/clear` triggers:
   - Claude CLI context reset
   - New agent session created
   - MCP Core memory intact BUT worker has new session ID
4. **PTY registration** was tied to OLD session ID
5. **New session** can't access PTY without re-registration

### Architecture Gap

```
┌─────────────────┐         ┌─────────────────┐
│  Desktop App    │         │   MCP Core      │
│                 │         │                 │
│  PTY: bfa23893 │◄────────┤  Registry: {}   │  ← EMPTY after compact
│  (still alive) │  HTTP   │                 │
└─────────────────┘         └─────────────────┘
        │                            ▲
        │                            │
        │                            │ Re-register needed
        │                            │
        ▼                            │
┌─────────────────┐                 │
│  Worker Agent   │─────────────────┘
│  (new session)  │   Must reconnect
└─────────────────┘
```

**The fix:** Worker must re-register the PTY that Desktop is still managing.

---

## WHEN TO USE THIS GUIDE

### Symptoms You Need Reconnection

1. ❌ `k_pty` returns `SESSION_NOT_FOUND`
2. ❌ `k_inbox` can't find your agent
3. ❌ Terminal responds but MCP tools fail
4. ✅ Terminal still shows your session info in header popup

Note: PTY is now available to all agents (no more PTY_LEADER_ONLY errors).

### Commands That Trigger This

- `/compact` - Context compression, resets session
- `/clear` - Full context clear
- Any command that creates a new Claude CLI session while PTY stays alive

### Prevention

**There is no prevention.** This is expected behavior. The pattern is:
1. `/compact` → context reset
2. Follow reconnection steps
3. Resume work

---

## CHECKPOINT DATA STRUCTURE

Always save these fields in checkpoints for reconnection:

```json
{
  "schema": "kuroryuu_checkpoint_v1",
  "data": {
    "agent_id": "worker_shell_1768694781614",        // CRITICAL
    "agent_role": "worker",                          // CRITICAL
    "session_id": "claude_worker_..._e93a16c9",      // CRITICAL
    "pty_session_id": "bfa23893d25595c0",            // CRITICAL
    "pty_internal_id": "bfa23893d25595c0",           // Desktop internal ID
    "terminal_name": "term-worker_shell_1768694781614",
    "view_mode": "terminal",
    "task_id": "...",                                 // Current task if any
    "task_status": "...",
    "cwd": "<PROJECT_ROOT>"
  }
}
```

**Save checkpoint before `/compact` if possible!**

---

## TROUBLESHOOTING

### MCP Core Not Running

```bash
# Check MCP Core health
curl http://127.0.0.1:8100/health

# If down, start it:
cd apps/mcp_core
python server.py
```

### Desktop PTY Bridge Not Running

```bash
# Check Desktop bridge
curl http://127.0.0.1:8201/health

# If down, restart Desktop app
```

### PTY Session Actually Dead

```bash
# List Desktop PTY sessions
curl http://127.0.0.1:8201/pty/list

# If your session_id not found:
# - PTY actually terminated
# - You need to spawn a new worker PTY
# - Contact leader to reassign
```

### Buffer Access Disabled

1. Look for shield icon (🛡️) in Desktop terminal header
2. Click it to toggle buffer access
3. Try `k_pty(action="term_read")` again

---

## SUMMARY

**After `/compact` or `/clear`:**

1. **Load checkpoint** with `/loadnow` to get PTY identity
2. **Restart k_session** with checkpoint's agent_id and process_id
3. **Re-register PTY** with MCP Core via HTTP POST
4. **Verify** with `k_pty(action="term_read")`
5. **Resume work** with full Kuroryuu access

**This is normal and expected.** All workers will go through this after context resets.

---

## SEE ALSO

- `KURORYUU_WORKER.md` - Worker lifecycle and responsibilities
- `KURORYUU_BOOTSTRAP.md` - Session startup procedures
- `Docs/Plans/PTY_TargetedRouting.md` - PTY routing architecture
- `apps/mcp_core/pty_registry.py` - Registry implementation
