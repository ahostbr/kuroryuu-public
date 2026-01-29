"""Inbox tools - Maildir-style message queue.

Layout:
  KURORYUU_INBOX_ROOT/
    new/     - Incoming messages
    cur/     - Claimed/in-progress messages
    tmp/     - Atomic write staging
    done/    - Completed messages
    dead/    - Abandoned/invalid messages

Message schema: kuroryuu_inbox_v1

Routed tool: k_inbox(action, ...)
Actions: help, send, list, read, claim, complete
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from .task_notifier import notify_worker
except ImportError:
    from task_notifier import notify_worker

SCHEMA_V1 = "kuroryuu_inbox_v1"
SCHEMA_V2 = "kuroryuu_inbox_v2"

# ============================================================================
# JSON Index Management
# ============================================================================

class InboxIndex:
    """JSON-based index for fast message queries."""

    def __init__(self, inbox_root: Path):
        self.inbox_root = inbox_root
        self.index_dir = inbox_root / ".index"
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.by_agent_file = self.index_dir / "by_agent.json"
        self.by_thread_file = self.index_dir / "by_thread.json"
        self.unread_file = self.index_dir / "unread_counts.json"

    def _load_index(self, path: Path) -> Dict[str, Any]:
        """Load JSON index file or return empty dict."""
        if not path.exists():
            return {}
        try:
            with path.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def _save_index(self, path: Path, data: Dict[str, Any]) -> None:
        """Save JSON index file atomically."""
        tmp_path = path.with_suffix(".json.tmp")
        with tmp_path.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(str(tmp_path), str(path))

    def update_message(self, message: Dict[str, Any]) -> None:
        """Update indexes when message changes."""
        msg_id = message.get("id", "")
        if not msg_id:
            return

        # Update by_agent index
        to_agent = message.get("to_agent", message.get("payload", {}).get("to_agent", "workers"))
        status = message.get("status", "new")

        by_agent = self._load_index(self.by_agent_file)
        if to_agent not in by_agent:
            by_agent[to_agent] = {"new": [], "claimed": [], "done": 0}

        # Add to appropriate list
        if status in ["new"]:
            if msg_id not in by_agent[to_agent]["new"]:
                by_agent[to_agent]["new"].append(msg_id)
        elif status in ["claimed", "in_progress"]:
            # Remove from new if present
            if msg_id in by_agent[to_agent]["new"]:
                by_agent[to_agent]["new"].remove(msg_id)
            if msg_id not in by_agent[to_agent]["claimed"]:
                by_agent[to_agent]["claimed"].append(msg_id)
        elif status in ["done", "failed", "dead"]:
            # Remove from new/claimed
            if msg_id in by_agent[to_agent]["new"]:
                by_agent[to_agent]["new"].remove(msg_id)
            if msg_id in by_agent[to_agent]["claimed"]:
                by_agent[to_agent]["claimed"].remove(msg_id)
            by_agent[to_agent]["done"] += 1

        self._save_index(self.by_agent_file, by_agent)

        # Update by_thread index if thread_id present
        thread_id = message.get("thread_id", "")
        if thread_id:
            by_thread = self._load_index(self.by_thread_file)
            if thread_id not in by_thread:
                by_thread[thread_id] = []
            if msg_id not in by_thread[thread_id]:
                by_thread[thread_id].append(msg_id)
            self._save_index(self.by_thread_file, by_thread)

    def query_pending(self, agent_id: str) -> List[str]:
        """Fast query for pending messages."""
        by_agent = self._load_index(self.by_agent_file)
        if agent_id in by_agent:
            return by_agent[agent_id].get("new", [])
        return []

    def rebuild_from_maildir(self) -> None:
        """Rebuild index by scanning maildir folders."""
        # Clear existing indexes
        self._save_index(self.by_agent_file, {})
        self._save_index(self.by_thread_file, {})

        # Scan folders
        folders = _ensure_maildir(self.inbox_root)
        for folder_name in ["new", "cur"]:
            folder = folders.get(folder_name)
            if not folder or not folder.exists():
                continue
            for msg_file in folder.glob("*.json"):
                msg, _ = _safe_read_json(msg_file)
                if msg:
                    self.update_message(msg)


# Global index instance
_inbox_index: Optional[InboxIndex] = None


def _get_index() -> InboxIndex:
    """Get or create global inbox index."""
    global _inbox_index
    if _inbox_index is None:
        inbox_root, _ = _validate_inbox_root()
        _inbox_index = InboxIndex(inbox_root)
    return _inbox_index


def _trigger_websocket_notification(message: dict) -> None:
    """Trigger WebSocket broadcast for real-time delivery.

    Fires async WebSocket notification when message is sent.
    Fails gracefully if WebSocket system unavailable.
    """
    try:
        # Import here to avoid circular dependency
        import asyncio
        try:
            from apps.gateway.websocket import broadcast_inbox_message_sent
        except ImportError:
            # Gateway not available, skip WebSocket notification
            return

        # Check if event loop is running
        try:
            loop = asyncio.get_running_loop()
            # Create task in running loop
            asyncio.create_task(broadcast_inbox_message_sent(message))
        except RuntimeError:
            # No running loop, create new one (testing/CLI mode)
            try:
                asyncio.run(broadcast_inbox_message_sent(message))
            except Exception:
                # Failed to send, but don't fail the whole operation
                pass
    except Exception:
        # Fail gracefully - WebSocket is optional
        pass


try:
    from .paths import get_project_root
except ImportError:
    from paths import get_project_root

# ============================================================================
# Configuration
# ============================================================================

def _get_working_root() -> Path:
    """Get WORKING root from env or default."""
    default = get_project_root() / "WORKING"
    return Path(os.environ.get("KURORYUU_WORKING_ROOT", str(default))).resolve()


def _get_inbox_root() -> Path:
    """Get inbox root from env or default."""
    default = get_project_root() / "ai" / "inbox"
    return Path(os.environ.get("KURORYUU_INBOX_ROOT", str(default))).resolve()


def _get_max_bytes() -> int:
    """Get max message size in bytes."""
    return int(os.environ.get("KURORYUU_INBOX_MAX_BYTES", "1000000"))


def _allow_external_root() -> bool:
    """Check if external roots are allowed."""
    return os.environ.get("KURORYUU_ALLOW_EXTERNAL_ROOT", "0").strip() in ("1", "true", "yes")


def _validate_inbox_root() -> Tuple[Path, List[str]]:
    """Validate and ensure inbox root exists. Returns (path, warnings)."""
    warnings: List[str] = []
    inbox_root = _get_inbox_root()
    working_root = _get_working_root()

    # Security check: inbox must be under project root unless explicitly allowed
    if not _allow_external_root():
        project_root = get_project_root()
        try:
            inbox_root.relative_to(project_root)
        except ValueError:
            warnings.append(f"Inbox root {inbox_root} not under project. Using default.")
            inbox_root = project_root / "ai" / "inbox"

    return inbox_root, warnings


# ============================================================================
# Maildir helpers
# ============================================================================

MAILDIR_FOLDERS = ("new", "cur", "tmp", "done", "dead")


def _ensure_maildir(root: Path) -> Dict[str, Path]:
    """Ensure Maildir structure exists. Returns dict of folder paths."""
    folders: Dict[str, Path] = {}
    for folder in MAILDIR_FOLDERS:
        d = root / folder
        d.mkdir(parents=True, exist_ok=True)
        folders[folder] = d
    return folders


def _now_utc() -> dt.datetime:
    """Get current UTC time."""
    return dt.datetime.now(dt.timezone.utc)


def _iso(dt_obj: dt.datetime) -> str:
    """Format datetime as ISO8601."""
    return dt_obj.isoformat(timespec="seconds")


def _ts_for_filename(dt_obj: dt.datetime) -> str:
    """Generate timestamp string for filename sorting."""
    return dt_obj.strftime("%Y%m%d_%H%M%S")


def _safe_string(value: str, max_len: int = 64) -> str:
    """Sanitize string for filesystem use."""
    s = (value or "").strip()
    if not s:
        return ""
    s = re.sub(r"[^A-Za-z0-9_\-]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_-")
    return s[:max_len]


def _sanitize_for_display(text: str, max_len: int = 100) -> str:
    """Sanitize text for safe display (defense in depth).

    Removes shell metacharacters that could be used for prompt injection
    when inbox messages are displayed to Claude agents.
    """
    if not text:
        return ""
    # Remove dangerous shell metacharacters
    clean = re.sub(r'[;|&`$(){}[\]<>\\]', '', text)
    # Remove hex/escape sequences
    clean = re.sub(r'\\x[0-9a-fA-F]{2}', '', clean)
    # Remove ANSI escape sequences
    clean = re.sub(r'\x1b\[[0-9;]*m', '', clean)
    # Remove control characters
    clean = re.sub(r'[\x00-\x1f\x7f]', '', clean)
    return clean[:max_len].strip()


def _write_json_atomic(dest: Path, obj: Dict[str, Any], tmp_dir: Path) -> None:
    """Atomic JSON write via tmp file + rename."""
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_file = tmp_dir / f".{dest.name}.tmp_{uuid.uuid4().hex[:8]}"
    data = json.dumps(obj, ensure_ascii=False, indent=2) + "\n"

    # Check size limit
    max_bytes = _get_max_bytes()
    if len(data.encode("utf-8")) > max_bytes:
        raise ValueError(f"Message exceeds max size ({max_bytes} bytes)")

    with tmp_file.open("w", encoding="utf-8", newline="\n") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())

    dest.parent.mkdir(parents=True, exist_ok=True)
    os.replace(str(tmp_file), str(dest))


def _safe_read_json(path: Path) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    """Safely read JSON file. Returns (obj, warnings)."""
    try:
        with path.open("r", encoding="utf-8") as f:
            obj = json.load(f)
        if isinstance(obj, dict):
            return obj, []
        return None, ["JSON root is not an object"]
    except FileNotFoundError:
        return None, ["file not found"]
    except json.JSONDecodeError as exc:
        return None, [f"invalid json: {exc}"]
    except Exception as exc:
        return None, [f"read failed: {exc}"]


def _find_message_by_id(msg_id: str, folders: Dict[str, Path], search_folders: List[str]) -> Tuple[Optional[Path], Optional[str]]:
    """Find message file by ID across specified folders. Returns (path, folder_name)."""
    for folder_name in search_folders:
        folder = folders.get(folder_name)
        if not folder:
            continue
        for p in folder.glob("*.json"):
            if msg_id in p.name:
                return p, folder_name
            # Also check inside the file
            obj, _ = _safe_read_json(p)
            if obj and obj.get("id") == msg_id:
                return p, folder_name
    return None, None


def _list_messages_sorted(folder: Path) -> List[Path]:
    """List messages in folder sorted by filename (FIFO oldest first)."""
    files = list(folder.glob("*.json"))
    return sorted(files, key=lambda p: p.name)


# ============================================================================
# Action implementations
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """List available actions for k_inbox."""
    return {
        "ok": True,
        "data": {
            "tool": "k_inbox",
            "description": "Maildir-style message queue with v2 agent messaging support",
            "schema_versions": [SCHEMA_V1, SCHEMA_V2],
            "actions": {
                "help": "Show this help",
                "send": "Send message to inbox. v1: payload (required), title, thread_id. v2: from_agent, to_agent, subject, body, priority, message_type, reply_to",
                "list": "List messages. Params: folder (new|cur|done|dead), limit, include_payload",
                "read": "Read message by ID. Params: id (required), folder",
                "claim": "Claim message (new→cur). Params: id (optional, FIFO if omitted)",
                "complete": "Complete message (cur→done|dead). Params: id (required), status, note",
                "mark_read": "Mark message as read (v2 broadcasts). Params: id (required), agent_id (required)",
                "stats": "Get inbox statistics. No params required.",
            },
            "folders": ["new", "cur", "done", "dead"],
            "inbox_root": str(_get_inbox_root()),
            "features": {
                "json_index": "Fast queries via .index/ folder",
                "websocket_push": "Real-time delivery when gateway available",
                "task_notifier": "Instant notification via pending_tasks/",
                "backward_compatible": "v1 and v2 schemas coexist",
            },
        },
        "error": None,
    }


def _action_send(
    payload: Any = None,
    title: str = "",
    thread_id: str = "",
    # v2 fields (backward compatible)
    from_agent: str = "",
    to_agent: str = "",
    subject: str = "",
    body: str = "",
    priority: str = "normal",
    message_type: str = "task",
    reply_to: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Send a message to the inbox (supports v1 and v2 schema)."""
    # v1 compatibility: payload required unless using v2 body field
    if payload is None and not body:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "payload or body is required",
            "details": {},
        }

    try:
        inbox_root, warnings = _validate_inbox_root()
        folders = _ensure_maildir(inbox_root)

        now = _now_utc()
        msg_id = str(uuid.uuid4())

        # Use v2 schema if any v2 fields provided
        use_v2 = bool(from_agent or to_agent or subject or body or priority != "normal")
        schema = SCHEMA_V2 if use_v2 else SCHEMA_V1

        # Build message with v2 fields (backward compatible with v1)
        msg: Dict[str, Any] = {
            "schema": schema,
            "id": msg_id,
            "created_at": _iso(now),
            "updated_at": _iso(now),
            "status": "new",
            "thread_id": thread_id or "",
        }

        # v2 addressing
        if use_v2:
            msg["from_agent"] = from_agent or "system"
            msg["to_agent"] = to_agent or "workers"
            msg["subject"] = subject or title or ""
            msg["body"] = body or ""
            msg["title"] = subject or title or ""  # Alias for v1 compatibility
            msg["message_type"] = message_type
            msg["priority"] = priority
            msg["reply_to"] = reply_to or ""
            msg["claimed_by"] = ""
            msg["claimed_at"] = ""
            msg["completed_at"] = ""
            msg["result"] = ""
            msg["error"] = ""
            msg["completion_note"] = ""
            msg["read"] = False
            msg["read_at"] = ""
            msg["read_by"] = []
            # Store payload in metadata for v1 compatibility
            if payload is not None:
                msg["metadata"] = {"payload": payload}
            else:
                msg["metadata"] = {}
        else:
            # v1 format
            msg["title"] = title or ""
            msg["payload"] = payload

        # Filename: <timestamp>__<priority>__<safe_subject>__<id>.json
        ts = _ts_for_filename(now)
        if use_v2:
            safe_title = _safe_string(subject or title, max_len=32)
            if safe_title and priority != "normal":
                fname = f"{ts}__{priority}__{safe_title}__{msg_id}.json"
            elif safe_title:
                fname = f"{ts}__{safe_title}__{msg_id}.json"
            else:
                fname = f"{ts}__{msg_id}.json"
        else:
            safe_title = _safe_string(title, max_len=32)
            if safe_title:
                fname = f"{ts}__{safe_title}__{msg_id}.json"
            else:
                fname = f"{ts}__{msg_id}.json"

        dest = folders["new"] / fname
        _write_json_atomic(dest, msg, folders["tmp"])

        # Update index (v2 feature)
        if use_v2:
            _get_index().update_message(msg)

        # Trigger WebSocket notification for real-time delivery
        if use_v2:
            _trigger_websocket_notification(msg)

        # Notify worker if this is a task assignment
        if thread_id == "leader_worker_coordination":
            # Parse payload if it's a JSON string
            payload_data = payload
            if isinstance(payload, str):
                try:
                    payload_data = json.loads(payload)
                except (json.JSONDecodeError, TypeError):
                    payload_data = {}
            if isinstance(payload_data, dict):
                target_session = payload_data.get("target_session_id")
                task_id = payload_data.get("task_id", "")
                if target_session:
                    notify_worker(
                        session_id=target_session,
                        task_id=task_id,
                        title=title or "New Task",
                        message_id=msg_id
                    )

        result: Dict[str, Any] = {
            "ok": True,
            "message": msg,
            "path": str(dest),
            "folder": "new",
        }
        if warnings:
            result["warnings"] = warnings
        return result

    except ValueError as e:
        return {
            "ok": False,
            "error_code": "VALIDATION_ERROR",
            "message": str(e),
            "details": {},
        }
    except Exception as e:
        return {
            "ok": False,
            "error_code": "SEND_FAILED",
            "message": str(e),
            "details": {},
        }


