"""Hook MCP Tools for External CLI Integration - Routed k_session tool.

Exposes Kuroryuu hooks as MCP tools that spawned CLIs can call.

Routed tool: k_session(action, ...)
Actions: help, start, end, context, pre_tool, post_tool, log
"""

import os
import re
import logging
from pathlib import Path
from typing import Any, Dict

import httpx

from protocol import ToolRegistry
from sessions import get_session_manager

logger = logging.getLogger("kuroryuu.mcp_core.k_session")
GATEWAY_URL = os.environ.get("KURORYUU_GATEWAY_URL", "http://127.0.0.1:8200")
try:
    from .paths import get_ai_dir_or_env
except ImportError:
    from paths import get_ai_dir_or_env

AI_DIR = get_ai_dir_or_env("KURORYUU_HOOKS_DIR")
TODO_PATH = AI_DIR / "todo.md"
TODO_STRICT = os.environ.get("KURORYUU_TODO_STRICT", "0") == "1"


def _read_todo() -> str:
    """Read todo.md content."""
    if TODO_PATH.exists():
        return TODO_PATH.read_text(encoding="utf-8")
    return ""


def _build_context() -> str:
    """Build formatted context block from todo.md."""
    content = _read_todo()
    lines = ["---", "## Kuroryuu Context", ""]

    # Extract unchecked tasks
    tasks = re.findall(r"- \[ \] (T\d+) — ([^\n]+)", content)[:5]
    if tasks:
        lines.append("**Next Tasks:**")
        for tid, desc in tasks:
            lines.append(f"- {tid} — {desc.strip()}")
    else:
        lines.append("**No unchecked tasks.**")

    lines.extend(["", "---"])
    return "\n".join(lines)


# ============================================================================
# Action implementations
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """List available actions for k_session."""
    return {
        "ok": True,
        "data": {
            "tool": "k_session",
            "description": "Session/hook lifecycle management for spawned CLIs",
            "actions": {
                "help": "Show this help",
                "start": "Register a CLI session. Params: process_id, cli_type, agent_id (all required)",
                "end": "End a CLI session. Params: session_id (required), exit_code, summary",
                "context": "Get formatted todo.md context. Params: session_id (required)",
                "pre_tool": "Check before tool execution. Params: session_id, tool_name (required), arguments",
                "post_tool": "Track tool result. Params: session_id, tool_name, result_ok (required), result_summary",
                "log": "Append custom log entry. Params: session_id, message (required)",
            },
        },
        "error": None,
    }


def _action_start(
    process_id: int = 0,
    cli_type: str = "",
    agent_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Register a spawned CLI session."""
    if not process_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "process_id is required"}
    if not cli_type:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "cli_type is required"}
    if not agent_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "agent_id is required"}

    mgr = get_session_manager()
    session = mgr.create(process_id, cli_type, agent_id, None)
    context = _build_context()

    # Auto-register with Gateway agent registry (fire-and-forget)
    gateway_registered = False
    try:
        resp = httpx.post(
            f"{GATEWAY_URL}/v1/agents/register",
            json={
                "model_name": cli_type or "unknown",
                "agent_id": agent_id,
                "role": "worker",
            },
            timeout=5.0,
        )
        gateway_registered = resp.status_code == 200
    except Exception as e:
        logger.debug("Gateway registration failed (non-fatal): %s", e)

    return {
        "ok": True,
        "session_id": session.session_id,
        "gateway_registered": gateway_registered,
        "context": context,
    }


def _action_end(
    session_id: str = "",
    exit_code: int = 0,
    summary: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """End a CLI session."""
    if not session_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "session_id is required"}

    mgr = get_session_manager()
    session = mgr.end(session_id, exit_code)
    if not session:
        return {"ok": False, "error_code": "NOT_FOUND", "message": "Session not found"}

    # Auto-deregister from Gateway (fire-and-forget)
    agent_id = session.agent_id if hasattr(session, "agent_id") else ""
    if agent_id:
        try:
            httpx.delete(f"{GATEWAY_URL}/v1/agents/{agent_id}", timeout=5.0)
        except Exception as e:
            logger.debug("Gateway deregister failed (non-fatal): %s", e)

    return {"ok": True, "session_id": session_id}


def _action_context(
    session_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Get formatted todo.md context block."""
    if not session_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "session_id is required"}

    mgr = get_session_manager()
    session = mgr.get(session_id)
    if not session:
        return {"ok": False, "error_code": "NOT_FOUND", "message": "Session not found"}
    return {"ok": True, "context": _build_context()}


