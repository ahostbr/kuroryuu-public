"""AG-UI Event Types and Emitters.

Implements the AG-UI event protocol for streaming agent interactions.
Reference: https://docs.ag-ui.com/concepts/events

Event Categories:
- Lifecycle: RunStarted, RunFinished, RunError, StepStarted, StepFinished
- Text Messages: TextMessageStart, TextMessageContent, TextMessageEnd
- Tool Calls: ToolCallStart, ToolCallArgs, ToolCallEnd, ToolCallResult
- State: StateSnapshot, StateDelta, MessagesSnapshot
- Special: Raw, Custom
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class AGUIEventType(str, Enum):
    """AG-UI event types per protocol spec."""
    # Lifecycle
    RUN_STARTED = "RUN_STARTED"
    RUN_FINISHED = "RUN_FINISHED"
    RUN_ERROR = "RUN_ERROR"
    STEP_STARTED = "STEP_STARTED"
    STEP_FINISHED = "STEP_FINISHED"
    
    # Text Messages
    TEXT_MESSAGE_START = "TEXT_MESSAGE_START"
    TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT"
    TEXT_MESSAGE_END = "TEXT_MESSAGE_END"
    
    # Tool Calls
    TOOL_CALL_START = "TOOL_CALL_START"
    TOOL_CALL_ARGS = "TOOL_CALL_ARGS"
    TOOL_CALL_END = "TOOL_CALL_END"
    TOOL_CALL_RESULT = "TOOL_CALL_RESULT"
    
    # State Management
    STATE_SNAPSHOT = "STATE_SNAPSHOT"
    STATE_DELTA = "STATE_DELTA"
    MESSAGES_SNAPSHOT = "MESSAGES_SNAPSHOT"
    
    # Activity
    ACTIVITY_SNAPSHOT = "ACTIVITY_SNAPSHOT"
    ACTIVITY_DELTA = "ACTIVITY_DELTA"
    
    # Special
    RAW = "RAW"
    CUSTOM = "CUSTOM"


@dataclass
class AGUIEvent:
    """AG-UI protocol event."""
    type: AGUIEventType
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: Optional[str] = None
    raw_event: Optional[Dict[str, Any]] = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow().isoformat() + "Z"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for JSON serialization."""
        result = {
            "type": self.type.value if isinstance(self.type, AGUIEventType) else self.type,
            "timestamp": self.timestamp,
            **self.data,
        }
        if self.raw_event:
            result["rawEvent"] = self.raw_event
        return result
    
    def to_sse(self) -> str:
        """Convert to SSE data line."""
        return f"data: {json.dumps(self.to_dict(), ensure_ascii=False)}\n\n"


# --- Lifecycle Events ---

def emit_run_started(
    thread_id: str,
    run_id: str,
    parent_run_id: Optional[str] = None,
    input_data: Optional[Dict[str, Any]] = None,
) -> AGUIEvent:
    """Emit RUN_STARTED event - signals start of agent run."""
    data = {
        "threadId": thread_id,
        "runId": run_id,
    }
    if parent_run_id:
        data["parentRunId"] = parent_run_id
    if input_data:
        data["input"] = input_data
    return AGUIEvent(type=AGUIEventType.RUN_STARTED, data=data)


def emit_run_finished(
    thread_id: str,
    run_id: str,
    result: Optional[Any] = None,
    outcome: str = "success",
    interrupt: Optional[Dict[str, Any]] = None,
) -> AGUIEvent:
    """Emit RUN_FINISHED event - signals successful completion or interrupt.
    
    Args:
        thread_id: Conversation thread ID
        run_id: Agent run ID
        result: Optional result data (when outcome="success")
        outcome: "success" or "interrupt"
        interrupt: Interrupt payload (when outcome="interrupt")
    """
    data = {
        "threadId": thread_id,
        "runId": run_id,
        "outcome": outcome,
    }
    if outcome == "success" and result is not None:
        data["result"] = result
    if outcome == "interrupt" and interrupt:
        data["interrupt"] = interrupt
    return AGUIEvent(type=AGUIEventType.RUN_FINISHED, data=data)


