# 04 — Failures & Recovery Prompt (Desync, Hangs, Truncation)

## Prompt (copy/paste)
You are diagnosing reliability and failure recovery for inter-agent PTY control.

### Constraints
- All agents can use PTY (workers prefer k_msg (or k_inbox) for coordination).
- Sentinel completion markers are mandatory.
- Emphasize deterministic recovery ladders.

### Deliverable
Create a failure-mode table with:
- Symptom
- Likely cause
- Detection method
- Immediate fix
- Preventative rule

Cover at least:
1) Missing DONE marker
2) Output truncated / too large
3) Prompt waiting for input
4) Shell stuck (no output)
5) Wrong line endings (LF vs CRLF)
6) Quoting/escaping issues (PowerShell vs bash)
7) Command produces ANSI control junk / progress bars
8) Worker terminal in a different mode (pager, editor)

Then define a **Recovery Ladder** (numbered steps) that the Leader should follow in order,
including when it is acceptable to use Ctrl+C and when to kill/recreate the session.

Finish with a “verification suite” of safe commands to confirm the shell is healthy again.
