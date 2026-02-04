# Real-Time Streaming Implementation Review

> **Generated:** 2026-02-04
> **Files Reviewed:**
> - `apps/desktop/src/renderer/hooks/useBashOutputStream.ts`
> - `apps/mcp_core/tools_bash.py` (`_emit_bash_output` function)
> - `apps/gateway/traffic/pty_models.py`
> - `apps/gateway/traffic/pty_websocket.py`
> - `apps/gateway/traffic/pty_router.py`
> - `apps/gateway/traffic/pty_storage.py`
> - `apps/desktop/src/renderer/components/coding-agents/SessionLogViewer.tsx`

---

## Executive Summary

The real-time streaming implementation for coding agents is **functional but has several areas for improvement**. The architecture follows a sensible pattern: MCP tool emits events → Gateway stores and broadcasts → Desktop consumes via WebSocket. However, there are bugs, race conditions, and code quality issues that should be addressed.

**Severity Summary:**
- 🔴 **Critical:** 1 issue (memory leak in reconnection logic)
- 🟠 **High:** 4 issues (race conditions, data loss scenarios)
- 🟡 **Medium:** 6 issues (code quality, missing error handling)
- 🟢 **Low:** 5 issues (style, minor optimizations)

---

## Architecture Overview

```
┌─────────────────┐     HTTP POST      ┌─────────────────┐     WebSocket     ┌─────────────────┐
│  MCP Core       │  ──────────────►   │  Gateway        │  ──────────────►  │  Desktop        │
│  tools_bash.py  │  /v1/pty-traffic/  │  pty_router.py  │  /ws/pty-traffic  │  useBashOutput  │
│                 │       emit         │  pty_websocket  │                   │  Stream.ts      │
└─────────────────┘                    └─────────────────┘                   └─────────────────┘
        │                                      │
        │                                      ▼
        │                              ┌─────────────────┐
        │                              │  pty_storage.py │
        │                              │  (SQLite)       │
        └──────────────────────────────┴─────────────────┘
```

---

## Critical Issues (🔴)

### 1. Memory Leak in WebSocket Reconnection Logic

**File:** `useBashOutputStream.ts:93-98`

**Problem:** The `isComplete` state is captured by closure when `connect` is created. If `isComplete` becomes true after the WebSocket closes, the stale closure still reads `false`, causing infinite reconnection attempts for completed sessions.

```typescript
// Current code
ws.onclose = () => {
  setIsConnected(false);
  // Don't reconnect if complete
  if (!isComplete && sessionId) {  // BUG: isComplete may be stale
    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, 2000);
  }
};
```

**Impact:** Memory leak and unnecessary network traffic. WebSocket keeps reconnecting even after session completes.

**Fix:** Use a ref to track completion state, or check state at reconnection time rather than closure creation time.

```typescript
// Suggested fix using ref
const isCompleteRef = useRef(false);

useEffect(() => {
  isCompleteRef.current = isComplete;
}, [isComplete]);

// In onclose handler:
if (!isCompleteRef.current && sessionId) {
  // ...reconnect
}
```

---

## High Severity Issues (🟠)

### 2. Race Condition Between Polling and Streaming

**File:** `SessionLogViewer.tsx:31-35`

**Problem:** The component uses both polling (2s interval) and WebSocket streaming simultaneously. When streaming is active, it **replaces** polled log entirely rather than merging. This can cause data loss if:
1. Streaming starts mid-session (misses earlier output)
2. WebSocket reconnects (loses events during disconnect window)

```typescript
// Current logic
const displayLog = session.running && streamOutput
  ? streamOutput  // When streaming, prefer stream output (more real-time)
  : log;          // When not running, use polled log
```

**Impact:** Users may see incomplete output, especially if they open the viewer after a session has been running.

**Recommendation:** Stream output should **append** to the polled baseline, not replace it. Consider:
```typescript
const displayLog = session.running && streamOutput
  ? log + streamOutput  // Append stream to baseline
  : log;
```

