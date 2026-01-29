# Kuroryuu Leader-Follower Architecture

> **Target Audience**: AI Agents (Claude, Kiro, Copilot, Devstral, etc.)
> **Version**: 1.0.0
> **Last Updated**: 2026-01-08

---

## 1. OVERVIEW

Kuroryuu implements a **leader-follower multi-agent orchestration system** where:

- **ONE Leader** coordinates the entire workflow
- **Multiple Workers** execute subtasks in parallel
- **Human-in-the-Loop** allows the leader to pause for user input

```
┌─────────────────────────────────────────────────────────────────┐
│                     KURORYUU ORCHESTRATION                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   USER REQUEST                                                  │
│        │                                                        │
│        ▼                                                        │
│   ┌─────────┐                                                   │
│   │ LEADER  │ ◄─── Creates tasks, breaks down, monitors        │
│   │ (Claude)│                                                   │
│   └────┬────┘                                                   │
│        │                                                        │
│        │ Subtask Assignment                                     │
│        ▼                                                        │
│   ┌─────────────────────────────────────────────────┐          │
│   │              WORKER POOL                         │          │
│   │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │          │
│   │  │ Worker1 │  │ Worker2 │  │ Worker3 │         │          │
│   │  │(Devstral)│  │ (Kiro)  │  │(Copilot)│         │          │
│   │  └────┬────┘  └────┬────┘  └────┬────┘         │          │
│   │       │            │            │               │          │
│   │       └────────────┴────────────┘               │          │
│   │                    │                            │          │
│   └────────────────────┼────────────────────────────┘          │
│                        │                                        │
│                        ▼                                        │
│                  RESULTS → Leader → Final Output                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 Communication Flow

```
┌─────────────────────────────────────────────────────────┐
│                 COMMUNICATION FLOW                       │
│                                                         │
│  LEADER ──────────────────────────────────────► WORKER  │
│         │                                               │
│         ├─► [PRIMARY] k_pty(send_line) - Direct        │
│         │   Leader reads screen, writes to terminal     │
│         │                                               │
│         └─► [FALLBACK] k_inbox(send) - Async           │
│             When PTY unavailable or batch tasks         │
│                                                         │
│  WORKER ──────────────────────────────────────► LEADER  │
│         │                                               │
│         └─► [ALWAYS] k_inbox(send) - Async             │
│             Workers CANNOT write to leader terminal     │
│             Use promises: DONE, PROGRESS, STUCK, BLOCKED│
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key Principle:** Leader reads worker screens and writes directly to their terminals. Workers reply via inbox.

---

## 2. AGENT ROLES

### 2.1 Leader Agent

**Identity**: The FIRST agent to register with `role=leader` becomes the leader.

**Responsibilities**:
1. **Task Creation**: Convert user requests into structured Tasks
2. **Task Breakdown**: Analyze tasks and create SubTasks
3. **Assignment**: Make subtasks available for workers
4. **Monitoring**: Track subtask completion status
5. **Human-in-the-Loop**: Pause for clarification when needed
6. **Aggregation**: Combine results into final output
7. **Finalization**: Mark tasks complete

**Exclusive Capabilities**:
- Call `ask_user()` - Request clarification
- Call `request_approval()` - Get approval for risky actions
- Call `present_plan()` - Present plan for review
- Reassign failed subtasks
- Cancel tasks

### 2.2 Worker Agent

**Identity**: Any agent that registers with `role=worker` or when leader slot is taken.

**Responsibilities**:
1. **Poll**: Check for available subtasks
2. **Claim**: Exclusively claim a subtask
3. **Execute**: Perform the assigned work
4. **Report**: Return success/failure with result
5. **Release**: Release subtask if unable to complete

**Restrictions**:
- CANNOT call human-in-the-loop tools
- CANNOT create or breakdown tasks
- CANNOT reassign or cancel
- If needs human input → return "needs_clarification" to leader

---

## 3. DATA MODELS

### 3.1 Agent Registration

```
Agent {
  agent_id: string       // e.g., "claude_20260108_143022_a1b2c3d4"
  model_name: string     // "claude", "devstral", "kiro", etc.
  role: LEADER | WORKER
  status: IDLE | BUSY | DEAD
  capabilities: string[] // ["code", "review", "plan"]
  last_heartbeat: datetime
  registered_at: datetime
}
```

**Leader Election**: First-to-claim wins. Only ONE leader at a time.

### 3.2 Task Lifecycle

