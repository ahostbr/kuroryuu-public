# k_pty PTY Control System

> Kuroryuu PTY Control for Multi-Agent CLI Communication

---

## Overview

The `k_pty` tool provides pseudo-terminal (PTY) control for all agents in the Kuroryuu multi-agent orchestration system. It enables direct terminal communication between agents, allowing leaders to monitor worker terminals, inject commands, and coordinate multi-agent workflows.

### Key Features

- **Cross-platform support**: Windows (ConPTY via pywinpty) and Linux/Mac (tmux backend)
- **Dual session routing**: Local sessions (pywinpty) and Desktop sessions (node-pty via HTTP bridge)
- **Targeted routing**: Address PTYs by owner identity instead of session_id
- **Safety filters**: Blocks dangerous commands (rm -rf, format, credential access, etc.)
- **Terminal buffer access**: Read xterm.js buffer content (Desktop sessions only)
- **Sentinel pattern**: Reliable command completion detection

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        k_pty Tool                                │
│  (apps/mcp_core/tools_pty.py)                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐         ┌──────────────────┐               │
│  │  PTY Manager    │         │  PTY Registry    │               │
│  │  (pty_manager)  │         │  (pty_registry)  │               │
│  │                 │         │                  │               │
│  │  - spawn()      │         │  - register()    │               │
│  │  - write()      │         │  - resolve()     │               │
│  │  - read()       │         │  - heartbeat()   │               │
│  │  - run()        │         │  - unregister()  │               │
│  └────────┬────────┘         └────────┬─────────┘               │
│           │                           │                          │
│           ▼                           ▼                          │
│  ┌─────────────────┐         ┌──────────────────┐               │
│  │  Local Sessions │         │ Desktop Sessions │               │
│  │  (pywinpty)     │         │ (HTTP Bridge)    │               │
│  │                 │         │ Port 8201        │               │
│  └─────────────────┘         └──────────────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Actions Reference

### help - Show available actions

Returns tool documentation and current configuration.

```python
k_pty(action="help")
```

**Returns:**
```json
{
  "ok": true,
  "data": {
    "tool": "k_pty",
    "description": "PTY control for all agents",
    "actions": {...},
    "pywinpty_available": true,
    "term_buffer_access": {...}
  }
}
```

---

### list - List active PTY sessions

Lists all registered PTY sessions from both local and Desktop sources.

```python
k_pty(action="list")
```

**Returns:**
```json
{
  "ok": true,
  "sessions": [
    {
      "session_id": "d6edcbe7dbdd7c53",
      "source": "desktop",
      "cli_type": "claude",
      "pid": 12345,
      "owner_agent_id": "worker_abc123",
      "owner_session_id": "sess_xyz",
      "owner_role": "worker",
      "label": "Worker A",
      "created_at": "2026-01-30T14:00:00Z",
      "last_heartbeat": "2026-01-30T14:15:00Z"
    }
  ],
  "count": 1,
  "by_source": {
    "local": 0,
    "desktop": 1
  }
}
```

---

### create - Create new PTY session

Spawns a new local PTY session with the specified shell.

```python
k_pty(
    action="create",
    shell="powershell.exe",  # or "pwsh", "cmd.exe", "/bin/bash"
    cwd="E:\\SAS\\Kuroryuu",
    cols=120,
    rows=30
)
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| shell | string | powershell.exe (Win) / /bin/bash (Unix) | Shell executable |
| cwd | string | Project root | Working directory |
| cols | int | 120 | Terminal columns |
| rows | int | 30 | Terminal rows |

**Returns:**
```json
{
  "ok": true,
  "session_id": "pty_a1b2c3d4",
  "shell": "powershell.exe",
  "cwd": "E:\\SAS\\Kuroryuu",
  "cols": 120,
  "rows": 30
}
```

---

### send_line - Type a line and press Enter

Sends a single line of text followed by Enter. This is the **recommended** way to send commands.

```python
k_pty(
    action="send_line",
    session_id="pty_abc123",
    data="Get-Process"
)
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| session_id | string | Yes | Target PTY session |
| data | string | Yes | Text to type (Enter is appended automatically) |

