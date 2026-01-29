"""Clawdbot integration tool - Autonomous AI worker in Docker container.

k_clawd provides control over the Clawdbot Docker container, allowing
Kuroryuu to delegate tasks to an autonomous AI worker.

**IMPORTANT**: This integration is OPT-IN only. It does not affect
the main Kuroryuu flow when disabled.

Enable via environment variable: KURORYUU_CLAWD_ENABLED=1

Routed tool: k_clawd(action, ...)
Actions: help, status, start, stop, task, cancel, results, inbox, reply, history, config
"""

from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from .paths import get_project_root, get_ai_dir
except ImportError:
    from paths import get_project_root, get_ai_dir

import logging

logger = logging.getLogger("kuroryuu.k_clawd")

# ============================================================================
# Configuration
# ============================================================================

def _is_enabled() -> bool:
    """Check if Clawdbot integration is enabled (opt-in)."""
    return os.environ.get("KURORYUU_CLAWD_ENABLED", "0").strip().lower() in ("1", "true", "yes")


def _get_clawd_url() -> str:
    """Get Clawdbot HTTP bridge URL."""
    return os.environ.get("KURORYUU_CLAWD_URL", "http://localhost:18790")


def _get_clawd_ws_url() -> str:
    """Get Clawdbot WebSocket gateway URL."""
    return os.environ.get("KURORYUU_CLAWD_WS_URL", "ws://localhost:18789")


def _get_container_name() -> str:
    """Get Docker container name."""
    return os.environ.get("KURORYUU_CLAWD_CONTAINER", "clawdbot-gateway")


def _get_container_image() -> str:
    """Get Docker image name."""
    return os.environ.get("KURORYUU_CLAWD_IMAGE", "clawdbot:local")


def _get_task_store_path() -> Path:
    """Get path to task store file."""
    return get_ai_dir() / "clawd_tasks.json"


# ============================================================================
# Task Store (local tracking of delegated tasks)
# ============================================================================

def _load_task_store() -> Dict[str, Any]:
    """Load task store from disk."""
    path = _get_task_store_path()
    if not path.exists():
        return {"tasks": [], "history": []}
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"tasks": [], "history": []}


def _save_task_store(store: Dict[str, Any]) -> None:
    """Save task store to disk."""
    path = _get_task_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)


def _now_iso() -> str:
    """Get current UTC time as ISO string."""
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


# ============================================================================
# Docker helpers
# ============================================================================

def _docker_container_running() -> bool:
    """Check if clawdbot container is running."""
    try:
        result = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Running}}", _get_container_name()],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.stdout.strip().lower() == "true"
    except Exception:
        return False


