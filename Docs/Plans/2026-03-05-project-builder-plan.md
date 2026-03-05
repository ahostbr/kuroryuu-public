# Project Builder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Kuroryuu a project builder that encapsulates other projects, with single MCP Core serving multiple projects via CWD-based routing.

**Architecture:** Project registry at `~/.kuroryuu/projects/registry.json` maps project IDs to root paths. `paths.py` becomes project-aware — all path functions accept optional `project_id`, auto-resolved from request context when omitted. Each project gets in-repo scaffolding (`.kuroryuu.json`, `ai/`, `CLAUDE.md`) and external harness (`~/.kuroryuu/projects/{id}/`). Existing single-project behavior is the default fallback — zero breaking changes.

**Tech Stack:** Python (FastAPI, MCP Core), TypeScript/React (Electron Desktop)

**Design Doc:** `Docs/Plans/2026-03-05-project-builder-design.md`

---

## Task 1: Project Registry Module

The foundation everything else depends on. A new module that manages the mapping of project IDs to filesystem paths.

**Files:**
- Create: `apps/mcp_core/project_registry.py`
- Test: `apps/mcp_core/test-results/test_project_registry.py`

**Step 1: Write the failing test**

```python
# apps/mcp_core/test-results/test_project_registry.py
import json
import tempfile
from pathlib import Path
import pytest

# Will import from project_registry once created
from project_registry import ProjectRegistry


@pytest.fixture
def registry(tmp_path):
    """Create a registry with a temp storage path."""
    reg_file = tmp_path / "registry.json"
    return ProjectRegistry(registry_path=reg_file)


@pytest.fixture
def sample_project(tmp_path):
    """Create a sample project directory."""
    project_dir = tmp_path / "my-app"
    project_dir.mkdir()
    (project_dir / "package.json").write_text('{"name": "my-app"}')
    return project_dir


def test_register_project(registry, sample_project):
    result = registry.register(project_id="my-app", root=sample_project)
    assert result["ok"] is True
    assert result["project"]["id"] == "my-app"
    assert result["project"]["root"] == str(sample_project)


def test_list_projects(registry, sample_project):
    registry.register("my-app", sample_project)
    result = registry.list_projects()
    assert len(result) == 1
    assert result[0]["id"] == "my-app"


def test_get_project(registry, sample_project):
    registry.register("my-app", sample_project)
    result = registry.get("my-app")
    assert result is not None
    assert result["id"] == "my-app"


def test_get_missing_project(registry):
    result = registry.get("nonexistent")
    assert result is None


def test_resolve_from_cwd(registry, sample_project):
    registry.register("my-app", sample_project)
    result = registry.resolve_from_path(sample_project)
    assert result is not None
    assert result["id"] == "my-app"


def test_resolve_from_subdirectory(registry, sample_project):
    registry.register("my-app", sample_project)
    subdir = sample_project / "src" / "components"
    subdir.mkdir(parents=True)
    result = registry.resolve_from_path(subdir)
    assert result is not None
    assert result["id"] == "my-app"


def test_remove_project(registry, sample_project):
    registry.register("my-app", sample_project)
    registry.remove("my-app")
    assert registry.get("my-app") is None


def test_registry_persistence(tmp_path, sample_project):
    reg_file = tmp_path / "registry.json"
    reg1 = ProjectRegistry(registry_path=reg_file)
    reg1.register("my-app", sample_project)

    reg2 = ProjectRegistry(registry_path=reg_file)
    assert reg2.get("my-app") is not None


def test_duplicate_register_updates(registry, sample_project):
    registry.register("my-app", sample_project, name="Old Name")
    registry.register("my-app", sample_project, name="New Name")
    result = registry.get("my-app")
    assert result["name"] == "New Name"


def test_harness_dir(registry, sample_project):
    registry.register("my-app", sample_project)
    project = registry.get("my-app")
    harness = Path(project["harness"])
    assert "my-app" in str(harness)
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mcp_core && python -m pytest test-results/test_project_registry.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'project_registry'`

**Step 3: Implement ProjectRegistry**

