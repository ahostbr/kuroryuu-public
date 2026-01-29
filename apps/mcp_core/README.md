# MCP_CORE - Minimal MCP Tool Server for Kuroryuu

Lightweight MCP JSON-RPC 2.0 server exposing RAG, Inbox, and Checkpoint tools.
Compatible with AG-UI gateway's `tools/list` + `tools/call` protocol.

## Quick Start

```powershell
# From Kuroryuu root
cd apps/mcp_core
.\run.ps1

# Or with custom settings
.\run.ps1 -Port 8080 -Python "<PROJECT_ROOT>\.venv\Scripts\python.exe"
```

## Requirements

- Python 3.10+
- FastAPI
- uvicorn

```bash
pip install fastapi uvicorn[standard]
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KURORYUU_PROJECT_ROOT` | `<PROJECT_ROOT>` | Project root directory |
| `KURORYUU_MCP_HOST` | `127.0.0.1` | Server host |
| `KURORYUU_MCP_PORT` | `8000` | Server port |
| `KURORYUU_MCP_PATH` | `/mcp` | MCP endpoint path |
| `KURORYUU_INBOX_ROOT` | `{PROJECT}/ai/inbox` | Maildir-based message queue |
| `KURORYUU_CHECKPOINT_ROOT` | `{PROJECT}/WORKING/checkpoints` | Checkpoint storage |
| `KURORYUU_RAG_INDEX_DIR` | `{PROJECT}/WORKING/rag_index` | RAG index storage |
| `KURORYUU_ALLOW_EXTERNAL_ROOT` | `0` | Allow RAG on external paths |

## API Endpoints

### Health Check
```
GET /
```
Returns server status and tool list.

### MCP JSON-RPC
```
POST /mcp
Content-Type: application/json
```

Supports:
- `initialize` - Session handshake
- `tools/list` - List available tools
- `tools/call` - Execute a tool

### Convenience
```
GET /tools
```
List tools without MCP protocol.

## Tools

### RAG Tools

#### rag.query
Search project files by keyword. Uses ripgrep (`rg`) if available for fast searches, otherwise falls back to pure Python.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `query` | string | ✅ | - | Search query |
| `top_k` | integer | | 8 | Max results (1-25) |
| `exts` | array | | [.py,.md,.ts...] | Filter extensions |
| `root` | string | | project root | Root directory |
| `case_sensitive` | boolean | | false | Case-sensitive |

**Response Schema:**
```json
{
  "ok": true,
  "rag_mode": "keyword_rg",          // or "keyword_fallback"
  "query": "FastAPI server",
  "root": "<PROJECT_ROOT>",
  "matches": [
    {
      "path": "apps/mcp_core/server.py",
      "start_line": 10,
      "end_line": 26,
      "snippet": "...",
      "score": 0.85,
      "match_kind": "keyword"
    }
  ],
  "stats": {
    "files_scanned": 120,
    "files_skipped": 45,
    "elapsed_ms": 234
  }
}
```

**curl Example:**
```bash
curl -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: session_xxx" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "rag.query",
      "arguments": {
        "query": "FastAPI server",
        "top_k": 5,
        "exts": [".py"],
        "case_sensitive": false
      }
    }
  }'
```

#### rag.status
Check RAG index status, ripgrep availability, and configuration.

**Response:**
```json
{
  "ok": true,
  "indexed": true,
  "chunk_count": 1234,
  "doc_count": 1234,
  "index_path": "<PROJECT_ROOT>/WORKING/rag_index",
  "project_root": "<PROJECT_ROOT>",
  "ripgrep_available": true,
  "ripgrep_path": "C:/scoop/shims/rg.exe",
  "max_file_bytes": 1500000,
  "default_exts": [".py", ".md", ".ts", "..."]
}
```

**curl Example:**
```bash
curl -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: session_xxx" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "rag.status", "arguments": {}}}'
```

#### rag.index
Build or rebuild BM25 index (for indexed search mode).

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `root` | string | | project root | Directory to index |
| `force` | boolean | | false | Force full rebuild |

**Response:**
```json
{
  "ok": true,
  "chunks_indexed": 1234,
  "files_processed": 120,
  "files_skipped": 45,
  "index_path": "<PROJECT_ROOT>/WORKING/rag_index",
  "elapsed_ms": 5678
}
```

**curl Example:**
```bash
curl -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: session_xxx" \
  -d '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "rag.index", "arguments": {"force": true}}}'
```

### Inbox Tools

Maildir-style message queue with folders: `new/`, `cur/`, `done/`, `dead/`

#### inbox.send
Send a message to the inbox (creates in `new/` folder).

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `payload` | object | ✅ | - | Message payload (any JSON) |
| `title` | string | | "" | Optional message title |
| `thread_id` | string | | "" | Optional thread ID |

**Response:**
```json
{
  "ok": true,
  "message": {
    "id": "uuid...",
    "created_at": "2026-01-05T20:00:00+00:00",
    "status": "new",
    "thread_id": "",
    "title": "My task",
    "payload": {"task": "review PR"}
  },
  "path": "<PROJECT_ROOT>/WORKING/inbox/new/20260105_200000__My_task__uuid.json",
  "folder": "new"
}
```