**Behavior:**
1. Strips embedded CR/LF from text
2. Writes the text to PTY
3. Sends Enter (CR only) as separate write

**Returns:**
```json
{
  "ok": true,
  "typed": {"ok": true, "bytes_written": 11},
  "enter": {"ok": true, "bytes_written": 1}
}
```

---

### read - Read from PTY output buffer

Reads available output from the PTY's ring buffer.

```python
k_pty(
    action="read",
    session_id="pty_abc123",
    max_bytes=4096,
    timeout_ms=5000
)
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| session_id | string | Required | Target PTY session |
| max_bytes | int | 4096 | Maximum bytes to return |
| timeout_ms | int | 5000 | Wait timeout if buffer empty |

**Returns:**
```json
{
  "ok": true,
  "output": "PS E:\\SAS\\Kuroryuu> Get-Process\n...",
  "bytes_read": 1234,
  "session_alive": true
}
```

---

### talk - Execute command with sentinel pattern

Sends a command and waits for completion using the sentinel pattern. This provides **reliable command completion detection**.

```python
k_pty(
    action="talk",
    session_id="pty_abc123",
    command="git status",
    timeout_ms=30000
)
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| session_id | string | Required | Target PTY session |
| command | string | Required | Command to execute |
| sentinel | string | Auto-generated | Completion marker (usually leave empty) |
| timeout_ms | int | 30000 | Command timeout |

**Sentinel Pattern:**
```
command; echo __KR_DONE_<uuid>__\r\n
```

The tool:
1. Clears the output buffer
2. Sends command with appended sentinel echo
3. Reads until sentinel appears or timeout
4. Returns output before sentinel

**Returns:**
```json
{
  "ok": true,
  "output": "On branch master\nnothing to commit, working tree clean",
  "sentinel": "__KR_DONE_a1b2c3d4__",
  "raw_output": "..."
}
```

**Timeout Response:**
```json
{
  "ok": false,
  "error_code": "PTY_TIMEOUT",
  "message": "Command timed out after 30000ms",
  "details": {
    "session_id": "pty_abc123",
    "command": "git status",
    "partial_output": "..."
  }
}
```

---

### term_read - Read terminal buffer (Desktop only)

Reads text from the xterm.js terminal buffer. **Only works for Desktop sessions.**

```python
k_pty(
    action="term_read",
    session_id="d6edcbe7dbdd7c53",
    mode="tail",
    max_lines=40,
    max_chars=12000,
    merge_wrapped=True
)
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| session_id | string | Required | Desktop PTY session |
| mode | string | "tail" | Read mode: "tail", "viewport", or "delta" |
| max_lines | int | 40 | Max lines to return (cap: 200) |
| max_chars | int | 12000 | Max characters to return (cap: 50000) |
| merge_wrapped | bool | true | Merge wrapped lines for readability |
| marker_id | int | None | Marker ID for delta mode |

**Read Modes:**
- **tail**: Last N lines from buffer (most recent output)
- **viewport**: Currently visible window
- **delta**: New content since marker (for incremental reading)

**Configuration:**
Controlled by `KURORYUU_TERM_BUFFER_ACCESS` environment variable:
- `off`: Disabled
- `on` (default): Enabled for all agents

**Returns:**
```json
{
  "ok": true,
  "text": "...",
  "lines": ["line1", "line2", ...],
  "truncated": false,
  "cursor_line": 25,
  "viewport_y": 0,
  "rows": 30,
  "cols": 120,
  "buffer_type": "normal",
  "marker_id": 12345
}
```

---

### resize - Resize terminal dimensions

Resizes a local PTY session. **Not available for Desktop sessions via MCP.**

```python
k_pty(
    action="resize",
    session_id="pty_abc123",
    cols=200,
    rows=50
)
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| session_id | string | Yes | Target PTY session |
| cols | int | Yes | New column count |
| rows | int | Yes | New row count |

---

### resolve - Resolve owner identity to PTY session

