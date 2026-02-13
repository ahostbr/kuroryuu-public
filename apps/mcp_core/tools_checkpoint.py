"""Checkpoint tools - generic session/thread persistence.

Layout:
  KURORYUU_CHECKPOINT_ROOT/<name>/checkpoint_<timestamp>.json
  KURORYUU_CHECKPOINT_ROOT/_index.jsonl

Checkpoints store arbitrary JSON payloads with metadata.

Routed tool: k_checkpoint(action, ...)
Actions: help, save, append, list, load
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from .paths import get_project_root
except ImportError:
    from paths import get_project_root

SCHEMA_V1 = "kuroryuu_checkpoint_v1"


def _get_checkpoint_root() -> Path:
    """Get checkpoint root from env or default."""
    default = get_project_root() / "WORKING" / "checkpoints"
    return Path(os.environ.get("KURORYUU_CHECKPOINT_ROOT", str(default))).resolve()


def _safe_name(value: str, max_len: int = 64) -> str:
    """Sanitize name for filesystem use."""
    s = (value or "").strip()
    if not s:
        return "default"
    s = re.sub(r"[^A-Za-z0-9_\-]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_-")
    return (s or "default")[:max_len]


def _now_local() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).astimezone()


def _iso(dt_obj: dt.datetime) -> str:
    return dt_obj.isoformat(timespec="seconds")


def _ts_for_filename(dt_obj: dt.datetime) -> str:
    return dt_obj.strftime("%Y%m%d_%H%M%S")


def _write_json_atomic(path: Path, obj: Dict[str, Any]) -> None:
    """Atomic JSON write."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.tmp_{uuid.uuid4().hex}"
    data = json.dumps(obj, ensure_ascii=False, indent=2) + "\n"
    with tmp.open("w", encoding="utf-8", newline="\n") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(str(tmp), str(path))