```python
# apps/mcp_core/project_registry.py
"""
Project Registry — maps project IDs to filesystem paths.

Stores registry at ~/.kuroryuu/projects/registry.json.
Each project has:
  - id: unique string identifier
  - name: human-readable name
  - root: absolute path to project directory
  - harness: absolute path to external harness directory
  - stack: detected technology stack (optional)
  - created: ISO timestamp
  - last_accessed: ISO timestamp
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def _default_registry_path() -> Path:
    home = Path.home()
    return home / ".kuroryuu" / "projects" / "registry.json"


def _default_harness_root() -> Path:
    return Path.home() / ".kuroryuu" / "projects"


class ProjectRegistry:
    def __init__(
        self,
        registry_path: Optional[Path] = None,
        harness_root: Optional[Path] = None,
    ):
        self._path = registry_path or _default_registry_path()
        self._harness_root = harness_root or _default_harness_root()
        self._projects: Dict[str, Dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            with open(self._path, encoding="utf-8") as f:
                self._projects = json.load(f)

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self._projects, f, indent=2)
        tmp.replace(self._path)

    def register(
        self,
        project_id: str,
        root: Path,
        name: Optional[str] = None,
        stack: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        root = Path(root).resolve()
        harness = self._harness_root / project_id

        existing = self._projects.get(project_id)
        project = {
            "id": project_id,
            "name": name or (existing or {}).get("name") or root.name,
            "root": str(root),
            "harness": str(harness),
            "stack": stack or (existing or {}).get("stack") or {},
            "created": (existing or {}).get("created") or now,
            "last_accessed": now,
        }
        self._projects[project_id] = project
        self._save()
        return {"ok": True, "project": project}

    def list_projects(self) -> List[Dict[str, Any]]:
        return list(self._projects.values())

    def get(self, project_id: str) -> Optional[Dict[str, Any]]:
        project = self._projects.get(project_id)
        if project:
            project["last_accessed"] = datetime.now(timezone.utc).isoformat()
            self._save()
        return project

    def remove(self, project_id: str) -> bool:
        if project_id in self._projects:
            del self._projects[project_id]
            self._save()
            return True
        return False

    def resolve_from_path(self, path: Path) -> Optional[Dict[str, Any]]:
        """Resolve a project from a filesystem path (CWD or subdirectory)."""
        path = Path(path).resolve()
        for project in self._projects.values():
            project_root = Path(project["root"]).resolve()
            try:
                path.relative_to(project_root)
                project["last_accessed"] = datetime.now(timezone.utc).isoformat()
                self._save()
                return project
            except ValueError:
                continue
        return None
```

**Step 4: Run test to verify it passes**

Run: `cd apps/mcp_core && python -m pytest test-results/test_project_registry.py -v`
Expected: All 11 tests PASS

**Step 5: Commit**

```bash
git add apps/mcp_core/project_registry.py apps/mcp_core/test-results/test_project_registry.py
git commit -m "feat: add ProjectRegistry module for multi-project support"
```

---

## Task 2: Refactor paths.py for Multi-Project

Make all path functions accept optional `project_id`. When provided, resolve paths from the project registry. When omitted, use current behavior (env var / `__file__` fallback) — zero breaking changes.

**Files:**
- Modify: `apps/mcp_core/paths.py`
- Test: `apps/mcp_core/test-results/test_paths_multiproject.py`

**Step 1: Write the failing test**

