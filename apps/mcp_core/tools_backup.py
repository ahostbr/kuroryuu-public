"""k_backup - Restic backup management with git-like snapshots.

Layout:
  ~/.kuroryuu/restic-local-settings/backup_config.json
  ~/.kuroryuu/restic-local-settings/exclusions.txt
  ~/.kuroryuu/bin/restic.exe
  ~/.kuroryuu/restic-repo/

Routed tool: k_backup(action, ...)
Actions: help, init, backup, list, restore, diff, check, forget, prune, config
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

try:
    from .backup import BackupConfig, ResticWrapper
    from .backup.downloader import ensure_restic, get_restic_version, is_restic_installed
    from .backup.snapshot_utils import build_snapshot_chain, enrich_snapshot
except ImportError:
    from backup import BackupConfig, ResticWrapper
    from backup.downloader import ensure_restic, get_restic_version, is_restic_installed
    from backup.snapshot_utils import build_snapshot_chain, enrich_snapshot

# Module-level password cache — persists across MCP calls within same process
_cached_password: str | None = None


def _get_configured_wrapper(password: str = "", **kwargs) -> tuple:
    """Get BackupConfig + ResticWrapper with password persistence."""
    global _cached_password
    config = BackupConfig()
    config.load()
    pw = password or _cached_password
    if pw:
        config.set_cached_password(pw)
        _cached_password = pw
    return config, ResticWrapper(config)


# ============================================================================
# Action implementations
# ============================================================================


def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """Show help for k_backup tool."""
    config = BackupConfig()
    config.load()

    return {
        "ok": True,
        "tool": "k_backup",
        "description": "Restic backup management with git-like snapshots",
        "actions": {
            "help": "Show this help",
            "init": "Initialize repository. Params: password (required), repo_path (optional)",
            "backup": "Create snapshot. Params: source_path, message, tags, background",
            "list": "List snapshots. Params: limit (default 50)",
            "restore": "Restore snapshot. Params: snapshot_id (required), target_path (required), include",
            "diff": "Compare snapshots. Params: snapshot_id (required), compare_to (default: latest)",
            "check": "Verify repository integrity",
            "forget": "Remove snapshot. Params: snapshot_id (required), prune (bool)",
            "forget_policy": "Apply retention policy and prune. Uses config retention.* settings",
            "prune": "Compact repository (reclaim space)",
            "config": "Get/set configuration. Params: key, value, get_all",
            "status": "Check setup status (binary, repo, config)",
        },
        "config_dir": str(config.config_dir),
        "is_configured": config.is_configured(),
    }


def _action_status(**kwargs: Any) -> Dict[str, Any]:
    """Check backup system status."""
    config, _ = _get_configured_wrapper(**kwargs)

    # Check binary
    binary_installed = is_restic_installed()
    binary_version = get_restic_version() if binary_installed else None

    # Check repository
    repo_path = config.get_repo_path()
    repo_exists = repo_path.exists()
    repo_initialized = config.get("repository.initialized", False)

    # Check configuration
    source_configured = bool(config.get("backup.source_path"))

    return {
        "ok": True,
        "restic": {
            "installed": binary_installed,
            "version": binary_version,
            "path": None,
            "downloaded": False,
        },
        "repository": {
            "path": str(repo_path),
            "exists": repo_exists,
            "initialized": repo_initialized,
        },
        "config": {
            "source_path": config.get("backup.source_path"),
            "source_configured": source_configured,
            "exclusions_count": len(config.get_exclusions()),
        },
        "is_ready": binary_installed and repo_initialized and source_configured,
    }


def _action_ensure(**kwargs: Any) -> Dict[str, Any]:
    """Ensure restic binary is installed, download if needed."""
    result = ensure_restic()
    if result.get("ok"):
        return {
            "ok": True,
            "restic": {
                "installed": True,
                "path": result.get("path"),
                "version": result.get("version"),
                "downloaded": result.get("downloaded", False),
            },
        }
    return {"ok": False, "restic": {"installed": False, "path": None, "version": None, "downloaded": False}, "error": result.get("error")}


def _action_init(
    password: str = "",
    repo_path: str = "",
    source_path: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Initialize a new Restic repository."""
    global _cached_password
    if not password:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "password is required"}

    config = BackupConfig()
    config.load()
    _cached_password = password
    config.set_cached_password(password)

    # Set repo path if provided
    if repo_path:
        config.set("repository.path", repo_path)

    # Set source path if provided
    if source_path:
        config.set("backup.source_path", source_path)

    # Ensure binary exists
    binary_result = ensure_restic()
    if not binary_result.get("ok"):
        return {
            "ok": False,
            "error_code": "BINARY_FAILED",
            "message": f"Failed to ensure restic binary: {binary_result.get('error')}",
        }

    # Initialize repository
    wrapper = ResticWrapper(config)
    result = wrapper.init_repository(password)

    if result.get("ok"):
        return {
            "ok": True,
            "message": "Repository initialized successfully",
            "repo_path": str(config.get_repo_path()),
            "binary_path": binary_result.get("path"),
            "binary_version": binary_result.get("version"),
        }
    else:
        return {
            "ok": False,
            "error_code": "INIT_FAILED",
            "message": result.get("error") or result.get("output"),
        }


