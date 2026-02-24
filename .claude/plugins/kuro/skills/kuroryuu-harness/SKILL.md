---
name: Kuroryuu Harness
description: This skill should be used when saving checkpoints, writing worklogs, linking cross-references, using inbox/messaging, RAG interactive mode, or doing any Kuroryuu persistence workflow. Trigger phrases include "save checkpoint", "write worklog", "cross-reference", "link worklog", "inbox", "send message", "RAG interactive", "search interactively".
version: 1.0.0
---

# Kuroryuu Harness Workflows

## Checkpoint Data Requirements

When saving checkpoints, ALWAYS include:
```json
{
  "plan_file": "Docs/Plans/xxx.md",
  "worklog_files": ["Docs/worklogs/..."],
  "task_ids": ["T001", "T002"]
}
```

## Worklog Format

Path: `Docs/worklogs/KuroRyuuWorkLog_YYYYMMDD_HHMMSS_Description.md`

Every worklog MUST include this header:
```markdown
# Worklog: [Description]

**Date:** YYYY-MM-DD HH:MM
**Agent:** [agent_id]
**Checkpoint:** [cp_YYYYMMDD_HHMMSS_xxx]
**Plan:** [Docs/Plans/xxx.md or "None"]
**Tasks:** [T001, T002, ...]

---
```

## Cross-Reference Rules

All persistence artifacts must be bidirectionally linked:
- Checkpoint → references plan_file, worklog_files, task_ids
- Worklog header → references checkpoint, plan, tasks
- Task in `ai/todo.md` → `[worklog: path]` updated when work is done

### Task Evidence

After completing significant work, link worklog to the task:
1. Find task in `ai/todo.md` → `## Claude Tasks` section
2. Change `[worklog: pending]` → `[worklog: Docs/worklogs/KuroRyuuWorkLog_YYYYMMDD_...]`

## Inbox / Messaging

Canonical location: `<PROJECT_ROOT>/ai/inbox`
- Maildir structure: `new/`, `cur/`, `done/`, `dead/`, `tmp/`

Use `k_msg` for simplified messaging (wraps k_inbox):
```
k_msg(action="send", to="agent_id", subject="...", body="...")
k_msg(action="check", agent_id="my_id")
```

Must register with `k_session` first for interagent communication.

## RAG Interactive Mode

Trigger phrases: "search X interactively", "rag interactive search X", "let me pick the results"

CLI Workflow:
1. Run `k_rag(action="query", query="X", top_k=5)`
2. Present results via `AskUserQuestion` with `multiSelect: true`
3. Only use the results user selected

Desktop Workflow:
- Toggle: "rag interactive on/off/status"
- Flag file: `.enable-rag-interactive`
- Hook blocks queries → forces `query_interactive` action
