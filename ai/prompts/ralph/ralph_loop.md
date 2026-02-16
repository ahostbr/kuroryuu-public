---
description: Core Ralph iteration loop for autonomous task execution
hackathon_stats: 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions
---

# Ralph Loop

> **Hackathon Stats:** 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions

Core iteration loop for autonomous task execution.

## Loop Structure

```
FOR each incomplete task in todo.md:

  1. CLEAR WORKER CONTEXT
     k_pty(action="send_line", session_id=worker, data="/clear")
     Wait for prompt to return (~2s)

  2. SEND TASK
     Build task prompt with context
     k_pty(action="send_line", session_id=worker, data=task_prompt)

  3. MONITOR OUTPUT
     LOOP:
       output = k_pty(action="read", session_id=worker, mode="viewport")

       IF "<promise>DONE</promise>" in output:
         → Task complete, break

       IF "<promise>STUCK:" in output:
         → Extract reason, load ralph_intervention.md

       IF "<promise>PROGRESS:" in output:
         → Log progress, continue monitoring

       IF "<promise>BLOCKED:" in output:
         → Log blocker, alert user, skip to next task

       WAIT 5s and continue monitoring

  3.5. STAGE + COMMIT
     After <promise>DONE</promise> detected AND completion file verified:

     a. Verify completion file: ai/ralph/results/T{id}.done.json
        → Read summary and files_modified from .done.json

     b. Check for changes:
        git status --porcelain
        → If no changes: log "no changes to commit", skip to step 4

     c. Capture diffstat:
        git diff --stat
        → Store for commit trailer

     d. Build structured commit message:
        Subject: T{id}: {summary from .done.json} (max 72 chars)
        Body: bullet list from .done.json summary
        Trailers: Request: {task_description} (max 100 chars)
                  Task: T{id}

     e. Stage specific files:
        git add {files from git status --porcelain} (NEVER git add -A)

     f. Commit via HEREDOC:
        git commit -m "$(cat <<'EOF'
        T{id}: {summary}

        - {change 1}
        - {change 2}

        Request: {task_description}
        Task: T{id}
        EOF
        )"

     g. Capture commit hash:
        commit_hash = git rev-parse --short HEAD

     h. Update sidecar (ai/task-meta.json):
        Write commit_hash + committed_at for this task ID

     i. Update state (ai/ralph/state.json):
        Append { task_id, commit_hash, committed_at } to git_workflow.commits

  4. FINALIZE TASK
     Mark task [x] in todo.md (use TaskUpdate)
     Log to ai/ralph/activity.md (include commit hash)

  5. NEXT ITERATION
     Update ai/ralph/state.json
     Continue to next task
```

---

## Task Prompt Format

Send this to worker via k_pty:

```markdown
# Ralph Task Assignment

**Task ID:** {task_id}
**Description:** {task_description}

## Context Files
{relevant_files_content_if_any}

## Instructions

Execute this task. When FULLY COMPLETE:
1. Run `/ralph_done` to signal completion

**IMPORTANT: Do NOT run `git commit` or `git add`.**
Ralph handles all commits after verification.
Leave your changes unstaged — Ralph will review and commit them.

If STUCK and need help:
- Run `/ralph_stuck your question here`
- Wait for Ralph to inject context

For progress updates:
- Run `/ralph_progress N` where N is percentage (0-100)

## Working Directory
<PROJECT_ROOT>
```

---

## Desktop Automation (When k_pccontrol Enabled)

Only use when `state.capabilities.desktop_automation == true`.

### Visual Verification

After worker reports DONE, optionally verify via screenshot:

```python
if state["capabilities"]["desktop_automation"]:
    # Take screenshot to verify task completion visually
    result = k_pccontrol(action="screenshot")
    if result.get("ok"):
        # Screenshot captured - can analyze for expected state
        # Store in ai/ralph/screenshots/T{task_id}_complete.png
        pass
```

### IDE Integration

For tasks involving file editing, can observe VS Code state:

