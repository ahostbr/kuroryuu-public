---
description: Complete task and trigger reviews after all subtasks done (Kuroryuu)
hackathon_stats: 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions
---

# Leader Finalize

> **Hackathon Stats:** 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions

Finalize a task after all subtasks are complete, triggering reports and reviews.

## Purpose

This prompt runs when ALL subtasks for a task have reported `<promise>DONE</promise>`. It:
1. Verifies all work is complete
2. Runs final validation
3. Generates execution report
4. Triggers code review
5. Triggers system review
6. Records task outcomes to k_collective
7. Updates progress tracking
8. Marks task COMPLETED in orchestration (coordination)
9. **Updates todo.md (SOURCE OF TRUTH)** - marks task as [x] Done

**IMPORTANT:** `ai/todo.md` is THE source of truth for task state. Step 9 is the canonical completion marker.

## Prerequisites

Before finalization:
- All subtasks must have status: DONE
- No subtasks should be BLOCKED or STUCK
- Task should have associated plan file

## Verification Steps

### Step 1: Check Subtask Status

```http
GET /v1/orchestration/tasks/{{task_id}}/subtasks
```

Verify:
- ALL subtasks have `status: "DONE"`
- ALL subtasks have `last_promise: "DONE"`
- No subtasks are in READY, IN_PROGRESS, BLOCKED, or STUCK

If any subtask is not DONE:
```
⚠️ CANNOT FINALIZE — Incomplete subtasks:
- [{{id}}] {{title}} — Status: {{status}}, Promise: {{promise}}
```

### Step 2: Run Final Validation

Execute validation commands from the plan:

```bash
# Level 1: Syntax
{{lint_command}}

# Level 2: Types
{{type_check_command}}

# Level 3: Tests
{{test_command}}

# Level 4: Build
{{build_command}}
```

Record results:

| Level | Command | Result | Details |
|-------|---------|--------|---------|
| Syntax | {{cmd}} | PASS/FAIL | {{output}} |
| Types | {{cmd}} | PASS/FAIL | {{output}} |
| Tests | {{cmd}} | PASS/FAIL | {{N}} passed |
| Build | {{cmd}} | PASS/FAIL | {{output}} |

If ANY validation fails:
- Do NOT finalize
- Create remediation subtask
- Report failure to human

### Step 3: Generate Execution Report

Load and execute: `execution-report.md`

Gather:
- Task metadata
- All subtask summaries
- Iteration counts and budgets used
- Promises reported
- Leader hints injected
- Files changed (from git)

Save to: `ai/reports/{{feature-name}}-execution.md`

### Step 4: Trigger Code Review

Load and execute: `code-review.md`

Focus on:
- All files changed during task execution
- Security issues
- Logic errors
- Pattern adherence

Save to: `ai/reviews/{{feature-name}}-code-review.md`

### Step 5: Trigger System Review

Load and execute: `system-review.md`

Focus on:
- Plan vs implementation divergences
- Process improvements
- Worker performance patterns
- Steering document updates needed

Save to: `ai/reviews/{{feature-name}}-system-review.md`

### Step 6: Record Task Outcomes to Collective

After reports are generated, capture learnings for future tasks:

#### 6.1 Record Successful Approaches

For each subtask that used a novel or non-obvious approach:

```
k_collective(action="record_success",
  task_type="[category: feature/bugfix/refactor/infra]",
  approach="[concise description of what worked]",
  evidence="[validation results, metrics, or outcome]",
  agent_id="[worker_id who discovered it]")
```

**When to record:**
- Non-obvious solutions that saved time
- Patterns that could help similar future tasks
- Integration approaches that weren't documented
- Workarounds for framework/library quirks

**When NOT to record:**
- Routine implementations following standard patterns
- Obvious fixes (typos, missing imports)
- Task-specific details with no reuse value

#### 6.2 Record Failed Approaches (from iteration history)

Review subtask iteration logs for abandoned approaches:

```
k_collective(action="record_failure",
  task_type="[category]",
  approach="[what was tried]",
  reason="[why it failed or was abandoned]")
```

**Record if:**
- Multiple iterations were spent on a dead end
- The failure reason isn't obvious from docs
- Future agents might try the same approach

#### 6.3 Update Skill Matrix

For workers who excelled or struggled:

```
k_collective(action="update_skill",
  agent_id="[worker_id]",
  skill_type="[e.g., react, testing, api-design]",
  delta=1)  # +1 for excellence, -1 for struggles
```

**Skill types:** Use consistent categories like `react`, `typescript`, `testing`, `api-design`, `debugging`, `documentation`.

#### 6.4 Recording Checklist

Before proceeding:
- [ ] At least 1 success pattern recorded (if any novel approaches used)
- [ ] Failed approaches documented (if iterations > 2 on any subtask)
- [ ] Skill matrix updated for standout workers

### Step 7: Update Development History

Append to `Docs/DEVLOG.md`:

