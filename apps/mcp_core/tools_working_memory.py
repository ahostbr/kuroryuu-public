"""Working Memory tools for MCP_CORE - Routed k_memory tool.

Provides tools for agents to interact with the stateless working memory system.

Routed tool: k_memory(action, ...)
Actions: help, get, set_goal, add_blocker, clear_blockers, set_steps, reset
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from protocol import ToolRegistry
try:
    from .paths import get_ai_dir_or_env
except ImportError:
    from paths import get_ai_dir_or_env

# Paths
AI_DIR = get_ai_dir_or_env("KURORYUU_HOOKS_DIR")
TODO_PATH = AI_DIR / "todo.md"
WORKING_MEMORY_PATH = AI_DIR / "working_memory.json"


def _load_working_memory() -> Dict[str, Any]:
    """Load working memory from disk."""
    if not WORKING_MEMORY_PATH.exists():
        return {
            "recent_actions": [],
            "tool_call_count": 0,
            "last_inject_at": 0,
            "active_goal": "",
            "blockers": [],
            "next_steps": [],
        }

    try:
        return json.loads(WORKING_MEMORY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {
            "recent_actions": [],
            "tool_call_count": 0,
            "last_inject_at": 0,
            "active_goal": "",
            "blockers": [],
            "next_steps": [],
        }


def _save_working_memory(wm: Dict[str, Any]) -> None:
    """Save working memory to disk."""
    AI_DIR.mkdir(parents=True, exist_ok=True)
    WORKING_MEMORY_PATH.write_text(
        json.dumps(wm, indent=2),
        encoding="utf-8",
    )


# ============================================================================
# Action implementations
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """List available actions for k_memory."""
    return {
        "ok": True,
        "data": {
            "tool": "k_memory",
            "description": "Working memory state management",
            "actions": {
                "help": "Show this help",
                "get": "Get current working memory context",
                "set_goal": "Set active goal. Params: goal (required)",
                "add_blocker": "Add a blocker. Params: blocker (required)",
                "clear_blockers": "Clear all blockers",
                "set_steps": "Set next steps. Params: steps (required, array)",
                "reset": "Reset working memory completely",
            },
            "paths": {
                "working_memory": str(WORKING_MEMORY_PATH),
                "todo": str(TODO_PATH),
            },
        },
        "error": None,
    }


def _action_get(**kwargs: Any) -> Dict[str, Any]:
    """Get the current working memory context."""
    wm = _load_working_memory()

    # Read current todo.md for reference
    todo_content = ""
    if TODO_PATH.exists():
        try:
            todo_content = TODO_PATH.read_text(encoding="utf-8")
        except Exception:
            pass

    return {
        "ok": True,
        "working_memory": wm,
        "todo_path": str(TODO_PATH),
        "todo_exists": TODO_PATH.exists(),
        "todo_preview": todo_content[:500] if todo_content else "(empty)",
        "instructions": "Update ai/todo.md with your progress using k_files(action='write', ...)",
    }


def _action_set_goal(
    goal: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Set the active goal in working memory."""
    if not goal:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "goal is required"}

    wm = _load_working_memory()
    wm["active_goal"] = goal[:200]
    _save_working_memory(wm)

    return {
        "ok": True,
        "goal": goal[:200],
        "reminder": "Also update Active Focus section in ai/todo.md",
    }


def _action_add_blocker(
    blocker: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Add a blocker to working memory."""
    if not blocker:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "blocker is required"}

    wm = _load_working_memory()
    blockers = wm.get("blockers", [])
    blockers.append(blocker[:100])
    wm["blockers"] = blockers[-5:]  # Keep last 5
    _save_working_memory(wm)

    return {
        "ok": True,
        "blocker": blocker[:100],
        "all_blockers": wm["blockers"],
        "reminder": "Also add to Current Blockers section in ai/todo.md",
    }


def _action_clear_blockers(**kwargs: Any) -> Dict[str, Any]:
    """Clear all blockers from working memory."""
    wm = _load_working_memory()
    cleared = len(wm.get("blockers", []))
    wm["blockers"] = []
    _save_working_memory(wm)

    return {
        "ok": True,
        "cleared": cleared,
        "reminder": "Also clear Current Blockers section in ai/todo.md",
    }


def _action_set_steps(
    steps: Optional[List[str]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Set the next steps in working memory."""
    if not steps:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "steps is required (array)"}

    wm = _load_working_memory()
    wm["next_steps"] = [s[:100] for s in steps[:5]]
    _save_working_memory(wm)

    return {
        "ok": True,
        "steps": wm["next_steps"],
        "reminder": "Also add these as tasks in ai/todo.md Checklist section",
    }


def _action_reset(**kwargs: Any) -> Dict[str, Any]:
    """Reset working memory completely."""
    wm = {
        "recent_actions": [],
        "tool_call_count": 0,
        "last_inject_at": 0,
        "active_goal": "",
        "blockers": [],
        "next_steps": [],
    }
    _save_working_memory(wm)

    return {
        "ok": True,
        "message": "Working memory reset",
        "reminder": "Consider if ai/todo.md also needs updating",
    }


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "get": _action_get,
    "set_goal": _action_set_goal,
    "add_blocker": _action_add_blocker,
    "clear_blockers": _action_clear_blockers,
    "set_steps": _action_set_steps,
    "reset": _action_reset,
}


def k_memory(
    action: str,
    goal: str = "",
    blocker: str = "",
    steps: Optional[List[str]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Memory - Working memory state management.

    Routed tool with actions: help, get, set_goal, add_blocker, clear_blockers, set_steps, reset

    Args:
        action: Action to perform (required)
        goal: Goal text (for set_goal)
        blocker: Blocker description (for add_blocker)
        steps: List of next steps (for set_steps)

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
        goal=goal,
        blocker=blocker,
        steps=steps,
        **kwargs,
    )


# ============================================================================
# Registration
# ============================================================================

def register_working_memory_tools(registry: ToolRegistry) -> None:
    """Register k_memory routed tool with the registry."""

    registry.register(
        name="k_memory",
        description="Working memory state management. Actions: help, get, set_goal, add_blocker, clear_blockers, set_steps, reset",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "get", "set_goal", "add_blocker", "clear_blockers", "set_steps", "reset"],
                    "description": "Action to perform",
                },
                "goal": {
                    "type": "string",
                    "description": "Goal text (for set_goal)",
                },
                "blocker": {
                    "type": "string",
                    "description": "Blocker description (for add_blocker)",
                },
                "steps": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of next steps (for set_steps)",
                },
            },
            "required": ["action"],
        },
        handler=k_memory,
    )
