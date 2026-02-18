# Kuroryuu Technical Overview

> **黒き幻影の霧の龍** — The Black Dragon of Phantom Mist
>
> A production-grade multi-agent AI orchestration platform.
> Built during the Dynamous x Kiro Hackathon + continued development (Jan 5 - Feb 17, 2026).

---

## Development Metrics (Updated 2026-02-17)

| Metric | Value |
|--------|-------|
| **Total Lines of Code** | 277,712 across 2,320 files |
| **Development Period** | 44 days (Jan 5 - Feb 17, 2026) |
| **Total Sessions** | 437+ |
| **Tasks Tracked** | 431+ (T001-T111 documented) |
| **MCP Tools** | 25 (routing to 135 actions) |
| **Desktop Components** | 170+ TSX files |
| **Desktop Stores** | 50 Zustand stores |
| **Desktop Hooks** | 21 custom React hooks |
| **Desktop Views** | 21 routes + 3 windows |
| **Gateway Routers** | 25 REST routers |
| **Gateway LOC** | 46,494 (187 Python files) |
| **Desktop LOC** | 88,508 (717 TS/TSX files) |
| **MCP Core LOC** | 20,807 (42 Python files) |
| **CLI LOC** | 9,646 (21 Python files) |
| **AI Harness LOC** | 56,035 (prompts, hooks, identity, config) |
| **LLM Providers** | 4 backends (Claude, LM Studio, Devstral, CLIProxy) |
| **Prompt Templates** | 62+ files (leader, worker, thinker, specialist, workflow) |
| **Thinker Personas** | 13 debate personalities |
| **Specialist Agents** | 4 auto-trigger roles |
| **Implementation Plans** | 130+ (active + archived) |
| **Case Studies** | 13 deep dives |
| **Worklogs** | 175+ session logs |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           KURORYUU PLATFORM                                 │
│                        277,712 LOC | 2,320 files                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  DESKTOP (Electron)  │  │  WEB UI  │  │   TRAY   │  │  GenSwap UI   │  │
│  │  88,508 LOC          │  │  2,947   │  │  5,250   │  │  7,417 LOC    │  │
│  │  170+ components     │  │  LOC     │  │  LOC     │  │  Gallery/     │  │
│  │  50 Zustand stores   │  │  Next.js │  │  TTS/HK  │  │  Face Swap    │  │
│  │  21 custom hooks     │  │  :3000   │  │          │  │               │  │
│  └──────────┬───────────┘  └────┬─────┘  └────┬─────┘  └───────────────┘  │
│             │                   │              │                            │
│             └───────────────────┼──────────────┘                            │
│                                 │                                           │
│                    ┌────────────▼────────────┐                              │
│                    │        GATEWAY          │                              │
│                    │     FastAPI :8200       │                              │
│                    │     46,494 LOC          │                              │
│                    │     25 routers          │                              │
│                    │     187 Python files    │                              │
│                    └────────────┬────────────┘                              │
│                                 │                                           │
│              ┌──────────────────┼──────────────────┐                        │
│              │                  │                   │                        │
│       ┌──────▼──────┐  ┌───────▼───────┐  ┌───────▼───────┐               │
│       │  MCP CORE   │  │  LLM BACKENDS │  │  PTY DAEMON   │               │
│       │  :8100      │  │  Claude API   │  │  node-pty     │               │
│       │  20,807 LOC │  │  LM Studio    │  │  1,423 LOC    │               │
│       │  25 tools   │  │  Devstral     │  │  :8201 bridge │               │
│       │  135 actions│  │  CLIProxy     │  │  ring buffer  │               │
│       └─────────────┘  └───────────────┘  └───────────────┘               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    AI HARNESS (56,035 LOC)                          │   │
│  │  ai/todo.md (SoT) | checkpoints/ | inbox/ | prompts/ (62+ files) │   │
│  │  identity/ (Ash)  | collective/ | formulas/ | sessions.json       │   │
│  │  hooks.json | task-meta.json sidecar | repo_intel/                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────┐  ┌────────────────┐  ┌──────────────────────────┐   │
│  │  KURORYUU CLI v1 │  │   GOVERNANCE   │  │  DOCUMENTATION           │   │
│  │  9,646 LOC       │  │   LAWS.md      │  │  130+ Plans              │   │
│  │  3 LLM providers │  │   LEADER.md    │  │  18 Guides               │   │
│  │  24 commands      │  │   WORKER.md    │  │  13 Case Studies         │   │
│  │  Subagent spawn   │  │   AGENTS.md    │  │  5 Architecture Specs    │   │
│  └──────────────────┘  └────────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## LOC Breakdown by Component

