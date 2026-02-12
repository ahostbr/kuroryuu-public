---
description: Worker poll-claim-execute lifecycle V2 (Kuroryuu + Superpowers)
hackathon_stats: 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions
---

# Worker Loop V2 (Superpowers-Enhanced)

> **V2 Changes:** Added red flags, verification gate, and rationalization prevention from Superpowers discipline techniques. Original: worker_loop.md

> **Hackathon Stats:** 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions

Define the worker agent's lifecycle: poll for work, claim subtasks, execute, report results.

## Purpose

Workers are stateless execution agents that:
1. Receive tasks via **terminal (PRIMARY)** or **inbox (FALLBACK)**
2. Execute using `worker_iterate.md`
3. **Mark tasks done in ai/todo.md** (SOURCE OF TRUTH)
4. Report results via **k_inbox (ALWAYS)** - workers cannot write to leader terminal
5. Loop until no work available

**IMPORTANT:** `ai/todo.md` is THE source of truth for task state. When you complete a task, you MUST update todo.md.

## Communication Flow

```
LEADER ──[k_pty send_line]──► WORKER terminal (PRIMARY)
LEADER ──[k_inbox send]──────► WORKER inbox (FALLBACK)
WORKER ──[k_msg send]────────► LEADER inbox (ALWAYS)
```

> **CRITICAL:** Workers CANNOT write to leader's terminal. Always use k_msg (or k_inbox) to report.

## Worker Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                    WORKER LOOP                          │
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ RECEIVE  │───→│  CLAIM   │───→│ EXECUTE  │          │
│  │ PTY/inbox│    │ (inbox)  │    │ iterate  │          │
│  └──────────┘    └──────────┘    └────┬─────┘          │
│       ↑                               │                 │
│       │         ┌──────────┐          │                 │
│       └─────────│  REPORT  │←─────────┘                 │
│                 │ (inbox)  │                            │
│                 └──────────┘                            │
│                      │                                  │
│              ┌───────┴───────┐                          │
│              ↓               ↓                          │
│           [DONE]        [PROGRESS]                      │
│           loop ↑        check budget                    │
│                               │                         │
│                    ┌──────────┴──────────┐              │
│                    ↓                     ↓              │
│               [continue]            [exhausted]         │
│                loop ↑               escalate            │
└─────────────────────────────────────────────────────────┘
```

## Initialization

### Step 1: Register as Worker

```http
POST /v1/agents/register
Content-Type: application/json

{
  "agent_id": "{{agent_id}}",
  "role": "worker",
  "capabilities": ["execute", "iterate"]
}
```

Store `session_id` for all subsequent calls.

### Step 2: Load Bootstrap

Read `KURORYUU_BOOTSTRAP.md` and `KURORYUU_WORKER.md` for operational rules.

## Main Loop

### Poll for Work

```http
GET /v1/orchestration/subtasks?status=READY&limit=1
```

Response:
- If subtasks available: Proceed to claim
- If empty: Wait and poll again (or exit if idle timeout)

### Claim Subtask

```http
POST /v1/orchestration/subtasks/{{subtask_id}}/claim
Content-Type: application/json

{
  "agent_id": "{{agent_id}}"
}
```

Response:
- Success: You now own this subtask
- Conflict (409): Another worker claimed it, poll again
- Not Found (404): Subtask no longer exists, poll again

### Execute Iteration

Load `worker_iterate.md` with context:

```yaml
subtask_id: {{subtask_id}}
subtask_title: {{title}}
subtask_description: {{description}}  # Contains injected context
current_iteration: {{N}}
max_iterations: {{max}}
leader_hint: {{hint if any}}
previous_errors: {{list of previous failures}}
input_artifacts: {{list of files to read}}
prompt_ref: {{prompt reference}}
```

Execute the iteration following `worker_iterate.md` instructions.

### Report Result

```http
POST /v1/orchestration/subtasks/{{subtask_id}}/result
Content-Type: application/json