def emit_run_error(
    message: str,
    code: Optional[str] = None,
) -> AGUIEvent:
    """Emit RUN_ERROR event - signals error during run."""
    data = {"message": message}
    if code:
        data["code"] = code
    return AGUIEvent(type=AGUIEventType.RUN_ERROR, data=data)


def emit_step_started(step_name: str) -> AGUIEvent:
    """Emit STEP_STARTED event - signals start of a step within run."""
    return AGUIEvent(type=AGUIEventType.STEP_STARTED, data={"stepName": step_name})


def emit_step_finished(step_name: str) -> AGUIEvent:
    """Emit STEP_FINISHED event - signals completion of a step."""
    return AGUIEvent(type=AGUIEventType.STEP_FINISHED, data={"stepName": step_name})


# --- Text Message Events ---

def emit_text_message_start(
    message_id: str,
    role: str = "assistant",
) -> AGUIEvent:
    """Emit TEXT_MESSAGE_START - initializes a new text message."""
    return AGUIEvent(
        type=AGUIEventType.TEXT_MESSAGE_START,
        data={"messageId": message_id, "role": role},
    )


def emit_text_message_content(
    message_id: str,
    delta: str,
) -> AGUIEvent:
    """Emit TEXT_MESSAGE_CONTENT - delivers text chunk."""
    return AGUIEvent(
        type=AGUIEventType.TEXT_MESSAGE_CONTENT,
        data={"messageId": message_id, "delta": delta},
    )


def emit_text_message_end(message_id: str) -> AGUIEvent:
    """Emit TEXT_MESSAGE_END - marks message complete."""
    return AGUIEvent(
        type=AGUIEventType.TEXT_MESSAGE_END,
        data={"messageId": message_id},
    )


# --- Tool Call Events ---

def emit_tool_call_start(
    tool_call_id: str,
    tool_call_name: str,
    parent_message_id: Optional[str] = None,
) -> AGUIEvent:
    """Emit TOOL_CALL_START - signals tool invocation beginning."""
    data = {
        "toolCallId": tool_call_id,
        "toolCallName": tool_call_name,
    }
    if parent_message_id:
        data["parentMessageId"] = parent_message_id
    return AGUIEvent(type=AGUIEventType.TOOL_CALL_START, data=data)


def emit_tool_call_args(
    tool_call_id: str,
    delta: str,
) -> AGUIEvent:
    """Emit TOOL_CALL_ARGS - delivers argument chunk."""
    return AGUIEvent(
        type=AGUIEventType.TOOL_CALL_ARGS,
        data={"toolCallId": tool_call_id, "delta": delta},
    )


def emit_tool_call_end(tool_call_id: str) -> AGUIEvent:
    """Emit TOOL_CALL_END - marks tool call specification complete."""
    return AGUIEvent(
        type=AGUIEventType.TOOL_CALL_END,
        data={"toolCallId": tool_call_id},
    )


def emit_tool_call_result(
    tool_call_id: str,
    content: Any,
    message_id: Optional[str] = None,
    role: str = "tool",
) -> AGUIEvent:
    """Emit TOOL_CALL_RESULT - delivers tool execution result."""
    data = {
        "toolCallId": tool_call_id,
        "content": content,
        "role": role,
    }
    if message_id:
        data["messageId"] = message_id
    return AGUIEvent(type=AGUIEventType.TOOL_CALL_RESULT, data=data)


# --- State Management Events ---

def emit_state_snapshot(snapshot: Dict[str, Any]) -> AGUIEvent:
    """Emit STATE_SNAPSHOT - complete state representation."""
    return AGUIEvent(
        type=AGUIEventType.STATE_SNAPSHOT,
        data={"snapshot": snapshot},
    )


