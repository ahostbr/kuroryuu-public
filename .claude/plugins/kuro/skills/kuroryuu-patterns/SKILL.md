---
name: Kuroryuu Patterns
description: This skill should be used when the user asks about "Kuroryuu bootstrap", "multi-agent coordination", "leader worker pattern", "promise protocol", "k_ tools", "session start", "checkpoint save", "inbox messages", "RAG search", "how does Kuroryuu work", "Kuroryuu architecture", or needs guidance on Kuroryuu multi-agent orchestration patterns and workflows.
version: 1.0.0
---

# Kuroryuu Multi-Agent Orchestration Patterns

Kuroryuu is a multi-agent orchestration system enabling Claude Code instances to coordinate as leaders and workers. This skill provides comprehensive guidance on patterns, protocols, and common workflows.

## Quick Reference Index

### Bootstrap Questions

| Question | Answer Location |
|----------|-----------------|
| How do I start a session? | `KURORYUU_BOOTSTRAP.md` → Session Start section |
| What's the difference between leader/worker? | `KURORYUU_LEADER.md` vs `KURORYUU_WORKER.md` |
| How do I become a leader? | Run `/k-leader` or read `KURORYUU_LEADER.md` |
| How do I become a worker? | Run `/k-worker` or read `KURORYUU_WORKER.md` |
| What's the PRD-first workflow? | `KURORYUU_LEADER.md` → PRD-First Workflow section |
| How do I save my progress? | Run `/k-save` or use `k_checkpoint(action="save")` |
| How do I restore a checkpoint? | Run `/k-load` or use `k_checkpoint(action="load")` |

### MCP Tools Quick Reference

| Tool | Purpose | Primary Actions |
|------|---------|-----------------|
| `k_session` | Session lifecycle | start, status, end |
| `k_checkpoint` | State persistence | save, load, list |
| `k_inbox` | Message queue | send, list, read, claim, complete |
| `k_rag` | Semantic search | search, index |
| `k_memory` | Working memory | write, read, list |
| `k_pty` | PTY control (all agents) | spawn_cli, talk, send_line |
| `k_files` | File operations | read, write, list |

### Architecture Documents

| Document | Location | Purpose |
|----------|----------|---------|
| Bootstrap | `KURORYUU_BOOTSTRAP.md` | Session start procedure |
| Leader Protocol | `KURORYUU_LEADER.md` | Leader responsibilities |
| Worker Protocol | `KURORYUU_WORKER.md` | Worker responsibilities |
| Laws | `KURORYUU_LAWS.md` | Operational rules |
| Laws Index | `KURORYUU_LAWS_INDEX.md` | Quick law lookup |
| Architecture | `Docs/Plans/LEADER_FOLLOWER_ARCHITECTURE.md` | System design |

## Core Concepts

### Role Hierarchy

```
HUMAN
  │ (asks questions, approves plans)
  ▼
LEADER (one per orchestration)
  │ (delegates tasks, asks humans)
  ▼
WORKERS (many)
  │ (execute tasks, report progress)
```

**Key Principle**: Workers NEVER ask humans directly. All human interaction flows through the leader.

### Session Lifecycle

```
1. Agent starts → Read KURORYUU_BOOTSTRAP.md
2. Determine role → Read KURORYUU_LEADER.md or KURORYUU_WORKER.md
3. Call k_session(action="start") → Get session_id
4. Register with Gateway → POST /v1/agents/register
5. Work loop → Execute tasks based on role
6. Save checkpoint → k_checkpoint(action="save")
7. End session → k_session(action="end")
```

### Promise Protocol

Workers communicate status to leaders using promise tags:

| Promise Tag | Meaning | Leader Action |
|-------------|---------|---------------|
| `<promise>DONE</promise>` | Task complete | Check if all done → finalize |
| `<promise>PROGRESS:N%</promise>` | Partial progress | Wait for more iterations |
| `<promise>BLOCKED:reason</promise>` | External blocker | Investigate, clarify |
| `<promise>STUCK:reason</promise>` | Can't proceed | Send hint via leader_nudge.md |

## Common Workflows

### Starting a New Session

1. Read bootstrap: `KURORYUU_BOOTSTRAP.md`
2. Determine role (first agent = leader, others = workers)
3. Start session:
   ```
   k_session(action="start", process_id="claude_code", agent_type="claude")
   ```
