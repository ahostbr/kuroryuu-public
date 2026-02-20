# k_pty Internals — Definitive Reference

> **Source files:**
> - `apps/mcp_core/tools_pty.py` — MCP tool layer (action router)
> - `apps/mcp_core/pty_manager.py` — Local PTY lifecycle (pywinpty / tmux)
> - `apps/mcp_core/pty_registry.py` — Central session registry
> - `apps/mcp_core/pty_persistence.py` — Disk persistence
> - `apps/mcp_core/pty_backend_tmux.py` — Linux tmux backend
> - `apps/mcp_core/command_security.py` — Command blocking + secret redaction
> - `apps/mcp_core/server.py` — MCP Core HTTP endpoints (`/v1/pty/*`)
> - `apps/desktop/src/main/pty/bridge.ts` — Desktop HTTP bridge (port 8201)
> - `apps/gateway/traffic/pty_router.py` — Traffic event visualization
> - `apps/gateway/mcp/pty_client.py` — Gateway → MCP ownership update client

---

## 1. Architecture Overview

k_pty operates across two distinct session sources:

```
┌─────────────────────────────────────────────────────────────────┐
│                      k_pty MCP Tool                             │
│                    (tools_pty.py)                               │
└────────────────────┬────────────────────────────────────────────┘
                     │  action router
          ┌──────────┴──────────┐
          │                     │
   ┌──────▼──────┐      ┌───────▼────────┐
   │  PTYRegistry │      │   PTYManager   │
   │ (registry.py)│      │  (manager.py)  │
   └──────┬──────┘      └───────┬────────┘
          │                     │
    source="desktop"      source="local"
          │                     │
   ┌──────▼──────┐      ┌───────▼────────┐
   │  Desktop     │      │  pywinpty      │
   │  Bridge      │      │  (Windows)     │
   │  :8201       │      │  or tmux       │
   │  (bridge.ts) │      │  (Linux)       │
   └─────────────┘      └────────────────┘
          │
   ┌──────▼──────┐
   │  xterm.js   │
   │  (renderer) │
   │  via IPC    │
   └─────────────┘
```

**Local sessions** — spawned by MCP Core directly. Use pywinpty on Windows, tmux on Linux. Session IDs: `pty_<8 hex chars>`.

**Desktop sessions** — spawned by the Electron app (node-pty). Registered with MCP Core via `POST /v1/pty/register`. Commands are proxied through the Desktop bridge HTTP server at `http://127.0.0.1:8201`. Term buffer reads go through IPC to the xterm.js renderer.

The **PTYRegistry** is the routing table: given a session_id, it tells `tools_pty.py` whether to call `PTYManager` directly or proxy through the Desktop bridge.

---

## 2. All Actions

### `help`
Returns available actions, current `TERM_BUFFER_ACCESS` mode, and `pywinpty_available` flag.

No params required.

---

### `list`
Returns all active sessions: local (from `PTYManager`) + desktop (from `PTYRegistry`).

```json
{
  "ok": true,
  "sessions": [...],
  "count": 4,
  "by_source": {"local": 1, "desktop": 3}
}
```

Each session object has `source` field (`"local"` or `"desktop"`).

---

### `create`
Creates a **local** PTY session via `PTYManager.spawn()`.

| Param | Default | Notes |
|-------|---------|-------|
| `shell` | `powershell.exe` (Windows) / `/bin/bash` (Linux) | Shell executable |
| `cwd` | project root | Working directory (must exist) |
| `cols` | 120 | Terminal width |
| `rows` | 30 | Terminal height |

Returns: `{ok, session_id, shell, cwd, cols, rows}`

Session ID format: `pty_<8 hex chars>` (UUID-based, e.g. `pty_a3f87c2d`).

After spawn, a background reader thread (`_background_reader`) continuously drains the PTY output into an in-memory `OutputBuffer` (ring buffer, 100KB default max). The session is registered in `PTYManager._sessions` dict before the reader thread starts.

---

### `send_line`
Sends a single line of text to the PTY, then sends Enter (`\r` only — no `\n`).

