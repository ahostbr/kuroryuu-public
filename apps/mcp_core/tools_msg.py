"""Inter-agent messaging tool - simplified wrapper over k_inbox.

Provides a streamlined interface for agent-to-agent communication.
Delegates to the existing maildir infrastructure in tools_inbox.py.

Routed tool: k_msg(action, ...)
Actions: help, send, check, read, reply, complete, broadcast, list_agents
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

try:
    from .tools_inbox import (
        _action_send as inbox_send,
        _action_list as inbox_list,
        _action_read as inbox_read,
        _action_complete as inbox_complete,
        _action_mark_read as inbox_mark_read,
    )
except ImportError:
    from tools_inbox import (
        _action_send as inbox_send,
        _action_list as inbox_list,
        _action_read as inbox_read,
        _action_complete as inbox_complete,
        _action_mark_read as inbox_mark_read,
    )

import logging
logger = logging.getLogger("kuroryuu.mcp_core.k_msg")

# Gateway URL for agent discovery
GATEWAY_URL = os.environ.get("KURORYUU_GATEWAY_URL", "http://127.0.0.1:8200")


# ============================================================================
# Action implementations
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """List available actions for k_msg."""
    return {
        "ok": True,
        "data": {
            "tool": "k_msg",
            "description": "Simplified inter-agent messaging. Wraps k_inbox with auto-identity and streamlined actions.",
            "actions": {
                "help": "Show this help",
                "send": "Send message to another agent. Params: to (required), subject, body, priority, thread_id",
                "check": "Check inbox for messages addressed to you. Params: agent_id (required), limit",
                "read": "Read a specific message. Params: id (required)",
                "reply": "Reply to a message. Params: id (required), body (required), from_agent",
                "complete": "Mark a message as done. Params: id (required), note",
                "broadcast": "Send to all agents. Params: subject, body, from_agent",
                "list_agents": "Discover registered agents via Gateway",
            },
        },
        "error": None,
    }


def _action_send(
    to: str = "",
    subject: str = "",
    body: str = "",
    from_agent: str = "",
    priority: str = "normal",
    thread_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Send a direct message to another agent."""
    if not to:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "'to' is required (target agent ID)",
        }
    if not body:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "'body' is required (message content)",
        }

    return inbox_send(
        from_agent=from_agent or "anonymous",
        to_agent=to,
        subject=subject or "(no subject)",
        body=body,
        priority=priority,
        message_type="message",
        thread_id=thread_id,
    )


def _action_check(
    agent_id: str = "",
    limit: int = 20,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Check inbox for messages addressed to a specific agent.

    Returns messages from new/ folder, filtered to those addressed to agent_id
    or broadcast messages.
    """
    if not agent_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "'agent_id' is required (your agent ID to check messages for)",
        }

    # Get all new messages
    result = inbox_list(folder="new", limit=min(limit * 3, 200), include_payload=False)
    if not result.get("ok"):
        return result

    # Read full messages and filter to those addressed to this agent or broadcast
    from pathlib import Path
    try:
        from .tools_inbox import _safe_read_json
    except ImportError:
        from tools_inbox import _safe_read_json

    filtered: List[Dict[str, Any]] = []
    for entry in result.get("messages", []):
        path = entry.get("path", "")
        if not path:
            continue
        msg, _ = _safe_read_json(Path(path))
        if msg is None:
            continue

        to_agent = msg.get("to_agent", "")
        if to_agent in (agent_id, "broadcast", "workers", ""):
            filtered.append({
                "id": msg.get("id", ""),
                "from_agent": msg.get("from_agent", ""),
                "to_agent": to_agent,
                "subject": msg.get("subject", msg.get("title", "")),
                "priority": msg.get("priority", "normal"),
                "created_at": msg.get("created_at", ""),
                "thread_id": msg.get("thread_id", ""),
                "message_type": msg.get("message_type", ""),
                "read": msg.get("read", False),
            })
            if len(filtered) >= limit:
                break

    return {
        "ok": True,
        "agent_id": agent_id,
        "count": len(filtered),
        "messages": filtered,
    }


def _action_read(
    id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Read a specific message by ID."""
    if not id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "'id' is required (message ID)",
        }
    return inbox_read(id=id)


def _action_reply(
    id: str = "",
    body: str = "",
    from_agent: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Reply to a message, preserving thread context."""
    if not id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "'id' is required (message ID to reply to)",
        }
    if not body:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "'body' is required (reply content)",
        }

    # Read the original message to get thread context
    original = inbox_read(id=id)
    if not original.get("ok"):
        return {
            "ok": False,
            "error_code": "NOT_FOUND",
            "message": f"Cannot find original message to reply to: {id}",
        }

    orig_msg = original.get("message", {})
    # Reply goes back to the sender
    reply_to_agent = orig_msg.get("from_agent", "")
    thread_id = orig_msg.get("thread_id", "")
    orig_subject = orig_msg.get("subject", orig_msg.get("title", ""))

    return inbox_send(
        from_agent=from_agent or "anonymous",
        to_agent=reply_to_agent,
        subject=f"RE: {orig_subject}" if not orig_subject.startswith("RE:") else orig_subject,
        body=body,
        priority="normal",
        message_type="reply",
        reply_to=id,
        thread_id=thread_id,
    )


def _action_complete(
    id: str = "",
    note: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Mark a message as done (moves from cur/ to done/).

    If the message is in new/, it is first claimed (moved to cur/)
    before being completed.
    """
    if not id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "'id' is required (message ID to complete)",
        }

    # Try completing directly (message in cur/)
    result = inbox_complete(id=id, status="done", note=note)
    if result.get("ok"):
        return result

    # If not in cur/, try claiming first (message still in new/)
    try:
        from .tools_inbox import _action_claim as inbox_claim
    except ImportError:
        from tools_inbox import _action_claim as inbox_claim

    claim_result = inbox_claim(id=id)
    if not claim_result.get("ok"):
        return {
            "ok": False,
            "error_code": "NOT_FOUND",
            "message": f"Message not found in cur/ or new/: {id}",
        }

    # Now complete the claimed message
    return inbox_complete(id=id, status="done", note=note)


