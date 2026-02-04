"""Task Management Router - Single integration point for all task creation.

This router provides a unified endpoint for creating tasks in ai/todo.md,
eliminating race conditions between Desktop UI and Claude Code's TaskCreate.
"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/v1/tasks", tags=["tasks"])


def _get_todo_path() -> Path:
    """Get the path to ai/todo.md based on project root."""
    # Try environment variable first
    project_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if project_root:
        return Path(project_root) / "ai" / "todo.md"

    # Fall back to relative path from this file
    # __file__ is apps/gateway/tasks/router.py -> go up 4 levels to project root
    return Path(__file__).resolve().parent.parent.parent.parent / "ai" / "todo.md"


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


class ListTasksResponse(BaseModel):
    """Response for listing tasks."""
    ok: bool
    tasks: List[dict] = []
    error: Optional[str] = None


@router.post("/create", response_model=TaskResponse)
async def create_task(request: CreateTaskRequest) -> TaskResponse:
    """Create a task - single integration point for all task creation.

    This endpoint:
    - Normalizes line endings to prevent section matching issues
    - Generates unique task IDs
    - Adds tasks to the appropriate section in ai/todo.md
    """
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
        content = content.replace('\r\n', '\n').replace('\r', '\n')
        # Remove BOM if present
        content = content.lstrip('\ufeff')

        lines = content.split('\n')

        # Generate unique task ID based on timestamp
        task_id = f"T{datetime.now().strftime('%H%M%S')}"

        # Build task line
        tags_str = ''
        if request.tags:
            tags_str = ' ' + ' '.join(f'#{t}' for t in request.tags)

        task_line = f"- [ ] {task_id}: {request.title}{tags_str}"

        # Map status to section header
        section_map = {
            "backlog": "## Backlog",
            "active": "## Active",
            "delayed": "## Delayed",
            "done": "## Done"
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
                error=f"Section not found: {section_header}"
            )

        # Write back with consistent LF line endings
        todo_path.write_text('\n'.join(lines), encoding="utf-8")

        return TaskResponse(
            ok=True,
            task_id=task_id,
            message=f"Created task {task_id}"
        )

    except Exception as e:
        return TaskResponse(ok=False, error=str(e))


@router.get("/list", response_model=ListTasksResponse)
async def list_tasks() -> ListTasksResponse:
    """List all tasks from ai/todo.md."""
    todo_path = _get_todo_path()

    try:
        if not todo_path.exists():
            return ListTasksResponse(ok=True, tasks=[])

        content = todo_path.read_text(encoding="utf-8")
        # Normalize line endings
        content = content.replace('\r\n', '\n').replace('\r', '\n').lstrip('\ufeff')

        lines = content.split('\n')
        tasks = []
        current_section = None

        section_map = {
            "## Backlog": "backlog",
            "## Active": "active",
            "## Delayed": "delayed",
            "## Done": "done"
        }

        for line in lines:
            stripped = line.strip()

            # Track current section
            if stripped in section_map:
                current_section = section_map[stripped]
                continue

            # Parse task lines
            if current_section and stripped.startswith("- ["):
                # Match: - [ ] T001: description #tag1 #tag2
                import re
                match = re.match(r'^- \[([ x~])\] ([A-Z0-9]+):\s+(.+)$', stripped)
                if match:
                    checkbox, task_id, rest = match.groups()

                    # Extract tags
                    tags = re.findall(r'#(\S+)', rest)
                    title = re.sub(r'#\S+', '', rest).strip()

                    # Determine status from checkbox
                    status = current_section
                    if checkbox == 'x':
                        status = 'done'
                    elif checkbox == '~':
                        status = 'active'

                    tasks.append({
                        "id": task_id,
                        "title": title,
                        "status": status,
                        "section": current_section,
                        "tags": tags if tags else []
                    })

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
        "exists": todo_path.exists()
    }
