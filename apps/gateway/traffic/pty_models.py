"""
PTY Traffic Event Models
Pydantic models for PTY read/write data capture between agents
"""
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
from datetime import datetime
from enum import Enum


class PTYAction(str, Enum):
    """PTY action types"""
    TALK = "talk"
    SEND_LINE = "send_line"
    READ = "read"
    TERM_READ = "term_read"
    CREATE = "create"
    KILL = "kill"
    WRITE = "write"
    RESIZE = "resize"
    RESOLVE = "resolve"
    LIST = "list"
    BASH_OUTPUT = "bash_output"  # Real-time k_bash background session output


class PTYEventBase(BaseModel):
    """Base PTY event with minimal fields for list/summary views"""
    id: str
    session_id: str
    action: str
    agent_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)
    success: bool = True
    duration: Optional[float] = None  # milliseconds
    command_preview: Optional[str] = None
    response_preview: Optional[str] = None


class PTYEventDetail(PTYEventBase):
    """
    Extended PTY event with full request/response capture.
    Body fields are truncated to 10KB max.
    """
    # Session context
    owner_session_id: Optional[str] = None
    label: Optional[str] = None
    session_source: Optional[str] = None
    cli_type: Optional[str] = None

    # Command details
    command: Optional[str] = None
    command_size: int = 0
    command_truncated: bool = False

    # Response details
    response: Optional[str] = None
    response_size: int = 0
    response_truncated: bool = False

    # Timing
    timeout_ms: Optional[int] = None
    timed_out: bool = False

    # Error info
    error_code: Optional[str] = None
    error_message: Optional[str] = None

    # Blocking
    blocked: bool = False
    blocked_pattern: Optional[str] = None

    # Streaming/backup event fields (used by k_backup progress streaming)
    event_type: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    is_final: bool = False

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PTYSessionSummary(BaseModel):
    """Summary statistics for a single PTY session"""
    session_id: str
    agent_id: Optional[str] = None
    owner_session_id: Optional[str] = None
    label: Optional[str] = None
    cli_type: Optional[str] = None
    event_count: int = 0
    error_count: int = 0
    blocked_count: int = 0
    avg_duration: float = 0.0
    total_bytes_sent: int = 0
    total_bytes_received: int = 0
    first_event_time: Optional[datetime] = None
    last_event_time: Optional[datetime] = None
    action_breakdown: Dict[str, int] = Field(default_factory=dict)  # action -> count


class PTYTrafficStats(BaseModel):
    """Real-time PTY traffic statistics"""
    events_per_second: float = 0.0
    bytes_per_second: float = 0.0
    avg_duration: float = 0.0
    error_rate: float = 0.0
    blocked_rate: float = 0.0
    total_events: int = 0
    active_sessions: int = 0
    total_bytes_sent: int = 0
    total_bytes_received: int = 0

    # Breakdowns
    action_breakdown: Dict[str, int] = Field(default_factory=dict)
    agent_breakdown: Dict[str, int] = Field(default_factory=dict)

    # Time-series data for charts (last 60 data points)
    throughput_history: List[Dict[str, Any]] = Field(default_factory=list)
    latency_history: List[Dict[str, Any]] = Field(default_factory=list)


# Constants
MAX_BODY_SIZE = 10 * 1024  # 10KB max for body capture
PREVIEW_SIZE = 500  # Preview size for WebSocket broadcasts


def truncate_body(body: str, max_size: int = MAX_BODY_SIZE) -> tuple[str, bool]:
    """Truncate body if too large, return (body, was_truncated)"""
    if not body:
        return "", False
    if len(body) <= max_size:
        return body, False
    return body[:max_size] + "\n... [TRUNCATED]", True


def create_body_preview(body: Optional[str], max_size: int = PREVIEW_SIZE) -> Optional[str]:
    """Create a preview of the body for WebSocket streaming (first N chars)"""
    if not body:
        return None
    if len(body) <= max_size:
        return body
    return body[:max_size] + "..."
