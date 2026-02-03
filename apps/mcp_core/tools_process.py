"""k_process - Monitor and control background bash sessions.

Companion to k_bash for managing background processes.

Usage:
    # List all sessions
    k_process(action="list")

    # Check if session is running
    k_process(action="poll", sessionId="abc123")

    # Get output
    k_process(action="log", sessionId="abc123")
    k_process(action="log", sessionId="abc123", offset=100, limit=50)

    # Send input
    k_process(action="write", sessionId="abc123", data="some text")
    k_process(action="submit", sessionId="abc123", data="yes")  # + newline

    # Terminate
    k_process(action="kill", sessionId="abc123")
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from protocol import ToolRegistry

# Import shared session storage from tools_bash
from tools_bash import BASH_SESSIONS


# ============================================================================
# Action handlers
# ============================================================================

def _action_list(**kwargs: Any) -> Dict[str, Any]:
    """List all background sessions."""
    sessions = [
        {
            "id": s["id"],
            "command": s["command"][:80] + ("..." if len(s["command"]) > 80 else ""),
            "workdir": s["workdir"],
            "pty": s["pty"],
            "running": s["running"],
            "started_at": s["started_at"],
            "exit_code": s["exit_code"],
            "output_lines": len(s["output"]),
        }
        for s in BASH_SESSIONS.values()
    ]

    # Sort by started_at descending (most recent first)
    sessions.sort(key=lambda x: x["started_at"], reverse=True)

    return {
        "ok": True,
        "sessions": sessions,
        "count": len(sessions),
        "running_count": sum(1 for s in sessions if s["running"]),
    }


def _action_poll(sessionId: Optional[str] = None, **kwargs: Any) -> Dict[str, Any]:
    """Check if a session is still running."""
    if not sessionId:
        return {"ok": False, "error": "sessionId is required"}

    if sessionId not in BASH_SESSIONS:
        return {"ok": False, "error": f"Session not found: {sessionId}"}

    session = BASH_SESSIONS[sessionId]
    return {
        "ok": True,
        "sessionId": sessionId,
        "running": session["running"],
        "exit_code": session["exit_code"],
        "output_lines": len(session["output"]),
    }


def _action_log(
    sessionId: Optional[str] = None,
    offset: int = 0,
    limit: int = 1000,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Get output from a session."""
    if not sessionId:
        return {"ok": False, "error": "sessionId is required"}

    if sessionId not in BASH_SESSIONS:
        return {"ok": False, "error": f"Session not found: {sessionId}"}

    session = BASH_SESSIONS[sessionId]
    total_lines = len(session["output"])

    # Clamp offset and limit
    offset = max(0, min(offset, total_lines))
    limit = max(1, min(limit, 5000))  # Cap at 5000 lines

    lines = session["output"][offset:offset + limit]

    return {
        "ok": True,
        "sessionId": sessionId,
        "output": "\n".join(lines),
        "offset": offset,
        "limit": limit,
        "returned_lines": len(lines),
        "total_lines": total_lines,
        "running": session["running"],
    }


def _action_write(
    sessionId: Optional[str] = None,
    data: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Write raw data to session stdin (PTY only)."""
    if not sessionId:
        return {"ok": False, "error": "sessionId is required"}
    if data is None:
        return {"ok": False, "error": "data is required"}

    if sessionId not in BASH_SESSIONS:
        return {"ok": False, "error": f"Session not found: {sessionId}"}

    session = BASH_SESSIONS[sessionId]

    if not session["running"]:
        return {"ok": False, "error": "Session is not running"}

    if not session["pty"]:
        return {"ok": False, "error": "write requires PTY mode. Use k_bash with pty=true"}

    pty_proc = session.get("pty_proc")
    if not pty_proc:
        return {"ok": False, "error": "No PTY process attached"}

    try:
        pty_proc.write(data)
        return {"ok": True, "written": len(data)}
    except Exception as e:
        return {"ok": False, "error": f"Write failed: {e}"}


def _action_submit(
    sessionId: Optional[str] = None,
    data: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Write data + newline to session stdin (like typing + Enter)."""
    if data is None:
        data = ""
    return _action_write(sessionId=sessionId, data=data + "\r\n", **kwargs)


def _action_kill(sessionId: Optional[str] = None, **kwargs: Any) -> Dict[str, Any]:
    """Terminate a session."""
    if not sessionId:
        return {"ok": False, "error": "sessionId is required"}

    if sessionId not in BASH_SESSIONS:
        return {"ok": False, "error": f"Session not found: {sessionId}"}

    session = BASH_SESSIONS[sessionId]

    if not session["running"]:
        return {"ok": True, "message": "Session already stopped", "exit_code": session["exit_code"]}

    try:
        # Kill PTY process
        if session.get("pty_proc"):
            try:
                session["pty_proc"].terminate()
            except Exception:
                pass

        # Kill subprocess
        if session.get("process"):
            try:
                session["process"].terminate()
            except Exception:
                pass

        session["running"] = False
        session["exit_code"] = -9  # Killed
        session["output"].append("[KILLED] Process terminated by user")

        return {"ok": True, "message": "Session terminated"}
    except Exception as e:
        return {"ok": False, "error": f"Kill failed: {e}"}


# ============================================================================
# Main routed tool
# ============================================================================

ACTION_HANDLERS = {
    "list": _action_list,
    "poll": _action_poll,
    "log": _action_log,
    "write": _action_write,
    "submit": _action_submit,
    "kill": _action_kill,
}


def k_process(
    action: str,
    sessionId: Optional[str] = None,
    data: Optional[str] = None,
    offset: int = 0,
    limit: int = 1000,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Monitor and control background bash sessions.

    Routed tool with actions: list, poll, log, write, submit, kill

    Args:
        action: Action to perform (required)
        sessionId: Session ID from k_bash background mode
        data: Data to write (for write/submit actions)
        offset: Output offset for log action
        limit: Max lines for log action

    Returns:
        {ok, ...} response dict
    """
    act = (action or "").strip().lower()

    if not act:
        return {
            "ok": False,
            "error": "action is required",
            "available_actions": list(ACTION_HANDLERS.keys()),
        }

    handler = ACTION_HANDLERS.get(act)
    if not handler:
        return {
            "ok": False,
            "error": f"Unknown action: {act}",
            "available_actions": list(ACTION_HANDLERS.keys()),
        }

    return handler(
        sessionId=sessionId,
        data=data,
        offset=offset,
        limit=limit,
        **kwargs,
    )


# ============================================================================
# Registration
# ============================================================================

def register_process_tools(registry: ToolRegistry) -> None:
    """Register k_process tool with the registry."""

    registry.register(
        name="k_process",
        description=(
            "Monitor and control background bash sessions. "
            "Actions: list, poll, log, write, submit, kill. "
            "Use with k_bash background=true."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list", "poll", "log", "write", "submit", "kill"],
                    "description": "Action to perform",
                },
                "sessionId": {
                    "type": "string",
                    "description": "Session ID from k_bash background mode",
                },
                "data": {
                    "type": "string",
                    "description": "Data to write (for write/submit actions)",
                },
                "offset": {
                    "type": "integer",
                    "default": 0,
                    "description": "Output offset for log action",
                },
                "limit": {
                    "type": "integer",
                    "default": 1000,
                    "description": "Max lines for log action",
                },
            },
            "required": ["action"],
        },
        handler=k_process,
    )