4. Register role:
   ```
   POST http://127.0.0.1:8200/v1/agents/register
   { "role": "leader", "agent_id": "<session_agent_id>" }
   ```
5. Confirm: `KURORYUU-aware. Role: leader. Session: <id>. Ready.`

### Saving Work (Checkpoint)

1. Gather context summary
2. Save checkpoint:
   ```
   k_checkpoint(
     action="save",
     name="session",
     payload={
       "description": "Work description",
       "context_summary": "What was accomplished"
     }
   )
   ```
3. Optionally write worklog to `Docs/worklogs/`

### Sending Tasks (Leader → Worker)

1. Create task via inbox:
   ```
   k_inbox(
     action="send",
     to="worker-1",
     subject="Implement feature X",
     body="Details of what to implement..."
   )
   ```
2. Monitor for promise responses
3. If worker stuck, send hint

### Receiving Tasks (Worker)

1. Poll inbox:
   ```
   k_inbox(action="list", filter="to:me,status:new")
   ```
2. Claim task:
   ```
   k_inbox(action="claim", message_id="<id>")
   ```
3. Execute task
4. Report progress: `<promise>PROGRESS:50%</promise>`
5. Complete:
   ```
   k_inbox(action="complete", message_id="<id>")
   ```
6. Report done: `<promise>DONE</promise>`

### Searching Codebase (RAG)

1. Query RAG index:
   ```
   k_rag(action="search", query="authentication flow", top_k=5)
   ```
2. Review results with source files and snippets
3. Read relevant files for full context

## Leader-Only Operations

These operations require leader role:

### PTY Control

Spawn and control worker CLIs:
```
k_pty(action="spawn_cli", cli_provider="claude", role="worker")
k_pty(action="talk", session_id="<id>", command="Implement feature X")
```

### Task Orchestration

Create and manage tasks:
```
POST /v1/orchestration/tasks { "title": "...", "subtasks": [...] }
POST /v1/orchestration/subtasks/<id>/hint { "hint": "Try approach X" }
```

## Prompt Files Reference

Leader prompts in `ai/prompts/leader/`:

| Prompt | Purpose |
|--------|---------|
| `leader_prime.md` | Load context, check PRD |
| `leader_plan_feature.md` | Create implementation plan |
| `leader_breakdown.md` | Convert plan to subtasks |
| `leader_nudge.md` | Help stuck workers |
| `leader_finalize.md` | Complete task, trigger reviews |
| `leader_escalate.md` | Escalate to human |
| `leader_pty_module.md` | PTY control patterns |

Worker prompts in `ai/prompts/worker/`:

| Prompt | Purpose |
|--------|---------|
| `worker_execute.md` | Execute assigned task |
| `worker_report.md` | Report progress |

## Context Management

### 80% Threshold Rule

At 80% context usage (20% remaining):
1. Check `ai/context_check.png` for context percentage
2. Run `/k-save` immediately
3. Consider ending session

### Automatic Checkpoints

Save checkpoints:
- Every ~50 tool calls
- Before ending session
- When switching major tasks
- Before complex operations

## Troubleshooting

### MCP Tools Unavailable

1. Check stack: `.\run_all.ps1`
2. Verify MCP: `claude mcp list`
3. Restart MCP server if needed

### Gateway Unavailable

1. Check Gateway: `http://127.0.0.1:8200/v1/health`
2. Start stack: `.\run_all.ps1`
3. Use MCP tools directly as fallback

### Session Lost

1. List checkpoints: `k_checkpoint(action="list")`
2. Load latest: `k_checkpoint(action="load", checkpoint_id="latest")`
3. Resume from checkpoint context

## Additional Resources

For detailed patterns and advanced techniques:
- **`references/tool-patterns.md`** - Detailed MCP tool usage patterns
- **`references/orchestration-patterns.md`** - Multi-agent coordination patterns

For working examples:
- `<PROJECT_ROOT>\.claude\agents\` - Agent definitions
- `<PROJECT_ROOT>\ai\prompts\` - Prompt templates
- `<PROJECT_ROOT>\apps\mcp_core\tools_*.py` - MCP tool implementations
