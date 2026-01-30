# Kuroryuu Technical Overview

> **黒き幻影の霧の龍** — The Black Dragon of Phantom Mist
>
> A production-grade multi-agent AI orchestration platform built for the Dynamous × Kiro Hackathon (January 5-30, 2026)

---

## Executive Summary

Kuroryuu is a native desktop application that enables multiple AI agents (including Claude Opus 4.5) to work together in real-time, communicating through a sophisticated PTY (pseudo-terminal) mesh network. Agents can read each other's terminals, write to each other's sessions, and form a collective intelligence that operates autonomously for 100+ hours.

---

## Development Metrics

| Metric | Value |
|--------|-------|
| **Development Period** | 25 days (Jan 5-29, 2026) |
| **Total Sessions** | 437 |
| **Tasks Completed** | 431 |
| **MCP Tools** | 16 (routing to 118 actions) |
| **React Components** | 235 |
| **Desktop Screens** | 16 + 16 modals |
| **Gateway Routers** | 21 |
| **CLI Lines of Code** | 7,952 |
| **CLI Commands** | 24 |
| **LLM Models Supported** | 61 |
| **Providers** | 9 |
| **Worklogs** | 175+ |
| **Checkpoints** | 100+ |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           KURORYUU PLATFORM                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      DESKTOP APPLICATION                             │   │
│  │                    (Electron + React + Vite)                         │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │   │
│  │  │  Dojo   │ │ Kanban  │ │Terminal │ │Insights │ │ Monitor │ ...   │   │
│  │  │         │ │  Tasks  │ │  Grid   │ │  Chat   │ │  Views  │       │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│         │                      │                      │                     │
│         ▼                      ▼                      ▼                     │
│  ┌─────────────┐      ┌─────────────────┐     ┌─────────────────┐          │
│  │   GATEWAY   │      │    MCP CORE     │     │   PTY DAEMON    │          │
│  │  (FastAPI)  │◀────▶│   (Python)      │◀───▶│   (Node.js)     │          │
│  │  Port 8200  │      │   Port 8100     │     │   Port 7072     │          │
│  │  21 routers │      │   16 tools      │     │   JSON-RPC      │          │
│  └─────────────┘      └─────────────────┘     └─────────────────┘          │
│         │                      │                      │                     │
│         ▼                      ▼                      ▼                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         AGENT MESH                                   │   │
│  │   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐   │   │
│  │   │  LEADER  │◀───▶│  WORKER  │◀───▶│  WORKER  │◀───▶│ THINKER  │   │   │
│  │   │(Opus 4.5)│     │(Opus 4.5)│     │(Sonnet)  │     │(Opus 4.5)│   │   │
│  │   └──────────┘     └──────────┘     └──────────┘     └──────────┘   │   │
│  │        Real-time PTY read/write between all agents                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      KURORYUU CLI                                    │   │
│  │              (Standalone Python REPL - 7,952 LOC)                    │   │
│  │         24 commands | 3 providers | MCP client | Subagents           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     TRAY COMPANION                                   │   │
│  │           (Electron tray app - TTS/Voice/Hotkeys)                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Desktop Application (Electron)

**Tech Stack:** Electron + Vite + React + TypeScript + Tailwind CSS + Zustand

**16 Main Screens:**

| Screen | Purpose |
|--------|---------|
| **Home** | Overview, CLIProxyAPI, Tray, CLI, Features, Architecture tabs |
| **Dojo** | Unified planning workspace with AI-powered workflows |
| **Kanban** | Visual task management synced with Claude Tasks |
| **Terminals** | Multi-terminal grid with Leader/Worker orchestration |
| **GitHub** | Git worktree management for task-based branches |
| **Insights** | Multi-model AI chat with voice capabilities |
| **Code Editor** | Standalone editor workspace |
| **Claude Tasks** | Donut chart + Gantt timeline monitoring |
| **HTTP Traffic** | Real-time API monitoring with token counts |
| **PTY Traffic** | Agent-to-terminal routing visualization |
| **Command Center** | Agent status, MCP tools, Graphiti access |
| **Capture** | Screenshots, recording, AI visual digest |
| **Integrations** | OAuth configuration for providers |
| **Domain Config** | Model and provider settings |
| **Settings** | App configuration and preferences |
| **Tray Companion** | TTS, voice input, clipboard monitoring |