### 3. Silent Failure in HTTP Emit

**File:** `tools_bash.py:86-93`

**Problem:** The `_emit_bash_output` function silently swallows all exceptions, including connection errors. If the Gateway is down or slow, output events are lost with no retry mechanism.

```python
try:
    httpx.post(
        f"{GATEWAY_URL}/v1/pty-traffic/emit",
        json=event,
        timeout=1.0,
    )
except Exception:
    pass  # Don't block background process on emit failure
```

**Impact:** Real-time streaming becomes silently non-functional if Gateway is unavailable. No diagnostics available.

**Recommendation:**
1. Add a simple retry with exponential backoff (1-2 attempts max)
2. Log failures at DEBUG level for diagnostics
3. Consider buffering failed events for later retry (with size limit)

### 4. No Backpressure Handling in WebSocket Broadcast

**File:** `pty_websocket.py:237-251`

**Problem:** `broadcast_pty_event` sends to all clients synchronously within a lock. If any client is slow, it blocks all other clients. There's no queue or backpressure mechanism.

```python
async def broadcast_pty_event(self, event: Dict[str, Any]):
    async with self._broadcast_lock:  # All clients blocked during broadcast
        for connection in self.active_connections:
            try:
                await connection.send_json(message)  # Slow client blocks everyone
            except Exception as e:
                # ...
```

**Impact:** A single slow WebSocket client can degrade streaming for all connected clients.

**Recommendation:** Use per-client queues with bounded size, or use `asyncio.wait_for` with timeout per client.

### 5. Missing Session ID Validation

**File:** `tools_bash.py:177`

**Problem:** Session IDs are 8-character UUID snippets. There's no validation that they're unique or don't collide.

```python
session_id = str(uuid.uuid4())[:8]  # Only 8 chars - collision possible
```

**Impact:** With ~65k sessions, there's a ~1% chance of collision (birthday problem). Collision would cause output from different sessions to be merged.

**Recommendation:** Use at least 12 characters, or implement collision detection.

---

## Medium Severity Issues (🟡)

### 6. Duplicate Data Storage

**File:** `pty_router.py:199-202`

**Problem:** The emit endpoint creates previews even when `response` already has a preview, potentially overwriting provided values.

```python
if "command_preview" not in event_data and event_data.get("command"):
    event_data["command_preview"] = create_body_preview(event_data["command"])
if "response_preview" not in event_data and event_data.get("response"):
    event_data["response_preview"] = create_body_preview(event_data["response"])
```

This is correct behavior, but the `response` field stores full output chunks that can accumulate to large sizes. The 10KB truncation happens at storage time but events are broadcast at full size.

**Impact:** Large events consume bandwidth during WebSocket broadcast.

### 7. Missing Error Event Type Handling

**File:** `useBashOutputStream.ts:58-88`

**Problem:** The hook doesn't handle WebSocket "error" message types from the server. It only handles `ping` and `pty_event`.

```typescript
if (message.type === 'ping') {
  ws.send(JSON.stringify({ type: 'pong' }));
  return;
}
if (message.type === 'pty_event' && message.event) {
  // ...handle event
}
// No handling for message.type === 'error'
```

**Impact:** Server-sent errors are silently ignored.

### 8. Inconsistent Ping/Pong Implementation

**Files:** `useBashOutputStream.ts:63-64`, `pty_websocket.py:321-328`

**Problem:** The client sends `pong` with no timestamp when it receives `ping`, but the server expects a timestamp for connection health tracking.

Client:
```typescript
ws.send(JSON.stringify({ type: 'pong' }));  // No timestamp
```

Server expectation (based on ping format):
```python
ping_message = {
    "type": "ping",
    "timestamp": datetime.now().isoformat()
}
```

**Impact:** Minor - server uses `update_activity()` on message receipt anyway, but timestamp would allow latency measurement.

### 9. Thread Safety Issue in Session Storage

**File:** `tools_bash.py:185-192`