def _append_jsonl(path: Path, record: Dict[str, Any]) -> None:
    """Append a record to a JSONL file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _safe_read_json(path: Path) -> tuple[Optional[Dict[str, Any]], List[str]]:
    """Safely read JSON file."""
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


# ============================================================================
# Action implementations
# ============================================================================

def _deep_merge(base: Dict[str, Any], overlay: Dict[str, Any]) -> Dict[str, Any]:
    """Deep merge overlay into base. Lists are concatenated, dicts are recursed."""
    result = dict(base)
    for key, val in overlay.items():
        if key in result and isinstance(result[key], dict) and isinstance(val, dict):
            result[key] = _deep_merge(result[key], val)
        elif key in result and isinstance(result[key], list) and isinstance(val, list):
            result[key] = result[key] + val
        else:
            result[key] = val
    return result


def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """List available actions for k_checkpoint."""
    return {
        "ok": True,
        "data": {
            "tool": "k_checkpoint",
            "description": "Session/thread persistence with JSON payloads",
            "actions": {
                "help": "Show this help",
                "save": "Save checkpoint. Params: name (required), data (required), summary, tags, worklog (bool), task_id (auto-link sidecar), agent_id (auto-detected from env)",
                "append": "Update latest checkpoint in-place. Params: name (required), data (deep-merged), summary (replaced if given), tags (appended)",
                "list": "List checkpoints. Params: name (filter), limit",
                "load": "Load checkpoint. Params: id (or 'latest' for global latest), name (for namespace latest), agent_id (for agent-specific latest)",
            },
            "checkpoint_root": str(_get_checkpoint_root()),
        },
        "error": None,
    }


def _read_task_meta() -> Dict[str, Any]:
    """Read ai/task-meta.json, return empty structure if missing."""
    meta_path = get_project_root() / "ai" / "task-meta.json"
    try:
        with meta_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"version": 1, "tasks": {}}


def _write_task_meta(meta: Dict[str, Any]) -> None:
    """Write ai/task-meta.json atomically."""
    meta_path = get_project_root() / "ai" / "task-meta.json"
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    _write_json_atomic(meta_path, meta)


def _link_task_sidecar(task_id: str, checkpoint_id: str, worklog_rel: Optional[str]) -> None:
    """Link checkpoint + worklog to a task in ai/task-meta.json sidecar."""
    meta = _read_task_meta()
    tasks = meta.setdefault("tasks", {})
    entry = tasks.setdefault(task_id, {})
    entry["checkpoint"] = checkpoint_id
    if worklog_rel:
        entry["worklog"] = worklog_rel
    entry["updatedAt"] = _iso(_now_local())
    _write_task_meta(meta)


def _generate_worklog(
    checkpoint_id: str,
    name: str,
    now: dt.datetime,
    summary: str,
    tags: List[str],
    data: Any,
) -> Path:
    """Generate a worklog markdown file and return its path."""
    project_root = get_project_root()
    worklog_dir = project_root / "Docs" / "worklogs"
    worklog_dir.mkdir(parents=True, exist_ok=True)

    desc = _safe_name(name)
    ts = _ts_for_filename(now)
    wl_filename = f"KuroRyuuWorkLog_{ts}_{desc}.md"
    wl_path = worklog_dir / wl_filename

    # Extract cross-reference fields from data
    d = data if isinstance(data, dict) else {}
    plan_file = d.get("plan_file") or "None"
    task_ids = d.get("task_ids", [])
    files_modified = d.get("files_modified", [])
    changes = d.get("changes", {})
    agent = d.get("agent", "claude")

    date_str = now.strftime("%Y-%m-%d %H:%M")
    tasks_str = ", ".join(task_ids) if task_ids else "None"

    lines: List[str] = []
    lines.append(f"# Worklog: {summary or name}\n")
    lines.append(f"**Date:** {date_str}")
    lines.append(f"**Agent:** {agent}")
    lines.append(f"**Checkpoint:** {checkpoint_id} ({name})")
    lines.append(f"**Plan:** {plan_file}")
    lines.append(f"**Tasks:** {tasks_str}")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Summary
    if summary:
        lines.append("## Summary")
        lines.append(summary)
        lines.append("")

    # Tags
    if tags:
        lines.append("## Tags")
        lines.append(", ".join(tags))
        lines.append("")

    # Files modified
    if files_modified:
        lines.append("## Files Modified")
        for f in files_modified:
            lines.append(f"- `{f}`")
        lines.append("")

    # Changes
    if changes and isinstance(changes, dict):
        lines.append("## Changes")
        for key, val in changes.items():
            lines.append(f"- **{key}:** {val}")
        lines.append("")

    content = "\n".join(lines) + "\n"
    wl_path.write_text(content, encoding="utf-8", newline="\n")
    return wl_path


def _action_save(
    name: str = "",
    data: Any = None,
    summary: str = "",
    tags: Optional[List[str]] = None,
    worklog: bool = False,
    task_id: str = "",
    agent_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Save a checkpoint with arbitrary data. Optionally generate a worklog."""
    if not name:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "name is required"}

    if data is None:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "data is required"}

    try:
        root = _get_checkpoint_root()
        now = _now_local()
        safe_name = _safe_name(name)

        # Resolve agent_id: param > env > "unknown"
        resolved_agent_id = agent_id or os.environ.get("KURORYUU_AGENT_ID", "")
        resolved_session_id = os.environ.get("KURORYUU_AGENT_SESSION", "")

        checkpoint_id = f"cp_{_ts_for_filename(now)}_{uuid.uuid4().hex[:8]}"

        checkpoint: Dict[str, Any] = {
            "schema": SCHEMA_V1,
            "id": checkpoint_id,
            "name": safe_name,
            "agent_id": resolved_agent_id,
            "session_id": resolved_session_id,
            "saved_at": _iso(now),
            "summary": summary or "",
            "tags": tags or [],
            "data": data,
        }

        # Generate worklog if requested (before saving checkpoint so we can back-patch)
        worklog_path: Optional[Path] = None
        if worklog:
            worklog_path = _generate_worklog(
                checkpoint_id=checkpoint_id,
                name=name,
                now=now,
                summary=summary or "",
                tags=tags or [],
                data=data,
            )
            # Back-patch worklog path into checkpoint data
            wl_rel = str(worklog_path.relative_to(get_project_root()))
            if isinstance(data, dict):
                existing_wl = data.get("worklog_files", [])
                if wl_rel not in existing_wl:
                    existing_wl.append(wl_rel)
                data["worklog_files"] = existing_wl
                checkpoint["data"] = data

        # Save to name-specific directory
        cp_dir = root / safe_name
        cp_dir.mkdir(parents=True, exist_ok=True)
        filename = f"checkpoint_{_ts_for_filename(now)}.json"
        cp_path = cp_dir / filename
        _write_json_atomic(cp_path, checkpoint)

        # Update index
        index_entry = {
            "id": checkpoint_id,
            "name": safe_name,
            "agent_id": resolved_agent_id,
            "session_id": resolved_session_id,
            "saved_at": _iso(now),
            "path": str(cp_path.relative_to(root)),
            "size_bytes": cp_path.stat().st_size,
            "summary": summary or "",
            "tags": tags or [],
        }
        _append_jsonl(root / "_index.jsonl", index_entry)

        result: Dict[str, Any] = {
            "ok": True,
            "id": checkpoint_id,
            "name": safe_name,
            "path": str(cp_path),
            "saved_at": _iso(now),
        }
        if worklog_path:
            result["worklog_path"] = str(worklog_path)

        # Auto-link task sidecar if task_id provided
        if task_id:
            wl_rel = str(worklog_path.relative_to(get_project_root())).replace("\\", "/") if worklog_path else None
            _link_task_sidecar(task_id, checkpoint_id, wl_rel)
            result["task_linked"] = task_id

        return result
    except Exception as e:
        return {"ok": False, "error_code": "SAVE_FAILED", "message": str(e)}