**16 Modals:**
- Agent Setup Wizard
- Leader Configuration
- Worker Configuration
- Checkpoint Save/Load
- Settings dialogs
- OAuth flows
- And more...

**10 Themes:**
- Oscura Midnight
- Dusk
- Lime
- Ocean
- Retro
- Neo
- Forest
- **Matrix** (with animated digital rain)
- Grunge
- Kuroryuu

**Theme Features:**
- Digital Rain Intensity slider (0-100%)
- Animated background effects
- Custom color schemes per theme

---

### 2. Gateway Server (FastAPI)

**Port:** 8200

**21 REST API Routers:**
- `/v1/health` - Health checks
- `/v1/chat` - Streaming chat completions
- `/v1/agents` - Agent registry and heartbeat
- `/v1/mcp/call` - MCP tool invocation
- `/v1/pty-traffic` - PTY event streaming
- `/v1/sessions` - Session management
- And 15 more...

**Features:**
- CORS enabled for desktop integration
- WebSocket support for real-time events
- Token counting and cost tracking
- Multi-provider backend selection

---

### 3. MCP Core (Model Context Protocol)

**Port:** 8100

**16 Routed Tools → 118 Actions:**

| Tool | Actions | Purpose |
|------|---------|---------|
| `k_session` | 8 | Session lifecycle management |
| `k_pty` | 11 | PTY terminal control and inter-agent communication |
| `k_files` | 12 | File system operations |
| `k_rag` | 6 | RAG search (keyword, semantic, hybrid) |
| `k_repo_intel` | 8 | Repository intelligence and analysis |
| `k_capture` | 7 | Screen capture and visual digest |
| `k_interact` | 5 | Human-in-the-loop interactions |
| `k_inbox` | 6 | Agent messaging queue |
| `k_memory` | 4 | Working memory management |
| `k_pccontrol` | 3 | Windows desktop automation |
| `k_checkpoint` | 4 | Session state persistence |
| `k_worktree` | 5 | Git worktree management |
| `k_gateway` | 8 | Gateway API client |
| `k_domain` | 4 | Domain configuration |
| `k_transcripts` | 3 | Conversation archival |
| `k_graphiti` | 6 | Knowledge graph operations |

---

### 4. PTY Daemon (Terminal Infrastructure)

**Port:** 7072
**Protocol:** JSON-RPC 2.0 over TCP

