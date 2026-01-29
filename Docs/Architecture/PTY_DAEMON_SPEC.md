# PTY Daemon Specification

> Kuroryuu PTY Control for Multi-Agent CLI Communication

---

## 1. Overview

The PTY daemon provides pseudo-terminal control for all agents. Workers use k_inbox as primary coordination channel and PTY for leader dialogue. Thinkers use PTY as primary communication for real-time debates.

### Use Cases

| Scenario | Action |
|----------|--------|
| Worker stuck / no inbox output | Observe CLI, screenshot, unblock or restart |
| Suspicious completion claims | Verify via `git diff`, file checks, tests |
| Urgent hotfix needed | Direct command injection (with audit trail) |
| Interactive prompt blocking | Send expected input to unblock |

---

## 2. Core Concepts

### 2.1 Pseudo-Terminal (PTY)

A PTY makes the child process (PowerShell) believe it's connected to a real console:
- Preserves interactive behavior and ANSI colors
- Enables tab-completion, prompts, and `Read-Host` functionality
- Required for reliable CLI automation

### 2.2 Windows ConPTY

Windows 10 1809+ provides the ConPTY API (Pseudo Console):
- Creates hidden console buffer with pipes for I/O
- Child process doesn't know it's not a "real" console
- Required library: `pywinpty`

### 2.3 Line Endings

| Platform | Line Ending | Notes |
|----------|-------------|-------|
| Windows PowerShell | `\r\n` (CRLF) | Required for reliable Enter simulation |
| Unix shells | `\n` (LF) | Standard newline |

**Rule:** Always use `\r\n` for Windows PTY operations.

---

## 3. Sentinel Pattern

The sentinel pattern provides reliable command completion detection.

### 3.1 Specification

```
command; echo __KR_DONE_<unique_id>__\r\n
```

Where:
- `command` = The actual command to execute
- `__KR_DONE_` = Fixed prefix for pattern matching
- `<unique_id>` = 8-character hex UUID (e.g., `a1b2c3d4`)
- `__` = Fixed suffix

### 3.2 Algorithm

```python
def run_command(session_id: str, command: str, timeout_ms: int = 30000) -> str:
    # 1. Generate unique sentinel
    sentinel = f"__KR_DONE_{uuid.uuid4().hex[:8]}__"

    # 2. Build full command with sentinel
    full_cmd = f"{command}; echo {sentinel}\r\n"

    # 3. Write to PTY
    write(session_id, full_cmd)

    # 4. Read until sentinel appears
    output = read_until_sentinel(session_id, sentinel, timeout_ms)

    # 5. Strip sentinel from output
    return output.split(sentinel)[0].strip()
```

### 3.3 Read-Until-Sentinel

```python
def read_until_sentinel(session_id: str, sentinel: str, timeout_ms: int) -> str:
    buffer = ""
    start = time.time()

    while True:
        # Check timeout
        elapsed = (time.time() - start) * 1000
        if elapsed > timeout_ms:
            raise TimeoutError(f"Command timed out after {timeout_ms}ms")

        # Read available data
        chunk = read_nonblocking(session_id)
        if chunk:
            buffer += chunk

            # Check for sentinel
            if sentinel in buffer:
                return buffer

        # Small sleep to avoid busy-wait
        time.sleep(0.01)
```

### 3.4 Error Handling

| Condition | Response |
|-----------|----------|
| Timeout (no sentinel) | Return partial output + `TimeoutError` |
| Process exit | Return exit code + any captured output |
| Sentinel malformed | Log warning, retry with fresh sentinel |

---

## 4. PTY Manager Interface

### 4.1 Session Lifecycle

```python
class PTYSession:
    session_id: str          # Unique identifier
    process: PtyProcess      # pywinpty process handle
    shell: str               # e.g., "powershell.exe", "pwsh", "cmd.exe"
    cwd: str                 # Working directory
    cols: int                # Terminal columns (default: 120)
    rows: int                # Terminal rows (default: 30)
    created_at: datetime     # Creation timestamp
    buffer: deque            # Ring buffer for output (max 100KB)
```

