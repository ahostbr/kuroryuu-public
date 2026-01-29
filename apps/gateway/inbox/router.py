"""Inbox Router - FastAPI endpoints for inter-agent messaging.

M3 Multi-Agent Message Bus implementation.

Endpoints:
- POST /v1/inbox/send - Send a message to an agent
- POST /v1/inbox/claim - Claim a message for processing
- POST /v1/inbox/ack - Acknowledge and start progress
- POST /v1/inbox/complete - Mark message completed/failed
- POST /v1/inbox/release - Release claim, return to pending
- GET  /v1/inbox/list - List messages with filters
- GET  /v1/inbox/{message_id} - Get specific message
- GET  /v1/inbox/stats - Inbox statistics
- GET  /v1/inbox/for/{agent_id} - List messages for an agent
- POST /v1/inbox/cleanup - Remove old completed messages
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from .models import (
    AckRequest,
    AckResponse,
    ClaimRequest,
    ClaimResponse,
    CompleteRequest,
    CompleteResponse,
    ListResponse,
    MessagePriority,
    MessageStatus,
    SendRequest,
    SendResponse,
)
from .service import get_inbox

router = APIRouter(prefix="/v1/inbox", tags=["inbox"])


@router.post("/send", response_model=SendResponse)
async def send_message(req: SendRequest) -> SendResponse:
    """Send a message to an agent.
    
    Target types:
    - Specific agent_id: Direct message to that agent
    - 'broadcast': All agents can see/claim
    - 'workers': Any worker agent can claim
    """
    inbox = get_inbox()
    message, status_msg = inbox.send(
        from_agent=req.from_agent,
        to_agent=req.to_agent,
        subject=req.subject,
        body=req.body,
        priority=req.priority,
        metadata=req.metadata,
    )
    
    return SendResponse(
        ok=True,
        message_id=message.message_id,
        message=status_msg,
    )


@router.post("/claim", response_model=ClaimResponse)
async def claim_message(req: ClaimRequest) -> ClaimResponse:
    """Claim a message for exclusive processing.
    
    Only pending messages can be claimed.
    Agent must be allowed recipient (exact match, broadcast, or workers).
    """
    inbox = get_inbox()
    ok, status_msg, message = inbox.claim(req.message_id, req.agent_id)
    
    if not ok:
        raise HTTPException(status_code=400, detail=status_msg)
    
    return ClaimResponse(
        ok=True,
        message_id=req.message_id,
        message=status_msg,
        task=message.to_dict() if message else None,
    )


@router.post("/ack", response_model=AckResponse)
async def ack_message(req: AckRequest) -> AckResponse:
    """Acknowledge claim and mark as in-progress.
    
    Signals that agent has started working on the task.
    """
    inbox = get_inbox()
    ok, status_msg = inbox.ack(req.message_id, req.agent_id)
    
    if not ok:
        raise HTTPException(status_code=400, detail=status_msg)
    
    message = inbox.get(req.message_id)
    return AckResponse(
        ok=True,
        message_id=req.message_id,
        status=message.status if message else MessageStatus.IN_PROGRESS,
        message=status_msg,
    )


@router.post("/complete", response_model=CompleteResponse)
async def complete_message(req: CompleteRequest) -> CompleteResponse:
    """Mark message as completed or failed.
    
    status: 'completed' or 'failed'
    result: Task output or error message
    """
    inbox = get_inbox()
    success = req.status.lower() in ("completed", "done", "success")
    ok, status_msg = inbox.complete(
        message_id=req.message_id,
        agent_id=req.agent_id,
        success=success,
        result=req.result,
    )
    
    if not ok:
        raise HTTPException(status_code=400, detail=status_msg)
    
    message = inbox.get(req.message_id)
    return CompleteResponse(
        ok=True,
        message_id=req.message_id,
        status=message.status if message else MessageStatus.COMPLETED,
        message=status_msg,
    )


@router.post("/release")
async def release_message(req: ClaimRequest):
    """Release claim on a message, return to pending.
    
    Use when agent cannot complete the task.
    """
    inbox = get_inbox()
    ok, status_msg = inbox.release(req.message_id, req.agent_id)
    
    if not ok:
        raise HTTPException(status_code=400, detail=status_msg)
    
    return {"ok": True, "message_id": req.message_id, "message": status_msg}


@router.get("/list", response_model=ListResponse)
async def list_messages(
    status: Optional[str] = Query(None, description="Filter by status"),
    to_agent: Optional[str] = Query(None, description="Filter by recipient"),
    limit: int = Query(50, ge=1, le=200),
) -> ListResponse:
    """List all messages with optional filters."""
    inbox = get_inbox()
    
    status_enum = None
    if status:
        try:
            status_enum = MessageStatus(status.lower())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    
    messages = inbox.list_all(status=status_enum, to_agent=to_agent, limit=limit)
    stats = inbox.stats()
    
    return ListResponse(
        messages=[m.to_dict() for m in messages],
        total=stats["total"],
        pending=stats["pending"],
        claimed=stats["claimed"],
        completed=stats["completed"],
        failed=stats["failed"],
    )


@router.get("/stats")
async def inbox_stats():
    """Get inbox statistics."""
    inbox = get_inbox()
    return inbox.stats()


@router.get("/for/{agent_id}")
async def list_for_agent(
    agent_id: str,
    include_claimed: bool = Query(True, description="Include messages claimed by this agent"),
    limit: int = Query(20, ge=1, le=100),
):
    """List messages available to a specific agent.
    
    Returns pending messages addressed to the agent plus
    messages already claimed by the agent.
    """
    inbox = get_inbox()
    messages = inbox.list_for_agent(agent_id, include_claimed=include_claimed, limit=limit)
    
    return {
        "agent_id": agent_id,
        "messages": [m.to_dict() for m in messages],
        "count": len(messages),
    }


@router.get("/{message_id}")
async def get_message(message_id: str):
    """Get a specific message by ID."""
    inbox = get_inbox()
    message = inbox.get(message_id)
    
    if not message:
        raise HTTPException(status_code=404, detail=f"Message {message_id} not found")
    
    return message.to_dict()


@router.post("/cleanup")
async def cleanup_messages(older_than_hours: int = Query(24, ge=1)):
    """Remove old completed/failed messages.
    
    Helps keep inbox clean over time.
    """
    inbox = get_inbox()
    removed = inbox.cleanup(older_than_hours)
    
    return {
        "ok": True,
        "removed": removed,
        "message": f"Removed {removed} messages older than {older_than_hours}h",
    }