def _action_broadcast(
    subject: str = "",
    body: str = "",
    from_agent: str = "",
    priority: str = "normal",
    thread_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Send a message to all agents (broadcast)."""
    if not body:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "'body' is required (broadcast content)",
        }

    return inbox_send(
        from_agent=from_agent or "anonymous",
        to_agent="broadcast",
        subject=subject or "(broadcast)",
        body=body,
        priority=priority,
        message_type="broadcast",
        thread_id=thread_id,
    )


def _action_list_agents(**kwargs: Any) -> Dict[str, Any]:
    """Discover registered agents via Gateway REST API."""
    import httpx

    try:
        resp = httpx.get(
            f"{GATEWAY_URL}/v1/agents/list",
            timeout=10.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            agents = data.get("agents", [])
            return {
                "ok": True,
                "count": len(agents),
                "agents": [
                    {
                        "agent_id": a.get("agent_id", ""),
                        "cli_type": a.get("cli_type", ""),
                        "status": a.get("status", ""),
                        "registered_at": a.get("registered_at", ""),
                        "last_heartbeat": a.get("last_heartbeat", ""),
                    }
                    for a in agents
                ],
            }
        else:
            return {
                "ok": False,
                "error_code": "GATEWAY_ERROR",
                "message": f"Gateway returned {resp.status_code}",
            }
    except httpx.ConnectError:
        return {
            "ok": False,
            "error_code": "GATEWAY_UNAVAILABLE",
            "message": f"Cannot connect to Gateway at {GATEWAY_URL}. Is it running?",
        }
    except Exception as e:
        return {
            "ok": False,
            "error_code": "LIST_AGENTS_FAILED",
            "message": str(e),
        }


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "send": _action_send,
    "check": _action_check,
    "read": _action_read,
    "reply": _action_reply,
    "complete": _action_complete,
    "broadcast": _action_broadcast,
    "list_agents": _action_list_agents,
}


def k_msg(
    action: str,
    to: str = "",
    subject: str = "",
    body: str = "",
    from_agent: str = "",
    priority: str = "normal",
    thread_id: str = "",
    agent_id: str = "",
    limit: int = 20,
    id: str = "",
    note: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Inter-Agent Messaging - simplified wrapper over k_inbox.

    Routed tool with actions: help, send, check, read, reply, complete, broadcast, list_agents

    Args:
        action: Action to perform (required)
        to: Target agent ID (for send)
        subject: Message subject (for send, broadcast)
        body: Message body (for send, reply, broadcast)
        from_agent: Sender agent ID (for send, reply, broadcast)
        priority: Priority: high, normal, low (for send, broadcast)
        thread_id: Thread ID for grouping (for send, broadcast)
        agent_id: Your agent ID (for check)
        limit: Max messages to return (for check)
        id: Message ID (for read, reply, complete)
        note: Completion note (for complete)

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
        to=to,
        subject=subject,
        body=body,
        from_agent=from_agent,
        priority=priority,
        thread_id=thread_id,
        agent_id=agent_id,
        limit=limit,
        id=id,
        note=note,
        **kwargs,
    )


# ============================================================================
# Tool registration
# ============================================================================

def register_msg_tools(registry: "ToolRegistry") -> None:
    """Register k_msg routed tool with the registry."""

    registry.register(
        name="k_msg",
        description="Simplified inter-agent messaging. Actions: help, send, check, read, reply, complete, broadcast, list_agents",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "send", "check", "read", "reply", "complete", "broadcast", "list_agents"],
                    "description": "Action to perform",
                },
                "to": {
                    "type": "string",
                    "description": "Target agent ID (for send)",
                },
                "subject": {
                    "type": "string",
                    "description": "Message subject (for send, broadcast)",
                },
                "body": {
                    "type": "string",
                    "description": "Message body (for send, reply, broadcast)",
                },
                "from_agent": {
                    "type": "string",
                    "description": "Sender agent ID (for send, reply, broadcast)",
                },
                "priority": {
                    "type": "string",
                    "enum": ["high", "normal", "low"],
                    "default": "normal",
                    "description": "Message priority (for send, broadcast)",
                },
                "thread_id": {
                    "type": "string",
                    "description": "Thread ID for grouping (for send, broadcast)",
                },
                "agent_id": {
                    "type": "string",
                    "description": "Your agent ID (for check — filters messages addressed to you)",
                },
                "limit": {
                    "type": "integer",
                    "default": 20,
                    "description": "Max messages to return (for check)",
                },
                "id": {
                    "type": "string",
                    "description": "Message ID (for read, reply, complete)",
                },
                "note": {
                    "type": "string",
                    "description": "Completion note (for complete)",
                },
            },
            "required": ["action"],
        },
        handler=k_msg,
    )
