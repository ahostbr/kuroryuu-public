"""Agent Models - Data structures for agent registration.

M2 Multi-Agent Message Bus implementation.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class AgentRole(str, Enum):
    """Agent role in the orchestration system."""
    LEADER = "leader"
    WORKER = "worker"


class AgentStatus(str, Enum):
    """Agent lifecycle status."""
    IDLE = "idle"
    BUSY = "busy"
    DEAD = "dead"


class Agent(BaseModel):
    """Registered agent in the system.

    Identity format: {model_name}_{timestamp}_{uuid[:8]}
    Example: claude_20260106_143022_a1b2c3d4
    """
    agent_id: str = Field(..., description="Unique agent identifier")
    model_name: str = Field(..., description="LLM model name (claude, devstral, etc)")
    role: AgentRole = Field(default=AgentRole.WORKER, description="Leader or Worker")
    status: AgentStatus = Field(default=AgentStatus.IDLE, description="Current status")
    capabilities: List[str] = Field(default_factory=list, description="Agent capabilities")
    current_task_id: Optional[str] = Field(None, description="Currently assigned task")
    pty_session_id: Optional[str] = Field(None, description="Linked PTY session ID")
    last_heartbeat: datetime = Field(default_factory=datetime.utcnow)
    registered_at: datetime = Field(default_factory=datetime.utcnow)
    
    @classmethod
    def create(
        cls,
        model_name: str,
        role: AgentRole = AgentRole.WORKER,
        capabilities: Optional[List[str]] = None,
        agent_id: Optional[str] = None,
        pty_session_id: Optional[str] = None,
    ) -> "Agent":
        """Create a new agent with auto-generated or explicit ID.

        ID format (auto): {model_name}_{YYYYMMDD_HHMMSS}_{uuid[:8]}
        """
        now = datetime.utcnow()

        if agent_id is None:
            timestamp = now.strftime("%Y%m%d_%H%M%S")
            short_uuid = uuid.uuid4().hex[:8]
            agent_id = f"{model_name}_{timestamp}_{short_uuid}"

        return cls(
            agent_id=agent_id,
            model_name=model_name,
            role=role,
            capabilities=capabilities or [],
            pty_session_id=pty_session_id,
            last_heartbeat=now,
            registered_at=now,
        )
    
    def is_alive(self, timeout_seconds: float = 1.0) -> bool:
        """Check if agent is alive based on heartbeat timeout."""
        if self.status == AgentStatus.DEAD:
            return False
        elapsed = (datetime.utcnow() - self.last_heartbeat).total_seconds()
        return elapsed < timeout_seconds
    
    def heartbeat(self) -> None:
        """Update last heartbeat timestamp."""
        self.last_heartbeat = datetime.utcnow()
        if self.status == AgentStatus.DEAD:
            self.status = AgentStatus.IDLE
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "agent_id": self.agent_id,
            "model_name": self.model_name,
            "role": self.role.value,
            "status": self.status.value,
            "capabilities": self.capabilities,
            "current_task_id": self.current_task_id,
            "pty_session_id": self.pty_session_id,
            "last_heartbeat": self.last_heartbeat.isoformat(),
            "registered_at": self.registered_at.isoformat(),
        }


class RegisterRequest(BaseModel):
    """Request to register a new agent."""
    model_name: str = Field(..., description="LLM model name")
    role: Optional[AgentRole] = Field(None, description="Requested role (leader/worker)")
    capabilities: List[str] = Field(default_factory=list, description="Agent capabilities")
    agent_id: Optional[str] = Field(None, description="Optional explicit agent ID (for LM Studio persistent agents)")
    pty_session_id: Optional[str] = Field(None, description="PTY session ID to link to this agent")


class RegisterResponse(BaseModel):
    """Response from agent registration."""
    ok: bool
    agent_id: str
    role: AgentRole
    message: str
    pty_linked: bool = False
    pty_error: Optional[str] = None


class HeartbeatRequest(BaseModel):
    """Request to update agent heartbeat."""
    agent_id: str = Field(..., description="Agent ID to heartbeat")
    status: Optional[AgentStatus] = Field(None, description="Optional status update")
    current_task_id: Optional[str] = Field(None, description="Optional task assignment")


class HeartbeatResponse(BaseModel):
    """Response from heartbeat update."""
    ok: bool
    agent_id: str
    status: AgentStatus
    message: str


class AgentListResponse(BaseModel):
    """Response listing all agents."""
    agents: List[dict]
    total: int
    alive: int
    dead: int
