---
description: Visual monitoring loop for worker context management (Kuroryuu)
---

# Leader Monitor

Visual monitoring loop for tracking worker context levels and triggering intervention when needed.

## Purpose

As Leader, you are responsible for monitoring worker context levels via screen capture (`latest.jpg`). When a worker's context drops to 20% (CLI warning level), you must intervene before auto-compact fires at 5%.

## Prerequisites

1. `k_capture` started (see `leader_prime.md` Step 6)
2. Workers registered and executing tasks
3. Access to `latest.jpg` via multimodal vision

## Monitoring Loop

### Poll Frequency

| Worker Activity | Poll Interval |
|-----------------|---------------|
| Workers idle | 60 seconds |
| Workers active (light work) | 30 seconds |
| Workers active (heavy tool use) | 15 seconds |

**Rationale:** Heavy tool use burns context faster. Poll more frequently to catch 20% threshold.

### Visual Check Process

```
1. Read latest.jpg via multimodal vision
2. Identify each worker terminal by title bar
3. Check context % indicator in status bar
4. If ANY worker at ≤20% → Begin intervention
```

## Intervention Threshold

**20%** - CLI warning appears here
**5%** - Auto-compact fires (too late for meaningful save)

```
├── 20% ── CLI warning appears ──────────┤  ← Leader MUST start here
│                                        │
│   15% window for entire sequence:      │
│   ESC → /savenow → /compact → /loadnow │
│                                        │
├── 5% ─── Auto-compact fires ───────────┤  ← /savenow must be DONE
```

**CRITICAL:** PreCompact hook is useless (race condition - MCP calls can't complete in time). You MUST intervene at 20%, not wait for auto-compact.

## Context Refresh Sequence

When you see worker at ≤20% context:

```
┌──────────────────────────────────────────────────────────────────┐
│              CONTEXT REFRESH SEQUENCE (AUTOMATIC)                 │
│                                                                   │
│  1. Resolve worker PTY:                                           │
│     worker_pty = k_pty(action="resolve", agent_id="worker_A")    │
│                                                                   │
│  2. ESC CONFIRMATION LOOP (ONE ESC per visual check - no spam!):  │
│     ┌─────────────────────────────────────────────────────────┐  │
│     │  ⚠️  CRITICAL: Multiple ESCs triggers REWIND feature!    │  │
│     │                                                          │  │
│     │  a. Send SINGLE ESC:                                     │  │
│     │     k_pty(action="write", session_id=..., data="\x1b")  │  │
│     │                                                          │  │
│     │  b. WAIT - Check latest.jpg - is worker stopped?         │  │
│     │     - Look for idle prompt, no streaming output          │  │
│     │                                                          │  │
│     │  c. If NOT stopped → WAIT → Send ONE more ESC            │  │
│     │     (max 3 total attempts, each with visual confirm)     │  │
│     │                                                          │  │
│     │  d. If still not stopped after 3 → Alert human           │  │
│     └─────────────────────────────────────────────────────────┘  │
│                                                                   │
│  3. CONFIRMED STOPPED → Send /savenow immediately:                │
│     k_pty(action="talk", session_id=..., command="/savenow")     │
│     (fires fast once worker is stopped)                           │
│                                                                   │
│  4. WAIT - watch latest.jpg for save completion                   │
│                                                                   │
│  5. Send /compact:                                                │
│     k_pty(action="talk", session_id=..., command="/compact")     │
│                                                                   │
│  6. WAIT ~60s - watch latest.jpg for ASCII art (ready signal)    │
│                                                                   │
│  7. Send /loadnow:                                                │
│     k_pty(action="talk", session_id=..., command="/loadnow")     │
│                                                                   │
│  8. WAIT - watch latest.jpg for load completion                   │
│                                                                   │
│  9. REASSIGN TASK via inbox (worker does NOT auto-continue):      │
│     k_inbox(action="send", to_agent="worker_A",                   │
│             subject="Continue task", body="Resume <task>...")     │
│     # Or use k_msg(action="send", to="worker_A", ...)             │
└──────────────────────────────────────────────────────────────────┘
```

## Error Handling

| Error | Response |
|-------|----------|
| ESC loop fails (3 attempts) | Alert human via response message (return question to orchestrator) |
| k_pty commands fail | Alert human (don't retry endlessly) |
| Worker burning context too fast | Consider earlier intervention threshold |
| Can't read latest.jpg | Check k_capture status, restart if needed |

## Visual Indicators

### Worker Stopped (safe to proceed)
- Idle prompt visible (`❯` or similar)
- No streaming output
- No spinner/progress indicator

### Worker Active (wait for stop)
- Text streaming
- Tool calls in progress
- Spinner/loading indicator

### Ready After Compact
- Kiro CLI ASCII art banner visible
- Fresh prompt ready
- Context indicator reset to high %

## Agent Instructions

```
You are the LEADER monitoring worker context levels.

MONITORING LOOP:
1. Every 15-30s, read latest.jpg via multimodal vision
2. Identify all worker terminals by title headers
3. Check each worker's context % in status bar
4. If ANY worker at ≤20% → Begin intervention immediately

ESC RULES (CRITICAL):
- Send ONE ESC at a time
- WAIT and visually confirm stopped before next action
- Multiple ESCs = REWIND trigger (dangerous)
- Max 3 attempts, then alert human

POST-INTERVENTION:
- Worker does NOT auto-continue after /loadnow
- You MUST reassign the task via k_inbox
- Include current task context in the message

TIMING:
- 20% → 5% is only 15% of context window
- Don't delay - start intervention immediately at 20%
- If /savenow not complete by 5%, auto-compact fires with blank checkpoint
```

## Key Paths

- **latest.jpg:** `<PROJECT_ROOT>/ai/capture/output/VisualDigest/latest/latest.jpg`
- **Checkpoints:** `<PROJECT_ROOT>/ai/checkpoints/`

## Checkpoint Considerations During Monitoring

**Critical timing:** Context refresh sequence (ESC → /savenow → /compact → /loadnow) MUST complete before auto-compact at 5%.

**Before intervention:**
- Current checkpoint auto-saved at task start
- Do NOT manually save during ESC loop (race conditions)

**During intervention:**
- /savenow: Appends current work to existing checkpoint
- /compact: Compresses checkpoint after save
- /loadnow: Restores from compressed checkpoint

**After intervention:**
- Worker loads from checkpoint automatically
- Leader MUST reassign task via inbox
- Reassign message should reference checkpoint restoration state

**Checkpoint data after monitoring MUST include:** `plan_file`, `worklog_files`, `task_ids`
