# Kuroryuu MCP Access

Kuroryuu MCP_CORE is an **HTTP server**, not a stdio MCP server.

## Access Method
- **URL**: `http://127.0.0.1:8100/mcp`
- **Protocol**: JSON-RPC 2.0 over HTTP POST
- **NOT compatible** with Kiro's stdio MCP config

## Starting the Server
```powershell
cd <PROJECT_ROOT>\apps\mcp_core
.\run.ps1
```

## Endpoints
- `GET /` - Health check, lists tools
- `GET /health` - Quick health check
- `POST /mcp` - MCP JSON-RPC endpoint
- `GET /tools` - List available tools

## Available Tools
- RAG: `k_rag` - query, status, index
- Repo Intel: `k_repo_intel` - status, run, get, list
- Inbox: `k_inbox` - send, list, read, claim, complete
- Messaging: `k_msg` - send, check, read, reply, complete, broadcast, list_agents (simplified k_inbox wrapper)
- Checkpoints: `k_checkpoint` - save, list, load
- Session: `k_session` - start, end, log, context
- Memory: `k_memory` - get, set_goal, add_blocker
- Files: `k_files` - read, write, list
- PTY: `k_pty` - list, create, send_line, read, talk, term_read, resolve (ALL agents)
- Interact: `k_interact` - ask, approve, plan (LEADER-ONLY)
- Collective: `k_collective` - record_success, record_failure, query_patterns

## Example Call
```bash
curl -X POST http://127.0.0.1:8100/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
