"""Real-time progress streaming to Gateway.

Follows the k_bash emit pattern for WebSocket broadcasting.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict, Optional

import httpx

GATEWAY_URL = os.environ.get("KURORYUU_GATEWAY_URL", "http://127.0.0.1:8200")


def emit_backup_progress(
    session_id: str,
    event_type: str,
    data: Dict[str, Any],
    is_final: bool = False,
    command_preview: Optional[str] = None,
) -> None:
    """Emit backup progress event to Gateway for real-time streaming.

    Fire-and-forget POST to /v1/pty-traffic/emit endpoint.
    Failures are silently ignored to not block the backup process.

    Args:
        session_id: Unique session identifier
        event_type: One of:
            - "progress": {percent, files_done, bytes_done, current_file}
            - "file": {path, status: new|modified|unchanged}
            - "summary": {snapshot_id, files_new, files_changed, ...}
            - "error": {message, code}
            - "log": {line} - Raw log line from restic
        data: Event-specific data payload
        is_final: True if this is the final event
        command_preview: Optional command being executed (truncated)
    """
    event = {
        "action": "backup_progress",
        "session_id": session_id,
        "event_type": event_type,
        "data": data,
        "timestamp": datetime.now().isoformat(),
        "is_final": is_final,
        "command_preview": command_preview[:80] if command_preview else None,
        "cli_type": "k_backup",
        "success": event_type != "error",
    }

    try:
        httpx.post(
            f"{GATEWAY_URL}/v1/pty-traffic/emit",
            json=event,
            timeout=1.0,
        )
    except Exception:
        pass  # Don't block backup on emit failure


def emit_progress(
    session_id: str,
    percent: float,
    files_done: int = 0,
    bytes_done: int = 0,
    total_files: int = 0,
    total_bytes: int = 0,
    current_file: Optional[str] = None,
) -> None:
    """Emit backup progress update."""
    emit_backup_progress(
        session_id,
        "progress",
        {
            "percent": round(percent, 2),
            "files_done": files_done,
            "bytes_done": bytes_done,
            "total_files": total_files,
            "total_bytes": total_bytes,
            "current_file": current_file,
        },
    )


def emit_file_status(
    session_id: str,
    path: str,
    status: str,
    size: int = 0,
) -> None:
    """Emit file processing status.

    Args:
        path: File path being processed
        status: One of "new", "modified", "unchanged"
        size: File size in bytes
    """
    emit_backup_progress(
        session_id,
        "file",
        {
            "path": path,
            "status": status,
            "size": size,
        },
    )


def emit_log_line(session_id: str, line: str) -> None:
    """Emit raw log line from restic output."""
    emit_backup_progress(
        session_id,
        "log",
        {"line": line},
    )


def emit_summary(
    session_id: str,
    snapshot_id: str,
    files_new: int = 0,
    files_changed: int = 0,
    files_unmodified: int = 0,
    dirs_new: int = 0,
    dirs_changed: int = 0,
    dirs_unmodified: int = 0,
    data_added: int = 0,
    total_files_processed: int = 0,
    total_bytes_processed: int = 0,
    duration_seconds: float = 0,
) -> None:
    """Emit backup completion summary."""
    emit_backup_progress(
        session_id,
        "summary",
        {
            "snapshot_id": snapshot_id,
            "files_new": files_new,
            "files_changed": files_changed,
            "files_unmodified": files_unmodified,
            "dirs_new": dirs_new,
            "dirs_changed": dirs_changed,
            "dirs_unmodified": dirs_unmodified,
            "data_added": data_added,
            "total_files_processed": total_files_processed,
            "total_bytes_processed": total_bytes_processed,
            "duration_seconds": round(duration_seconds, 2),
        },
        is_final=True,
    )


def emit_error(
    session_id: str,
    message: str,
    code: str = "UNKNOWN_ERROR",
) -> None:
    """Emit error event."""
    emit_backup_progress(
        session_id,
        "error",
        {
            "message": message,
            "code": code,
        },
        is_final=True,
    )


def emit_heartbeat(session_id: str) -> None:
    """Emit heartbeat to indicate process is still running."""
    event = {
        "action": "backup_heartbeat",
        "session_id": session_id,
        "timestamp": datetime.now().isoformat(),
        "cli_type": "k_backup",
        "success": True,
        "is_heartbeat": True,
    }

    try:
        httpx.post(
            f"{GATEWAY_URL}/v1/pty-traffic/emit",
            json=event,
            timeout=1.0,
        )
    except Exception:
        pass