```python
# apps/mcp_core/test-results/test_paths_multiproject.py
import tempfile
from pathlib import Path
import pytest

from project_registry import ProjectRegistry
from paths import (
    get_project_root,
    get_ai_dir,
    get_harness_dir,
    get_working_dir,
    get_checkpoints_dir,
    get_todo_path,
    set_registry,
)


@pytest.fixture
def setup_registry(tmp_path):
    reg_file = tmp_path / "registry.json"
    registry = ProjectRegistry(registry_path=reg_file, harness_root=tmp_path / "harness")
    project_dir = tmp_path / "my-app"
    project_dir.mkdir()
    (project_dir / "ai").mkdir()
    registry.register("my-app", project_dir)
    set_registry(registry)
    yield registry, project_dir
    set_registry(None)  # cleanup


def test_get_project_root_with_id(setup_registry):
    registry, project_dir = setup_registry
    root = get_project_root(project_id="my-app")
    assert root == project_dir.resolve()


def test_get_ai_dir_with_id(setup_registry):
    registry, project_dir = setup_registry
    ai = get_ai_dir(project_id="my-app")
    assert ai == project_dir.resolve() / "ai"


def test_get_harness_dir_with_id(setup_registry):
    registry, project_dir = setup_registry
    harness = get_harness_dir(project_id="my-app")
    assert "my-app" in str(harness)


def test_get_checkpoints_dir_with_id(setup_registry):
    registry, project_dir = setup_registry
    cp = get_checkpoints_dir(project_id="my-app")
    assert "checkpoints" in str(cp)


def test_get_todo_path_with_id(setup_registry):
    registry, project_dir = setup_registry
    todo = get_todo_path(project_id="my-app")
    assert todo == project_dir.resolve() / "ai" / "todo.md"


def test_default_behavior_unchanged():
    """Calling without project_id uses existing behavior."""
    root = get_project_root()
    assert root.exists()  # Should resolve to Kuroryuu root or env var
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mcp_core && python -m pytest test-results/test_paths_multiproject.py -v`
Expected: FAIL — `ImportError: cannot import name 'set_registry'`

**Step 3: Refactor paths.py**

Add `project_id` parameter to all path functions. Add `set_registry()` to inject the registry instance. When `project_id` is provided, look up paths from registry. When omitted, use existing behavior.