def _action_backup(
    source_path: str = "",
    message: str = "",
    tags: Optional[List[str]] = None,
    background: bool = False,
    password: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Create a new backup snapshot."""
    config, wrapper = _get_configured_wrapper(password=password)

    # Use provided source or configured source
    backup_source = source_path or config.get("backup.source_path")
    if not backup_source:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "source_path is required"}

    # Generate session ID for background mode
    session_id = str(uuid.uuid4())[:8] if background else None

    result = wrapper.create_backup(
        source_path=backup_source,
        message=message or "Manual backup",
        tags=tags,
        session_id=session_id,
    )

    if background:
        return {
            "ok": True,
            "message": "Backup started in background",
            "session_id": session_id,
        }

    if result.get("ok"):
        summary = result.get("summary", {})
        return {
            "ok": True,
            "message": "Backup completed",
            "snapshot_id": summary.get("snapshot_id") if summary else None,
            "files_new": summary.get("files_new", 0) if summary else 0,
            "files_changed": summary.get("files_changed", 0) if summary else 0,
            "data_added": summary.get("data_added", 0) if summary else 0,
        }
    else:
        return {
            "ok": False,
            "error_code": "BACKUP_FAILED",
            "message": result.get("error") or "Backup failed",
        }


def _action_list(
    limit: int = 50,
    password: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """List all snapshots with git-like metadata."""
    config, wrapper = _get_configured_wrapper(password=password)
    result = wrapper.list_snapshots(limit=limit)

    if not result.get("ok"):
        return {
            "ok": False,
            "error_code": "LIST_FAILED",
            "message": result.get("error"),
        }

    # Enrich snapshots with git-like metadata
    raw_snapshots = result.get("snapshots", [])
    enriched = build_snapshot_chain(raw_snapshots)

    return {
        "ok": True,
        "snapshots": enriched,
        "count": len(enriched),
        "total_count": result.get("total_count", len(enriched)),
    }


def _action_restore(
    snapshot_id: str = "",
    target_path: str = "",
    include: Optional[List[str]] = None,
    background: bool = False,
    password: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Restore files from a snapshot."""
    if not snapshot_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "snapshot_id is required"}
    if not target_path:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "target_path is required"}

    config, wrapper = _get_configured_wrapper(password=password)

    session_id = str(uuid.uuid4())[:8] if background else None

    result = wrapper.restore_snapshot(
        snapshot_id=snapshot_id,
        target_path=target_path,
        include_paths=include,
        session_id=session_id,
    )

    if background:
        return {
            "ok": True,
            "message": "Restore started in background",
            "session_id": session_id,
        }

    if result.get("ok"):
        return {
            "ok": True,
            "message": "Restore completed",
            "snapshot_id": snapshot_id,
            "target_path": target_path,
        }
    else:
        return {
            "ok": False,
            "error_code": "RESTORE_FAILED",
            "message": result.get("error"),
        }


