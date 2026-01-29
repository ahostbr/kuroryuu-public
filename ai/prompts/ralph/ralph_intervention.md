---
description: Handle stuck worker and provide intervention
hackathon_stats: 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions
---

# Ralph Intervention

> **Hackathon Stats:** 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions

Handle `<promise>STUCK:reason</promise>` signals from worker.

## Trigger

Worker outputs: `<promise>STUCK:reason</promise>`

Example: `<promise>STUCK:Which database schema should I use?</promise>`

---

## Response Protocol

### Step 1: Parse the Stuck Reason

```python
def parse_stuck(output: str) -> str:
    import re
    match = re.search(r'<promise>STUCK:(.+?)</promise>', output)
    return match.group(1) if match else "unknown issue"
```

### Step 2: Gather Context

Based on the stuck reason, gather relevant information:

| Stuck Type | Context Sources |
|------------|-----------------|
| Which file to modify? | Glob for related files, read structure |
| Schema/pattern choice | Check ai/steering/, read existing patterns |
| Error unclear | Read error context from worker output |
| Scope ambiguity | Re-read task from todo.md |
| Missing dependency | Check package.json, requirements.txt |
| API/endpoint question | Read relevant route files |

### Step 3: Build Intervention Response

Format:

```markdown
Ralph here. For your question: "{reason}"

## Context

{relevant_information}

## Recommendation

{specific_guidance}

---

Continue with your task. Signal `/ralph_done` when complete.
```

### Step 4: Inject via k_pty

```python
k_pty(
    action="send_line",
    session_id=worker_pty,
    data=intervention_response
)
```

### Step 5: Resume Monitoring

Return to ralph_loop monitoring state.

---

## Common Interventions

### "Which file should I modify?"

```markdown
Ralph here. For your question: "Which file should I modify?"

## Context

Based on the codebase structure:
- {file1}: {description}
- {file2}: {description}

## Recommendation

Modify `{recommended_file}` because {reason}.

---

Continue with your task. Signal `/ralph_done` when complete.
```

### "What pattern should I use?"

```markdown
Ralph here. For your question: "What pattern should I use?"

## Context

The codebase uses these patterns:
- {pattern1} in {location1}
- {pattern2} in {location2}

## Recommendation

Follow the {pattern} pattern as used in {example_file}.

---

Continue with your task. Signal `/ralph_done` when complete.
```

### "I got an error: {error}"

```markdown
Ralph here. For your error: "{error}"

## Analysis

This error typically means: {explanation}

## Fix

{step_by_step_fix}

---

Continue with your task. Signal `/ralph_done` when complete.
```

### "Task scope unclear"

```markdown
Ralph here. For your question about scope:

## Task Clarification

Original task: {task_description}

## Scope

Focus on:
- {scope_item_1}
- {scope_item_2}

Out of scope:
- {out_of_scope_item}

---

Continue with your task. Signal `/ralph_done` when complete.
```

---

## Intervention Logging

Log all interventions to `ai/ralph/activity.md`:

```markdown
### Intervention — {timestamp}

**Task:** {task_id}
**Stuck Reason:** {reason}
**Context Provided:** {summary}
**Recommendation:** {summary}

---
```

---

## Escalation

If worker remains stuck after 3 interventions on same issue:

1. Log escalation to activity.md
2. Output alert for human:
   ```
   RALPH ALERT: Worker stuck on {task_id} after 3 interventions.
   Issue: {stuck_reason}
   Recommendation: Human review needed.
   ```
3. Mark task as blocked
4. Move to next task (if available)

---

## Self-Assessment

Before intervening, ask:

1. Do I have enough context to help?
2. Is the question clear enough to answer?
3. Should I gather more information first?

If unsure, read more files before responding.

---

## Desktop-Assisted Interventions (When Enabled)

Only use when `state.capabilities.desktop_automation == true`.

### "I need to see the current UI state"

When worker needs visual context:

```python
# Take screenshot for context
result = k_pccontrol(action="screenshot")
if result.get("ok"):
    screenshot_path = f"ai/ralph/screenshots/intervention_{timestamp}.png"
    # Save and reference in response
```

Response template:
```markdown
Ralph here. I've captured the current screen state.

## Screenshot

See: {screenshot_path}

## Analysis

{describe what you see in the UI}

---

Continue with your task. Signal `/ralph_done` when complete.
```

### "App/dialog is blocking my work"

When a dialog or window is preventing task progress:

```python
# First, get windows to understand state
windows = k_pccontrol(action="get_windows")

# Try to find and click dismiss button
result = k_pccontrol(action="find_element", by="name", value="OK")
if result.get("found"):
    k_pccontrol(action="click", element="OK", by="name")
else:
    # Fall back to coordinates if element not found
    # (would need screenshot analysis to determine coordinates)
    pass
```

Response template:
```markdown
Ralph here. I detected a blocking dialog.

## Action Taken

Clicked {button_name} to dismiss dialog.

## Current State

{describe current state after action}

---

Continue with your task. Signal `/ralph_done` when complete.
```

### "Screenshot shows unexpected state"

When visual verification reveals a problem:

```python
# Take screenshot
result = k_pccontrol(action="screenshot")

# If UI shows error state, capture and report
```

Response template:
```markdown
Ralph here. Visual inspection shows unexpected state.

## Screenshot

{screenshot_path}

## Issue

{describe what's wrong visually}

## Suggested Fix

{steps to resolve}

---

Continue with your task. Signal `/ralph_done` when complete.
```

### Important Notes

- All k_pccontrol actions are **audit logged** to `ai/logs/pc-automation.log`
- Use `find_element` before `click` when possible (more reliable than coordinates)
- Screenshots capture **entire desktop** - may contain sensitive information
- Desktop automation is **session-only** - will be disabled on app restart
