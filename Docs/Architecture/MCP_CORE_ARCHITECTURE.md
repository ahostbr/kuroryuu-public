# MCP Core Architecture

**Document version:** 2026-02-17
**Author:** Ash (Kuroryuu AI)
**Status:** Authoritative reference

---

## Table of Contents

1. [Overview](#overview)
2. [Directory Layout](#directory-layout)
3. [Server (server.py)](#server)
4. [Protocol Layer (protocol.py)](#protocol-layer)
5. [Tool Catalog (tool_catalog.py)](#tool-catalog)
6. [Tool Reference](#tool-reference)
7. [Supporting Modules](#supporting-modules)
8. [PTY Subsystem](#pty-subsystem)
9. [Data Flow Diagrams](#data-flow-diagrams)
10. [Configuration and Persistence Paths](#configuration-and-persistence-paths)
11. [Security Model](#security-model)

---

## Overview

`apps/mcp_core/` is the central MCP (Model Context Protocol) server for Kuroryuu. It exposes 25 tools with 135 total actions to Claude and other MCP-compatible clients over HTTP using JSON-RPC 2.0.

| Attribute          | Value                              |
|--------------------|------------------------------------|
| Path               | `apps/mcp_core/`                   |
| Lines of code      | 20,807 across 42 Python files      |
| Port               | 8100                               |
| Protocol           | JSON-RPC 2.0                       |
| MCP version        | 2024-11-05                         |
| Framework          | FastAPI                            |
| Tool count         | 25 tools, 135 actions              |

The server sits between the Claude Code process and all Kuroryuu infrastructure: the filesystem, PTY terminals, the Gateway (port 8200), the Desktop app (port 8201), and external services (restic, edge-tts, FFmpeg, Win32 APIs).

---

## Directory Layout

```
apps/mcp_core/
├── server.py              # FastAPI app, 25 tool registrations, HTTP endpoints (747 LOC)
├── protocol.py            # JSON-RPC 2.0 dispatcher, ToolRegistry, MCPSession (205 LOC)
├── tool_catalog.py        # ToolMetadata, natural language discovery scoring (445 LOC)
├── embeddings.py          # LocalEmbedder singleton, all-MiniLM-L6-v2 (250 LOC)
├── chunker.py             # SimpleChunker, CodeChunker, SemanticChunker (400 LOC)
├── reranker.py            # CrossEncoder singleton, ms-marco-MiniLM-L-6-v2 (200 LOC)
├── command_security.py    # Blocked patterns, secret redaction, event emission (195 LOC)
├── pty_registry.py        # RegisteredSession, desktop+local routing, heartbeat
├── pty_persistence.py     # Atomic disk persistence for PTY state
├── pty_manager.py         # PTYSession, OutputBuffer, spawn/read/write/kill
├── pty_backend_tmux.py    # Linux/Mac tmux backend alternative
└── tools/
    ├── k_rag.py           # RAG search and indexing (1,650 LOC, 13 actions)
    ├── k_pty.py           # PTY terminal management (1,700 LOC, 11 actions)
    ├── k_backup.py        # Restic backup operations (650 LOC, 13 actions)
    ├── k_inbox.py         # Maildir inter-agent messaging (1,000 LOC, 8 actions)
    ├── k_checkpoint.py    # Session state persistence (700 LOC, 5 actions)
    ├── k_bash.py          # Shell command execution (600 LOC)
    ├── k_tts.py           # Text-to-speech (300 LOC, 2 actions)
    ├── k_msg.py           # Inbox wrapper with auto-identity (8 actions)
    ├── k_capture.py       # FFmpeg screen capture (9 actions)
    ├── k_pccontrol.py     # Win32 PC control via PowerShell (8 actions)
    ├── k_session.py       # Session lifecycle tracking (7 actions)
    ├── k_memory.py        # Working memory key-value store (7 actions)
    ├── k_collective.py    # Collective intelligence patterns (6 actions)
    ├── k_process.py       # Background session monitor (6 actions)
    ├── k_repo_intel.py    # Codebase analysis reports (5 actions)
    ├── k_files.py         # Sandboxed file operations (5 actions)
    ├── k_graphiti_migrate.py  # Knowledge graph migration (6 actions)
    ├── k_thinker_channel.py   # Thinker PTY I/O (3 actions)
    └── k_MCPTOOLSEARCH.py     # Natural language tool discovery (2 actions)
```

---

## Server

**File:** `apps/mcp_core/server.py` — 747 LOC

FastAPI application. Registers all 25 tools into `ToolRegistry` at startup, handles MCP JSON-RPC dispatch, manages internal secrets, and supervises PTY session lifecycle.

### HTTP Endpoints

| Method | Path                          | Description                                         |
|--------|-------------------------------|-----------------------------------------------------|
| GET    | `/`                           | Server info: name, version, tool count              |
| GET    | `/health`                     | Health check, returns `{"status":"ok"}`             |
| POST   | `/mcp`                        | JSON-RPC 2.0 dispatcher (primary MCP endpoint)      |
| GET    | `/tools`                      | Non-MCP convenience tool listing                    |
| POST   | `/_x9k_desktop_auth`          | Register Desktop secret (64-char hex, timing-safe)  |
| POST   | `/_x9k_register_leader`       | Register agent as leader                            |
| POST   | `/_x9k_deregister_leader`     | Deregister leader                                   |
| GET    | `/_x9k_registered_leaders`    | List currently registered leaders                   |
| POST   | `/v1/pty/register`            | Register a PTY session                              |
| DELETE | `/v1/pty/unregister/{id}`     | Unregister a PTY session                            |
| GET    | `/v1/pty/sessions`            | List all registered PTY sessions                    |
| POST   | `/v1/pty/heartbeat`           | Update heartbeat for a PTY session                  |
| GET    | `/v1/collective/health`       | Collective intelligence usage stats                 |

### Startup Sequence

```
1. Load internal secret from disk (or generate new 64-char hex)
2. Initialize PTY persistence layer
3. Cleanup stale PTY sessions (last heartbeat > 7 days)
4. Restore PTY registry from disk
5. Verify any registered Desktop sessions are still active
6. Register all 25 tools into ToolRegistry
```

### Shutdown Sequence

```
1. Save all active PTY session state to disk (buffers, events, registry)
```

---

## Protocol Layer

**File:** `apps/mcp_core/protocol.py` — 205 LOC

Implements the JSON-RPC 2.0 MCP protocol surface. Three classes handle the full dispatch chain.

### ToolRegistry

```python
class ToolRegistry:
    def register(name, description, input_schema, handler) -> None
    def list_tools() -> list[dict]         # MCP tools/list format
    def get_handler(name) -> callable
```

Tools are registered by `server.py` at startup by calling each tool module's `register()` function, which in turn calls `ToolRegistry.register()`.

### MCPSession

```python
class MCPSession:
    session_id: str
    initialized: bool
```

Tracks per-connection state. A session must receive `initialize` before `tools/call` requests are accepted.

### MCPProtocol

```python
class MCPProtocol:
    def handle_request(request: dict) -> dict
```

Dispatches on `request["method"]`:

| Method       | Handler                                                  |
|--------------|----------------------------------------------------------|
| `initialize` | Return server capabilities and protocol version          |
| `tools/list` | Return all registered tools with schemas                 |
| `tools/call` | Look up handler, invoke, wrap result                     |

### Response Format

All tool call responses conform to MCP's content block structure:

```json
{
  "jsonrpc": "2.0",
  "id": "<request_id>",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "<tool output>"
      }
    ],
    "isError": false
  }
}
```

Task notifications (from hooks that fire during tool execution) are prepended as separate `content` blocks before the primary tool result block.

Error responses set `"isError": true` and include a descriptive error message in `text`.

---

## Tool Catalog

**File:** `apps/mcp_core/tool_catalog.py` — 445 LOC

Provides structured metadata for all 25 tools, enabling natural language tool discovery via `k_MCPTOOLSEARCH`.

### ToolMetadata

```python
@dataclass
class ToolMetadata:
    name: str
    description: str
    keywords: list[str]
    actions: list[str]
    examples: list[str]
    category: str
    leader_only: bool = False

    def matches_query(self, query: str) -> float
```

### Scoring Algorithm

`matches_query(query)` returns a float in [0, 1.0] combining three signals:

| Signal               | Weight | Condition                                     |
|----------------------|--------|-----------------------------------------------|
| Name match           | 0.5    | Query token appears in tool name              |
| Keyword overlap      | 0.3    | Query tokens intersect with `keywords` list   |
| Description overlap  | 0.2    | Query tokens appear in description text       |

### Tool Categories

| Category    | Tools                                          |
|-------------|------------------------------------------------|
| search      | k_rag, k_MCPTOOLSEARCH, k_repo_intel           |
| analysis    | k_repo_intel, k_collective                     |
| files       | k_files                                        |
| persistence | k_checkpoint, k_memory                         |
| messaging   | k_inbox, k_msg                                 |
| lifecycle   | k_session, k_askuserquestion                   |
| state       | k_memory, k_collective                         |
| terminal    | k_pty, k_bash, k_process, k_thinker_channel    |
| capture     | k_capture, k_pccontrol                         |
| migration   | k_graphiti_migrate                             |
| automation  | k_pccontrol                                    |
| audio       | k_tts                                          |
| meta        | k_MCPTOOLSEARCH                                |

---

## Tool Reference

### k_rag

**File:** `tools/k_rag.py` — 1,650 LOC
**Actions (13):** `query`, `status`, `index`, `query_semantic`, `query_hybrid`, `query_reranked`, `query_multi`, `query_reflective`, `query_agentic`, `index_semantic`, `query_interactive`, `help`

Retrieval-augmented generation tool providing BM25, semantic, hybrid, and multi-strategy search over indexed project files.

#### BM25 Implementation

```
score(doc, query) = sum over query terms of:
    idf(term) * ( tf(term, doc) * (k1 + 1) )
                / ( tf(term, doc) + k1 * (1 - b + b * |doc| / avgdl) )

k1 = 1.5
b  = 0.75
```

#### Retrieval Strategies

| Action            | Strategy                                                                      |
|-------------------|-------------------------------------------------------------------------------|
| `query`           | BM25 full-text search                                                         |
| `query_semantic`  | Dense vector search (all-MiniLM-L6-v2, 384 dims, ~90 MB)                     |
| `query_hybrid`    | BM25 + vector combined; configurable BM25 weight (default 0.3)                |
| `query_reranked`  | BM25 first-pass, then cross-encoder rerank (ms-marco-MiniLM-L-6-v2, ~50 MB)  |
| `query_multi`     | LLM generates 3 query variations; results deduped then merged                 |
| `query_reflective`| Up to 3 iterations; stops when quality threshold (0.5) is reached            |
| `query_agentic`   | Auto-selects strategy based on query characteristics                          |

#### File Filtering

- Extensions: configurable allowlist
- Excluded directories: `.git`, `__pycache__`, `node_modules`
- Scope: `project` (default), `all`, or `reference`

#### Index Files

| File                                  | Content                         |
|---------------------------------------|---------------------------------|
| `WORKING/rag_index/bm25_index.json`   | Inverted index, IDF table, doc lengths |
| `WORKING/rag_index/chunks.jsonl`      | Raw chunk text and metadata     |

---

### k_pty

**File:** `tools/k_pty.py` — 1,700 LOC
**Actions (11):** `list`, `create`, `write`, `send_line`, `read`, `talk`, `term_read`, `resize`, `resolve`, `send_line_to_agent`, `help`

PTY terminal management tool. Manages both local (pywinpty) and Desktop-bridged (HTTP to port 8201) terminal sessions.

#### Routing

```
k_pty action
      |
      +-- Desktop session? --> HTTP bridge --> Desktop PTY daemon (:8201)
      |
      +-- Local session?   --> pywinpty --> local PTY process
```

#### Session Metadata

```python
{
    "session_id": str,
    "source": "local" | "desktop",
    "cli_type": str,          # e.g. "bash", "python", "claude"
    "pid": int,
    "owner_agent_id": str,
    "owner_session_id": str,
    "label": str
}
```

#### PTY Traffic

All read/write events are emitted to `/v1/pty-traffic/emit` (Gateway, port 8200) as fire-and-forget. Output is truncated at 10 KB per event to bound payload size.

#### Command Security

All `write` and `send_line` calls pass through `command_security.py` before execution. See [Security Model](#security-model).

---

### k_backup

**File:** `tools/k_backup.py` — 650 LOC
**Actions (13):** `status`, `ensure`, `init`, `backup`, `list`, `restore`, `diff`, `check`, `forget`, `forget_policy`, `prune`, `config`, `help`

Wraps the restic backup tool for snapshot management.

#### File Locations

| Path                                                          | Purpose                          |
|---------------------------------------------------------------|----------------------------------|
| `~/.kuroryuu/restic-local-settings/backup_config.json`        | Backup configuration             |
| `~/.kuroryuu/bin/restic.exe`                                  | Binary (auto-downloaded if absent) |
| `~/.kuroryuu/restic-repo/`                                    | Restic repository root           |

The restic password is cached in memory after first unlock (thread-safe).

---

### k_inbox

**File:** `tools/k_inbox.py` — 1,000 LOC
**Actions (8):** `send`, `list`, `read`, `claim`, `complete`, `mark_read`, `stats`, `help`

Maildir-style inter-agent messaging with atomic file operations and JSON indexes.

#### Directory Structure

```
ai/inbox/
├── new/          # Unread messages
├── cur/          # Read/claimed messages
├── tmp/          # Staging area for atomic writes
├── done/         # Completed messages
├── dead/         # Dead-letter queue
└── .index/
    ├── by_agent.json      # Agent -> message IDs
    ├── by_thread.json     # Thread -> message IDs
    └── unread_counts.json # Per-agent unread counts
```

#### Atomicity

All writes stage to `tmp/` then call `os.replace()` to ensure atomic visibility. No partial writes are observable by readers.

#### Broadcast

Setting `to_agent="workers"` or `to_agent="*"` delivers a copy to all registered agents.

---

### k_checkpoint

**File:** `tools/k_checkpoint.py` — 700 LOC
**Actions (5):** `save`, `append`, `list`, `load`, `help`

Structured session state persistence with deep merge semantics.

#### Storage Layout

```
WORKING/checkpoints/
├── _index.jsonl                              # Append-only index of all checkpoints
└── <name>/
    └── checkpoint_<timestamp>.json           # Checkpoint payload
```

#### Merge Semantics (append action)

| Value type | Behavior           |
|------------|--------------------|
| dict       | Recursive merge    |
| list       | Concatenation      |
| scalar     | Overwrite          |

#### Worklog Generation

`save(..., worklog=True)` automatically creates a `KuroRyuuWorkLog_YYYYMMDD_HHMMSS_<name>.md` file alongside the checkpoint JSON.

#### Task Sidecar Linking

`save(..., task_id="T###")` writes checkpoint and worklog paths into `ai/task-meta.json` under the specified task ID, enabling the Desktop Kanban monitor to display evidence links.

---

### k_bash

**File:** `tools/k_bash.py` — 600 LOC

Shell command execution with three execution modes.

#### Execution Modes

| Mode               | Implementation      | When used                                |
|--------------------|---------------------|------------------------------------------|
| Foreground simple  | `subprocess.run()`  | Short commands, captured output needed   |
| Foreground PTY     | pywinpty            | Commands requiring TTY (interactive CLIs)|
| Background         | Thread + session ID | Long-running processes                   |

Background sessions are tracked in `BASH_SESSIONS` dict, shared with `k_process`.

#### Streaming

Background sessions emit heartbeats every 5 seconds and stream output lines to `/v1/pty-traffic/emit` in real time.

#### Wave Metadata

Each session can carry `wave_id` and `dependency_ids` for the Desktop UI's wave dependency graph.

---

### k_tts

**File:** `tools/k_tts.py` — 300 LOC
**Actions (2):** `speak`, `smart`

Text-to-speech using edge-tts and PowerShell MediaPlayer.

#### speak action

```
text -> edge-tts (en-GB-SoniaNeural) -> MP3 file -> PowerShell MediaPlayer -> audio output
```

#### smart action

```
text -> LLM summary (~20 words, "Ryan, ..." prefix) -> speak action
```

LLM summary has a 15-second timeout. If Gateway is unreachable, the first sentence of input is spoken directly.

#### Queue Lock

Concurrent TTS calls are serialized by a file-based lock to prevent audio overlap:

| Path                             | Purpose          |
|----------------------------------|------------------|
| `ai/data/tts_queue/tts.lock`     | Cross-process lock |

Lock acquisition timeout: 25 seconds. Dead PID detection: if the PID in the lock file is no longer alive, the lock is stolen.

#### Timeouts

| Stage          | Timeout |
|----------------|---------|
| LLM summary    | 15s     |
| MP3 generation | 30s     |
| Playback       | 60s     |

---

### k_msg

**Actions (8):** `send`, `check`, `read`, `reply`, `complete`, `broadcast`, `list_agents`, `help`

Thin wrapper around `k_inbox` that automatically resolves the calling agent's identity from the active session, eliminating the need to pass `from_agent` explicitly on every call.

---

### k_capture

**Actions (9):** `list_monitors`, `start`, `stop`, `screenshot`, `get_latest`, `get_storyboard`, `get_status`, `poll`, `help`

Screen capture using FFmpeg. Supports continuous recording, on-demand screenshots, and storyboard generation from recorded segments.

---

### k_pccontrol

**Actions (8):** `click`, `doubleclick`, `rightclick`, `type`, `keypress`, `launch_app`, `get_windows`, `help`

Win32 mouse and keyboard control implemented via PowerShell. Requires explicit opt-in from the operator; not enabled by default.

---

### k_session

**Actions (7):** `start`, `end`, `pre_tool`, `post_tool`, `log`, `context`, `list`

Session lifecycle tracking. Records session start/end, pre/post tool events, and arbitrary log entries. Context snapshots capture working state for cross-session continuity.

---

### k_memory

**Actions (7):** `get`, `set_goal`, `add_blocker`, `clear_blockers`, `set_steps`, `reset`, `help`

Working memory as a structured key-value store for within-session and cross-session state.

**Storage:** `ai/working_memory.json`

Structure:

```json
{
  "goal": "string",
  "blockers": ["string"],
  "steps": ["string"],
  "kv": {}
}
```

---

### k_collective

**Actions (6):** `record_success`, `record_failure`, `query_patterns`, `get_skill_matrix`, `update_skill`, `help`

Collective intelligence: tracks which tool actions succeed or fail for which agent types, enabling pattern queries and skill matrix construction.

**Storage:**
- `patterns.jsonl` — append-only success/failure log
- `skill_matrix.json` — aggregated per-agent-per-tool skill scores

---

### k_process

**Actions (6):** `list`, `poll`, `log`, `write`, `submit`, `kill`

Background session monitor. Operates on the `BASH_SESSIONS` dict shared with `k_bash`. Allows polling output buffers, reading logs, writing stdin to running sessions, and forceful termination.

---

### k_repo_intel

**Actions (5):** `status` + report generation

Generates structured static analysis reports from the codebase. Output written to `Reports/RepoIntel/`.

| Report type    | Content                                              |
|----------------|------------------------------------------------------|
| `symbol_map`   | All exported symbols per module                      |
| `public_api`   | Public-facing function/class signatures              |
| `module_graph` | Import dependency graph                              |
| `routes`       | HTTP routes (FastAPI, Express, Next.js)              |
| `components`   | React component tree                                 |
| `hooks`        | React custom hooks                                   |
| `todos`        | TODO/FIXME comments across codebase                  |
| `deps`         | Package dependency listing                           |

---

### k_files

**Actions (5):** `read`, `write`, `edit`, `list`, `help`

Sandboxed file operations. Protected paths are blocked from write/delete operations.

**Protected patterns:** `.git/`, `.env`, `node_modules/`

**Write safety:** If an edit would shrink a file by more than 50%, a warning is returned before writing.

---

### k_graphiti_migrate

**Actions (6):** Knowledge graph migration operations for moving data into or out of the Graphiti knowledge graph format.

---

### k_thinker_channel

**Actions (3):** PTY I/O for a dedicated "Thinker" agent session.

Not leader-only — any agent may read/write the thinker channel.

---

### k_MCPTOOLSEARCH

**Actions (2):** `search`, `help`

Natural language tool discovery. Queries `ToolCatalog` using `matches_query()` scoring and returns ranked tool suggestions with descriptions and example actions.

---

### k_askuserquestion

Human-in-the-loop pause. Blocks execution and presents a question to the user via the Claude Code interface. Supports `multiSelect: true` for multi-option selection (used by RAG interactive mode).

---

## Supporting Modules

### embeddings.py (250 LOC)

Singleton lazy-loaded dense encoder.

```
Model:      sentence-transformers/all-MiniLM-L6-v2
Dimensions: 384
Size:       ~90 MB (downloaded on first use)
Interface:  LocalEmbedder.encode(texts: list[str]) -> np.ndarray
```

Batch encoding is used throughout to amortize model overhead. The singleton is initialized once per server process and reused across all `k_rag` calls.

---

### chunker.py (400 LOC)

Three chunking strategies for the RAG indexer:

| Class            | Strategy                                                        |
|------------------|-----------------------------------------------------------------|
| `SimpleChunker`  | Fixed 100-line windows, 10-line overlap                         |
| `CodeChunker`    | Language-aware: splits on class/function boundaries             |
| `SemanticChunker`| Embeds sentences, merges until cosine similarity drops          |

`CodeChunker` language support:

| Extension        | Boundary pattern                      |
|------------------|---------------------------------------|
| `.py`            | `def `, `class ` at column 0          |
| `.ts`, `.js`     | `function `, `class `, `export `      |
| `.go`            | `func `                               |
| `.rs`            | `fn `, `impl `, `pub `                |
| `.md`            | `# `, `## ` headings                  |
| `.yaml`, `.toml` | Top-level keys                        |

---

### reranker.py (200 LOC)

Singleton cross-encoder for two-stage retrieval.

```
Model:     cross-encoder/ms-marco-MiniLM-L-6-v2
Size:      ~50 MB
Interface: CrossEncoder.rerank(query: str, candidates: list[Chunk]) -> list[Chunk]
```

Used by `k_rag query_reranked`. BM25 retrieves an over-large candidate set (typically 3x the final `top_k`), then the cross-encoder scores each (query, candidate) pair and re-ranks by score before truncating to `top_k`.

---

### command_security.py (195 LOC)

Applied to all `k_pty` write/send_line and `k_bash` commands before execution.

#### Blocked Patterns (23 total)

Categories:

| Category      | Examples                                           |
|---------------|----------------------------------------------------|
| Destructive   | `rm -rf /`, `format c:`, `del /f /s /q`            |
| Credential    | Commands writing to `~/.ssh/`, `~/.aws/`           |
| Registry      | `reg delete`, `regedit` with system hives          |

A blocked command returns an error result; it is never passed to the PTY or subprocess.

#### Redaction Patterns (6 total)

Before emitting PTY traffic events, output is scanned for:

| Pattern           | Replaced with                    |
|-------------------|----------------------------------|
| API keys          | `[REDACTED_API_KEY]`             |
| Bearer tokens     | `[REDACTED_TOKEN]`               |
| Passwords in URLs | `[REDACTED_PASSWORD]`            |
| AWS credentials   | `[REDACTED_AWS_KEY]`             |
| Private keys      | `[REDACTED_PRIVATE_KEY]`         |
| Secret env vars   | `[REDACTED_SECRET]`              |

Redaction applies to event payloads sent to the Gateway; it does not alter actual PTY output seen by the shell.

---

## PTY Subsystem

The PTY subsystem spans four modules and manages the full lifecycle of terminal sessions across local and Desktop-bridged backends.

### pty_registry.py

Central session registry. Each registered session is a `RegisteredSession` record:

```python
@dataclass
class RegisteredSession:
    session_id: str
    source: str            # "local" | "desktop"
    cli_type: str
    pid: int
    owner_agent_id: str
    owner_session_id: str
    label: str
    last_heartbeat: float  # Unix timestamp
```

Routing logic:

```
session.source == "desktop"
    -> forward calls to Desktop PTY daemon via HTTP (:8201)

session.source == "local"
    -> delegate to pty_manager.py (pywinpty)
```

Heartbeat tracking: sessions whose `last_heartbeat` is older than 7 days are pruned at startup.

---

### pty_persistence.py

Atomic disk persistence for PTY state. Saves and restores:

| File                                       | Content                           |
|--------------------------------------------|-----------------------------------|
| `WORKING/pty_persistence/registry.json`    | Full session registry snapshot    |
| `WORKING/pty_persistence/buffers/*.jsonl`  | Per-session output buffer lines   |
| `WORKING/pty_persistence/events.jsonl`     | Append-only PTY event log         |

All writes are atomic: data is written to a `.tmp` sibling file, then `os.replace()` is called to swap atomically.

---

### pty_manager.py

Local PTY backend using pywinpty.

```python
class OutputBuffer:
    max_lines: int = 10_000
    lines: deque[str]

class PTYSession:
    session_id: str
    proc: WinPty
    buffer: OutputBuffer

    def write(data: str) -> None
    def read(max_lines: int) -> list[str]
    def resize(cols: int, rows: int) -> None
    def kill() -> None
```

Spawning starts a child process inside a Windows PTY. Output is continuously read from the PTY master and appended to the `OutputBuffer` by a background reader thread.

---

### pty_backend_tmux.py

Alternative backend for Linux and macOS using tmux. Implements the same interface as `pty_manager.py`. The server selects the backend at startup based on platform and availability of tmux.

---

## Data Flow Diagrams

### MCP Request Lifecycle

```
Claude Code
    |
    | HTTP POST /mcp  (JSON-RPC 2.0)
    v
FastAPI (server.py)
    |
    v
MCPProtocol.handle_request()
    |
    +-- method: initialize  --> return capabilities
    |
    +-- method: tools/list  --> ToolRegistry.list_tools()
    |
    +-- method: tools/call  --> ToolRegistry.get_handler(name)(arguments)
                                        |
                                        v
                               Tool module (k_rag, k_pty, ...)
                                        |
                               {"content": [...], "isError": bool}
                                        |
                                        v
                               {"jsonrpc":"2.0","id":...,"result":{...}}
```

### k_rag Query Flow

```
query action
    |
    v
Load bm25_index.json + chunks.jsonl
    |
    v
Tokenize query
    |
    v
BM25 score all docs
    |
    v
Sort by score, take top_k
    |
    v
Return chunks with scores
```

### k_rag Hybrid Query Flow

```
query_hybrid action
    |
    +-- BM25 path ---------+
    |   score all docs     |
    |                      |
    +-- Semantic path ------+
    |   embed query        |
    |   cosine sim vs all  |
    |                      |
    v                      v
Normalize scores independently
    |
    v
combined = bm25_weight * bm25_score + (1 - bm25_weight) * vector_score
    |
    v
Sort by combined score, top_k
```

### PTY Traffic Flow

```
k_pty write / k_bash output
    |
    v
command_security.py  (block check + redact)
    |
    v
pywinpty / Desktop HTTP bridge
    |
    v
Output collected by reader thread
    |
    +-- OutputBuffer (local ring buffer)
    |
    +-- HTTP POST /v1/pty-traffic/emit  (Gateway :8200, fire-and-forget, 10 KB truncation)
```

### k_checkpoint Save Flow

```
k_checkpoint save(name, data, worklog=True, task_id="T###")
    |
    v
Write WORKING/checkpoints/<name>/checkpoint_<timestamp>.json
    |
    v
Append to WORKING/checkpoints/_index.jsonl
    |
    v
[if worklog=True]  Write Docs/worklogs/KuroRyuuWorkLog_<timestamp>_<name>.md
    |
    v
[if task_id set]   Write paths into ai/task-meta.json under T### entry
```

---

## Configuration and Persistence Paths

| Path                                                  | Owner          | Content                              |
|-------------------------------------------------------|----------------|--------------------------------------|
| `WORKING/rag_index/bm25_index.json`                   | k_rag          | BM25 inverted index                  |
| `WORKING/rag_index/chunks.jsonl`                       | k_rag          | Indexed chunks                       |
| `WORKING/checkpoints/`                                | k_checkpoint   | Checkpoint files and index           |
| `WORKING/pty_persistence/`                            | pty_persistence| PTY registry, buffers, events        |
| `ai/inbox/`                                           | k_inbox        | Maildir message store                |
| `ai/working_memory.json`                              | k_memory       | Working memory state                 |
| `ai/task-meta.json`                                   | k_checkpoint   | Task sidecar (checkpoint/worklog links) |
| `ai/data/tts_queue/tts.lock`                          | k_tts          | Cross-process TTS queue lock         |
| `~/.kuroryuu/restic-local-settings/backup_config.json`| k_backup       | Restic configuration                 |
| `~/.kuroryuu/bin/restic.exe`                          | k_backup       | Restic binary                        |
| `~/.kuroryuu/restic-repo/`                            | k_backup       | Restic repository                    |
| `Reports/RepoIntel/`                                  | k_repo_intel   | Static analysis report output        |

`WORKING` refers to the project working directory root.

---

## Security Model

### Internal Secret

At startup, `server.py` loads or generates a 64-character hexadecimal secret. This secret is used to authenticate:

- Desktop-to-MCP communication via `POST /_x9k_desktop_auth`
- Leader agent registration via `POST /_x9k_register_leader`

All comparisons use `hmac.compare_digest()` for timing-safe equality checks.

### Leader-Only Tools

`ToolMetadata.leader_only = True` marks tools that are restricted to registered leader agents. `MCPProtocol` checks leader registration status before dispatching calls to these tools.

### PTY Command Security

Two-layer defense in `command_security.py`:

1. **Block layer:** 23 regex patterns matched against the raw command string. Any match causes an immediate error return without executing the command.

2. **Redact layer:** 6 regex patterns applied to PTY output before it is emitted to the Gateway. Secrets are replaced with labeled placeholders.

### k_files Sandboxing

File write and delete operations check the resolved absolute path against a protected path list. Any attempt to write to `.git/`, `.env` files, or `node_modules/` is rejected with an error.

The 50% shrink warning is a soft guard: if an edit would reduce a file to less than half its current size, the tool returns a warning requiring the caller to confirm before proceeding.

---

*End of document.*
