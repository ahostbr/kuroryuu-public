"""Git-like snapshot metadata utilities.

Enriches restic snapshot data with:
- Short IDs (like git commit hashes)
- Parent references
- File change stats
- Human-readable formatting
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def format_bytes(size_bytes: int) -> str:
    """Format bytes as human-readable string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def format_time_ago(timestamp: str) -> str:
    """Format ISO timestamp as relative time (e.g., '2 hours ago')."""
    try:
        if not timestamp:
            return "unknown"

        # Parse ISO timestamp
        if timestamp.endswith("Z"):
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(timestamp)

        # Convert to UTC for comparison
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        delta = now - dt

        seconds = delta.total_seconds()
        if seconds < 0:
            return "in the future"
        elif seconds < 60:
            return "just now"
        elif seconds < 3600:
            mins = int(seconds / 60)
            return f"{mins} minute{'s' if mins != 1 else ''} ago"
        elif seconds < 86400:
            hours = int(seconds / 3600)
            return f"{hours} hour{'s' if hours != 1 else ''} ago"
        elif seconds < 604800:
            days = int(seconds / 86400)
            return f"{days} day{'s' if days != 1 else ''} ago"
        elif seconds < 2592000:
            weeks = int(seconds / 604800)
            return f"{weeks} week{'s' if weeks != 1 else ''} ago"
        elif seconds < 31536000:
            months = int(seconds / 2592000)
            return f"{months} month{'s' if months != 1 else ''} ago"
        else:
            years = int(seconds / 31536000)
            return f"{years} year{'s' if years != 1 else ''} ago"
    except Exception:
        return timestamp


def extract_message_from_tags(tags: List[str]) -> Optional[str]:
    """Extract commit message from restic tags.

    Looks for tags with format: msg_<message>
    """
    for tag in tags:
        if tag.startswith("msg_"):
            return tag[4:].replace("_", " ")
    return None


def enrich_snapshot(
    snapshot: Dict[str, Any],
    parent_id: Optional[str] = None,
    stats: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Enrich restic snapshot with git-like metadata.

    Args:
        snapshot: Raw restic snapshot data
        parent_id: ID of parent snapshot (for lineage)
        stats: Optional backup stats {files_new, files_changed, ...}

    Returns:
        Enriched snapshot with additional fields
    """
    snapshot_id = str(snapshot.get("id", ""))
    short_id = snapshot_id[:8] if snapshot_id else ""
    tags = snapshot.get("tags") or []
    timestamp = snapshot.get("time", "")

    # Extract message from tags or summary field
    message = (
        snapshot.get("summary")
        or snapshot.get("message")
        or extract_message_from_tags(tags)
        or ""
    )

    # Default stats
    default_stats = {
        "files_new": 0,
        "files_changed": 0,
        "files_unmodified": 0,
        "dirs_new": 0,
        "dirs_changed": 0,
        "dirs_unmodified": 0,
        "data_added": 0,
        "total_files_processed": 0,
        "total_bytes_processed": 0,
    }

    merged_stats = {**default_stats, **(stats or {})}

    return {
        # Core IDs
        "id": snapshot_id,
        "short_id": short_id,
        "parent": parent_id,
        "tree": snapshot.get("tree"),

        # Timestamps
        "time": timestamp,
        "time_ago": format_time_ago(timestamp),

        # Metadata
        "hostname": str(snapshot.get("hostname") or snapshot.get("host") or ""),
        "username": str(snapshot.get("username") or snapshot.get("user") or ""),
        "tags": [t for t in tags if not t.startswith("msg_")],
        "paths": snapshot.get("paths") or [],

        # Git-like commit info
        "message": message,

        # Stats
        "stats": merged_stats,

        # Formatted display values
        "formatted": {
            "time_ago": format_time_ago(timestamp),
            "data_added": format_bytes(merged_stats.get("data_added", 0)),
            "total_size": format_bytes(merged_stats.get("total_bytes_processed", 0)),
            "files_summary": _format_file_summary(merged_stats),
        },
    }


def _format_file_summary(stats: Dict[str, Any]) -> str:
    """Format file stats as git-style summary (e.g., '+42 ~18 -5')."""
    parts = []

    files_new = stats.get("files_new", 0)
    files_changed = stats.get("files_changed", 0)
    dirs_new = stats.get("dirs_new", 0)

    if files_new or dirs_new:
        parts.append(f"+{files_new + dirs_new}")
    if files_changed:
        parts.append(f"~{files_changed}")

    if not parts:
        total = stats.get("total_files_processed", 0)
        if total:
            return f"{total} files"
        return "no changes"

    return " ".join(parts)


def build_snapshot_chain(snapshots: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build parent-child relationships for snapshot list.

    Assumes snapshots are sorted by time descending (newest first).
    Each snapshot's parent is the next one in the list (previous in time).
    """
    result = []
    for i, snap in enumerate(snapshots):
        parent_id = snapshots[i + 1]["id"] if i + 1 < len(snapshots) else None
        enriched = enrich_snapshot(snap, parent_id=parent_id)
        result.append(enriched)
    return result


def parse_restic_diff_output(output: str) -> Dict[str, List[Dict[str, Any]]]:
    """Parse restic diff command output.

    Restic diff output format:
    +    /path/to/new/file
    -    /path/to/removed/file
    M    /path/to/modified/file

    Returns:
        {added: [...], removed: [...], modified: [...]}
    """
    result = {
        "added": [],
        "removed": [],
        "modified": [],
    }

    for line in output.strip().split("\n"):
        line = line.strip()
        if not line:
            continue

        if line.startswith("+"):
            path = line[1:].strip()
            if path:
                result["added"].append({"path": path, "status": "added"})
        elif line.startswith("-"):
            path = line[1:].strip()
            if path:
                result["removed"].append({"path": path, "status": "removed"})
        elif line.startswith("M") or line.startswith("C"):
            path = line[1:].strip()
            if path:
                result["modified"].append({"path": path, "status": "modified"})

    return result


def parse_restic_json_progress(line: str) -> Optional[Dict[str, Any]]:
    """Parse a restic JSON progress line.

    Restic --json output includes lines like:
    {"message_type":"status","percent_done":0.5,...}
    {"message_type":"summary","files_new":10,...}
    """
    import json

    try:
        data = json.loads(line)
        msg_type = data.get("message_type")

        if msg_type == "status":
            return {
                "type": "progress",
                "percent": data.get("percent_done", 0) * 100,
                "files_done": data.get("files_done", 0),
                "bytes_done": data.get("bytes_done", 0),
                "total_files": data.get("total_files", 0),
                "total_bytes": data.get("total_bytes", 0),
                "current_files": data.get("current_files", []),
            }
        elif msg_type == "summary":
            return {
                "type": "summary",
                "snapshot_id": data.get("snapshot_id"),
                "files_new": data.get("files_new", 0),
                "files_changed": data.get("files_changed", 0),
                "files_unmodified": data.get("files_unmodified", 0),
                "dirs_new": data.get("dirs_new", 0),
                "dirs_changed": data.get("dirs_changed", 0),
                "dirs_unmodified": data.get("dirs_unmodified", 0),
                "data_added": data.get("data_added", 0),
                "total_files_processed": data.get("total_files_processed", 0),
                "total_bytes_processed": data.get("total_bytes_processed", 0),
            }
        elif msg_type == "error":
            return {
                "type": "error",
                "message": data.get("error", "Unknown error"),
            }

    except json.JSONDecodeError:
        pass

    return None
