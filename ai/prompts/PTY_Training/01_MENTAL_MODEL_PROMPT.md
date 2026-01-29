# 01 — Mental Model Prompt (Inter‑Agent PTY)

## Prompt (copy/paste)
You are a senior agent-systems educator. Teach me the PTY daemon **as an inter‑agent control channel** (Leader ↔ Worker terminals). Keep this inter‑agent-only: assume humans do not type commands; the Leader injects and reads programmatically.

### Constraints
- PTY is available to **all agents** (workers prefer k_inbox for coordination).
- Every action should be auditable with an evidence pack.
- Every injected command must end with a unique sentinel marker: `__KR_DONE_<id>__`.
- Use correct line endings; on PowerShell/Windows use `\r\n`.

### Deliverable
Write a crisp mental model with:
1) What PTY is and what it is not (vs inbox / message bus).
2) Session lifecycle: create/attach/read/write/run/resize/kill.
3) Output semantics: buffered reads, prompts, partial lines, echo.
4) Completion detection: why sentinel markers exist; what “done” means.
5) Common desync causes and how to recognize them (missing marker, mid‑prompt, hung process, wrong newline).
6) A short “golden path” sequence for a Leader controlling a Worker.

Do not be vague. Prefer short, exact explanations with concrete examples.