**Architecture:**
```
┌─────────────────────────────────────────────────────────────────┐
│                      PTY DAEMON                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   PTY #1    │  │   PTY #2    │  │   PTY #N    │             │
│  │  (Leader)   │  │  (Worker)   │  │  (Thinker)  │             │
│  │             │  │             │  │             │             │
│  │ 100KB buffer│  │ 100KB buffer│  │ 100KB buffer│             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│         ▲                ▲                ▲                     │
│         │                │                │                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              JSON-RPC Request Handler                    │   │
│  │  • create    • write     • read      • resize           │   │
│  │  • kill      • run       • subscribe • getBufferedData  │   │
│  └─────────────────────────────────────────────────────────┘   │
│         ▲                                                       │
│         │ TCP Socket (line-delimited JSON)                     │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Client Connections                          │   │
│  │  Desktop App | MCP Core | CLI | External Tools          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **100KB Ring Buffer** per terminal (late-join support)
- **Sentinel-based execution** for reliable command completion
- **Event subscriptions** for real-time data streaming
- **Graceful shutdown** handling

---

### 5. Kuroryuu CLI (Standalone Python REPL)

**Lines of Code:** 7,952
**Modules:** 21

**24 Slash Commands:**

| Command | Purpose |
|---------|---------|
| `/help` | Show help documentation |
| `/exit` `/quit` | Exit the CLI |
| `/status` | Show session status |
| `/clear` | Clear screen |
| `/tools` | List available MCP tools |
| `/history` | Show conversation history |
| `/plan` | Create execution plan |
| `/execute` | Execute a plan |
| `/agents` | Manage agents |
| `/ask` | Ask a question |
| `/approve` | Approve pending action |
| `/compact` | Compact context |
| `/config` | Configuration settings |
| `/context` | Manage context |
| `/cost` | Show token costs |
| `/doctor` | Diagnose issues |
| `/init` | Initialize project |
| `/memory` | Access Graphiti memory |
| `/model` | Switch models |
| `/provider` | Switch providers |
| `/permissions` | Manage permissions |
| `/mode` | Switch agent mode |
| `/review` | Code review |

**3 LLM Providers:**
- Claude API (direct)
- CLIProxyAPI (61 models across 9 providers)
- LM Studio (local models)

**Key Modules:**
- `agent_core.py` - Agent logic
- `agui_events.py` - GUI event bridge
- `anthropic_oauth.py` - OAuth flow
- `gateway_client.py` - Gateway API client
- `mcp_client.py` - MCP protocol client
- `session_manager.py` - Session persistence
- `subagent.py` - Subagent orchestration
- `repl.py` - Interactive REPL
- `providers/` - LLM backend implementations

---

### 6. Tray Companion (Voice/TTS)

**Features:**
- Text-to-Speech output
- Voice input recognition
- Clipboard monitoring
- Global hotkeys
- System tray integration
- Always-on listening mode

---

## Real-Time Inter-Agent Communication

### The Agent Mesh

Kuroryuu's most powerful capability is enabling multiple AI agents to communicate in real-time through the PTY system:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AGENT COMMUNICATION MESH                         │
│                                                                     │
│   ┌──────────┐         ┌──────────┐         ┌──────────┐           │
│   │ CLAUDE   │◀───────▶│ CLAUDE   │◀───────▶│ CLAUDE   │           │
│   │ OPUS 4.5 │         │ OPUS 4.5 │         │ OPUS 4.5 │           │
│   │ (Leader) │         │ (Worker) │         │ (Thinker)│           │
│   └────┬─────┘         └────┬─────┘         └────┬─────┘           │
│        │                    │                    │                  │
│        ▼                    ▼                    ▼                  │
│   ┌──────────┐         ┌──────────┐         ┌──────────┐           │
│   │  PTY #1  │◀───────▶│  PTY #2  │◀───────▶│  PTY #3  │           │
│   │ terminal │  READ   │ terminal │  READ   │ terminal │           │
│   │          │  WRITE  │          │  WRITE  │          │           │
│   └──────────┘         └──────────┘         └──────────┘           │
│                                                                     │
│   CAPABILITIES:                                                     │
│   • term_read: Read any agent's terminal output                    │
│   • send_line_to_agent: Write to any agent's terminal              │
│   • resolve: Find any agent's PTY by ID/name/label                 │
│   • Delta mode: Watch changes in real-time                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Communication Primitives

| Action | Purpose | Example |
|--------|---------|---------|
| `k_pty(action="term_read")` | Read another agent's terminal | Watch worker's progress |
| `k_pty(action="send_line_to_agent")` | Write to another agent's terminal | Send instructions |
| `k_pty(action="resolve")` | Find agent's PTY by identity | Dynamic routing |
| `mode="delta"` | Incremental updates only | Real-time observation |

### Example: Collaborative Problem Solving

```python
# LEADER observes WORKER
leader_reads = k_pty(
    action="term_read",
    session_id=worker_pty_id,
    mode="delta"
)

# LEADER sends guidance
k_pty(
    action="send_line_to_agent",
    agent_id="worker_1",
    data="Consider using async/await for the API calls"
)

# THINKER monitors both and provides meta-analysis
thinker_observes_leader = k_pty(action="term_read", session_id=leader_pty)
thinker_observes_worker = k_pty(action="term_read", session_id=worker_pty)

