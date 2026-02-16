---
description: Autonomous task loop with structured git commits tied to T### IDs
argument-hint: [--auto] [--single T###] [--dry-run] [--no-review]
allowed-tools: Task, TaskCreate, TaskUpdate, TaskList, TaskGet, Read, Glob, Grep, Bash, Write, Edit, AskUserQuestion
model: opus
---

# /k-start-worker-loop — Autonomous Task Loop with Structured Git Commits

Pick pending T### tasks from ai/todo.md, dispatch fresh builder subagents per task, verify, commit with structured messages, loop until done.

## Flags

Parse `$ARGUMENTS` for:
- `--auto` — Auto-commit without asking (default: ask before each commit)
- `--single T###` — Process only one specific task (e.g., `--single T149`)
- `--dry-run` — Show task queue without executing
- `--no-review` — Skip the review gate (default: review enabled)

## Phase 1: Initialize

### 1.1 Load Task Queue

Read `ai/todo.md` and find all unchecked tasks in the `## Claude Tasks` section:
```
Pattern: - [ ] T###: description @agent [worklog: pending] (created: timestamp)
```

Extract task IDs (T### numbers) and descriptions. Sort ascending by T### number.

### 1.2 Load Full Descriptions

Read `ai/task-meta.json` to get full task descriptions (todo.md truncates at ~200 chars).

For each task:
- If sidecar has entry → use full `description` field
- Else → use truncated description from todo.md

### 1.3 Parse Flags

```
auto_commit = "--auto" in $ARGUMENTS
single_task = extract T### from "--single T###" if present
dry_run = "--dry-run" in $ARGUMENTS
skip_review = "--no-review" in $ARGUMENTS
```

If `--single T###`: filter queue to only that task.

### 1.4 Report Queue

Print the task queue:

```
═══════════════════════════════════════════════════════════════════
K-START-WORKER-LOOP — Task Queue
═══════════════════════════════════════════════════════════════════

MODE
├── Auto-commit: {{yes|no}}
├── Review gate: {{yes|no}}
└── Dry run: {{yes|no}}

QUEUE ({{count}} tasks)
├── T149: Add retry logic to gateway health endpoint
├── T150: Fix CSS overflow in observability panel
└── T151: Update backup service error messages

═══════════════════════════════════════════════════════════════════
```

If `--dry-run`: STOP HERE. Do not execute.

---

## Phase 2: Task Loop

FOR EACH task in queue:

### 2.1 Load Task Context

Read the full description from sidecar. Build the prompt using the template at `ai/prompts/workflows/do-work-task-prompt.md`:

Replace `{task_id}` with the T### ID and `{full_description}` with the full task description.

### 2.2 Dispatch Builder Subagent

Use the Task tool to spawn a fresh builder:

```
Task(
  description: "Implement T{id}: {summary}",
  prompt: [rendered do-work-task-prompt.md],
  subagent_type: "do-work-builder",
  mode: "bypassPermissions"
)
```

The builder will:
- Implement the task
- Run verification (tests, compilation)
- Return a structured TASK_COMPLETE or TASK_INCOMPLETE report

### 2.3 Parse Builder Result

Extract from the builder's response:
- **Summary** — one-line for commit subject
- **Changes** — bullet list for commit body
- **Files Modified** — list of changed files
- **Verification** — pass/fail status

If builder returned TASK_INCOMPLETE:
- Log the failure and reason
- Print: `[SKIP] T{id}: Builder reported incomplete — {reason}`
- Continue to next task

### 2.4 Review Gate (unless --no-review)

If review gate is enabled, dispatch a reviewer:

```
Task(
  description: "Review T{id} changes",
  prompt: "Review the changes made for task T{id}: {description}.
    Check: files exist, TypeScript compiles (tsc --noEmit), Python compiles (python -m py_compile),
    tests pass if applicable, no leftover debug code, git status shows only expected changes.
    Report PASS or FAIL with specific issues.",
  subagent_type: "mp-validator",
  model: "haiku"
)
```

If reviewer reports FAIL:
- Log the issues
- Print: `[REVIEW FAIL] T{id}: {issues}`
- Continue to next task (do NOT commit)

### 2.5 Stage and Commit

#### 2.5.1 Check for changes
```bash
git status --porcelain
```

If no changes: print `[NO CHANGES] T{id}: No files modified`, continue to next task.

#### 2.5.2 Capture diffstat
```bash
git diff --stat
```

#### 2.5.3 Build commit message

Format:
```
T{id}: {summary from builder report}

{bullet list of changes from builder report}

Request: {task description, first 100 chars}
Task: T{id}
```

Rules:
- Subject line max 72 chars (truncate with `...` if needed)
- Body: bullet list from builder's Changes section
- `Request:` trailer: original task description, one line, max 100 chars
- `Task:` trailer: T### ID for `git log --grep` traceability

#### 2.5.4 Commit approval

If `--auto` is set: commit directly.

Otherwise: show the proposed commit message and ask:

```
Proposed commit for T{id}:
────────────────────────────
{commit message}
────────────────────────────

Changed files:
  {list of files from git status}

Commit this?
```

Use AskUserQuestion with options: "Yes, commit", "Skip this task", "Edit message first"

If user selects "Edit message first": ask for the edited message, then commit with that.
If user selects "Skip this task": continue to next task without committing.

#### 2.5.5 Execute commit

```bash
# Stage specific files (NEVER git add -A)
git add path/to/file1.ts path/to/file2.py

# Commit with HEREDOC for proper formatting
git commit -m "$(cat <<'EOF'
T{id}: {summary}

- {change 1}
- {change 2}

Request: {task description}
Task: T{id}
EOF
)"
```

#### 2.5.6 Capture commit hash
```bash
git rev-parse --short HEAD
```

### 2.6 Update Sidecar

Read `ai/task-meta.json`, add commit info to this task's entry:

```json
{
  "T{id}": {
    "commit_hash": "{hash}",
    "committed_at": "{ISO timestamp}"
  }
}
```

Write back to `ai/task-meta.json`.

### 2.7 Finalize

Mark task completed:
```
TaskUpdate(taskId: session_local_id, status: "completed")
```

Print status:
```
[DONE] T{id}: {summary} → commit {hash}
```

---

## Phase 3: Report

After all tasks processed, print summary:

```
═══════════════════════════════════════════════════════════════════
K-START-WORKER-LOOP — Complete
═══════════════════════════════════════════════════════════════════

RESULTS
│ Task  │ Status       │ Commit  │
│───────│──────────────│─────────│
│ T149  │ COMMITTED    │ a1b2c3d │
│ T150  │ COMMITTED    │ e4f5g6h │
│ T151  │ REVIEW FAIL  │ —       │

SUMMARY
├── Committed: 2
├── Failed: 1
├── Skipped: 0
└── Total: 3

═══════════════════════════════════════════════════════════════════
```

---

## Error Handling

| Error | Action |
|-------|--------|
| No pending tasks | Print "No pending tasks in ai/todo.md" and stop |
| Builder timeout | Log, skip task, continue loop |
| Builder TASK_INCOMPLETE | Log reason, skip task, continue loop |
| Review FAIL | Log issues, skip task (don't commit), continue loop |
| No git changes after build | Log warning, skip commit, still mark task done |
| Git commit fails | Log error, continue to next task (changes remain staged) |
| task-meta.json read/write error | Log warning, continue (non-fatal) |
| --single T### not found | Print "Task T### not found in pending tasks" and stop |

---

## Traceability

After commits are made:
- `git log --grep="Task: T085"` → find commits for a specific task
- `git log --grep="^T085:"` → quick filter by task ID in subject
- `ai/task-meta.json` → `commit_hash` + `committed_at` per task (served via Gateway)
- Desktop Gantt → will show commit markers when `commit_hash` field is present