Finds a PTY by owner metadata. Returns exactly one match or an error. **Never broadcasts.**

```python
# By agent ID (primary key)
k_pty(action="resolve", agent_id="worker_abc")

# By k_session ID (secondary key)
k_pty(action="resolve", owner_session_id="claude_worker_abc_d3199c03")

# By label
k_pty(action="resolve", label="Worker A")
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| agent_id | string | Owner agent ID (primary routing key) |
| owner_session_id | string | k_session.session_id |
| label | string | Human-friendly label |

At least one parameter is required.

**Returns (success):**
```json
{
  "ok": true,
  "session_id": "d6edcbe7dbdd7c53",
  "session": {
    "session_id": "d6edcbe7dbdd7c53",
    "source": "desktop",
    "owner_agent_id": "worker_abc",
    ...
  }
}
```

**Returns (not found):**
```json
{
  "ok": false,
  "error_code": "NOT_FOUND",
  "error": "No PTY found for: agent_id=worker_xyz, ..."
}
```

**Returns (ambiguous):**
```json
{
  "ok": false,
  "error_code": "AMBIGUOUS",
  "error": "Multiple PTYs match query (2 found). Use more specific criteria.",
  "matches": [...]
}
```

---

### send_line_to_agent - Send line to agent's PTY

Convenience action that combines resolve + send_line. Targets a specific agent's PTY by owner identity.

```python
k_pty(
    action="send_line_to_agent",
    agent_id="worker_abc",
    data="git status"
)
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| agent_id | string | Target agent ID |
| owner_session_id | string | Alternative: k_session ID |
| label | string | Alternative: human-friendly label |
| data | string | Text to send (required) |

**Returns:**
```json
{
  "ok": true,
  "resolved_session_id": "d6edcbe7dbdd7c53",
  "resolved_session": {...},
  "send_result": {"ok": true, "typed": {...}, "enter": {...}}
}
```

---

## Use Cases

### Leader Monitoring Workers

Leaders can observe and interact with worker terminals:

```python
# 1. List all sessions to see worker PTYs
sessions = k_pty(action="list")

# 2. Resolve a specific worker's PTY
result = k_pty(action="resolve", agent_id="worker_A")
session_id = result["session_id"]

# 3. Read their terminal output
output = k_pty(action="term_read", session_id=session_id, mode="tail", max_lines=50)

# 4. Send a command to verify state
k_pty(action="talk", session_id=session_id, command="git status")
```

### Cross-Agent Communication

Leader sends task directly to worker's terminal:

```python
# Resolve worker PTY
result = k_pty(action="resolve", agent_id="worker_abc")
session_id = result["session_id"]

# Send task instruction
k_pty(
    action="send_line",
    session_id=session_id,
    data="ultrathink - Investigate the API errors in apps/gateway/server.py"
)
```

Or use the convenience action:

```python
k_pty(
    action="send_line_to_agent",
    agent_id="worker_abc",
    data="ultrathink - Investigate the API errors"
)
```

### Unblocking Stuck Workers

When a worker is stuck on an interactive prompt:

```python
# 1. Read to identify the prompt
output = k_pty(action="read", session_id=session_id)
# Shows: "Continue? [Y/n]"

# 2. Send appropriate response
k_pty(action="send_line", session_id=session_id, data="Y")

# 3. Verify unblocked
k_pty(action="talk", session_id=session_id, command="echo PING")
```

### Verifying Task Completion

When worker claims task complete:

```python
# Git verification sequence
k_pty(action="talk", session_id=session_id, command="git status")
k_pty(action="talk", session_id=session_id, command="git log --oneline -3")
k_pty(action="talk", session_id=session_id, command="git diff HEAD~1 --stat")
```

---

## Examples

### Basic Session Management

```python
# Create a local PTY
result = k_pty(action="create", shell="powershell.exe")
session_id = result["session_id"]

# Run a command
output = k_pty(action="talk", session_id=session_id, command="Get-Location")
print(output["output"])

# Clean up
k_pty(action="kill", session_id=session_id)
```

