# k_pty MCP Tool Overview

The `k_pty` tool provides pseudo-terminal (PTY) control for all agents in the Kuroryuu multi-agent system. It enables agents to create, read from, and write to terminal sessions, supporting both local PTYs (via pywinpty on Windows) and remote desktop sessions (via HTTP bridge to Electron's xterm.js). The tool includes built-in security features: dangerous command blocking (prevents `rm -rf /`, fork bombs, credential access, reverse shells), secret redaction in terminal output, and traffic event emission for visualization in the Desktop UI.

## Key Actions

| Action | Description |
|--------|-------------|
| `list` | List all active PTY sessions (local + desktop) |
| `create` | Spawn a new PTY session with specified shell, cwd, cols, rows |
| `send_line` | Type a single line then press Enter (strips embedded newlines) |
| `talk` | Execute command with sentinel pattern for response capture |
| `term_read` | Read xterm.js buffer text (modes: `tail`, `viewport`, `delta`) |
| `read` | Read raw bytes from PTY output |
| `resolve` | Map agent_id/label to PTY session_id (targeted routing) |
| `send_line_to_agent` | Convenience wrapper: resolve + send_line |

## Usage Examples

```python
# List all PTY sessions
k_pty(action="list")

# Send a command to a specific terminal
k_pty(action="send_line", session_id="abc123", data="git status")

# Execute command and capture output with sentinel
k_pty(action="talk", session_id="abc123", command="npm test", timeout_ms=60000)

# Read last 20 lines from terminal buffer
k_pty(action="term_read", session_id="abc123", mode="tail", max_lines=20)

# Target PTY by agent identity instead of session_id
k_pty(action="send_line_to_agent", agent_id="worker_001", data="echo hello")
```

Configuration: Set `KURORYUU_TERM_BUFFER_ACCESS=on` (default) to enable terminal buffer reading. The `write` action is deprecated; use `send_line` or `talk` instead.