def _action_diff(
    snapshot_id: str = "",
    compare_to: str = "latest",
    password: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Compare snapshot to another snapshot."""
    if not snapshot_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "snapshot_id is required"}

    config, wrapper = _get_configured_wrapper(password=password)
    result = wrapper.diff_snapshot(snapshot_id, compare_to)

    if not result.get("ok"):
        return {
            "ok": False,
            "error_code": "DIFF_FAILED",
            "message": result.get("error"),
        }

    return {
        "ok": True,
        "snapshot_id": snapshot_id,
        "compare_to": result.get("compare_to"),
        "added": result.get("added", []),
        "removed": result.get("removed", []),
        "modified": result.get("modified", []),
        "stats": {
            "added_count": len(result.get("added", [])),
            "removed_count": len(result.get("removed", [])),
            "modified_count": len(result.get("modified", [])),
        },
    }


def _action_check(password: str = "", **kwargs: Any) -> Dict[str, Any]:
    """Verify repository integrity."""
    config, wrapper = _get_configured_wrapper(password=password)
    result = wrapper.check_integrity()

    if result.get("ok"):
        return {
            "ok": True,
            "message": "Repository integrity verified",
            "output": result.get("output"),
        }
    else:
        return {
            "ok": False,
            "error_code": "CHECK_FAILED",
            "message": result.get("error") or result.get("output"),
        }


def _action_forget(
    snapshot_id: str = "",
    prune: bool = False,
    password: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Remove a snapshot from repository."""
    if not snapshot_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "snapshot_id is required"}

    config, wrapper = _get_configured_wrapper(password=password)
    result = wrapper.forget_snapshot(snapshot_id, prune=prune)

    if result.get("ok"):
        return {
            "ok": True,
            "message": f"Snapshot {snapshot_id} forgotten" + (" and pruned" if prune else ""),
        }
    else:
        return {
            "ok": False,
            "error_code": "FORGET_FAILED",
            "message": result.get("error"),
        }


def _action_prune(password: str = "", **kwargs: Any) -> Dict[str, Any]:
    """Compact repository to reclaim space."""
    config, wrapper = _get_configured_wrapper(password=password)
    result = wrapper.prune_repository()

    if result.get("ok"):
        return {
            "ok": True,
            "message": "Repository pruned successfully",
            "output": result.get("output"),
        }
    else:
        return {
            "ok": False,
            "error_code": "PRUNE_FAILED",
            "message": result.get("error"),
        }


