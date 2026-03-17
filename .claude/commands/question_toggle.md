---
description: Toggle question mode - Claude asks clarifying questions before edits (t=on, f=off)
args: state
---

# Question Toggle

Toggle whether Claude asks clarifying questions before making edits.

## Usage
- `/question_toggle t` — Turn ON: Claude asks before editing
- `/question_toggle f` — Turn OFF: Claude edits without asking (default)

## Behavior

When **ON**: Before any file edit, ask the user what they want changed and confirm before proceeding.

When **OFF**: Normal behavior — edit files directly based on the request.

Set the mode based on the argument: `$ARGUMENTS`