def _action_list(
    folder: str = "new",
    limit: int = 50,
    include_payload: bool = False,
    **kwargs: Any,
) -> Dict[str, Any]:
    """List messages in a folder."""
    try:
        # Validate folder
        folder_key = (folder or "new").strip().lower()
        if folder_key not in ("new", "cur", "done", "dead"):
            return {
                "ok": False,
                "error_code": "BAD_REQUEST",
                "message": f"Invalid folder: {folder}. Must be one of: new, cur, done, dead",
                "details": {"folder": folder},
            }

        # Clamp limit
        limit = max(1, min(200, int(limit or 50)))

        inbox_root, warnings = _validate_inbox_root()
        folders = _ensure_maildir(inbox_root)

        target = folders[folder_key]
        files = _list_messages_sorted(target)

        messages: List[Dict[str, Any]] = []
        for p in files[:limit]:
            obj, read_warnings = _safe_read_json(p)
            if obj is None:
                messages.append({
                    "id": p.stem,
                    "path": str(p),
                    "size_bytes": p.stat().st_size if p.exists() else 0,
                    "error": read_warnings,
                })
                continue

            entry: Dict[str, Any] = {
                "id": obj.get("id", p.stem),
                "created_at": obj.get("created_at", ""),
                "status": obj.get("status", ""),
                # Security: Sanitize title for safe display
                "title": _sanitize_for_display(obj.get("title", "")),
                "thread_id": obj.get("thread_id", ""),
                "path": str(p),
                "size_bytes": p.stat().st_size,
            }
            if include_payload:
                entry["payload"] = obj.get("payload")
            messages.append(entry)

        result: Dict[str, Any] = {
            "ok": True,
            "folder": folder_key,
            "count": len(messages),
            "messages": messages,
        }
        if warnings:
            result["warnings"] = warnings
        return result

    except Exception as e:
        return {
            "ok": False,
            "error_code": "LIST_FAILED",
            "message": str(e),
            "details": {},
        }


