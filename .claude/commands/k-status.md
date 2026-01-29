---
description: Show Kuroryuu session status
allowed-tools: Read, Bash, WebFetch
---

Display comprehensive Kuroryuu session status.

## Steps

1. **Get session info**:
   ```
   k_session(action="status")
   ```

2. **Get agent registry**:
   GET `http://127.0.0.1:8200/v1/agents`

3. **Get inbox status**:
   ```
   k_inbox(action="list", filter="status:new")
   ```

4. **Check checkpoint info**:
   ```
   k_checkpoint(action="list", name="session", limit=1)
   ```

5. **Display status report**:

```
=== KURORYUU STATUS ===

Session:
  ID: {session_id}
  Role: {leader|worker}
  Started: {timestamp}
  Uptime: {duration}

Agents Online:
  Leader: {leader_id or "None"}
  Workers: {count} active
    - {worker_1_id}
    - {worker_2_id}

Inbox:
  New messages: {count}
  Claimed: {count}

Last Checkpoint:
  ID: {checkpoint_id}
  Time: {timestamp}
  Description: {description}

Services:
  MCP Core: {status}
  Gateway: {status}
  Desktop: {status}
```

## Gateway Alternative

GET `http://127.0.0.1:8200/v1/status` for combined status.

## Quick Checks

- `/k-status` - Full status report
- Check specific: Use individual k_* tools

## Troubleshooting

If services unavailable:
1. Run `.\run_all.ps1` to start stack
2. Check `claude mcp list` for MCP connection
3. Verify Gateway at http://127.0.0.1:8200/health
