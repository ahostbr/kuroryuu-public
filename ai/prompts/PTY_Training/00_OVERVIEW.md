# 00 — Overview (Inter‑Agent PTY Mastery)

## Goal
Train a thinker agent to produce **correct, reliable, auditable** operating knowledge for using a PTY daemon as an inter‑agent control channel (Leader → Worker terminals).

## Core idea
PTY is not “chat.” It is a privileged I/O bridge into a terminal session. Treat it like a transport that needs:
- deterministic completion detection (sentinel markers)
- read/write discipline (chunking + backpressure)
- recovery ladders (desync, prompts, hangs)
- evidence packs (audit trail)

## Standing constraints (copy into every prompt if needed)
- **All agents can use PTY**: workers prefer k_msg (or k_inbox) for coordination, PTY for leader dialogue. Thinkers use PTY for debate.
- **Evidence pack** for every PTY action (recommended).
- **Sentinel completion**: every command ends with a unique DONE marker.
- **Correct line endings** (PowerShell/Windows uses CRLF `\r\n`).
- Escalation: **observe → verify → intervene → emergency**.

## Training outcomes
After completing the pack, you should have:
- a crisp mental model
- an inter-agent “terminal protocol” (markers + rules)
- operator patterns for safe intervention
- a troubleshooting ladder
- runnable labs
- a filled runbook you can operate from
