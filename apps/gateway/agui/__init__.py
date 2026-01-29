"""AG-UI Protocol Implementation for Kuroryuu.

Implements the Agent-User Interaction Protocol (AG-UI) for human-in-the-loop workflows.
Reference: https://docs.ag-ui.com/

Key Features:
- Lifecycle events (RunStarted, RunFinished, RunError)
- Text streaming (TextMessageStart/Content/End)
- Tool call events (ToolCallStart/Args/End/Result)
- State management (StateSnapshot, StateDelta)
- Interrupts (human-in-the-loop pauses)
"""

from .events import (
    AGUIEventType,
    AGUIEvent,
    emit_run_started,
    emit_run_finished,
    emit_run_error,
    emit_step_started,
    emit_step_finished,
    emit_text_message_start,
    emit_text_message_content,
    emit_text_message_end,
    emit_tool_call_start,
    emit_tool_call_args,
    emit_tool_call_end,
    emit_tool_call_result,
    emit_state_snapshot,
    emit_state_delta,
    emit_custom,
    emit_clarification_request,
)

from .interrupts import (
    InterruptReason,
    InterruptPayload,
    InterruptRequest,
    ResumePayload,
    PendingInterrupt,
    InterruptStore,
    get_interrupt_store,
)

__all__ = [
    # Events
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
    "emit_custom",
    "emit_clarification_request",
    # Interrupts
    "InterruptReason",
    "InterruptPayload",
    "InterruptRequest",
    "ResumePayload",
    "PendingInterrupt",
    "InterruptStore",
    "get_interrupt_store",
]
