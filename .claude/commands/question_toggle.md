---
description: Toggle question mode - Claude asks clarifying questions before edits (t=on, f=off)
args: state
---

# /question_toggle - Question Mode Toggle

Toggle whether Claude pauses to ask clarifying questions before making edits.

**Argument:** `$ARGUMENTS`

## Modes

- **Question Mode (t):** Claude reflects before each edit - asks questions if unsure about intent, approach, or side effects
- **Autonomous Mode (f):** Claude proceeds with edits without extra questioning (for when you're away or want faster execution)

## Action

Based on the argument provided:

- If `t`, `true`, `on`, or `1`: Create the file `ai/hook_question_toggle` to ENABLE question mode
- If `f`, `false`, `off`, or `0`: Delete the file `ai/hook_question_toggle` to DISABLE question mode
- If no argument: Report current state

Use Bash to create or remove the toggle file, then confirm the new state.

After toggling, output:
- "Question mode: ON - I'll ask clarifying questions before edits"
- "Question mode: OFF - Autonomous mode (faster, fewer questions)"
