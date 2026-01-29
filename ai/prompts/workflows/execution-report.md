---
description: Generate implementation report after task completion (Kuroryuu)
---

# Execution Report

Generate a comprehensive report after completing a task implementation.

## Purpose

Document what was implemented, how it aligns with the plan, challenges encountered, and divergences. This report feeds into System Review for process improvement.

## When to Generate

- After all subtasks for a Task are COMPLETED
- Before finalizing via `POST /v1/orchestration/finalize`
- As part of the leader's finalization phase

## Context to Gather

### From Orchestration API
```
GET /v1/orchestration/tasks/{task_id}
```

Extract:
- Task title and description
- All subtasks with their status, iterations, promises
- Worker assignments
- Leader hints injected

### From Files
- Implementation plan: `ai/plans/{feature-name}.md`
- PRD (if exists): `ai/prds/{feature-name}.md`

### From Git
```bash
git diff --stat {start_commit}..HEAD
git log --oneline {start_commit}..HEAD
```

## Generate Report

Save to: `ai/reports/{feature-name}-execution.md`

```markdown
# Execution Report: {Feature Name}

## Meta Information

| Attribute | Value |
|-----------|-------|
| Task ID | {task_id} |
| Plan File | ai/plans/{feature-name}.md |
| PRD File | ai/prds/{feature-name}.md (if exists) |
| Started | {timestamp} |
| Completed | {timestamp} |
| Duration | {time} |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| {path} | created / modified / deleted | +{N} -{N} |

**Summary:** {N} files added, {N} modified, {N} deleted (+{total_added} -{total_removed})

## SubTask Summary

| SubTask | Worker | Iterations | Budget | Promise | Hints |
|---------|--------|------------|--------|---------|-------|
| {title} | {agent_id} | {N} | {max} | DONE | {0} |
| {title} | {agent_id} | {N} | {max} | DONE | {1} |

**Totals:**
- SubTasks: {N} completed, {N} total
- Total Iterations: {N} used / {N} budgeted
- Hints Injected: {N}
- Workers Used: {N}

## Validation Results

| Level | Command | Status | Details |
|-------|---------|--------|---------|
| Syntax | {lint cmd} | PASS/FAIL | {output summary} |
| Types | {type cmd} | PASS/FAIL | {output summary} |
| Unit Tests | {test cmd} | PASS/FAIL | {N} passed, {N} failed |
| Integration | {int cmd} | PASS/FAIL | {N} passed, {N} failed |

## What Went Well

- {concrete example of something that worked smoothly}
- {another positive}

## Challenges Encountered

### Challenge 1: {Title}
- **What:** {description of difficulty}
- **Why:** {root cause}
- **Resolution:** {how it was resolved}
- **Iterations spent:** {N}

## Divergences from Plan

### Divergence 1: {Title}

| Attribute | Value |
|-----------|-------|
| Planned | {what the plan specified} |
| Actual | {what was implemented instead} |
| Reason | {why this divergence occurred} |
| Type | Better approach / Plan assumption wrong / Security / Performance / Other |
| Impact | Positive / Neutral / Negative |

### Divergence 2: {Title}
...

## Skipped Items

| Item | Reason | Follow-up |
|------|--------|-----------|
| {what was skipped} | {why} | {ticket/task to create} |

## Promise Summary

| Promise | Count | Notes |
|---------|-------|-------|
| DONE | {N} | Successful completions |
| PROGRESS | {N} | Partial progress iterations |
| BLOCKED | {N} | External blockers hit |
| STUCK | {N} | Required leader intervention |

## Recommendations

### For Planning (leader_plan_feature.md)
- {suggestion for improving plans}

### For Execution (worker_iterate.md)
- {suggestion for improving execution}

### For Formulas (ai/formulas/)
- {suggestion for workflow improvements}

### For Steering (ai/steering/)
- {patterns to document}

## Artifacts Generated

| Artifact | Location | Description |
|----------|----------|-------------|
| {name} | {path} | {what it is} |

## Next Steps

- [ ] {follow-up task 1}
- [ ] {follow-up task 2}
```

## Important

- Be honest about challenges - they inform process improvements
- Classify divergences accurately - good divergences aren't failures
- Track iteration counts - they reveal complexity estimation accuracy
- Include validation output - proves implementation works
- Document artifacts - helps future reference