def emit_state_delta(delta: List[Dict[str, Any]]) -> AGUIEvent:
    """Emit STATE_DELTA - JSON Patch operations (RFC 6902).
    
    Args:
        delta: List of JSON Patch operations, e.g.:
            [{"op": "replace", "path": "/status", "value": "running"}]
    """
    return AGUIEvent(
        type=AGUIEventType.STATE_DELTA,
        data={"delta": delta},
    )


def emit_messages_snapshot(messages: List[Dict[str, Any]]) -> AGUIEvent:
    """Emit MESSAGES_SNAPSHOT - complete message history."""
    return AGUIEvent(
        type=AGUIEventType.MESSAGES_SNAPSHOT,
        data={"messages": messages},
    )


# --- Activity Events ---

def emit_activity_snapshot(
    message_id: str,
    activity_type: str,
    content: Dict[str, Any],
    replace: bool = True,
) -> AGUIEvent:
    """Emit ACTIVITY_SNAPSHOT - complete activity state."""
    return AGUIEvent(
        type=AGUIEventType.ACTIVITY_SNAPSHOT,
        data={
            "messageId": message_id,
            "activityType": activity_type,
            "content": content,
            "replace": replace,
        },
    )


def emit_activity_delta(
    message_id: str,
    activity_type: str,
    patch: List[Dict[str, Any]],
) -> AGUIEvent:
    """Emit ACTIVITY_DELTA - JSON Patch for activity."""
    return AGUIEvent(
        type=AGUIEventType.ACTIVITY_DELTA,
        data={
            "messageId": message_id,
            "activityType": activity_type,
            "patch": patch,
        },
    )


# --- Special Events ---

def emit_raw(event: Dict[str, Any], source: Optional[str] = None) -> AGUIEvent:
    """Emit RAW event - passthrough from external systems."""
    data = {"event": event}
    if source:
        data["source"] = source
    return AGUIEvent(type=AGUIEventType.RAW, data=data)


def emit_custom(name: str, value: Any) -> AGUIEvent:
    """Emit CUSTOM event - application-specific events."""
    return AGUIEvent(
        type=AGUIEventType.CUSTOM,
        data={"name": name, "value": value},
    )


# --- Kuroryuu-specific convenience events ---

def emit_clarification_request(
    interrupt_id: str,
    question: str,
    options: Optional[List[str]] = None,
    input_type: str = "text",
    reason: str = "clarification",
    payload: Optional[Dict[str, Any]] = None,
) -> AGUIEvent:
    """Emit clarification request as CUSTOM event.
    
    This is a Kuroryuu-specific event that maps to AG-UI's interrupt pattern.
    The UI should render this as an interactive prompt.
    
    Args:
        interrupt_id: Unique ID for this interrupt
        question: The question to ask the user
        options: Multiple choice options (optional)
        input_type: "text" | "choice" | "confirm"
        reason: Why the interrupt is needed
        payload: Additional context for the UI
    """
    value = {
        "interruptId": interrupt_id,
        "question": question,
        "inputType": input_type,
        "reason": reason,
    }
    if options:
        value["options"] = options
    if payload:
        value["payload"] = payload
    
    return emit_custom(name="clarification_request", value=value)


def emit_clarification_response_received(
    interrupt_id: str,
    answer: Any,
) -> AGUIEvent:
    """Emit notification that clarification was received."""
    return emit_custom(
        name="clarification_response",
        value={"interruptId": interrupt_id, "answer": answer},
    )


__all__ = [
    "AGUIEventType",
    "AGUIEvent",
    "emit_run_started",
    "emit_run_finished",
    "emit_run_error",
    "emit_step_started",
    "emit_step_finished",
    "emit_text_message_start",
    "emit_text_message_content",
    "emit_text_message_end",
    "emit_tool_call_start",
    "emit_tool_call_args",
    "emit_tool_call_end",
    "emit_tool_call_result",
    "emit_state_snapshot",
    "emit_state_delta",
    "emit_messages_snapshot",
    "emit_activity_snapshot",
    "emit_activity_delta",
    "emit_raw",
    "emit_custom",
    "emit_clarification_request",
    "emit_clarification_response_received",
]
