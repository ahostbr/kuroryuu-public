"""Chat history API router for web UI persistence."""
from __future__ import annotations

from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Cookie
from pydantic import BaseModel, Field

from .storage import get_chat_storage

router = APIRouter(prefix="/v1/chat-history", tags=["chat-history"])


# ═══════════════════════════════════════════════════════════════════════════════
# Request/Response Models
# ═══════════════════════════════════════════════════════════════════════════════

class ChatMessage(BaseModel):
    id: str
    role: str
    content: str
    timestamp: int
    toolName: Optional[str] = None
    toolResult: Optional[str] = None


class ChatSession(BaseModel):
    id: str
    title: str
    messages: List[ChatMessage] = Field(default_factory=list)
    createdAt: int


class SessionSummary(BaseModel):
    id: str
    title: str
    createdAt: int
    messageCount: int


class SaveSessionRequest(BaseModel):
    session: ChatSession


# ═══════════════════════════════════════════════════════════════════════════════
# Helper to extract username from session
# ═══════════════════════════════════════════════════════════════════════════════

# Import the auth sessions set from server.py (we'll use a simpler approach)
# For now, we'll use "default" user or extract from a header

def _get_username(kuroryuu_session: str | None) -> str:
    """Get username from session. For now returns default."""
    # In a real implementation, we'd look up the session token
    # For simplicity, use a single shared storage
    return "Ryan"  # Hardcoded for single-user deployment


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/sessions", response_model=List[SessionSummary])
async def list_sessions(kuroryuu_session: str = Cookie(None)):
    """List all chat sessions for the user."""
    username = _get_username(kuroryuu_session)
    storage = get_chat_storage()
    sessions = storage.get_sessions(username)
    return sessions


@router.get("/sessions/{session_id}", response_model=ChatSession)
async def get_session(session_id: str, kuroryuu_session: str = Cookie(None)):
    """Get a specific session with full message history."""
    username = _get_username(kuroryuu_session)
    storage = get_chat_storage()
    session = storage.get_session(username, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/sessions")
async def save_session(request: SaveSessionRequest, kuroryuu_session: str = Cookie(None)):
    """Save or update a chat session."""
    username = _get_username(kuroryuu_session)
    storage = get_chat_storage()
    success = storage.save_session(username, request.session.model_dump())
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save session")
    return {"ok": True, "session_id": request.session.id}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, kuroryuu_session: str = Cookie(None)):
    """Delete a chat session."""
    username = _get_username(kuroryuu_session)
    storage = get_chat_storage()
    success = storage.delete_session(username, session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}
