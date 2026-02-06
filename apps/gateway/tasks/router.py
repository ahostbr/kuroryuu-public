"""Task Management Router - Single integration point for all task creation.

This router provides a unified endpoint for creating tasks in ai/todo.md,
eliminating race conditions between Desktop UI and Claude Code's TaskCreate.

Also serves sidecar metadata from ai/task-meta.json for rich task details
(description, priority, category, worklog, checkpoint, etc.).
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/v1/tasks", tags=["tasks"])


# ============================================================================
# Path Helpers
# ============================================================================

def _get_todo_path() -> Path:
    """Get the path to ai/todo.md based on project root."""
    project_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if project_root:
        return Path(project_root) / "ai" / "todo.md"

    # Fall back to relative path from this file
    # __file__ is apps/gateway/tasks/router.py -> go up 4 levels to project root
    return Path(__file__).resolve().parent.parent.parent.parent / "ai" / "todo.md"


def _get_meta_path() -> Path:
    """Get the path to ai/task-meta.json based on project root."""
    project_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if project_root:
        return Path(project_root) / "ai" / "task-meta.json"

    return Path(__file__).resolve().parent.parent.parent.parent / "ai" / "task-meta.json"


# ============================================================================
# Sidecar Helpers
# ============================================================================

def _read_meta() -> dict:
    """Read ai/task-meta.json, return empty structure if missing or corrupt."""
    meta_path = _get_meta_path()
    try:
        # utf-8-sig strips BOM if present (PowerShell may write BOM)
        with meta_path.open("r", encoding="utf-8-sig") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {"version": 1, "tasks": {}}


def _write_meta_atomic(meta: dict) -> None:
    """Write ai/task-meta.json atomically (temp file + os.replace)."""
    meta_path = _get_meta_path()
    meta_path.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(
        dir=str(meta_path.parent),
        prefix=f".{meta_path.name}.tmp_",
        suffix=".json",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, str(meta_path))
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _merge_sidecar(tasks: list[dict], meta_tasks: dict) -> None:
    """Merge sidecar metadata fields into task dicts (mutates in place)."""
    sidecar_keys = (
        "description", "priority", "category", "complexity",
        "worklog", "checkpoint", "createdAt", "updatedAt", "contextFiles",
    )
    for task in tasks:
        sidecar = meta_tasks.get(task["id"])
        if sidecar:
            for key in sidecar_keys:
                val = sidecar.get(key)
                if val is not None:
                    task[key] = val


def _parse_tasks_from_content(content: str) -> list[dict]:
    """Parse Kanban tasks from todo.md content (not Claude Tasks section)."""
    lines = content.split("\n")
    tasks: list[dict] = []
    current_section: str | None = None

    section_map = {
        "## Backlog": "backlog",
        "## Active": "active",
        "## Delayed": "delayed",
        "## Done": "done",
    }

    for line in lines:
        stripped = line.strip()

        if stripped in section_map:
            current_section = section_map[stripped]
            continue

        # Stop at Claude Tasks section
        if stripped.startswith("## Claude Tasks"):
            current_section = None
            continue

        if current_section and stripped.startswith("- ["):
            match = re.match(r"^- \[([ x~])\] ([A-Z0-9]+):\s+(.+)$", stripped)
            if match:
                checkbox, task_id, rest = match.groups()

                tags = re.findall(r"#(\S+)", rest)
                # Remove tags and assignee from title
                title = re.sub(r"#\S+", "", rest)
                title = re.sub(r"@@\S+", "", title).strip()

                status = current_section
                if checkbox == "x":
                    status = "done"
                elif checkbox == "~":
                    status = "active"

                tasks.append({
                    "id": task_id,
                    "title": title,
                    "status": status,
                    "section": current_section,
                    "tags": tags if tags else [],
                })

    return tasks


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateTaskRequest(BaseModel):
    """Request body for creating a task."""
    title: str
    description: Optional[str] = ""
    status: str = "backlog"  # backlog, active, delayed, done
    priority: Optional[str] = "medium"
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    from_session_id: Optional[str] = None


class TaskResponse(BaseModel):
    """Response for task operations."""
    ok: bool
    task_id: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


class TaskItem(BaseModel):
    """Single task item with merged sidecar metadata."""
    id: str
    title: str
    status: str
    section: str
    tags: List[str] = []
    # Sidecar fields (from ai/task-meta.json)
    description: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    complexity: Optional[str] = None
    worklog: Optional[str] = None
    checkpoint: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    contextFiles: Optional[List[str]] = None


class ListTasksResponse(BaseModel):
    """Response for listing tasks."""
    ok: bool
    tasks: List[TaskItem] = []
    error: Optional[str] = None


class UpdateTaskMetaRequest(BaseModel):
    """Request body for updating task sidecar metadata."""
    description: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    complexity: Optional[str] = None
    worklog: Optional[str] = None
    checkpoint: Optional[str] = None
    contextFiles: Optional[List[str]] = None


class TaskMetaResponse(BaseModel):
    """Response for single-task and metadata operations."""
    ok: bool
    task_id: Optional[str] = None
    meta: Optional[dict] = None
    error: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/create", response_model=TaskResponse)
async def create_task(request: CreateTaskRequest) -> TaskResponse:
    """Create a task in ai/todo.md and write metadata to ai/task-meta.json."""
    todo_path = _get_todo_path()

    try:
        # Ensure parent directory exists
        todo_path.parent.mkdir(parents=True, exist_ok=True)

        # Read existing content or create default template
        if todo_path.exists():
            content = todo_path.read_text(encoding="utf-8")
        else:
            content = "# Tasks\n\n## Backlog\n\n## Active\n\n## Delayed\n\n## Done\n"

        # Normalize line endings (fix Windows CRLF issue)
        content = content.replace("\r\n", "\n").replace("\r", "\n")
        content = content.lstrip("\ufeff")

        lines = content.split("\n")

        # Generate unique task ID based on timestamp
        task_id = f"T{datetime.now().strftime('%H%M%S')}"

        # Build task line (title only, description goes to sidecar)
        tags_str = ""
        if request.tags:
            tags_str = " " + " ".join(f"#{t}" for t in request.tags)

        task_line = f"- [ ] {task_id}: {request.title}{tags_str}"

        # Map status to section header
        section_map = {
            "backlog": "## Backlog",
            "active": "## Active",
            "delayed": "## Delayed",
            "done": "## Done",
        }
        section_header = section_map.get(request.status.lower(), "## Backlog")

        # Find section and insert task
        inserted = False
        for i, line in enumerate(lines):
            if line.strip() == section_header:
                lines.insert(i + 1, task_line)
                inserted = True
                break

        if not inserted:
            return TaskResponse(
                ok=False,
                error=f"Section not found: {section_header}",
            )

        # Write back with consistent LF line endings
        todo_path.write_text("\n".join(lines), encoding="utf-8")

        # Write sidecar metadata
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        meta = _read_meta()
        tasks = meta.setdefault("tasks", {})
        entry: dict = {"createdAt": now, "updatedAt": now}

        if request.description:
            entry["description"] = request.description
        if request.priority:
            entry["priority"] = request.priority
        if request.category:
            entry["category"] = request.category

        tasks[task_id] = entry
        _write_meta_atomic(meta)

        return TaskResponse(
            ok=True,
            task_id=task_id,
            message=f"Created task {task_id}",
        )

    except Exception as e:
        return TaskResponse(ok=False, error=str(e))


@router.get("/list", response_model=ListTasksResponse)
async def list_tasks() -> ListTasksResponse:
    """List all tasks from ai/todo.md merged with sidecar metadata."""
    todo_path = _get_todo_path()

    try:
        if not todo_path.exists():
            return ListTasksResponse(ok=True, tasks=[])

        content = todo_path.read_text(encoding="utf-8")
        content = content.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")

        tasks = _parse_tasks_from_content(content)

        # Merge sidecar metadata
        meta = _read_meta()
        _merge_sidecar(tasks, meta.get("tasks", {}))

        return ListTasksResponse(ok=True, tasks=tasks)

    except Exception as e:
        return ListTasksResponse(ok=False, error=str(e))


@router.get("/health")
async def tasks_health():
    """Health check for tasks endpoint."""
    todo_path = _get_todo_path()
    return {
        "ok": True,
        "todo_path": str(todo_path),
        "exists": todo_path.exists(),
    }


@router.get("/{task_id}", response_model=TaskMetaResponse)
async def get_task(task_id: str) -> TaskMetaResponse:
    """Get a single task from todo.md merged with sidecar metadata."""
    todo_path = _get_todo_path()

    try:
        if not todo_path.exists():
            return TaskMetaResponse(ok=False, error="todo.md not found")

        content = todo_path.read_text(encoding="utf-8")
        content = content.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")

        tasks = _parse_tasks_from_content(content)
        task_data = next((t for t in tasks if t["id"] == task_id), None)

        if not task_data:
            return TaskMetaResponse(ok=False, error=f"Task {task_id} not found in todo.md")

        # Merge sidecar
        meta = _read_meta()
        meta_tasks = meta.get("tasks", {})
        _merge_sidecar([task_data], meta_tasks)

        return TaskMetaResponse(ok=True, task_id=task_id, meta=task_data)

    except Exception as e:
        return TaskMetaResponse(ok=False, error=str(e))


@router.put("/{task_id}/meta", response_model=TaskMetaResponse)
async def update_task_meta(task_id: str, request: UpdateTaskMetaRequest) -> TaskMetaResponse:
    """Update sidecar metadata for a task (does NOT modify todo.md)."""
    try:
        meta = _read_meta()
        tasks = meta.setdefault("tasks", {})
        entry = tasks.setdefault(task_id, {})

        # Merge updates (exclude None values to avoid clearing fields)
        updates = request.model_dump(exclude_none=True)
        entry.update(updates)

        # Auto-set updatedAt
        entry["updatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

        # Preserve createdAt (set once)
        if "createdAt" not in entry:
            entry["createdAt"] = entry["updatedAt"]

        _write_meta_atomic(meta)

        return TaskMetaResponse(ok=True, task_id=task_id, meta=entry)

    except Exception as e:
        return TaskMetaResponse(ok=False, error=str(e))
