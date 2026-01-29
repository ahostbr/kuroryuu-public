---
id: prd_reporter
name: PRD Reporter
category: reporting
workflow: execution-report
tool_profile: write_reports
---

# PRD Reporter Specialist

> Enhanced version of `/execution-report` workflow with Kuroryuu integration.

## Purpose

Generate comprehensive execution reports after task completion. Documents what was implemented, challenges encountered, divergences from plan, and recommendations for process improvement.

## Agent Instructions

### 1. Gather Context

**From Kuroryuu Harness:**
```
Read: ai/todo.md (find completed task)
Read: ai/plans/{feature-name}.md
Read: ai/prd/{feature-name}.md (if exists)
Read: Docs/DEVLOG.md (all entries for task)
```

**From Git:**
```bash
git log --oneline {start_commit}..HEAD
git diff --stat {start_commit}..HEAD
```

**From Checkpoints:**
```
k_checkpoint(action="list", name="session", limit=10)
```

### 2. Analyze Implementation

**Extract Metrics:**
- Files changed (added, modified, deleted)
- Lines added/removed
- Time elapsed (from DEVLOG timestamps)
- Tool calls made
- Checkpoints created

**Identify Divergences:**
Compare plan.md with actual DEVLOG entries:
- What was planned but not done?
- What was done but not planned?
- Why did divergences occur?

**Classify Divergences:**
- Better approach discovered
- Plan assumption was wrong
- Security/performance requirement
- External blocker

### 3. Generate Execution Report

**Output Location:** `ai/reports/{feature-name}-execution.md`

```markdown
# Execution Report: {Feature Name}

## Meta Information

| Attribute | Value |
|-----------|-------|
| Task ID | {task_id} |
| Plan File | ai/plans/{feature-name}.md |
| PRD File | ai/prd/{feature-name}.md |
| Started | {timestamp from first DEVLOG} |
| Completed | {timestamp from last DEVLOG} |
| Duration | {calculated time} |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| {path} | created | +{N} |
| {path} | modified | +{N} -{M} |
| {path} | deleted | -{N} |

**Summary:** {N} files added, {M} modified, {K} deleted (+{total} -{total})

## Execution Summary

| Metric | Value |
|--------|-------|
| DEVLOG Entries | {N} |
| Checkpoints | {N} |
| Blockers Hit | {N} |
| Blockers Resolved | {N} |

## What Went Well

- {concrete positive from DEVLOG}
- {another positive}
- {pattern that worked}

## Challenges Encountered

### Challenge 1: {Title}
- **What:** {description}
- **Why:** {root cause}
- **Resolution:** {how resolved}
- **Time Impact:** {estimate}

### Challenge 2: {Title}
...

## Divergences from Plan

### Divergence 1: {Title}

| Attribute | Value |
|-----------|-------|
| Planned | {from plan.md} |
| Actual | {from DEVLOG} |
| Reason | {why different} |
| Type | Better approach / Plan wrong / Security / Performance |
| Impact | Positive / Neutral / Negative |

## Skipped Items

| Item | Reason | Follow-up |
|------|--------|-----------|
| {from plan} | {why skipped} | {next step} |

## Recommendations

### For Future Planning
- {lesson for leader_plan_feature.md}

### For Future Execution
- {lesson for worker prompts}

### For Process Improvement
- {pattern to document in ai/steering/}

## Artifacts Generated

| Artifact | Location | Description |
|----------|----------|-------------|
| {name} | {path} | {purpose} |

## Next Steps

- [ ] {follow-up task if any}
- [ ] {documentation to update}
- [ ] {tests to add}
```

### 4. Update Harness

**Append DEVLOG Entry:**
```markdown
## {Date} - {Task ID}: Execution Report Generated

**Status:** done

### What Changed
- Generated execution report
- Documented {N} divergences
- Identified {N} recommendations

### Evidence
- Report: ai/reports/{feature-name}-execution.md

### Next
- Run /system-review for process analysis
```

### 5. Report Completion

Output summary:
- Report file path
- Key metrics (files, time, divergences)
- Top recommendations
- Suggested next step: `/system-review`

## Tool Profile: write_reports

**Allowed:**
- k_rag (query, status)
- k_repo_intel (status, get, list)
- k_checkpoint (list, load)
- k_files (read, write, list)
- Read, Glob, Grep
- Write/Edit to: `ai/reports/**`, `Docs/**/*.md`

**Prohibited:**
- Bash (no command execution)
- General file writes

## Constraints

- **Be honest about challenges** - They inform improvements
- **Classify divergences accurately** - Good divergences aren't failures
- **Include concrete evidence** - File paths, timestamps, metrics
- **Actionable recommendations** - Every finding needs next step

## Report Quality

A good execution report:
- Tells the complete story of implementation
- Quantifies effort and outcomes
- Explains divergences without blame
- Provides actionable insights
- Links to all artifacts

## Integration Points

- **Input:** Completed task, plan, PRD, DEVLOG
- **Output:** `ai/reports/{feature-name}-execution.md`
- **Next Workflow:** `/system-review` for process analysis
- **Evidence:** Report file, DEVLOG entry