def _docker_container_exists() -> bool:
    """Check if clawdbot container exists (running or stopped)."""
    try:
        result = subprocess.run(
            ["docker", "inspect", _get_container_name()],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.returncode == 0
    except Exception:
        return False


def _docker_start_container() -> Dict[str, Any]:
    """Start or create the clawdbot container."""
    container = _get_container_name()

    # If container exists, just start it
    if _docker_container_exists():
        try:
            result = subprocess.run(
                ["docker", "start", container],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0:
                return {"ok": True, "message": f"Container {container} started"}
            return {"ok": False, "error": result.stderr.strip()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # Create new container
    try:
        cmd = [
            "docker", "run", "-d",
            "--name", container,
            "-p", "18789:18789",
            "-p", "18790:18790",
            "--add-host=host.docker.internal:host-gateway",
            "-v", "clawdbot-state:/root/.clawdbot",
            "-e", "CLAWDBOT_SKIP_CHANNELS=1",
            "-e", "CLAWDBOT_GATEWAY_BIND=lan",
            _get_container_image(),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            return {"ok": True, "message": f"Container {container} created and started"}
        return {"ok": False, "error": result.stderr.strip()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _docker_stop_container() -> Dict[str, Any]:
    """Stop the clawdbot container."""
    container = _get_container_name()
    try:
        result = subprocess.run(
            ["docker", "stop", container],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            return {"ok": True, "message": f"Container {container} stopped"}
        return {"ok": False, "error": result.stderr.strip()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ============================================================================
# HTTP communication with Clawdbot
# ============================================================================

def _clawd_http_get(endpoint: str) -> Dict[str, Any]:
    """Make GET request to Clawdbot HTTP bridge."""
    try:
        import httpx
        url = f"{_get_clawd_url()}{endpoint}"
        with httpx.Client(timeout=30) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                return {"ok": True, "data": resp.json()}
            return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text}"}
    except ImportError:
        # Fallback to subprocess curl
        try:
            url = f"{_get_clawd_url()}{endpoint}"
            result = subprocess.run(
                ["curl", "-s", url],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0:
                return {"ok": True, "data": json.loads(result.stdout)}
            return {"ok": False, "error": result.stderr.strip()}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _clawd_http_post(endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Make POST request to Clawdbot HTTP bridge."""
    try:
        import httpx
        url = f"{_get_clawd_url()}{endpoint}"
        with httpx.Client(timeout=60) as client:
            resp = client.post(url, json=data)
            if resp.status_code in (200, 201):
                return {"ok": True, "data": resp.json()}
            return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text}"}
    except ImportError:
        # Fallback to subprocess curl
        try:
            url = f"{_get_clawd_url()}{endpoint}"
            result = subprocess.run(
                ["curl", "-s", "-X", "POST", "-H", "Content-Type: application/json",
                 "-d", json.dumps(data), url],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode == 0:
                return {"ok": True, "data": json.loads(result.stdout)}
            return {"ok": False, "error": result.stderr.strip()}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _clawd_exec_command(command: str, message: str = "") -> Dict[str, Any]:
    """Execute clawdbot CLI command inside container."""
    container = _get_container_name()
    try:
        cmd = ["docker", "exec", container, "node", "dist/index.js"]
        cmd.extend(command.split())
        if message:
            cmd.extend(["--message", message])

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
        return {
            "ok": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Command timed out (120s)"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ============================================================================
# Action implementations
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """Show help for k_clawd tool."""
    return {
        "ok": True,
        "data": {
            "tool": "k_clawd",
            "description": "Clawdbot integration - autonomous AI worker in Docker container",
            "enabled": _is_enabled(),
            "actions": {
                "help": "Show this help",
                "status": "Check container status and current task",
                "start": "Start clawdbot container",
                "stop": "Stop clawdbot container",
                "task": "Assign a task to clawdbot (prompt required)",
                "cancel": "Cancel current task",
                "results": "Get results from completed tasks",
                "inbox": "Check messages from clawdbot",
                "reply": "Reply to a clawdbot question (message required)",
                "history": "View task history",
                "config": "Get/set clawdbot configuration",
            },
            "environment_variables": {
                "KURORYUU_CLAWD_ENABLED": "Set to 1 to enable (default: 0)",
                "KURORYUU_CLAWD_URL": f"HTTP bridge URL (default: {_get_clawd_url()})",
                "KURORYUU_CLAWD_CONTAINER": f"Container name (default: {_get_container_name()})",
                "KURORYUU_CLAWD_IMAGE": f"Docker image (default: {_get_container_image()})",
            },
            "example_workflow": [
                'k_clawd(action="start")',
                'k_clawd(action="task", prompt="Research React Server Components")',
                'k_clawd(action="status")',
                'k_clawd(action="results")',
            ],
        },
    }


def _action_status(**kwargs: Any) -> Dict[str, Any]:
    """Check clawdbot status."""
    if not _is_enabled():
        return {
            "ok": False,
            "error": "Clawdbot integration is disabled. Enable with KURORYUU_CLAWD_ENABLED=1",
            "enabled": False,
        }

    container_running = _docker_container_running()
    container_exists = _docker_container_exists()

    # Load current tasks
    store = _load_task_store()
    active_tasks = [t for t in store.get("tasks", []) if t.get("status") == "running"]

    status = {
        "ok": True,
        "enabled": True,
        "container": {
            "name": _get_container_name(),
            "running": container_running,
            "exists": container_exists,
        },
        "endpoints": {
            "http": _get_clawd_url(),
            "websocket": _get_clawd_ws_url(),
        },
        "active_tasks": len(active_tasks),
        "current_task": active_tasks[0] if active_tasks else None,
    }

    # Try to get health from clawdbot if running
    if container_running:
        health = _clawd_http_get("/health")
        if health.get("ok"):
            status["gateway_health"] = health.get("data")

    return status


def _action_start(**kwargs: Any) -> Dict[str, Any]:
    """Start clawdbot container."""
    if not _is_enabled():
        return {
            "ok": False,
            "error": "Clawdbot integration is disabled. Enable with KURORYUU_CLAWD_ENABLED=1",
        }

    if _docker_container_running():
        return {"ok": True, "message": "Clawdbot is already running"}

    return _docker_start_container()


def _action_stop(**kwargs: Any) -> Dict[str, Any]:
    """Stop clawdbot container."""
    if not _is_enabled():
        return {
            "ok": False,
            "error": "Clawdbot integration is disabled. Enable with KURORYUU_CLAWD_ENABLED=1",
        }

    if not _docker_container_running():
        return {"ok": True, "message": "Clawdbot is already stopped"}

    return _docker_stop_container()


def _action_task(prompt: str = "", **kwargs: Any) -> Dict[str, Any]:
    """Assign a task to clawdbot."""
    if not _is_enabled():
        return {
            "ok": False,
            "error": "Clawdbot integration is disabled. Enable with KURORYUU_CLAWD_ENABLED=1",
        }

    if not prompt:
        return {
            "ok": False,
            "error": "prompt is required. Provide the task you want clawdbot to work on.",
        }

    if not _docker_container_running():
        return {
            "ok": False,
            "error": "Clawdbot is not running. Use action='start' first.",
        }

    # Create task record
    task_id = str(uuid.uuid4())[:8]
    task = {
        "id": task_id,
        "prompt": prompt,
        "status": "running",
        "created_at": _now_iso(),
        "completed_at": None,
        "result": None,
    }

    # Save to task store
    store = _load_task_store()
    store["tasks"].append(task)
    _save_task_store(store)

    # Execute task via clawdbot agent command
    result = _clawd_exec_command("agent", message=prompt)

    # Update task with result
    task["status"] = "completed" if result.get("ok") else "failed"
    task["completed_at"] = _now_iso()
    task["result"] = result.get("stdout", "") or result.get("error", "")

    # Move to history
    store = _load_task_store()
    for i, t in enumerate(store["tasks"]):
        if t["id"] == task_id:
            store["tasks"].pop(i)
            break
    store["history"].insert(0, task)
    # Keep only last 50 tasks in history
    store["history"] = store["history"][:50]
    _save_task_store(store)

    return {
        "ok": result.get("ok", False),
        "task_id": task_id,
        "result": task["result"],
        "status": task["status"],
    }


def _action_cancel(**kwargs: Any) -> Dict[str, Any]:
    """Cancel current task."""
    if not _is_enabled():
        return {
            "ok": False,
            "error": "Clawdbot integration is disabled. Enable with KURORYUU_CLAWD_ENABLED=1",
        }

    # For now, just mark active tasks as cancelled
    store = _load_task_store()
    cancelled = 0
    for task in store.get("tasks", []):
        if task.get("status") == "running":
            task["status"] = "cancelled"
            task["completed_at"] = _now_iso()
            cancelled += 1
    _save_task_store(store)

    return {"ok": True, "cancelled_count": cancelled}


def _action_results(**kwargs: Any) -> Dict[str, Any]:
    """Get results from completed tasks."""
    if not _is_enabled():
        return {
            "ok": False,
            "error": "Clawdbot integration is disabled. Enable with KURORYUU_CLAWD_ENABLED=1",
        }

    store = _load_task_store()
    history = store.get("history", [])

    # Return most recent completed tasks
    return {
        "ok": True,
        "count": len(history),
        "results": history[:10],  # Last 10 tasks
    }


def _action_inbox(**kwargs: Any) -> Dict[str, Any]:
    """Check messages from clawdbot."""
    if not _is_enabled():
        return {
            "ok": False,
            "error": "Clawdbot integration is disabled. Enable with KURORYUU_CLAWD_ENABLED=1",
        }

    # TODO: Implement WebSocket or HTTP polling for clawdbot messages
    # For now, return empty inbox
    return {
        "ok": True,
        "messages": [],
        "note": "Real-time messaging not yet implemented. Use action='results' for completed task output.",
    }


def _action_reply(message: str = "", **kwargs: Any) -> Dict[str, Any]:
    """Reply to a clawdbot question."""
    if not _is_enabled():
        return {
            "ok": False,
            "error": "Clawdbot integration is disabled. Enable with KURORYUU_CLAWD_ENABLED=1",
        }

    if not message:
        return {"ok": False, "error": "message is required"}

    # TODO: Implement reply mechanism via WebSocket
    return {
        "ok": False,
        "error": "Reply mechanism not yet implemented.",
    }


def _action_history(limit: int = 20, **kwargs: Any) -> Dict[str, Any]:
    """View task history."""
    if not _is_enabled():
        return {
            "ok": False,
            "error": "Clawdbot integration is disabled. Enable with KURORYUU_CLAWD_ENABLED=1",
        }

    store = _load_task_store()
    history = store.get("history", [])
    limit = max(1, min(100, int(limit or 20)))

    return {
        "ok": True,
        "total": len(history),
        "showing": min(limit, len(history)),
        "history": history[:limit],
    }


def _action_config(key: str = "", value: str = "", **kwargs: Any) -> Dict[str, Any]:
    """Get/set clawdbot configuration."""
    if not _is_enabled():
        return {
            "ok": False,
            "error": "Clawdbot integration is disabled. Enable with KURORYUU_CLAWD_ENABLED=1",
        }

    # Return current configuration
    config = {
        "enabled": _is_enabled(),
        "container_name": _get_container_name(),
        "container_image": _get_container_image(),
        "http_url": _get_clawd_url(),
        "ws_url": _get_clawd_ws_url(),
        "container_running": _docker_container_running(),
    }

    return {"ok": True, "config": config}


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "status": _action_status,
    "start": _action_start,
    "stop": _action_stop,
    "task": _action_task,
    "cancel": _action_cancel,
    "results": _action_results,
    "inbox": _action_inbox,
    "reply": _action_reply,
    "history": _action_history,
    "config": _action_config,
}


def k_clawd(
    action: str,
    prompt: str = "",
    message: str = "",
    limit: int = 20,
    key: str = "",
    value: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Clawdbot Integration - Autonomous AI worker.

    Routed tool with actions: help, status, start, stop, task, cancel, results, inbox, reply, history, config

    **IMPORTANT**: This integration is OPT-IN only.
    Enable with: KURORYUU_CLAWD_ENABLED=1

    Args:
        action: Action to perform (required)
        prompt: Task prompt (for task action)
        message: Reply message (for reply action)
        limit: Max items to return (for history)
        key: Config key (for config action)
        value: Config value (for config action)

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
        prompt=prompt,
        message=message,
        limit=limit,
        key=key,
        value=value,
        **kwargs,
    )


# ============================================================================
# Tool registration
# ============================================================================

def register_clawd_tools(registry: "ToolRegistry") -> None:
    """Register k_clawd routed tool with the registry."""

    registry.register(
        name="k_clawd",
        description="Clawdbot integration - autonomous AI worker in Docker. OPT-IN only (KURORYUU_CLAWD_ENABLED=1). Actions: help, status, start, stop, task, cancel, results, inbox, reply, history, config",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "status", "start", "stop", "task", "cancel", "results", "inbox", "reply", "history", "config"],
                    "description": "Action to perform",
                },
                "prompt": {
                    "type": "string",
                    "description": "Task prompt to assign to clawdbot (for task action)",
                },
                "message": {
                    "type": "string",
                    "description": "Reply message to send to clawdbot (for reply action)",
                },
                "limit": {
                    "type": "integer",
                    "default": 20,
                    "description": "Max items to return (for history action)",
                },
                "key": {
                    "type": "string",
                    "description": "Config key (for config action)",
                },
                "value": {
                    "type": "string",
                    "description": "Config value (for config action)",
                },
            },
            "required": ["action"],
        },
        handler=k_clawd,
    )