# THINKER intervenes with higher-level insight
k_pty(
    action="send_line_to_agent",
    agent_id="leader",
    data="Pattern detected: both approaches have race condition risk"
)
```

---

## k_pty Tool - Complete Reference

### 11 Actions

| Action | Purpose | Access |
|--------|---------|--------|
| `help` | Show documentation | All agents |
| `list` | List all PTY sessions | All agents |
| `create` | Spawn new PTY process | All agents |
| `send_line` | Type text + press Enter | All agents |
| `read` | Read PTY output buffer | All agents |
| `talk` / `run` | Execute command with sentinel | All agents |
| `term_read` | Read xterm.js buffer (viewport/tail/delta) | All agents |
| `resize` | Change terminal dimensions | Local only |
| `resolve` | Find PTY by agent_id/label/session_id | All agents |
| `send_line_to_agent` | Route message to specific agent's PTY | All agents |

### Sentinel-Based Execution

```
Command: npm install express
Wrapped: npm install express; echo __KURORYUU_DONE_<uuid>__\r\n
Result:  Captures all output until sentinel appears
```

### Buffer Access Modes

| Mode | Purpose |
|------|---------|
| `tail` | Last N lines (default) |
| `viewport` | Currently visible window |
| `delta` | New content since last marker |

### Safety Features

**Dangerous Command Blocking:**
- `rm -rf /`, `format`, `diskpart`
- Fork bombs, `shutdown`, `halt`
- Credential access (`mimikatz`, SSH keys)
- Download & execute (`curl | bash`)
- Reverse shells (`nc -e`, `bash -i >&`)
- Registry manipulation (`reg delete`)

**Secret Redaction:**
- API keys (sk-*, ghp_*, Bearer *)
- Export statements
- Known credential patterns

---

## Persistence System

### Checkpoints

**Location:** `ai/checkpoints/`

**What's Saved:**
- Session state
- Terminal configurations
- Agent bindings
- Worklog references
- Task links

### PTY Persistence

**Location:** `ai/checkpoints/pty/renderer/`

```typescript
{
  id: string,              // "term-leader_claude-cli_..."
  title: string,           // "Leader"
  ptyId: string,           // Process ID
  claudeMode: boolean,     // Claude CLI mode
  linkedAgentId: string,   // Bound agent
  agentConfig: {...},      // Full configuration
  viewMode: 'terminal',
  createdAt: number,
  lastActiveAt: number
}
```

**Features:**
- Atomic writes (temp file + rename)
- Debounced saves (1s)
- 7-day TTL cleanup
- Session resurrection on restart
- Buffer persistence (100KB per terminal)

---

## Agent Orchestration

### Ralph Orchestrator

**Capability:** 100+ hour autonomous task execution

**Features:**
- 3-strike escalation system
- Automatic recovery from failures
- Progress tracking and reporting
- Human intervention requests

**Bootstrap Files:**
- `@ralph_prime.md` - Initial context
- `@ralph_loop.md` - Execution loop
- `@ralph_intervention.md` - Escalation handling

### Leader/Worker Pattern

**Leader:**
- Coordinates overall task execution
- Delegates to workers
- Monitors progress
- Makes architectural decisions

**Worker:**
- Executes specific subtasks
- Reports progress to leader
- Operates in isolated context
- Can be parallelized

### Thinker Debates

**Purpose:** Multi-agent reasoning for complex decisions

**Flow:**
1. Present problem to multiple thinkers
2. Each thinker provides independent analysis
3. Thinkers can read each other's reasoning
4. Consensus or leader decides

---

## Integrations

### LLM Providers (via CLIProxyAPI)

**61 Models across 9 Providers:**

| Provider | Models |
|----------|--------|
| Anthropic | Claude Opus 4.5, Sonnet 4.5, Sonnet 4, Haiku 4.5 |
| OpenAI | GPT-4o, GPT-4, O1, O3 variants |
| Google | Gemini Pro, Gemini Ultra |
| Mistral | Mistral Large, Devstral |
| And 5 more providers... |

### External Services

| Integration | Purpose |
|-------------|---------|
| **GitHub** | OAuth, repositories, worktrees |
| **Linear** | Issue tracking, project management |
| **Graphiti** | Knowledge graph, memory storage |
| **Neo4j** | Graph database backend |
| **LM Studio** | Local model inference |

### IDE Bootstrap Files

Kuroryuu provides bootstrap files for 7 IDEs:

1. **Kiro** - `@KURORYUU_BOOTSTRAP.md`
2. **Cursor** - Cursor-specific bootstrap
3. **GitHub Copilot** - Copilot integration
4. **Cline** - Cline bootstrap
5. **Windsurf** - Windsurf configuration
6. **Codex** - OpenAI Codex support
7. **Claude Code** - Native integration

---

## Monitoring & Visualization

### PTY Traffic Monitor

**Visualization:** ReactFlow network graph

```
[Agent Nodes] ──────▶ [MCP Core Hub] ──────▶ [PTY Sessions]
     │                      │                      │
  Events                 Routing               Activity
  Errors                 Stats                 Buffers
  Latency                                      Status