**curl Example:**
```bash
curl -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: session_xxx" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "inbox.send",
      "arguments": {
        "payload": {"task": "review PR", "priority": "high"},
        "title": "Code review request"
      }
    }
  }'
```

#### inbox.list
List messages in a folder.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `folder` | string | | "new" | Folder: new, cur, done, dead |
| `limit` | integer | | 50 | Max messages (1-200) |
| `include_payload` | boolean | | false | Include full payload |

**Response:**
```json
{
  "ok": true,
  "folder": "new",
  "count": 2,
  "messages": [
    {
      "id": "uuid...",
      "created_at": "2026-01-05T20:00:00+00:00",
      "status": "new",
      "title": "Task 1",
      "thread_id": "",
      "path": "...",
      "size_bytes": 234
    }
  ]
}
```

**curl Example:**
```bash
curl -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: session_xxx" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "inbox.list", "arguments": {"folder": "new", "limit": 10}}}'
```

#### inbox.read
Read a message by ID.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `id` | string | ✅ | - | Message ID |
| `folder` | string | | (all) | Folder to search |

**Response:**
```json
{
  "ok": true,
  "message": { "...full message JSON..." },
  "path": "...",
  "folder": "new"
}
```

**curl Example:**
```bash
curl -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: session_xxx" \
  -d '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "inbox.read", "arguments": {"id": "uuid-here"}}}'
```

#### inbox.claim
Claim a message (move from `new/` to `cur/`). If `id` omitted, claims FIFO oldest.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `id` | string | | (oldest) | Message ID (claims oldest if omitted) |

**Response:**
```json
{
  "ok": true,
  "message": { "...updated message..." },
  "from_folder": "new",
  "to_folder": "cur",
  "path": "..."
}
```

**curl Example (claim oldest):**
```bash
curl -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: session_xxx" \
  -d '{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "inbox.claim", "arguments": {}}}'
```

#### inbox.complete
Complete a claimed message (move from `cur/` to `done/` or `dead/`).

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `id` | string | ✅ | - | Message ID |
| `status` | string | | "done" | Completion status: done or dead |
| `note` | string | | "" | Optional completion note |

**Response:**
```json
{
  "ok": true,
  "message": { "...updated message..." },
  "from_folder": "cur",
  "to_folder": "done",
  "path": "..."
}
```

**curl Example:**
```bash
curl -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: session_xxx" \
  -d '{"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "inbox.complete", "arguments": {"id": "uuid-here", "note": "Task completed successfully"}}}'
```

### Checkpoint Tools

#### checkpoint.save
Save arbitrary JSON data as a checkpoint.

```json
{
  "params": {
    "name": "checkpoint.save",
    "arguments": {
      "name": "session_alpha",
      "data": {"messages": [...], "context": {...}},
      "summary": "After implementing feature X",
      "tags": ["feature-x", "milestone"]
    }
  }
}
```

#### checkpoint.list
List available checkpoints.

```json
{
  "params": {
    "name": "checkpoint.list",
    "arguments": {
      "name": "session_alpha",
      "limit": 5
    }
  }
}
```

#### checkpoint.load
Load a checkpoint by ID or latest by name.

```json
{
  "params": {
    "name": "checkpoint.load",
    "arguments": {
      "name": "session_alpha",
      "id": "latest"
    }
  }
}
```

## Example: Full Session

```bash
# 1. Initialize session
curl -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {"tools": {}},
      "clientInfo": {"name": "test", "version": "1.0"}
    }
  }'

# 2. List tools (use mcp-session-id from response)
curl -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: session_xxx" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}'

# 3. Call a tool
curl -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: session_xxx" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "rag.query",
      "arguments": {"query": "FastAPI", "top_k": 3}
    }
  }'
```

## Storage Layout

```
WORKING/
├── inbox/
│   └── agents/
│       └── <agent>/
│           ├── new/      # Incoming messages
│           ├── cur/      # Claimed/in-progress
│           └── done/     # Completed
├── checkpoints/
│   ├── _index.jsonl      # Checkpoint index
│   └── <name>/
│       └── checkpoint_*.json
└── rag_index/
    ├── bm25_index.json   # BM25 index
    └── chunks.jsonl      # Indexed chunks
```

## Error Response Format

All tool errors return structured JSON:

```json
{
  "ok": false,
  "error_code": "MISSING_PARAM",
  "message": "agent is required",
  "details": {}
}
```

## Gateway Compatibility

This server is compatible with the AG-UI gateway's MCP client expectations:

1. **Session handling**: Responds with `mcp-session-id` header
2. **Protocol version**: `2024-11-05`
3. **Methods**: `initialize`, `tools/list`, `tools/call`
4. **Tool schema**: `name`, `description`, `inputSchema`
5. **Tool result**: `content` array with `type: "text"`

Configure gateway to point to this server:
```
SOTS_MCP_URL=http://127.0.0.1:8000/mcp
```
