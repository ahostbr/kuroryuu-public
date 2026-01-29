---
description: Initialize leader session with buffer-first monitoring (Kuroryuu)
requires: KURORYUU_TERM_BUFFER_ACCESS=on (default)
---

# Leader Prime (Buffer-First)

Initialize the leader agent session with buffer-first monitoring workflow. Uses `k_pty(action="term_read")` as primary monitoring method instead of vision.

## Buffer vs Vision

| Approach | Latency | When to Use |
|----------|---------|-------------|
| **term_read (primary)** | <200ms | Terminal text, context %, logs |
| **Vision (fallback)** | ~10s | GUI state, layout, non-terminal info |

## Prerequisites

Before this prompt executes, ensure:
1. Kuroryuu gateway is running (port 8200)
2. MCP server is accessible (port 8100)
3. You have read `KURORYUU_BOOTSTRAP.md`
4. Buffer access is enabled (default: `on`, toggle via Desktop UI or env)

Verify buffer access is enabled:
```python
k_pty(action="help")  # Check term_buffer_access.current_mode
```

## Initialization Steps

### Step 1-5: Standard Initialization

Follow Steps 1-5 from `leader_prime.md`:
1. Register as Leader
2. Load Project North Star (PRD)
3. Check Orchestration State
4. Load Harness State
5. Check Worker Status

### Step 6: Initialize Buffer-First Monitoring

**Instead of** starting vision capture as primary:

```python
# Register delta markers for each worker PTY
workers = await fetch("/v1/agents?role=worker")
markers = {}

for worker in workers:
    session = k_pty(action="resolve", agent_id=worker["agent_id"])
    if session["ok"]:
        # Register delta marker (first call returns marker_id)
        result = k_pty(
            action="term_read",
            session_id=session["session_id"],
            mode="delta",
            max_lines=0  # Just get marker, no content
        )
        markers[worker["agent_id"]] = result["marker_id"]
```

**Vision as fallback** (start but use less frequently):
```python
k_capture(action="start", fps=0.5, digest=True, digest_fps=0.05)
```

## Buffer Monitoring Loop

### Primary Check (every 5-15s)

```python
for worker_id, marker_id in markers.items():
    session = k_pty(action="resolve", agent_id=worker_id)

    # Read new output since last check (start small - 5 lines)
    result = k_pty(
        action="term_read",
        session_id=session["session_id"],
        mode="delta",
        marker_id=marker_id,
        max_lines=5  # Start small, work up as needed
    )

    if result["ok"]:
        # Parse text for context indicator
        text = result["text"]

        # Look for context % patterns
        # e.g., "Context: 45%" or "[45%]" or "45% remaining"
        context_match = re.search(r'(\d+)%', text)
        if context_match:
            context_pct = int(context_match.group(1))
            if context_pct <= 20:
                # INTERVENE - see leader_monitor_buffer.md
                pass

        # Update marker for next delta check
        markers[worker_id] = result["marker_id"]
```

### Fallback Vision Check (every 60s)

Only use vision for:
- GUI layout verification
- Non-terminal elements
- When term_read fails

```python
# Check if buffer monitoring failed recently
if buffer_errors > 2:
    k_capture(action="screenshot")
    # Read latest.jpg via multimodal vision
```

## Context Block

Same as `leader_prime.md` with additional:

```json
{
  "monitoring": {
    "mode": "buffer-first",
    "buffer_access": "on",
    "worker_markers": {
      "worker_A": 12345,
      "worker_B": 12346
    },
    "vision_fallback": "enabled"
  }
}
```

## Advantages of Buffer-First

1. **Speed**: <200ms vs ~10s for vision
2. **Accuracy**: 100% text fidelity vs OCR errors
3. **Efficiency**: No vision API cost for text extraction
4. **Polling friendly**: Delta mode only returns new content
5. **Scriptable**: Parse structured output reliably

## When to Fall Back to Vision

- Worker terminal not found (session issue)
- Buffer read timeout (desktop not responding)
- Need to verify GUI state (layout, windows)
- Worker using TUI application (alternate buffer)

## Agent Instructions

```
You are the LEADER initializing a Kuroryuu session with BUFFER-FIRST monitoring.

CRITICAL DIFFERENCE from standard leader_prime.md:
- Primary monitoring via k_pty(action="term_read")
- Vision is FALLBACK only
- Register delta markers for each worker

INITIALIZATION:
1. Verify buffer access is enabled (default: on)
2. Complete standard Steps 1-5
3. Register delta markers for all workers
4. Start vision capture at reduced frequency

MONITORING STRATEGY:
- term_read every 5-15 seconds (fast, cheap)
- Vision every 60 seconds (slow, expensive)
- Switch to vision if buffer fails

PTY ACCESS:
- All agents can use k_pty for terminal operations
- Use k_inbox as primary coordination channel

After initialization, proceed to leader_monitor_buffer.md for the monitoring loop.
```