def _action_append(
    name: str = "",
    data: Any = None,
    summary: str = "",
    tags: Optional[List[str]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Append/update the latest checkpoint for a name in-place.

    - data: deep-merged into existing data (dicts merged, lists concatenated, scalars replaced)
    - summary: replaces existing summary if provided
    - tags: appended to existing tags (deduplicated)
    """
    if not name:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "name is required"}

    try:
        root = _get_checkpoint_root()
        safe_name = _safe_name(name)
        cp_dir = root / safe_name

        if not cp_dir.is_dir():
            return {"ok": False, "error_code": "NOT_FOUND", "message": f"No checkpoints for name: {name}. Use 'save' first."}

        files = sorted(cp_dir.glob("checkpoint_*.json"), key=lambda p: p.name, reverse=True)
        if not files:
            return {"ok": False, "error_code": "NOT_FOUND", "message": f"No checkpoints found for: {name}. Use 'save' first."}

        latest_path = files[0]
        obj, warnings = _safe_read_json(latest_path)
        if obj is None:
            return {"ok": False, "error_code": "READ_FAILED", "message": "Failed to read latest checkpoint", "warnings": warnings}

        now = _now_local()

        # Deep-merge data
        if data is not None:
            existing_data = obj.get("data", {})
            if isinstance(existing_data, dict) and isinstance(data, dict):
                obj["data"] = _deep_merge(existing_data, data)
            else:
                obj["data"] = data

        # Replace summary if provided
        if summary:
            obj["summary"] = summary

        # Append tags (deduplicated)
        if tags:
            existing_tags = obj.get("tags", [])
            merged_tags = list(dict.fromkeys(existing_tags + tags))
            obj["tags"] = merged_tags

        # Update timestamp
        obj["updated_at"] = _iso(now)

        # Write back to same file
        _write_json_atomic(latest_path, obj)

        return {
            "ok": True,
            "id": obj.get("id", latest_path.stem),
            "name": safe_name,
            "path": str(latest_path),
            "updated_at": _iso(now),
        }
    except Exception as e:
        return {"ok": False, "error_code": "APPEND_FAILED", "message": str(e)}


def _action_list(
    name: str = "",
    limit: int = 20,
    **kwargs: Any,
) -> Dict[str, Any]:
    """List available checkpoints."""
    try:
        root = _get_checkpoint_root()
        root.mkdir(parents=True, exist_ok=True)

        checkpoints: List[Dict[str, Any]] = []
        safe_name = _safe_name(name) if name else ""

        # If name specified, look in that directory
        if safe_name:
            cp_dir = root / safe_name
            if cp_dir.is_dir():
                files = sorted(cp_dir.glob("checkpoint_*.json"), key=lambda p: p.name, reverse=True)
                for p in files[:max(1, int(limit or 20))]:
                    obj, _ = _safe_read_json(p)
                    if obj:
                        checkpoints.append({
                            "id": obj.get("id", p.stem),
                            "name": obj.get("name", safe_name),
                            "saved_at": obj.get("saved_at", ""),
                            "size_bytes": p.stat().st_size,
                            "summary": obj.get("summary", ""),
                            "tags": obj.get("tags", []),
                            "path": str(p),
                        })
        else:
            # Use index file for global listing (already in append order = chronological)
            index_path = root / "_index.jsonl"
            if index_path.exists():
                # Read all entries, reverse to get newest first
                entries = []
                with index_path.open("r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            try:
                                entries.append(json.loads(line))
                            except json.JSONDecodeError:
                                continue
                # Reverse to get newest first (appended last = newest)
                entries.reverse()
                # Apply limit and build response
                for entry in entries[:limit]:
                    checkpoints.append({
                        "id": entry.get("id", ""),
                        "name": entry.get("name", ""),
                        "saved_at": entry.get("saved_at", ""),
                        "size_bytes": entry.get("size_bytes", 0),
                        "summary": entry.get("summary", ""),
                        "tags": entry.get("tags", []),
                        "path": str(root / entry.get("path", "")),
                    })
            else:
                # Fallback: scan all directories (collect ALL first, then sort)
                for cp_dir in root.iterdir():
                    if not cp_dir.is_dir() or cp_dir.name.startswith("_"):
                        continue
                    for p in cp_dir.glob("checkpoint_*.json"):
                        obj, _ = _safe_read_json(p)
                        if obj:
                            checkpoints.append({
                                "id": obj.get("id", p.stem),
                                "name": obj.get("name", cp_dir.name),
                                "saved_at": obj.get("saved_at", ""),
                                "size_bytes": p.stat().st_size,
                                "summary": obj.get("summary", ""),
                                "tags": obj.get("tags", []),
                                "path": str(p),
                            })
                # Sort by saved_at descending, then apply limit
                checkpoints.sort(key=lambda x: x.get("saved_at", ""), reverse=True)
                checkpoints = checkpoints[:limit]

        return {"ok": True, "count": len(checkpoints), "checkpoints": checkpoints}
    except Exception as e:
        return {"ok": False, "error_code": "LIST_FAILED", "message": str(e)}


def _load_latest_for_agent(agent_id: str, session_id: str = "") -> Optional[Dict[str, Any]]:
    """Load the latest checkpoint for a given agent_id (or session_id).

    Scans _index.jsonl in reverse order for matching agent_id or session_id.
    Returns the full checkpoint dict or None.
    """
    root = _get_checkpoint_root()
    index_path = root / "_index.jsonl"
    if not index_path.exists():
        return None

    # Read all index entries, find latest match
    entries = []
    try:
        with index_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    except Exception:
        return None

    # Reverse to check newest first
    entries.reverse()

    for entry in entries:
        if agent_id and entry.get("agent_id") == agent_id:
            cp_path = root / entry.get("path", "")
            if cp_path.exists():
                obj, _ = _safe_read_json(cp_path)
                return obj
        elif session_id and entry.get("session_id") == session_id:
            cp_path = root / entry.get("path", "")
            if cp_path.exists():
                obj, _ = _safe_read_json(cp_path)
                return obj

    return None


def _action_load(
    id: str = "",
    name: str = "",
    agent_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Load a checkpoint by ID, latest by name, or latest for an agent."""
    # Resolve agent_id from param or env
    resolved_agent_id = agent_id or ""
    resolved_session_id = ""

    # If agent_id provided (no name or id): load latest for that agent
    if resolved_agent_id and not name and not id:
        checkpoint = _load_latest_for_agent(resolved_agent_id)
        if checkpoint:
            return {"ok": True, "checkpoint": checkpoint, "matched_by": "agent_id"}
        return {"ok": False, "error_code": "NOT_FOUND", "message": f"No checkpoints found for agent: {resolved_agent_id}"}

    if not id and not name:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "id, name, or agent_id is required"}

    try:
        root = _get_checkpoint_root()

        # If loading by name (latest within that namespace)
        if name and (not id or id == "latest"):
            safe_name = _safe_name(name)
            cp_dir = root / safe_name
            if not cp_dir.is_dir():
                return {"ok": False, "error_code": "NOT_FOUND", "message": f"No checkpoints for name: {name}"}

            files = sorted(cp_dir.glob("checkpoint_*.json"), key=lambda p: p.name, reverse=True)
            if not files:
                return {"ok": False, "error_code": "NOT_FOUND", "message": f"No checkpoints found for: {name}"}

            obj, warnings = _safe_read_json(files[0])
            if obj is None:
                return {"ok": False, "error_code": "READ_FAILED", "message": f"Failed to read checkpoint", "warnings": warnings}

            return {"ok": True, "checkpoint": obj, "path": str(files[0])}

        # Global latest - find newest checkpoint across all namespaces
        if id == "latest" and not name:
            all_checkpoints: List[tuple[str, Path, Dict[str, Any]]] = []
            for cp_dir in root.iterdir():
                if not cp_dir.is_dir() or cp_dir.name.startswith("_"):
                    continue
                for p in cp_dir.glob("checkpoint_*.json"):
                    obj, _ = _safe_read_json(p)
                    if obj and obj.get("saved_at"):
                        all_checkpoints.append((obj["saved_at"], p, obj))

            if not all_checkpoints:
                return {"ok": False, "error_code": "NOT_FOUND", "message": "No checkpoints found"}

            # Sort by saved_at descending and return newest
            all_checkpoints.sort(key=lambda x: x[0], reverse=True)
            _, newest_path, newest_obj = all_checkpoints[0]
            return {"ok": True, "checkpoint": newest_obj, "path": str(newest_path)}

        # Loading by specific ID - search all directories
        for cp_dir in root.iterdir():
            if not cp_dir.is_dir() or cp_dir.name.startswith("_"):
                continue
            for p in cp_dir.glob("checkpoint_*.json"):
                obj, _ = _safe_read_json(p)
                if obj and obj.get("id") == id:
                    return {"ok": True, "checkpoint": obj, "path": str(p)}

        return {"ok": False, "error_code": "NOT_FOUND", "message": f"Checkpoint not found: {id}"}
    except Exception as e:
        return {"ok": False, "error_code": "LOAD_FAILED", "message": str(e)}


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "save": _action_save,
    "append": _action_append,
    "list": _action_list,
    "load": _action_load,
}