| Component | Files | Lines of Code | % of Total |
|-----------|-------|---------------|------------|
| Desktop (Electron) | 717 | 88,508 | 31.9% |
| AI Harness (ai/) | 559 | 56,035 | 20.2% |
| Gateway (FastAPI) | 187 | 46,491 | 16.7% |
| Claude Config (.claude/) | 220 | 28,598 | 10.3% |
| MCP Core | 42 | 20,807 | 7.5% |
| CLI v1 (Python) | 21 | 9,646 | 3.5% |
| GenSwap UI | 40 | 7,417 | 2.7% |
| Docs | 467 | 6,388 | 2.3% |
| Tray Companion | 18 | 5,250 | 1.9% |
| Root governance (.md) | 7 | 3,213 | 1.2% |
| Web UI | 26 | 2,947 | 1.1% |
| PTY Daemon | 4 | 1,423 | 0.5% |
| Scripts | 10 | 874 | 0.3% |
| CI/CD | 2 | 115 | <0.1% |
| **TOTAL** | **2,320** | **277,712** | **100%** |

---

## Core Systems

### 1. Desktop Application (Electron + React)

**Path:** `apps/desktop/`
**LOC:** 88,508 across 717 files
**Stack:** Electron 36 + React 19 + Vite + TypeScript 5.8 + Zustand 5 + Tailwind

See: [Docs/Architecture/DESKTOP_ARCHITECTURE.md](Architecture/DESKTOP_ARCHITECTURE.md)

**Main Process (~3,500 LOC in index.ts):**
- Window management (main, code editor, GenUI — 3 windows)
- PTY system (daemon mode + embedded fallback)
- File watching (chokidar for Claude Teams)
- 13 IPC handler domains, 12 core services
- TTS/Voice/Capture feature modules
- OAuth (Anthropic, GitHub, OpenAI)
- Auto-update via electron-updater

**Renderer (170+ components, 50 stores, 21 hooks):**
- 21 routes organized in 4 sidebar groups (Plan, Build, Monitor, Chronicles)
- Multi-backend LLM support (LMStudio, Claude, CLIProxy, Claude-CLI-PTY)
- Graduated context management (warn 80%, compact 85%, emergency 95%)

**Key Feature Panels:**

| Feature | Sidebar | Components | Description |
|---------|---------|-----------|-------------|
| Claude Teams | `A` | 8 panels | File-watcher-based team monitoring, graph viz, archive replay |
| Code Editor | `V` | 18 sub-panels | CodeMirror 6, diff viewer, symbol outline, git integration |
| PRD Workflow | `P` | 7 components | PRD CRUD, workflow graph (ReactFlow), session management |
| GenUI | `G` | Standalone window | Zone-based dashboard generation, 51 A2UI components |
| Kuroryuu Agents | `U` | CLI agents panel | Spawn Codex/Kiro/Aider/custom via unified terminal API |
| Command Center | `K` | Tool executor | MCP tool execution with parameter forms |
| Observability | `O` | SwimLanes/Pulse | Hook event visualization, WebSocket streaming |
| Terminal/PTY | `T`/`Y` | Traffic viz | PTY event flow, agent routing visualization |
| Checkpoints | `Q` | Browser + detail | Session snapshot management |
| Graphiti | `R` | ReactFlow canvas | KPI cards, sparklines, agent orchestration graph |
| Capture | `P` | Recording UI | FFmpeg screen/video capture |
| Memory | — | Visualizer | Claude Memory (IPC bridge to ~/.claude/projects/) |
| Backup | — | 3 panels | Restic backup (now, restore, settings) |
| Marketing | `B` | SSE panel | Research engine, web scraper, asset generation |

