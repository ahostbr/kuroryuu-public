# Kuroryuu - Multi-Agent AI Orchestration Platform
Check out :
https://www.kuroryuu.com/
For more information !

> **Dynamous x Kiro Hackathon Entry** | January 5-30, 2026 | 26 Days of Development

Kuroryuu (黒き幻影の霧の龍 - "Black Dragon of Illusionary Fog") is a production-ready multi-agent AI orchestration platform that enables autonomous AI agents to collaborate on complex software development tasks. Features Ralph leader orchestration, desktop automation via PowerShell/Win32 APIs, and 61+ LLM models across 6 providers.

## Prerequisites

**For Windows (native installation):**
- **Python 3.12** (required for MCP Core - uses FastAPI features not in older versions)
- **Node.js 18+** (for Desktop and Web apps)
- **Git** (for cloning)
- **Windows** (PowerShell scripts, Win32 APIs for desktop automation)

**For Docker (cross-platform):**
- **Docker** with Docker Compose
- Works on Windows, Linux, macOS

## Installation

### 1. Clone the Repository

```powershell
git clone https://github.com/ahostbr/kuroryuu-public
cd kuroryuu-public
```

### 2. Run Setup Script

```powershell
.\setup-project.ps1
```

This script automatically:
- Sets `KURORYUU_PROJECT_ROOT` environment variable (persistent)
- Generates `.mcp.json` from template with resolved paths
- Creates Python 3.12 virtual environment (`.venv_mcp312`)
- Installs all Python dependencies (mcp_core, gateway, mcp_stdio)
- Installs all Node.js dependencies (desktop, pty_daemon, web)
- Checks for required build assets

**Optional flags:**
```powershell
.\setup-project.ps1 -SkipPython   # Skip Python venv and deps
.\setup-project.ps1 -SkipNode     # Skip Node.js deps
.\setup-project.ps1 -Force        # Overwrite existing configs
```

### 3. Restart Terminal

After setup completes, **restart your terminal** to pick up the new environment variable.

### 4. Start All Services

```powershell
.\run_all.ps1
```

## Quick Start (After Installation)

```powershell
# Start all services (gateway, mcp_core, desktop)
.\run_all.ps1

# Stop all services
.\kill_all.ps1

# Or start individually
cd apps/gateway && python server.py        # Gateway (port 8200)
cd apps/mcp_core && python server.py       # MCP Core (port 8100)
cd apps/desktop && npm run dev             # Desktop App
```

Access the application:
- **Desktop App**: Launches automatically
- **Gateway API**: http://127.0.0.1:8200/docs
- **MCP Core**: http://127.0.0.1:8100/mcp

## Docker Installation (Backend Dev / CI)

Docker support is for **backend developers** and **CI pipelines**. Kuroryuu is Windows-first; full functionality requires native Windows installation.

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/ahostbr/kuroryuu-public
cd kuroryuu-public

# 2. Configure environment
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY (required for chat)

# 3. Start all services
docker-compose up -d

# 4. Verify health
docker-compose ps
curl http://localhost:8100/health   # MCP Core
curl http://localhost:8200/v1/health # Gateway
curl http://localhost:7073/health   # PTY Daemon
curl http://localhost:3000/         # Web UI
```

### Services

| Service | Port | Health Endpoint | Purpose |
|---------|------|-----------------|---------|
| MCP Core | 8100 | `/health` | MCP tool server (15 tools, 107 actions) |
| Gateway | 8200 | `/v1/health` | FastAPI + WebSocket, chat streaming |
| PTY Daemon | 7072 (RPC), 7073 (health) | `/health` | Terminal emulation backend |
| Web UI | 3000 | `/` | React SPA served via nginx |

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Required for chat functionality
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional overrides
KURORYUU_GATEWAY_PORT=8200
KURORYUU_MCP_PORT=8100
KURORYUU_AUTH_ENABLED=true
KURORYUU_AUTH_PASSWORD_HASH=<sha256-hash>
```

### Docker Commands

```bash
# Start in background
docker-compose up -d

# View logs (follow mode)
docker-compose logs -f

# View specific service logs
docker-compose logs -f gateway

# Rebuild after code changes
docker-compose build
docker-compose up -d

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Limitations in Docker Mode

Windows-only features are automatically disabled:
- `k_capture` - Requires Win32 display APIs
- `k_pccontrol` - Requires PowerShell + Win32 APIs
- Desktop Electron app - Use Web UI instead
- Tray Companion - Windows SAPI required

**For full functionality** including desktop automation, use native Windows installation.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Kuroryuu Desktop                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │
│  │ Leader  │ │ Worker  │ │ Worker  │ │   Command       │   │
│  │Terminal │ │Terminal │ │Terminal │ │   Center        │   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────────┬────────┘   │
└───────┼──────────┼──────────┼─────────────────┼─────────────┘
        │          │          │                 │
        └──────────┴──────────┴─────────────────┘
                         │
              ┌──────────▼──────────┐
              │    Gateway (8200)    │
              │  FastAPI + WebSocket │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │   MCP Core (8100)    │
              │  15 Tools→107 Actions│
              └─────────────────────┘
```

