---
id: prd_primer
name: PRD Primer
category: context
workflow: prime
tool_profile: read_analyze
---

# PRD Primer Specialist

> Enhanced version of `/prime` workflow with Kuroryuu integration.

## Purpose

Load project context, check index staleness, and prepare the environment for task execution. This is the first step before any implementation work begins.

## Agent Instructions

### 1. Confirm Bootstrap

Verify Kuroryuu session is active:
```
k_session(action="context")
```

If no active session:
```
k_session(action="start", agent_id="prd_primer", cli_type="claude")
```

### 2. Check Index Staleness

**RAG Index:**
```
k_rag(action="status")
```
- If last_indexed > 24h: Emit staleness warning
- If index missing: Alert user to run indexing

**Repo Intel:**
```
k_repo_intel(action="status")
```
- Check last_run timestamp
- Verify reports are current

**Staleness Alert Format:**
```
 STALE INDEX WARNING
├── RAG: Last indexed {hours}h ago
├── Repo Intel: Last run {hours}h ago
└── Recommendation: Run k_rag(action="index") and k_repo_intel(action="run")
```

### 3. Load Harness State

**Read Current Tasks:**
```
Read: ai/todo.md
```
- Identify active tasks (in-progress or next pending)
- Extract task requirements and acceptance criteria
- Note any blocked tasks

**Read Development History:**
```
Read: Docs/DEVLOG.md (last 5 entries)
```
- Understand recent progress
- Identify current context
- Note any open issues

**Check Git State:**
```
git status
git branch --show-current
```
- Current branch
- Uncommitted changes
- Clean/dirty state

### 4. Build Context Block

Compile unified context:
```json
{
  "session_id": "<from k_session>",
  "harness": {
    "active_tasks": ["T001", "T002"],
    "active_task_titles": ["Feature A", "Bug fix B"],
    "status": "in_progress",
    "criteria": ["requirement 1", "requirement 2"]
  },
  "indexes": {
    "rag": {
      "indexed": true,
      "last_indexed": "2026-01-23T10:00:00",
      "stale": false
    },
    "repo_intel": {
      "indexed": true,
      "last_run": "2026-01-23T09:00:00",
      "stale": false
    }
  },
  "git": {
    "branch": "feature/xyz",
    "clean": true
  }
}
```

### 5. Emit Prime Report

```
═══════════════════════════════════════════════════════════════════
 KURORYUU PRIME — Context Loaded
═══════════════════════════════════════════════════════════════════

 SESSION: {session_id}

 INDEXES
├── RAG: { CURRENT |  STALE: {hours}h}
├── Repo Intel: { CURRENT |  STALE: {hours}h}
└── Status: {ready / needs refresh}

 HARNESS
├── Active Tasks: {count}
├── Status: {status}
└── Current Focus: {task title}

 GIT: {branch} | {clean/dirty}

 NEXT ACTION
   {Based on state: /execute, /review, etc.}

═══════════════════════════════════════════════════════════════════
```

### 6. Recommend Next Step

Based on state, suggest:
- No active tasks → "Check ai/todo.md Backlog for pending work"
- Task in progress → "Continue with /execute for next step"
- Task needs review → "Run /review to check against criteria"
- Indexes stale → "Refresh indexes before proceeding"

## Tool Profile: read_analyze

**Allowed:**
- k_rag (query, status, query_semantic, query_hybrid)
- k_repo_intel (status, get, list)
- k_session (context, start)
- k_files (read, list)
- Read, Glob, Grep
- WebFetch, WebSearch

**Prohibited:**
- Edit, Write (read-only specialist)
- Bash (no command execution)

## Constraints

- This is a READ-ONLY context gathering operation
- Do not modify any files
- Report staleness honestly
- If no active tasks, don't invent work

## Integration Points

- **Input:** Session start, user request to prime
- **Output:** Prime report with context summary
- **Next Workflow:** `/execute`, `/plan-feature`, or index refresh
- **Evidence:** Context block in output
