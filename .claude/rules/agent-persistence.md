# Agent Persistence Rules

## Checkpoint Location
`<PROJECT_ROOT>/ai/checkpoints/`

## Harness Files

**Current State:**
- `ai/todo.md` — Source of truth for current tasks (THE canonical source)
- `ai/hooks.json` — Hook configuration
- `ai/sessions.json` — Session registry

**Historical Context:**
- `Docs/DEVLOG.md` — Development history and session summaries

**Deprecated (DO NOT USE):**
- `ai/progress.md` — Replaced by Docs/DEVLOG.md
- `ai/feature_list.json` — Replaced by ai/todo.md

> See `KURORYUU_BOOTSTRAP.md` § Canonical File Locations for complete reference
> See `Docs/Architecture/HARNESS_FILES_SPECIFICATION.md` for full specification

## PRD-First Workflow Directories
- `ai/prd/` — PRD templates
- `Docs/Plans/` — Implementation plans (active)
- `Docs/Plans/Archive/` — Completed/archived plans
- `ai/prompts/` — Prompt templates (organized by subdirectory):
  - `workflows/` — execute, review, validate, etc.
  - `leader/` — leader_*.md files
  - `worker/` — worker_*.md files
  - `phases/` — phase_*.md files
  - `models/` — Model-specific system prompts
- `ai/reports/` — Execution reports after task completion
- `ai/reviews/` — Code and system reviews
- `ai/formulas/` — Multi-step workflow definitions (TOML)

## Workflow

### Session Start
1. Read `ai/todo.md` to see current tasks
2. Read `Docs/DEVLOG.md` for historical context (last 3-5 entries)
3. Resume from where prior session left off

### During Work
- Update `ai/todo.md` as you complete tasks (mark checkboxes, move to Done)
- Append development log entries to `Docs/DEVLOG.md` after significant work
- Log detailed session summaries to worklogs in `Docs/worklogs/`
- Use gateway hooks system for automatic tracking

### Session End
- Ensure `ai/todo.md` reflects current state
- Append final entry to `Docs/DEVLOG.md` summarizing session work
- Write detailed worklog if significant work was done

## Worklog Format
```
Docs/worklogs/KiroWorkLog_YYYYMMDD_HHMMSS_Description.md
```

Example: `KiroWorkLog_20260107_120000_FeatureName.md`

## Cross-Reference Requirements

### Worklog Header (REQUIRED)
```markdown
# Worklog: [Description]

**Date:** YYYY-MM-DD HH:MM
**Agent:** [agent_id]
**Checkpoint:** [cp_YYYYMMDD_HHMMSS_xxx]
**Plan:** [Docs/Plans/xxx.md or "None"]
**Tasks:** [T001, T002, ...]

---

## Summary
...
```

### Checkpoint Data (REQUIRED)
```json
{
  "plan_file": "Docs/Plans/xxx.md",
  "worklog_files": ["Docs/worklogs/..."],
  "task_ids": ["T001", "T002"]
}
```

### Task Format (Updated)
```markdown
- [ ] T###: desc @agent [checkpoint: pending] [worklog: pending] (created: ts)
- [x] T###: desc @agent [checkpoint: cp_...] [worklog: path] (completed: ts)
```