### Key Components

- **Gateway**: FastAPI server with 21 routers, agent registry, WebSocket events, streaming chat
- **MCP Core**: 15 MCP tools with 107 routed actions (RAG, Inbox, Checkpoints, PTY, PCControl...)
- **Desktop**: Electron + React + TypeScript with 235 components, 16 screens, 13 modals
- **Kuroryuu CLI**: 6,137 LOC Python REPL with 24 slash commands, 61+ models via 3 providers
- **Leader/Worker Pattern**: Ralph orchestration with Desktop monitoring and nudging

## Kiro CLI Integration

This project was built using [Kiro CLI](https://kiro.dev) for AI-powered development.

### Development Statistics

| Metric | Value |
|--------|-------|
| Development Days | 26 |
| Total Sessions | 460+ |
| Tasks Completed | 445 |
| MCP Tools | 15 (107 actions) |
| React Components | 235 |
| Desktop Screens | 16 + 13 modals |
| Gateway Routers | 21 |
| **Total Source LOC** | **235,626** |
| Desktop (TypeScript) | 95,426 |
| Gateway (Python) | 23,097 |
| MCP Core (Python) | 10,292 |
| Kuroryuu CLI (Python) | 6,137 |
| CLI Commands | 24 |
| LLM Models Supported | 61+ |
| Plugin Commands | 20 |
| Worklogs | 602 |
| Checkpoints | 706 |

### Custom Prompts (`ai\prompts\workflows\`)

| Prompt | Purpose |
|--------|---------|
| `@prime` | Load comprehensive project context |
| `@plan-feature` | Design feature architecture |
| `@execute` | Systematic implementation with task tracking |
| `@code-review` | Quality assurance before commits |
| `@code-review-hackathon` | Hackathon rubric evaluation |
| `@rca` | Root cause analysis for debugging |
| `@create-prd` | Requirements documentation |
| `@system-review` | Integration verification |

### Steering Documents (`.kiro/steering/`)

- **product.md** - Product vision and user personas
- **tech.md** - Technical architecture and standards
- **structure.md** - Project organization patterns
- **CONVENTIONS.md** - Code style guidelines
- **RULES.md** - Development principles
- **kuroryuu-mcp.md** - MCP-specific conventions

### Development Workflow

1. `@prime` - Load context at session start
2. `@plan-feature` - Design before coding
3. `@execute` - Implement with task tracking
4. `@code-review` - Ensure quality before commit
5. Update steering docs - Maintain knowledge base

### MCP Tools (16 Tools → 115 Routed Actions)

Kiro CLI connects directly to Kuroryuu's MCP server, providing access to:

| Tool | Actions | Purpose |
|------|---------|---------|
| **k_rag** | 12 | Multi-strategy search (keyword, semantic, hybrid, reflective, agentic) |
| **k_pty** | 12 | Terminal control & injection |
| **k_inbox** | 8 | Maildir messaging |
| **k_msg** | 8 | Simplified inter-agent messaging (send, check, read, reply, broadcast) |
| **k_capture** | 8 | Screen capture |
| **k_pccontrol** | 8 | Desktop automation via PowerShell/Win32 APIs (OPT-IN) |
| **k_session** | 7 | Session lifecycle |
| **k_memory** | 7 | Working memory |
| **k_graphiti_migrate** | 6 | Knowledge graph migration |
| **k_collective** | 6 | Agent coordination |
| **k_repo_intel** | 5 | Repository intelligence |
| **k_files** | 5 | File operations |
| **k_checkpoint** | 4 | Session persistence |
| **k_thinker_channel** | 3 | Thinker communication |
| **k_MCPTOOLSEARCH** | 2 | Tool discovery |
| **k_help** | - | Help system |

## Features

### Multi-Agent Orchestration (Ralph Leader)

**Ralph** is the autonomous leader agent that orchestrates workers:
- Desktop monitors Ralph for inactivity and sends nudges
- Ralph monitors workers via k_pty for promise signals
- Skills: `/k-ralph`, `/ralph_done`, `/ralph_progress`, `/ralph_stuck`
- Visual monitoring via LeaderMonitorModal in Desktop

**Core Features:**
- Leader/worker pattern with hierarchical task delegation
- Fail-closed security model (leader death blocks UI)
- Real-time agent registry with heartbeat monitoring
- k_pccontrol for full Windows desktop automation (OPT-IN)

### Desktop Application (235 React Components)
- 16 main screens + 13 modals with Kuroryuu/Matrix themes
- Terminal grid with PTY persistence (survives restarts)
- Command Center with Agents, Tools, Servers tabs
- Claude Task Monitor with donut chart + Gantt timeline
- HTTP/PTY Traffic flow visualization with network graphs
- Full VSCode-style Code Editor with @ mentions
- GitHub Desktop-style Worktrees manager
- Changelog generator from completed tasks
- 437 searchable conversation transcripts

### MCP Tool Suite (15 Tools, 107 Actions)
- Routed tool architecture to prevent tool bloat
- k_pccontrol for full Windows desktop automation
- RAG search with 12 strategies (keyword, semantic, hybrid, agentic...)
- Maildir-based inbox for multi-agent messaging
- Graphiti knowledge graph integration

### Kuroryuu CLI (6,137 LOC)

A full-featured Python REPL for AI-powered development:

```bash
cd apps/kuroryuu_cli
python -m kuroryuu_cli --help
```

**24 Slash Commands:**
```
/help /exit /status /clear /context /compact /history
/config /model /provider /mode /permissions /doctor
/init /memory /tools /review /plan /execute /agents /ask /approve
```

**3 Providers, 61+ Models:**
- LMStudio (local inference)
- Claude API (with OAuth for Pro/Max)
- CLIProxyAPI (Anthropic, OpenAI, Gemini, GitHub Copilot, Kiro, Antigravity)

**Features:**
- Leader/Worker role support with permission enforcement
- Subagent spawning (Explorer, Planner types)
- Human-in-the-loop gates (/ask, /approve)
- 3 operation modes: Normal, Plan (dry run), Read-only
- AsyncIO streaming with rich terminal UI

### CLI Bootstrap Integrations
- Bootstrap files for 8 major AI tools:
  - Kiro CLI, Cursor, Copilot, Cline, Windsurf, Codex, Antigravity

## Directory Structure

```
kuroryuu/
├── apps/
│   ├── gateway/          # FastAPI gateway (port 8200)
│   ├── mcp_core/         # MCP tool server (port 8100)
│   ├── desktop/          # Electron + React app
│   └── web/              # Next.js web UI
├── ai/
│   ├── checkpoints/      # Agent checkpoints
│   ├── prompts/          # PRD-First workflow prompts
│   ├── collective/       # Pattern library
│   └── traffic/          # Request history
├── .kiro/
│   ├── steering/         # Project knowledge
│   ├── prompts/          # Custom Kiro prompts
│   └── specs/            # Feature specifications
├── Docs/
│   ├── DEVLOG.md         # Development timeline
│   ├── worklogs/         # 602 session logs
│   └── Plans/            # Implementation plans
├── KURORYUU_BOOTSTRAP.md # Agent bootstrap guide
├── KURORYUU_LEADER.md    # Leader agent instructions
└── KURORYUU_WORKER.md    # Worker agent instructions
```

## Troubleshooting

### Setup script fails - Python 3.12 not found
```powershell
# Install Python 3.12 from python.org
# Ensure 'py' launcher is installed (checked by default)
py -3.12 --version   # Should show Python 3.12.x
```

### Desktop app won't build - missing icon
The desktop app requires `apps/desktop/build/icon.png` (256x256 PNG).
Create this file before running `npm run build` in the desktop app.

### Gateway won't start
```powershell
# Check if port 8200 is in use
netstat -an | findstr 8200

# Kill existing process and restart
.\kill_all.ps1
.\run_all.ps1
```

### MCP tools not responding
```bash
# Check MCP Core health
curl http://127.0.0.1:8100/health

# Verify tools list
curl -X POST http://127.0.0.1:8100/mcp -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Desktop app blank terminals
- Restart the app (terminals persist via PTY daemon)
- Check `ai/logs/main.log` for errors

### Leader death warning
- This is intentional fail-closed security
- Click "Restart Application" to recover
- First terminal is always the leader

## Documentation

| Document | Purpose |
|----------|---------|
| [DEVLOG.md](Docs/DEVLOG.md) | Complete development timeline with Kiro CLI stats |
| [DEMO.md](DEMO.md) | Technical deep-dive with curl examples |
| [KURORYUU_BOOTSTRAP.md](KURORYUU_BOOTSTRAP.md) | Agent bootstrap guide |
| [KURORYUU_LAWS.md](KURORYUU_LAWS.md) | Operational rules |

## Hackathon Submission

- **Duration**: 26 days of development (460+ sessions)
- **Tasks Completed**: 445 total
- **Total Source Code**: 235,626 LOC (TypeScript + Python)
- **MCP Tools**: 15 tools with 107 routed actions
- **Desktop App**: 95,426 LOC TypeScript (235 React components)
- **Gateway**: 23,097 LOC Python (21 routers)
- **Kuroryuu CLI**: 6,137 LOC Python (24 commands)
- **LLM Models**: 61+ via 6 providers
- **Documentation**: 602 worklogs, 706 checkpoints

## License

**AGPL-3.0** - See [LICENSE](LICENSE) for details.

You can use, modify, and distribute Kuroryuu freely. If you modify and deploy it (including as a network service), you must open source your changes under AGPL-3.0.

---

**Built with Kiro CLI for the Dynamous x Kiro Hackathon 2026**