```
TaskStatus:
  PENDING        → Created, waiting for breakdown
  BREAKING_DOWN  → Leader analyzing
  ASSIGNED       → Subtasks ready for workers
  IN_PROGRESS    → Workers executing
  COMPLETED      → All subtasks done successfully
  FAILED         → One or more subtasks failed
  CANCELLED      → Manually cancelled
```

### 3.3 Task Structure

```
Task {
  task_id: string
  title: string
  description: string
  status: TaskStatus
  priority: 1-10

  subtasks: SubTask[]
  leader_id: string

  created_at: datetime
  started_at: datetime
  completed_at: datetime

  final_result: string
  error: string
}

SubTask {
  subtask_id: string
  title: string
  description: string
  assigned_to: string  // Worker agent_id
  status: TaskStatus
  result: string

  created_at: datetime
  started_at: datetime
  completed_at: datetime
}
```

---

## 4. API ENDPOINTS

### 4.1 Agent Registry (`/v1/agents/*`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/agents/register` | POST | Register as leader or worker |
| `/v1/agents/heartbeat` | POST | Keep agent alive (1s timeout) |
| `/v1/agents/deregister` | POST | Remove from registry |
| `/v1/agents` | GET | List all agents |
| `/v1/agents/leader` | GET | Get current leader |
| `/v1/agents/stats` | GET | Registry statistics |

### 4.2 Orchestration (`/v1/orchestration/*`)

**Task Management (Leader)**:
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/orchestration/tasks` | POST | Create a task |
| `/v1/orchestration/tasks/{id}/breakdown` | POST | Break into subtasks |
| `/v1/orchestration/tasks` | GET | List all tasks |
| `/v1/orchestration/tasks/{id}` | GET | Get task details |
| `/v1/orchestration/finalize` | POST | Finalize completed task |
| `/v1/orchestration/cancel` | POST | Cancel a task |
| `/v1/orchestration/reassign` | POST | Reassign failed subtask |

**Worker Operations**:
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/orchestration/poll` | POST | Poll for available work |
| `/v1/orchestration/claim` | POST | Claim a subtask |
| `/v1/orchestration/start` | POST | Mark work started |
| `/v1/orchestration/result` | POST | Report completion |
| `/v1/orchestration/release` | POST | Release subtask |

### 4.3 Human-in-the-Loop (`/v2/chat/*`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v2/chat/stream` | POST | Main chat endpoint (SSE) |
| `/v2/chat/clarify` | POST | Submit user response to interrupt |
| `/v2/chat/interrupts/{thread_id}` | GET | List pending interrupts |

---

## 5. LEADER WORKFLOW

### 5.1 Session Start

```
1. Register as leader:
   POST /v1/agents/register
   { "model_name": "claude", "role": "leader" }

2. If leader slot taken → registered as worker instead

3. Start heartbeat loop (every 500ms):
   POST /v1/agents/heartbeat
   { "agent_id": "your_id" }
```

### 5.2 Task Processing

```
1. USER REQUEST arrives

2. CREATE TASK:
   POST /v1/orchestration/tasks
   { "title": "...", "description": "...", "priority": 7 }
   → Returns: task_id

3. BREAKDOWN TASK:
   - Analyze requirements
   - Identify subtasks
   POST /v1/orchestration/tasks/{task_id}/breakdown
   { "task_id": "...", "subtasks": [
     { "title": "...", "description": "..." },
     ...
   ]}

4. MONITOR:
   - Poll task status
   - Watch for worker results
   GET /v1/orchestration/tasks/{task_id}

5. HANDLE FAILURES:
   - If subtask failed and should_retry:
     POST /v1/orchestration/reassign
   - If unrecoverable:
     POST /v1/orchestration/cancel

6. FINALIZE:
   - When all subtasks complete:
   POST /v1/orchestration/finalize
   { "task_id": "...", "final_result": "Summary..." }
```

### 5.3 Human-in-the-Loop

**When to use**:
- Ambiguous requirements → `ask_user()`
- Risky action (delete, deploy) → `request_approval()`
- Complex plan → `present_plan()`

**Flow**:
```
1. Leader calls MCP tool (e.g., ask_user)

2. Tool returns: { "pending": true, "prompt_id": "...", "question": "..." }

3. Gateway emits SSE event:
   { "type": "clarification_request", "prompt_id": "...", ... }

4. Gateway returns: stop_reason = "interrupt"

5. UI renders prompt, user responds

6. UI calls: POST /v2/chat/clarify
   { "thread_id": "...", "interrupt_id": "...", "answer": "..." }

7. Leader's next request includes the answer
```

