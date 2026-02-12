---
description: Convert implementation plan into worker-executable subtasks (Kuroryuu)
hackathon_stats: 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions
---

# Leader Breakdown

> **Hackathon Stats:** 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions

Convert an implementation plan into a set of executable subtasks with proper dependencies.

## Purpose

Transform `ai/plans/{feature}.md` into orchestrated subtasks that:
1. Can be claimed and executed by workers
2. Have clear dependencies (blocked_by relationships)
3. Include all context needed for stateless execution
4. Can be parallelized where possible

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| Plan file | `ai/plans/{{feature}}.md` | Yes |
| Task ID | Orchestration task | Yes |
| PRD path | From leader_prime | Yes |

## Breakdown Process

### Step 1: Parse the Plan

Read the plan file and extract:
- **Phases** - High-level groupings
- **Tasks** - Individual work items
- **Dependencies** - What must complete before what
- **Validation commands** - How to verify each task
- **Context references** - Files to read, patterns to follow

### Step 2: Identify Task Dependencies

Build a dependency graph:

```
Phase 1 Tasks → Phase 2 Tasks → Phase 3 Tasks → Phase 4 Tasks
     ↓              ↓                ↓               ↓
  [Setup]    [Core Work]     [Integration]    [Testing]
```

Rules:
- Tasks within a phase MAY run in parallel (if independent)
- Tasks across phases are sequential (Phase 2 waits for Phase 1)
- Explicit dependencies override phase-based ordering

### Step 3: Determine Complexity Budget

For each task, assign iteration budget based on complexity:

| Complexity | Max Iterations | Description |
|------------|----------------|-------------|
| Simple | 2 | Single file change, clear pattern |
| Medium | 4 | Multiple files, some decision-making |
| Complex | 6 | Architecture decisions, integration work |
| Very Complex | 8 | Cross-cutting, significant research |

### Step 3.1: Auto-Sizing with Judgment (Ralph Loop)

As Leader (Opus), you can intelligently assess task size. No fixed rules - diagnose on the fly.

**Right-sized tasks (ONE context window):**
- Single focused change (add column, create component, update endpoint)
- Clear scope with defined boundaries
- Can be completed and verified in one session
- Worker won't hit context exhaustion

**Split indicators (use judgment):**
- Multiple distinct concerns that could be done independently
- Task spans multiple layers (schema + backend + frontend + tests)
- Description feels like "build the whole feature"
- Estimated token usage exceeds 50% of context window

**When in doubt:**
> Split smaller. A worker can always report DONE quickly.
> Better to have 3 focused tasks than 1 sprawling task.

**Auto-split example:**
```
ORIGINAL: "Add user authentication with JWT, database storage, and login UI"

SPLIT INTO:
1. "Add JWT token generation and validation utilities" (backend)
2. "Add user table and auth database models" (database)
3. "Add login/logout API endpoints" (backend)
4. "Add login form component and auth state" (frontend)
```

Each subtask is now context-window-sized and independently verifiable.

### Step 4: Assign Prompt References

Each subtask type maps to a prompt:

| Task Type | prompt_ref | Description |
|-----------|------------|-------------|
| Create file | `worker_iterate` | Standard implementation |
| Modify file | `worker_iterate` | Standard implementation |
| Write tests | `worker_iterate` | Standard implementation |
| Integration | `worker_iterate` | Standard implementation |

### Step 4.5: Query Collective Patterns (k_collective)

Before creating subtasks, query the collective intelligence for relevant patterns:

```python
# Query patterns relevant to each subtask's domain
patterns = k_collective(action="query_patterns", query="<subtask domain keywords>")

# If patterns are found, write to per-worker file and notify worker
if patterns["successes"] or patterns["failures"]:
    # Write patterns to file for worker to read
    k_files(
        action="write",
        path=f"ai/collective/patterns_{worker_id}.md",
        content=patterns["context_hint"]
    )

    # PRIMARY: Send directly to worker's terminal
    worker_pty = k_pty(action="resolve", agent_id=worker_id)
    if worker_pty.get("ok"):
        k_pty(
            action="send_line",
            session_id=worker_pty["session_id"],
            data=f"Read ai/collective/patterns_{worker_id}.md for relevant approaches from past work before starting"
        )
    else:
        # FALLBACK: Use inbox if PTY unavailable (or use k_msg for simpler syntax)
        k_inbox(
            action="send",
            to_agent=worker_id,
            subject="Read patterns before starting",
            body=f"Read ai/collective/patterns_{worker_id}.md for relevant approaches from past work"
        )
        # Or use k_msg(action="send", to=worker_id, subject="...", body="...")
```

**Pattern Query Guidelines:**
| Subtask Type | Query Keywords |
|--------------|----------------|
| React component | "react component", "zustand", "state management" |
| API endpoint | "fastapi", "endpoint", "router" |
| Database work | "sqlalchemy", "migration", "schema" |
| Testing | "pytest", "test patterns", "mocking" |

