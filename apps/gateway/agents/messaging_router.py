"""Agent Messaging Router - API endpoints for agent-to-agent communication.

Provides REST API for:
- Sending direct messages between agents
- Broadcasting messages to all agents
- Retrieving queued messages
- Message queue management

Integrates with:
- Agent registry for addressing and validation
- WebSocket system for real-time push notifications
- k_inbox (unified canonical inbox) for durable storage

Backend: k_inbox (maildir + JSON index + WebSocket)
NOTE: messaging.py (in-memory queue) has been DELETED. k_inbox is the canonical inbox.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .registry import get_registry


# =============================================================================
# Pydantic Models (moved from deleted messaging.py)
# =============================================================================

class SendMessageRequest(BaseModel):
    """Request to send a message to an agent."""

    from_agent_id: str = Field(..., description="Sender agent ID")
    to_agent_id: str = Field(..., description="Target agent ID (or 'broadcast' for all)")
    content: str = Field(..., description="Message content")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Optional metadata")
    reply_to: Optional[str] = Field(default=None, description="Message ID being replied to")


class SendMessageResponse(BaseModel):
    """Response after sending a message."""

    ok: bool
    message_id: str
    delivered: bool = Field(..., description="True if delivered immediately via WebSocket")
    queued: bool = Field(..., description="True if queued for offline agent")
    timestamp: str


class GetMessagesResponse(BaseModel):
    """Response with agent messages."""

    ok: bool
    agent_id: str
    messages: List[Dict[str, Any]]
    count: int
    unread_count: int

# Import k_inbox as the canonical inbox backend
try:
    from apps.mcp_core.tools_inbox import k_inbox
except ImportError:
    # Fallback for testing
    from mcp_core.tools_inbox import k_inbox

router = APIRouter(prefix="/v1/agents/messages", tags=["agent-messaging"])


@router.post("/send", response_model=SendMessageResponse)
async def send_message(req: SendMessageRequest) -> SendMessageResponse:
    """Send a message to another agent via unified k_inbox backend.

    Now uses k_inbox for durable storage with automatic WebSocket push.
    Broadcasts are also stored durably (change from ephemeral behavior).

    Args:
        req: SendMessageRequest with from/to agent IDs and content

    Returns:
        SendMessageResponse with delivery status
    """
    registry = get_registry()

    # Validate sender exists
    sender = registry.get(req.from_agent_id)
    if not sender:
        raise HTTPException(
            status_code=404,
            detail=f"Sender agent not found: {req.from_agent_id}"
        )

    # Validate target (unless broadcast)
    if req.to_agent_id != "broadcast":
        target = registry.get(req.to_agent_id)
        if not target:
            raise HTTPException(
                status_code=404,
                detail=f"Target agent not found: {req.to_agent_id}"
            )

    # Send via k_inbox (v2 schema) - WebSocket notification happens automatically
    result = k_inbox(
        action="send",
        from_agent=req.from_agent_id,
        to_agent=req.to_agent_id,
        subject=f"Agent message from {req.from_agent_id}",
        body=req.content,
        message_type="broadcast" if req.to_agent_id == "broadcast" else "message",
        reply_to=req.reply_to or "",
        priority="normal",
        metadata={"agent_messaging": True, **(req.metadata or {})},
    )

    if not result.get("ok"):
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send message: {result.get('message', 'Unknown error')}"
        )

    message = result["message"]

    return SendMessageResponse(
        ok=True,
        message_id=message["id"],
        delivered=True,  # Always true (WebSocket + maildir)
        queued=True,  # Always true (durable storage)
        timestamp=message["created_at"],
    )


@router.get("/{agent_id}", response_model=GetMessagesResponse)
async def get_messages(
    agent_id: str,
    unread_only: bool = True,
    mark_read: bool = True,
    limit: Optional[int] = None,
) -> GetMessagesResponse:
    """Get messages for an agent via k_inbox.

    Args:
        agent_id: Agent ID to retrieve messages for
        unread_only: Only return unread messages (default True)
        mark_read: Mark returned messages as read (default True)
        limit: Maximum number of messages to return

    Returns:
        GetMessagesResponse with list of messages
    """
    registry = get_registry()

    # Validate agent exists
    agent = registry.get(agent_id)
    if not agent:
        raise HTTPException(
            status_code=404,
            detail=f"Agent not found: {agent_id}"
        )

    # Query k_inbox for new messages
    result = k_inbox(
        action="list",
        folder="new",
        limit=limit or 1000,
        include_payload=True,
    )

    if not result.get("ok"):
        raise HTTPException(
            status_code=500,
            detail=f"Failed to query inbox: {result.get('message', 'Unknown error')}"
        )

    # Filter messages for this agent (to_agent matches agent_id, "broadcast", or "workers")
    all_messages = result.get("messages", [])
    messages = [
        msg for msg in all_messages
        if msg.get("to_agent") in [agent_id, "broadcast", "workers"]
    ]

    # Filter unread if requested
    if unread_only:
        messages = [msg for msg in messages if not msg.get("read", False)]

    # Apply limit
    if limit:
        messages = messages[:limit]

    # Mark as read if requested (for broadcasts)
    if mark_read:
        for msg in messages:
            if msg.get("message_type") == "broadcast":
                k_inbox(action="mark_read", id=msg["id"], agent_id=agent_id)

    # Count unread
    unread_count = len([m for m in messages if not m.get("read", False)])

    # Convert to response format
    response_messages = [{
        "message_id": m["id"],
        "from_agent_id": m.get("from_agent", "system"),
        "to_agent_id": m.get("to_agent", "workers"),
        "message_type": m.get("message_type", "message"),
        "content": m.get("body", ""),
        "metadata": m.get("metadata", {}),
        "timestamp": m["created_at"],
        "read": m.get("read", False),
        "reply_to": m.get("reply_to"),
    } for m in messages]

    return GetMessagesResponse(
        ok=True,
        agent_id=agent_id,
        messages=response_messages,
        count=len(response_messages),
        unread_count=unread_count,
    )


@router.delete("/{agent_id}")
async def clear_messages(
    agent_id: str,
    message_ids: Optional[List[str]] = None,
):
    """Clear messages for an agent via k_inbox.

    Args:
        agent_id: Agent ID to clear messages for
        message_ids: Optional list of specific message IDs to clear.
                    If not provided, clears all messages.

    Returns:
        Confirmation with count of cleared messages
    """
    registry = get_registry()

    # Validate agent exists
    agent = registry.get(agent_id)
    if not agent:
        raise HTTPException(
            status_code=404,
            detail=f"Agent not found: {agent_id}"
        )

    cleared = 0

    if message_ids:
        # Clear specific messages
        for msg_id in message_ids:
            result = k_inbox(action="complete", id=msg_id, status="done")
            if result.get("ok"):
                cleared += 1
    else:
        # Clear all messages for this agent
        result = k_inbox(action="list", folder="new", limit=1000)
        if result.get("ok"):
            messages = result.get("messages", [])
            for msg in messages:
                if msg.get("to_agent") == agent_id:
                    complete_result = k_inbox(action="complete", id=msg["id"], status="done")
                    if complete_result.get("ok"):
                        cleared += 1

    return {
        "ok": True,
        "agent_id": agent_id,
        "cleared": cleared,
        "message": f"Cleared {cleared} message(s) for agent {agent_id}",
    }


@router.get("/{agent_id}/unread")
async def get_unread_count(agent_id: str):
    """Get count of unread messages for an agent via k_inbox.

    Args:
        agent_id: Agent ID to check

    Returns:
        Unread message count
    """
    registry = get_registry()

    # Validate agent exists
    agent = registry.get(agent_id)
    if not agent:
        raise HTTPException(
            status_code=404,
            detail=f"Agent not found: {agent_id}"
        )

    # Query inbox for unread messages
    result = k_inbox(action="list", folder="new", limit=1000)
    if not result.get("ok"):
        raise HTTPException(
            status_code=500,
            detail="Failed to query inbox"
        )

    # Filter and count unread messages for this agent
    messages = result.get("messages", [])
    unread = [
        m for m in messages
        if m.get("to_agent") in [agent_id, "broadcast", "workers"]
        and not m.get("read", False)
    ]

    return {
        "ok": True,
        "agent_id": agent_id,
        "unread_count": len(unread),
    }


@router.get("/stats/queue")
async def get_queue_stats():
    """Get inbox statistics via k_inbox.

    Returns:
        Statistics about the unified inbox:
        - total_new: Messages in new/ folder
        - total_claimed: Messages in cur/ folder
        - total_done: Completed messages
        - total_queued_messages: New + claimed
        - agents_with_messages: Agents with pending messages
    """
    result = k_inbox(action="stats")

    if not result.get("ok"):
        raise HTTPException(
            status_code=500,
            detail="Failed to get inbox statistics"
        )

    return {
        "ok": True,
        "stats": result.get("stats", {}),
    }


@router.post("/test/broadcast")
async def test_broadcast(message: str = "Test broadcast from gateway"):
    """Test endpoint to send a broadcast message via k_inbox.

    Useful for testing WebSocket connectivity and broadcast functionality.

    Args:
        message: Test message content

    Returns:
        Confirmation
    """
    # Send test broadcast via k_inbox (triggers WebSocket automatically)
    result = k_inbox(
        action="send",
        from_agent="system",
        to_agent="broadcast",
        subject="Test broadcast",
        body=message,
        message_type="broadcast",
        priority="normal",
        metadata={"test": True},
    )

    if not result.get("ok"):
        raise HTTPException(
            status_code=500,
            detail="Failed to send test broadcast"
        )

    return {
        "ok": True,
        "message": "Broadcast sent",
        "content": message,
    }