| Param | Required | Notes |
|-------|----------|-------|
| `session_id` | yes | PTY session ID |
| `data` | yes | Text to type (no newlines — they are stripped) |

**Implementation detail:** Strips all `\r` and `\n` from `data` before writing, then sends a separate `\r` (CR only). This enforces one-line-at-a-time semantics and prevents multi-command injection via embedded newlines.

**Escape processing:** `_process_escape_sequences()` runs first — converts literal `\r\n` text to real CR+LF, `\xNN` hex sequences, and isolated `\r`/`\n`/`\t` sequences. Avoids Python's `unicode_escape` decoder to prevent mangling Windows paths like `C:\Users\`.

Desktop sessions: two separate `/pty/write` calls to the bridge (data, then `\r`).

Emits event to Gateway `POST /v1/pty-traffic/emit` (fire-and-forget, 2s timeout).

---

### `read`
Reads from the PTY output ring buffer.

| Param | Default | Notes |
|-------|---------|-------|
| `session_id` | — | Required |
| `max_bytes` | 4096 | Returns most-recent N bytes from buffer |
| `timeout_ms` | 5000 | Wait for data if buffer empty |

**Important:** Returns the **most recent** `max_bytes` from the full buffer, not a FIFO read. The buffer is NOT cleared on read — reads are non-destructive. For local sessions, waits up to `timeout_ms` if buffer is empty (polling every 10ms).

Desktop sessions: calls `POST /pty/read` on the bridge, which collects live xterm.js `data` events for up to `min(timeout_ms, 5000)` ms.

---

### `talk`
Execute a command with sentinel-based completion detection. This is the high-level "run a command and get its output" action.

| Param | Default | Notes |
|-------|---------|-------|
| `session_id` | — | Required |
| `command` | — | Required (processed through escape handler) |
| `sentinel` | auto-generated | `__KR_DONE_<8 hex>__` if not provided |
| `timeout_ms` | 30000 | Timeout in ms |

**Local session flow:**
1. Clears the output buffer
2. Writes `<command>; echo <sentinel>\r\n`
3. Polls buffer every 50ms until sentinel appears or timeout
4. Strips command echo (first line) and sentinel from output
5. Returns clean output

**Desktop session flow:** proxies to `POST /pty/talk` on the bridge, which calls `runWithSentinel()` (embedded mode) or a write+wait+read pattern (daemon mode). Auto-generates sentinel via `sentinel || ""` — bridge generates if empty string passed.

Returns: `{ok, output, sentinel, raw_output}` (local) or bridge-specific response.

> `run` is an alias for `talk` (backwards compatibility).

---

### `term_read`
Reads the **xterm.js terminal buffer** text — NOT the raw PTY byte stream. Viewport-constrained, rendered text. Only works for **desktop sessions**.

**Gate:** `KURORYUU_TERM_BUFFER_ACCESS` env var. Default: `on`. Set to `off` to disable entirely.

| Param | Default | Cap | Notes |
|-------|---------|-----|-------|
| `session_id` | — | — | Required, must be a desktop session |
| `mode` | `tail` | — | `tail`, `viewport`, or `delta` |
| `max_lines` | 40 | 200 | Hard cap enforced in Python |
| `max_chars` | 12000 | 50000 | Hard cap enforced in Python; truncation reported in response |
| `merge_wrapped` | `true` | — | Merge terminal line wraps for readability |
| `marker_id` | `null` | — | Required for `delta` mode (from previous call) |

**Read modes:**

| Mode | What it returns |
|------|-----------------|
| `tail` | Last `max_lines` lines from the xterm.js buffer (scrollback + active) |
| `viewport` | Only what's currently visible in the terminal window |
| `delta` | Only content added since a marker was set (incremental reads) |

**Delta mode workflow:**
```python
# First call: get content + receive marker_id
r1 = k_pty(action="term_read", session_id=sid, mode="delta")
marker = r1["marker_id"]

# Subsequent calls: pass marker_id to get only new content
r2 = k_pty(action="term_read", session_id=sid, mode="delta", marker_id=marker)
new_marker = r2["marker_id"]
```