### 4.2 Required Operations

| Operation | Signature | Description |
|-----------|-----------|-------------|
| `spawn` | `(shell, cwd, cols, rows) -> PTYSession` | Create new PTY session |
| `write` | `(session_id, data) -> None` | Write bytes/text to PTY input |
| `read` | `(session_id, max_bytes, timeout_ms) -> str` | Read from PTY output |
| `run` | `(session_id, command, sentinel?, timeout_ms) -> str` | Execute command with sentinel |
| `resize` | `(session_id, cols, rows) -> None` | Resize terminal |
| `kill` | `(session_id) -> None` | Terminate PTY session |
| `list` | `() -> List[PTYSession]` | List all active sessions |

### 4.3 Buffer Management

```python
MAX_BUFFER_SIZE = 100 * 1024  # 100KB ring buffer per session

class OutputBuffer:
    def __init__(self, max_size: int = MAX_BUFFER_SIZE):
        self.buffer = deque()
        self.total_size = 0
        self.max_size = max_size

    def append(self, data: str):
        self.buffer.append(data)
        self.total_size += len(data)

        # Trim oldest data if over limit
        while self.total_size > self.max_size and self.buffer:
            removed = self.buffer.popleft()
            self.total_size -= len(removed)
```

---

## 5. Security & Governance

### 5.1 Leader-Only Access

```python
def k_pty(action: str, **kwargs) -> dict:
    # Allow help for all agents
    if action == "help":
        return {"ok": True, "help": PTY_HELP_TEXT}

    # All agents can use k_pty (leader-only restriction removed)
    # Proceed with action
    return dispatch_action(action, **kwargs)
```

### 5.2 Audit Trail

All PTY operations MUST be logged:

```python
@dataclass
class PTYAuditEntry:
    timestamp: datetime
    session_id: str
    action: str
    agent_id: str
    command: str | None
    result_summary: str
    evidence_id: str | None  # Link to inbox evidence pack
```

### 5.3 Evidence Requirement

Per KURORYUU_LAWS: Any changes made via PTY must be recorded as inbox artifacts:

1. Take screenshot before/after (if UI involved)
2. Capture command output
3. Create evidence pack with diffs/logs
4. Attach to relevant inbox thread

---

## 6. Integration Points

### 6.1 With k_inbox

```
Leader Flow:
1. k_inbox(action="list") -> see stuck worker
2. k_pty(action="read", session_id=X) -> observe what's happening
3. k_pty(action="talk", session_id=X, command="git status") -> verify state
4. k_inbox(action="send", ...) -> create unblock task or evidence
```

### 6.2 With sots_capture

```
Screenshot Integration:
1. k_pty(action="read", session_id=X) -> suspect UI issue
2. sots_capture(action="screenshot") -> capture current state
3. Attach screenshot_id to inbox evidence pack
```

---

## 7. Error Codes

| Code | Meaning |
|------|---------|
| `PTY_SESSION_NOT_FOUND` | Invalid session_id |
| `PTY_SPAWN_FAILED` | Failed to create PTY (check shell path) |
| `PTY_TIMEOUT` | Command exceeded timeout_ms |
| `PTY_PROCESS_EXITED` | PTY process terminated unexpectedly |
| `PTY_WRITE_FAILED` | Failed to write to PTY input |
| `PTY_READ_FAILED` | Failed to read from PTY output |
| `PTY_ACCESS_DENIED` | PTY operation failed (deprecated: PTY open to all agents) |

---

## 8. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `pywinpty` | >= 2.0.0 | Windows PTY support via ConPTY |

### Installation

```bash
pip install pywinpty
```

### Requirements

- Windows 10 build 1809+ (for ConPTY support)
- Python 3.9+

---

## 9. References

- [Microsoft ConPTY Documentation](https://devblogs.microsoft.com/commandline/windows-command-line-introducing-the-windows-pseudo-console-conpty/)
- [pywinpty GitHub](https://github.com/spyder-ide/pywinpty)
- Kuroryuu inbox-first architecture: `KURORYUU_LEADER.md`
