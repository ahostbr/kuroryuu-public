"""Agent Package - Tool loop, schemas, and events."""

from .tool_schema import (
    InternalMessage,
    ToolCall,
    ToolResult,
    ToolSchema,
    to_claude_messages,
    to_openai_messages,
)
from .tool_events import (
    UIEvent,
    emit_delta,
    emit_done,
    emit_error,
    emit_tool_end,
    emit_tool_start,
    emit_tool_result,
    emit_harness_update,
    emit_harness_context,
    emit_sse_done,
)
from .tool_loop import (
    ToolLoop,
    ToolExecutor,
    XMLToolParser,
    DEFAULT_MAX_TOOL_CALLS,
    get_worker_tool_limit,
    set_worker_tool_limit,
    clear_worker_tool_limit,
    get_all_worker_configs,
)

__all__ = [
    # Schema
    "InternalMessage",
    "ToolCall",
    "ToolResult",
    "ToolSchema",
    "to_claude_messages",
    "to_openai_messages",
    # Events
    "UIEvent",
    "emit_delta",
    "emit_done",
    "emit_error",
    "emit_tool_end",
    "emit_tool_start",
    "emit_tool_result",
    "emit_harness_update",
    "emit_harness_context",
    "emit_sse_done",
    # Loop
    "ToolLoop",
    "ToolExecutor",
    "XMLToolParser",
    "DEFAULT_MAX_TOOL_CALLS",
    # Worker config (leader-controlled)
    "get_worker_tool_limit",
    "set_worker_tool_limit",
    "clear_worker_tool_limit",
    "get_all_worker_configs",
]
