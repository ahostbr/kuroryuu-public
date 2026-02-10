---
description: Signal task completion to Ralph leader (V2 with verification discipline)
---

# Signal Task Complete V2 (Superpowers-Enhanced)

> **V2 Changes:** Added verification gate, red flag words, rationalization prevention, and completion self-check from Superpowers discipline techniques. Original: ralph_done.md

Use this command when your current task is **FULLY COMPLETE**.

## What This Does

1. Creates a completion file at `ai/ralph/results/T{TASK_ID}.done.json`
2. Outputs the `<promise>DONE</promise>` signal
3. Ralph (leader) detects this and moves to the next task

## [V2] Verification Gate — Before Signaling DONE

```
BEFORE creating the .done.json file or outputting the promise:

1. IDENTIFY: What command proves this task is FULLY complete?
   - Does the task have a validation command? Run it.
   - Were files modified? Check they exist and have expected content.
   - Were tests involved? Run them fresh.

2. RUN: Execute the verification command NOW
   - Not "I ran it earlier" — NOW, in this session
   - Full command, not partial check

3. READ: Check full output
   - Exit code 0?
   - No errors, no warnings?
   - Expected output matches?

4. VERIFY: Does evidence confirm FULL completion?
   - YES → Proceed to write .done.json
   - NO → Use /ralph_stuck instead. Do NOT claim DONE.

5. CHECK git status:
   - Are all changes committed?
   - Any uncommitted work that should be included?

Skip any step = premature completion. Use /ralph_stuck or /ralph_progress instead.
```

## [V2] Red Flag Words — If You're Thinking These, You're Not Done

- **"should be done"** — Verify. "Should" is not evidence.
- **"probably complete"** — Run the check. "Probably" means you didn't.
- **"I think it works"** — Prove it. "Think" is not "know".
- **"just one minor thing left"** — Then it's NOT done. Fix it or report PROGRESS.
- **"close enough"** — Ralph verifies BOTH terminal signal + file. Close enough will fail.
- **"I'll clean up later"** — If cleanup is needed, task is not FULLY complete.

## [V2] Completion Rationalizations

| Excuse | Reality |
|--------|---------|
| "I manually tested it" | Manual testing is ad-hoc. Run the validation command. |
| "It compiled so it works" | Compilation checks syntax, not behavior. Run tests. |
| "Only minor thing left" | Then it's not done. Fix it first or report PROGRESS. |
| "Ralph will catch any issues" | Ralph verifies completion, but YOUR signal triggers it. False DONE wastes everyone's time. |
| "I'm running low on context" | Report PROGRESS honestly. Don't fake DONE to end your session. |
| "The core functionality works" | Does the task say "core functionality" or "fully complete"? Be precise. |

## [V2] Completion Self-Check

Before running /ralph_done, confirm ALL of these:

- [ ] I ran the validation/test command in THIS session and it passed
- [ ] I checked git status — all relevant changes are committed
- [ ] I verified the actual output/behavior matches what was asked
- [ ] The task description says X — I delivered X, not "most of X"
- [ ] I am NOT claiming DONE just because I'm out of context/iterations
- [ ] I have evidence I can include in the .done.json summary

**If you can't check ALL boxes, use /ralph_progress or /ralph_stuck instead.**

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
