"""AG-UI Interrupt System for Human-in-the-Loop.

Implements the Interrupt-Aware Run Lifecycle from AG-UI draft proposal.
Reference: https://docs.ag-ui.com/drafts/interrupts

Key Concepts:
- Leader-only: Only leader agents can request interrupts
- Workers never block on human input
- Interrupts pause the run until user responds
- Resume continues with user's answer injected into context
"""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from ..utils.logging_config import get_logger

logger = get_logger(__name__)


class InterruptReason(str, Enum):
    """Standard interrupt reasons."""
    CLARIFICATION = "clarification"      # Need more info from user
    HUMAN_APPROVAL = "human_approval"    # Confirm before action
    UPLOAD_REQUIRED = "upload_required"  # Need file from user
    POLICY_HOLD = "policy_hold"          # Org policy requires approval
    ERROR_RECOVERY = "error_recovery"    # Need guidance after error
    PLAN_REVIEW = "plan_review"          # Review plan before execution
    CUSTOM = "custom"                    # Application-specific


class InterruptPayload(BaseModel):
    """Payload for interrupt request.
    
    This is what gets sent to the UI to render the interrupt.
    """
    question: str = Field(..., description="The question to ask the user")
    options: Optional[List[str]] = Field(None, description="Multiple choice options")
    input_type: str = Field("text", description="text | choice | confirm | form")
    default_value: Optional[str] = Field(None, description="Default answer")
    
    # Rich context for UI
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context")
    proposal: Optional[Dict[str, Any]] = Field(None, description="Proposed action to approve")
    
    # UI hints
    title: Optional[str] = Field(None, description="Dialog title")
    description: Optional[str] = Field(None, description="Extended description")
    severity: str = Field("info", description="info | warning | critical")


class InterruptRequest(BaseModel):
    """Full interrupt request from agent."""
    interrupt_id: str = Field(default_factory=lambda: f"int-{uuid.uuid4().hex[:12]}")
    reason: InterruptReason = InterruptReason.CLARIFICATION
    payload: InterruptPayload
    
    # Context
    thread_id: str
    run_id: str
    agent_id: Optional[str] = None
    agent_role: str = "leader"  # Only leader can interrupt
    
    # Timing
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None  # Optional timeout
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class ResumePayload(BaseModel):
    """User's response to an interrupt."""
    interrupt_id: str
    answer: Any  # Can be string, bool, dict, etc.
    
    # Optional modifications
    modifications: Optional[Dict[str, Any]] = None
    
    # Metadata
    responded_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


