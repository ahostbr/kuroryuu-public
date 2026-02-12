# PTY Daemon Inter‑Agent Training Prompt Pack

Created: 2026-01-12
Updated: 2026-01-17 (PTY open to all agents)

This pack contains ready-to-use **training prompts** and **runbook templates** for mastering a PTY daemon as an **inter‑agent control channel** (all agents can use PTY).

## How to use
1. Pick a module `NN_*.md`.
2. Copy the **Prompt** section into your Thinker/Trainer agent.
3. Have the agent answer directly into your notes (or into a new doc).
4. Apply the Labs in order if you want hands-on mastery.

## Pack contents
- `00_OVERVIEW.md` — scope, constraints, and training goals
- `01_MENTAL_MODEL_PROMPT.md` — build correct PTY mental model for inter-agent use
- `02_PROTOCOL_V1_PROMPT.md` — define a reliable marker/sentinel protocol over PTY IO
- `03_OPERATOR_COOKBOOK_PROMPT.md` — patterns for observe/verify/intervene/emergency
- `04_FAILURES_RECOVERY_PROMPT.md` — failure modes + recovery ladder
- `05_LABS_PROMPT.md` — 8 progressive inter-agent labs
- `06_RUNBOOK_TEMPLATE.md` — fillable Leader PTY runbook v1
- `07_EVIDENCE_PACK_TEMPLATE.md` — copy/paste evidence artifact template

## Notes
- This is intentionally **inter‑agent only** for terminal communication.
- All agents can use PTY. Workers prefer k_msg (or k_inbox) for coordination, PTY for leader dialogue. Thinkers use PTY for direct debate.
- Replace marker strings and shell specifics as needed for your environment.
