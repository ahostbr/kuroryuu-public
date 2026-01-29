---
description: Report progress percentage to Ralph leader
---

# Report Progress

Use this command to report progress on a long-running task.

## What This Does

1. Outputs a `<promise>PROGRESS:N%</promise>` signal
2. Ralph (leader) logs the progress
3. Helps Ralph know you're still working (not stuck)

## Usage

Output this EXACT format where N is a number 0-100:

```
<promise>PROGRESS:N%</promise>
```

## Examples

### Just started:
```
<promise>PROGRESS:10%</promise>
```

### Halfway done:
```
<promise>PROGRESS:50%</promise>
```

### Almost complete:
```
<promise>PROGRESS:90%</promise>
```

## When to Report

Report progress when:
- Task is taking longer than expected
- You've completed a major subtask
- You want Ralph to know you're still working
- At natural milestones (25%, 50%, 75%)

## Important

- N must be a number between 0 and 100
- This is OPTIONAL — Ralph won't penalize you for not reporting
- When fully complete, use `/ralph_done` (not progress 100%)
- Progress reports help prevent unnecessary nudges from Desktop

## What Ralph Does

Ralph logs progress to `ai/ralph/activity.md` and continues monitoring.
No intervention is triggered — this is just an informational signal.