@dataclass
class PendingInterrupt:
    """In-memory representation of a pending interrupt."""
    request: InterruptRequest
    created_at: datetime = field(default_factory=datetime.utcnow)
    response: Optional[ResumePayload] = None
    resolved: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for JSON serialization."""
        return {
            "request": self.request.model_dump(),
            "created_at": self.created_at.isoformat(),
            "response": self.response.model_dump() if self.response else None,
            "resolved": self.resolved,
        }
    
    def resolve(self, response: ResumePayload) -> None:
        """Mark interrupt as resolved with response."""
        self.response = response
        self.resolved = True


class InterruptStore:
    """Storage for pending interrupts.
    
    Persists to WORKING/interrupts/ for recovery after restart.
    """
    
    def __init__(self, storage_dir: Optional[Path] = None):
        if storage_dir is None:
            project_root = os.environ.get(
                "KURORYUU_PROJECT_ROOT",
                str(Path(__file__).parent.parent.parent.parent)
            )
            storage_dir = Path(project_root) / "WORKING" / "interrupts"
        
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        
        # In-memory cache: thread_id -> {interrupt_id -> PendingInterrupt}
        self._pending: Dict[str, Dict[str, PendingInterrupt]] = {}
    
    def create_interrupt(
        self,
        thread_id: str,
        run_id: str,
        question: str,
        reason: InterruptReason = InterruptReason.CLARIFICATION,
        options: Optional[List[str]] = None,
        input_type: str = "text",
        agent_id: Optional[str] = None,
        agent_role: str = "leader",
        **payload_kwargs,
    ) -> InterruptRequest:
        """Create and store a new interrupt request.
        
        Args:
            thread_id: Conversation thread ID
            run_id: Current run ID
            question: Question to ask user
            reason: Why interrupt is needed
            options: Multiple choice options
            input_type: text | choice | confirm
            agent_id: Agent requesting interrupt
            agent_role: Must be "leader" (workers cannot interrupt)
            **payload_kwargs: Additional payload fields
        
        Returns:
            InterruptRequest ready to send to UI
        
        Raises:
            ValueError: If agent_role is not "leader"
        """
        # Enforce leader-only
        if agent_role != "leader":
            raise ValueError(
                f"Only leader agents can request interrupts. Got role: {agent_role}"
            )
        
        payload = InterruptPayload(
            question=question,
            options=options,
            input_type=input_type,
            **payload_kwargs,
        )
        
        request = InterruptRequest(
            thread_id=thread_id,
            run_id=run_id,
            reason=reason,
            payload=payload,
            agent_id=agent_id,
            agent_role=agent_role,
        )
        
        # Store in memory
        if thread_id not in self._pending:
            self._pending[thread_id] = {}
        
        pending = PendingInterrupt(request=request)
        self._pending[thread_id][request.interrupt_id] = pending
        
        # Persist to disk
        self._save_interrupt(pending)
        
        return request
    
    def get_pending(self, thread_id: str) -> List[PendingInterrupt]:
        """Get all pending (unresolved) interrupts for a thread."""
        if thread_id not in self._pending:
            self._load_thread_interrupts(thread_id)
        
        return [
            p for p in self._pending.get(thread_id, {}).values()
            if not p.resolved
        ]
    
    def get_interrupt(
        self,
        thread_id: str,
        interrupt_id: str,
    ) -> Optional[PendingInterrupt]:
        """Get a specific interrupt."""
        if thread_id not in self._pending:
            self._load_thread_interrupts(thread_id)
        
        return self._pending.get(thread_id, {}).get(interrupt_id)
    
    def resolve_interrupt(
        self,
        thread_id: str,
        interrupt_id: str,
        answer: Any,
        modifications: Optional[Dict[str, Any]] = None,
    ) -> Optional[ResumePayload]:
        """Resolve an interrupt with user's response.
        
        Returns:
            ResumePayload if interrupt found and resolved, None otherwise
        """
        pending = self.get_interrupt(thread_id, interrupt_id)
        if not pending:
            return None
        
        if pending.resolved:
            return pending.response
        
        response = ResumePayload(
            interrupt_id=interrupt_id,
            answer=answer,
            modifications=modifications,
        )
        
        pending.resolve(response)
        self._save_interrupt(pending)
        
        return response
    
    def has_pending_interrupt(self, thread_id: str) -> bool:
        """Check if thread has any pending interrupts."""
        return len(self.get_pending(thread_id)) > 0
    
    def clear_thread(self, thread_id: str) -> int:
        """Clear all interrupts for a thread. Returns count cleared."""
        if thread_id in self._pending:
            count = len(self._pending[thread_id])
            del self._pending[thread_id]
            
            # Remove from disk
            thread_dir = self.storage_dir / thread_id
            if thread_dir.exists():
                for f in thread_dir.glob("*.json"):
                    f.unlink()
                thread_dir.rmdir()
            
            return count
        return 0
    
    def _save_interrupt(self, pending: PendingInterrupt) -> None:
        """Persist interrupt to disk."""
        thread_id = pending.request.thread_id
        interrupt_id = pending.request.interrupt_id
        
        thread_dir = self.storage_dir / thread_id
        thread_dir.mkdir(parents=True, exist_ok=True)
        
        filepath = thread_dir / f"{interrupt_id}.json"
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(pending.to_dict(), f, indent=2, default=str)
    
    def _load_thread_interrupts(self, thread_id: str) -> None:
        """Load interrupts for a thread from disk."""
        thread_dir = self.storage_dir / thread_id
        if not thread_dir.exists():
            self._pending[thread_id] = {}
            return
        
        self._pending[thread_id] = {}
        
        for filepath in thread_dir.glob("*.json"):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                request = InterruptRequest(**data["request"])
                pending = PendingInterrupt(
                    request=request,
                    created_at=datetime.fromisoformat(data["created_at"]),
                    resolved=data.get("resolved", False),
                )
                
                if data.get("response"):
                    pending.response = ResumePayload(**data["response"])
                
                self._pending[thread_id][request.interrupt_id] = pending
            except Exception as e:
                # Log but don't fail
                logger.warning(f"Failed to load interrupt {filepath}: {e}")


# Singleton instance
_interrupt_store: Optional[InterruptStore] = None


def get_interrupt_store() -> InterruptStore:
    """Get the global interrupt store instance."""
    global _interrupt_store
    if _interrupt_store is None:
        _interrupt_store = InterruptStore()
    return _interrupt_store


__all__ = [
    "InterruptReason",
    "InterruptPayload",
    "InterruptRequest",
    "ResumePayload",
    "PendingInterrupt",
    "InterruptStore",
    "get_interrupt_store",
]
