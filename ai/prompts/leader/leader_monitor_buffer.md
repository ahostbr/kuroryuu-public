---
description: Buffer-first monitoring loop for worker context management (Kuroryuu)
requires: KURORYUU_TERM_BUFFER_ACCESS=on (default)
---

# Leader Monitor (Buffer-First)

Buffer-first monitoring loop for tracking worker context levels. Uses `k_pty(action="term_read")` as primary method instead of vision.

## Purpose

Monitor worker context levels via terminal buffer text extraction. Intervene at 20% context before auto-compact fires at 5%. Vision is fallback only.

## Prerequisites

1. Buffer monitoring initialized (see `leader_prime_buffer.md`)
2. Delta markers registered for each worker
3. Workers executing tasks
4. Buffer access enabled (default: `on`, toggle via Desktop UI or env)

## Monitoring Loop

### Poll Frequency

| Method | Frequency | Use Case |
|--------|-----------|----------|
| **term_read (delta)** | 5-15s | Context %, output parsing |
| **Vision (fallback)** | 60s | GUI verification, layout |

### Buffer Check Process

```python
async def monitor_worker_buffer(worker_id, marker_id, session_id):
    # Read new output since last marker
    result = k_pty(
        action="term_read",
        session_id=session_id,
        mode="delta",
        marker_id=marker_id,
        max_lines=5,  # Start small (5 lines), work up as needed
        merge_wrapped=True
    )

    if not result["ok"]:
        # Fallback to vision
        return await monitor_worker_vision(worker_id)

    text = result["text"]
    new_marker_id = result["marker_id"]

    # Parse context percentage from status line
    context_pct = parse_context_percentage(text)

    if context_pct is not None and context_pct <= 20:
        # INTERVENTION REQUIRED
        await begin_intervention(worker_id, session_id)

    return new_marker_id
```

### Context Percentage Patterns

Kiro CLI displays context in status bar. Look for:

```python
def parse_context_percentage(text):
    """Extract context % from terminal output."""
    patterns = [
        r'Context:\s*(\d+)%',      # "Context: 45%"
        r'\[(\d+)%\]',             # "[45%]"
        r'(\d+)%\s*remaining',     # "45% remaining"
        r'context\s*(\d+)%',       # "context 45%"
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return int(match.group(1))

    return None
```

## Intervention Threshold

Same as `leader_monitor.md`:
- **20%** - CLI warning appears, MUST intervene
- **5%** - Auto-compact fires (too late)

## Buffer-Aware Context Refresh Sequence

When worker at ≤20% context:

```
┌──────────────────────────────────────────────────────────────────┐
│           BUFFER-FIRST CONTEXT REFRESH SEQUENCE                   │
│                                                                   │
│  1. Resolve worker PTY (already have session_id):                │
│     session_id = ... (from monitoring loop)                       │
│                                                                   │
│  2. ESC CONFIRMATION via BUFFER (faster than vision):            │
│     ┌─────────────────────────────────────────────────────────┐  │
│     │  a. Send SINGLE ESC:                                     │  │
│     │     k_pty(action="write", session_id=..., data="\x1b")  │  │
│     │                                                          │  │
│     │  b. WAIT 2s, then buffer check:                          │  │
│     │     result = k_pty(action="term_read",                   │  │
│     │                    session_id=...,                       │  │
│     │                    mode="viewport", max_lines=5)         │  │
│     │                                                          │  │
│     │  c. Check for idle prompt in result["text"]:             │  │
│     │     - "❯ " or "$ " or "> " at end                        │  │
│     │     - No "..." or spinner characters                     │  │
│     │                                                          │  │
│     │  d. If NOT stopped → WAIT 2s → Send ONE more ESC         │  │
│     │     (max 3 attempts with buffer confirmation each time)  │  │
│     └─────────────────────────────────────────────────────────┘  │
│                                                                   │
│  3. CONFIRMED STOPPED → Send /savenow:                            │
│     k_pty(action="talk", session_id=..., command="/savenow")     │
│                                                                   │
│  4. BUFFER POLL for save completion (faster than vision):         │
│     while True:                                                   │
│         result = k_pty(action="term_read", mode="viewport",      │
│                       session_id=..., max_lines=10)              │
│         if "Checkpoint saved" in result["text"]:                 │
│             break                                                 │
│         await sleep(1)                                            │
│                                                                   │
│  5. Send /compact:                                                │
│     k_pty(action="talk", session_id=..., command="/compact")     │
│                                                                   │
│  6. BUFFER POLL for compact completion:                           │
│     - Look for ASCII art banner                                   │
│     - Look for fresh prompt                                       │
│     - Timeout: 60s                                                │
│                                                                   │
│  7. Send /loadnow:                                                │
│     k_pty(action="talk", session_id=..., command="/loadnow")     │
│                                                                   │
│  8. BUFFER POLL for load completion:                              │
│     - Look for "Loaded checkpoint"                                │
│     - Look for "Ready to continue"                                │
│                                                                   │
│  9. REASSIGN TASK via inbox:                                      │
│     k_inbox(action="send", to_agent="worker_A",                   │
│             subject="Continue task", body="Resume <task>...")     │
│     # Or use k_msg(action="send", to="worker_A", ...)             │
│                                                                   │
│  10. Register NEW delta marker (fresh session):                   │
│      result = k_pty(action="term_read", mode="delta",            │
│                     session_id=..., max_lines=0)                 │
│      new_marker = result["marker_id"]                             │
└──────────────────────────────────────────────────────────────────┘
```