Markers are set in xterm.js and can become "disposed" if the buffer scrolls past them. Check `marker_disposed: true` in response.

**Full response shape:**
```json
{
  "ok": true,
  "text": "...",
  "lines": ["line1", "line2"],
  "truncated": false,
  "dropped_chars": 0,
  "cursor_line": 24,
  "viewport_y": 0,
  "rows": 30,
  "cols": 120,
  "buffer_type": "normal",
  "marker_id": 42,
  "marker_line": 100,
  "marker_disposed": false
}
```

**Secret redaction:** `_redact_secrets()` runs on all term_read output before returning. Patterns: `sk-*`, `ghp_*`, `Bearer *`, `export *TOKEN=*`, `ANTHROPIC_API_KEY=*`, `OPENAI_API_KEY=*`.

---

### `resolve`
Resolves owner identity to a PTY session_id. Deterministic — returns exactly one result or errors.

| Param | Notes |
|-------|-------|
| `agent_id` | Primary routing key (owner_agent_id in registry) |
| `owner_session_id` | Secondary key (k_session.session_id) |
| `label` | Tertiary key (human-friendly, e.g. "Worker A") |

At least one param required.

**Match logic:** Iterates all registered sessions, matches on any provided key. Returns:
- 1 match → `{ok: true, session_id, session: {...}}`
- 0 matches → `{ok: false, error_code: "NOT_FOUND"}`
- >1 match → `{ok: false, error_code: "AMBIGUOUS", matches: [...]}`

**Never broadcasts.** Ambiguity is an explicit error, not a fan-out.

---

### `send_line_to_agent`
Convenience wrapper: `resolve` → `send_line`. Sends a line to the PTY owned by a specific agent without knowing their session_id.

| Param | Required | Notes |
|-------|----------|-------|
| `data` | yes | Text to type |
| `agent_id` / `owner_session_id` / `label` | at least one | Routing identity |

Returns: `{ok, resolved_session_id, resolved_session, send_result}`

---

### `resize`
Resize a local PTY session. **Not available for desktop sessions** (returns `DESKTOP_RESIZE_DISABLED` — use the Desktop UI instead).

| Param | Required |
|-------|----------|
| `session_id` | yes |
| `cols` | yes |
| `rows` | yes |

---

### `write` (DEPRECATED)
Always returns `{ok: false, error_code: "DEPRECATED"}`. Use `send_line` or `talk`. The raw `/pty/write` HTTP endpoint was removed for security hardening, but `send_line` uses the same underlying write path internally.

---

## 3. PTY Session Creation and Tracking

### Local Session Lifecycle

```
k_pty(action="create")
  → PTYManager.spawn()
      → PtyProcess.spawn(shell, cwd, dimensions=(rows, cols))
      → session_id = "pty_" + uuid4().hex[:8]
      → PTYSession created (in-memory)
      → Registered in PTYManager._sessions[session_id]
      → Background reader thread started
  → Returns {ok, session_id, shell, cwd, cols, rows}
```

The **background reader thread** (`_background_reader`):
- Calls `process.read(4096)` in a tight loop
- Appends all output to `OutputBuffer` (deque-based ring buffer)
- Every 100 read cycles (~10KB), schedules a debounced buffer persistence save (1s debounce for metadata, 5s for buffers)
- Stops on `EOFError` (process exited) or `_stop_reader = True`

The `OutputBuffer` is a deque of string chunks with configurable max size (default 100KB). On overflow, the oldest chunks are removed from the left. Thread-safe with a `threading.Lock`.

### Desktop Session Lifecycle

Desktop sessions are NOT created by k_pty. They are created by the Electron app (node-pty). The registration flow:

```
Desktop spawns PTY
  → Desktop calls POST http://127.0.0.1:8100/v1/pty/register
    (MCP Core, port 8100, requires X-Kuroryuu-Desktop-Secret header)
  → PTYRegistry.register(session_id, source="desktop", desktop_url="http://127.0.0.1:8201", ...)
  → Persists to ai/checkpoints/pty/_registry.json
  → Logs event to ai/checkpoints/pty/_registry_events.jsonl

k_pty(action="list") now shows the session
k_pty(action="term_read", session_id=...) now works
```

