"""Inbox Models - Data structures for inter-agent messaging.

M3 Multi-Agent Message Bus implementation.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class MessagePriority(str, Enum):
    """Message priority levels."""
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"


class MessageStatus(str, Enum):
    """Message lifecycle status."""
    PENDING = "pending"      # Sent, waiting for claim
    CLAIMED = "claimed"      # Claimed by an agent
    IN_PROGRESS = "in_progress"  # Work started
    COMPLETED = "completed"  # Successfully finished
    FAILED = "failed"        # Failed with error


class Message(BaseModel):
    """Inter-agent message.
    
    Follows the workflow:
    1. PENDING - Message sent, waiting for agent to claim
    2. CLAIMED - Agent claimed, has exclusive access
    3. IN_PROGRESS - Agent working on task
    4. COMPLETED/FAILED - Terminal states
    """
    message_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    from_agent: str = Field(..., description="Sender agent ID or 'system'")
    to_agent: str = Field(..., description="Target: agent_id, 'broadcast', or 'workers'")
    subject: str = Field(..., description="Brief task description")
    body: str = Field(default="", description="Detailed task content")
    priority: MessagePriority = Field(default=MessagePriority.NORMAL)
    status: MessageStatus = Field(default=MessageStatus.PENDING)
    
    # Claim tracking
    claimed_by: Optional[str] = Field(None, description="Agent ID that claimed")
    claimed_at: Optional[datetime] = Field(None)
    
    # Completion tracking
    completed_at: Optional[datetime] = Field(None)
    result: Optional[str] = Field(None, description="Task output/result")
    error: Optional[str] = Field(None, description="Error message if failed")
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    def claim(self, agent_id: str) -> bool:
        """Attempt to claim this message.
        
        Returns True if claim successful, False if already claimed.
        """
        if self.status != MessageStatus.PENDING:
            return False
        
        self.status = MessageStatus.CLAIMED
        self.claimed_by = agent_id
        self.claimed_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        return True
    
    def start_progress(self) -> bool:
        """Mark message as in-progress."""
        if self.status != MessageStatus.CLAIMED:
            return False
        
        self.status = MessageStatus.IN_PROGRESS
        self.updated_at = datetime.utcnow()
        return True
    
    def complete(self, result: str = "") -> bool:
        """Mark message as completed."""
        if self.status not in (MessageStatus.CLAIMED, MessageStatus.IN_PROGRESS):
            return False
        
        self.status = MessageStatus.COMPLETED
        self.result = result
        self.completed_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        return True
    
    def fail(self, error: str = "") -> bool:
        """Mark message as failed."""
        if self.status not in (MessageStatus.CLAIMED, MessageStatus.IN_PROGRESS):
            return False
        
        self.status = MessageStatus.FAILED
        self.error = error
        self.completed_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        return True
    
    def release(self) -> bool:
        """Release claim, return to pending."""
        if self.status not in (MessageStatus.CLAIMED, MessageStatus.IN_PROGRESS):
            return False
        
        self.status = MessageStatus.PENDING
        self.claimed_by = None
        self.claimed_at = None
        self.updated_at = datetime.utcnow()
        return True
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "message_id": self.message_id,
            "from_agent": self.from_agent,
            "to_agent": self.to_agent,
            "subject": self.subject,
            "body": self.body,
            "priority": self.priority.value,
            "status": self.status.value,
            "claimed_by": self.claimed_by,
            "claimed_at": self.claimed_at.isoformat() if self.claimed_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "metadata": self.metadata,
        }


# ═══════════════════════════════════════════════════════════════════════════════
# Request/Response Models
# ═══════════════════════════════════════════════════════════════════════════════

class SendRequest(BaseModel):
    """Request to send a message."""
    from_agent: str = Field(..., description="Sender agent ID")
    to_agent: str = Field(..., description="Target: agent_id, 'broadcast', or 'workers'")
    subject: str = Field(..., description="Brief task description")
    body: str = Field(default="", description="Detailed content")
    priority: MessagePriority = Field(default=MessagePriority.NORMAL)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SendResponse(BaseModel):
    """Response from sending a message."""
    ok: bool
    message_id: str
    message: str


class ClaimRequest(BaseModel):
    """Request to claim a message."""
    message_id: str = Field(..., description="Message ID to claim")
    agent_id: str = Field(..., description="Agent claiming the message")


class ClaimResponse(BaseModel):
    """Response from claiming a message."""
    ok: bool
    message_id: str
    message: str
    task: Optional[dict] = Field(None, description="Message details if claimed")


class AckRequest(BaseModel):
    """Request to acknowledge/start progress."""
    message_id: str = Field(..., description="Message ID")
    agent_id: str = Field(..., description="Agent acknowledging")


class AckResponse(BaseModel):
    """Response from acknowledgment."""
    ok: bool
    message_id: str
    status: MessageStatus
    message: str


class CompleteRequest(BaseModel):
    """Request to complete a message."""
    message_id: str = Field(..., description="Message ID")
    agent_id: str = Field(..., description="Agent completing")
    status: str = Field(default="completed", description="'completed' or 'failed'")
    result: str = Field(default="", description="Result or error message")


class CompleteResponse(BaseModel):
    """Response from completing a message."""
    ok: bool
    message_id: str
    status: MessageStatus
    message: str


class ListResponse(BaseModel):
    """Response listing messages."""
    messages: List[dict]
    total: int
    pending: int
    claimed: int
    completed: int
    failed: int