## Buffer vs Vision Detection

### Worker Stopped (via buffer)
```python
def is_worker_stopped(text):
    """Check if worker is at idle prompt."""
    lines = text.strip().split('\n')
    if not lines:
        return False

    last_line = lines[-1].strip()

    # Common idle prompts
    idle_patterns = [
        r'^❯\s*$',           # Fish/Starship
        r'^\$\s*$',          # Bash
        r'^>\s*$',           # PowerShell
        r'^[A-Za-z]:\\.*>\s*$',  # Windows cmd
    ]

    return any(re.match(p, last_line) for p in idle_patterns)
```

### Save Complete (via buffer)
```python
def is_save_complete(text):
    """Check if /savenow completed."""
    indicators = [
        "Checkpoint saved",
        "checkpoint_",
        "Saved:",
    ]
    return any(ind.lower() in text.lower() for ind in indicators)
```

### Compact Complete (via buffer)
```python
def is_compact_complete(text):
    """Check if /compact completed."""
    # ASCII art banner or fresh prompt with high context
    if "claude" in text.lower() and ("code" in text.lower() or "%" in text):
        return True
    # High context % visible
    match = re.search(r'(\d+)%', text)
    return match and int(match.group(1)) > 80
```

## Error Handling

| Error | Response |
|-------|----------|
| term_read timeout | Switch to vision fallback |
| Marker disposed | Register new marker, use tail mode |
| ESC loop fails (3 attempts) | Alert human via response message (return question to orchestrator) |
| Session not found | Re-resolve worker PTY |
| Alternate buffer detected | Vision fallback (TUI in use) |

## Agent Instructions

```
You are the LEADER monitoring workers via BUFFER-FIRST approach.

PRIMARY METHOD: k_pty(action="term_read")
FALLBACK: Vision via k_capture + latest.jpg

PTY ACCESS:
- All agents can use k_pty for terminal operations
- Buffer access default: on (toggle via Desktop UI)
- Use k_msg (or k_inbox) as primary coordination channel

MONITORING LOOP (every 5-15s):
1. For each worker: read delta buffer (new output since last check)
2. Parse text for context percentage
3. If context <= 20% → Begin intervention immediately
4. Update delta marker for next iteration

ESC CONFIRMATION via BUFFER (faster than vision):
1. Send ONE ESC
2. Wait 2s, then term_read(mode="tail", max_lines=5)
3. Check for idle prompt pattern
4. Repeat max 3 times if not stopped

ADVANTAGES:
- <200ms latency vs ~10s for vision
- 100% text accuracy vs OCR errors
- Delta mode = only new content (efficient)
- Available to ALL agents

FALLBACK TRIGGERS:
- term_read returns error
- Alternate buffer detected (TUI app)
- Session not found
- Need GUI layout verification
```

## Key Paths

- **Checkpoints:** `<PROJECT_ROOT>/ai/checkpoints/`
- **Fallback latest.jpg:** `<PROJECT_ROOT>/ai/capture/output/VisualDigest/latest/latest.jpg`