```markdown
## {{timestamp}} — {{feature_name}} COMPLETED

**Task ID:** {{task_id}}
**Duration:** {{start}} → {{end}}
**Subtasks:** {{count}} completed
**Iterations:** {{used}}/{{budgeted}}

**Validation:** All PASS
**Code Review:** {{verdict}}
**System Review:** {{score}}/10

**Key Outcomes:**
- {{outcome 1}}
- {{outcome 2}}

**Reports:**
- Execution: ai/reports/{{feature}}-execution.md
- Code Review: ai/reviews/{{feature}}-code-review.md
- System Review: ai/reviews/{{feature}}-system-review.md
```

### Step 8: Mark Task Completed

```http
PATCH /v1/orchestration/tasks/{{task_id}}
Content-Type: application/json

{
  "status": "COMPLETED",
  "completed_at": "{{timestamp}}",
  "metadata": {
    "validation_passed": true,
    "execution_report": "ai/reports/{{feature}}-execution.md",
    "code_review": "ai/reviews/{{feature}}-code-review.md",
    "system_review": "ai/reviews/{{feature}}-system-review.md",
    "iterations_used": {{total}},
    "iterations_budgeted": {{total}}
  }
}
```

### Step 9: Update Todo.md (SOURCE OF TRUTH)

Mark corresponding task in `ai/todo.md` as complete using the todo_md parser:

```python
from apps.gateway.orchestration.todo_md import TodoMdParser

parser = TodoMdParser()
parser.mark_task_done(task_id, result_note="Finalized by leader")
```

This will:
1. Change checkbox to `[x]`
2. Move task to Done section
3. Add result note if provided

**Manual format (if using direct edit):**
```markdown
- [x] {{task_title}} @agent **DONE**
```

## Finalization Report

```
═══════════════════════════════════════════════════════════════════
KURORYUU FINALIZE — Task Completed
═══════════════════════════════════════════════════════════════════

TASK: {{task_id}} — {{task_title}}
STATUS: ✅ COMPLETED

SUBTASK SUMMARY
├── Total: {{count}}
├── Completed: {{count}}
├── Iterations: {{used}}/{{budgeted}} ({{pct}}% of budget)
└── Leader Hints: {{count}} injected

VALIDATION RESULTS
├── Syntax: ✅ PASS
├── Types: ✅ PASS
├── Tests: ✅ PASS ({{N}} tests)
└── Build: ✅ PASS

REPORTS GENERATED
├── Execution: ai/reports/{{feature}}-execution.md
├── Code Review: ai/reviews/{{feature}}-code-review.md
└── System Review: ai/reviews/{{feature}}-system-review.md

CODE REVIEW VERDICT: {{PASS/PASS WITH CHANGES/NEEDS WORK}}
SYSTEM REVIEW SCORE: {{N}}/10

FILES CHANGED
├── Added: {{N}}
├── Modified: {{N}}
├── Deleted: {{N}}
└── Total: +{{lines}} -{{lines}}

DEVLOG UPDATED: Docs/DEVLOG.md
TODO UPDATED: ai/todo.md

═══════════════════════════════════════════════════════════════════
```

## Handle Issues

### Validation Failure

If validation fails after all subtasks are DONE:

1. Do NOT mark task COMPLETED
2. Create remediation subtask:
```http
POST /v1/orchestration/subtasks
{
  "task_id": "{{task_id}}",
  "title": "Fix validation failure: {{issue}}",
  "description": "Validation failed: {{details}}\n\nFix the issue and re-run validation.",
  "prompt_ref": "worker_iterate",
  "max_iterations": 3
}
```
3. Report to human if critical

### Code Review Issues

If code review finds critical issues:

1. Create fix subtasks for each critical issue
2. Do NOT mark task COMPLETED until fixed
3. Re-run finalization after fixes

## Agent Instructions

```
You are the LEADER finalizing a completed task.

FINALIZATION WORKFLOW:
1. VERIFY all subtasks are DONE
2. RUN final validation commands
3. GENERATE execution report (use execution-report.md)
4. TRIGGER code review (use code-review.md)
5. TRIGGER system review (use system-review.md)
6. RECORD outcomes to k_collective (success patterns, failures, skill updates)
7. UPDATE Docs/DEVLOG.md
8. MARK task COMPLETED in orchestration
9. UPDATE ai/todo.md

IMPORTANT:
- Do NOT finalize if any subtask is not DONE
- Do NOT finalize if validation fails
- Do NOT finalize if code review finds critical issues
- All reports should be saved to ai/reports/ or ai/reviews/

After finalization, the task lifecycle is complete.
Return to leader_prime.md to check for next work.
```

## Quality Checklist

Before marking COMPLETED:
- [ ] All subtasks are DONE
- [ ] All validation commands pass
- [ ] Execution report generated
- [ ] Code review completed (no critical issues)
- [ ] System review completed
- [ ] k_collective updated (success patterns, failures if any, skill matrix)
- [ ] DEVLOG.md updated
- [ ] Todo.md updated
