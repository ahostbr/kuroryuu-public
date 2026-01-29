"""AG-UI event types for kuroryuu_cli standalone mode.

Implements the AG-UI Interrupt-Aware Run Lifecycle for human-in-the-loop.
Reference: https://docs.ag-ui.com/drafts/interrupts

This module provides local AG-UI event types that can be used standalone
or routed to a gateway when available.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union


class InterruptReason(str, Enum):
    """Standard AG-UI interrupt reasons."""
    CLARIFICATION = "clarification"       # Need more info from user
    HUMAN_APPROVAL = "human_approval"     # Confirm before action
    PLAN_REVIEW = "plan_review"           # Review plan before execution
    UPLOAD_REQUIRED = "upload_required"   # Need file from user
    ERROR_RECOVERY = "error_recovery"     # Need guidance after error


@dataclass
class InterruptRequest:
    """AG-UI interrupt request.

    When an agent needs human input, it creates an InterruptRequest
    which pauses execution until the user responds.
    """
    id: str
    reason: InterruptReason
    question: str
    options: Optional[List[Dict[str, str]]] = None
    input_type: str = "text"  # text | choice | confirm
    default_value: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    created_at: datetime = field(default_factory=datetime.utcnow)

    @classmethod
    def create(
        cls,
        question: str,
        reason: Union[str, InterruptReason] = InterruptReason.CLARIFICATION,
        options: Optional[List[Dict[str, str]]] = None,
        input_type: str = "text",
        default_value: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> "InterruptRequest":
        """Create a new interrupt request with auto-generated ID."""
        if isinstance(reason, str):
            reason = InterruptReason(reason)

        return cls(
            id=f"int-{uuid.uuid4().hex[:12]}",
            reason=reason,
            question=question,
            options=options,
            input_type=input_type,
            default_value=default_value,
            context=context,
        )

    def to_agui_interrupt(self) -> Dict[str, Any]:
        """Convert to AG-UI interrupt payload format.

        Returns format compatible with AG-UI RUN_FINISHED event:
        {
            "id": "int-abc123",
            "reason": "clarification",
            "payload": {
                "question": "...",
                "options": [...],
                "inputType": "choice"
            }
        }
        """
        payload: Dict[str, Any] = {
            "question": self.question,
            "inputType": self.input_type,
        }

        if self.options:
            payload["options"] = self.options
        if self.default_value:
            payload["defaultValue"] = self.default_value
        if self.context:
            payload["context"] = self.context

        return {
            "id": self.id,
            "reason": self.reason.value,
            "payload": payload,
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for serialization."""
        return {
            "id": self.id,
            "reason": self.reason.value,
            "question": self.question,
            "options": self.options,
            "input_type": self.input_type,
            "default_value": self.default_value,
            "context": self.context,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class ResumePayload:
    """AG-UI resume payload - user's response to an interrupt.

    After user responds, this payload is sent back to continue execution.
    """
    interrupt_id: str
    answer: Any  # Can be string, bool, list, etc.
    modifications: Optional[Dict[str, Any]] = None
    responded_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to AG-UI resume format."""
        result = {
            "interruptId": self.interrupt_id,
            "payload": {"answer": self.answer},
        }
        if self.modifications:
            result["payload"]["modifications"] = self.modifications
        return result

    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict())


# Convenience functions for creating common interrupt types

def ask_clarification(
    question: str,
    options: Optional[List[Dict[str, str]]] = None,
    input_type: str = "text",
) -> InterruptRequest:
    """Create a clarification interrupt."""
    return InterruptRequest.create(
        question=question,
        reason=InterruptReason.CLARIFICATION,
        options=options,
        input_type=input_type,
    )


def ask_approval(
    question: str,
    context: Optional[Dict[str, Any]] = None,
) -> InterruptRequest:
    """Create a human approval interrupt."""
    return InterruptRequest.create(
        question=question,
        reason=InterruptReason.HUMAN_APPROVAL,
        input_type="confirm",
        context=context,
    )


def ask_plan_review(
    question: str,
    options: Optional[List[Dict[str, str]]] = None,
) -> InterruptRequest:
    """Create a plan review interrupt."""
    return InterruptRequest.create(
        question=question,
        reason=InterruptReason.PLAN_REVIEW,
        options=options,
        input_type="choice" if options else "text",
    )


__all__ = [
    "InterruptReason",
    "InterruptRequest",
    "ResumePayload",
    "ask_clarification",
    "ask_approval",
    "ask_plan_review",
]