On MCP Core restart, `PTYRegistry.restore_from_disk()` restores **only desktop sessions** (local sessions' pywinpty processes are gone). Desktop sessions may still be running since node-pty is managed by the Electron process.

### Session ID Formats

| Source | Format | Example |
|--------|--------|---------|
| Local (pywinpty) | `pty_<8 hex>` | `pty_a3f87c2d` |
| Desktop (node-pty) | Arbitrary, set by Desktop | `9ccd99b1bdd8710e` |
| Desktop (normalized) | First 16 hex chars, hyphens removed | `9ccd99b1bdd8710e` |

The normalization (`replace(/-/g, '').substring(0, 16)`) is used when comparing session IDs for leader checks.

---

## 4. `term_read` Deep Dive

```
k_pty(action="term_read", session_id=X, mode="tail", max_lines=10)
  → tools_pty.py: _action_term_read()
      → Check KURORYUU_TERM_BUFFER_ACCESS != "off"
      → PTYRegistry.get(session_id) → session
      → Assert session.source == "desktop"
      → _desktop_term_read(session.desktop_url, session_id, mode, max_lines, ...)
          → POST http://127.0.0.1:8201/pty/buffer
            Body: {session_id, mode, max_lines, merge_wrapped, marker_id}
          → Desktop bridge (bridge.ts): handleBuffer()
              → Check KURORYUU_TERM_BUFFER_ACCESS
              → getInternalId(session_id) → termId
              → requestTerminalBuffer(termId, mode, options)
                  → IPC: main → renderer: "pty:requestBuffer" {termId, mode, options}
                  → renderer xterm.js buffer read
                  → IPC: renderer → main: "pty:bufferResponse" {termId, snapshot}
                  → 5s timeout
              → Return snapshot
  → Python enforces max_chars cap, runs _redact_secrets()
  → Returns {ok, text, lines, cursor_line, viewport_y, rows, cols, buffer_type, marker_id, ...}
```

**Critical:** term_read bypasses the in-memory `OutputBuffer` entirely. It reads from xterm.js's own buffer in the renderer process. This means:
- It returns rendered text (ANSI sequences stripped by xterm.js)
- It respects the terminal's scrollback buffer size (configured in Desktop)
- Marker IDs are xterm.js Buffer.Marker objects — they're disposed when scrolled off
- Does NOT work for local pywinpty sessions (returns `NOT_DESKTOP_SESSION`)

---

## 5. Targeted Routing (`resolve` / `send_line_to_agent`)

When Desktop spawns a PTY, it can register ownership metadata:

```http
POST http://127.0.0.1:8100/v1/pty/register
X-Kuroryuu-Desktop-Secret: <secret>

{
  "session_id": "9ccd99b1bdd8710e",
  "source": "desktop",
  "cli_type": "claude",
  "pid": 12345,
  "desktop_url": "http://127.0.0.1:8201",
  "owner_agent_id": "worker_claude_abc123",
  "owner_session_id": "claude_worker_abc123_52d1f084",
  "owner_role": "worker",
  "label": "Worker A"
}
```

The registry stores this in `RegisteredSession`:

| Field | Type | Description |
|-------|------|-------------|
| `owner_agent_id` | str | Primary routing key — matches `k_session` agent_id |
| `owner_session_id` | str | Secondary key — matches `k_session.session_id` |
| `owner_role` | str | `"leader"` or `"worker"` |
| `label` | str | Human label for debugging (e.g. "Worker A") |
| `claude_code_session_id` | str | Linked from observability events (via `link_claude_session()`) |

Resolve priority: tries each provided key in order, collects all matches, then enforces uniqueness.

**Ownership update path** (after agent registers via Gateway):
```
Gateway: POST /v1/agents/register {role: "worker", agent_id: "..."}
  → pty_client.update_pty_ownership()
      → POST http://127.0.0.1:8100/v1/pty/update-ownership
        X-Kuroryuu-Internal-Secret: <secret>
        Body: {session_id, owner_agent_id, owner_role, owner_session_id, label}
  → PTYRegistry.register() (updates existing entry, no re-creation)
```

---

## 6. Desktop Bridge HTTP API (port 8201)

The bridge runs as a Node.js HTTP server inside the Electron main process. Port configurable via `KURORYUU_PTY_BRIDGE_PORT` (default: 8201). Binds to `127.0.0.1` only.

If port 8201 is in use, auto-increments (8202, 8203, ...) until free.

### Endpoints

#### `POST /pty/talk`
Execute command with sentinel.

**Request:**
```json
{
  "session_id": "9ccd99b1bdd8710e",
  "command": "ls -la",
  "sentinel": "__KR_DONE_abc123__",
  "timeout_ms": 30000
}
```

**Embedded mode:** uses `runWithSentinel()` — writes command to PTY, listens for sentinel string in output stream, returns captured output.

**Daemon mode:** writes command + `\r`, waits `min(timeout_ms, 5000)` ms, reads buffered data. No true sentinel support in daemon mode.

**Response:**
```json
{"ok": true, "output": "...", "sentinel_found": true}
```

---

#### `POST /pty/write`
Write raw bytes to PTY. No automatic `\r` appended.

```json
{"session_id": "...", "data": "text to write"}
```

Used internally by `send_line` (two calls: text + `\r`). Also available for PTY nudging (e.g. sending Ctrl+C `\x03`, answering Y/N prompts).

**Note:** The MCP-level `k_pty(action="write")` is deprecated and returns DEPRECATED error, but the bridge `/pty/write` endpoint is still active and used internally by `send_line`.

---

#### `POST /pty/read`
Accumulate PTY output for a short window.

```json
{"session_id": "...", "timeout_ms": 5000}
```

**Embedded mode:** attaches a `data` event listener to the node-pty process, collects for `min(timeout_ms, 5000)` ms, returns.

**Daemon mode:** calls `daemonClient.getBufferedData()`.

**Response:** `{ok, output, bytes_read}`

---

#### `POST /pty/buffer`
Read xterm.js terminal buffer.

```json
{
  "session_id": "...",
  "mode": "tail",
  "max_lines": 40,
  "merge_wrapped": true,
  "marker_id": null
}
```

Checks `KURORYUU_TERM_BUFFER_ACCESS` env var (403 if `"off"`).

Flow: main process → IPC → renderer's xterm.js → IPC → main process. 5s IPC timeout.

**Response:** Raw xterm.js buffer snapshot forwarded to Python layer, where `max_chars` cap and secret redaction are applied.

---

#### `GET /pty/list`
List active sessions.

**Embedded response:**
```json
{
  "ok": true,
  "sessions": [{"session_id": "...", "internal_id": "...", "pid": 123, "cols": 120, "rows": 30, "cwd": "..."}],
  "count": 1
}
```

---

#### `GET /pty/is-leader?session_id=<id>`
Check if a PTY session is the leader terminal. Used by MCP Core's `_is_leader()` for access control verification.

```json
{
  "ok": true,
  "session_id": "9ccd99b1bdd8710e",
  "is_leader": true,
  "leader_terminal_id": "9ccd99b1bdd8710e"
}
```

**Normalization:** Both the query `session_id` and the stored `leaderTerminalId` are normalized: hyphens removed, first 16 chars taken. This handles UUID format variations.

The `leaderTerminalId` is set in the bridge via `setLeaderTerminalId()`, called from the Electron main process when a leader is assigned (e.g. via Desktop "Promote" button or `/_x9k_register_leader` endpoint).

---

#### `GET /health`
Returns `{ok, service, port, sessions, mode, daemonConnected}`. Used by MCP Core to verify bridge is up.

---

## 7. Leader Access Control

`k_pty` had a leader-only restriction that was **removed** — all agents now have equal access to all actions. However, the leader verification infrastructure remains and is still used.

### `_is_leader()` Check Order

For historical context, the check order (now mostly inert) is:

1. **Desktop-registered leaders** (`_registered_leaders` set in `server.py`) — set via `POST /_x9k_register_leader` with Desktop secret. Most trusted.
2. **Desktop bridge leader query** — `GET http://127.0.0.1:8201/pty/is-leader?session_id=<pty_session>`. Resolves k_session ID → PTY session via registry first.
3. **Cache** (5s TTL) — `_leader_cache[agent_id]`.
4. **Env vars** — `KURORYUU_IS_LEADER=1` or `KURORYUU_AGENT_ROLE=leader`.
5. **Gateway query** — `GET http://127.0.0.1:8200/v1/agents/leader` → compare agent_ids.
6. **Default: reject** (was reject; now all pass since leader check is removed from handlers).

### Leader Registration via Desktop

```
Desktop assigns leader terminal
  → Main process: bridge.setLeaderTerminalId(termId)
  → Also: POST http://127.0.0.1:8100/_x9k_register_leader?agent_id=xxx
    X-Kuroryuu-Desktop-Secret: <secret>
  → MCP Core: _registered_leaders.add(agent_id)
```

---

## 8. PTY Traffic Visualization

Every `send_line`, `talk`, and `term_read` action emits a fire-and-forget event to the Gateway:

```
POST http://127.0.0.1:8200/v1/pty-traffic/emit
```

Events are stored in a SQLite database and broadcast to WebSocket subscribers. The Desktop PTY Traffic panel displays these in real time.

Event fields: `action`, `session_id`, `agent_id`, `owner_session_id`, `command` (capped 10KB), `response` (capped 10KB), `duration_ms`, `success`, `blocked`, `blocked_pattern`, `error_code`, `label`, `cli_type`.

Traffic visualization endpoints (Gateway, `/v1/pty-traffic/*`):
- `GET /events` — paginated events with filters (session_id, agent_id, action, errors_only, blocked_only, search, since/until)
- `GET /events/{id}` — full event detail
- `GET /sessions` — per-session aggregates
- `GET /sessions/{id}` — session detail + recent events
- `GET /stats` — global counts
- `GET /blocked` — recent blocked commands
- `GET /health` — monitoring health
- `POST /storage/cleanup` — manual cleanup

---

## 9. Command Security

All write operations (`send_line`, `talk`, `send_line_to_agent`) pass through `check_dangerous_command()` from `command_security.py`.

### Blocked Patterns (BLOCKED_COMMAND_PATTERNS)

| Category | Examples |
|----------|---------|
| Destructive file ops | `rm -rf /`, `del /sq`, `rmdir /s` |
| Disk ops | `format c:`, `diskpart`, `mkfs.*`, `dd if=... of=/dev`, `fdisk` |
| System damage | Fork bombs `:(){ :|:& };`, `shutdown /s`, `halt`, `init 0` |
| Credential access | `cat .ssh/`, `cat .aws/`, `reg query...SAM`, `mimikatz` |
| Registry/boot attacks | `reg delete HKLM`, `bcdedit`, `vssadmin delete`, `wbadmin delete` |

Download-execute and reverse shell patterns are **disabled** (commented out) for trusted agent use.

Shell injection patterns (`$(...)`, backtick substitution, pipe-to-interpreter) are also **disabled** for trusted agents — common in legitimate scripts.

### Secret Redaction (OUTPUT)

Applied to all `term_read` output (and should be applied to `read`/`talk` output manually if needed):

| Pattern | Replacement |
|---------|-------------|
| `sk-[a-zA-Z0-9]{20,}` | `[REDACTED_API_KEY]` |
| `ghp_[a-zA-Z0-9]{36,}` | `[REDACTED_GITHUB_TOKEN]` |
| `Bearer [a-zA-Z0-9_-]+` | `Bearer [REDACTED]` |
| `export *TOKEN*=*` | `export TOKEN=[REDACTED]` |
| `export *KEY*=*` | `export KEY=[REDACTED]` |
| `ANTHROPIC_API_KEY=*` | `ANTHROPIC_API_KEY=[REDACTED]` |
| `OPENAI_API_KEY=*` | `OPENAI_API_KEY=[REDACTED]` |

---

## 10. Persistence

All PTY state lives in `ai/checkpoints/pty/`:

```
ai/checkpoints/pty/
├── _registry.json          # Snapshot of PTYRegistry (schema: pty_registry_v1)
├── _registry_events.jsonl  # Append-only audit log (session_created, session_killed)
├── sessions/
│   └── <session_id>/
│       ├── metadata.json   # Session metadata snapshot
│       ├── buffer.txt      # Last N bytes of output buffer (max 100KB)
│       └── events.jsonl    # Per-session event log
└── renderer/
    └── buffers/            # Reserved for renderer-side buffer snapshots
```

### Debounce timers
- **Metadata save:** 1s debounce after registry change
- **Buffer save:** 5s debounce after every 100 reader cycles (~10KB average)
- **Immediate save:** `save_now()` called on app shutdown

### Atomic writes
JSON files are written via temp file + `os.replace()` to prevent corruption on crash.

### Startup restore
`PTYRegistry.restore_from_disk()` — only restores `source="desktop"` sessions. Local pywinpty processes don't survive a Python restart. Desktop node-pty processes may still be running (managed by Electron).

---

## 11. Platform Backends

### Windows: pywinpty (ConPTY)

```python
from winpty import PtyProcess
process = PtyProcess.spawn("powershell.exe", cwd=..., dimensions=(rows, cols))
process.write(data)     # → stdin
process.read(max_bytes) # ← stdout (blocking)
process.setwinsize(rows, cols)
process.terminate(force=True)
process.isalive() → bool
```

### Linux/Mac: tmux backend

```python
from pty_backend_tmux import TmuxPtyProcess
process = TmuxPtyProcess.spawn("/bin/bash", cwd=..., dimensions=(rows, cols))
```

Backed by tmux subprocess calls. Session names: `kuro_<8 hex>`. Uses `tmux send-keys -l` for input, `tmux capture-pane -p -S -1000` for output (with incremental position tracking). `isalive()` calls `tmux has-session`.

**Note:** `PYWINPTY_AVAILABLE` flag is reused on Linux to mean "tmux backend available" for compatibility.

---

## 12. Environment Variables

| Variable | Default | Effect |
|----------|---------|--------|
| `KURORYUU_GATEWAY_URL` | `http://127.0.0.1:8200` | Gateway URL for event emission and leader queries |
| `KURORYUU_DESKTOP_URL` | `http://127.0.0.1:8201` | Desktop bridge URL |
| `KURORYUU_PTY_BRIDGE_PORT` | `8201` | Desktop bridge port (auto-increments if busy) |
| `KURORYUU_MCP_URL` | `http://127.0.0.1:8100` | MCP Core URL |
| `KURORYUU_TERM_BUFFER_ACCESS` | `on` | `on` / `off` — gates term_read |
| `KURORYUU_PTY_SHELL` | `powershell.exe` / `/bin/bash` | Default shell for local sessions |
| `KURORYUU_PTY_COLS` | `120` | Default terminal width |
| `KURORYUU_PTY_ROWS` | `30` | Default terminal height |
| `KURORYUU_PTY_BUFFER_SIZE` | `102400` (100KB) | In-memory ring buffer max size |
| `KURORYUU_PTY_TIMEOUT_MS` | `30000` | Default `talk` timeout |
| `KURORYUU_IS_LEADER` | — | Set to `1` to bypass leader check |
| `KURORYUU_AGENT_ROLE` | — | Set to `leader` to bypass leader check |
| `KURORYUU_AGENT_ID` | — | Used as fallback in event emission |
| `KURORYUU_SESSION_ID` | — | Used for leader resolution via registry |
| `KURORYUU_INTERNAL_SECRET` | — | Required for `POST /v1/pty/update-ownership` |

---

## 13. MCP Core PTY HTTP Endpoints

All on MCP Core (`http://127.0.0.1:8100`):

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/pty/register` | Desktop secret | Register a session |
| `DELETE` | `/v1/pty/unregister/{session_id}` | Desktop secret | Unregister a session |
| `GET` | `/v1/pty/sessions` | None | List all sessions |
| `GET` | `/v1/pty/sessions/{session_id}` | None | Get session info |
| `DELETE` | `/v1/pty/reset` | Desktop secret | Clear all sessions + persistence |
| `POST` | `/v1/pty/heartbeat/{session_id}` | None | Update heartbeat |
| `POST` | `/v1/pty/heartbeat` | None | Update heartbeat (body) |
| `POST` | `/v1/pty/update-ownership` | Desktop or Internal secret | Update owner metadata |
| `POST` | `/_x9k_register_leader` | Desktop secret | Register agent as leader |
| `POST` | `/_x9k_deregister_leader` | Desktop secret | Deregister leader |

**Auth headers:**
- `X-Kuroryuu-Desktop-Secret` — set by Desktop on startup, stored in `_desktop_secret` in server.py
- `X-Kuroryuu-Internal-Secret` — `KURORYUU_INTERNAL_SECRET` env var, used for internal service calls

---

## 14. Gotchas

### `term_read` only works for desktop sessions
Returns `NOT_DESKTOP_SESSION` for local pywinpty sessions. xterm.js only exists in the Electron renderer.

### Session IDs are not UUIDs for desktop sessions
Desktop sessions use whatever ID the node-pty wrapper assigns. Leader comparison normalizes to first 16 hex chars with hyphens stripped.

### `read` is non-destructive / not FIFO
The ring buffer is never cleared on read. Calling `read` twice returns the same content. Only `talk` clears the buffer (before writing the command). Use `talk` for reliable "run and capture" semantics.

### `talk` clears the buffer first
`PTYManager.run()` calls `session.buffer.clear()` before writing the command. This means any pending output from previous commands is lost. Always use `talk` only when you want to run a command and capture just its output.

### Windows escape sequences in `send_line`
The escape processor avoids `unicode_escape` decoder to prevent mangling `C:\Users\` paths. The pattern `\\r(?![A-Za-z0-9_])` means `\r` at end of a token converts to CR, but `\results` stays as-is.

### Enter = `\r` not `\r\n`
`send_line` sends CR only (`\r`). Do NOT pass `\r\n` as your enter key — it causes a double newline in some PTYs.

### Desktop resize disabled via MCP
`resize` returns `DESKTOP_RESIZE_DISABLED` for desktop sessions. `/pty/resize` was removed from the bridge during security hardening. Resize desktop terminals via the Desktop UI.

### `write` action is deprecated at MCP level but bridge `/pty/write` is active
The MCP `k_pty(action="write")` always returns DEPRECATED. But the bridge's `POST /pty/write` endpoint is alive and used internally by `send_line`. Direct HTTP calls to the bridge still work.

### Local sessions are not restored after restart
Only desktop sessions survive MCP Core restart. Local pywinpty sessions are gone — their `session_id`s in `_registry.json` are skipped during restore.

### Leader protection on unregister
`PTYRegistry.unregister()` blocks unregistering sessions with `owner_role="leader"` unless `force=True`. This protects the leader terminal from being accidentally removed by workers.

### Context token budget for `term_read`
Default `max_lines=40`, `max_chars=12000`. Per CLAUDE.md rule: **use `max_lines=5-10` for term_read**. Large reads bloat context and cause compaction. Start small, increase only if needed.

### Gateway traffic emission is fire-and-forget
If Gateway is down, PTY operations still work. Events are lost but the operation succeeds. 2s HTTP timeout on emissions.

### Async vs sync: two code paths for everything
Every action has both a sync and async implementation. The async version (`k_pty_async`) is used by FastAPI endpoints. The sync version (`k_pty`) is used by the MCP handler. Desktop bridge calls are always sync in the sync path, always async in the async path. Both share the same result types.

---

*Last updated: 2026-02-18 — traced from source, all gotchas verified in code*