def _action_read(
    id: str = "",
    folder: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Read a message by ID."""
    if not id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "id is required",
            "details": {},
        }

    try:
        inbox_root, warnings = _validate_inbox_root()
        folders = _ensure_maildir(inbox_root)

        # Determine search order
        if folder:
            folder_key = folder.strip().lower()
            if folder_key not in ("new", "cur", "done", "dead"):
                return {
                    "ok": False,
                    "error_code": "BAD_REQUEST",
                    "message": f"Invalid folder: {folder}",
                    "details": {"folder": folder},
                }
            search_order = [folder_key]
        else:
            search_order = ["new", "cur", "done", "dead"]

        path, found_folder = _find_message_by_id(id, folders, search_order)

        if path is None:
            return {
                "ok": False,
                "error_code": "NOT_FOUND",
                "message": f"Message not found: {id}",
                "details": {"id": id, "searched": search_order},
            }

        obj, read_warnings = _safe_read_json(path)
        if obj is None:
            return {
                "ok": False,
                "error_code": "READ_FAILED",
                "message": f"Failed to read message: {read_warnings}",
                "details": {"path": str(path)},
            }

        result: Dict[str, Any] = {
            "ok": True,
            "message": obj,
            "path": str(path),
            "folder": found_folder,
        }
        if warnings:
            result["warnings"] = warnings
        return result

    except Exception as e:
        return {
            "ok": False,
            "error_code": "READ_FAILED",
            "message": str(e),
            "details": {},
        }


def _action_claim(
    id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Claim a message (move from new to cur)."""
    try:
        inbox_root, warnings = _validate_inbox_root()
        folders = _ensure_maildir(inbox_root)

        now = _now_utc()

        # Find message to claim
        if id:
            path, found_folder = _find_message_by_id(id, folders, ["new"])
            if path is None:
                return {
                    "ok": False,
                    "error_code": "NOT_FOUND",
                    "message": f"Message not found in new/: {id}",
                    "details": {"id": id},
                }
        else:
            # FIFO: oldest message in new/
            files = _list_messages_sorted(folders["new"])
            if not files:
                return {
                    "ok": False,
                    "error_code": "NOT_FOUND",
                    "message": "No messages in new/ to claim",
                    "details": {},
                }
            path = files[0]
            found_folder = "new"

        # Read message
        obj, read_warnings = _safe_read_json(path)
        if obj is None:
            return {
                "ok": False,
                "error_code": "READ_FAILED",
                "message": f"Failed to read message: {read_warnings}",
                "details": {"path": str(path)},
            }

        # Update message
        obj["status"] = "cur"
        obj["claimed_at"] = _iso(now)

        # Move to cur/
        dest = folders["cur"] / path.name
        _write_json_atomic(dest, obj, folders["tmp"])
        path.unlink(missing_ok=True)

        result: Dict[str, Any] = {
            "ok": True,
            "message": obj,
            "from_folder": "new",
            "to_folder": "cur",
            "path": str(dest),
        }
        if warnings:
            result["warnings"] = warnings
        return result

    except Exception as e:
        return {
            "ok": False,
            "error_code": "CLAIM_FAILED",
            "message": str(e),
            "details": {},
        }


def _action_complete(
    id: str = "",
    status: str = "done",
    note: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Complete a claimed message (move from cur to done or dead)."""
    if not id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "id is required",
            "details": {},
        }

    try:
        # Validate status
        status_key = (status or "done").strip().lower()
        if status_key not in ("done", "dead"):
            return {
                "ok": False,
                "error_code": "BAD_REQUEST",
                "message": f"Invalid status: {status}. Must be 'done' or 'dead'",
                "details": {"status": status},
            }

        inbox_root, warnings = _validate_inbox_root()
        folders = _ensure_maildir(inbox_root)

        now = _now_utc()

        # Find message in cur/
        path, found_folder = _find_message_by_id(id, folders, ["cur"])
        if path is None:
            return {
                "ok": False,
                "error_code": "NOT_FOUND",
                "message": f"Message not found in cur/: {id}",
                "details": {"id": id},
            }

        # Read message
        obj, read_warnings = _safe_read_json(path)
        if obj is None:
            return {
                "ok": False,
                "error_code": "READ_FAILED",
                "message": f"Failed to read message: {read_warnings}",
                "details": {"path": str(path)},
            }

        # Update message
        obj["status"] = status_key
        obj["completed_at"] = _iso(now)
        if note.strip():
            obj["completion_note"] = note.strip()

        # Move to done/ or dead/
        dest = folders[status_key] / path.name
        _write_json_atomic(dest, obj, folders["tmp"])
        path.unlink(missing_ok=True)

        result: Dict[str, Any] = {
            "ok": True,
            "message": obj,
            "from_folder": "cur",
            "to_folder": status_key,
            "path": str(dest),
        }
        if warnings:
            result["warnings"] = warnings
        return result

    except Exception as e:
        return {
            "ok": False,
            "error_code": "COMPLETE_FAILED",
            "message": str(e),
            "details": {},
        }


def _action_mark_read(
    id: str = "",
    agent_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Mark a message as read (for broadcast messages with read tracking).

    Args:
        id: Message ID to mark as read
        agent_id: Agent that read the message

    Returns:
        {ok, message, ...}
    """
    if not id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "id is required",
            "details": {},
        }

    if not agent_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "agent_id is required",
            "details": {},
        }

    try:
        inbox_root, warnings = _validate_inbox_root()
        folders = _ensure_maildir(inbox_root)
        now = _now_utc()

        # Find message in any folder
        path, found_folder = _find_message_by_id(id, folders, ["new", "cur"])
        if path is None:
            return {
                "ok": False,
                "error_code": "NOT_FOUND",
                "message": f"Message not found: {id}",
                "details": {"id": id},
            }

        # Read message
        obj, read_warnings = _safe_read_json(path)
        if obj is None:
            return {
                "ok": False,
                "error_code": "READ_FAILED",
                "message": f"Failed to read message: {read_warnings}",
                "details": {"path": str(path)},
            }

        # Update read tracking (v2 fields)
        if "read_by" not in obj:
            obj["read_by"] = []
        if agent_id not in obj["read_by"]:
            obj["read_by"].append(agent_id)
        obj["read"] = True
        obj["read_at"] = _iso(now)
        obj["updated_at"] = _iso(now)

        # Write back to same location
        _write_json_atomic(path, obj, folders["tmp"])

        # Update index
        _get_index().update_message(obj)

        result: Dict[str, Any] = {
            "ok": True,
            "message": obj,
            "path": str(path),
        }
        if warnings:
            result["warnings"] = warnings
        return result

    except Exception as e:
        return {
            "ok": False,
            "error_code": "MARK_READ_FAILED",
            "message": str(e),
            "details": {},
        }


