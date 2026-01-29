"""System Router - Unified system-wide statistics and health.

Aggregates stats from all subsystems into a single endpoint.
This replaces the deprecated per-subsystem stats endpoints.

Endpoints:
- GET /v1/system/stats - Unified stats from inbox, agents, and todo.md
- GET /v1/system/health - Overall system health check
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from ..inbox.service import get_inbox
from ..agents.registry import get_registry
from ..utils.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/system", tags=["system"])


# ============================================================================
# Deprecated Stats Redirects
# These routes redirect to the unified /v1/system/stats endpoint.
# ============================================================================

# Create a separate router for redirects at root /v1 level
redirect_router = APIRouter(prefix="/v1", tags=["deprecated-redirects"])


def _parse_todo_stats() -> Dict[str, Any]:
    """Parse ai/todo.md for task statistics.

    Returns counts by status based on checkbox markers:
    - [ ] = pending
    - [x] = completed
    - [~] = in_progress
    """
    todo_path = Path("ai/todo.md")

    stats = {
        "total": 0,
        "pending": 0,
        "in_progress": 0,
        "completed": 0,
        "source": "ai/todo.md",
    }

    if not todo_path.exists():
        stats["error"] = "todo.md not found"
        return stats

    try:
        content = todo_path.read_text(encoding="utf-8")
        lines = content.split("\n")

        for line in lines:
            stripped = line.strip()
            # Look for task markers
            if stripped.startswith("- [ ]") or stripped.startswith("* [ ]"):
                stats["total"] += 1
                stats["pending"] += 1
            elif stripped.startswith("- [x]") or stripped.startswith("* [x]"):
                stats["total"] += 1
                stats["completed"] += 1
            elif stripped.startswith("- [~]") or stripped.startswith("* [~]"):
                stats["total"] += 1
                stats["in_progress"] += 1
            # Also check for uppercase X
            elif stripped.startswith("- [X]") or stripped.startswith("* [X]"):
                stats["total"] += 1
                stats["completed"] += 1

    except Exception as e:
        stats["error"] = str(e)

    return stats


@router.get("/stats")
async def get_unified_stats() -> Dict[str, Any]:
    """Get unified system statistics.

    Aggregates stats from:
    - inbox: Message queue stats (k_inbox)
    - agents: Agent registry stats
    - todo: Task stats from ai/todo.md

    NOTE: Orchestration stats have been REMOVED (were in-memory only).
    Task state is now managed via ai/todo.md.
    """
    result = {
        "ok": True,
        "inbox": {},
        "agents": {},
        "todo": {},
    }

    # Inbox stats
    try:
        inbox_service = get_inbox()
        result["inbox"] = inbox_service.stats()
    except Exception as e:
        result["inbox"] = {"error": str(e)}

    # Agent registry stats
    try:
        registry = get_registry()
        result["agents"] = registry.stats()
    except Exception as e:
        result["agents"] = {"error": str(e)}

    # Todo.md stats
    try:
        result["todo"] = _parse_todo_stats()
    except Exception as e:
        result["todo"] = {"error": str(e)}

    return result


@router.get("/health")
async def system_health() -> Dict[str, Any]:
    """Overall system health check.

    Returns health status for all subsystems.
    """
    health = {
        "ok": True,
        "status": "healthy",
        "services": {
            "inbox": {"ok": False, "status": "unknown"},
            "agents": {"ok": False, "status": "unknown"},
            "todo": {"ok": False, "status": "unknown"},
        },
    }

    # Check inbox service
    try:
        inbox_service = get_inbox()
        inbox_stats = inbox_service.stats()
        health["services"]["inbox"] = {
            "ok": True,
            "status": "healthy",
            "message_count": inbox_stats.get("total", 0),
        }
    except Exception as e:
        health["services"]["inbox"] = {"ok": False, "status": "error", "error": str(e)}
        health["ok"] = False
        health["status"] = "degraded"

    # Check agent registry
    try:
        registry = get_registry()
        agent_stats = registry.stats()
        health["services"]["agents"] = {
            "ok": True,
            "status": "healthy",
            "agent_count": agent_stats.get("total", 0),
            "alive_count": agent_stats.get("alive", 0),
        }
    except Exception as e:
        health["services"]["agents"] = {"ok": False, "status": "error", "error": str(e)}
        health["ok"] = False
        health["status"] = "degraded"

    # Check todo.md existence
    try:
        todo_path = Path("ai/todo.md")
        if todo_path.exists():
            health["services"]["todo"] = {
                "ok": True,
                "status": "healthy",
                "path": str(todo_path),
            }
        else:
            health["services"]["todo"] = {
                "ok": True,
                "status": "missing",
                "message": "ai/todo.md not found (optional)",
            }
    except Exception as e:
        health["services"]["todo"] = {"ok": False, "status": "error", "error": str(e)}

    return health


# ============================================================================
# Redirect Endpoints (on redirect_router at /v1 level)
# ============================================================================

@redirect_router.get("/orchestration/stats", include_in_schema=False)
async def redirect_orchestration_stats():
    """Redirect deprecated orchestration stats to unified stats."""
    return RedirectResponse(url="/v1/system/stats", status_code=301)


@redirect_router.get("/agents/stats-redirect", include_in_schema=False)
async def redirect_agents_stats():
    """Redirect deprecated agents stats to unified stats.

    Note: /v1/agents/stats is still active in agents/router.py.
    This redirect is available at /v1/agents/stats-redirect for future migration.
    """
    return RedirectResponse(url="/v1/system/stats", status_code=301)


@redirect_router.get("/inbox/stats-redirect", include_in_schema=False)
async def redirect_inbox_stats():
    """Redirect deprecated inbox stats to unified stats.

    Note: /v1/inbox/stats is still active in inbox/router.py.
    This redirect is available at /v1/inbox/stats-redirect for future migration.
    """
    return RedirectResponse(url="/v1/system/stats", status_code=301)
