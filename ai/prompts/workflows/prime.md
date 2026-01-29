# Prime: Load Project Context

> **STOP.** Before using this prompt, you MUST have read `KURORYUU_BOOTSTRAP.md`.
> This prompt helps gather context. Bootstrap has the rules.

---

## U — UNDERSTAND

### 1. Confirm Bootstrap Loaded
```
✅ Read KURORYUU_BOOTSTRAP.md
✅ Called kuroryuu_session_start()
✅ Confirmed: "KURORYUU-aware. Session: {id}. Ready."
```

If not done → **STOP. Go read bootstrap first.**

### 2. Check Repo Intel Staleness
```python
# Query /v1/repo_intel/status or check Reports/RepoIntel/
last_indexed = status.last_indexed
if stale (>24h):
    ⚠️ ALERT USER: "Repo intel is {hours}h old. Run /v1/repo_intel/refresh"
```

### 3. Load Current State
- `ai/todo.md` → Active tasks and features
- `Docs/DEVLOG.md` → Recent development history (last 3 entries)
- `git status` → Branch, uncommitted changes

---

## P — PLAN

Based on gathered state, identify:

| Question | Source |
|----------|--------|
| What tasks are active? | `ai/todo.md` (Active section) |
| What's the task criteria? | Task description in todo.md |
| What was last progress? | `Docs/DEVLOG.md` tail |
| Is codebase indexed? | `/v1/repo_intel/status` |

---

## G — GATHER

### Required Context Block
```json
{
  "bootstrap_confirmed": true,
  "session_id": "<from kuroryuu_session_start>",
  "harness": {
    "active_tasks": ["<task_id>"],
    "active_task_titles": ["<title>"],
    "status": "<status>",
    "criteria": ["<from task description>"]
  },
  "repo_intel": {
    "indexed": true,
    "last_indexed": "<timestamp>",
    "stale": false,
    "stale_hours": null
  },
  "git": {
    "branch": "<branch>",
    "clean": true
  }
}
```

---

## E — EXECUTE

1. **Load harness state** → Read todo.md, DEVLOG.md
2. **Check repo_intel** → Call status endpoint, detect staleness
3. **Get git state** → Branch, status
4. **Build context block** → Merge all sources
5. **Emit prime report** → Show state + staleness warnings

---

## V — VERIFY

- [ ] Bootstrap was read FIRST (not skipped)
- [ ] kuroryuu_session_start() was called
- [ ] Repo intel staleness checked
- [ ] Active feature identified (or none)
- [ ] Context block is valid

---

## R — REPORT

```
═══════════════════════════════════════════════════════════════════
🔑 KURORYUU PRIME — Context Loaded
═══════════════════════════════════════════════════════════════════

📋 BOOTSTRAP: ✅ KURORYUU_BOOTSTRAP.md read
📋 SESSION: {session_id}

📊 REPO INTEL
├── Indexed: {yes/no}
├── Last: {timestamp}
└── {⚠️ STALE: {hours}h old | ✅ Current}

🎯 HARNESS
├── Active Tasks: {count}
├── Status: {status}
└── Current Focus: {task title}

🔀 GIT: {branch} | {clean/dirty}

📋 NEXT ACTION
   {Based on state: /plan, /execute, etc.}

═══════════════════════════════════════════════════════════════════
```

---

## Agent Instructions

```
You are running the /prime command for Kuroryuu.

CRITICAL: This prompt assumes you already read KURORYUU_BOOTSTRAP.md.
If you haven't, STOP and read it now.

Follow U-P-G-E-V-R:
1. UNDERSTAND — Confirm bootstrap loaded, check staleness
2. PLAN — Identify what context is needed
3. GATHER — Load harness (todo.md, DEVLOG.md), repo_intel, git state
4. EXECUTE — Build unified context
5. VERIFY — All sources loaded, staleness checked
6. REPORT — Output prime report with next action

STALENESS ALERT:
If repo_intel index is >24h old, emit warning:
"⚠️ REPO INTEL STALE — Last indexed {hours}h ago. Run /v1/repo_intel/refresh"

NO ACTIVE TASKS:
If no tasks active in todo.md, suggest: "Check ai/todo.md Backlog for pending work"
```