**Decision:** Only inject patterns if they're genuinely relevant. Don't clutter worker context with unrelated learnings.

### Step 5: Build Context Injection

For each subtask, prepare context to inject:

```markdown
## Subtask Context

**From Plan:**
{{relevant section of plan}}

**Must-Read Files:**
{{list of files from plan's CONTEXT REFERENCES}}

**Pattern References:**
{{specific patterns to follow}}

**Validation:**
{{command to verify this subtask}}

**Blocked By:**
{{list of subtask IDs that must complete first}}
```

## Create Subtasks

For each task in the plan:

```http
POST /v1/orchestration/subtasks
Content-Type: application/json

{
  "task_id": "{{task_id}}",
  "title": "{{task title from plan}}",
  "description": "{{full context-injected description}}",
  "prompt_ref": "worker_iterate",
  "complexity": {{1-10}},
  "max_iterations": {{2-8}},
  "needs": ["{{subtask_id}}", "{{subtask_id}}"],
  "input_artifacts": ["{{path}}", "{{path}}"],
  "output_artifact": "{{expected output path}}",
  "metadata": {
    "phase": "{{phase number}}",
    "validation_cmd": "{{command}}",
    "plan_section": "{{reference to plan section}}"
  }
}
```

## Dependency Examples

### Sequential (default for cross-phase):
```
Subtask A (Phase 1) → Subtask B (Phase 2) → Subtask C (Phase 3)

B.needs = ["A"]
C.needs = ["B"]
```

### Parallel (within phase):
```
Subtask A ─┬─→ Subtask C
           │
Subtask B ─┘

C.needs = ["A", "B"]  # C waits for both
A.needs = []          # A can start immediately
B.needs = []          # B can start immediately
```

### Fan-out/Fan-in:
```
          ┌→ Subtask B ─┐
Subtask A ─┼→ Subtask C ─┼→ Subtask E
          └→ Subtask D ─┘

B.needs = ["A"]
C.needs = ["A"]
D.needs = ["A"]
E.needs = ["B", "C", "D"]
```

## Output Report

After creating all subtasks:

```
═══════════════════════════════════════════════════════════════════
KURORYUU BREAKDOWN — Subtasks Created
═══════════════════════════════════════════════════════════════════

TASK: {{task_id}} — {{task_title}}
PLAN: ai/plans/{{feature}}.md

SUBTASKS CREATED: {{total_count}}

PHASE 1: Foundation
├── [{{id}}] {{title}} (complexity: {{N}}, iterations: {{max}})
└── [{{id}}] {{title}} (complexity: {{N}}, iterations: {{max}})

PHASE 2: Core Implementation
├── [{{id}}] {{title}} → needs: [{{deps}}]
├── [{{id}}] {{title}} → needs: [{{deps}}]
└── [{{id}}] {{title}} → needs: [{{deps}}]

PHASE 3: Integration
└── [{{id}}] {{title}} → needs: [{{deps}}]

PHASE 4: Testing
└── [{{id}}] {{title}} → needs: [{{deps}}]

DEPENDENCY GRAPH:
{{visual representation}}

READY FOR WORKERS: {{count}} subtasks can be claimed now
BLOCKED: {{count}} subtasks waiting on dependencies

TOTAL ITERATION BUDGET: {{sum of max_iterations}}

═══════════════════════════════════════════════════════════════════
```

## Update Task Status

```http
PATCH /v1/orchestration/tasks/{{task_id}}
Content-Type: application/json

{
  "status": "IN_PROGRESS",
  "metadata": {
    "subtask_count": {{count}},
    "breakdown_completed": "{{timestamp}}",
    "ready_subtasks": {{count}}
  }
}
```

## Agent Instructions

```
You are the LEADER breaking down a plan into subtasks.

CRITICAL RULES:
1. READ the entire plan first
2. PRESERVE all context from the plan in subtask descriptions
3. SET dependencies correctly - workers are stateless
4. ASSIGN realistic iteration budgets
5. INCLUDE validation commands for each subtask

BREAKDOWN WORKFLOW:
1. Read ai/plans/{{feature}}.md thoroughly
2. Identify all tasks and their dependencies
3. Assign complexity and iteration budgets
4. Build context injection for each subtask
5. Create subtasks via POST /v1/orchestration/subtasks
6. Verify dependency graph is correct
7. Update task status to IN_PROGRESS
8. Report breakdown summary

CONTEXT INJECTION IS CRITICAL:
Workers are STATELESS. Each subtask description must contain:
- Full context from the plan
- Files to read
- Patterns to follow
- Validation commands
- What it's blocked by and why

If you don't inject enough context, workers will fail.
```

## Quality Checklist

Before completing breakdown:
- [ ] All plan tasks converted to subtasks
- [ ] Dependencies correctly set (no cycles)
- [ ] Context injected into each subtask
- [ ] Validation commands included
- [ ] Complexity budgets are realistic
- [ ] Some subtasks are READY (not all blocked)
