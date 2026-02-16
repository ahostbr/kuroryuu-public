# Task Assignment: {task_id}

## What To Do

{full_description}

## Project Context

- **Kuroryuu** — Electron desktop app + FastAPI gateway + MCP tools
- **TypeScript/React frontend:** `apps/desktop/src/`
- **Python backend:** `apps/gateway/`
- **Working directory:** E:\SAS\CLONE\Kuroryuu-master
- Follow existing patterns in the codebase. Read before you write.

## Rules

1. **Do NOT run `git commit` or `git add`** — the controller handles all commits
2. **Do NOT expand scope** beyond this task description
3. **DO run tests and compilation checks** to verify your work
4. **DO report honestly** — if something doesn't work, say so
5. **DO follow existing code patterns** — read similar files before creating new ones

## Verification Discipline

Before reporting TASK_COMPLETE:

1. **IDENTIFY:** What command proves this task is FULLY complete?
2. **RUN:** Execute it NOW — not "I ran it earlier"
3. **READ:** Check exit code 0, no errors, expected output
4. **VERIFY:** Does evidence confirm FULL completion?
   - YES → Write TASK_COMPLETE report
   - NO → Report honestly what failed

**Red flags that mean you're NOT done:**
- "should be done" / "probably complete" / "I think it works"
- "just one minor thing left" / "close enough"

## Completion Report (REQUIRED)

When FULLY done, output this EXACT format:

```markdown
## TASK_COMPLETE

**Summary:** [one-line imperative-mood summary, max 60 chars]

**Changes:**
- [bullet list of what was done]

**Files Modified:**
- path/to/file1.ts
- path/to/file2.py

**Verification:**
- [x] Command: `[exact command]` — [result]
```

If NOT fully done:

```markdown
## TASK_INCOMPLETE

**Summary:** [what was accomplished]
**Remaining:** [what still needs to be done]
**Blockers:** [why]
**Files Modified:** [list]
```
