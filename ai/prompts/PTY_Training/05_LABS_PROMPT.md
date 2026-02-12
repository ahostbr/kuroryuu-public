# 05 — Labs Prompt (8 Progressive Inter‑Agent Labs)

## Prompt (copy/paste)
You are designing hands-on labs to train inter-agent PTY mastery (Leader controlling Worker terminal).

### Constraints
- All agents can use PTY (workers prefer k_msg (or k_inbox) for coordination)
- Every lab must use DONE markers and correct newlines (PowerShell uses CRLF)
- Each lab must include success and failure criteria and fixes

### Deliverable
Create 8 labs:

Lab 1) Attach + Read
Lab 2) Sentinel run (simple command + DONE)
Lab 3) Long output chunking (read loops)
Lab 4) Interactive prompt (Y/N)
Lab 5) Desync simulation (omit DONE → recover)
Lab 6) Interrupt a hung command (Ctrl+C ladder)
Lab 7) Kill + recreate PTY session and restore context
Lab 8) Full evidence pack on a real intervention scenario

Each lab must include:
- Goal
- Setup
- Exact injected strings (PowerShell + bash variants when relevant)
- Reader loop expectations (what to read for)
- Success output signature
- Failure modes + remediation

Make these labs runnable and concrete.
