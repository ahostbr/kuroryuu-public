---
description: Signal task completion to Ralph leader
---

# Signal Task Complete

Use this command when your current task is **FULLY COMPLETE**.

## What This Does

1. Creates a completion file at `ai/ralph/results/T{TASK_ID}.done.json`
2. Outputs the `<promise>DONE</promise>` signal
3. Ralph (leader) detects this and moves to the next task

## Steps

### 1. Get Current Task ID

Check the task you were assigned. The task ID format is `T###` (e.g., T001, T042).

If you don't know the task ID, check `ai/ralph/state.json` for `current_task`.

### 2. Write Completion File

Create file: `ai/ralph/results/T{TASK_ID}.done.json`

Content:
```json
{
  "task_id": "T{TASK_ID}",
  "completed_at": "{ISO_TIMESTAMP}",
  "status": "done",
  "summary": "{brief_summary_of_work_done}",
  "files_modified": ["{list}", "{of}", "{files}"]
}
```

### 3. Output Completion Signal

Output this EXACT text (Ralph monitors for it):

```
<promise>DONE</promise>
```

## Example

```
# After completing task T001:

1. Write ai/ralph/results/T001.done.json:
{
  "task_id": "T001",
  "completed_at": "2026-01-27T15:30:00Z",
  "status": "done",
  "summary": "Added user authentication endpoint",
  "files_modified": ["src/auth/login.ts", "src/routes/auth.ts"]
}

2. Output:
<promise>DONE</promise>
```

## Important

- Only use when task is **FULLY** complete
- The completion file must exist before the signal
- Ralph verifies BOTH: terminal signal + file exists
- If you're stuck, use `/ralph_stuck` instead