def k_checkpoint(
    action: str,
    name: str = "",
    data: Any = None,
    summary: str = "",
    tags: Optional[List[str]] = None,
    limit: int = 20,
    id: str = "",
    worklog: bool = False,
    task_id: str = "",
    agent_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Checkpoint - Session/thread persistence.

    Routed tool with actions: help, save, append, list, load

    Args:
        action: Action to perform (required)
        name: Checkpoint namespace/name (for save, list, load)
        data: JSON-serializable data to save (for save)
        summary: Human-readable summary (for save)
        tags: Tags for categorization (for save)
        limit: Max checkpoints to return (for list)
        id: Checkpoint ID (for load, use 'latest' for most recent)
        worklog: Auto-generate worklog file alongside checkpoint (for save)
        task_id: Task ID to auto-link checkpoint+worklog in ai/task-meta.json (for save)
        agent_id: Agent identifier (auto-detected from KURORYUU_AGENT_ID env if not provided)

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
        name=name,
        data=data,
        summary=summary,
        tags=tags,
        limit=limit,
        id=id,
        worklog=worklog,
        task_id=task_id,
        agent_id=agent_id,
        **kwargs,
    )


# ============================================================================
# Tool registration
# ============================================================================

def register_checkpoint_tools(registry: "ToolRegistry") -> None:
    """Register k_checkpoint routed tool with the registry."""

    registry.register(
        name="k_checkpoint",
        description="Session/thread persistence. Actions: help, save, append, list, load",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "save", "append", "list", "load"],
                    "description": "Action to perform",
                },
                "name": {
                    "type": "string",
                    "description": "Checkpoint namespace/name",
                },
                "data": {
                    "description": "JSON-serializable data to save (for save)",
                },
                "summary": {
                    "type": "string",
                    "description": "Human-readable summary (for save)",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tags for categorization (for save)",
                },
                "limit": {
                    "type": "integer",
                    "default": 20,
                    "description": "Max checkpoints to return (for list)",
                },
                "id": {
                    "type": "string",
                    "description": "Checkpoint ID (for load, use 'latest' for most recent)",
                },
                "worklog": {
                    "type": "boolean",
                    "default": False,
                    "description": "Auto-generate worklog file alongside checkpoint (for save)",
                },
                "task_id": {
                    "type": "string",
                    "default": "",
                    "description": "Task ID (e.g. T001) to auto-link checkpoint+worklog in ai/task-meta.json",
                },
                "agent_id": {
                    "type": "string",
                    "default": "",
                    "description": "Agent identifier. Auto-detected from KURORYUU_AGENT_ID env if not provided. Used for save (tagging) and load (agent-specific latest).",
                },
            },
            "required": ["action"],
        },
        handler=k_checkpoint,
    )
