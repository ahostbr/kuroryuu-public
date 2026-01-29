# 06 — Leader PTY Runbook v1 (Inter‑Agent) — TEMPLATE

> Fill this in for your environment. Keep it open while operating.

## 1) Escalation Ladder
**Tier 0 — Observe**
- [ ] Read output buffer
- [ ] Confirm worker session context (pwd, repo, branch)
- [ ] Check running processes

**Tier 1 — Verify**
- [ ] Run idempotent checks only
- [ ] Confirm evidence pack started

**Tier 2 — Intervene**
- [ ] Only minimal nudges (newline, Y/N, rerun)
- [ ] Verify immediately after intervention

**Tier 3 — Emergency**
- [ ] Smallest safe patch
- [ ] Rollback plan ready
- [ ] Verify + document

## 2) Protocol Markers
- CMD:  `__KR_CMD_<id>__`
- DONE: `__KR_DONE_<id>__`
- ERR:  `__KR_ERR_<id>__`
- ACK:  `__KR_ACK_<id>__`

## 3) Golden Path (Leader)
1) Generate `id`
2) Inject command + DONE marker
3) Read loop until DONE/ERR
4) If timeout → recovery ladder
5) Verify state
6) Write evidence pack summary

## 4) Recovery Ladder (paste your final ladder here)
1)
2)
3)
4)
5)

## 5) Allowed Commands by Tier
### Tier 0 (observe-only)
- (list)

### Tier 1 (verify-only)
- (list)

### Tier 2 (intervene)
- (list)

### Tier 3 (emergency)
- (list)

## 6) Troubleshooting Table
| Symptom | First Action | Second Action | Escalate When |
|---|---|---|---|
| Missing DONE | Read again | Send newline | After N seconds |
| Hung cmd | Read | Ctrl+C | After N seconds |
| Prompt | Detect | Respond | After N attempts |

## 7) Evidence Pack Location & Naming
- Root folder:
- Naming scheme:
- Required attachments:
