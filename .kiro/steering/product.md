# Product Overview

## Product Purpose
Kuroryuu (黒き幻影の霧の龍 - "Black Dragon of Illusionary Fog") is a production-ready multi-agent AI orchestration platform that enables autonomous AI agents to collaborate on complex software development tasks. It provides a complete ecosystem including Desktop application, Gateway API, MCP tool server, and CLI interface.

## Target Users
- **AI Agent Developers**: Building autonomous coding assistants with multi-agent coordination
- **Enterprise Teams**: Need orchestrated AI workflows with monitoring and control
- **Hackathon Participants**: Rapid prototyping with 16 MCP tools and 118 actions
- **DevOps Engineers**: Automating multi-agent workflows with Ralph leader pattern
- **Solo Developers**: Full AI-powered development environment with desktop app

## Key Features

### Multi-Agent Orchestration (Ralph Leader)
- Leader/worker pattern with hierarchical task delegation
- Desktop monitors Ralph for inactivity and sends nudges
- k_inbox for Maildir-based inter-agent messaging
- k_pty for terminal control and worker intervention
- Visual monitoring via LeaderMonitorModal

### MCP Tool Suite (16 Tools → 118 Routed Actions)
| Tool | Actions | Purpose |
|------|---------|---------|
| k_rag | 12 | Multi-strategy search (keyword, semantic, hybrid, reflective, agentic) |
| k_pty | 12 | Terminal control & injection |
| k_clawd | 11 | Clawdbot orchestration (OPT-IN) |
| k_inbox | 8 | Maildir messaging |
| k_capture | 8 | Screen capture |
| k_pccontrol | 8 | Desktop automation via PowerShell Win32 APIs (OPT-IN) |
| k_session | 7 | Session lifecycle |
| k_memory | 7 | Working memory |
| k_graphiti_migrate | 6 | Knowledge graph migration |
| k_collective | 6 | Agent coordination |
| k_repo_intel | 5 | Repository intelligence |
| k_files | 5 | File operations |
| k_checkpoint | 4 | Session persistence |
| k_thinker_channel | 3 | Thinker communication |
| k_MCPTOOLSEARCH | 2 | Tool discovery |
| k_help | - | Help system |

### Desktop Application (235 React Components)
- 16 main screens + 13 modals with Kuroryuu/Matrix themes
- Terminal grid with PTY persistence (survives restarts)
- Command Center with Agents, Tools, Servers tabs
- Claude Task Monitor with donut chart + Gantt timeline
- HTTP/PTY Traffic flow visualization
- Full VSCode-style Code Editor with @ mentions
- GitHub Desktop-style Worktrees manager

### Kuroryuu CLI (9,030 LOC)
- 24 slash commands for full agent control
- 61+ LLM models via 6 providers (Claude, OpenAI, Gemini, Copilot, Kiro, Antigravity)
- Leader/Worker role support with permission enforcement
- Human-in-the-loop gates (/ask, /approve)
- AsyncIO streaming with rich terminal UI

## Business Objectives
- Provide complete AI development platform for hackathon and production use
- Enable multi-agent coordination through leader/worker orchestration
- Support 61+ LLM models across 6 providers
- Persist agent state across sessions with checkpoints

## User Journey
1. **Launch**: `.\run_all.ps1` starts Gateway, MCP Core, and Desktop
2. **Configure**: Set up LLM provider via Settings or CLI
3. **Orchestrate**: Leader agent delegates to workers via inbox
4. **Monitor**: Desktop shows real-time traffic, tasks, and agent status
5. **Persist**: Checkpoints save full session state for resume

## Development Statistics
| Metric | Value |
|--------|-------|
| Development Days | 23 |
| Total Sessions | 437 |
| Tasks Completed | 431 |
| MCP Tools | 16 (118 actions) |
| React Components | 235 |
| Desktop Screens | 16 + 13 modals |
| Gateway Routers | 21 |
| Kuroryuu CLI | 9,030 LOC |
| CLI Commands | 24 |
| LLM Models | 61+ |
| Worklogs | 175+ |
| Checkpoints | 100+ |

## Success Criteria
- Desktop app launches in <5 seconds
- Gateway handles 100+ concurrent WebSocket connections
- RAG queries return in <500ms for typical projects
- Zero data loss on leader death (fail-closed security)
- 100% MCP protocol compliance