**10 Themes:** oscura-midnight, dusk, lime, ocean, retro, neo, forest, matrix (with digital rain), grunge, kuroryuu

---

### 2. Gateway Server (FastAPI)

**Path:** `apps/gateway/`
**LOC:** 46,491 across 187 files
**Port:** 8200

See: [Docs/Architecture/GATEWAY_ARCHITECTURE.md](Architecture/GATEWAY_ARCHITECTURE.md)

**25 Routers:**

| Category | Routers | Key Endpoints |
|----------|---------|---------------|
| Chat/LLM | chat_proxy, websocket | `POST /v2/chat/stream` (SSE), `WS /ws` |
| GenUI | genui | `POST /v1/genui/generate` (SSE), `/analyze`, `/components`, `/layouts` |
| Agents | agents, agents_messaging | `/v1/agents/register`, `/heartbeat`, `/list`, `/leader` |
| Orchestration | orchestration | `/v1/orchestration/cancel`, `/finalize`, `/formulas/*`, `/batch` |
| Tasks | tasks | `/v1/tasks/list`, `/{id}`, `/{id}/meta` |
| Inbox | inbox | `/v1/inbox/send`, `/{agent_id}`, `/ack` |
| PRD | prd | `/v1/prd/generate`, `/list`, `/{id}` |
| Observability | observability | `/v1/observability/events`, `WS /ws/observability` |
| Traffic | traffic, pty_traffic | `/v1/traffic/events`, `WS /ws/traffic`, `WS /ws/pty-traffic` |
| Security | security | `/v1/security/status`, `/check`, `/intel` |
| System | system | `/v1/system/stats`, `/health` |
| Git | commands, worktrees, github, changelog | `/v1/commands/commit`, `/pr`; worktrees; PRs |
| Other | auth, sessions, artifacts, rules, subagent, chat_history, linear, repo_intel, marketing, llm_apps, context | Various CRUD + integrations |

**Key Subsystems:**

- **Unified Tool Loop** (`agent/tool_loop.py`, 435 LOC) — Provider-agnostic LLM streaming with XML/JSON tool call parsing, error recovery (3-strike), max tool call enforcement
- **Leader Orchestrator** (`orchestration/leader.py`, 711 LOC) — Task creation, breakdown with complexity budgets, hint injection, collective intelligence recording
- **Worker Orchestrator** (`orchestration/worker.py`, 597 LOC) — Poll/claim/execute loop, Ralph Wiggum iteration tracking, graduated escalation
- **Formula Engine** (`orchestration/formulas.py`, 686 LOC) — TOML-based multi-step workflows with topological sort and variable interpolation
- **GenUI Pipeline** (`genui/`, 8 files) — Content analysis → layout selection (7 types) → component generation (59 A2UI types) → SSE streaming
- **Hook System** (`hooks/`, role-gated) — Event hooks with leader/worker access control (mutating effects blocked for workers)
- **MCP Client** (`mcp/client.py`, 223 LOC) — JSON-RPC 2.0 to MCP Core, 30s tool cache, configurable timeouts

**LLM Backends:** Claude (native), LM Studio (OpenAI-compat), Devstral, CLIProxyAPI (multi-provider proxy)

---

### 3. MCP Core (Model Context Protocol Server)

**Path:** `apps/mcp_core/`
**LOC:** 20,807 across 42 files
**Port:** 8100

See: [Docs/Architecture/MCP_CORE_ARCHITECTURE.md](Architecture/MCP_CORE_ARCHITECTURE.md)

