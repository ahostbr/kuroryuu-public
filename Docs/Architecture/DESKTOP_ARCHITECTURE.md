# Kuroryuu Desktop Architecture

> **Version:** 1.0.0
> **Last Updated:** 2026-02-17
> **Status:** Canonical Reference
> **Scope:** apps/desktop/ — Electron application architecture

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [Directory Structure](#3-directory-structure)
4. [Main Process Architecture](#4-main-process-architecture)
5. [PTY System](#5-pty-system)
6. [IPC Architecture](#6-ipc-architecture)
7. [Service Layer](#7-service-layer)
8. [Renderer Architecture](#8-renderer-architecture)
9. [Zustand Store Catalog](#9-zustand-store-catalog)
10. [Custom Hook Catalog](#10-custom-hook-catalog)
11. [Window Management](#11-window-management)
12. [Build and Packaging](#12-build-and-packaging)
13. [Data Flow Diagrams](#13-data-flow-diagrams)
14. [Key Design Patterns](#14-key-design-patterns)

---

## 1. Overview

The Kuroryuu desktop application is a multi-window Electron application serving as the primary interface for AI agent orchestration, team management, terminal PTY sessions, and observability. It bridges the Kuroryuu Gateway (FastAPI, port 8200), Claude Code's native file structures, and the user's local environment.

**Scale:**
- 88,508 lines of code across 717 files
- 50 Zustand stores
- 21 custom hooks
- 13 IPC handler domains
- 12 core services
- 21 application routes across 4 sidebar groups

The application follows a strict main/renderer process separation enforced by Electron's security model. All Node.js APIs, file system operations, and network connections to privileged ports are handled exclusively in the main process or preload script. The renderer communicates exclusively via IPC.

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Shell | Electron | 36 | Native app container, Node.js bridge |
| UI Framework | React | 19 | Component tree, concurrent rendering |
| Bundler | Vite | latest | Fast HMR, tree-shaking |
| Language | TypeScript | 5.8 | Type safety across main and renderer |
| State Management | Zustand | 5 | 50 stores, minimal boilerplate |
| Styling | Tailwind CSS | latest | Utility-first, 10 theme variants |
| Code Editing | CodeMirror 6 | latest | Syntax highlighting, Monaco alternative |
| Graph Visualization | ReactFlow | latest | Agent topology, 3 layout modes |
| PTY | node-pty | latest | Terminal emulation, shell spawning |
| File Watching | chokidar | latest | Cross-platform fs events |
| TTS | edge-tts (Python) | latest | Azure Edge Text-to-Speech |
| Testing | vitest | latest | Unit tests with v8 coverage |
| E2E Testing | Playwright | latest | Chromium/Firefox/WebKit |

---

## 3. Directory Structure

```
apps/desktop/
├── src/
│   ├── main/                       <- Electron main process
│   │   ├── index.ts                <- Entry point (~3,500 LOC)
│   │   ├── ipc/                    <- IPC handler domains (13 files)
│   │   │   ├── capture.ts
│   │   │   ├── tts.ts
│   │   │   ├── voice-input.ts
│   │   │   ├── speech.ts
│   │   │   ├── backup.ts
│   │   │   ├── task.ts
│   │   │   ├── cliproxy.ts
│   │   │   ├── scheduler.ts
│   │   │   ├── identity.ts
│   │   │   ├── bootstrap.ts
│   │   │   ├── sdk-agent.ts
│   │   │   ├── llm-apps.ts
│   │   │   └── marketing.ts
│   │   ├── services/               <- Core service implementations
│   │   │   ├── leader-monitor.ts
│   │   │   ├── task-service.ts
│   │   │   ├── backup-service.ts
│   │   │   ├── claude-sdk-service.ts
│   │   │   ├── identity-service.ts
│   │   │   ├── settings-writer.ts  <- (169 LOC)
│   │   │   ├── cli-execution-service.ts
│   │   │   ├── memory-sync-service.ts
│   │   │   ├── heartbeat-service.ts
│   │   │   ├── plugin-sync-service.ts
│   │   │   ├── parse-todo.ts
│   │   │   └── cliproxy-native.ts
│   │   ├── pty/                    <- PTY subsystem
│   │   │   ├── PtyManager.ts       <- Embedded mode
│   │   │   ├── PtyDaemonClient.ts  <- Daemon mode TCP client
│   │   │   └── persistence.ts      <- Session registry save/restore
│   │   ├── watchers/
│   │   │   └── claude-teams-watcher.ts  <- (545 LOC)
│   │   ├── tts/
│   │   │   └── edge-tts-backend.ts
│   │   ├── auth/
│   │   │   └── OAuthService.ts
│   │   └── ...
│   ├── preload/
│   │   └── index.ts                <- contextBridge exposure
│   └── renderer/
│       ├── App.tsx                 <- Root router (542 LOC)
│       ├── GenUIApp.tsx            <- Standalone GenUI window
│       ├── CodeEditorApp.tsx       <- Standalone code editor window
│       ├── components/             <- UI components
│       ├── stores/                 <- 50 Zustand stores
│       ├── hooks/                  <- 21 custom hooks
│       ├── types/                  <- 29 type definition files
│       └── utils/
├── electron.vite.config.ts
├── electron-builder.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

---

## 4. Main Process Architecture

### 4.1 Initialization Order

The main process (index.ts, ~3,500 LOC) follows a strict sequential initialization to ensure dependencies are available before dependent services start.

```
Step 1: Environment Setup
  - isDev flag from NODE_ENV
  - Window dimensions: 1400 x 900
  - Desktop secret: 32-byte hex (for MCP Core auth)

Step 2: PTY System Init
  - Check USE_PTY_DAEMON env var
  - Daemon mode: connect to external process on port 7072
  - Embedded fallback: init in-process PtyManager with node-pty

Step 3: File Watchers
  - chokidar watches on ~/.claude/teams/ and ~/.claude/tasks/
  - Claude Teams watcher starts polling loop

Step 4: Service Registration (12 services)
  - leader-monitor, task-service, backup-service, ...

Step 5: IPC Handler Registration (13 domains)
  - Each domain file called to register its ipcMain.handle() calls

Step 6: Window Creation
  - Main window (always)
  - Code editor window (if previously open)
  - GenUI window (if previously open)
```

ASCII diagram:

```
+--------------------------------------------------+
|                 Electron Main Process             |
|                                                  |
|  app.ready                                       |
|     |                                            |
|     v                                            |
|  [Env Setup] --> [Secret Gen] --> [PTY Init]     |
|                                       |          |
|                                       v          |
|                               [File Watchers]   |
|                                       |          |
|                                       v          |
|                             [Register Services] |
|                                       |          |
|                                       v          |
|                             [Register IPC]      |
|                                       |          |
|                                       v          |
|                             [Create Windows]    |
|                                                  |
+--------------------------------------------------+
         |                        |
         v (IPC)                  v (IPC)
  +-----------+            +-----------+
  | Renderer  |            | Preload   |
  | (React)   |            | Bridge    |
  +-----------+            +-----------+
```

### 4.2 Claude Teams Watcher (545 LOC)

The watcher monitors Claude's native file structures for multi-agent team coordination.

**Watched Paths:**
- `~/.claude/teams/` — Team configs, member inboxes
- `~/.claude/tasks/` — Per-team task JSON files

**Configuration:**
```
depth:               3
stabilityThreshold:  200ms
pollInterval:        50ms
```

**Staleness Detection:**
- Interval: 60 seconds
- Threshold: 30 minutes inactive
- Action: Emits `team-stale` IPC event to renderer

**IPC Events Emitted:**

| Event | Trigger | Payload |
|---|---|---|
| `config-updated` | teams config file change | team name, config |
| `messages-updated` | inbox file change | teammate id, messages |
| `team-deleted` | teams dir removed | team name |
| `tasks-updated` | task file change | task list |
| `team-stale` | 30min no activity | team name, last seen |

### 4.3 Settings Writer (169 LOC)

Handles atomic writes to Claude Code settings files (`~/.claude/settings.json`) with protection for critical fields.

**Write Strategy:**
1. Acquire per-file mutex
2. Read current state
3. Merge changes (skipping protected fields)
4. Write to `.tmp` file
5. Rename to target (atomic on POSIX, near-atomic on Windows)
6. Release mutex

**Protected Fields (never overwritten):**
- `env`
- `plugins`
- `enabledPlugins`
- `plansDirectory`
- `sandbox`
- `statusLine`

**Auto-Backup:**
- Maximum 20 backups maintained with rotation
- Pattern: `settings.json.bak.{N}`

### 4.4 CLI Detection

Detects installed AI CLI tools for spawning in terminal sessions.

**Supported Providers:**

| Provider | Binary | Search Method |
|---|---|---|
| claude | claude | PATH + custom dirs |
| kiro | kiro | PATH + custom dirs |
| kuroryuu | kuroryuu | PATH + custom dirs |
| shell | bash/zsh/pwsh | PATH standard |

Version extraction runs `{binary} --version` and parses stdout.

### 4.5 OAuth Service

Base `OAuthService` class with PKCE implementation for third-party integrations.

- State expiry: 10 minutes
- Custom protocol: `kuroryuu://` for redirect callback
- PKCE: SHA-256 code challenge, random verifier per session

---

## 5. PTY System

The PTY (pseudo-terminal) system has two operating modes selectable via environment variable. Both expose the same IPC surface to the renderer.

### 5.1 Mode Comparison

| Aspect | Daemon Mode | Embedded Mode |
|---|---|---|
| Activation | `USE_PTY_DAEMON=true` | Default fallback |
| Process | External daemon process | In-process |
| Port | 7072 (TCP) | None |
| App restart | PTYs survive | PTYs lost |
| Complexity | Higher (TCP, reconnect) | Lower |
| Client | PtyDaemonClient | PtyManager |
| Implementation | node-pty in daemon process | node-pty direct |

### 5.2 Daemon Mode

```
+------------------+        TCP :7072       +------------------+
|  Electron Main   |  <------------------> |   PTY Daemon     |
|                  |                        |   (node-pty)     |
|  PtyDaemonClient |                        |                  |
+------------------+                        +------------------+
         |
         | HTTP :8201
         |
+------------------+
|   MCP Core       |  (REST API for PTY control)
+------------------+
```

**PtyDaemonClient** handles:
- TCP connection management and reconnection
- Message framing (length-prefixed JSON)
- Session ID tracking across reconnects

### 5.3 PTY HTTP Bridge (Port 8201)

An HTTP server in the main process exposes a REST API at port 8201 for MCP Core tooling to control terminals programmatically.

```
POST /pty/spawn          <- Create new PTY session
GET  /pty/:id/read       <- Read output buffer
POST /pty/:id/write      <- Send input
DELETE /pty/:id          <- Kill session
GET  /pty/sessions       <- List active sessions
```

### 5.4 Leader Election

The terminal leader system assigns special authority to the first terminal session spawned. This is critical for agent orchestration patterns where a designated leader terminal manages subagents.

- Election: First spawn in session becomes leader
- Storage: Leader session ID persisted in registry
- IPC: `pty:get-leader`, `pty:set-leader` channels
- Monitor: `leader-monitor` service watches for leader exit and triggers re-election

### 5.5 Session Persistence

The persistence layer saves the PTY session registry to disk so a resumed Electron process can reconnect to surviving daemon-mode terminals.

- Save: On every session state change
- Restore: During main process init (daemon mode only)
- Format: JSON file with session metadata (id, pid, cwd, cols, rows)

---

## 6. IPC Architecture

### 6.1 Communication Patterns

All renderer-to-main communication flows through Electron IPC. Three patterns are used:

```
Pattern 1: Request-Response (ipcRenderer.invoke)
  Renderer ---invoke('channel', data)---> Main
  Renderer <---return value------------- Main
  Used for: file operations, CLI spawning, settings reads

Pattern 2: Fire-and-Forget (ipcRenderer.send)
  Renderer ---send('channel', data)----> Main
  No response expected
  Used for: TTS speak, PTY write, analytics events

Pattern 3: Main-to-Renderer Push (webContents.send)
  Main ---win.webContents.send('channel', data)---> Renderer
  Used for: file watcher events, PTY output, health updates
```

### 6.2 IPC Handler Domains

13 domain files organize IPC registration by concern:

| Domain File | Channel Prefix | Responsibility |
|---|---|---|
| capture.ts | `capture:*` | FFmpeg screen/video recording |
| tts.ts | `tts:*` | Text-to-speech playback |
| voice-input.ts | `voice:*` | Speech recognition |
| speech.ts | `speech:*` | Speech synthesis control |
| backup.ts | `backup:*` | Restic backup operations |
| task.ts | `task:*` | Claude task CRUD |
| cliproxy.ts | `cliproxy:*` | Clipboard proxy service |
| scheduler.ts | `scheduler:*` | Cron/interval scheduling |
| identity.ts | `identity:*` | Agent identity management |
| bootstrap.ts | `bootstrap:*` | First-run setup wizard |
| sdk-agent.ts | `sdk:*` | Claude SDK agent spawning |
| llm-apps.ts | `llm:*` | External LLM integration |
| marketing.ts | `marketing:*` | Marketing repo management |

Additional IPC channels registered directly in index.ts:

| Channel Prefix | Purpose |
|---|---|
| `pty:*` | Terminal session management |
| `file:*` | File system read/write |
| `gateway:*` | Proxy to Kuroryuu Gateway |
| `teams:*` | Claude Teams coordination |
| `settings:*` | Settings read/write |
| `mcp:*` | MCP protocol calls |
| `memory:*` | Claude memory file access |
| `claude-memory:*` | Memory panel CRUD |
| `genui:*` | GenUI window control |

### 6.3 Preload Bridge

The preload script exposes a curated API on `window.api` via `contextBridge.exposeInMainWorld`. The renderer never calls `ipcRenderer` directly.

```typescript
// Pattern in preload/index.ts
contextBridge.exposeInMainWorld('api', {
  pty: {
    spawn:   (opts) => ipcRenderer.invoke('pty:spawn', opts),
    write:   (id, data) => ipcRenderer.send('pty:write', id, data),
    resize:  (id, cols, rows) => ipcRenderer.invoke('pty:resize', id, cols, rows),
    kill:    (id) => ipcRenderer.invoke('pty:kill', id),
    onData:  (cb) => ipcRenderer.on('pty:data', cb),
  },
  // ... per domain
})
```

---

## 7. Service Layer

The 12 core services are instantiated in the main process and registered before IPC handlers. They are long-lived singletons for the application lifetime.

### 7.1 Service Registry

| Service | Key Responsibility |
|---|---|
| leader-monitor | Watches for leader PTY exit, triggers re-election |
| task-service | CRUD for ai/todo.md task entries |
| backup-service | Restic backup orchestration, schedule management |
| claude-sdk-service | Claude SDK agent lifecycle management |
| identity-service | Agent identity files (soul.md, heartbeat.md, memory.md) |
| settings-writer | Atomic settings file mutations (169 LOC) |
| cli-execution-service | Fire-and-forget CLI command execution |
| memory-sync-service | Syncs ~/.claude/projects/{hash}/memory/ on demand |
| heartbeat-service | Periodic alive pings for agent health monitoring |
| plugin-sync-service | Keeps Claude Code plugin config in sync |
| parse-todo | Parses ai/todo.md into structured task objects |
| cliproxy-native | Native clipboard read/write proxy |

### 7.2 TTS Feature Module

**File:** `main/tts/edge-tts-backend.ts`

Uses Azure Edge TTS via a Python subprocess wrapper. Supports 8 voice presets.

```
TTS Request Flow:
  Renderer --tts:speak--> IPC ---> edge-tts-backend
                                        |
                                        v
                                  Python subprocess
                                  (edge-tts library)
                                        |
                                        v
                                  Audio output (OS)
```

**Voice Presets:** 8 preconfigured voices, default is Sonia (en-GB).

**TTS Queue:** File-based cross-process lock at `ai/data/tts_queue/tts.lock`.
- Lock timeout: 25 seconds
- Dead PID detection on lock acquisition
- Prevents simultaneous playback from multiple Electron windows

### 7.3 Backup Service

Wraps the Restic CLI for project backup operations.

- Schedule management via scheduler service
- Response shape normalization (Restic JSON output parsing)
- `forget_by_policy` retention method for automated pruning
- IPC: `backup:run`, `backup:status`, `backup:list`, `backup:forget`

---

## 8. Renderer Architecture

### 8.1 Entry Points

**App.tsx (542 LOC)** — Main window root. Manages:
- Hash-based routing (`#/route`)
- 21 view components
- Modal overlay management
- Sidebar keyboard navigation

**GenUIApp.tsx** — Standalone GenUI window entry. Mounts only the GenUI panel tree with its own store context.

**CodeEditorApp.tsx** — Standalone code editor window entry. Mounts only the CodeMirror 6 editor with code-editor-store.

### 8.2 Route and Sidebar Map

Routes are organized into 4 sidebar groups with single-letter keyboard shortcuts:

```
Sidebar Group: PLAN
  [S] Scheduler       <- Cron/task scheduling UI
  [D] Dojo            <- AI challenge/practice arena
  [K] Kanban          <- Task board (ai/todo.md visual)

Sidebar Group: BUILD
  [N] ChatBot         <- Claude conversation UI
  [A] Claude Teams    <- Multi-agent team management
  [U] Kuroryuu Agents <- External CLI agents (Codex, Kiro, Aider)
  [G] GenUI           <- AI-generated UI dashboard
  [X] LLM Apps        <- External LLM integrations
  [T] Terminals       <- PTY terminal grid

Sidebar Group: MONITOR
  [P] Capture         <- FFmpeg screen recording
  [M] Server Status   <- Gateway health + metrics
  [F] HTTP Traffic    <- HTTP request inspector
  [Y] PTY Traffic     <- PTY I/O inspector

Sidebar Group: CHRONICLES
  [L] Changelog       <- Release notes
  [W] GitHub          <- Repo browser
  [B] Marketing       <- Marketing repo management
  [ ] Memory          <- Claude memory file editor
  [R] Transcripts     <- Session transcript browser
```

Additional routes (non-sidebar): Settings, Identity, Bootstrap wizard, Observability.

---

## 9. Zustand Store Catalog

The renderer uses 50 Zustand stores. Key stores are documented below with their state shape, action surface, and data source.

### 9.1 claude-teams-store.ts (851 LOC)

Manages multi-agent Claude Teams state. Data sourced from IPC file watcher events, NOT from the Gateway.

**State:**
```typescript
{
  teams: Team[],
  selectedTeamId: string | null,
  history: SessionHistory[],         // auto-archived sessions
  templates: TeamTemplate[],
  teammateHealth: Record<string, HealthStatus>,
  taskFirstSeen: Record<string, number>,  // ms timestamp
}
```

**Key Actions:**

| Action | Description |
|---|---|
| `startWatching()` | Registers IPC listeners for file watcher events |
| `createTeam(config)` | Writes team config to ~/.claude/teams/ |
| `messageTeammate(team, member, msg)` | Writes to member inbox JSON |
| `shutdownTeammate(team, member)` | Removes member from config |
| `checkTeammateHealth(team, member)` | Reads last heartbeat timestamp |
| `computeAnalytics(team)` | Derives message counts, response times |

**Data Source:** IPC push events from `claude-teams-watcher.ts` (chokidar). Not polled from Gateway.

### 9.2 prd-store.ts (701 LOC)

Manages PRD (Product Requirements Document) lifecycle including workflow execution.

**State:**
```typescript
{
  prds: PRD[],
  selectedPrdId: string | null,
  isGenerating: boolean,
  generationProgress: number,         // 0-100
  executingWorkflows: WorkflowExecution[],
  sessions: PRDSession[],
}
```

**Workflow Types (12):**

| Workflow | Description |
|---|---|
| `generate-prd` | AI generates PRD from prompt |
| `plan-feature` | Breaks feature into implementation plan |
| `prime` | Primes Claude with project context |
| `plan` | Generates execution plan |
| `execute` | Runs implementation steps |
| `review` | Code review pass |
| `validate` | Validates implementation against spec |
| `code-review` | Focused code quality review |
| `system-review` | Architecture review |
| `hackathon-complete` | End-to-end hackathon workflow |
| (2 additional internal) | — |

**Persistence:** Zustand `persist` middleware with localStorage adapter.

### 9.3 genui-store.ts (198 LOC)

Manages AI-generated UI dashboard state via SSE streaming from Gateway.

**State:**
```typescript
{
  markdownContent: string,
  status: 'idle' | 'analyzing' | 'generating' | 'complete' | 'error',
  components: A2UIComponent[],
  componentsByZone: Record<Zone, A2UIComponent[]>,
}
```

**SSE Event Types:**

| Event | Action |
|---|---|
| `STATE_SNAPSHOT` | Replace full state |
| `STATE_DELTA` | Apply JSON Patch |
| `STEP_STARTED` | Update status, log step |
| `STEP_FINISHED` | Mark step complete |
| `RUN_ERROR` | Set error status, store message |
| `RUN_FINISHED` | Set complete status |

**Dashboard Zones (7):**

| Zone | Purpose |
|---|---|
| `hero` | Primary headline metric or message |
| `metrics` | KPI cards and number displays |
| `insights` | Derived analysis and callouts |
| `content` | Main body content blocks |
| `media` | Images, charts, media embeds |
| `resources` | Links, documents, references |
| `tags` | Tag clouds, categorization |

### 9.4 code-editor-store.ts (715 LOC)

Full-featured code editor state with git integration.

**State:**
```typescript
{
  openFiles: EditorFile[],
  activeFileIndex: number,
  pinnedPaths: string[],
  changedFiles: string[],            // git dirty files
  currentBranch: string,
  branches: string[],
}
```

**Tab Operations:**
- Pin/unpin tabs (pinned tabs show lock icon, resist close)
- Reorder via drag
- Close others / close to right / close all

**Git Operations (18):**

| Operation | Description |
|---|---|
| `status` | Working tree status |
| `stage` | Add files to index |
| `unstage` | Remove from index |
| `commit` | Create commit with message |
| `diff` | Show unstaged/staged diffs |
| `branchCreate` | Create new branch |
| `branchDelete` | Delete branch |
| `branchRename` | Rename branch |
| `branchCheckout` | Switch branch |
| `branchList` | List all branches |
| `pull` | Fetch + merge |
| `push` | Push to remote |
| `fetch` | Fetch without merge |
| `stashSave` | Stash working changes |
| `stashPop` | Apply top stash |
| `stashList` | List stash entries |
| `stashDrop` | Remove stash entry |
| `log` | Commit history |

### 9.5 assistant-store.ts (1,547 LOC)

The conversational AI backend store — the largest store by LOC.

**State:**
```typescript
{
  messages: Message[],
  conversations: Conversation[],     // capped at 50
  selectedModel: string,
  availableTools: Tool[],
  activeBackend: BackendType,
  contextUsage: number,              // 0.0-1.0
}
```

**Backend Modes (5):**

| Backend | Protocol | Use Case |
|---|---|---|
| `lmstudio` | HTTP REST | Local LM Studio server |
| `cliproxyapi` | HTTP via cliproxy | Proxied Claude API |
| `claude` | Direct API | Claude.ai API key |
| `claude-cli` | Shell subprocess | claude CLI fire-and-forget |
| `claude-cli-pty` | PTY session | claude CLI with full terminal |

**Graduated Context Management:**

| Usage Level | Threshold | Action |
|---|---|---|
| Normal | < 80% | No action |
| Warning | 80-85% | UI warning indicator |
| Auto-compact | 85-95% | Trigger /compact |
| Emergency clear | > 95% | Force clear conversation |

### 9.6 observability-store.ts

Streams real-time agent observability data from Gateway WebSocket.

**State:**
```typescript
{
  events: ObservabilityEvent[],      // capped at 500
  activeSessions: Session[],
  toolStats: Record<string, ToolStat>,
  eventTypeStats: Record<string, number>,
}
```

**WebSocket:** `ws://localhost:8200/ws/observability-stream`

**Visualization Sub-tabs:**

| Tab | Visualization Style |
|---|---|
| swimlanes | svg-spine horizontal lanes per agent |
| timeline | threaded conversation view |
| visual | gantt chart with block overlap |
| stats | tool frequency charts |
| events | raw event log table |

### 9.7 settings-store.ts

Global application preferences with persistence.

**Theme Options (10):** Default, Dark, Light, Imperial, Neon, Forest, Ocean, Sakura, Cyber, Minimal

**UI Scale Options (5):**

| Scale | Value | Effect |
|---|---|---|
| Compact | 0.8 | Smaller type and spacing |
| Small | 0.9 | Slightly reduced |
| Normal | 1.0 | Default |
| Large | 1.1 | Slightly enlarged |
| Huge | 1.2 | Largest UI |

**Language Options (3):** English (`en`), Japanese (`ja`), Brazilian Portuguese (`pt-BR`)

**Additional Settings:**
- Terminal font family and size
- Animations toggle (motion-sensitive accessibility)
- devMode toggle (exposes debug panels)

---

## 10. Custom Hook Catalog

21 custom hooks abstract complex side effects from components.

| Hook | LOC | Purpose |
|---|---|---|
| `useSpawnTerminalAgent` | 144 | Unified CLI spawning with lifecycle management |
| `useGenUI` | 33 | Convenience selector for genui-store |
| `useTheme` | 121 | CSS variable application for 10 themes |
| `useKeyboardShortcuts` | 111 | Global sidebar navigation key bindings |
| `usePtyProcess` | 158 | PTY session lifecycle with double-checked locking |
| `useFileWatch` | — | IPC file watcher subscription |
| `useCapture` | — | FFmpeg recording state management |
| `useCommandCenter` | — | Command palette state |
| `useFeatureSettings` | — | Per-feature settings access |
| `useGatewayWebSocket` | — | Gateway WebSocket connection management |
| `useKuroryuuDialog` | — | Modal/dialog lifecycle |
| `usePTYTrafficFlow` | — | PTY I/O traffic visualization data |
| `useTTS` | — | TTS speak/stop with queue awareness |
| `useVoiceInput` | — | Web Speech API recording |
| `useWebSocket` | — | Generic WebSocket with reconnect |
| `useBashOutputStream` | — | Streaming bash output reader |
| `useBackupProgress` | — | Restic operation progress events |
| `useTerminalEvents` | — | PTY data/resize/close event subscriptions |
| `useSettings` | — | Settings store with persistence |
| `useMarketingAssets` | — | Marketing repo asset discovery |
| `useTrafficFlow` | — | HTTP traffic inspector data |

### 10.1 useSpawnTerminalAgent (144 LOC)

The canonical terminal spawning hook. All components that need to launch a CLI tool (PRD executor, Marketing panel, CLI Agents tab, etc.) use this hook to avoid duplicating PTY lifecycle management.

```typescript
const { spawn, kill, status, sessionId } = useSpawnTerminalAgent({
  provider: 'claude',         // CLI provider key
  args: ['--dangerously-skip-permissions'],
  cwd: '/project/path',
  onData: (data) => { /* terminal output */ },
  onExit: (code) => { /* cleanup */ },
})
```

Internally calls `pty:spawn` IPC, tracks session ID, handles cleanup on component unmount, and surfaces status (`idle`, `spawning`, `running`, `exited`, `error`).

### 10.2 usePtyProcess (158 LOC)

Lower-level PTY hook with double-checked locking for safe concurrent spawn requests. Used by the terminal grid for raw PTY panels.

**Double-checked locking pattern:**
```
1. Check spawning flag (first check, no lock)
2. If not spawning, acquire lock
3. Check spawning flag again (second check, under lock)
4. Spawn if still not spawning
5. Release lock
```

Prevents duplicate PTY sessions from rapid user interaction (e.g., clicking "New Terminal" twice quickly).

---

## 11. Window Management

### 11.1 Window Types

| Window | Dimensions | Route | IPC Channel |
|---|---|---|---|
| Main Window | 1400 x 900 | All 21 routes | (primary) |
| Code Editor | Configurable | `#/code-editor` | `editor:open` |
| GenUI Window | Configurable | `#/genui` | `genui:open` |
| Tray Companion | — | Context menu only | `tray:*` |

### 11.2 Window Creation

```
Main process startup:
  createMainWindow()
    -> BrowserWindow({ width: 1400, height: 900 })
    -> loadURL(#/) or loadFile(index.html)

On genui:open IPC:
  if (!genUIWindow) createGenUIWindow()
  else genUIWindow.focus()

On editor:open IPC:
  if (!codeEditorWindow) createCodeEditorWindow()
  else codeEditorWindow.focus()
```

### 11.3 Tray Icon

A system tray icon provides companion app functionality:
- Show/hide main window
- Quick status display
- Exit application

---

## 12. Build and Packaging

### 12.1 Vite Config (electron.vite.config.ts)

Three separate Vite builds for the three process types:

| Build Target | Key Config |
|---|---|
| Main process | `node-pty` marked as external (native module) |
| Preload script | All node modules externalized |
| Renderer | React Fast Refresh, standard web bundling |

### 12.2 electron-builder Config

**Target:** Windows NSIS installer, x64 architecture

**Distribution:**
- GitHub Releases on repository `ahostbr/kuroryuu-public`
- Auto-update via electron-updater watching GitHub releases

```
Artifact naming:
  Kuroryuu-Setup-{version}-x64.exe   <- NSIS installer
  Kuroryuu-{version}-x64.exe.blockmap  <- Delta update support
  latest.yml                         <- Auto-update manifest
```

### 12.3 Test Configuration

**vitest.config.ts:**
- Coverage provider: v8
- Test files: `src/**/*.test.ts`, `src/**/*.spec.ts`
- 3 test files in desktop/src at time of authoring

**playwright.config.ts:**
- Browsers: Chromium, Firefox, WebKit
- Timeout: 30 seconds per test
- Retries: 2 on CI
- Base URL: Electron app loaded via playwright-electron

---

## 13. Data Flow Diagrams

### 13.1 Claude Teams Data Flow

```
~/.claude/teams/        ~/.claude/tasks/
       |                       |
       +-------+-------+-------+
               |
         [chokidar]  (depth 3, 200ms stability)
               |
    claude-teams-watcher.ts
               |
        (IPC push events)
               |
    webContents.send('config-updated', ...)
    webContents.send('tasks-updated', ...)
               |
    claude-teams-store.ts  <-- (no Gateway polling)
               |
    ClaudeTeamsPanel.tsx
```

### 13.2 GenUI Data Flow

```
User Input (markdown/prompt)
       |
GenUIInput.tsx
       |
  genui-store.ts  -->  POST /v1/genui/generate
                              |
                         Gateway SSE stream
                              |
                        SSE Events:
                        STATE_SNAPSHOT
                        STATE_DELTA (JSON Patch)
                        STEP_STARTED/FINISHED
                        RUN_FINISHED
                              |
                        genui-store.ts
                        (componentsByZone)
                              |
                        GenUIDashboard.tsx
                        (7-zone grid layout)
```

### 13.3 PTY Data Flow

```
Renderer (TerminalPanel)
       |
  usePtyProcess.ts
       |
  window.api.pty.spawn(opts)
       |
  preload bridge
       |
  ipcMain.handle('pty:spawn')
       |
   [Daemon mode]          [Embedded mode]
  PtyDaemonClient           PtyManager
       |                        |
  TCP :7072              node-pty direct
  External daemon
       |
  PTY session created
       |
  Output: pty:data IPC push (streaming)
  Renderer receives via .on('pty:data', cb)
       |
  xterm.js terminal display
```

### 13.4 Observability Data Flow

```
Claude Code hooks (PostToolUse, Stop, etc.)
       |
  send_event.py (uv run)
       |
  Gateway HTTP POST /v1/events
       |
  Gateway WebSocket broadcast
       |
  ws://localhost:8200/ws/observability-stream
       |
  observability-store.ts
  (events capped at 500)
       |
  ObservabilityPanel
  (swimlanes / timeline / gantt / stats)
```

### 13.5 Settings Write Flow

```
Renderer: settingsStore.setTheme('imperial')
       |
  window.api.settings.write({ theme: 'imperial' })
       |
  ipcMain.handle('settings:write')
       |
  settings-writer.ts
       |
  [acquire per-file mutex]
       |
  Read current ~/.claude/settings.json
       |
  Merge (skip protected fields)
       |
  Write to settings.json.tmp
       |
  fs.rename (atomic swap)
       |
  [release mutex]
       |
  Rotate auto-backups (max 20)
```

---

## 14. Key Design Patterns

### 14.1 IPC Domain Separation

IPC channels are organized by domain to keep main/index.ts from becoming a monolith. Each domain file exports a single `register(ipcMain, services)` function called during startup. This allows each domain to be tested in isolation.

### 14.2 Store-per-Concern

Each major feature has its own Zustand store rather than a global state object. Stores are colocated with their feature directory. Cross-store communication is done via direct imports (Zustand stores are singletons).

```typescript
// Allowed: store A reads from store B
import { useGenUIStore } from '../stores/genui-store'

// Cross-store subscriber pattern
genUIStore.subscribe(
  (state) => state.status,
  (status) => { if (status === 'complete') notifyOtherStore() }
)
```

### 14.3 File-Based State for Agent Coordination

Agent team state (team configs, inboxes, tasks) lives on disk in `~/.claude/` rather than in a database or API server. The file watcher converts fs events to IPC pushes. This allows Claude Code processes running in separate terminal sessions to coordinate through a shared filesystem without a central broker.

```
Claude Code Session A          Claude Code Session B
(Teammate: Ash)                (Teammate: Builder)
        |                              |
  Writes inbox msg                 Reads inbox
  ~/.claude/teams/                     |
  default/inboxes/         chokidar detects change
  builder.json                         |
                                IPC push to renderer
                                teams-store updates
```

### 14.4 Imperial Theme Scoping

The Imperial theme (dark + gold/crimson) is applied via CSS variable overrides scoped to specific component roots. This allows per-panel theme switching without a full app re-theme.

```css
/* Default theme variables */
.component-root {
  --g-bg: #1a1a1a;
  --g-accent: #3b82f6;
}

/* Imperial override */
.component-root.imperial {
  --g-bg: #0a0608;
  --g-accent: #c9a84c;  /* gold */
  --g-danger: #8b1a1a;  /* crimson */
}
```

The `useTheme` hook applies the correct class to the component root based on `settings-store.theme` and the per-feature imperial toggle.

### 14.5 Graduated Context Compaction

The assistant store monitors context window usage and takes progressive action to prevent hard truncation by the model:

```
0% -------- 80% -------- 85% -------- 95% ------- 100%
  Normal    |   Warn     |  Auto      |  Emergency  |
            |  indicator |  /compact  |  clear      |
```

This prevents user data loss by compacting early rather than waiting for the model to silently drop context.

### 14.6 Atomic Settings Writes

The settings-writer uses a tmp-file-then-rename pattern to prevent partial writes corrupting the settings file. The per-file mutex ensures only one write operation runs at a time per file path, preventing interleaved writes from concurrent IPC calls.

```
[Concurrent IPC calls for same file]
  Call A ----+
             | per-file mutex (serialized)
  Call B ----+

  A runs:  read -> merge -> write tmp -> rename
  B runs:  read -> merge -> write tmp -> rename  (after A completes)
```

---

## Appendix A: Type Definition Files

29 TypeScript type definition files in `src/renderer/types/`:

| File | Key Types | LOC |
|---|---|---|
| claude-teams.ts | TeamMember, TeamConfig, TeamTask, InboxMessage | ~150 |
| genui.ts | A2UIComponent, DashboardState, JsonPatch | 35 |
| prd.ts | PRD, PRDScope, PRDStatus, WorkflowType (12 variants) | ~100 |
| observability.ts | ObservabilityEvent, SessionTrace, ToolStat | — |
| pty.ts | PtySession, PtyOptions, PtyStatus | — |
| settings.ts | AppSettings, Theme, UIScale, Language | — |
| assistant.ts | Message, Conversation, BackendType, Tool | — |

---

## Appendix B: Key File Reference

| File | LOC | Description |
|---|---|---|
| src/main/index.ts | ~3,500 | Main process entry, service + IPC bootstrap |
| src/main/watchers/claude-teams-watcher.ts | 545 | chokidar watcher for Claude Teams |
| src/main/services/settings-writer.ts | 169 | Atomic settings file writer |
| src/renderer/App.tsx | 542 | Renderer root, 21 routes, modal management |
| src/renderer/stores/assistant-store.ts | 1,547 | Conversational AI backend |
| src/renderer/stores/claude-teams-store.ts | 851 | Multi-agent team state |
| src/renderer/stores/prd-store.ts | 701 | PRD lifecycle + workflow execution |
| src/renderer/stores/code-editor-store.ts | 715 | Code editor + 18 git operations |
| src/renderer/stores/genui-store.ts | 198 | AI-generated UI dashboard |
| src/renderer/hooks/useSpawnTerminalAgent.ts | 144 | Unified CLI spawning |
| src/renderer/hooks/usePtyProcess.ts | 158 | PTY lifecycle + double-checked locking |
| src/renderer/hooks/useTheme.ts | 121 | CSS variable theme application |
| src/renderer/hooks/useKeyboardShortcuts.ts | 111 | Global sidebar key bindings |