```python
# Get list of windows to find VS Code
windows = k_pccontrol(action="get_windows")
vscode_window = next((w for w in windows["windows"] if "Visual Studio Code" in w.get("title", "")), None)

if vscode_window:
    # Can take targeted screenshot of VS Code
    k_pccontrol(action="screenshot")
```

### Multi-Window Coordination

When task spans multiple applications:

```python
# List all windows to understand state
windows = k_pccontrol(action="get_windows")
for w in windows.get("windows", []):
    print(f"  {w['title']}")

# Can click to focus specific window
k_pccontrol(action="click", element="VS Code", by="name")
```

### Guidelines

- **Prefer terminal operations** - k_pty is faster and more reliable
- **Use sparingly** - screenshots/clicks are slow operations
- **Verification only** - use for confirming task completion, not as primary interaction
- **All actions logged** - audit trail in `ai/logs/pc-automation.log`

---

## Monitoring Implementation

```python
import time

def monitor_worker(worker_pty: str, task_id: str) -> str:
    """Monitor worker until completion or stuck."""

    while True:
        # Read worker output
        result = k_pty(action="read", session_id=worker_pty, mode="viewport", timeout_ms=5000)
        output = result.get("output", "")

        # Check for promise signals
        if "<promise>DONE</promise>" in output:
            return "complete"

        if "<promise>STUCK:" in output:
            reason = extract_stuck_reason(output)
            return ("stuck", reason)

        if "<promise>BLOCKED:" in output:
            reason = extract_blocked_reason(output)
            return ("blocked", reason)

        if "<promise>PROGRESS:" in output:
            percent = extract_progress(output)
            log_progress(task_id, percent)

        # Continue monitoring
        time.sleep(5)


def extract_stuck_reason(output: str) -> str:
    """Extract reason from <promise>STUCK:reason</promise>"""
    import re
    match = re.search(r'<promise>STUCK:(.+?)</promise>', output)
    return match.group(1) if match else "unknown"
```

---

## Completion Verification

Dual signal required:
1. Terminal output: `<promise>DONE</promise>`
2. File exists: `ai/ralph/results/T{task_id}.done.json`

```python
def verify_completion(task_id: str, output: str) -> bool:
    terminal_done = "<promise>DONE</promise>" in output
    file_path = f"ai/ralph/results/T{task_id}.done.json"
    file_done = Path(file_path).exists()

    if terminal_done and file_done:
        return True
    elif terminal_done and not file_done:
        # Wait a moment, worker may still be writing
        time.sleep(2)
        return Path(file_path).exists()
    return False
```

---

## Activity Logging

Append to `ai/ralph/activity.md`:

```markdown
## Iteration {n} — {timestamp}

**Task:** {task_id}: {description}
**Status:** {complete|stuck|blocked}
**Commit:** {commit_hash} (or "skipped" if no changes)
**Duration:** {duration}
**Notes:** {any_notes}

---
```

---

## State Updates

Update `ai/ralph/state.json` after each iteration:

```json
{
  "session_id": "{{session_id}}",
  "worker_pty": "{{worker_session_id}}",
  "current_task": "T002",
  "iteration": 3,
  "started_at": "2026-01-27T10:00:00",
  "last_activity": "2026-01-27T10:15:00",
  "tasks_completed": ["T001"],
  "tasks_stuck": []
}
```

---

## Desktop Nudge Handling

If Desktop injects a nudge message to your PTY:

```
NUDGE: Leader inactive for Xs - continue monitoring
```

**Response:**
1. Acknowledge nudge (internal log)
2. Read worker PTY status
3. If worker active: continue monitoring
4. If worker stuck: trigger intervention
5. If worker idle: re-send task or probe

---

## End Conditions

| Condition | Action |
|-----------|--------|
| All tasks complete | Output "All tasks complete!" and stop |
| Max iterations reached | Alert user, stop |
| Worker unrecoverable | Alert user, stop |
| User interrupt | Save state, stop gracefully |
