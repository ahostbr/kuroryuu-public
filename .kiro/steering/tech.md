# Technical Architecture

## Technology Stack

### Backend
- **Gateway**: Python 3.10+ / FastAPI / uvicorn (port 8200)
- **MCP Core**: Python 3.10+ / FastAPI (port 8100)
- **Protocol**: JSON-RPC 2.0 (MCP 2024-11-05)
- **Search**: ripgrep + BM25 + Graphiti knowledge graph
- **Storage**: Filesystem (Maildir, JSON, SQLite)

### Frontend
- **Desktop**: Electron 28+ / React 18 / TypeScript
- **Web**: Next.js 14 / React 18 / TypeScript
- **Styling**: TailwindCSS with Kuroryuu/Matrix themes
- **State**: Zustand + React Query

### CLI
- **Runtime**: Python 3.10+ with AsyncIO
- **UI**: Rich terminal with streaming
- **Providers**: LMStudio, Claude API, CLIProxyAPI

## Architecture Overview
```
┌─────────────────────────────────────────────────────────────┐
│                    Kuroryuu Desktop                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │
│  │ Leader  │ │ Worker  │ │ Worker  │ │    Command      │   │
│  │Terminal │ │Terminal │ │Terminal │ │    Center       │   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────────┬────────┘   │
│       │          │          │                 │            │
│  ┌────┴──────────┴──────────┴─────────────────┴────────┐   │
│  │           PTY Manager (node-pty)                     │   │
│  └────────────────────────┬────────────────────────────┘   │
└───────────────────────────┼────────────────────────────────┘
                            │ WebSocket + HTTP
              ┌─────────────▼─────────────┐
              │     Gateway (8200)        │
              │  ┌────────────────────┐   │
              │  │ 21 FastAPI Routers │   │
              │  │ Agent Registry     │   │
              │  │ WebSocket Events   │   │
              │  │ Streaming Chat     │   │
              │  └────────────────────┘   │
              └─────────────┬─────────────┘
                            │
              ┌─────────────▼─────────────┐
              │     MCP Core (8100)       │
              │  ┌────────────────────┐   │
              │  │ 16 MCP Tools       │   │
              │  │ → 118 Actions      │   │
              │  │ Session Manager    │   │
              │  │ Tool Registry      │   │
              │  └────────────────────┘   │
              └─────────────┬─────────────┘
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
┌──────▼──────┐      ┌──────▼──────┐      ┌──────▼──────┐
│  Filesystem │      │   SQLite    │      │  External   │
│  - Maildir  │      │  - Traffic  │      │  - LMStudio │
│  - JSON     │      │  - RAG idx  │      │  - Claude   │
│  - Checkpts │      │  - Sessions │      │  - OpenAI   │
└─────────────┘      └─────────────┘      └─────────────┘
```

## Component Details

### Gateway (port 8200)
- 21 FastAPI routers for all platform operations
- Agent registry with heartbeat monitoring
- WebSocket events for real-time updates
- Streaming chat proxy to LLM providers
- PTY daemon management

### MCP Core (port 8100)
- 16 MCP tools with 118 routed actions
- Routed architecture prevents tool bloat
- Session isolation per agent
- JSON-RPC 2.0 compliance

### Desktop (Electron + React)
- 235 React components
- 16 screens + 13 modals
- Terminal grid with PTY persistence
- Claude Task Monitor with Gantt timeline
- Traffic flow visualization

### Kuroryuu CLI (9,030 LOC)
- 24 slash commands
- 61+ models via 6 providers
- Leader/Worker role enforcement
- AsyncIO streaming architecture

## Development Environment
```bash
# Prerequisites
Python 3.10+
Node.js 18+
Git
Kiro CLI (for development)

# Start all services
.\run_all.ps1

# Or individually
cd apps/gateway && python server.py    # Gateway (8200)
cd apps/mcp_core && python server.py   # MCP Core (8100)
cd apps/desktop && npm run dev         # Desktop
```

## Code Standards
- TypeScript strict mode for frontend
- Type hints on all Python functions
- Docstrings for all tool handlers
- Error responses: `{ok: false, error_code, message, details}`
- Success responses: `{ok: true, ...data}`

## Testing Strategy
- E2E tests with Playwright for Desktop
- Integration tests for Gateway routers
- Unit tests for MCP tool handlers
- Manual verification with Kiro CLI

## Security Model
- **Fail-closed**: Leader death blocks UI until restart
- **Path validation**: No `..` traversal allowed
- **OPT-IN features**: k_pccontrol, k_clawd require explicit enable
- **Session isolation**: Each agent gets unique session
- **No external auth**: Designed for local/trusted network

## Performance Requirements
- Desktop startup: <5 seconds
- Gateway concurrent connections: 100+
- RAG query: <500ms (ripgrep), <2s (fallback)
- Inbox operations: <50ms
- Checkpoint save/load: <100ms
- WebSocket latency: <100ms