```

**4 Themes:**
- **Cyberpunk** - Neon cyan/purple with glow
- **Kuroryuu** - Gold/dragon aesthetic
- **Retro CRT** - Phosphor green with scanlines
- **Modern** - Clean, minimal

**Metrics:**
- Events per agent/session
- Error counts
- Blocked commands
- Average latency
- Real-time flow animation

### HTTP Traffic Monitor

- Request/response logging
- Token counting
- Cost tracking
- Latency measurements
- Provider breakdown

### Claude Tasks Monitor

- Donut chart for task status
- Gantt timeline visualization
- Real-time file watching
- Evidence chain linking

---

## Screen Capture System

### k_capture Tool

**Actions:**
- `start` - Begin recording
- `stop` - End recording
- `screenshot` - Single frame capture
- `poll` - Check status
- `get_latest` - Retrieve latest image
- `digest` - AI visual analysis

### Visual Digest

**Purpose:** Periodic AI analysis of screen content

**Flow:**
1. Capture screen every N seconds
2. Save to `latest.jpg`
3. Agents can query for visual context
4. AI describes what's on screen

**Use Cases:**
- Monitor application state
- Verify UI changes
- Debug visual issues
- Provide context to agents

---

## File Structure

```
Kuroryuu/
├── apps/
│   ├── desktop/           # Electron + React application
│   │   ├── src/
│   │   │   ├── main/      # Electron main process
│   │   │   ├── preload/   # IPC bridge
│   │   │   └── renderer/  # React UI (235 components)
│   │   └── build/         # Build artifacts
│   │
│   ├── gateway/           # FastAPI server (21 routers)
│   │   ├── server.py
│   │   └── routers/
│   │
│   ├── mcp_core/          # MCP tools (16 tools, 118 actions)
│   │   ├── tools_*.py
│   │   └── run.ps1
│   │
│   ├── pty_daemon/        # Node.js PTY server
│   │   ├── src/
│   │   └── Dockerfile
│   │
│   ├── kuroryuu_cli/      # Python CLI (7,952 LOC)
│   │   ├── cli.py
│   │   ├── commands.py
│   │   ├── repl.py
│   │   └── providers/
│   │
│   └── tray_companion/    # Electron tray app
│
├── ai/
│   ├── checkpoints/       # Session persistence
│   ├── todo.md            # Task tracking
│   ├── sessions.json      # Session registry
│   ├── hooks.json         # Hook configuration
│   ├── prompts/           # Prompt templates
│   ├── formulas/          # Workflow definitions (TOML)
│   └── config/            # Domain configuration
│
├── Docs/
│   ├── DEVLOG.md          # Development history
│   ├── worklogs/          # 175+ session worklogs
│   ├── Plans/             # Implementation plans
│   └── Architecture/      # Architecture docs
│
├── ffmpeg/                # Screen capture binaries
│   └── win64/bin/
│
├── CLAUDE.md              # Claude Code instructions
├── KURORYUU_BOOTSTRAP.md  # Bootstrap documentation
├── KURORYUU_LAWS.md       # Operational rules
└── setup-project.ps1      # Project setup script
```

---

## Summary

Kuroryuu is not just a tool—it's a platform for collective AI intelligence. By enabling multiple Claude Opus 4.5 instances to:

- **Run simultaneously** in parallel
- **Read each other's terminals** in real-time
- **Write to each other's sessions** for coordination
- **Form a mesh network** of communicating agents
- **Persist state** across sessions and restarts
- **Operate autonomously** for 100+ hours

...Kuroryuu represents a paradigm shift from sequential agent pipelines to true multi-agent collaboration.

**Key Differentiators:**
- 61 models across 9 providers
- Native desktop application
- Real-time inter-agent communication
- 100+ hour autonomous orchestration
- Production-grade persistence
- Animated Matrix rain themes
- 7,952 LOC standalone CLI
- 16 MCP tools with 118 actions

---

*Built with obsessive attention to detail over 25 days, 437 sessions, and 431 completed tasks.*

**黒き幻影の霧の龍** — The Black Dragon rises.