def _action_stats(**kwargs: Any) -> Dict[str, Any]:
    """Get inbox statistics.

    Returns message counts and agent statistics from the index.

    Returns:
        {ok, stats: {...}}
    """
    try:
        inbox_root, warnings = _validate_inbox_root()
        index = _get_index()

        # Load by_agent index
        by_agent = index._load_index(index.by_agent_file)

        # Calculate totals
        total_new = sum(len(agent_data.get("new", [])) for agent_data in by_agent.values())
        total_claimed = sum(len(agent_data.get("claimed", [])) for agent_data in by_agent.values())
        total_done = sum(agent_data.get("done", 0) for agent_data in by_agent.values())

        # Count agents with messages
        agents_with_new = len([a for a, d in by_agent.items() if len(d.get("new", [])) > 0])
        agents_with_claimed = len([a for a, d in by_agent.items() if len(d.get("claimed", [])) > 0])

        stats = {
            "total_new": total_new,
            "total_claimed": total_claimed,
            "total_done": total_done,
            "total_queued_messages": total_new + total_claimed,
            "agents_with_messages": len(by_agent),
            "agents_with_new": agents_with_new,
            "agents_with_claimed": agents_with_claimed,
        }

        result: Dict[str, Any] = {
            "ok": True,
            "stats": stats,
        }
        if warnings:
            result["warnings"] = warnings
        return result

    except Exception as e:
        return {
            "ok": False,
            "error_code": "STATS_FAILED",
            "message": str(e),
            "details": {},
        }


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "send": _action_send,
    "list": _action_list,
    "read": _action_read,
    "claim": _action_claim,
    "complete": _action_complete,
    "mark_read": _action_mark_read,
    "stats": _action_stats,
}