Key changes to `paths.py`:
- Remove `@lru_cache(maxsize=1)` from `get_project_root()` (can't cache with variable project_id)
- Add `_registry: Optional[ProjectRegistry] = None` module-level
- Add `set_registry(registry)` function
- Add `project_id: Optional[str] = None` parameter to all public functions
- When `project_id` is set and registry exists: resolve from registry
- For `get_harness_dir(project_id)`: return external harness path (not `ai/` inside project)
- For `get_ai_dir(project_id)`: return `project_root / "ai"` (lives in project)
- For `get_checkpoints_dir(project_id)`: return `harness_dir / "checkpoints"` (external)

**Step 4: Run tests**

Run: `cd apps/mcp_core && python -m pytest test-results/test_paths_multiproject.py -v`
Expected: All 6 tests PASS

**Step 5: Run existing tests to verify no breakage**

Run: `cd apps/mcp_core && python -m pytest test-results/ -v`
Expected: All tests PASS (existing behavior unchanged when project_id omitted)

**Step 6: Commit**

```bash
git add apps/mcp_core/paths.py apps/mcp_core/test-results/test_paths_multiproject.py
git commit -m "feat: make paths.py project-aware with optional project_id routing"
```

---

## Task 3: k_project Tool

New MCP tool for project lifecycle management.

**Files:**
- Create: `apps/mcp_core/tools_project.py`
- Modify: `apps/mcp_core/server.py` (register the tool)

**Step 1: Write tools_project.py**

Implements actions:
- `register` — register a folder as a Kuroryuu project
- `list` — list all registered projects
- `get` — get project by ID or resolve from CWD path
- `remove` — unregister a project
- `provision` — generate `.kuroryuu.json`, `.claude/mcp.json`, `CLAUDE.md`, scaffold `ai/`
- `analyze` — auto-detect stack (languages, frameworks, package managers)
- `index` — build RAG index for the project

The `provision` action generates:
1. `.kuroryuu.json` in project root (project ID, MCP URL)
2. `.claude/mcp.json` pointing at MCP Core port 8100
3. `CLAUDE.md` from template (tool catalog, project context)
4. `ai/prds/` directory (empty, for PRDs)
5. `ai/todo.md` (empty task board with header)
6. External harness directories at `~/.kuroryuu/projects/{id}/`

The `analyze` action scans for:
- `package.json` → Node.js, frameworks (react, next, express, etc.)
- `pyproject.toml` / `requirements.txt` → Python, frameworks (fastapi, django, flask)
- `go.mod` → Go
- `Cargo.toml` → Rust
- `*.sln` / `*.csproj` → .NET
- Detects package manager (npm, pnpm, yarn, pip, poetry, cargo)

**Step 2: Register in server.py**

Add to imports:
```python
from tools_project import register_project_tools
```

Add to tool registration section:
```python
register_project_tools(registry)
```

**Step 3: Test via curl**

```bash
# Register a project
curl -X POST http://127.0.0.1:8100/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"k_project","arguments":{"action":"register","root":"E:\\Projects\\my-app"}}}'

# List projects
curl -X POST http://127.0.0.1:8100/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"k_project","arguments":{"action":"list"}}}'
```

**Step 4: Commit**

```bash
git add apps/mcp_core/tools_project.py apps/mcp_core/server.py
git commit -m "feat: add k_project tool for project lifecycle management"
```

---

## Task 4: Wire Registry into MCP Core Server Startup

Initialize the ProjectRegistry singleton at server startup and inject it into paths.py.

**Files:**
- Modify: `apps/mcp_core/server.py` (startup event)

**Step 1: Add registry initialization**

In `server.py` startup:
```python
from project_registry import ProjectRegistry
from paths import set_registry

# Initialize project registry
_project_registry = ProjectRegistry()
set_registry(_project_registry)
```

This ensures all path functions can resolve project-scoped paths from the first request onward.

**Step 2: Self-register Kuroryuu**

At startup, auto-register the Kuroryuu repo itself:
```python
kuroryuu_root = get_project_root()  # existing fallback
_project_registry.register(
    project_id="kuroryuu",
    root=kuroryuu_root,
    name="Kuroryuu",
)
```

This is the migration path — existing behavior works because Kuroryuu is now a registered project.

**Step 3: Smoke test**

Run: `cd apps/mcp_core && python server.py`
Verify: Server starts, `/tools` endpoint lists `k_project`, calling `k_project(action="list")` shows `kuroryuu` registered.

**Step 4: Commit**

```bash
git add apps/mcp_core/server.py
git commit -m "feat: initialize project registry at server startup, self-register Kuroryuu"
```

---

## Task 5: CLAUDE.md Template Generator

Create the template system that generates project-specific CLAUDE.md files.

**Files:**
- Create: `apps/mcp_core/project_templates.py`

**Step 1: Implement template generator**

```python
# apps/mcp_core/project_templates.py
"""Templates for provisioning new Kuroryuu-managed projects."""

def generate_claude_md(project_name: str, stack_summary: str = "") -> str:
    """Generate a CLAUDE.md for a managed project."""
    ...

def generate_kuroryuu_json(project_id: str, mcp_port: int = 8100) -> dict:
    """Generate .kuroryuu.json content."""
    ...

def generate_mcp_json(mcp_port: int = 8100) -> dict:
    """Generate .claude/mcp.json content."""
    ...

def generate_todo_md(project_name: str) -> str:
    """Generate initial ai/todo.md."""
    ...
```

The `generate_claude_md` function produces the template from the design doc — tool catalog, project context, workflow instructions. Stack summary is injected from the `analyze` action.

**Step 2: Wire into k_project provision action**

The `provision` action in `tools_project.py` calls these generators and writes the files.

**Step 3: Test by provisioning a test project**

Create a temp directory, call `k_project(action="provision", root="/tmp/test-project", project_id="test")`, verify all files are created with correct content.

**Step 4: Commit**

```bash
git add apps/mcp_core/project_templates.py
git commit -m "feat: add CLAUDE.md and project scaffolding template generator"
```

---

## Task 6: Per-Project RAG Scoping

Make k_rag use the project's harness directory for its index, not the global WORKING/rag_index.

**Files:**
- Modify: `apps/mcp_core/tools_rag.py` — index/query paths resolve via `get_project_root(project_id)`
- Modify: `apps/mcp_core/paths.py` — add `get_rag_index_dir(project_id)` that routes to `~/.kuroryuu/projects/{id}/rag_index/`

**Step 1: Add `get_rag_index_dir` to paths.py**

When project_id is provided, return `harness_dir / "rag_index"`. When omitted, return existing `WORKING/rag_index`.

**Step 2: Update tools_rag.py**

Replace hardcoded `WORKING/rag_index` references with `get_rag_index_dir(project_id)`. The `project_id` comes from the tool arguments (optional, auto-resolved if omitted).

**Step 3: Test**

Register a test project, call `k_rag(action="index", project_id="test")`, verify index is created at `~/.kuroryuu/projects/test/rag_index/` not `WORKING/rag_index`.

**Step 4: Commit**

```bash
git add apps/mcp_core/tools_rag.py apps/mcp_core/paths.py
git commit -m "feat: per-project RAG index scoping"
```

---

## Task 7: Per-Project Checkpoint/Inbox/Memory Scoping

Route checkpoint, inbox, and working memory to per-project harness directories.

**Files:**
- Modify: `apps/mcp_core/tools_checkpoint.py`
- Modify: `apps/mcp_core/tools_inbox.py`
- Modify: `apps/mcp_core/tools_working_memory.py`
- Modify: `apps/mcp_core/paths.py` — add `get_inbox_dir(project_id)`, `get_memory_path(project_id)`

**Step 1: Add new path functions**

```python
def get_inbox_dir(project_id=None):
    if project_id and _registry:
        return Path(_registry.get(project_id)["harness"]) / "inbox"
    return get_project_root() / "ai" / "inbox"

def get_memory_path(project_id=None):
    if project_id and _registry:
        return Path(_registry.get(project_id)["harness"]) / "working_memory.json"
    return get_ai_dir() / "working_memory.json"
```

**Step 2: Update tool files**

Each tool's path resolution changes from `get_project_root() / "ai" / "inbox"` to `get_inbox_dir(project_id)` etc. The `project_id` parameter is added to tool argument schemas as optional.

**Step 3: Verify existing behavior unchanged**

Call tools without `project_id` — should use existing paths. Call with `project_id="kuroryuu"` — should resolve to same paths (self-registered).

**Step 4: Commit**

```bash
git add apps/mcp_core/tools_checkpoint.py apps/mcp_core/tools_inbox.py \
  apps/mcp_core/tools_working_memory.py apps/mcp_core/paths.py
git commit -m "feat: per-project scoping for checkpoint, inbox, and working memory"
```

---

## Task 8: Desktop UI — Project Selector (Future)

> This task is documented for planning but implementation is deferred until the backend (Tasks 1-7) is stable and tested.

**Files:**
- Modify: `apps/desktop/src/renderer/App.tsx` — add project selector to sidebar
- Create: `apps/desktop/src/renderer/stores/project-store.ts` — Zustand store for project state
- Create: `apps/desktop/src/renderer/components/ProjectSelector.tsx`
- Create: `apps/desktop/src/main/ipc/project.ts` — IPC handlers for project operations
- Modify: `apps/desktop/src/main/index.ts` — register project IPC domain

Key behaviors:
- Dropdown in sidebar showing registered projects
- Switching projects updates CWD for terminal spawns
- "New Project" and "Import Project" buttons
- Kanban scoped to selected project's `ai/todo.md`
- Agent terminals spawn with CWD = selected project root

---

## Dependency Graph

```
Task 1: ProjectRegistry module
    |
    v
Task 2: paths.py refactor (depends on Task 1)
    |
    v
Task 3: k_project tool (depends on Task 1)
    |
    v
Task 4: Server startup wiring (depends on Tasks 1, 2, 3)
    |
    v
Task 5: Template generator (depends on Task 3)
    |
    +---> Task 6: Per-project RAG (depends on Task 2)
    |
    +---> Task 7: Per-project checkpoint/inbox/memory (depends on Task 2)
    |
    v
Task 8: Desktop UI (depends on Tasks 1-7, deferred)
```

Tasks 5, 6, and 7 can run in parallel after Task 4 is complete.
