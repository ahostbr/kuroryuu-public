---
description: Start Kuroryuu session and register agent
argument-hint: [role]
allowed-tools: Read, Bash, WebFetch
---

Start a Kuroryuu session for the current Claude Code instance.

## Steps

1. **Determine role** from argument or ask:
   - If `$ARGUMENTS` is "leader" or "worker", use that role
   - If empty, default to "worker" role

2. **Read bootstrap file**:
   - Leader: Read `KURORYUU_LEADER.md` from project root
   - Worker: Read `KURORYUU_WORKER.md` from project root

3. **Call k_session MCP tool**:
   ```
   k_session(action="start", process_id="claude_code", agent_type="claude")
   ```

4. **Register with Gateway**:
   - POST to `http://127.0.0.1:8200/v1/agents/register`
   - Body: `{ "role": "<leader|worker>", "agent_id": "<from session>" }`

5. **Set environment awareness**:
   - Note the session_id returned
   - Note the agent role

6. **Confirm startup**:
   Output: `KURORYUU-aware. Role: {role}. Session: {session_id}. Ready.`

## MCP Alternative

If Gateway is unavailable, use MCP tools directly:
- `k_session(action="start", ...)` for session
- `k_memory(action="write", ...)` to store role

## Fallback

If MCP tools unavailable, inform user to check:
- Is `run_all.ps1` running?
- Is MCP server connected? (`claude mcp list`)