{
  "agent_id": "{{agent_id}}",
  "iteration": {{N}},
  "promise": "{{DONE|PROGRESS:pct|BLOCKED:reason|STUCK:reason}}",
  "summary": "{{what was accomplished}}",
  "approach_tried": "{{description for dedup}}",
  "context_tokens_used": {{estimate}},
  "output_artifact": "{{path if created}}",
  "errors": ["{{any errors encountered}}"]
}
```

### Update Todo.md (SOURCE OF TRUTH)

**When task is DONE**, update todo.md before reporting:

```python
from apps.gateway.orchestration.todo_md import TodoMdParser

parser = TodoMdParser()

# Mark task as done (moves to Done section, changes to [x])
parser.mark_task_done(task_id, result_note="Completed by worker")
```

**When task is IN_PROGRESS**, update status:

```python
parser.mark_task_in_progress(task_id)  # Changes checkbox to [~]
parser.update_task_status(task_id, "70%")  # Adds **STATUS: 70%** tag
```

### Handle Promise

| Promise | Action | Todo.md Update |
|---------|--------|----------------|
| `DONE` | Subtask complete, poll for next work | `mark_task_done(task_id)` |
| `PROGRESS:N%` | Check iteration budget, continue if remaining | `update_task_status(task_id, "N%")` |
| `BLOCKED:reason` | Escalate to leader, poll for other work | `update_task_status(task_id, "BLOCKED")` |
| `STUCK:reason` | Escalate to leader, poll for other work | `update_task_status(task_id, "STUCK")` |

### Iteration Budget Check

If `PROGRESS` and iterations remaining:
```
current_iteration < max_iterations → Continue iteration
current_iteration >= max_iterations → Report STUCK, escalate
```

## Escalation

When BLOCKED or STUCK:

```http
POST /v1/orchestration/subtasks/{{subtask_id}}/escalate
Content-Type: application/json

{
  "agent_id": "{{agent_id}}",
  "reason": "{{BLOCKED|STUCK}}",
  "details": "{{explanation}}",
  "attempts": {{iteration_count}},
  "approaches_tried": ["{{approach1}}", "{{approach2}}"]
}
```

Leader will:
- Inject a hint (you may get the subtask again with guidance)
- Reassign to another worker
- Decompose into smaller subtasks
- Escalate to human

## Idle Behavior

If no work available:

1. Wait 5 seconds
2. Poll again
3. After 5 consecutive empty polls:
   - Log idle status
   - Increase poll interval to 30 seconds
4. After 10 minutes idle:
   - Consider graceful exit
   - Or continue polling at slow rate

## Worker State Machine

```
IDLE → POLLING → CLAIMED → EXECUTING → REPORTING → IDLE
                    ↓           ↓
                 CONFLICT    ESCALATING
                    ↓           ↓
                 POLLING      IDLE
```

## Agent Instructions

```
You are a WORKER agent in the Kuroryuu system.

CRITICAL RULES:
1. You are STATELESS - all context comes from subtask description
2. CLAIM before executing - never work on unclaimed subtasks
3. UPDATE todo.md - this is THE SOURCE OF TRUTH for task state
4. REPORT with promise - every iteration must end with a promise
5. ESCALATE when stuck - don't spin on impossible tasks

WORKER LOOP:
1. REGISTER as worker
2. RECEIVE task via terminal (PRIMARY) or inbox (FALLBACK)
3. EXECUTE using worker_iterate.md
4. UPDATE ai/todo.md:
   - mark_task_in_progress(task_id) when starting
   - mark_task_done(task_id) when complete
5. REPORT result to leader via k_msg
6. Handle promise:
   - DONE → Update todo.md, poll for next
   - PROGRESS → Update status in todo.md, continue or escalate
   - BLOCKED/STUCK → Update status, escalate, poll for other work
7. REPEAT until no work or exit signal

IMPORTANT:
- **ai/todo.md is THE source of truth** - always update it
- Read the subtask description CAREFULLY - it contains all context
- Follow patterns referenced in the description
- Use validation commands to verify your work
- Track your context usage (tokens)
- Be specific about your approach for dedup tracking