def _action_pre_tool(
    session_id: str = "",
    tool_name: str = "",
    arguments: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Check before tool execution. Can block."""
    if not session_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "session_id is required"}
    if not tool_name:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "tool_name is required"}

    mgr = get_session_manager()
    session = mgr.get(session_id)
    if not session:
        return {"ok": False, "allow": False, "reason": "Session not found"}

    # Rule: Strict mode + no unchecked tasks
    if TODO_STRICT:
        content = _read_todo()
        if not re.search(r"- \[ \] T\d+", content):
            return {"ok": True, "allow": False, "reason": "todo.md has no unchecked tasks (strict mode)"}

    return {"ok": True, "allow": True, "reason": ""}


def _action_post_tool(
    session_id: str = "",
    tool_name: str = "",
    result_ok: bool = True,
    result_summary: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Track tool result after execution."""
    if not session_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "session_id is required"}
    if not tool_name:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "tool_name is required"}

    mgr = get_session_manager()
    session = mgr.get(session_id)
    if not session:
        return {"ok": False, "error_code": "NOT_FOUND", "message": "Session not found"}

    mgr.track_tool(session_id, result_ok)

    return {"ok": True}


def _action_log(
    session_id: str = "",
    message: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Append custom log entry."""
    if not session_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "session_id is required"}
    if not message:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "message is required"}

    mgr = get_session_manager()
    session = mgr.get(session_id)
    if not session:
        return {"ok": False, "error_code": "NOT_FOUND", "message": "Session not found"}

    return {"ok": True}


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "start": _action_start,
    "end": _action_end,
    "context": _action_context,
    "pre_tool": _action_pre_tool,
    "post_tool": _action_post_tool,
    "log": _action_log,
}


def k_session(
    action: str,
    process_id: int = 0,
    cli_type: str = "",
    agent_id: str = "",
    session_id: str = "",
    exit_code: int = 0,
    summary: str = "",
    tool_name: str = "",
    arguments: str = "",
    result_ok: bool = True,
    result_summary: str = "",
    message: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Session - Hook/lifecycle management for spawned CLIs.

    Routed tool with actions: help, start, end, context, pre_tool, post_tool, log

    Args:
        action: Action to perform (required)
        process_id: OS process ID (for start)
        cli_type: CLI type: kiro, claude, copilot, codex (for start)
        agent_id: Agent identifier (for start)
        session_id: Session ID (for end, context, pre_tool, post_tool, log)
        exit_code: Exit code (for end)
        summary: Summary text (for end)
        tool_name: Tool name (for pre_tool, post_tool)
        arguments: Tool arguments as string (for pre_tool)
        result_ok: Whether tool succeeded (for post_tool)
        result_summary: Tool result summary (for post_tool)
        message: Progress message (for log)

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
        process_id=process_id,
        cli_type=cli_type,
        agent_id=agent_id,
        session_id=session_id,
        exit_code=exit_code,
        summary=summary,
        tool_name=tool_name,
        arguments=arguments,
        result_ok=result_ok,
        result_summary=result_summary,
        message=message,
        **kwargs,
    )


# ============================================================================
# Registration
# ============================================================================

def register_hooks_tools(registry: ToolRegistry) -> None:
    """Register k_session routed tool with the registry."""

    registry.register(
        name="k_session",
        description="Session/hook lifecycle management. Actions: help, start, end, context, pre_tool, post_tool, log",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "start", "end", "context", "pre_tool", "post_tool", "log"],
                    "description": "Action to perform",
                },
                "process_id": {
                    "type": "integer",
                    "description": "OS process ID (for start)",
                },
                "cli_type": {
                    "type": "string",
                    "description": "CLI type: kiro, claude, copilot, codex (for start)",
                },
                "agent_id": {
                    "type": "string",
                    "description": "Agent identifier (for start)",
                },
                "session_id": {
                    "type": "string",
                    "description": "Session ID (for end, context, pre_tool, post_tool, log)",
                },
                "exit_code": {
                    "type": "integer",
                    "default": 0,
                    "description": "Exit code (for end)",
                },
                "summary": {
                    "type": "string",
                    "description": "Summary text (for end)",
                },
                "tool_name": {
                    "type": "string",
                    "description": "Tool name (for pre_tool, post_tool)",
                },
                "arguments": {
                    "type": "string",
                    "description": "Tool arguments as string (for pre_tool)",
                },
                "result_ok": {
                    "type": "boolean",
                    "default": True,
                    "description": "Whether tool succeeded (for post_tool)",
                },
                "result_summary": {
                    "type": "string",
                    "description": "Tool result summary (for post_tool)",
                },
                "message": {
                    "type": "string",
                    "description": "Progress message (for log)",
                },
            },
            "required": ["action"],
        },
        handler=k_session,
    )
