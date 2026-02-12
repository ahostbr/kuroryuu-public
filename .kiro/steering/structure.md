# Project Structure

## Directory Layout
```
Kuroryuu/
├── .kiro/                          # Kiro CLI configuration
│   ├── steering/                   # Product/tech/structure docs
│   │   ├── product.md              # Product vision and features
│   │   ├── tech.md                 # Technical architecture
│   │   ├── structure.md            # This file
│   │   ├── CONVENTIONS.md          # Code style guidelines
│   │   ├── RULES.md                # Development principles
│   │   ├── KURORYUU_LAWS.md        # Operational rules
│   │   └── kuroryuu-mcp.md         # MCP-specific conventions
│   ├── prompts/                    # Custom Kiro prompts
│   │   ├── prime.md                # Load project context
│   │   ├── plan-feature.md         # Design architecture
│   │   ├── execute.md              # Implementation workflow
│   │   ├── code-review.md          # Quality assurance
│   │   ├── code-review-hackathon.md # Hackathon rubric
│   │   ├── rca.md                  # Root cause analysis
│   │   ├── create-prd.md           # Requirements docs
│   │   └── system-review.md        # Integration verification
│   ├── specs/                      # Feature specifications
│   └── documentation/              # Kiro CLI reference docs
│
├── apps/
│   ├── gateway/                    # FastAPI gateway (port 8200)
│   │   ├── server.py               # Main entrypoint
│   │   ├── routers/                # 21 API routers
│   │   ├── services/               # Business logic
│   │   └── models/                 # Pydantic models
│   │
│   ├── mcp_core/                   # MCP tool server (port 8100)
│   │   ├── server.py               # FastAPI entrypoint
│   │   ├── protocol.py             # JSON-RPC 2.0 handler
│   │   ├── tools/                  # 16 MCP tool modules
│   │   │   ├── tools_rag.py        # RAG (12 actions)
│   │   │   ├── tools_pty.py        # PTY (12 actions)
│   │   │   ├── tools_clawd.py      # Clawdbot (11 actions)
│   │   │   ├── tools_inbox.py      # Inbox (8 actions)
│   │   │   ├── tools_capture.py    # Capture (8 actions)
│   │   │   ├── tools_pccontrol.py  # PowerShell Win32 APIs (8 actions)
│   │   │   └── ...                 # Other tools
│   │   └── run.ps1                 # Launcher script
│   │
│   ├── desktop/                    # Electron + React app
│   │   ├── src/
│   │   │   ├── main/               # Electron main process
│   │   │   ├── renderer/           # React app (235 components)
│   │   │   │   ├── components/     # Reusable components
│   │   │   │   ├── screens/        # 16 main screens
│   │   │   │   ├── modals/         # 13 modal dialogs
│   │   │   │   └── stores/         # Zustand state
│   │   │   └── preload/            # IPC bridge
│   │   ├── electron.vite.config.ts
│   │   └── package.json
│   │
│   ├── web/                        # Next.js web UI
│   │   ├── src/
│   │   │   ├── app/                # App router pages
│   │   │   └── components/         # Shared components
│   │   └── package.json
│   │
│   └── kuroryuu_cli/               # Python REPL (9,030 LOC)
│       ├── __main__.py             # CLI entrypoint
│       ├── commands/               # 24 slash commands
│       ├── providers/              # LLM provider adapters
│       ├── agents/                 # Subagent spawning
│       └── utils/                  # Shared utilities
│
├── ai/                             # AI harness files
│   ├── checkpoints/                # Session persistence (100+)
│   ├── prompts/                    # PRD-First workflow prompts
│   │   ├── workflows/              # execute, review, validate
│   │   ├── leader/                 # Leader agent prompts
│   │   ├── worker/                 # Worker agent prompts
│   │   └── phases/                 # Phase-specific prompts
│   ├── inbox/                      # Maildir message store
│   │   ├── new/                    # Unread messages
│   │   ├── cur/                    # Read messages
│   │   └── done/                   # Completed messages
│   ├── collective/                 # Pattern library
│   ├── traffic/                    # Request history (SQLite)
│   ├── logs/                       # Application logs
│   ├── todo.md                     # Task tracking (source of truth)
│   ├── hooks.json                  # Hook configuration
│   └── sessions.json               # Session registry
│
├── Docs/
│   ├── DEVLOG.md                   # Development timeline (23 days)
│   ├── worklogs/                   # 175+ session logs
│   ├── Plans/                      # Implementation plans
│   │   └── Archive/                # Completed plans
│   └── Architecture/               # Architecture docs
│
├── .claude/                        # Claude Code config
│   └── rules/                      # Project rules
│
├── KURORYUU_BOOTSTRAP.md           # Agent bootstrap guide
├── KURORYUU_LEADER.md              # Leader agent instructions
├── KURORYUU_WORKER.md              # Worker agent instructions
├── KURORYUU_LAWS.md                # Operational rules
├── README.md                       # Project overview
├── DEMO.md                         # Technical deep-dive
├── run_all.ps1                     # Start all services
└── kill_all.ps1                    # Stop all services
```

## File Naming Conventions
- **Python**: `snake_case.py` (e.g., `tools_rag.py`, `server.py`)
- **TypeScript**: `PascalCase.tsx` for components, `camelCase.ts` for utils
- **Docs**: `PascalCase.md` or `UPPERCASE.md` for top-level
- **Worklogs**: `KiroWorkLog_YYYYMMDD_HHMMSS_Description.md`
- **Checkpoints**: `cp_YYYYMMDD_HHMMSS_<hash>.json`
- **Plans**: `YYYYMMDD_FeatureName.md`

## Module Organization

### MCP Core Tools
Each tool module exports a `register_*_tools()` function:
- `tools_rag.py` → k_rag (12 actions)
- `tools_pty.py` → k_pty (12 actions)
- `tools_inbox.py` → k_inbox (8 actions)
- `tools_msg.py` → k_msg (8 actions — simplified wrapper for k_inbox)
- Action routing via `action` parameter prevents tool bloat

### Desktop Screens (16)
1. Home (onboarding videos)
2. Terminals (PTY grid)
3. Dojo (PRD workflow)
4. Kanban (task board)
5. Worktrees (Git management)
6. Insights (analytics)
7. Traffic (HTTP/PTY monitoring)
8. Orchestration (Ralph leader)
9. Command Center (agents/tools/servers)
10. Capture (screenshots)
11. Memory (working state)
12. Integrations (external services)
13. Settings (configuration)
14. Code Editor (VSCode-style)
15. Checkpoints (session history)
16. Transcripts (conversation search)

### Desktop Modals (13)
LeaderMonitorModal, ClawdbotSetupModal, TaskDetailModal, etc.

## Configuration Files
- `run_all.ps1` / `kill_all.ps1` - Service orchestration
- `ai/hooks.json` - Gateway hook definitions
- `ai/sessions.json` - Session registry
- `.env` files - Environment-specific settings

## Documentation Hierarchy
1. `README.md` - Quick start, hackathon stats
2. `DEMO.md` - Technical deep-dive with curl examples
3. `KURORYUU_BOOTSTRAP.md` - Agent onboarding
4. `.kiro/steering/` - Kiro-specific docs
5. `Docs/DEVLOG.md` - Development timeline
6. `Docs/worklogs/` - Detailed session logs

## Build Artifacts (gitignored)
- `ai/traffic/history.db` - Request history
- `ai/checkpoints/*.json` - Session checkpoints
- `apps/desktop/dist/` - Electron build
- `apps/web/.next/` - Next.js build
- `__pycache__/` - Python bytecode
- `node_modules/` - NPM packages
