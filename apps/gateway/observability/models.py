"""
Observability Event Models
Pydantic models for hook event telemetry
"""
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class HookEventType(str, Enum):
    """All 12 Claude Code hook event types"""
    SESSION_START = "SessionStart"
    SESSION_END = "SessionEnd"
    USER_PROMPT_SUBMIT = "UserPromptSubmit"
    PRE_TOOL_USE = "PreToolUse"
    POST_TOOL_USE = "PostToolUse"
    POST_TOOL_USE_FAILURE = "PostToolUseFailure"
    PERMISSION_REQUEST = "PermissionRequest"
    NOTIFICATION = "Notification"
    STOP = "Stop"
    SUBAGENT_START = "SubagentStart"
    SUBAGENT_STOP = "SubagentStop"
    PRE_COMPACT = "PreCompact"


class HookEventCreate(BaseModel):
    """Inbound event from hook script POST"""
    source_app: str = "kuroryuu"
    session_id: str
    agent_id: Optional[str] = None
    hook_event_type: str
    tool_name: Optional[str] = None
    payload: dict = Field(default_factory=dict)
    chat_transcript: Optional[str] = None
    summary: Optional[str] = None
    model_name: Optional[str] = None
    timestamp: int  # Unix milliseconds


class HookEventRow(BaseModel):
    """Event as stored/returned from SQLite"""
    id: int
    source_app: str
    session_id: str
    agent_id: Optional[str] = None
    hook_event_type: str
    tool_name: Optional[str] = None
    payload: str  # JSON string
    chat_transcript: Optional[str] = None
    summary: Optional[str] = None
    model_name: Optional[str] = None
    timestamp: int


class ObservabilityStats(BaseModel):
    """Aggregate statistics"""
    total_events: int = 0
    events_per_minute: float = 0.0
    active_sessions: int = 0
    tool_counts: dict = Field(default_factory=dict)
    event_type_counts: dict = Field(default_factory=dict)
    storage_stats: dict = Field(default_factory=dict)
