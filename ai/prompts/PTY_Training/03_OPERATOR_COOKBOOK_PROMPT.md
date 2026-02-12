# 03 — Operator Cookbook Prompt (Leader Controlling Worker)

## Prompt (copy/paste)
You are writing a practical cookbook for operating PTY as a Leader controlling Worker terminals, with a strict escalation ladder.

### Constraints
- Inter-agent only.
- All agents can use PTY (workers prefer k_msg (or k_inbox) for coordination).
- Evidence pack recommended for PTY interventions.
- Sentinel completion markers required for all injected commands.

### Deliverable
Produce a cookbook with four sections:

1) OBSERVE patterns (read-only)
- Confirm what the Worker is doing without changing state.
- Examples: process checks, current directory, git status, last command output location.

2) VERIFY patterns (idempotent)
- Prove claims: file exists, grep, git diff, tool version, service status.

3) INTERVENE patterns (minimal change)
- Unstick: send Enter, answer Y/N, re-run with flags, re-source env, restart a single command.

4) EMERGENCY patterns (last resort)
- Minimal patch discipline: smallest safe patch, immediate verification, rollback plan.

For each pattern:
- give example injected commands for PowerShell and bash where relevant
- include the DONE marker pattern
- state success criteria and a follow-up verify command

End with a “do not do” list (high-risk operations requiring explicit escalation).