**25 Tools, 135 Actions:**

| Tool | Actions | LOC | Purpose |
|------|---------|-----|---------|
| **k_rag** | 13 | 1,650 | Multi-strategy search: keyword (BM25), semantic (MiniLM embeddings), hybrid, reranked, reflective, agentic, interactive |
| **k_pty** | 11 | 1,700 | Terminal control: create, write, read, talk, resolve, send_line_to_agent. Local + Desktop bridge routing |
| **k_backup** | 13 | 650 | Restic wrapper: init, backup, restore, diff, check, forget, prune, retention policy |
| **k_inbox** | 8 | 1,000 | Maildir queue: send, list, read, claim, complete, stats. JSON indexing by agent/thread |
| **k_msg** | 8 | — | Simplified messaging (wraps k_inbox with auto-identity) |
| **k_capture** | 9 | — | Screen: screenshot, recording, storyboard, multi-monitor (FFmpeg) |
| **k_pccontrol** | 8 | — | Win32 automation (OPT-IN): click, type, keypress, launch. PowerShell backend |
| **k_session** | 7 | — | Lifecycle: start, end, log, pre/post_tool, context |
| **k_memory** | 7 | — | Working memory: goal, blockers, steps, history |
| **k_graphiti_migrate** | 6 | — | Knowledge graph migration |
| **k_collective** | 6 | — | Pattern learning: record success/failure, query patterns, skill matrix |
| **k_process** | 6 | — | Background session monitor: list, poll, log, write, kill |
| **k_repo_intel** | 5 | — | Reports: symbol_map, routes, hooks, deps, todos, components, module_graph |
| **k_files** | 5 | — | Sandboxed file ops: read, write, edit, list |
| **k_checkpoint** | 5 | 700 | Persistence: save, append, list, load. Deep merge, worklog generation, sidecar |
| **k_thinker_channel** | 3 | — | Debate system: send_line, read, list (thinker PTY I/O) |
| **k_tts** | 2 | 300 | Voice: speak (Edge TTS), smart (AI-summarized). Queue lock prevents overlap |
| **k_MCPTOOLSEARCH** | 2 | — | Natural language tool discovery with scoring |
| **k_bash** | 1 | 600 | Shell exec: foreground, PTY, background. Heartbeat emission, secret redaction |
| **k_askuserquestion** | 1 | — | Human-in-the-loop decision points |

**RAG Search Strategies:**
1. Keyword — BM25 + ripgrep (fastest, always available)
2. Semantic — all-MiniLM-L6-v2 embeddings (384 dims)
3. Hybrid — BM25 + vector, weighted combination
4. Reranked — Hybrid + cross-encoder (ms-marco-MiniLM-L-6-v2)
5. Multi-query — LLM-generated query variations with dedup
6. Reflective — Self-correcting loop (query → evaluate → refine)
7. Agentic — Auto-selects best strategy per query
8. Interactive — Human-in-the-loop result filtering

**Security:** 23 blocked command patterns, 6 secret redaction patterns, constant-time secret comparison

---

### 4. AI Harness & Governance System

**Path:** `ai/` + root governance files
**LOC:** 56,035 (ai/) + 3,213 (root .md files)

See: [Docs/Architecture/AI_HARNESS_ARCHITECTURE.md](Architecture/AI_HARNESS_ARCHITECTURE.md)

**Governance Hierarchy:**
```
KURORYUU_LAWS.md (450 lines — CANONICAL, wins all conflicts)
  └── KURORYUU_BOOTSTRAP.md (487 lines — quick start)
       ├── KURORYUU_LEADER.md (1,240 lines — 6-phase workflow)
       └── KURORYUU_WORKER.md (717 lines — 4-phase loop)
```

**Leader 6 Phases:** PRIME → PLAN FEATURE → BREAKDOWN → MONITOR → NUDGE → FINALIZE