def k_inbox(
    action: str,
    payload: Any = None,
    title: str = "",
    thread_id: str = "",
    folder: str = "new",
    limit: int = 50,
    include_payload: bool = False,
    id: str = "",
    status: str = "done",
    note: str = "",
    # v2 fields for agent messaging
    from_agent: str = "",
    to_agent: str = "",
    subject: str = "",
    body: str = "",
    priority: str = "normal",
    message_type: str = "task",
    reply_to: str = "",
    agent_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Inbox - Maildir-style message queue.

    Routed tool with actions: help, send, list, read, claim, complete, mark_read, stats

    Args:
        action: Action to perform (required)
        payload: Message payload (for send - v1)
        title: Message title (for send - v1)
        thread_id: Thread ID for grouping (for send)
        folder: Folder name: new, cur, done, dead (for list, read)
        limit: Max messages to return (for list)
        include_payload: Include full payload in list results (for list)
        id: Message ID (for read, claim, complete, mark_read)
        status: Completion status: done or dead (for complete)
        note: Completion note (for complete)
        from_agent: Sender agent ID (for send - v2)
        to_agent: Target agent ID or 'broadcast' (for send - v2)
        subject: Message subject (for send - v2)
        body: Message body (for send - v2)
        priority: Priority: high, normal, low (for send - v2)
        message_type: Type: task, message, broadcast, reply (for send - v2)
        reply_to: Message ID being replied to (for send - v2)
        agent_id: Agent ID (for mark_read)

    Returns:
        {ok, ...} response dict
    """
    act = (action or "").strip().lower()

    if not act:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "action is required. Use action='help' for available actions.",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    handler = ACTION_HANDLERS.get(act)
    if not handler:
        return {
            "ok": False,
            "error_code": "UNKNOWN_ACTION",
            "message": f"Unknown action: {act}",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    return handler(
        payload=payload,
        title=title,
        thread_id=thread_id,
        folder=folder,
        limit=limit,
        include_payload=include_payload,
        id=id,
        status=status,
        note=note,
        from_agent=from_agent,
        to_agent=to_agent,
        subject=subject,
        body=body,
        priority=priority,
        message_type=message_type,
        reply_to=reply_to,
        agent_id=agent_id,
        **kwargs,
    )


# ============================================================================
# Tool registration
# ============================================================================

def register_inbox_tools(registry: "ToolRegistry") -> None:
    """Register k_inbox routed tool with the registry."""

    registry.register(
        name="k_inbox",
        description="Maildir-style message queue with v2 agent messaging support. Actions: help, send, list, read, claim, complete, mark_read, stats",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "send", "list", "read", "claim", "complete", "mark_read", "stats"],
                    "description": "Action to perform",
                },
                "payload": {
                    "description": "Message payload (for send - v1)",
                },
                "title": {
                    "type": "string",
                    "description": "Message title (for send - v1)",
                },
                "thread_id": {
                    "type": "string",
                    "description": "Thread ID for grouping (for send)",
                },
                "folder": {
                    "type": "string",
                    "enum": ["new", "cur", "done", "dead"],
                    "default": "new",
                    "description": "Folder name (for list, read)",
                },
                "limit": {
                    "type": "integer",
                    "default": 50,
                    "description": "Max messages to return (for list)",
                },
                "include_payload": {
                    "type": "boolean",
                    "default": False,
                    "description": "Include full payload in results (for list)",
                },
                "id": {
                    "type": "string",
                    "description": "Message ID (for read, claim, complete, mark_read)",
                },
                "status": {
                    "type": "string",
                    "enum": ["done", "dead"],
                    "default": "done",
                    "description": "Completion status (for complete)",
                },
                "note": {
                    "type": "string",
                    "description": "Completion note (for complete)",
                },
                "from_agent": {
                    "type": "string",
                    "description": "Sender agent ID (for send - v2)",
                },
                "to_agent": {
                    "type": "string",
                    "description": "Target agent ID or 'broadcast' (for send - v2)",
                },
                "subject": {
                    "type": "string",
                    "description": "Message subject (for send - v2)",
                },
                "body": {
                    "type": "string",
                    "description": "Message body (for send - v2)",
                },
                "priority": {
                    "type": "string",
                    "enum": ["high", "normal", "low"],
                    "default": "normal",
                    "description": "Message priority (for send - v2)",
                },
                "message_type": {
                    "type": "string",
                    "enum": ["task", "message", "broadcast", "reply"],
                    "default": "task",
                    "description": "Message type (for send - v2)",
                },
                "reply_to": {
                    "type": "string",
                    "description": "Message ID being replied to (for send - v2)",
                },
                "agent_id": {
                    "type": "string",
                    "description": "Agent ID (for mark_read)",
                },
            },
            "required": ["action"],
        },
        handler=k_inbox,
    )
