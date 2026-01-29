"""Task notification system for immediate worker awareness.

When leader assigns a task, writes a notification file.
Worker's next tool call checks for and displays the notification.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any

try:
    from .paths import get_project_root
except ImportError:
    from paths import get_project_root


def _get_working_root() -> Path:
    """Get WORKING root from env or default."""
    default = get_project_root() / "WORKING"
    return Path(os.environ.get("KURORYUU_WORKING_ROOT", str(default))).resolve()


def _get_pending_dir() -> Path:
    """Get pending tasks directory."""
    return _get_working_root() / "pending_tasks"


def notify_worker(session_id: str, task_id: str, title: str, message_id: str) -> bool:
    """Write pending task notification for worker.

    Args:
        session_id: PTY session ID (used as worker identifier)
        task_id: Task identifier (e.g., "T049")
        title: Task title for display
        message_id: Inbox message ID for claiming

    Returns:
        True if notification written successfully
    """
    if not session_id:
        return False

    pending_dir = _get_pending_dir()
    pending_dir.mkdir(parents=True, exist_ok=True)

    task_file = pending_dir / f"{session_id}.json"
    task_file.write_text(json.dumps({
        "task_id": task_id,
        "title": title,
        "message_id": message_id,
        "created_at": datetime.now().isoformat()
    }, indent=2), encoding="utf-8")
    return True


def check_pending_task(session_id: str) -> Optional[Dict[str, Any]]:
    """Check if worker has pending task notification.

    Args:
        session_id: PTY session ID to check

    Returns:
        Task dict if pending, None otherwise. File is deleted after read.
    """
    if not session_id:
        return None

    pending_dir = _get_pending_dir()
    task_file = pending_dir / f"{session_id}.json"

    if task_file.exists():
        try:
            data = json.loads(task_file.read_text(encoding="utf-8"))
            task_file.unlink()  # Clear after reading
            return data
        except Exception:
            return None
    return None


def build_notification_block(task: Dict[str, Any]) -> str:
    """Build markdown notification block for context injection."""
    return f"""

---
## NEW TASK ASSIGNED TO YOU

**Task ID:** {task.get('task_id', 'unknown')}
**Title:** {task.get('title', 'No title')}

**ACTION REQUIRED:** Claim this task immediately:
```
k_inbox(action='claim', id='{task.get('message_id', '')}')
```

After claiming, read the full task details from the inbox message.
---

"""


def clear_all_pending() -> int:
    """Clear all pending task notifications. Returns count of files removed."""
    pending_dir = _get_pending_dir()
    if not pending_dir.exists():
        return 0

    count = 0
    for f in pending_dir.glob("*.json"):
        try:
            f.unlink()
            count += 1
        except Exception:
            pass
    return count
