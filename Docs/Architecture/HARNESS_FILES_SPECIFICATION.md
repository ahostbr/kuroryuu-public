# Harness Files Specification

> **Version:** 1.0.0
> **Last Updated:** 2026-01-23
> **Status:** Canonical Post-Remediation

## Purpose

This document defines the canonical harness files used by Kuroryuu agents for state management, task tracking, and session persistence. It also documents deprecated files and the rationale for their removal.

---

## Canonical Harness Files

### 1. `ai/todo.md` — Task Source of Truth

**Purpose:** The single source of truth for all agent tasks.

**Structure:**
- **Backlog:** Pending tasks waiting to be assigned
- **Active:** In-progress tasks being worked on
- **Delayed:** Tasks blocked on external factors
- **Done:** Recently completed tasks

**Usage:**
- Leaders read Backlog for pending work
- Workers mark tasks done when complete
- All agents update task status here
- Orchestration API uses this for coordination (in-memory)

**Format:**
```markdown
## Backlog
- [ ] T001 — Description @agent

## Active
- [ ] T002 — Description @agent (started YYYY-MM-DD)

## Done
- [x] T003 — Description @agent **DONE** (YYYY-MM-DD)
```

**API:** `apps/gateway/orchestration/todo_md.py` (TodoMdParser)

---

### 2. `Docs/DEVLOG.md` — Development History

**Purpose:** Historical record of development progress across sessions.

**Structure:**
- Chronological entries (newest first)
- Each entry documents: what changed, why, evidence, next steps
- Organized by date and task

**Usage:**
- Agents append entries after significant work
- Used for context on previous sessions
- Replaces deprecated `ai/progress.md`

**Format:**
```markdown
## Day N (YYYY-MM-DD) — Task Title

**What Changed:** Description of changes made
**Why:** Rationale for the approach
**Evidence:** Tool results, file paths, test outputs
**Next Steps:** What remains to be done

**Files Modified:**
- path/to/file1.ts
- path/to/file2.py
```

**Key Difference from progress.md:**
- DEVLOG.md is for historical narrative and session summaries
- todo.md is for current task state

---

### 3. `ai/hooks.json` — Hook Configuration

**Purpose:** Configuration for Kuroryuu lifecycle hooks.

**Structure:** JSON array of hook definitions

**Usage:**
- Gateway reads this for hook registration
- Agents can query active hooks
- Used by pre/post tool execution hooks

**Example:**
```json
[
  {
    "event": "Kuroryuu.PreToolUse",
    "handler": "RAGGateHandler",
    "enabled": true
  }
]
```

---

### 4. `ai/sessions.json` — Session Registry

**Purpose:** Registry of active and recent agent sessions.

**Structure:** JSON object mapping session IDs to metadata

**Usage:**
- Tracks which agents are active
- Used for session recovery
- Stores session start/end times

---

### 5. `ai/checkpoints/` — Agent State Persistence

**Purpose:** Checkpoints for agent state recovery.

**Structure:** Directory containing checkpoint subdirectories

**Usage:**
- Agents save checkpoints at 80% context or before risky operations
- Used for session recovery after context resets
- Stores conversation state, working memory, PTY metadata

**Key Files:**
- `checkpoint_{timestamp}.json` — State snapshot
- `worklog.md` — Human-readable summary

---

## Deprecated Files

### `ai/progress.md` — DEPRECATED

**Deprecated Date:** 2026-01-23
**Replacement:** `Docs/DEVLOG.md`

**Reason for Deprecation:**
- Caused harness drift (duplicate state between progress.md and todo.md)
- Unclear ownership (who writes what, when?)
- Led to inconsistency and stale data
- DEVLOG.md provides better historical context in Docs/ hierarchy

**Migration:**
- Historical progress entries → archived in DEVLOG.md
- Current task state → managed in todo.md only
- Session summaries → written to DEVLOG.md after significant work

---

### `ai/feature_list.json` — DEPRECATED

**Deprecated Date:** 2026-01-23
**Replacement:** `ai/todo.md`

**Reason for Deprecation:**
- Redundant with todo.md (tasks ARE features)
- Added unnecessary complexity (two sources of truth)
- Unclear when to use features vs tasks
- todo.md provides sufficient structure with sections