def _action_config(
    key: str = "",
    value: Any = None,
    get_all: bool = False,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Get or set configuration values."""
    config, _ = _get_configured_wrapper(**kwargs)

    # Get all config
    if get_all:
        return {
            "ok": True,
            "config": config._config,
            "exclusions": config.get_exclusions(),
        }

    # Get specific key
    if key and value is None:
        return {
            "ok": True,
            "key": key,
            "value": config.get(key),
        }

    # Set key
    if key and value is not None:
        # Special handling for exclusions
        if key == "exclusions" and isinstance(value, list):
            config.set_exclusions(value)
            return {
                "ok": True,
                "message": f"Set {len(value)} exclusion patterns",
            }

        config.set(key, value)
        return {
            "ok": True,
            "message": f"Set {key} = {value}",
        }

    return {"ok": False, "error_code": "INVALID_PARAMS", "message": "Provide key, or get_all=True"}


def _action_forget_policy(password: str = "", **kwargs: Any) -> Dict[str, Any]:
    """Remove old snapshots based on retention policy."""
    config, wrapper = _get_configured_wrapper(password=password)

    retention = {
        "keep_last": config.get("retention.keep_last", 30),
        "keep_daily": config.get("retention.keep_daily", 7),
        "keep_weekly": config.get("retention.keep_weekly", 4),
        "keep_monthly": config.get("retention.keep_monthly", 6),
    }

    result = wrapper.forget_by_policy(retention, prune=True)

    if result.get("ok"):
        return {
            "ok": True,
            "message": "Retention policy applied",
            "retention": retention,
            "output": result.get("output"),
        }
    else:
        return {
            "ok": False,
            "error_code": "FORGET_POLICY_FAILED",
            "message": result.get("error"),
        }


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "status": _action_status,
    "ensure": _action_ensure,
    "init": _action_init,
    "backup": _action_backup,
    "list": _action_list,
    "restore": _action_restore,
    "diff": _action_diff,
    "check": _action_check,
    "forget": _action_forget,
    "forget_policy": _action_forget_policy,
    "prune": _action_prune,
    "config": _action_config,
}


def k_backup(
    action: str,
    # Init params
    password: str = "",
    repo_path: str = "",
    # Backup params
    source_path: str = "",
    message: str = "",
    tags: Optional[List[str]] = None,
    background: bool = False,
    # List params
    limit: int = 50,
    # Restore params
    snapshot_id: str = "",
    target_path: str = "",
    include: Optional[List[str]] = None,
    # Diff params
    compare_to: str = "latest",
    # Forget params
    prune: bool = False,
    # Config params
    key: str = "",
    value: Any = None,
    get_all: bool = False,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Restic Backup Manager.

    Routed tool with actions: help, status, init, backup, list, restore, diff, check, forget, forget_policy, prune, config

    Args:
        action: Action to perform (required)
        password: Repository password (for init, or to cache for session)
        repo_path: Repository path (for init)
        source_path: Path to backup (for backup)
        message: Commit message (for backup)
        tags: Tags for snapshot (for backup)
        background: Run in background with streaming (for backup, restore)
        limit: Max snapshots to return (for list)
        snapshot_id: Snapshot ID (for restore, diff, forget)
        target_path: Restore target path (for restore)
        include: Paths to include in restore (for restore)
        compare_to: Snapshot to compare to (for diff)
        prune: Also prune after forget (for forget)
        key: Config key (for config)
        value: Config value to set (for config)
        get_all: Return all config (for config)

    Returns:
        {ok, ...} response dict
    """
    act = (action or "").strip().lower()

    if not act:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "action is required. Use action='help' for available actions.",
            "available_actions": list(ACTION_HANDLERS.keys()),
        }

    handler = ACTION_HANDLERS.get(act)
    if not handler:
        return {
            "ok": False,
            "error_code": "UNKNOWN_ACTION",
            "message": f"Unknown action: {act}",
            "available_actions": list(ACTION_HANDLERS.keys()),
        }

    return handler(
        password=password,
        repo_path=repo_path,
        source_path=source_path,
        message=message,
        tags=tags,
        background=background,
        limit=limit,
        snapshot_id=snapshot_id,
        target_path=target_path,
        include=include,
        compare_to=compare_to,
        prune=prune,
        key=key,
        value=value,
        get_all=get_all,
        **kwargs,
    )


# ============================================================================
# Tool registration
# ============================================================================


def register_backup_tools(registry: "ToolRegistry") -> None:
    """Register k_backup routed tool with the registry."""

    registry.register(
        name="k_backup",
        description=(
            "Restic backup management with git-like snapshots. "
            "Actions: help, status, init, backup, list, restore, diff, check, forget, forget_policy, prune, config"
        ),
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "status", "init", "backup", "list", "restore", "diff", "check", "forget", "forget_policy", "prune", "config"],
                    "description": "Action to perform",
                },
                "password": {
                    "type": "string",
                    "description": "Repository password (for init, or to cache for session)",
                },
                "repo_path": {
                    "type": "string",
                    "description": "Repository path (for init)",
                },
                "source_path": {
                    "type": "string",
                    "description": "Path to backup (for backup)",
                },
                "message": {
                    "type": "string",
                    "description": "Commit message (for backup)",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tags for snapshot (for backup)",
                },
                "background": {
                    "type": "boolean",
                    "default": False,
                    "description": "Run in background with streaming (for backup, restore)",
                },
                "limit": {
                    "type": "integer",
                    "default": 50,
                    "description": "Max snapshots to return (for list)",
                },
                "snapshot_id": {
                    "type": "string",
                    "description": "Snapshot ID (for restore, diff, forget)",
                },
                "target_path": {
                    "type": "string",
                    "description": "Restore target path (for restore)",
                },
                "include": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Paths to include in restore (for restore)",
                },
                "compare_to": {
                    "type": "string",
                    "default": "latest",
                    "description": "Snapshot to compare to (for diff)",
                },
                "prune": {
                    "type": "boolean",
                    "default": False,
                    "description": "Also prune after forget (for forget)",
                },
                "key": {
                    "type": "string",
                    "description": "Config key (for config)",
                },
                "value": {
                    "description": "Config value to set (for config)",
                },
                "get_all": {
                    "type": "boolean",
                    "default": False,
                    "description": "Return all config (for config)",
                },
            },
            "required": ["action"],
        },
        handler=k_backup,
    )