---

## 6. WORKER WORKFLOW

### 6.1 Session Start

```
1. Register as worker:
   POST /v1/agents/register
   { "model_name": "devstral", "role": "worker", "capabilities": ["code"] }

2. Start heartbeat loop (every 500ms)
```

### 6.2 Work Loop

```
LOOP:
  1. POLL for work:
     POST /v1/orchestration/poll
     { "agent_id": "...", "capabilities": ["code"], "max_tasks": 1 }

  2. If no work → sleep 2s → continue

  3. CLAIM subtask:
     POST /v1/orchestration/claim
     { "agent_id": "...", "task_id": "...", "subtask_id": "..." }

  4. If claim failed → continue (another worker got it)

  5. START work:
     POST /v1/orchestration/start
     { "agent_id": "...", "task_id": "...", "subtask_id": "..." }

  6. EXECUTE the subtask:
     - Read files, make changes, run tests, etc.
     - Use MCP tools as needed

  7. REPORT result:
     POST /v1/orchestration/result
     {
       "agent_id": "...",
       "task_id": "...",
       "subtask_id": "...",
       "success": true,
       "result": "Completed: ..."
     }

  8. Continue loop
```

### 6.3 Error Handling

```
If execution fails:
  POST /v1/orchestration/result
  { "success": false, "error": "Reason..." }

If cannot complete (blocked):
  POST /v1/orchestration/release
  { "reason": "Need human clarification" }
  → Leader will see this and use ask_user()
```

---

## 7. SINGLE-AGENT MODE

For context-limited models (LMStudio/Devstral), use SingleAgentMode:

```
1. Leader assigns task:
   POST /v1/orchestration/single-agent/assign
   { "agent_id": "devstral_...", "task_id": "..." }

2. Agent executes ONE subtask per "reboot":
   POST /v1/orchestration/single-agent/execute
   { "agent_id": "..." }
   → Returns context prompt + subtask

3. Agent executes, reports result via normal /result endpoint

4. Agent "reboots" (clears context)

5. Loop to step 2 until all subtasks done
```

**Context Compression**: Between reboots, a summary of completed work is injected to maintain coherence.

---

## 8. RECOVERY SYSTEM

### 8.1 Pause/Resume

```
# Pause a task (e.g., for user review)
POST /v1/orchestration/recovery/pause
{ "task_id": "...", "reason": "user_request" }

# Resume
POST /v1/orchestration/recovery/resume
{ "task_id": "..." }
```

### 8.2 Checkpoints

```
# Create checkpoint before risky operation
POST /v1/orchestration/recovery/checkpoint
{ "task_id": "...", "reason": "Before deployment" }

# Restore if something goes wrong
POST /v1/orchestration/recovery/restore
{ "task_id": "...", "checkpoint_id": "..." }
```

### 8.3 Graceful Shutdown

```
# Prepare for shutdown (pauses all, creates checkpoints)
POST /v1/orchestration/recovery/shutdown

# Recover after restart
POST /v1/orchestration/recovery/startup
```

---

## 9. PHASE CONFIGURATION

Different phases have different agent assignments:

| Phase | Role | Default Agent |
|-------|------|---------------|
| PLANNING | Planner | Leader |
| CODING | Coder | Workers |
| REVIEW | Reviewer | Leader or dedicated |
| SINGLE_AGENT | Full task | Single worker |
| DIRECT | Passthrough | No orchestration |

```
# Assign agent to phase
POST /v1/orchestration/phase-config/{phase}/assign
{ "agent_id": "claude_..." }

# Check configuration status
GET /v1/orchestration/phase-config/status
```

---

## 10. PERSISTENCE

| Data | Location | Format |
|------|----------|--------|
| Agent Registry | `ai/agents_registry.json` | JSON |
| Tasks | `ai/tasks.json` | JSON |
| Sessions | `ai/sessions.json` | JSON |
| Interrupts | `WORKING/interrupts/{thread_id}/` | JSON per interrupt |
| Checkpoints | `ai/checkpoints/` | JSON |
| Swarm Artifacts | `WORKING/swarms/{swarm_id}/` | Various |

---

## 11. MCP TOOLS FOR AGENTS

### 11.1 Session Management

| Tool | Purpose |
|------|---------|
| `kuroryuu_session_start` | Register session, get context |
| `kuroryuu_session_end` | End session, log summary |
| `kuroryuu_get_context` | Get todo.md context block |

