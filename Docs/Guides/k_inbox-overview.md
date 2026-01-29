# k_inbox MCP Tool

The `k_inbox` tool provides a **Maildir-style message queue** for asynchronous agent-to-agent communication in the Kuroryuu multi-agent system. It implements a file-based message store with folders (`new/`, `cur/`, `done/`, `dead/`) that enables reliable task distribution, status tracking, and workflow coordination between leader and worker agents. Messages follow either v1 (simple payload) or v2 (structured agent messaging) schemas, with JSON indexes for fast queries and optional WebSocket push notifications when the Gateway is available.

## Key Actions

| Action | Purpose | Key Parameters |
|--------|---------|----------------|
| `send` | Create and queue a new message | `payload` (v1) or `from_agent`, `to_agent`, `subject`, `body` (v2), `priority`, `message_type` |
| `list` | List messages in a folder | `folder` (new/cur/done/dead), `limit`, `include_payload` |
| `read` | Retrieve a specific message | `id` (required), `folder` (optional search hint) |
| `claim` | Take ownership of a message (new → cur) | `id` (optional, FIFO if omitted) |
| `complete` | Finish a claimed message (cur → done/dead) | `id` (required), `status` (done/dead), `note` |
| `mark_read` | Mark a message as read by an agent | `id`, `agent_id` |
| `stats` | Get inbox statistics | None |
| `help` | Show available actions | None |

## Usage Examples

**Send a task to a worker:**
```python
kuroryuu_inbox_send({
    "action": "send",
    "from_agent": "leader",
    "to_agent": "worker_001",
    "subject": "Fix API bug",
    "body": "Resolve issue T104 in pty_registry.py",
    "priority": "high",
    "message_type": "task"
})
```

**Poll for new tasks:**
```python
kuroryuu_inbox_list({
    "action": "list",
    "folder": "new",
    "limit": 10
})
```

**Claim and complete a task:**
```python
# Claim oldest available message
kuroryuu_inbox_claim({"action": "claim"})

# Complete with result
kuroryuu_inbox_complete({
    "action": "complete",
    "id": "msg_uuid_here",
    "status": "done",
    "note": "Fixed import error, tests passing"
})
```

**Check inbox health:**
```python
kuroryuu_inbox_list({"action": "stats"})
```

---

*Source: `apps/mcp_core/tools_inbox.py`*  
*Folders: `ai/inbox/` (default) or `WORKING/inbox/`*