**Worker 4 Phases:** RECEIVE → CLAIM → EXECUTE → REPORT (with promise protocol: DONE|PROGRESS|BLOCKED|STUCK)

**Prompt System (62+ files):**
- Leader suite: 12 prompts (prime, plan, breakdown, monitor, nudge, finalize, escalate, thinker orchestration)
- Worker suite: 4 prompts (loop, iterate, v1/v2 variants)
- Thinker personas: 13 (visionary, skeptic, red_team, blue_team, first_principles, systems_thinker, user_advocate, pragmatist, devils_advocate, synthesizer, + templates)
- Specialists: 4 auto-trigger (security_auditor, performance_optimizer, test_generator, doc_writer)
- PRD workflow: 12 (primer, generator, executor, reviewer, validator, code_reviewer, reporter, hackathon_finalizer)

**Collective Intelligence:**
- `ai/collective/patterns.jsonl` — Append-only success/failure patterns
- `ai/collective/skill_matrix.json` — Per-agent skill scores (0.0-1.0)
- Workers record discoveries inline; leaders record at finalization (REQUIRED)

**Identity System (Ash):**
- `ai/identity/soul.md` — "I am Ash, Ryan's colleague and thinking partner"
- `ai/identity/user.md` — Ryan's profile (self-taught, visual thinker, father)
- `ai/identity/heartbeat.md` — Standing sweep instructions
- `ai/identity/memory.md` + daily files — Long-term + daily context

**Task Management:**
- `ai/todo.md` — THE source of truth (T001-T111+)
- PostToolUse hook auto-assigns T### IDs with timestamps
- `ai/task-meta.json` — Sidecar for description, priority, worklog, checkpoint links
- Session-local #N IDs ≠ Todo T### IDs (CRITICAL distinction)

---

### 5. Kuroryuu CLI v1

**Path:** `apps/kuroryuu_cli/`
**LOC:** 9,646 across 21 files
**Entry:** `python -m apps.kuroryuu_cli`

**Core Modules:**
- `agent_core.py` (1,497 LOC) — LLM interaction, tool orchestration, auto-compaction at 75% context
- `commands.py` (1,504 LOC) — 24 slash commands (/plan, /execute, /provider, /model, /compact, /doctor, etc.)
- `repl.py` (855 LOC) — Interactive REPL with prompt_toolkit, auto-suggestions, ESC cancellation
- `mcp_client.py` (554 LOC) — Routed tool validation, local tools (ask_user, spawn_subagent)
- `subagent.py` (682 LOC) — Explorer + planner subagent types, parallel spawning (up to 5)

**3 LLM Providers:** Claude (API + OAuth), LM Studio (OpenAI-compat), CLIProxyAPI (multi-provider proxy)

**Operation Modes:** normal (full tools), plan (dry-run), read (read-only)
**Conversation Modes:** stateful (full history), stateless (fresh each turn)

---

### 6. Auxiliary Systems

| System | Path | LOC | Purpose |
|--------|------|-----|---------|
| **Web UI** | `apps/web/` | 2,947 | React 19 + Vite chat interface with voice I/O |
| **Tray Companion** | `apps/tray_companion/` | 5,250 | Background TTS (Edge TTS + ElevenLabs), hotkeys, clipboard |
| **PTY Daemon** | `apps/pty_daemon/` | 1,423 | Terminal process manager, 100KB ring buffer, sentinel detection |
| **GenSwap UI** | `apps/gen_swap_UI/` | 7,417 | Image browser + face swap gallery, screensaver mode |
| **CLI v2** | `apps/kuroryuu_cli_v2/` | — | TypeScript/Ink reference fork (not active, v1 is canonical) |

---

## Data Flow Architecture

