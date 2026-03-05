# Kuroryuu Project Builder Design

**Date:** 2026-03-05
**Status:** Approved
**Origin:** Brainstorm session — AI platform lock-in analysis (Nate B Jones transcript) + Auto-Claude architecture study

---

## Problem Statement

Kuroryuu has a full agent orchestration stack (MCP Core, leader/worker system, RAG, memory, checkpoints, observability) but it only manages itself. The PRD-first workflow, prompts, and harness files are all hardcoded to the Kuroryuu monorepo. The goal is to make Kuroryuu a **project builder** that encapsulates and manages other projects — creating, indexing, orchestrating, and building features for any codebase.

This positions Kuroryuu as the open-source alternative to proprietary AI platform lock-in (OpenAI's enterprise context stack), built on MCP as the open protocol layer.

## Prior Art

**Auto-Claude** (`E:\SAS\REPO_CLONES\Auto-Claude-develop`) — the original reference:
- Opens existing git repos as projects
- Spec-driven workflow: describe feature → plan → build in worktree → QA → merge
- Stack/framework auto-detection for dynamic security profiling
- AI-assisted semantic merge with conflict resolution
- `.auto-claude/` folder injected into each project

Kuroryuu already has more sophisticated versions of the orchestration, tooling, memory, and observability. What it lacks is the **project-as-first-class-entity** wrapper.

---

## Architecture

### Project Entity Model

A **Kuroryuu Project** is any folder registered with Kuroryuu. Registration creates two sets of files:

#### In the project folder (dev-facing, git-committed)

| Path | Purpose |
|------|---------|
| `.kuroryuu.json` | Project ID, name, config, MCP Core URL |
| `ai/prds/` | PRDs (north star documents) |
| `ai/todo.md` | Task board (source of truth) |
| `.claude/mcp.json` | MCP Core connection config (auto-generated) |
| `CLAUDE.md` | Generated bootstrap — tells agents about available Kuroryuu tools |

#### External (Kuroryuu-managed, NOT in project repo)

| Path | Purpose |
|------|---------|
| `~/.kuroryuu/projects/{project-id}/checkpoints/` | Session state persistence |
| `~/.kuroryuu/projects/{project-id}/rag_index/` | Per-project BM25 + semantic index |
| `~/.kuroryuu/projects/{project-id}/inbox/` | Maildir inter-agent messaging |
| `~/.kuroryuu/projects/{project-id}/working_memory.json` | Cross-session key-value store |
| `~/.kuroryuu/projects/{project-id}/collective/` | Collective intelligence patterns |
| `~/.kuroryuu/projects/{project-id}/sessions/` | Session lifecycle records |
| `~/.kuroryuu/projects/{project-id}/worklogs/` | Work history |

### MCP Core: Single Instance, Multi-Project

One MCP Core server on port 8100 serves all projects. Project routing is handled per-request:

1. **CWD-based auto-resolution** — agent calls `k_rag(query="auth middleware")`, MCP Core resolves the calling agent's CWD to a registered project and scopes the query to that project's index
2. **Explicit project_id override** — `k_rag(query="auth middleware", project_id="my-api")` for cross-project queries or when CWD can't be inferred
3. **Project registry** — new `k_project` tool manages the registry

#### Project Registry

Stored at `~/.kuroryuu/projects/registry.json`:

```json
{
  "my-app": {
    "id": "my-app",
    "name": "My App",
    "root": "E:\\Projects\\my-app",
    "harness": "~/.kuroryuu/projects/my-app",
    "stack": {"languages": ["typescript", "python"], "frameworks": ["react", "fastapi"]},
    "created": "2026-03-05T10:00:00Z",
    "last_accessed": "2026-03-05T17:00:00Z"
  }
}
```

#### New Tool: k_project

| Action | Purpose |
|--------|---------|
| `register` | Register a folder as a Kuroryuu project |
| `list` | List all registered projects |
| `get` | Get project details by ID or CWD |
| `remove` | Unregister a project (doesn't delete files) |
| `provision` | Generate .claude/mcp.json, CLAUDE.md, ai/ scaffolding |
| `analyze` | Auto-detect stack, frameworks, languages (like Auto-Claude's ProjectAnalyzer) |
| `index` | Build RAG index for the project |

#### paths.py Changes

`get_project_root()` becomes `get_project_root(project_id=None)`:
- If `project_id` provided: look up in registry
- If not: resolve from request context (CWD of calling agent)
- Fallback: current behavior (env var or `__file__` traversal)

All path functions (`get_ai_dir`, `get_harness_dir`, `get_checkpoints_dir`, etc.) gain optional `project_id` parameter with the same resolution chain.

### Agent Spawn Flow

```
Desktop UI: User clicks "Open Project" → selects E:\Projects\my-app
    |
    v
MCP Core: k_project(action="register", root="E:\\Projects\\my-app")
    |
    ├── Analyze stack (languages, frameworks, package managers)
    ├── Generate .kuroryuu.json in project root
    ├── Generate .claude/mcp.json pointing at MCP Core :8100
    ├── Generate CLAUDE.md from template
    ├── Scaffold ai/prds/ and ai/todo.md if missing
    ├── Create external harness at ~/.kuroryuu/projects/{id}/
    └── Build initial RAG index of project codebase
    |
    v
Desktop UI: Spawn Claude Code session
    |
    ├── CWD = E:\Projects\my-app       (NOT Kuroryuu)
    ├── Reads my-app/CLAUDE.md          (project-specific bootstrap)
    ├── MCP Core connected via .claude/mcp.json
    ├── k_rag scoped to my-app/         (project's codebase)
    ├── ai/todo.md = my-app/ai/todo.md  (project's tasks)
    └── Agent works on my-app, powered by Kuroryuu
```

### Generated CLAUDE.md Template

The CLAUDE.md generated in each managed project:

```markdown
# {Project Name}

## Kuroryuu-Managed Project

This project is managed by Kuroryuu. You have access to MCP tools for orchestration,
search, memory, and more.

### Available Tools (via MCP Core)

| Tool | Purpose |
|------|---------|
| k_rag | Search this project's codebase (BM25, semantic, hybrid) |
| k_checkpoint | Save/restore session state |
| k_inbox / k_msg | Message other agents |
| k_memory | Working memory across sessions |
| k_collective | Track success/failure patterns |
| k_session | Session lifecycle |
| k_backup | Project backups |
| k_repo_intel | Codebase analysis reports |

### Project Context

- **PRD:** Read `ai/prds/` for the project north star
- **Tasks:** Read `ai/todo.md` for current work (SOURCE OF TRUTH)
- **Stack:** {auto-detected stack summary}

### Workflow

Follow the PRD-first workflow:
1. Read PRD to understand project mission and scope
2. Check ai/todo.md for pending tasks
3. Plan features that align with PRD
4. Break down into subtasks
5. Execute with checkpoint saves
6. Finalize and report
```

### Desktop UI Changes

| Component | Change |
|-----------|--------|
| **Sidebar** | Add "Projects" section above current nav — project selector dropdown |
| **Project Dashboard** | New route — shows registered projects with status, agents, recent activity |
| **New Project Wizard** | Scaffold new folder + register + optional PRD generation |
| **Import Project** | Point at existing repo → register → analyze → index |
| **Kanban** | Scoped to selected project's `ai/todo.md` |
| **Terminals** | Spawn with CWD = selected project root |
| **RAG status** | Show per-project index stats |

### What Stays the Same

| Component | Why |
|-----------|-----|
| Gateway (port 8200) | Orchestration API is project-agnostic — just routes tasks |
| Leader/worker prompts | Work as-is — they read from `ai/prds/` and `ai/todo.md` which now live in the target project |
| Observability | Swimlanes, gantt, traffic views are agent-scoped not project-scoped |
| Agent teams | Spawn into project CWD instead of Kuroryuu CWD |
| TTS, capture, pccontrol | Utility tools, not project-scoped |
| Command security | Already uses allowlists — can be extended per-project via stack detection |

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Harness location | Hybrid (minimal in-project, bulk external) | PRDs and todo.md are dev-facing and should be committed; indexes and checkpoints are infrastructure |
| MCP Core topology | Single instance, multi-project | No port management, simpler ops, project routing via CWD or explicit param |
| Project detection | CWD-based auto-resolution | Agent doesn't need to know project IDs — MCP Core resolves from working directory |
| CLAUDE.md generation | Template-based, minimal | Agents get tool awareness without Kuroryuu internals leaking into project context |
| Stack detection | Auto-analyze on register | Like Auto-Claude's ProjectAnalyzer — detect languages, frameworks, package managers for dynamic security and context |

---

## Migration Path

Kuroryuu itself becomes the first registered project:

1. Register `E:\SAS\CLONE\Kuroryuu-master` as project `kuroryuu`
2. Existing `ai/` directory already has the right structure
3. Existing MCP Core behavior is the default when no project_id and CWD matches Kuroryuu
4. Zero breaking changes — current workflows continue working

New projects get provisioned through the Desktop UI or `k_project(action="register")`.

---

## Out of Scope (Future)

- Git worktree isolation per feature (Auto-Claude pattern) — add later
- AI-assisted semantic merge — add later
- Cross-project RAG federation ("what did we decide about auth in the other repo?") — add later
- `pip install kuroryuu-mcp` standalone packaging — add later
- Multi-user/team project sharing — add later

---

## Implementation Sequence (High Level)

1. **k_project tool** — register, list, get, remove, provision, analyze, index
2. **paths.py refactor** — project-aware path resolution with CWD auto-detection
3. **Per-project RAG indexes** — k_rag scoped to project harness directory
4. **Per-project checkpoints/inbox/memory** — route to `~/.kuroryuu/projects/{id}/`
5. **CLAUDE.md template generator** — produce project-specific bootstrap
6. **Desktop UI: Project selector** — sidebar project list, switching, dashboard
7. **Desktop UI: New/Import project wizard** — scaffold, register, analyze, index
8. **Self-register Kuroryuu** — migration path, zero breaking changes
