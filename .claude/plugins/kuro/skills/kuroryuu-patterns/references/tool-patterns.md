# Kuroryuu MCP Tool Patterns

Detailed usage patterns for each Kuroryuu MCP tool.

## k_session - Session Management

### Start Session
```python
k_session(
    action="start",
    process_id="claude_code",      # Process identifier
    agent_type="claude"            # Agent type
)
# Returns: { "ok": true, "session_id": "sess_...", "agent_id": "agent_..." }
```

### Check Status
```python
k_session(action="status")
# Returns: { "ok": true, "session_id": "...", "started_at": "...", "uptime": "..." }
```

### End Session
```python
k_session(action="end")
# Returns: { "ok": true, "message": "Session ended" }
```

## k_checkpoint - State Persistence

### Save Checkpoint
```python
k_checkpoint(
    action="save",
    name="session",                # Checkpoint namespace
    payload={                      # Arbitrary JSON payload
        "description": "Work description",
        "context_summary": "What was accomplished",
        "files_modified": ["file1.py", "file2.ts"],
        "next_steps": ["Step 1", "Step 2"]
    }
)
# Returns: { "ok": true, "checkpoint_id": "cp_20260112_143000" }
```

### Load Checkpoint
```python
k_checkpoint(
    action="load",
    name="session",
    checkpoint_id="latest"         # or specific ID like "cp_20260112_143000"
)
# Returns: { "ok": true, "payload": {...}, "created_at": "..." }
```

### List Checkpoints
```python
k_checkpoint(
    action="list",
    name="session",
    limit=10                       # Number of recent checkpoints
)
# Returns: { "ok": true, "checkpoints": [...] }
```

## k_inbox - Message Queue

### Send Message
```python
k_inbox(
    action="send",
    to="worker-1",                 # Agent ID or role
    subject="Task title",
    body="Detailed task description",
    priority="normal"              # normal, high, low
)
# Returns: { "ok": true, "message_id": "msg_..." }
```

### List Messages
```python
k_inbox(
    action="list",
    filter="to:me,status:new"      # Filter expression
)
# Returns: { "ok": true, "messages": [...] }
```

### Read Message
```python
k_inbox(
    action="read",
    message_id="msg_12345"
)
# Returns: { "ok": true, "message": {...} }
```

### Claim Message
```python
k_inbox(
    action="claim",
    message_id="msg_12345"
)
# Returns: { "ok": true, "claimed": true }
```

### Complete Message
```python
k_inbox(
    action="complete",
    message_id="msg_12345"
)
# Returns: { "ok": true, "completed": true }
```

## k_msg — Simplified Inter-Agent Messaging

Wraps k_inbox with a streamlined API. Use k_msg for common messaging; use k_inbox for advanced operations (claim, mark_read, stats).

### Send Message
```python
k_msg(action="send", to="worker-1", subject="Review PR", body="Please review PR #42", from_agent="leader")
```

### Check Inbox
```python
k_msg(action="check", agent_id="my-agent-id", limit=10)
```

### Reply
```python
k_msg(action="reply", id="msg-uuid", body="Done!", from_agent="my-agent")
```

### Broadcast
```python
k_msg(action="broadcast", subject="Deploy", body="Deploying to staging", from_agent="leader")
```

### List Agents
```python
k_msg(action="list_agents")  # Discovers registered agents via Gateway
```

## k_rag - Semantic Search

### Search
```python
k_rag(
    action="search",
    query="authentication flow",
    top_k=5,                       # Number of results
    filters={                      # Optional filters
        "path": "src/",
        "file_type": "py"
    }
)
# Returns: { "ok": true, "results": [
#   { "file": "...", "score": 0.95, "content": "...", "line": 42 }
# ]}
```

### Index Files
```python
k_rag(
    action="index",
    paths=["src/", "apps/"]        # Paths to index
)
# Returns: { "ok": true, "indexed_files": 150 }
```

## k_memory - Working Memory

### Write
```python
k_memory(
    action="write",
    key="current_task",
    value="Implementing user authentication"
)
# Returns: { "ok": true, "key": "current_task" }
```

### Read
```python
k_memory(
    action="read",
    key="current_task"
)
# Returns: { "ok": true, "value": "Implementing user authentication" }
```

### List Keys
```python
k_memory(action="list")
# Returns: { "ok": true, "keys": ["current_task", "blockers", ...] }
```

## k_pty - PTY Control (All Agents)

### Spawn CLI
```python
k_pty(
    action="spawn_cli",
    cli_provider="claude",         # claude, kiro, kuroryuu, shell
    role="worker",                 # leader, worker
    cwd="<PROJECT_ROOT>"
)
# Returns: { "ok": true, "session_id": "pty_...", "cli_provider": "claude" }
```

### Send Line
```python
k_pty(
    action="send_line",
    session_id="pty_...",
    data="Implement feature X"
)
# Returns: { "ok": true, "typed": {...}, "enter": {...} }
```

### Talk (Send with Sentinel)
```python
k_pty(
    action="talk",
    session_id="pty_...",
    command="What is your status?",
    timeout_ms=30000
)
# Returns: { "ok": true, "output": "..." }
```

### List Sessions
```python
k_pty(action="list")
# Returns: { "ok": true, "sessions": [...], "count": 3 }
```

### Kill Session
```python
k_pty(
    action="kill",
    session_id="pty_..."
)
# Returns: { "ok": true, "killed": true }
```

## Error Handling

All tools return consistent error format:
```python
{
    "ok": false,
    "error_code": "MISSING_PARAM",
    "message": "session_id is required",
    "details": {}
}
```

Common error codes:
- `MISSING_PARAM` - Required parameter missing
- `INVALID_PARAM` - Invalid parameter value
- `NOT_FOUND` - Resource not found
- `PTY_ACCESS_DENIED` - PTY operation failed (deprecated: PTY now open to all agents)
- `SESSION_NOT_FOUND` - Session does not exist
- `DANGEROUS_COMMAND_BLOCKED` - Command blocked by safety filter

## Best Practices

1. **Always check `ok` field** before processing response
2. **Use descriptive payloads** in checkpoints for easy restoration
3. **Claim before working** on inbox messages to prevent duplicates
4. **Report progress** regularly with promise protocol
5. **Handle errors gracefully** with fallback behavior