```
USER INPUT
    │
    ▼
┌──────────────┐     ┌──────────────┐
│ Desktop/Web  │────►│   Gateway    │
│ (Electron)   │ IPC │  (FastAPI)   │
│              │◄────│              │
└──────────────┘ SSE └──────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────▼─────┐ ┌────▼────┐ ┌──────▼──────┐
        │ MCP Core  │ │ LLM API │ │ Observability│
        │ (25 tools)│ │(Claude/ │ │ (SQLite +    │
        │           │ │LMStudio)│ │  WebSocket)  │
        └─────┬─────┘ └─────────┘ └─────────────┘
              │
    ┌─────────┼─────────────┐
    │         │             │
┌───▼───┐ ┌──▼──┐ ┌───────▼──┐
│k_rag  │ │k_pty│ │k_inbox   │ ... (25 tools)
│search │ │ PTY │ │messaging │
└───────┘ └─────┘ └──────────┘
    │         │         │
    ▼         ▼         ▼
┌─────────────────────────────┐
│     AI HARNESS (ai/)        │
│  todo.md  │ checkpoints/    │
│  inbox/   │ collective/     │
│  identity/│ sessions.json   │
└─────────────────────────────┘
```

---

## Inter-Agent Communication

### The Agent Mesh

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AGENT COMMUNICATION MESH                         │
│                                                                     │
│   ┌──────────┐         ┌──────────┐         ┌──────────┐           │
│   │  LEADER  │◀───────▶│  WORKER  │◀───────▶│  THINKER │           │
│   │          │         │          │         │          │           │
│   └────┬─────┘         └────┬─────┘         └────┬─────┘           │
│        │                    │                    │                  │
│        ▼                    ▼                    ▼                  │
│   ┌──────────┐         ┌──────────┐         ┌──────────┐           │
│   │  PTY #1  │◀───────▶│  PTY #2  │◀───────▶│  PTY #3  │           │
│   │ terminal │  READ   │ terminal │  READ   │ terminal │           │
│   │          │  WRITE  │          │  WRITE  │          │           │
│   └──────────┘         └──────────┘         └──────────┘           │
│                                                                     │
│   Communication Channels:                                           │
│   • k_pty (PRIMARY) — Direct terminal read/write, <100ms latency   │
│   • k_inbox/k_msg (FALLBACK) — Maildir queue, async delivery       │
│   • k_thinker_channel — Thinker-to-thinker debate I/O              │
│   • k_capture — Visual monitoring via screenshots                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Communication Primitives

| Action | Purpose | Example |
|--------|---------|---------|
| `k_pty(action="term_read")` | Read another agent's terminal | Watch worker's progress |
| `k_pty(action="send_line_to_agent")` | Write to another agent's terminal | Send instructions |
| `k_pty(action="resolve")` | Find agent's PTY by identity | Dynamic routing |
| `k_inbox(action="send")` | Queue message for agent | Task assignment |
| `k_msg(action="send")` | Simplified messaging | Quick DM |
| `mode="delta"` | Incremental terminal updates only | Efficient polling |

---

## Persistence & Cross-Referencing

### State Files