### Health Check Pattern

```python
def check_session_health(session_id):
    result = k_pty(
        action="talk",
        session_id=session_id,
        command="echo PING",
        timeout_ms=5000
    )
    if result["ok"] and "PING" in result["output"]:
        return "healthy"
    return "stuck_or_dead"
```

### File Verification Pattern

```python
# PowerShell
result = k_pty(action="talk", session_id=session_id, command="Test-Path 'path/to/file'")
exists = "True" in result["output"]

# Bash
result = k_pty(action="talk", session_id=session_id, command="test -f 'path/to/file' && echo EXISTS")
exists = "EXISTS" in result["output"]
```

---

## Troubleshooting

### Common Error Codes

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `PTY_SESSION_NOT_FOUND` | Invalid session_id | Use `list` to find valid sessions |
| `PTY_SPAWN_FAILED` | Failed to create PTY | Check shell path and permissions |
| `PTY_TIMEOUT` | Command exceeded timeout | Increase timeout_ms or check for blocking prompts |
| `PTY_PROCESS_EXITED` | PTY process terminated | Create new session |
| `DANGEROUS_COMMAND_BLOCKED` | Safety filter triggered | Command contains dangerous pattern |
| `NOT_FOUND` | No PTY matches owner query | Check agent_id spelling, use `list` to verify |
| `AMBIGUOUS` | Multiple PTYs match query | Use more specific criteria (agent_id preferred) |
| `TERM_READ_DISABLED` | term_read is disabled | Set `KURORYUU_TERM_BUFFER_ACCESS=on` |
| `NOT_DESKTOP_SESSION` | term_read on local session | term_read only works for Desktop sessions |

### Dangerous Command Patterns (Blocked)

The following patterns are blocked by safety filters:

- **Destructive file ops**: `rm -rf /`, `del /s /q`, `rmdir /s`
- **Disk operations**: `format`, `diskpart`, `mkfs.*`, `dd if=...of=/dev`
- **System damage**: Fork bombs, `shutdown`, `halt`
- **Credential access**: Reading `.ssh/`, `.aws/`, SAM database, mimikatz
- **Download & execute**: `curl | bash`, `Invoke-WebRequest | iex`
- **Reverse shells**: netcat exec, bash reverse shell patterns
- **Registry attacks**: `reg delete HKLM`, `bcdedit`, shadow copy deletion

### Escape Sequence Handling

The tool automatically converts textual escape sequences:
- `\\r\\n` → actual CRLF
- `\\n` → actual LF (when not followed by identifier chars)
- `\\t` → actual TAB
- `\\x03` → Ctrl+C (hex escapes)

**Note:** Windows paths like `C:\Users` are NOT converted (safe handling).

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KURORYUU_GATEWAY_URL` | http://127.0.0.1:8200 | Gateway URL for leader queries |
| `KURORYUU_DESKTOP_URL` | http://127.0.0.1:8201 | Desktop bridge URL |
| `KURORYUU_PTY_SHELL` | powershell.exe (Win) | Default shell |
| `KURORYUU_PTY_COLS` | 120 | Default columns |
| `KURORYUU_PTY_ROWS` | 30 | Default rows |
| `KURORYUU_PTY_BUFFER_SIZE` | 102400 | Ring buffer size (bytes) |
| `KURORYUU_PTY_TIMEOUT_MS` | 30000 | Default timeout |
| `KURORYUU_TERM_BUFFER_ACCESS` | on | Term buffer access mode |

### Persistence

PTY state is persisted to:
- `ai/checkpoints/pty/_registry.json` - Session registry
- `ai/checkpoints/pty/_registry_events.jsonl` - Event log
- `ai/checkpoints/pty/buffers/` - Session buffers

---

## See Also

- `Docs/Architecture/PTY_DAEMON_SPEC.md` - Technical specification
- `ai/prompts/leader/leader_pty_module.md` - Leader usage patterns
- `ai/prompts/PTY_Training/` - Training materials
- `KURORYUU_LAWS.md` - Governance rules (Section 2: PTY Governance)
