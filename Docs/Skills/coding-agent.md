# Coding Agent Skill

Spawn and manage external coding agents (Claude Code, Codex CLI, Copilot, Cline, Kiro, KiloCode, OpenCode, Kuroryuu-CLI, Kimi, etc.) using Kuroryuu's hybrid approach.

## Overview

Kuroryuu uses two tools for managing coding agents:

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `k_bash` | Background/headless execution | Long-running tasks, CI/CD, batch operations |
| `k_pty` | Desktop-visible terminals | Interactive debugging, user observation |

## k_bash + k_process (Background Agents)

Simple shell execution with PTY and background support. Mirrors OpenClaw's proven pattern.

### Spawning an Agent

```python
# Spawn codex in background with PTY
result = k_bash(
    command='codex exec --full-auto "Build a REST API for todos"',
    workdir="/tmp/api-project",
    pty=True,          # REQUIRED for interactive CLIs
    background=True    # Returns immediately with sessionId
)
# Returns: {"ok": True, "sessionId": "abc123"}
session_id = result["sessionId"]
```

### Monitoring

```python
# Check if still running
k_process(action="poll", sessionId=session_id)
# Returns: {"ok": True, "running": True, "exit_code": None}

# Get output (with pagination)
k_process(action="log", sessionId=session_id)
k_process(action="log", sessionId=session_id, offset=100, limit=50)
# Returns: {"ok": True, "output": "...", "total_lines": 250}

# List all sessions
k_process(action="list")
# Returns: {"ok": True, "sessions": [...], "running_count": 2}
```

### Interaction

```python
# Send input when agent prompts for confirmation
k_process(action="submit", sessionId=session_id, data="yes")

# Send raw data (no newline)
k_process(action="write", sessionId=session_id, data="y")
```

### Termination

```python
# Kill a stuck or completed session
k_process(action="kill", sessionId=session_id)
```

## k_pty (Worker Terminals)

Use for Desktop-visible terminals that users create manually as blank PowerShell windows.

```python
# List available terminals
workers = k_pty(action="list")  # Filter by owner_role="worker"

# Send command to start a CLI in the terminal
k_pty(action="send_line", session_id="worker_abc", data='claude "Fix the auth bug"')

# Read output
k_pty(action="term_read", session_id="worker_abc")
```

## CLI Reference

| CLI | Command Pattern | Notes |
|-----|-----------------|-------|
| **Codex** | `codex exec --full-auto "prompt"` | Requires git repo! |
| **Claude** | `claude "prompt"` | Interactive by default |
| **Pi** | `pi "prompt"` | Conversational |
| **OpenCode** | `opencode run "prompt"` | |
| **Kiro** | `kiro "prompt"` | |
| **KiloCode** | `kilocode "prompt"` | |
| **Cline** | `cline "prompt"` | |
| **Copilot** | `github copilot "prompt"` | |

## Best Practices

1. **Always use `pty=True`** for coding CLIs - they're interactive and need terminal emulation
2. **Use `background=True`** for long-running tasks (code generation, refactoring)
3. **Monitor periodically** with `k_process(action="log")`
4. **Codex requires git** - use `git init` in workdir before spawning
5. **Check exit codes** - `k_process(action="poll")` returns `exit_code` when done
6. **Clean up sessions** - Kill stuck sessions to free resources

## Full Example: Delegating to Codex

```python
import os
import tempfile

# 1. Create a git-initialized workspace
workdir = tempfile.mkdtemp(prefix="codex-")
os.system(f"cd {workdir} && git init")

# 2. Spawn codex agent
result = k_bash(
    command='codex exec --full-auto "Create a FastAPI server with /health endpoint"',
    workdir=workdir,
    pty=True,
    background=True,
    timeout=600  # 10 minute timeout
)
session_id = result["sessionId"]

# 3. Monitor progress
import time
while True:
    status = k_process(action="poll", sessionId=session_id)
    if not status["running"]:
        break

    # Get latest output
    log = k_process(action="log", sessionId=session_id, offset=-50)
    print(log["output"])

    time.sleep(5)

# 4. Check result
final = k_process(action="poll", sessionId=session_id)
if final["exit_code"] == 0:
    print("Success! Check", workdir)
else:
    print("Failed with exit code:", final["exit_code"])
```

## Desktop UI

The Coding Agents panel in Desktop (Monitor > Coding Agents) provides:

- **Session List**: All active/recent k_bash background sessions
- **Live Logs**: Auto-scrolling output viewer per session
- **Input**: Send text to session stdin (for prompts/confirmations)
- **Controls**: Kill, refresh, clear actions

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Kuroryuu Desktop                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Leader  │  │ Worker 1 │  │ Worker 2 │  │ Worker 3 │       │
│  │ (Claude) │  │  (agent) │  │  (idle)  │  │  (idle)  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │              │
│       │        [k_pty for visible terminals]                   │
└───────┼─────────────────────────────────────────────────────────┘
        │
        │  [k_bash for background agents - simple!]
        │
        ▼
   ┌─────────────────────────────────────────┐
   │  Background PTY Processes               │
   │  (codex, claude, pi - no UI needed)     │
   │  Monitored via k_process                │
   └─────────────────────────────────────────┘
```
