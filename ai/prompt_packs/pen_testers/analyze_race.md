---
id: analyze_race
name: Pentest Race Condition Analysis
category: analysis
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Race Condition Analysis

## Objective

Identify shared mutable state accessed without proper synchronization — TOCTOU windows, double-spend opportunities, concurrent file operations, session races, and database races — that an attacker can exploit with parallel requests.

## Inputs

- `Docs/reviews/pentest/<run_id>/recon.md`
- `{{REPO_PATH}}`

## Method

1. **TOCTOU patterns**: find sequences where the application checks a condition (balance sufficient, resource exists, permission granted, file safe to write) and then acts on it, with no atomic guarantee between check and use. Look for separate `SELECT` then `UPDATE` without `SELECT ... FOR UPDATE`, file `stat()` then `open()`, permission check then resource allocation.
2. **Financial double-spend**: identify endpoints that debit/credit balances, consume vouchers, redeem tokens, or apply discounts. Confirm whether the operation is wrapped in a serializable database transaction. Flag optimistic locking without retry-on-conflict, and compare-and-swap patterns that miss concurrent update scenarios.
3. **Limit bypass**: find rate-limited or one-time-use resources (password reset tokens, email verification links, one-time codes, referral bonuses, trial activations). Check whether parallel requests can consume the resource multiple times before the consumed state is persisted.
4. **Concurrent file access**: find temporary file creation, log rotation, PID file writes, and session file updates without exclusive locks (`flock`, `O_EXCL`, advisory locks). Assess symlink race conditions in world-writable directories.
5. **Session races**: identify session fixation or session attribute update flows where two concurrent requests on the same session could produce inconsistent state (e.g., privilege escalation mid-request during role change).
6. **Database-level races**: find missing row-level locks in multi-step transactions, missing `SERIALIZABLE` isolation where needed, and application-level "optimistic" patterns without proper conflict detection.
7. **Async/event-loop races**: in Node.js or async Python, find shared mutable state (in-memory maps, counters, caches) modified across `await` points without mutex protection.

## Output Files

- `Docs/reviews/pentest/<run_id>/race_analysis.md`
- `Docs/reviews/pentest/<run_id>/race_queue.json`

## Queue Schema

```json
{
  "vulnerabilities": [
    {
      "id": "RACE-001",
      "class": "toctou|double_spend|limit_bypass|file_race|session_race|db_race|async_race",
      "endpoint": "POST /api/example",
      "window": "path/file.ext:line_check — path/file.ext:line_act",
      "shared_state": "database_row|file|in_memory_map|session|cache",
      "concurrency_needed": "2|N parallel requests",
      "locking_present": "none|optimistic|pessimistic_inadequate",
      "confidence": "high|med|low",
      "exploit_hint": "minimal witness"
    }
  ]
}
```
