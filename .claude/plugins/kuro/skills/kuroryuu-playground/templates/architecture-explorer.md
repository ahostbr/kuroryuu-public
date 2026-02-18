# Architecture Explorer Template

Use this template when the playground is about visualizing Kuroryuu's codebase architecture: component relationships, data flow, layer diagrams, system architecture with interactive commenting.

Extends the official `code-map` template with Kuroryuu-specific pre-population.

## Layout

```
+-------------------+----------------------------------+
|                   |                                  |
|  Controls:        |  SVG Canvas                      |
|  - View presets   |  (nodes + connections)           |
|  - Layer toggles  |  with zoom controls              |
|  - Connection     |                                  |
|    type filters   |  Legend (bottom-left)            |
|                   |                                  |
|  Comments (n):    +----------------------------------+
|  - List of user   |  Prompt output                   |
|    comments with  |  [ Copy Prompt ]                 |
|    delete buttons |                                  |
+-------------------+----------------------------------+
```

## Pre-populate with Kuroryuu data

Before generating, gather live data:

```
k_repo_intel(action="get", report="routes")     # 25+ routers
k_repo_intel(action="get", report="symbol_map") # 170+ components
```

### Layers (5 tiers)

| Layer | Color | Contents |
|-------|-------|----------|
| Gateway (Python) | #fef3c7 amber-100 | 25 FastAPI routers, GenUI pipeline, MCP dispatcher |
| Desktop Main (Electron) | #f3e8ff purple-100 | IPC handlers, services, PTY daemon, file watchers |
| Desktop Renderer (React) | #dbeafe blue-100 | 170+ components, 50 Zustand stores, 21 hooks |
| Plugin System | #dcfce7 green-100 | .claude/plugins/kuro/, hooks, commands, skills |
| MCP Core | #fce7f3 pink-100 | 25 tools, 135 actions, k_session/k_rag/k_pty/k_tts |

### Key Nodes (minimum 20)

Pre-populate with these key components:

**Gateway:**
- GenUI Router (`apps/gateway/genui/router.py`)
- MCP Dispatcher (`apps/gateway/server.py`)
- Tasks Router (`apps/gateway/task_router.py`)
- Observability Router (`apps/gateway/observability_router.py`)
- TTS Router (`apps/gateway/tts_router.py`)

**Desktop Main:**
- IPC Bootstrap (`apps/desktop/src/main/ipc/bootstrap-handlers.ts`)
- PTY Manager (`apps/pty_daemon/src/pty-manager.ts`)
- Plugin Sync Service (`apps/desktop/src/main/services/plugin-sync-service.ts`)
- Heartbeat Service (`apps/desktop/src/main/services/heartbeat-service.ts`)

**Desktop Renderer:**
- App.tsx (`apps/desktop/src/renderer/App.tsx`)
- Sidebar (`apps/desktop/src/renderer/components/Sidebar.tsx`)
- Claude Teams Panel (file watcher)
- Kuroryuu Agents Panel (Gateway polling)
- GenUI Panel → Claude Playground
- Terminal Grid (`apps/desktop/src/renderer/components/terminal/TerminalGrid.tsx`)

**Stores:**
- agent-config-store (agent management)
- genui-store (playground state)
- settings-store (app settings)
- assistant-store (chatbot)

### Connection Types

| Type | Color | Style | Use for |
|------|-------|-------|---------|
| Data Flow | #3b82f6 blue | Solid | HTTP, SSE, fetch |
| IPC Bridge | #8b5cf6 purple | Dashed | Electron IPC calls |
| File Watch | #10b981 green | Dotted | chokidar watchers |
| WebSocket | #f97316 orange | Long dash | Real-time events |
| MCP Call | #ef4444 red | Short dash | Gateway MCP tool calls |

### Presets

1. **Full System** — All layers, all connections
2. **Gateway Only** — Gateway + MCP layers, HTTP/SSE connections
3. **Desktop Only** — Main + Renderer layers, IPC connections
4. **Data Flow** — All layers, only data flow connections
5. **Agent Pipeline** — Components involved in agent spawning flow

## Prompt output

Combine system context with user comments:

```
This is the Kuroryuu architecture, focusing on [visible layers].

Feedback on specific components:

**GenUI Router** (apps/gateway/genui/router.py):
[User's comment about this component]

**Terminal Grid** (apps/desktop/src/renderer/components/terminal/TerminalGrid.tsx):
[User's comment]
```

Only include user-added comments. Mention which layers are visible.
