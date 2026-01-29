"""Task Storage - BATCH/ORCHESTRATION ONLY

SCOPE: This module is retained ONLY for batch orchestration endpoints.
It provides in-memory Task objects with subtask tracking required by:
- /v1/orchestration/batch/* endpoints
- leader.py, worker.py, recovery.py (during active orchestration runs)

CANONICAL SOURCE OF TRUTH: ai/todo.md (via todo_md.py)
- Human-facing task list lives in todo.md
- This storage is ephemeral - data lost on gateway restart

DO NOT use for new code. For task management use todo_md.py.
The ai/tasks.json file has been deleted and will not be recreated.
"""

from __future__ import annotations

import warnings
from datetime import datetime
from typing import Dict, List, Optional

from .models import Task, TaskStatus, SubTask


# Emit deprecation warning on import
warnings.warn(
    "orchestration.storage is deprecated. Use todo_md.py instead. "
    "The ai/tasks.json file has been deleted.",
    DeprecationWarning,
    stacklevel=2,
)


class TaskStorage:
    """DEPRECATED: In-memory only task storage (no persistence).

    This class no longer persists to ai/tasks.json.
    Use todo_md.py for task management instead.
    """

    def __init__(self, persist_path=None):
        """Initialize storage. persist_path is ignored (no persistence)."""
        self._tasks: Dict[str, Task] = {}
        # persist_path is ignored - we no longer persist to ai/tasks.json

    def save(self, task: Task) -> None:
        """Save task to in-memory storage only (no persistence)."""
        self._tasks[task.task_id] = task
        # Note: Does NOT persist to disk

    def get(self, task_id: str) -> Optional[Task]:
        """Get task by ID from in-memory storage."""
        return self._tasks.get(task_id)

    def list_all(
        self,
        status: Optional[TaskStatus] = None,
        limit: int = 100,
    ) -> List[Task]:
        """List tasks from in-memory storage."""
        tasks = list(self._tasks.values())

        if status:
            tasks = [t for t in tasks if t.status == status]

        tasks.sort(key=lambda t: (-t.priority, t.created_at))
        return tasks[:limit]

    def get_pending_tasks(self) -> List[Task]:
        """Get tasks ready for breakdown."""
        return self.list_all(status=TaskStatus.PENDING)

    def get_active_tasks(self) -> List[Task]:
        """Get tasks in progress."""
        return [
            t for t in self._tasks.values()
            if t.status in (TaskStatus.BREAKING_DOWN, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS)
        ]

    def delete(self, task_id: str) -> bool:
        """Delete a task from in-memory storage."""
        if task_id in self._tasks:
            del self._tasks[task_id]
            return True
        return False

    def get_subtask(
        self,
        task_id: str,
        subtask_id: str,
    ) -> Optional[SubTask]:
        """Get a specific subtask."""
        task = self.get(task_id)
        if not task:
            return None

        for st in task.subtasks:
            if st.subtask_id == subtask_id:
                return st
        return None

    def get_available_subtasks(self, limit: int = 10) -> List[tuple]:
        """Get pending subtasks ready for assignment.

        DEPRECATED: Workers should get tasks from todo.md via inbox coordination.
        """
        results = []

        for task in self._tasks.values():
            if task.status not in (TaskStatus.IN_PROGRESS, TaskStatus.ASSIGNED):
                continue

            for st in task.subtasks:
                if (st.status == TaskStatus.PENDING
                    and st.assigned_to is None
                    and not st.blocked_by):
                    results.append((task, st))

        results.sort(key=lambda x: -x[0].priority)
        return results[:limit]

    def stats(self) -> Dict[str, int]:
        """Get task statistics from in-memory storage."""
        stats = {
            "total": len(self._tasks),
            "pending": 0,
            "breaking_down": 0,
            "assigned": 0,
            "in_progress": 0,
            "completed": 0,
            "failed": 0,
            "cancelled": 0,
            "total_subtasks": 0,
            "pending_subtasks": 0,
            "deprecated_warning": "This storage is deprecated. Use todo.md instead.",
        }

        for task in self._tasks.values():
            stats[task.status.value] = stats.get(task.status.value, 0) + 1
            stats["total_subtasks"] += len(task.subtasks)
            stats["pending_subtasks"] += len(task.get_pending_subtasks())

        return stats


# Singleton instance
_storage: Optional[TaskStorage] = None


def get_storage() -> TaskStorage:
    """Get the singleton storage instance.

    DEPRECATED: Use todo_md.py for task management instead.
    This storage is in-memory only and does NOT persist to disk.
    """
    global _storage
    if _storage is None:
        _storage = TaskStorage()  # No persist_path - in-memory only
    return _storage


def init_storage(persist_path=None) -> TaskStorage:
    """Initialize storage. persist_path is ignored.

    DEPRECATED: Use todo_md.py instead.
    """
    global _storage
    _storage = TaskStorage()  # persist_path ignored
    return _storage