### 11.2 Hook Tools

| Tool | Purpose |
|------|---------|
| `kuroryuu_pre_tool` | Check before tool execution |
| `kuroryuu_post_tool` | Track tool result |
| `kuroryuu_log_progress` | Append to progress.md |

### 11.3 Human-in-the-Loop (Leader Only)

| Tool | Purpose |
|------|---------|
| `ask_user` | Request clarification |
| `request_approval` | Get approval for action |
| `present_plan` | Present plan for review |

---

## 12. KEY DESIGN PATTERNS

### 12.1 Leader-Only Human Input

Workers NEVER block on human input. If a worker needs clarification:
1. Worker returns `{ "needs_clarification": true, "question": "..." }` in result
2. Leader sees this and calls `ask_user()`
3. Leader receives answer and creates new subtask with context

### 12.2 Atomic Claims

Subtask claiming is atomic:
- First worker to claim gets exclusive assignment
- Other workers receive "already assigned" error
- Prevents duplicate work

### 12.3 Heartbeat Liveness

- 1-second heartbeat timeout
- Dead agents automatically reaped
- Dead leader triggers new election

### 12.4 Interrupt Persistence

Interrupts persist to disk:
- Survives process restarts
- Lazy-loaded into memory
- Cleaned up after thread ends

---

## 13. SEQUENCE DIAGRAMS

### 13.1 Full Task Lifecycle

```
User           Leader              Gateway          Workers
 │               │                    │                │
 │──Request─────►│                    │                │
 │               │──Create Task──────►│                │
 │               │◄─────task_id───────│                │
 │               │                    │                │
 │               │──Breakdown────────►│                │
 │               │  (with subtasks)   │                │
 │               │◄────OK─────────────│                │
 │               │                    │                │
 │               │                    │◄───Poll────────│
 │               │                    │────Subtask────►│
 │               │                    │◄───Claim───────│
 │               │                    │────OK─────────►│
 │               │                    │                │
 │               │                    │                │──Execute──
 │               │                    │                │
 │               │                    │◄───Result──────│
 │               │◄──Status Update────│                │
 │               │                    │                │
 │               │──Finalize─────────►│                │
 │◄──Response────│                    │                │
```

### 13.2 Human-in-the-Loop

```
Leader         MCP/Tools         Gateway           UI            User
  │               │                 │               │              │
  │──ask_user()──►│                 │               │              │
  │               │──pending:true──►│               │              │
  │               │                 │──SSE event───►│              │
  │               │                 │               │──Render─────►│
  │               │                 │               │◄──Answer─────│
  │               │                 │◄──POST /clarify──            │
  │               │                 │               │              │
  │◄──Answer available (next request)               │              │
```

---

## 14. ERROR CODES

| Code | Meaning |
|------|---------|
| `leader_exists` | Leader slot already taken |
| `agent_not_found` | Agent ID not in registry |
| `task_not_found` | Task ID not in storage |
| `subtask_not_found` | Subtask ID not in task |
| `subtask_claimed` | Already assigned to another worker |
| `not_assigned` | Subtask not assigned to this agent |
| `invalid_state` | Operation not valid in current state |
| `interrupt_not_found` | Interrupt ID not found |

---

## 15. BEST PRACTICES

### For Leaders

1. **Always breakdown first**: Don't try to do everything yourself
2. **Use human-in-the-loop early**: Better to ask than assume
3. **Monitor actively**: Poll task status regularly
4. **Handle failures gracefully**: Reassign or escalate
5. **Aggregate results**: Combine worker outputs coherently

### For Workers

1. **Claim before executing**: Don't work on unclaimed tasks
2. **Report honestly**: Don't claim success if failed
3. **Release if stuck**: Let another worker try
4. **Stay focused**: Complete one subtask at a time
5. **Escalate to leader**: If needs human input, report it

---

## APPENDIX A: Quick Reference

### Leader Bootstrap Checklist

```
[ ] Read KURORYUU_BOOTSTRAP.md
[ ] Call kuroryuu_session_start()
[ ] Register as leader: POST /v1/agents/register
[ ] Start heartbeat loop
[ ] Ready to receive tasks
```

### Worker Bootstrap Checklist

```
[ ] Read KURORYUU_BOOTSTRAP.md
[ ] Call kuroryuu_session_start()
[ ] Register as worker: POST /v1/agents/register
[ ] Start heartbeat loop
[ ] Enter poll loop
```