**Migration:**
- Feature tracking → use task IDs in todo.md
- Feature status → use task checkboxes and sections
- Feature metadata → embed in task descriptions or use DEVLOG.md
- Acceptance criteria → include in task descriptions

---

## Rationale: Why Simplify?

### The Harness Drift Problem

Over time, the system accumulated multiple overlapping state files:
- `todo.md` vs `feature_list.json` (both tracked work items)
- `progress.md` vs `DEVLOG.md` (both tracked history)
- `progress.md` vs `todo.md` (unclear which was source of truth)

This led to:
1. **Inconsistency:** Different files showed different states
2. **Confusion:** Agents didn't know which file to trust
3. **Maintenance burden:** Updates required in multiple places
4. **Stale data:** Files fell out of sync

### The Solution: Single Source of Truth

**Current State:** `ai/todo.md`
**Historical Context:** `Docs/DEVLOG.md`
**Configuration:** `ai/hooks.json`
**Session Recovery:** `ai/checkpoints/`

This clear separation eliminates ambiguity:
- One place to check current work (todo.md)
- One place for historical narrative (DEVLOG.md)
- No duplicate state to keep synchronized

---

## Migration Notes for Agents

### Reading Historical Context

**Old pattern (WRONG):**
```python
# Read progress.md and feature_list.json
progress = read_file("ai/progress.md")
features = json.load("ai/feature_list.json")
```

**New pattern (CORRECT):**
```python
# Read todo.md for current state, DEVLOG.md for history
todo = TodoMdParser()
active_tasks = todo.get_active_tasks()
devlog = read_file("Docs/DEVLOG.md", limit=50)  # Last 50 lines for context
```

### Writing Progress Updates

**Old pattern (WRONG):**
```python
# Append to progress.md
append_to_file("ai/progress.md", entry)
```

**New pattern (CORRECT):**
```python
# Append to DEVLOG.md for historical record
append_to_file("Docs/DEVLOG.md", entry)

# Update task status in todo.md
todo.mark_task_done(task_id, "Summary")
```

### Task Completion

**Old pattern (WRONG):**
```json
// Update feature_list.json
{
  "features": [
    {"id": "F001", "status": "done"}
  ]
}
```

**New pattern (CORRECT):**
```markdown
## Done
- [x] T001 — Implement feature X @agent **DONE** (2026-01-23)
```

---

## File Location Philosophy

### `ai/` Directory

**Purpose:** System state and configuration
**Contents:** Current state files, hooks, sessions
**NOT for:** Historical narratives, analysis reports, documentation

### `Docs/` Directory

**Purpose:** Documentation and historical records
**Contents:** DEVLOG.md, Plans/, worklogs/, Architecture/
**NOT for:** Current task state, session state

### `.agents/docs/` Directory

**Purpose:** Agent-generated analysis and reports
**Contents:** Analysis reports, system health checks
**NOT for:** System state or configuration

---

## Canonical References

| File | Location | Purpose |
|------|----------|---------|
| Task state | `ai/todo.md` | Current work (source of truth) |
| Dev history | `Docs/DEVLOG.md` | Historical narrative |
| Hooks | `ai/hooks.json` | Hook configuration |
| Sessions | `ai/sessions.json` | Session registry |
| Checkpoints | `ai/checkpoints/` | State recovery |

---

## Enforcement

### Hard Rules

1. **NEVER** read or write `ai/progress.md` or `ai/feature_list.json`
2. **ALWAYS** use `ai/todo.md` as the source of truth for tasks
3. **ALWAYS** use `Docs/DEVLOG.md` for historical context
4. When in doubt, read `KURORYUU_BOOTSTRAP.md` § Canonical File Locations

### Validation

If you find references to deprecated files:
- Update the prompt/documentation to use canonical replacements
- Report the finding for remediation
- Do NOT use the deprecated files

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-23 | Initial specification post-remediation |

---

## See Also

- `KURORYUU_BOOTSTRAP.md` — Canonical file locations
- `KURORYUU_LAWS.md` — Governance rules
- `ai/todo.md` — Task source of truth
- `Docs/DEVLOG.md` — Development history
