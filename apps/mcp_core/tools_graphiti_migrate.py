"""
Graphiti Migration Tool

Migrates Kuroryuu checkpoints and worklogs to Graphiti knowledge graph.

Actions:
  - help: Show available actions
  - status: Check Graphiti server connectivity
  - dry_run: Preview what would be migrated
  - migrate_checkpoints: Port checkpoints to EntityNodes
  - migrate_worklogs: Port worklogs to Messages (episodic)
  - migrate_all: Run both migrations
"""

import json
import os
import re
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from protocol import ToolRegistry

# Configuration
PROJECT_ROOT = Path(__file__).parent.parent.parent  # mcp_core -> apps -> Kuroryuu
GRAPHITI_SERVER_URL = os.environ.get("GRAPHITI_SERVER_URL", "http://127.0.0.1:8000")
CHECKPOINT_INDEX = PROJECT_ROOT / "ai" / "checkpoints" / "_index.jsonl"
WORKLOGS_DIR = PROJECT_ROOT / "Docs" / "worklogs"
DEFAULT_GROUP_ID = "kuroryuu"


# ============================================================================
# HTTP Helpers
# ============================================================================

def _http_request(endpoint: str, method: str = "GET", data: Optional[Dict] = None) -> Dict[str, Any]:
    """Make HTTP request to Graphiti server."""
    url = f"{GRAPHITI_SERVER_URL}{endpoint}"

    try:
        if data:
            body = json.dumps(data).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=body,
                method=method,
                headers={"Content-Type": "application/json"},
            )
        else:
            req = urllib.request.Request(url, method=method)

        with urllib.request.urlopen(req, timeout=30) as response:
            result = response.read().decode("utf-8")
            if result:
                return {"ok": True, "data": json.loads(result), "status": response.status}
            return {"ok": True, "data": {}, "status": response.status}

    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"HTTP {e.code}: {e.reason}"}
    except urllib.error.URLError as e:
        return {"ok": False, "error": f"Connection failed: {e.reason}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ============================================================================
# Data Readers
# ============================================================================

def _read_checkpoint_index() -> List[Dict[str, Any]]:
    """Read checkpoints from JSONL index."""
    entries = []
    if CHECKPOINT_INDEX.exists():
        with CHECKPOINT_INDEX.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    return entries


def _read_worklogs(limit: int = 100) -> List[Dict[str, Any]]:
    """Read worklog files from Docs/worklogs/."""
    worklogs = []
    if not WORKLOGS_DIR.exists():
        return worklogs

    # Sort by filename (which contains timestamp) - newest first
    files = sorted(WORKLOGS_DIR.glob("*.md"), reverse=True)[:limit]

    for wl_path in files:
        try:
            content = wl_path.read_text(encoding="utf-8")

            # Extract timestamp from filename: BuddyWorklog_YYYYMMDD_HHMMSS_...
            match = re.search(r"_(\d{8})_(\d{6})_", wl_path.name)
            if match:
                date_str = match.group(1)
                time_str = match.group(2)
                timestamp = datetime.strptime(f"{date_str}{time_str}", "%Y%m%d%H%M%S")
            else:
                timestamp = datetime.now()

            worklogs.append({
                "path": str(wl_path),
                "name": wl_path.stem,
                "content": content,
                "timestamp": timestamp.isoformat() + "Z",
            })
        except Exception:
            continue

    return worklogs


# ============================================================================
# Action Handlers
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """Show help text."""
    return {
        "ok": True,
        "help": """
Graphiti Migration Tool - Actions:

  status              Check Graphiti server connectivity
  dry_run             Preview what would be migrated (no changes)
  migrate_checkpoints Migrate checkpoints to Graphiti EntityNodes
  migrate_worklogs    Migrate worklogs to Graphiti Messages
  migrate_all         Run both migrations

Parameters:
  group_id    Target group ID (default: kuroryuu)
  limit       Max items to migrate (default: 100)

Examples:
  k_graphiti_migrate(action="status")
  k_graphiti_migrate(action="dry_run")
  k_graphiti_migrate(action="migrate_all", group_id="kuroryuu", limit=50)
""",
    }


def _action_status(**kwargs: Any) -> Dict[str, Any]:
    """Check Graphiti server connectivity."""
    result = _http_request("/healthcheck")

    if result.get("ok"):
        return {
            "ok": True,
            "server": GRAPHITI_SERVER_URL,
            "status": "healthy",
            "response": result.get("data"),
        }
    else:
        return {
            "ok": False,
            "server": GRAPHITI_SERVER_URL,
            "status": "unreachable",
            "error": result.get("error"),
        }


def _action_dry_run(**kwargs: Any) -> Dict[str, Any]:
    """Preview migration without making changes."""
    checkpoints = _read_checkpoint_index()
    worklogs = _read_worklogs(limit=kwargs.get("limit", 100))

    return {
        "ok": True,
        "dry_run": True,
        "checkpoint_count": len(checkpoints),
        "worklog_count": len(worklogs),
        "checkpoint_sample": checkpoints[:3] if checkpoints else [],
        "worklog_sample": [
            {"name": w["name"], "timestamp": w["timestamp"]}
            for w in worklogs[:3]
        ],
        "target_group_id": kwargs.get("group_id", DEFAULT_GROUP_ID),
    }


def _action_migrate_checkpoints(**kwargs: Any) -> Dict[str, Any]:
    """Migrate checkpoints to Graphiti EntityNodes."""
    group_id = kwargs.get("group_id", DEFAULT_GROUP_ID)
    limit = kwargs.get("limit", 100)

    checkpoints = _read_checkpoint_index()[:limit]

    if not checkpoints:
        return {"ok": True, "migrated": 0, "message": "No checkpoints found"}

    success_count = 0
    errors = []

    for cp in checkpoints:
        # Build entity node
        tags_str = ", ".join(cp.get("tags", [])) if cp.get("tags") else ""
        summary = cp.get("summary", "")
        if tags_str:
            summary = f"{summary} Tags: {tags_str}" if summary else f"Tags: {tags_str}"

        payload = {
            "uuid": cp.get("id"),
            "group_id": group_id,
            "name": cp.get("name", "unknown"),
            "summary": summary[:500] if summary else "",  # Truncate if too long
        }

        result = _http_request("/entity-node", method="POST", data=payload)

        if result.get("ok"):
            success_count += 1
        else:
            errors.append({"id": cp.get("id"), "error": result.get("error")})

    return {
        "ok": len(errors) == 0,
        "migrated": success_count,
        "total": len(checkpoints),
        "errors": errors[:10],  # Limit error output
        "group_id": group_id,
    }


def _action_migrate_worklogs(**kwargs: Any) -> Dict[str, Any]:
    """Migrate worklogs to Graphiti Messages (episodic)."""
    group_id = kwargs.get("group_id", DEFAULT_GROUP_ID)
    limit = kwargs.get("limit", 100)

    worklogs = _read_worklogs(limit=limit)

    if not worklogs:
        return {"ok": True, "migrated": 0, "message": "No worklogs found"}

    success_count = 0
    errors = []

    for wl in worklogs:
        # Build message payload
        payload = {
            "group_id": group_id,
            "messages": [{
                "content": wl["content"][:10000],  # Truncate very long content
                "role_type": "assistant",
                "role": "kuroryuu-agent",
                "name": wl["name"],
                "timestamp": wl["timestamp"],
                "source_description": f"Worklog migration from {wl['name']}",
            }],
        }

        result = _http_request("/messages", method="POST", data=payload)

        if result.get("ok"):
            success_count += 1
        else:
            errors.append({"name": wl["name"], "error": result.get("error")})

    return {
        "ok": len(errors) == 0,
        "migrated": success_count,
        "total": len(worklogs),
        "errors": errors[:10],
        "group_id": group_id,
    }


def _action_migrate_all(**kwargs: Any) -> Dict[str, Any]:
    """Run both checkpoint and worklog migrations."""
    checkpoint_result = _action_migrate_checkpoints(**kwargs)
    worklog_result = _action_migrate_worklogs(**kwargs)

    return {
        "ok": checkpoint_result.get("ok", False) and worklog_result.get("ok", False),
        "checkpoints": {
            "migrated": checkpoint_result.get("migrated", 0),
            "total": checkpoint_result.get("total", 0),
            "errors": checkpoint_result.get("errors", []),
        },
        "worklogs": {
            "migrated": worklog_result.get("migrated", 0),
            "total": worklog_result.get("total", 0),
            "errors": worklog_result.get("errors", []),
        },
        "group_id": kwargs.get("group_id", DEFAULT_GROUP_ID),
    }


# ============================================================================
# Action Router
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "status": _action_status,
    "dry_run": _action_dry_run,
    "migrate_checkpoints": _action_migrate_checkpoints,
    "migrate_worklogs": _action_migrate_worklogs,
    "migrate_all": _action_migrate_all,
}


def k_graphiti_migrate(action: str, **kwargs: Any) -> Dict[str, Any]:
    """Main tool entry point - dispatcher."""
    act = (action or "").strip().lower()

    if not act:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "action is required"}

    handler = ACTION_HANDLERS.get(act)
    if not handler:
        return {
            "ok": False,
            "error_code": "UNKNOWN_ACTION",
            "message": f"Unknown action: {act}. Use 'help' to see available actions.",
        }

    return handler(**kwargs)


# ============================================================================
# MCP Registration
# ============================================================================

def register_graphiti_migrate_tools(registry: ToolRegistry) -> None:
    """Register with MCP server."""
    registry.register(
        name="k_graphiti_migrate",
        description="Migrate Kuroryuu checkpoints and worklogs to Graphiti knowledge graph. Actions: help, status, dry_run, migrate_checkpoints, migrate_worklogs, migrate_all",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "status", "dry_run", "migrate_checkpoints", "migrate_worklogs", "migrate_all"],
                    "description": "Action to perform",
                },
                "group_id": {
                    "type": "string",
                    "description": "Target Graphiti group ID (default: kuroryuu)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max items to migrate (default: 100)",
                },
            },
            "required": ["action"],
        },
        handler=k_graphiti_migrate,
    )
