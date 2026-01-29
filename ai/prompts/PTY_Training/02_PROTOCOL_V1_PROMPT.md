# 02 — Protocol v1 Prompt (Markers + Rules)

## Prompt (copy/paste)
You are designing a lightweight, reliable **inter‑agent terminal protocol** that runs over PTY I/O. The Leader injects commands into a Worker’s terminal and reads output until completion.

### Constraints
- All agents can use PTY (workers prefer k_inbox for coordination).
- Every command MUST have deterministic completion detection.
- Commands must be safe-by-default: verify before mutate.
- Design for PowerShell and bash/zsh differences (quoting + newlines).

### Deliverable
Produce **Protocol v1** with:

A) Marker vocabulary
- `__KR_CMD_<id>__`  (optional start marker)
- `__KR_DONE_<id>__` (required completion marker)
- `__KR_ERR_<id>__`  (explicit failure marker)
- `__KR_ACK_<id>__`  (optional acknowledgement marker)

B) Command envelope format
- The exact string the Leader should inject (include how to append DONE)
- Examples for:
  - PowerShell
  - bash/zsh

C) Reader algorithm (Leader-side)
- Read loop pseudocode: chunk read → append → scan for DONE/ERR → stop.
- Timeouts: soft timeout vs hard timeout.
- Backpressure: if output is huge, how to keep reading without losing markers.

D) Interactive prompt handling
- A strategy to detect prompts (common patterns) and respond.
- A safe “confirm state” command after responding.

E) Recovery ladder when DONE never appears
- Step 1: read again
- Step 2: send newline
- Step 3: send Ctrl+C (if allowed)
- Step 4: kill + recreate session
- Step 5: rehydrate context (pwd, env, repo, branch)

F) Safety tiers (allowed commands by escalation)
- Tier 0: observe only
- Tier 1: verify + non-mutating
- Tier 2: minimal intervention
- Tier 3: emergency hotfix

Make it specific enough that an engineer could implement it without guessing.