**Problem:** `BASH_SESSIONS` dict is modified by background threads without locking.

```python
BASH_SESSIONS[session_id] = session  # Main thread
# ...later in background thread:
session["output"].append(line.rstrip('\n'))  # No lock
session["exit_code"] = proc.returncode        # No lock
```

**Impact:** Potential data corruption under high concurrency (rare in practice).

### 10. Hardcoded WebSocket URL

**File:** `useBashOutputStream.ts:9`

```typescript
const WS_URL = 'ws://127.0.0.1:8200/ws/pty-traffic';
```

**Impact:** Won't work in production environments with different Gateway addresses.

**Recommendation:** Use environment variable or configuration.

### 11. No Unsubscribe on Session Change

**File:** `useBashOutputStream.ts:124-134`

**Problem:** When `sessionId` changes, the effect creates a new connection but doesn't send an unsubscribe message to the old connection before closing.

**Impact:** Minor - connection closes anyway, but cleaner to explicitly unsubscribe.

---

## Low Severity Issues (🟢)

### 12. Inefficient String Concatenation

**File:** `useBashOutputStream.ts:75-76`

```typescript
if (evt.response) {
  setOutput((prev) => prev + evt.response);  // String concat on every chunk
}
```

**Impact:** For very long outputs, this creates many intermediate strings. Consider using an array of chunks and joining on render.

### 13. Magic Numbers

**File:** `pty_websocket.py:18-19`

```python
PING_INTERVAL_SECONDS = 30
PONG_TIMEOUT_SECONDS = 60
```

These should be documented or made configurable.

### 14. Unused `is_final` in Storage

**File:** `pty_models.py`, `pty_storage.py`

The `is_final` field is emitted by `_emit_bash_output` but not stored in the database schema. The field is only used client-side.

### 15. Missing TypeScript Types for WebSocket Messages

**File:** `useBashOutputStream.ts`

The `WebSocketMessage` interface is minimal. Server can send more message types (`connected`, `subscribed`, `error`, etc.) that aren't typed.

### 16. No Cleanup of Old Sessions in Memory

**File:** `tools_bash.py:45`

```python
BASH_SESSIONS: Dict[str, Dict[str, Any]] = {}  # Never cleaned up
```

**Impact:** Long-running MCP Core process accumulates session data in memory.

---

## Positive Observations ✅

1. **Origin validation** on WebSocket connections (`pty_websocket.py:306-308`)
2. **Proper connection health monitoring** with ping/pong keep-alive
3. **Filter-based subscriptions** allow clients to receive only relevant events
4. **SQLite storage with retention limits** prevents unbounded growth
5. **Background task for broadcast** prevents blocking the HTTP response
6. **Graceful handling of disconnected clients** during broadcast

---

## Recommendations Summary

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 🔴 Critical | Fix reconnection memory leak | Low | High |
| 🟠 High | Merge polling + streaming output | Medium | High |
| 🟠 High | Add emit retry/logging | Low | Medium |
| 🟠 High | Add per-client send queues | Medium | Medium |
| 🟡 Medium | Increase session ID length | Low | Low |
| 🟡 Medium | Handle error message type | Low | Low |
| 🟡 Medium | Add thread locking for sessions | Low | Low |
| 🟡 Medium | Make WebSocket URL configurable | Low | Medium |

---

## Testing Recommendations

1. **Unit Tests:**
   - WebSocket reconnection behavior when session completes
   - Session ID collision detection
   - Thread safety of `BASH_SESSIONS`

2. **Integration Tests:**
   - Emit → Storage → Broadcast → Client receive flow
   - Gateway restart while streaming active
   - Slow client doesn't block fast clients

3. **Load Tests:**
   - Many concurrent sessions emitting
   - Many WebSocket clients subscribing to same session

---

## Conclusion

The streaming implementation is architecturally sound and mostly functional. The critical memory leak should be fixed immediately. The race condition between polling and streaming is the next priority as it affects user experience. Other issues are lower priority and can be addressed incrementally.