| File | Purpose | Updated By |
|------|---------|-----------|
| `ai/todo.md` | **SOURCE OF TRUTH** for all tasks | PostToolUse hook (T### IDs + timestamps) |
| `ai/task-meta.json` | Sidecar: description, priority, worklog, checkpoint | Hook + Gateway PUT |
| `ai/sessions.json` | Active session registry | k_session |
| `ai/hooks.json` | Hook configuration (4 todo_sot_enforcer hooks) | System |
| `ai/checkpoints/` | Agent state snapshots | k_checkpoint |
| `ai/collective/patterns.jsonl` | Success/failure patterns | k_collective |
| `ai/collective/skill_matrix.json` | Agent skill scores | k_collective |
| `Docs/DEVLOG.md` | Development history | Leaders + Workers |
| `Docs/worklogs/` | Session worklogs | Per-session |
| `Docs/Plans/` | Implementation plans | Leaders |

### Cross-Reference Chain

Every artifact is bidirectionally linked:

```
Checkpoint ←→ Worklog ←→ Plan ←→ Task(s)

Checkpoint data includes:  { plan_file, worklog_files, task_ids }
Worklog header includes:   Checkpoint: cp_xxx, Plan: path, Tasks: T001, T002
Task format includes:      [checkpoint: cp_...] [worklog: path]
```

---

## Security Model

### Defense Layers

1. **Command Security** — 23 blocked patterns (rm -rf, format, mimikatz, SAM, reverse shells, etc.)
2. **Secret Redaction** — 6 regex patterns strip API keys, tokens, Bearer headers from output
3. **Desktop Secret** — 64-char hex for role management (constant-time comparison)
4. **Origin Validation** — CSRF middleware blocks foreign origins
5. **Role-Gated Hooks** — Workers cannot execute mutating hooks (fail-closed)
6. **PTY Safety** — Dangerous command blocking before shell execution
7. **Auth** — Session cookies + SHA256 password hash for web UI; GitHub OAuth for API
8. **Lockdown Mode** — Emergency mode rejects all non-localhost connections

---

## CI/CD Pipeline

**File:** `.github/workflows/ci.yml`

| Job | Platform | Tool | Purpose |
|-----|----------|------|---------|
| lint | Windows | ESLint (max-warnings=0) | Code style |
| typecheck | Windows | TypeScript --noEmit | Type safety |
| test-desktop | Windows | Vitest (3 test files, 1,218 LOC) | Unit tests |
| test-gateway | Ubuntu | Pytest (4 test files, 441 LOC) | API tests |
| build | Windows | electron-builder | NSIS installer |

**Release:** `release.yml` — Automated GitHub releases with electron-builder

---

## Stack Management

**HARD RULE:** Always use scripts for service lifecycle.

| Action | Script |
|--------|--------|
| Start all | `.\run_all.ps1` |
| Stop all | `.\kill_all.ps1` |

**Service Ports:**
- 1234 — LM Studio
- 3000 — Web UI
- 7072 — PTY Daemon
- 8100 — MCP Core
- 8200 — Gateway
- 8201 — PTY HTTP Bridge
- 8317 — CLIProxyAPI

---

## Key Design Decisions (Locked)

1. **Sidebar navigation** — "Claude Teams" (file watcher) + "Kuroryuu Agents" (Gateway polling) coexist
2. **Hybrid data** — CLI fire-and-forget + file watcher for monitoring
3. **ReactFlow** — 3 graph views (Hub+Spokes, Hierarchy, Timeline)
4. **Terminal PTY system** — Separate and untouched (canonical TerminalGrid.tsx pattern)
5. **CLI Agents tab** — External CLIs (Codex/Copilot/Kiro/Aider) via shared `useSpawnTerminalAgent` hook
6. **Imperial theme** — Toggleable per-feature via CSS variables (`--g-*`)
7. **Zustand stores** — File-based persistence (not localStorage)
8. **IPC bridge pattern** — Main process service → IPC handlers → renderer store
9. **Collective intelligence** — Patterns.jsonl records successes/failures for future guidance
10. **PRD-first workflow** — PRD is the north star; created once, never regenerated

---

## Deep Dive Documentation

For detailed architecture documentation per system, see:

- [Desktop Architecture](Architecture/DESKTOP_ARCHITECTURE.md) — Main process, renderer, stores, hooks, IPC channels
- [Gateway Architecture](Architecture/GATEWAY_ARCHITECTURE.md) — Routers, tool loop, orchestration, GenUI, hooks
- [MCP Core Architecture](Architecture/MCP_CORE_ARCHITECTURE.md) — 25 tools, protocol, RAG, PTY, security
- [AI Harness Architecture](Architecture/AI_HARNESS_ARCHITECTURE.md) — Governance, prompts, identity, collective intelligence

---

*Built over 44 days, 437+ sessions, and 431+ tasks. 277,712 lines of code across 2,320 files.*

**黒き幻影の霧の龍** — The Black Dragon rises.
