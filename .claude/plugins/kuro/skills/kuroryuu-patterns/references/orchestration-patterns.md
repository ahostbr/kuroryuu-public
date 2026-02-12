# Kuroryuu Orchestration Patterns

Multi-agent coordination patterns for complex workflows.

## Leader Delegation Pattern

> **Tip:** Use `k_msg` for simplified messaging. Use `k_inbox` when you need claim/complete lifecycle.

```
Leader                                    Worker
  │                                         │
  ├─── k_inbox(send, task) ───────────────►│
  │                                         │
  │◄── <promise>PROGRESS:25%</promise> ────┤
  │                                         │
  │◄── <promise>PROGRESS:50%</promise> ────┤
  │                                         │
  │◄── <promise>PROGRESS:75%</promise> ────┤
  │                                         │
  │◄── <promise>DONE</promise> ────────────┤
  │                                         │
  ├─── Verify completion ──────────────────►│
  │                                         │
```

### Implementation

Leader creates task:
```python
k_inbox(
    action="send",
    to="worker-1",
    subject="Implement User Authentication",
    body="""
    ## Task
    Implement OAuth2 authentication flow.

    ## Requirements
    - Use passport.js library
    - Support Google and GitHub providers
    - Store tokens securely

    ## Deliverables
    - Updated auth routes
    - Token storage implementation
    - Tests for auth flow
    """
)
```

Worker polls and claims:
```python
# Poll for new tasks
messages = k_inbox(action="list", filter="to:me,status:new")

# Claim task
k_inbox(action="claim", message_id=messages[0]["id"])

# Execute task...

# Report completion
k_inbox(action="complete", message_id=messages[0]["id"])
# Output: <promise>DONE</promise>
```

## Parallel Worker Pattern

Deploy multiple workers for parallel task execution.

```
Leader
  │
  ├─── spawn_cli(worker) ──► Worker 1
  ├─── spawn_cli(worker) ──► Worker 2
  ├─── spawn_cli(worker) ──► Worker 3
  │
  ├─── k_inbox(send, task1) ──► Worker 1
  ├─── k_inbox(send, task2) ──► Worker 2
  ├─── k_inbox(send, task3) ──► Worker 3
  │
  │◄── Collect all DONE promises
  │
  └─── Finalize
```

### Implementation

Leader spawns workers:
```python
workers = []
for i in range(3):
    result = k_pty(
        action="spawn_cli",
        cli_provider="claude",
        role="worker"
    )
    workers.append(result["session_id"])
```

Leader distributes tasks:
```python
tasks = ["Task 1", "Task 2", "Task 3"]
for i, task in enumerate(tasks):
    k_inbox(
        action="send",
        to=f"worker-{i+1}",
        subject=task,
        body=f"Details for {task}"
    )
```

## Escalation Pattern

Worker escalates to leader when stuck.

```
Worker                          Leader                          Human
  │                               │                               │
  │◄── [task] ────────────────────┤                               │
  │                               │                               │
  │── STUCK:need auth decision ──►│                               │
  │                               │                               │
  │                               ├── [ask via response] ─────────►│
  │                               │                               │
  │                               │◄── "Use OAuth" ───────────────┤
  │                               │                               │
  │◄── [hint: Use OAuth] ─────────┤                               │
  │                               │                               │
  │── DONE ──────────────────────►│                               │
```

### Implementation

Worker signals stuck:
```
<promise>STUCK:Cannot decide between OAuth and JWT for authentication</promise>
```

Leader loads nudge prompt:
```python
# Read ai/prompts/leader/leader_nudge.md
# Return question to orchestrator for human decision
# (In CLI: use native AskUserQuestion tool)

# After receiving human response, send hint to worker
k_inbox(
    action="send",
    to="worker-1",
    subject="Hint: Authentication Decision",
    body="Use OAuth. Here's why: ..."
)
```

## Checkpoint Recovery Pattern

Restore session from checkpoint after interruption.

```
[Session Start]
      │
      ▼
┌─────────────────┐
│ k_checkpoint    │
│   (list)        │
└────────┬────────┘
         │
    Has checkpoints?
         │
    ┌────┴────┐
    Yes      No
    │         │
    ▼         ▼
┌─────────┐ ┌─────────┐
│  Load   │ │  Fresh  │
│Checkpoint│ │  Start  │
└────┬────┘ └────┬────┘
     │           │
     └─────┬─────┘
           │
           ▼
    Continue Work
```

### Implementation

```python
# Check for existing checkpoints
result = k_checkpoint(action="list", name="session", limit=1)

if result["checkpoints"]:
    # Load latest checkpoint
    checkpoint = k_checkpoint(
        action="load",
        name="session",
        checkpoint_id="latest"
    )

    # Restore context
    context = checkpoint["payload"]
    print(f"Resuming: {context['description']}")
    print(f"Context: {context['context_summary']}")
else:
    # Fresh start
    print("Starting new session")
```

## PRD-First Workflow

All work derives from PRD (Product Requirements Document).

```
┌─────────────┐
│    PRD      │ ◄── North Star
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Prime     │ Load context, check PRD
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Plan Feature│ Create implementation plan
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Breakdown  │ Convert plan to subtasks
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Delegate   │ Workers poll inbox
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Monitor   │ Watch promises
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Nudge     │ Help stuck workers
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Finalize   │ Reports, reviews
└─────────────┘
```

### Prompt Files

Each phase has a corresponding prompt file in `ai/prompts/leader/`:

- `leader_prime.md` - Load PRD, check state
- `leader_plan_feature.md` - Cite PRD, create plan
- `leader_breakdown.md` - Create subtasks
- `leader_nudge.md` - Help stuck workers
- `leader_finalize.md` - Trigger reviews

## Context Handoff Pattern

Transfer context between sessions.

```
Session 1                              Session 2
    │                                      │
    │── [working] ──┐                      │
    │               │                      │
    │── k_checkpoint(save) ──┐             │
    │               │        │             │
    │── [end] ──────┼────────┼─────────────│
                    │        │             │
                    │        └──► k_checkpoint(load)
                    │                      │
                    │              [resume work]
                    │                      │
                    └──────── Context ─────┘
```

### Implementation

Session 1 saves context:
```python
k_checkpoint(
    action="save",
    name="session",
    payload={
        "description": "Implementing auth feature",
        "context_summary": "Completed OAuth setup, starting token storage",
        "files_modified": [
            "src/auth/oauth.ts",
            "src/auth/providers.ts"
        ],
        "next_steps": [
            "Implement token storage",
            "Add refresh token logic",
            "Write tests"
        ],
        "decisions_made": [
            "Using passport.js",
            "Google + GitHub providers only"
        ]
    }
)
```

Session 2 restores context:
```python
checkpoint = k_checkpoint(action="load", name="session", checkpoint_id="latest")
payload = checkpoint["payload"]

# Resume from next_steps
print(f"Resuming: {payload['description']}")
print(f"Next: {payload['next_steps'][0]}")
```

## Best Practices

### Task Clarity
- Include clear deliverables in task descriptions
- Specify success criteria
- List any constraints or requirements

### Progress Reporting
- Report progress at meaningful milestones
- Include percentage for long tasks
- Explain blockers clearly

### Error Recovery
- Always save checkpoint before risky operations
- Use descriptive checkpoint payloads
- Include next_steps for easy recovery

### Context Management
- Save context at 80% threshold
- Include decision rationale in checkpoints
- List modified files for review
