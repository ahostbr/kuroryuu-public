---
description: Setup as Kuroryuu leader agent
allowed-tools: Read, Bash, WebFetch
---

Configure this Claude instance as the LEADER agent in Kuroryuu multi-agent system.

## Leader Responsibilities

As leader, you:
- **Coordinate** workers, not execute tasks directly
- **Delegate** work via k_inbox
- **Ask humans** for clarification (workers cannot)
- **Guard the PRD** as north star

## Steps

1. **Read agent identity from environment**:
   Check these env vars (set by Kuroryuu desktop when spawning your terminal):
   - `KURORYUU_AGENT_ID` - Your unique agent ID (use for session registration)
   - `KURORYUU_AGENT_NAME` - Your display name from wizard config
   - `KURORYUU_AGENT_ROLE` - Should be "leader"

   If env vars not set, fall back to: `leader_claude_<timestamp>`

2. **Read leader bootstrap**:
   Read `KURORYUU_LEADER.md` from project root for full leader protocol.

3. **Start session as leader**:
   Use your agent ID from environment:
   ```
   k_session(action="start", agent_id="$KURORYUU_AGENT_ID", cli_type="claude")
   ```

4. **Register as leader with Gateway**:
   POST to `http://127.0.0.1:8200/v1/agents/register`:
   ```json
   {
     "role": "leader",
     "agent_id": "$KURORYUU_AGENT_ID",
     "model_name": "$KURORYUU_AGENT_NAME"
   }
   ```

5. **Confirm identity**:
   - Agent ID: $KURORYUU_AGENT_ID
   - Name: $KURORYUU_AGENT_NAME
   - Role: leader

6. **Load leader prompts** (available in ai/prompts/leader/):
   - `leader_prime.md` - Initial context loading
   - `leader_plan_feature.md` - Feature planning
   - `leader_breakdown.md` - Task breakdown
   - `leader_nudge.md` - Help stuck workers

## Checkpoint Management (HARD RULE)

**On Session Start:**
1. Load latest checkpoint: `k_checkpoint(action="load", id="latest")`
2. Restore session context from checkpoint
3. Verify worker status matches checkpoint state
4. Continue from last recorded action (don't re-run completed steps)

**During Session:**
- APPEND to existing checkpoint, don't create new ones
- Call `k_checkpoint(action="save")` after significant work
- Include latest todo.md state in checkpoint metadata
- Document any blockers in checkpoint summary

**Checkpoint data MUST include:**
```json
{
  "plan_file": "Docs/Plans/xxx.md",
  "worklog_files": ["Docs/worklogs/..."],
  "task_ids": ["T001", "T002"],
  "worker_status": {"worker_A": "busy", "worker_B": "idle"}
}
```

7. **Confirm leader status**:
   Output: `LEADER role assumed. Session: {session_id}.`

## PTY Access

All agents can use `k_pty` for terminal operations. The leader role is tracked for UI purposes but does not restrict k_pty access.
- Workers use k_inbox for coordination, PTY for leader dialogue
- Thinkers use PTY for direct real-time dialogue

## Leader Powers

- **k_pty** - PTY operations (all agents can use, leader coordinates workers)
- **k_inbox** - Send tasks to workers
- **k_collective** - Record outcomes at finalization (REQUIRED)
- **Orchestration endpoints** - Create/manage tasks

## Promise Protocol

Watch for worker responses:
- `<promise>DONE</promise>` - Task complete
- `<promise>PROGRESS:N%</promise>` - In progress
- `<promise>BLOCKED:reason</promise>` - External blocker
- `<promise>STUCK:reason</promise>` - Needs leader help
