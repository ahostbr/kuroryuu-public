# Gateway Architecture Reference

**Path:** `apps/gateway/`
**Framework:** FastAPI (Python)
**Port:** 8200
**Scale:** 46,491 LOC across 187 Python files
**Version:** 0.12.0 (M5 Complete)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Directory Layout](#2-directory-layout)
3. [Server Core](#3-server-core)
4. [Middleware Stack](#4-middleware-stack)
5. [Authentication](#5-authentication)
6. [Router Inventory](#6-router-inventory)
7. [Tool Loop Engine](#7-tool-loop-engine)
8. [Orchestration Layer](#8-orchestration-layer)
9. [Formula System](#9-formula-system)
10. [GenUI Pipeline](#10-genui-pipeline)
11. [MCP Client](#11-mcp-client)
12. [LLM Backends](#12-llm-backends)
13. [Hook System](#13-hook-system)
14. [Observability](#14-observability)
15. [Traffic Monitoring](#15-traffic-monitoring)
16. [Security Layer](#16-security-layer)
17. [Environment Variables](#17-environment-variables)
18. [Data Flow Diagrams](#18-data-flow-diagrams)

---

## 1. System Overview

The Kuroryuu Gateway is the central HTTP hub for all AI agent communication. It sits between the Electron desktop UI, the web UI, the MCP Core tool server, and multiple LLM backends. All API calls from clients pass through the gateway, which handles authentication, routing, tool-loop execution, multi-agent orchestration, and telemetry.

```
+------------------+     HTTP/WS     +------------------+     JSON-RPC 2.0    +------------------+
|  Electron Desktop| <-------------> |                  | <----------------> |   MCP Core       |
|  (port 0 / IPC)  |                 |   Gateway        |                    |   (port 8100)    |
+------------------+                 |   (port 8200)    |                    +------------------+
                                      |   FastAPI        |
+------------------+     HTTP/WS     |                  |     HTTP            +------------------+
|  Web UI          | <-------------> |   server.py      | <----------------> |   LM Studio      |
|  (port 3000)     |                 |   ~950 LOC       |                    |   (port 1234)    |
+------------------+                 |                  |                    +------------------+
                                      |                  |
+------------------+     HTTP/WS     |                  |     HTTP            +------------------+
|  CLI Agents      | <-------------> |                  | <----------------> |   CLI Proxy API  |
|  (Kuroryuu CLI)  |                 +------------------+                    |   (port 8317)    |
+------------------+                                                          +------------------+
```

The gateway is designed for localhost-only operation. External access is routed through Cloudflare Tunnel or Tailscale — the server never binds to a public interface.

---

## 2. Directory Layout

```
apps/gateway/
├── server.py               # FastAPI app, middleware, router mounts (~950 LOC)
├── config.py               # Centralized env-var config (GatewayConfig dataclass)
├── fallback_server.py      # Minimal fallback if primary fails
├── run_agent.py            # CLI entry point for single-agent runs
├── run_swarm.py            # CLI entry point for swarm runs
│
├── agent/                  # Tool loop engine
│   ├── tool_loop.py        # ToolLoop class, XMLToolParser (435 LOC)
│   ├── tool_schema.py      # InternalMessage, ToolCall, ToolResult, ToolSchema
│   ├── tool_events.py      # SSE event emitters (emit_delta, emit_done, etc.)
│   └── __init__.py
│
├── agents/                 # Agent registry (M2)
│   ├── router.py           # /v1/agents/* endpoints
│   ├── messaging_router.py # /v1/agents/messages/* endpoints
│   ├── models.py           # Agent registration models
│   └── __init__.py
│
├── agui/                   # AG-UI Protocol
│   ├── events.py           # Run started/finished event emitters
│   ├── interrupts.py       # Human-in-the-loop interrupt store
│   └── __init__.py
│
├── artifacts/              # Canvas artifact management
├── auth/                   # GitHub OAuth middleware and models
├── changelog/              # Git history and changelog generation
├── chat_history/           # Web UI chat persistence
├── chat_proxy/             # LM Studio / Devstral chat proxy (M5)
├── cli/                    # CLI runner, compact command, session management
├── commands/               # /commit, /pr slash commands
├── context/                # Run ID generation, context packs, run manager
├── genui/                  # Generative UI pipeline (8 files)
├── github/                 # GitHub PR management
├── harness/                # Prompt harness (build_prime_context, etc.)
├── hooks/                  # Hook executor, registry, role gating
├── inbox/                  # Agent-to-agent inbox (M3)
├── linear/                 # Linear.app integration
├── llm/                    # LLM backend abstraction
│   ├── backends/
│   │   ├── lmstudio.py     # LM Studio (OpenAI-compat)
│   │   ├── cliproxyapi.py  # CLI Proxy API (multi-provider)
│   │   └── __init__.py
│   ├── schemas/            # JSON schema generation for tools
│   └── __init__.py         # Health-checked backend chain
├── llm_apps/               # Awesome-LLM-Apps catalog browser
├── marketing/              # Research engine, scraper, asset generation
├── mcp/                    # MCP JSON-RPC client
│   ├── client.py           # MCPClient (223 LOC)
│   ├── pty_client.py       # PTY-specific MCP calls
│   └── __init__.py
├── observability/          # Hook event telemetry, SQLite, WebSocket
├── orchestration/          # Multi-agent orchestration (M4)
│   ├── leader.py           # LeaderOrchestrator (711 LOC)
│   ├── worker.py           # WorkerOrchestrator (597 LOC)
│   ├── formulas.py         # TOML workflow system (686 LOC)
│   ├── models.py           # Task, SubTask, IterationRecord, enums
│   ├── monitoring.py       # Stuck-task detection
│   ├── promises.py         # Promise type handling
│   ├── recovery.py         # Failure recovery logic
│   ├── router.py           # /v1/orchestration/* endpoints
│   ├── single_agent.py     # Single-agent orchestration path
│   ├── specialists.py      # Specialist auto-detection
│   ├── storage.py          # Task persistence
│   ├── todo_md.py          # ai/todo.md parser and writer
│   └── __init__.py
├── prd/                    # PRD generation
├── prompts/                # Prompt builders (anthropic, openai, lmstudio, devstral)
├── repo_intel/             # AI-powered codebase analysis
├── rules/                  # Rules learning system
├── security/               # Blocklist, defense, threat intel
│   ├── blocklist.py        # IP blocklist with ThreatInfo
│   ├── defense.py          # Lockdown, emergency shutdown
│   ├── intel.py            # Threat gathering and broadcast
│   └── router.py           # /v1/security/* endpoints
├── sessions/               # Session models, storage, router (M5)
├── subagent/               # Claude Code sub-agent config generation
├── system/                 # /v1/system/stats, /health
├── tasks/                  # /v1/tasks/* unified task integration
├── traffic/                # Traffic monitoring (middleware, storage, websocket)
│   ├── middleware.py       # OriginValidationMiddleware, TrafficMonitoringMiddleware
│   ├── router.py           # /v1/traffic/* endpoints
│   ├── websocket.py        # WS /ws/traffic
│   ├── pty_router.py       # PTY traffic endpoints
│   ├── pty_websocket.py    # WS /ws/pty-traffic
│   ├── storage.py          # SQLite traffic storage
│   ├── tracker.py          # In-memory traffic state
│   └── models.py           # TrafficEventDetail, filter_headers
├── utils/                  # Logging config, shared utilities
├── websocket/              # WS /ws agent status (M5)
└── worktrees/              # Git worktrees management (E1)
```

---

## 3. Server Core

**File:** `apps/gateway/server.py` (~950 LOC)

The server module is the assembly point. It constructs the FastAPI application, attaches middleware in the correct order, registers all routers, and defines endpoint handlers for core flows that span multiple subsystems (slash commands, v1/v2 chat streaming, MCP proxy, harness invocation).

### FastAPI Application

```python
app = FastAPI(
    title="Kuroryuu Gateway",
    description="AG-UI compliant agent gateway with provider-agnostic LLM backends",
    version="0.12.0",
)
```

### Slash Command Registry

Slash commands are detected in user messages before routing to the LLM. They inject prompt templates into the system context.

| Command | Shorthand | Prompt Name |
|---------|-----------|-------------|
| `/plan` | `/p` | `plan` |
| `/execute` | `/e` | `execute` |
| `/review` | `/r` | `review` |
| `/validate` | `/v` | `validate` |
| `/prime` | (none) | `prime` |

Detection runs on every chat message. If a slash command is found, the corresponding prompt is loaded from the harness store and prepended to the system prompt before the LLM call.

### Auto-Evidence Detection

Two utility functions in server.py support PRD-style auto-advancement:

- `detect_evidence_from_tools(tools_called, results_ok, min_success_ratio=0.5)` — Returns True if at least one tool ran and >= 50% succeeded.
- `should_auto_advance_feature(tools_called, results_ok, user_message)` — Combines evidence detection with completion keyword matching ("done", "complete", "finished", "mark done", "next feature", "move on").

---

## 4. Middleware Stack

Starlette processes middleware from outermost to innermost on request, and innermost to outermost on response. Middleware is added in the reverse of execution order — the last `add_middleware` call runs first.

```
Incoming Request
       |
       v
+-------------------------------+
|  CORSMiddleware               |  (outermost - added last)
|  Allow-Origin, credentials    |
+-------------------------------+
       |
       v
+-------------------------------+
|  OriginValidationMiddleware   |  (CSRF protection)
|  Block foreign POST/PUT/DELETE|
+-------------------------------+
       |
       v
+-------------------------------+
|  TrafficMonitoringMiddleware  |  (innermost - added first)
|  Capture all requests/resps   |
+-------------------------------+
       |
       v
  Route Handler
```

### ProxyHeadersMiddleware

Applied conditionally when `KURORYUU_TRUSTED_PROXIES` is set. Reads `X-Forwarded-For` and `X-Forwarded-Proto` headers to determine real client IP when sitting behind nginx or Caddy.

**Security constraint:** Wildcard (`*`) in trusted proxies list causes immediate `sys.exit(1)` at startup. Specific IPs must be enumerated.

### Global Exception Handler

A catch-all `@app.exception_handler(Exception)` manually injects CORS headers onto 500 responses so browsers can read error details. Without this, inner middleware exceptions would lose CORS headers during response reconstruction.

---

## 5. Authentication

### Web UI Authentication

| Property | Value |
|----------|-------|
| Algorithm | SHA256 password hash |
| Storage | In-memory session set (`_auth_sessions`) |
| Transport | HTTP-only session cookies |
| TTL | 7 days (configurable via `KURORYUU_SESSION_TTL_DAYS`) |
| Username | Configurable via `KURORYUU_AUTH_USERNAME` (default: `Guest`) |
| Password | Pre-hashed SHA256 string in `KURORYUU_AUTH_PASSWORD_HASH` |

To generate a password hash:
```bash
python -c "import hashlib; print(hashlib.sha256(b'yourpassword').hexdigest())"
```

Auth applies only to web UI routes. API endpoints are not auth-protected by default.

### Desktop Authentication

| Property | Value |
|----------|-------|
| Secret | 64-character hex string |
| Header | `X-Kuroryuu-Desktop-Secret` |
| Scope | Localhost-only — secret is only valid from 127.0.0.1 |
| Comparison | `secrets.compare_digest()` (constant-time, timing-attack resistant) |

The Desktop secret is generated once at first launch and shared between the Electron main process and the gateway via environment variable or config file.

---

## 6. Router Inventory

All routers are registered with `app.include_router()` in server.py. The module code (M2-M5, E1-E8) indicates the build phase when the router was introduced.

| Module | Prefix | Description |
|--------|--------|-------------|
| M2: agents_router | `/v1/agents` | Agent registry (register, heartbeat, list, leader, messages) |
| M2: agent_messaging_router | `/v1/agents/messages` | Direct agent-to-agent communication |
| M3: inbox_router | `/v1/inbox` | Agent inbox (send, fetch by agent_id, ack) |
| M4: orchestration_router | `/v1/orchestration` | Task orchestration (cancel, finalize, formulas, batch) |
| M5: chat_proxy_router | `/v1/chat`, `/v2/chat` | SSE streaming chat (v1 legacy, v2 unified tool loop) |
| M5: websocket_router | `/ws` | WebSocket for real-time agent status |
| M5: sessions_router | `/v1/sessions` | Session management |
| E1: worktrees_router | `/v1/worktrees` | Git worktree management |
| E3: linear_router | `/v1/linear` | Linear.app integration |
| E4: repo_intel_router | `/v1/repo-intel` | AI-powered codebase analysis |
| E5: context_router | `/v1/context` | Run context management |
| E6: commands_router | `/v1/commands` | Slash commands (/commit, /pr) |
| E7: prd_router | `/v1/prd` | PRD generation (generate, list, fetch by id) |
| E8: rules_router | `/v1/rules` | Rules learning |
| auth_router | `/v1/auth` | GitHub OAuth token validation |
| subagent_router | `/v1/subagent` | Claude Code sub-agent config generation |
| chat_history_router | `/v1/chat-history` | Chat history persistence for web UI |
| changelog_router | `/v1/changelog` | Git history and changelog generation |
| artifacts_router | `/v1/artifacts` | Canvas artifact management |
| security_router | `/v1/security` | Security status, check, intel |
| tasks_router | `/v1/tasks` | Unified task integration (list, get by id, meta) |
| system_router | `/v1/system` | System stats and health |
| genui_router | `/v1/genui` | Generative UI pipeline (generate SSE, analyze, components, layouts) |
| github_router | `/v1/github` | GitHub PR management and workflow |
| marketing_router | `/v1/marketing` | Research engine, web scraper, asset generation |
| llm_apps_router | `/v1/llm-apps` | LLM apps catalog browser |
| observability_router | `/v1/observability` | Hook event telemetry |
| traffic_router | `/v1/traffic` | Traffic monitoring endpoints |
| pty_traffic_router | `/v1/traffic/pty` | PTY traffic monitoring |

### WebSocket Endpoints

| Path | Purpose |
|------|---------|
| `/ws` | Real-time agent status (M5) |
| `/ws/observability` | Hook event telemetry stream |
| `/ws/traffic` | Network traffic visualization stream |
| `/ws/pty-traffic` | PTY session traffic stream |

---

## 7. Tool Loop Engine

**File:** `apps/gateway/agent/tool_loop.py` (435 LOC)

The ToolLoop is the core algorithm that drives all LLM interactions requiring tool use. It is provider-agnostic — backends only stream events, and the gateway owns the loop logic.

### Algorithm

```
ToolLoop.run(messages, temperature, system_prompt)
    |
    +---> 1. Convert messages to backend format
    |        (to_claude_messages or to_openai_messages)
    |
    +---> 2. Stream from LLM backend
    |        backend.stream(messages, tools, config) -> yields StreamEvents
    |
    +---> 3. For each StreamEvent:
    |        - delta: emit_delta() to SSE stream
    |        - tool_call (native): collect ToolCall objects
    |        - text: accumulate, check for XML tool calls
    |
    +---> 4. After stream ends:
    |        - XMLToolParser.extract_tool_calls() on accumulated text
    |        - Check tool_call_count >= max_tool_calls (0 = unlimited)
    |
    +---> 5. For each ToolCall:
    |        - emit_tool_start()
    |        - tool_executor(name, arguments) via MCP client
    |        - emit_tool_end()
    |        - Inject ToolResult into messages
    |
    +---> 6. Track consecutive failures
    |        MAX_CONSECUTIVE_FAILURES = 3 -> stop loop
    |
    +---> 7. If clarification needed:
    |        emit_clarification_request() -> AG-UI interrupt
    |
    +---> 8. Continue loop or emit_done()
```

### Tool Call Limits

| Scope | Mechanism | Range |
|-------|-----------|-------|
| Global default | `KURORYUU_MAX_TOOL_CALLS` env var | 0 = unlimited |
| Env-set limit | Clamped at startup | 1..50 |
| Per-worker override | Leader calls `/v1/leader/worker-config` | 0..50 |
| Priority | Worker config > env default > 0 (unlimited) | - |

Worker configs are stored in an in-memory dict `_worker_configs: Dict[str, Dict[str, Any]]` keyed by `worker_id`.

### XMLToolParser

Handles models that emit tool calls as XML in their text output rather than via native tool-calling APIs.

**Primary pattern:**
```
<tool_call>
<name>tool_name</name>
<arguments>{"key": "value"}</arguments>
</tool_call>
```

**Alternate pattern (some models):**
```
<tool_call>[TOOL_CALLS]tool_name[ARGS]{"key": "value"}
```

Regex (primary):
```python
re.compile(
    r"<tool_call>\s*<name>([^<]+)</name>\s*<arguments>(.*?)</arguments>\s*</tool_call>",
    re.DOTALL | re.IGNORECASE,
)
```

The parser also detects partial/unclosed `<tool_call>` tags during streaming to avoid emitting incomplete text to the UI.

### SSE Event Types

| Function | Event Emitted | Description |
|----------|---------------|-------------|
| `emit_delta()` | `delta` | LLM text token chunk |
| `emit_tool_start()` | `tool_start` | Tool call begun |
| `emit_tool_end()` | `tool_end` | Tool call result received |
| `emit_done()` | `done` | Loop finished |
| `emit_error()` | `error` | Error occurred |
| `emit_clarification_request()` | `clarification_request` | Human-in-the-loop needed |

---

## 8. Orchestration Layer

The orchestration layer implements a multi-agent message bus (M4) with a Leader-Worker architecture. Tasks flow from the Leader (decomposition and assignment) through Workers (execution and reporting).

### 8.1 Leader Orchestrator

**File:** `apps/gateway/orchestration/leader.py` (711 LOC)

The Leader is responsible for taking a high-level task, breaking it into subtasks, assigning them to workers, monitoring progress, and handling failures.

#### Key Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `create_task` | `(title, description, priority)` | Creates task, auto-detects specialist roles required |
| `breakdown_task` | `(task_id, subtasks)` | Loads prompt refs, queries collective patterns, assigns iteration budgets |
| `receive_result` | `(task_id, subtask_id, success, result)` | Records outcome to collective intelligence |
| `inject_hint` | `(task_id, subtask_id, hint)` | Bumps subtask escalation level, provides next-iteration guidance |
| `get_stuck_subtasks` | `()` | Returns subtasks matching any stuck criterion |

#### Iteration Budget Calculation

Complexity score maps to maximum iteration count:

| Complexity Score | Max Iterations |
|-----------------|----------------|
| 1 | 2 |
| 3 | 5 |
| 5 | 10 |
| 7 | 15 |
| 10 | 30 |

#### Stuck Subtask Criteria

A subtask is considered stuck if ANY of the following are true:

- Current iteration >= 50% of max_iterations budget
- Context tokens used >= 80% of context_budget_tokens
- Latest promise is `STUCK` or `BLOCKED`
- Escalation level >= 2

#### Collective Intelligence Integration

The leader reads and writes to `ai/collective/patterns.jsonl`. This is a flat file — no HTTP calls, no circular dependencies.

**Scoring algorithm:**
```
For each pattern in patterns.jsonl:
    score += 3 if task_type keyword matches query
    score += 1 if approach keyword matches query
Return top-5 by score as formatted context string
```

**Pattern record fields:** `type`, `task_type`, `approach`, `detail`, `timestamp`

### 8.2 Worker Orchestrator

**File:** `apps/gateway/orchestration/worker.py` (597 LOC)

Workers poll for available subtasks, claim them, execute work, and report results.

#### WorkerConfig

```python
@dataclass
class WorkerConfig:
    agent_id: str
    capabilities: List[str]    # Empty = accept any task
    max_concurrent: int = 1
    poll_interval: float = 2.0 # seconds
```

#### Key Methods

| Method | Description |
|--------|-------------|
| `poll(max_tasks)` | Get subtasks in PENDING status not blocked by dependencies |
| `claim_subtask(task_id, subtask_id)` | Set status=ASSIGNED, record started_at |
| `start_work()` | Build execution context from task + subtask + hints |
| `report_result()` | Append IterationRecord, update context tracking, handle promise |
| `_determine_next_action()` | Graduated escalation decision |

#### Escalation Ladder

```
Iteration 1      ->  retry
hint_received    ->  hint_injected (retry with leader guidance)
hint + failure   ->  reassigning (release claim, put back to PENDING)
2+ reassignments ->  escalate_human (interrupt, block task)
```

### 8.3 Task Lifecycle

```
PENDING
  |
  v (Leader.breakdown_task)
BREAKING_DOWN
  |
  v (Worker.claim_subtask)
ASSIGNED
  |
  v (Worker begins execution)
IN_PROGRESS
  |
  +---> COMPLETED (promise=DONE)
  |
  +---> FAILED (3 consecutive failures or unrecoverable error)
  |
  +---> CANCELLED (manual via /v1/orchestration/cancel)
```

### 8.4 Data Models

#### TaskStatus

```python
class TaskStatus(str, Enum):
    PENDING       = "pending"
    BREAKING_DOWN = "breaking_down"
    ASSIGNED      = "assigned"
    IN_PROGRESS   = "in_progress"
    COMPLETED     = "completed"
    FAILED        = "failed"
    CANCELLED     = "cancelled"
```

#### PromiseType

```python
class PromiseType(str, Enum):
    DONE     = "DONE"      # Completed successfully
    BLOCKED  = "BLOCKED"   # Needs external input
    STUCK    = "STUCK"     # Cannot proceed, needs reassignment
    PROGRESS = "PROGRESS"  # Partial (with percentage in promise_detail)
```

#### IterationRecord

Each work attempt is recorded in full:

```python
class IterationRecord(BaseModel):
    iteration_num: int
    started_at: datetime
    ended_at: Optional[datetime]
    duration_sec: Optional[float]
    agent_id: str
    context_tokens_used: int
    promise: Optional[PromiseType]
    promise_detail: str      # "80" for PROGRESS:80, "missing API key" for BLOCKED:reason
    error: Optional[str]
    approach_tried: str      # Deduplication field
    leader_hint: str         # Injected guidance for this iteration
```

---

## 9. Formula System

**File:** `apps/gateway/orchestration/formulas.py` (686 LOC)

Formulas are reusable workflow templates defined in TOML files stored at `ai/formulas/`. When applied, they generate subtasks in `ai/todo.md` with full dependency ordering.

### Components

| Class | Role |
|-------|------|
| `FormulaStorage` | Read/write TOML files from `ai/formulas/` |
| `FormulaParser` | TOML dict -> Formula model, resolve prompt refs |
| `FormulaApplier` | Apply formula to `ai/todo.md` with topological sort |

### TOML Structure

```toml
[formula]
name = "my-workflow"
description = "What this workflow does"
version = "1.0"

[[vars]]
name = "target_component"
type = "string"
required = true

[[steps]]
id = "step-1"
title = "First step title"
description = "What to do in step 1"
complexity = 3
prompt_ref = "workflows/execute"   # refs ai/prompts/workflows/execute.md

[[steps]]
id = "step-2"
title = "Second step"
needs = ["step-1"]                 # DAG dependency
complexity = 5
```

### Variable Interpolation

Formula variables use `{{var_name}}` syntax in all string fields. The `FormulaApplier` performs interpolation before writing tasks to `ai/todo.md`.

### Dependency Resolution

Steps are topologically sorted before task creation. Circular dependencies are detected and raise an error. The `blocked_by` field on each SubTask is computed at apply time from the `needs` list.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/orchestration/formulas` | List available formulas |
| GET | `/v1/orchestration/formulas/{name}` | Get formula definition |
| POST | `/v1/orchestration/formulas/{name}/apply` | Apply formula (create tasks) |
| POST | `/v1/orchestration/batch` | Batch task creation |

---

## 10. GenUI Pipeline

**Path:** `apps/gateway/genui/` (8 files)

The GenUI system converts arbitrary content (markdown documents, research notes, URLs) into structured component-based dashboards through a 3-stage pipeline with SSE streaming.

### Architecture

```
POST /v1/genui/generate
        |
        v
+-------------------+
| ContentAnalyzer   |  Stage 1: Parse + classify content
| (307 LOC)         |  Fast regex path, LLM fallback
+-------------------+
        |
        v ContentAnalysis
+-------------------+
| LayoutSelector    |  Stage 2: Choose layout type
| (200+ LOC)        |  Rule-based, LLM fallback
+-------------------+
        |
        v LayoutType
+-------------------+
| ComponentGenerator|  Stage 3: Yield A2UIComponents
|                   |  Async generator -> SSE stream
+-------------------+
        |
        v SSE stream to client
```

### Stage 1: Content Analyzer

**File:** `apps/gateway/genui/content_analyzer.py` (307 LOC)

**Fast path (regex, no LLM):**

| Signal | Regex Target | Detection |
|--------|-------------|-----------|
| YouTube links | `youtube.com/watch`, `youtu.be/` | YOUTUBE_LINK_REGEX |
| GitHub links | `github.com/user/repo`, `gist.github.com` | GITHUB_LINK_REGEX |
| Markdown links | `[text](url)` | MARKDOWN_LINK_REGEX |
| Plain URLs | `https://`, `www.` | URL_REGEX |
| Code blocks | ` ``` ` fenced blocks | Structural parse |
| Tables | `| col |` markdown tables | Structural parse |
| Sections | `##` headings | Structural parse |

**Heuristic classification (from structural features):**

| Document Type | Primary Signal |
|---------------|---------------|
| `tutorial` | Code blocks + numbered sections |
| `research` | Many links + academic markers |
| `technical_doc` | Code blocks + tables + sections |
| `guide` | Numbered headings + code |
| `notes` | Short content, few links |
| `article` | Prose-dominant, few code blocks |

**LLM fallback:** If heuristics produce low-confidence result, the full content is sent to the configured LLM backend for classification.

### Stage 2: Layout Selector

**File:** `apps/gateway/genui/layout_selector.py` (200+ LOC)

**Rule-based selection:**

| Condition | Layout Type |
|-----------|-------------|
| code_blocks > 5 | `instructional` |
| tables > 2 | `data` |
| media_count > 3 | `media` |
| sections > 10 | `reference` |
| Document type = `research` | `research` |
| Document type = `article` | `article` |
| Default fallback | `general` |

**7 layout types:** `data`, `instructional`, `media`, `reference`, `research`, `article`, `general`

### Stage 3: Component Generator

Async generator that yields `A2UIComponent` objects. These are consumed by the SSE response handler and streamed as JSON events to the client.

**59 valid component types across 11 categories:**

| Category | Count | Example Types |
|----------|-------|---------------|
| Data | 6 | MetricCard, DataTable, ChartBar, ChartLine, ChartPie, Heatmap |
| Summary | 4 | SummaryCard, KeyInsights, Abstract, TLDRBox |
| Instructional | 4 | StepByStep, CodeBlock, CommandSnippet, Callout |
| Lists | 4 | BulletList, NumberedList, ChecklistCard, TagCloud |
| Resources | 4 | ResourceCard, LinkGrid, FileAttachment, DownloadButton |
| People | 4 | AuthorCard, TeamGrid, ContributorList, ProfileBadge |
| News | 4 | NewsCard, HeadlineBlock, TimelineEvent, FeedItem |
| Media | 4 | ImageCard, VideoEmbed, AudioPlayer, GalleryGrid |
| Comparison | 4 | ComparisonTable, ProConList, SideBySide, FeatureMatrix |
| Layout | 7 | GridLayout, SplitPane, TabContainer, Accordion, Modal, Sidebar, Hero |
| Tags | 5 | TopicTag, CategoryBadge, StatusPill, PriorityLabel, DifficultyRating |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/genui/generate` | SSE streaming pipeline (all 3 stages) |
| POST | `/v1/genui/analyze` | Stage 1 only — return ContentAnalysis |
| GET | `/v1/genui/components` | List all 59 valid component types |
| GET | `/v1/genui/layouts` | List all 7 layout types |

---

## 11. MCP Client

**File:** `apps/gateway/mcp/client.py` (223 LOC)

The MCPClient provides the gateway's connection to the MCP Core tool server. All tool executions from the ToolLoop go through this client.

### Protocol

JSON-RPC 2.0 over HTTP POST to `http://127.0.0.1:8100/mcp`

The session must be initialized before tool calls:
```json
{
  "jsonrpc": "2.0",
  "id": "init",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {"name": "kuroryuu-gateway", "version": "1.0"}
  }
}
```

### Methods

| Method | Description | Timeout | Cache |
|--------|-------------|---------|-------|
| `list_tools(force_refresh)` | Fetch available tools | 30s | 30s TTL |
| `call_tool(name, arguments)` | Execute a tool | 20s (configurable) | None |
| `health_check()` | Check MCP server status | 5s | None |

### Tool Cache

`_tools_cache` is an in-memory list of `ToolSchema` objects. Cache is invalidated when `force_refresh=True` or when the 30-second TTL expires. This avoids repeated `tools/list` calls on every request.

### Call Tool Request/Response

```
Request:
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "method": "tools/call",
  "params": {
    "name": "k_bash",
    "arguments": {"command": "ls -la"}
  }
}

Response -> ToolResult:
{
  "content": [{"type": "text", "text": "...output..."}],
  "isError": false
}
```

### PTY Client

**File:** `apps/gateway/mcp/pty_client.py`

A specialized client variant for PTY (pseudo-terminal) operations. Handles streaming output from terminal sessions rather than discrete tool results.

---

## 12. LLM Backends

**Path:** `apps/gateway/llm/`

All backends implement a common `LLMBackend` abstract base. The gateway selects a backend using a health-checked fallback chain.

### Backend Chain

```
get_healthy_backend() tries in order:
    1. LMStudioBackend     (port 1234, OpenAI-compat)
    2. CLIProxyAPIBackend  (port 8317, multi-provider)
    3. Claude (Anthropic)  (direct API)
    4. Devstral            (alternative LLM)

Returns first backend that passes health_check().
Circuit breaker: failed backend is skipped for 60s before retry.
```

### LMStudioBackend

**File:** `apps/gateway/llm/backends/lmstudio.py`

Connects to a locally-running LM Studio instance at `http://127.0.0.1:1234/v1` (configurable via `KURORYUU_LMSTUDIO_BASE_URL`).

**Native tool support detection** — checked against model name substring:

| Model Pattern | Native Tools |
|---------------|-------------|
| `qwen` | Yes |
| `llama-3` | Yes |
| `mistral` | Yes |
| `devstral` | Yes |
| `ministral` | Yes |
| All others | No (XMLToolParser fallback) |

Default model: `mistralai/devstral-small-2-2512`

### CLIProxyAPIBackend

**File:** `apps/gateway/llm/backends/cliproxyapi.py`

Routes requests through a local proxy on port 8317. Supports multiple providers:

| Provider | Notes |
|----------|-------|
| Claude (Anthropic) | Via proxy |
| GPT-4 | Via proxy |
| Gemini | Via proxy |
| GitHub Copilot | Via proxy |
| Kiro | Via proxy |
| Qwen | Via proxy |

### LLM Configuration

```python
class LLMConfig:
    model: Optional[str]           # Override backend default
    temperature: float             # Sampling temperature
    max_tokens: Optional[int]      # Max completion tokens
    conversation_id: Optional[str] # For session tracking
    # Extra backend-specific fields via **extra
```

### Prompt Builders

**Path:** `apps/gateway/prompts/`

Each backend has a dedicated prompt builder that formats messages in the provider's expected schema:

| File | Backend |
|------|---------|
| `anthropic.py` | Claude API format (system as separate param, tool_use blocks) |
| `openai.py` | OpenAI chat completion format |
| `lmstudio.py` | LM Studio (OpenAI-compat with XML tool injection) |
| `devstral.py` | Devstral-specific formatting |
| `registry.py` | Prompt lookup by name (plan, execute, review, validate, prime) |

---

## 13. Hook System

**Path:** `apps/gateway/hooks/`

The hook system provides a plugin-like mechanism to intercept and modify gateway behavior at defined event points. Hooks are particularly critical for the multi-agent architecture — role-gating ensures workers cannot corrupt shared state.

### Components

| File | Role |
|------|------|
| `hooks_types.py` | HookEvent, HookPayload, HookResult, HookAction, HookNote enums |
| `hooks_registry.py` | Load hooks from `ai/hooks.json`, runtime registration |
| `hooks_executor.py` | Execute hooks with timeout, aggregate results, role-gate |
| `hooks_context.py` | Build context payloads for each event type |
| `builtins/auto_todo_generator.py` | Built-in: inject working context every N tool calls |
| `builtins/todo_sot_enforcer.py` | Built-in: enforce ai/todo.md as source-of-truth |

### Role-Gating Logic

**File:** `apps/gateway/hooks/hooks_executor.py`

The `check_hook_for_role()` function enforces that workers cannot execute hooks that mutate shared state:

| Agent Role | Hook Effects | Decision | Action |
|------------|-------------|----------|--------|
| leader | Any | ALLOW | Run hook normally |
| worker | `[]` (empty list) | ALLOW | Safe hook, no mutations |
| worker | Contains mutating effect | SKIP | Log and skip |
| worker | `None` or missing | HARD_ERROR | Fail the request (fail-closed) |

**Mutating effects** (`MUTATING_EFFECTS`):
- `todo_write` — Modifies `ai/todo.md`
- `working_memory_write` — Modifies working memory
- `leader_state_write` — Modifies leader task state

### Event Classification

| Event Set | Contents |
|-----------|---------|
| `MUTABLE_EVENTS` | `user_prompt_submitted`, `tool_result_received`, `chat_message_received` |
| `BLOCKABLE_EVENTS` | `user_authentication`, `tool_call_preparation`, `file_access_request`, `api_call_external` |

Non-blockable events always pass through; hooks can only modify their payload.
Blockable events can be denied by hooks returning action=`deny`.

### Thread Pool

Synchronous hook scripts run in a `ThreadPoolExecutor(max_workers=4)` to avoid blocking the async event loop.

### Auto Todo Generator

**File:** `apps/gateway/hooks/builtins/auto_todo_generator.py`

A built-in hook that fires every 3 tool calls. It reads `ai/todo.md` and injects a formatted working context block into the system prompt, keeping the agent aware of pending tasks without requiring a manual tool call.

### HookAction Structure

```python
class HookAction:
    id: str           # Unique hook identifier
    event: HookEvent  # Which event triggers this hook
    effects: List[str] | None  # Declared side effects (None = unknown)
    # ... command, script, or inline Python to execute
```

---

## 14. Observability

**Path:** `apps/gateway/observability/`

Observability captures all hook events as structured telemetry and makes them available to the Desktop UI via REST and WebSocket.

### SQLite Schema

**Database:** `ai/observability/events.db`

```sql
CREATE TABLE hook_events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source_app       TEXT NOT NULL,      -- "claude", "cursor", "vscode", etc.
    session_id       TEXT NOT NULL,      -- Claude session ID
    agent_id         TEXT,               -- Agent identifier (if applicable)
    hook_event_type  TEXT NOT NULL,      -- "PostToolUse", "UserPromptSubmit", etc.
    tool_name        TEXT,               -- Tool name (for PostToolUse events)
    payload          TEXT NOT NULL,      -- Full event payload JSON
    chat_transcript  TEXT,               -- Conversation context snapshot
    summary          TEXT,               -- AI-generated event summary
    model_name       TEXT,               -- LLM model used
    timestamp        INTEGER NOT NULL    -- Unix timestamp
);

CREATE INDEX idx_obs_session_id  ON hook_events(session_id);
CREATE INDEX idx_obs_timestamp   ON hook_events(timestamp DESC);
CREATE INDEX idx_obs_event_type  ON hook_events(hook_event_type);
CREATE INDEX idx_obs_tool_name   ON hook_events(tool_name);
```

### Retention Policy

| Setting | Value |
|---------|-------|
| MAX_EVENTS | 50,000 |
| RETENTION_HOURS | 24 |
| Cleanup interval | Every 5 minutes (background task) |
| Cleanup strategy | Delete oldest rows when over limit OR older than retention window |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/observability/events` | Ingest a hook event |
| GET | `/v1/observability/events` | Query events (filter by session, type, tool) |
| WS | `/ws/observability` | Live event stream (broadcast on insert) |

### WebSocket Broadcast

On every new event insert, `ObservabilityStorage` broadcasts the event JSON to all connected WebSocket clients. The Desktop UI connects to `/ws/observability` to render the real-time timeline and swim-lane views.

---

## 15. Traffic Monitoring

**Path:** `apps/gateway/traffic/`

Every HTTP request to the gateway is captured by `TrafficMonitoringMiddleware` and stored in SQLite for network visualization. PTY sessions have a separate tracking path.

### OriginValidationMiddleware

**File:** `apps/gateway/traffic/middleware.py`

CSRF protection for state-changing requests.

| Request Type | Decision |
|-------------|---------|
| GET / HEAD / OPTIONS | Always ALLOW |
| Path in BYPASS_PATHS (`/v1/health`, `/login`, `/logout`) | ALLOW |
| Has `X-Kuroryuu-Desktop-Secret` header | ALLOW (endpoint validates secret) |
| Client IP is `127.0.0.1` / `::1` / `localhost` | ALLOW |
| Origin header is `null` (Electron renderer) | ALLOW |
| Origin header contains `localhost` | ALLOW |
| Foreign origin (e.g., `https://evil.com`) | REJECT 403 |

### TrafficMonitoringMiddleware

Captures full request metadata including headers (sensitive headers filtered), body preview (truncated at `MAX_BODY_SIZE`), response status, and timing.

**Endpoint normalization** — variable path segments are replaced with `:id` before storage to enable aggregation:
- UUIDs (`/v1/tasks/a3b4c5d6-...`) -> `/v1/tasks/:id`
- Agent IDs -> `:agent_id`
- Worker IDs -> `:worker_id`

### SQLite Schema

**Database:** `ai/traffic/events.db`

| Setting | Value |
|---------|-------|
| MAX_EVENTS | 10,000 |
| RETENTION_HOURS | 24 |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/traffic/events` | Query traffic events |
| WS | `/ws/traffic` | Live traffic flow stream |
| WS | `/ws/pty-traffic` | Live PTY session traffic stream |

---

## 16. Security Layer

**Path:** `apps/gateway/security/`

### DefenseStatus

```python
@dataclass
class DefenseStatus:
    lockdown_mode: bool
    lockdown_since: Optional[datetime]
    blocked_ip_count: int
    blocked_ips: List[str]
    recent_threats: List[dict]  # Last 10 threat events
```

### Lockdown Mode

`enable_lockdown_mode()` sets a global `_lockdown_mode` flag. While active:
- All non-localhost connections are rejected at the `OriginValidationMiddleware` level
- A broadcast is sent to all connected WebSocket clients

`disable_lockdown_mode()` clears the flag and broadcasts the state change.

### Emergency Shutdown

`emergency_shutdown()`:
1. Broadcasts shutdown event to all WebSocket clients
2. Calls `os._exit(0)` — bypasses Python cleanup, immediate termination

### IP Blocklist

**File:** `apps/gateway/security/blocklist.py`

- `blocklist.block_ip(ip, reason)` — Add to in-memory blocklist
- `blocklist.is_blocked(ip)` — Check before processing request
- `ThreatInfo` dataclass: `ip`, `reason`, `timestamp`, `request_count`

### Threat Intel

**File:** `apps/gateway/security/intel.py`

`gather_intel(request)` collects metadata on suspicious requests and broadcasts updates to connected clients. Used for real-time threat visualization in the Desktop UI.

### Security Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/security/status` | Current DefenseStatus |
| POST | `/v1/security/check` | Manual threat check for an IP |
| GET | `/v1/security/intel` | Recent threat intelligence |

---

## 17. Environment Variables

**File:** `apps/gateway/config.py` (GatewayConfig dataclass)

Configuration is loaded once at startup. `.env` file in `apps/gateway/` is loaded automatically if `python-dotenv` is installed; falls back to project root `.env`.

### Core Server

| Variable | Default | Description |
|----------|---------|-------------|
| `KURORYUU_GATEWAY_HOST` | `127.0.0.1` | Bind address |
| `KURORYUU_GATEWAY_PORT` | `8200` | Listen port |

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `KURORYUU_AUTH_ENABLED` | `true` | Enable web UI auth |
| `KURORYUU_AUTH_USERNAME` | `Guest` | Login username |
| `KURORYUU_AUTH_PASSWORD_HASH` | `""` | SHA256 hex digest of password |
| `KURORYUU_SESSION_TTL_DAYS` | `7` | Session cookie lifetime |

### Network / Proxy

| Variable | Default | Description |
|----------|---------|-------------|
| `KURORYUU_CORS_ORIGINS` | localhost variants + null | Comma-separated allowed origins |
| `KURORYUU_PUBLIC_DOMAIN` | (none) | Public domain for tunnel access |
| `KURORYUU_PROXY_PORT` | `8199` | Tunnel proxy port |
| `KURORYUU_TRUSTED_PROXIES` | (none) | Trusted proxy IPs for X-Forwarded headers |

### LLM / MCP

| Variable | Default | Description |
|----------|---------|-------------|
| `KURORYUU_LLM_BACKEND` | `lmstudio` | Default backend selection |
| `KURORYUU_LMSTUDIO_BASE_URL` | `http://127.0.0.1:1234/v1` | LM Studio endpoint |
| `KURORYUU_LMSTUDIO_MODEL` | `mistralai/devstral-small-2-2512` | Default model |
| `KURORYUU_MCP_URL` | `http://127.0.0.1:8100` | MCP Core server URL |
| `KURORYUU_MCP_TOOL_TIMEOUT` | `20` | MCP tool call timeout (seconds) |
| `KURORYUU_MCP_HEALTH_TIMEOUT` | `5` | MCP health check timeout (seconds) |
| `KURORYUU_MAX_TOOL_CALLS` | `0` | Max tool calls per loop (0=unlimited, clamped 1..50 if set) |

### Hooks

| Variable | Default | Description |
|----------|---------|-------------|
| `KURORYUU_HOOKS_DIR` | `<project_root>/ai` | Path to ai/ directory for hooks and collective patterns |

---

## 18. Data Flow Diagrams

### Chat Request (v2 with Tool Loop)

```
Client
  |
  | POST /v2/chat/stream
  | {messages, tools, system_prompt}
  v
server.py
  |
  | Detect slash command?
  | -> Load harness prompt if yes
  |
  | get_healthy_backend()
  v
LLMBackend (lmstudio / cliproxyapi / claude)
  |
  | ToolLoop.run()
  |   |
  |   | backend.stream() -> delta events
  |   | XMLToolParser (if not native tools)
  |   | MCP.call_tool() for each tool call
  |   | Inject ToolResult -> loop
  |
  | SSE stream of events
  v
Client (delta, tool_start, tool_end, done)
```

### Multi-Agent Orchestration Flow

```
Leader Agent (Claude)
  |
  | POST /v1/orchestration/task
  | {title, description, priority}
  v
leader.py: create_task()
  |
  | detect_specialists_for_task()
  | query_collective_patterns()
  |
  | POST /v1/orchestration/task/{id}/breakdown
  | {subtasks: [...]}
  v
leader.py: breakdown_task()
  |
  | Calculate iteration budgets
  | Load prompt_refs
  | Topological sort (formula DAG)
  | Store SubTasks in TaskStorage
  |
Worker Agent (polls every 2s)
  |
  | GET /v1/orchestration/poll
  v
worker.py: poll()
  |
  | Filter: PENDING, not blocked, capabilities match
  | Return available subtasks
  |
  | POST /v1/orchestration/claim
  v
worker.py: claim_subtask()
  |
  | Status: ASSIGNED, set started_at
  |
  | [Execute work via ToolLoop]
  |
  | POST /v1/orchestration/result
  | {promise: DONE/STUCK/BLOCKED, iterations}
  v
worker.py: report_result()
  |
  | Append IterationRecord
  | _determine_next_action()
  |   -> DONE: Status=COMPLETED, record to collective
  |   -> STUCK: inject_hint() or reassign
  |   -> BLOCKED: escalate_human()
  v
leader.py: receive_result()
  |
  | record_collective_pattern()
  | Check overall task completion
```

### GenUI Pipeline (SSE)

```
Client
  |
  | POST /v1/genui/generate
  | {content: "...", options: {...}}
  v
router.py (StreamingResponse)
  |
  | Stage 1: ContentAnalyzer
  |   parse_markdown() -> structural features
  |   classify_content() -> document_type
  |   [LLM fallback if low confidence]
  |
  | -> SSE: {"event": "analysis", "data": ContentAnalysis}
  |
  | Stage 2: LayoutSelector
  |   rule_based_select() -> layout_type
  |   [LLM fallback if ambiguous]
  |
  | -> SSE: {"event": "layout", "data": LayoutType}
  |
  | Stage 3: ComponentGenerator
  |   async for component in generate():
  |     yield component
  |
  | -> SSE: {"event": "component", "data": A2UIComponent}
  | -> SSE: {"event": "done"}
  v
Client (builds dashboard incrementally)
```

### Hook Execution (Role-Gated)

```
Gateway Event (e.g., PostToolUse)
  |
  | execute_hooks_for_event(event, payload, agent_role)
  v
hooks_executor.py
  |
  | For each HookAction in registry:
  |   check_hook_for_role(hook, agent_role)
  |   |
  |   +-> ALLOW  : run hook in ThreadPoolExecutor
  |   +-> SKIP   : log and skip (worker + mutating effect)
  |   +-> HARD_ERROR: raise, fail request (worker + unknown effects)
  |
  | Aggregate HookResults
  | Apply mutations to payload (if any allowed)
  | Return final payload + notes
  v
Gateway continues with (possibly modified) payload
```

---

*Last updated: 2026-02-17*
*Document covers gateway state as of commit b20eca6 (master branch)*