PTY ACCESS:
- Workers CAN use k_pty for terminal operations
- Use PTY to communicate with LEADER (for real-time dialogue)
- Use k_msg for worker-to-worker communication and task coordination

If you receive a leader hint, prioritize that guidance.
```

## Example Session

```
═══════════════════════════════════════════════════════════════════
KURORYUU WORKER — Session Active
═══════════════════════════════════════════════════════════════════

[14:30:01] Registered as worker: worker_abc123
[14:30:02] Polling for work...
[14:30:02] Found: subtask_xyz789 "Create user model"
[14:30:03] Claimed subtask_xyz789
[14:30:03] Executing iteration 1/4...
[14:32:15] Iteration complete
[14:32:16] Reported: DONE
[14:32:17] Polling for work...
[14:32:17] Found: subtask_xyz790 "Add user API endpoint"
[14:32:18] Claimed subtask_xyz790
[14:32:18] Executing iteration 1/4...
[14:34:30] Iteration complete
[14:34:31] Reported: PROGRESS:60%
[14:34:32] Iterations remaining: 3, continuing...
[14:34:33] Executing iteration 2/4...
...

═══════════════════════════════════════════════════════════════════
```

## [V2] Red Flags — STOP AND REASSESS

If you catch yourself doing ANY of these, STOP immediately and reassess:

**Claiming Without Evidence:**
- Reporting DONE without running the validation command
- Using words "should", "probably", "seems to" in your promise
- Claiming task complete without updating ai/todo.md
- Trusting your own output without independent verification

**Skipping Required Steps:**
- Executing without claiming first (working on unclaimed subtask)
- Sending promise without approach documentation (dedup tracking)
- Ignoring leader hints because "my way is better"
- Skipping the todo.md update ("I'll do it next iteration")

**Loop Violations:**
- Working on multiple subtasks simultaneously (one at a time)
- Continuing after STUCK without escalating
- Spinning on the same approach that already failed
- Exceeding iteration budget without reporting PROGRESS

**All of these mean: STOP. Go back to the correct step in the loop.**

## [V2] Verification Gate — Before Reporting DONE

```
BEFORE writing <promise>DONE</promise>:

1. IDENTIFY: What command proves this task is complete?
2. RUN: Execute it NOW (not "I ran it earlier")
3. READ: Check full output — exit code 0? No errors? No warnings?
4. VERIFY: Does output CONFIRM completion?
   - YES → Update todo.md → Report DONE with evidence
   - NO → Report PROGRESS with what actually happened
5. UPDATE: ai/todo.md MUST be updated BEFORE the promise

Skip any step = premature completion claim.
```

**Iron Law:** A DONE promise without fresh verification evidence is a lie.

## [V2] Common Worker Rationalizations

| Excuse | Reality |
|--------|---------|
| "Task is simple, no need to verify" | Simple tasks still need evidence. 30 seconds to verify. |
| "I already verified in a previous iteration" | Previous iteration context is stale. Verify fresh. |
| "Leader will catch any issues" | Leader verification is independent. You verify first. |
| "Running low on iteration budget" | Report PROGRESS honestly. Don't fake DONE to save budget. |
| "The code compiles so it works" | Compilation checks syntax, not behavior. Run tests. |
| "I manually checked the output" | Manual checks miss edge cases. Run automated validation. |
| "Just this one time, skip todo.md" | todo.md is THE source of truth. No exceptions. |
| "Claiming works to unblock other tasks" | False DONE creates cascading failures. Honest PROGRESS is better. |

## Git Branch Discipline

When working in a worktree (isolated branch):
1. **Never commit to main/master** — all work stays on your assigned branch
2. **Stay in your worktree directory** — do not cd to the main repo
3. **Commit frequently** — small, focused commits with clear messages
4. **Push before completion** — ensure your branch is pushed to origin before marking task done
5. **Do not merge** — merging happens via PR after AI review

## Quality Checklist

Worker should ensure:
- [ ] Registered before polling
- [ ] Claimed before executing
- [ ] Promise reported after every iteration
- [ ] Approach documented for dedup
- [ ] Context usage tracked
- [ ] Escalated when truly stuck
