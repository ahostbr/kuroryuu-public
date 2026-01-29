"""
Sessions Router - FastAPI endpoints for agent session management.

M5 Terminal-Chat Integration.

Endpoints:
- POST /v1/sessions - Create new session
- GET  /v1/sessions - List sessions
- GET  /v1/sessions/{session_id} - Get session
- POST /v1/sessions/{session_id}/messages - Add message
- DELETE /v1/sessions/{session_id} - Delete session
"""

from __future__ import annotations

from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .storage import SessionStorage
from .models import MessageRole, MessageStatus

router = APIRouter(prefix="/v1/sessions", tags=["sessions"])

# Singleton storage instance
_storage: Optional[SessionStorage] = None


def get_storage() -> SessionStorage:
    """Get the singleton session storage instance."""
    global _storage
    if _storage is None:
        _storage = SessionStorage()
    return _storage


# ═══════════════════════════════════════════════════════════════════════════════
# Request/Response Models
# ═══════════════════════════════════════════════════════════════════════════════

class CreateSessionRequest(BaseModel):
    agent_id: str = Field(..., description="Agent ID")
    agent_name: str = Field(..., description="Agent display name")
    model_name: Optional[str] = Field(None, description="LLM model name")
    lmstudio_ip: Optional[str] = Field(None, description="LM Studio IP address")
    session_id: Optional[str] = Field(None, description="Optional explicit session ID")


class AddMessageRequest(BaseModel):
    role: str = Field(..., description="Message role: user, assistant, system")
    content: str = Field(..., description="Message content")
    tool_calls: Optional[List[dict]] = Field(None, description="Tool calls if any")


class SessionResponse(BaseModel):
    session_id: str
    agent_id: str
    agent_name: str
    model_name: Optional[str]
    message_count: int
    created_at: str
    updated_at: str
    feature_id: Optional[str] = None
    feature_title: Optional[str] = None


class SessionListResponse(BaseModel):
    sessions: List[SessionResponse]
    total: int


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("", response_model=dict)
async def create_session(req: CreateSessionRequest):
    """Create a new agent session."""
    storage = get_storage()
    session = storage.create_session(
        agent_id=req.agent_id,
        agent_name=req.agent_name,
        model_name=req.model_name,
        lmstudio_ip=req.lmstudio_ip,
        session_id=req.session_id,
    )

    # Auto-capture active feature from harness (Dynamic Feature-Task Linking)
    feature_id = None
    feature_title = None
    try:
        from ..harness import get_harness_store
        store = get_harness_store()
        fl = store.load_feature_list()
        active = fl.get_active_feature()
        if active:
            feature_id = active.id
            feature_title = active.title
            session.metadata.feature_id = feature_id
            session.metadata.feature_title = feature_title
            storage.save_session(session)
    except Exception as e:
        # Non-fatal: harness may not be configured
        pass

    return {
        "ok": True,
        "session_id": session.session_id,
        "feature_id": feature_id,
        "feature_title": feature_title,
        "message": f"Session {session.session_id} created",
    }


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    agent_id: Optional[str] = None,
    limit: int = 50,
):
    """List sessions, optionally filtered by agent."""
    storage = get_storage()
    session_infos = storage.list_sessions(agent_id=agent_id, limit=limit)
    
    return SessionListResponse(
        sessions=[
            SessionResponse(
                session_id=s.get("session_id", "unknown"),
                agent_id=s.get("agent_id", "unknown"),
                agent_name=s.get("agent_name", "Agent"),
                model_name=s.get("model_name"),
                message_count=s.get("message_count", 0),
                created_at=str(s.get("created_at", "")),
                updated_at=str(s.get("updated_at", "")),
                feature_id=s.get("feature_id"),
                feature_title=s.get("feature_title"),
            )
            for s in session_infos
        ],
        total=len(session_infos),
    )


@router.get("/{session_id}")
async def get_session(session_id: str):
    """Get a session with all messages."""
    storage = get_storage()
    session = storage.load_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    
    return {
        "session_id": session.session_id,
        "agent_id": session.metadata.agent_id,
        "agent_name": session.metadata.agent_name,
        "model_name": session.metadata.model_name,
        "lmstudio_ip": session.metadata.lmstudio_ip,
        "feature_id": session.metadata.feature_id,
        "feature_title": session.metadata.feature_title,
        "created_at": session.metadata.created_at.isoformat(),
        "updated_at": session.metadata.updated_at.isoformat(),
        "messages": [
            {
                "id": m.id,
                "role": m.role.value,
                "content": m.content,
                "timestamp": m.timestamp.isoformat(),
                "status": m.status.value,
                "tool_calls": m.tool_calls,
            }
            for m in session.messages
        ],
    }


@router.post("/{session_id}/messages")
async def add_message(session_id: str, req: AddMessageRequest):
    """Add a message to a session."""
    storage = get_storage()
    session = storage.load_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    
    # Map role string to enum
    try:
        role = MessageRole(req.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {req.role}")
    
    # Import SessionMessage from models
    from .models import SessionMessage
    
    message = SessionMessage(
        role=role,
        content=req.content,
        tool_calls=req.tool_calls,
    )
    
    success = storage.add_message(session_id, message)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to add message")
    
    return {
        "ok": True,
        "message_id": message.id,
        "session_id": session_id,
    }


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    storage = get_storage()
    success = storage.delete_session(session_id)
    
    if not success:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    
    return {
        "ok": True,
        "message": f"Session {session_id} deleted",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Claude Code Sub-agent Resume Support
# ═══════════════════════════════════════════════════════════════════════════════

class SetSubagentIdRequest(BaseModel):
    subagent_id: str = Field(..., description="Sub-agent ID for Claude Code resume")
    subagent_config_path: Optional[str] = Field(None, description="Path to .claude/agents/*.md")
    role: Optional[str] = Field(None, description="Agent role: leader/worker")


@router.post("/{session_id}/subagent")
async def set_subagent_id(session_id: str, req: SetSubagentIdRequest):
    """Set sub-agent ID for Claude Code resume capability.
    
    This allows a session to be resumed by Claude Code using the agentId parameter.
    """
    storage = get_storage()
    session = storage.load_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    
    # Update metadata
    session.metadata.subagent_id = req.subagent_id
    if req.subagent_config_path:
        session.metadata.subagent_config_path = req.subagent_config_path
    if req.role:
        session.metadata.role = req.role
    
    # Save session
    success = storage.save_session(session)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update session")
    
    return {
        "ok": True,
        "session_id": session_id,
        "subagent_id": req.subagent_id,
        "subagent_config_path": req.subagent_config_path,
        "role": req.role,
    }


@router.get("/by-subagent/{subagent_id}")
async def get_session_by_subagent_id(subagent_id: str):
    """Find session by sub-agent ID for Claude Code resume.
    
    Returns the most recent session with the given subagent_id.
    """
    storage = get_storage()
    sessions = storage.list_sessions()
    
    # Find sessions with matching subagent_id, sort by updated_at desc
    matching = [
        s for s in sessions 
        if s.metadata.subagent_id == subagent_id
    ]
    
    if not matching:
        raise HTTPException(
            status_code=404, 
            detail=f"No session found for subagent_id: {subagent_id}"
        )
    
    # Return most recently updated
    matching.sort(key=lambda s: s.metadata.updated_at, reverse=True)
    session = matching[0]
    
    return {
        "ok": True,
        "session_id": session.session_id,
        "subagent_id": subagent_id,
        "agent_name": session.metadata.agent_name,
        "role": session.metadata.role,
        "message_count": session.metadata.total_messages,
        "updated_at": session.metadata.updated_at,
    }
