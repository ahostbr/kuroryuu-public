"""Tool Events - UI stream event helpers for AG-UI protocol.

Emits consistent events to the UI regardless of which backend is used.
Matches the AG-UI protocol from the SOTS vertical slice.

Event Types:
- assistant_delta: Text chunk from LLM
- tool_start: Tool execution beginning
- tool_end: Tool execution finished
- tool_result: Tool result preview (optional)
- assistant_done: Generation complete
- error: Error occurred
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

from .tool_schema import ToolCall, ToolResult

# Config
TOOL_RESULT_PREVIEW_CHARS = int(os.environ.get("KURORYUU_TOOL_RESULT_PREVIEW_CHARS", "1200"))
TOOL_EVENT_VERBOSE = os.environ.get("KURORYUU_TOOL_EVENT_VERBOSE", "0") == "1"


@dataclass
class UIEvent:
    """Unified UI event for SSE streaming."""
    type: str
    data: Dict[str, Any]
    
    def to_sse(self) -> str:
        """Convert to SSE data line."""
        payload = {"type": self.type, **self.data}
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for JSON responses."""
        return {"type": self.type, **self.data}


def emit_delta(text: str) -> UIEvent:
    """Emit assistant text delta."""
    return UIEvent(type="delta", data={"text": text})


def emit_tool_start(tool_call: ToolCall) -> UIEvent:
    """Emit tool execution starting.
    
    UI should show "Calling tool..." indicator.
    """
    data: Dict[str, Any] = {
        "name": tool_call.name,
        "id": tool_call.id,
    }
    
    # Include args preview in verbose mode
    if TOOL_EVENT_VERBOSE:
        args_preview = _truncate_json(tool_call.arguments, 200)
        data["args_preview"] = args_preview
    
    return UIEvent(type="tool_start", data=data)


def emit_tool_end(tool_result: ToolResult) -> UIEvent:
    """Emit tool execution finished.
    
    UI should update tool indicator to success/failure.
    """
    data: Dict[str, Any] = {
        "name": tool_result.name,
        "id": tool_result.id,
        "ok": tool_result.ok,
    }
    
    # Include summary in verbose mode
    if TOOL_EVENT_VERBOSE:
        if tool_result.ok:
            preview = _truncate_content(tool_result.content, TOOL_RESULT_PREVIEW_CHARS)
            data["summary"] = preview
        else:
            data["error"] = tool_result.error or {"message": "Unknown error"}
    
    return UIEvent(type="tool_end", data=data)


def emit_tool_result(tool_result: ToolResult) -> UIEvent:
    """Emit tool result preview (optional verbose event).
    
    Shows truncated tool output in UI.
    """
    preview = _truncate_content(tool_result.content, TOOL_RESULT_PREVIEW_CHARS)
    
    return UIEvent(type="tool_result", data={
        "id": tool_result.id,
        "name": tool_result.name,
        "ok": tool_result.ok,
        "content": preview,
    })


def emit_done(stop_reason: str, usage: Optional[Dict[str, Any]] = None, model: Optional[str] = None) -> UIEvent:
    """Emit generation complete with optional model and usage info."""
    data: Dict[str, Any] = {"stop_reason": stop_reason}
    if usage:
        data["usage"] = usage
    if model:
        data["model"] = model
    return UIEvent(type="done", data=data)


def emit_error(message: str, code: str = "error") -> UIEvent:
    """Emit error event."""
    return UIEvent(type="error", data={
        "message": message,
        "code": code,
    })


def emit_sse_done() -> str:
    """Emit final SSE done marker."""
    return "data: [DONE]\n\n"


def emit_harness_update(action: str, details: str) -> UIEvent:
    """Emit harness update notification.
    
    Actions: progress_appended, status_updated, feature_done
    """
    return UIEvent(type="harness_update", data={
        "action": action,
        "details": details,
    })


def emit_harness_context(feature_id: str, feature_title: str, status: str) -> UIEvent:
    """Emit harness context at session start."""
    return UIEvent(type="harness_context", data={
        "feature_id": feature_id,
        "feature_title": feature_title,
        "status": status,
    })



def emit_clarification_request(
    prompt_id: str,
    question: str,
    options: Optional[List[str]] = None,
    input_type: str = "text",
    reason: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
) -> UIEvent:
    """Emit clarification request for human-in-the-loop.
    
    This event signals the UI to render an interactive prompt
    and wait for user input before continuing.
    """
    data: Dict[str, Any] = {
        "prompt_id": prompt_id,
        "question": question,
        "input_type": input_type,
    }
    if options:
        data["options"] = options
    if reason:
        data["reason"] = reason
    if context:
        data["context"] = context
    
    return UIEvent(type="clarification_request", data=data)
def _truncate_json(obj: Any, max_chars: int) -> str:
    """Truncate JSON object to max characters."""
    try:
        s = json.dumps(obj, ensure_ascii=False)
        if len(s) > max_chars:
            return s[:max_chars - 3] + "..."
        return s
    except Exception:
        return str(obj)[:max_chars]


def _truncate_content(content: Any, max_chars: int) -> str:
    """Truncate content to max characters."""
    if isinstance(content, str):
        s = content
    else:
        try:
            s = json.dumps(content, ensure_ascii=False)
        except Exception:
            s = str(content)
    
    if len(s) > max_chars:
        return s[:max_chars - 3] + "..."
    return s


__all__ = [
    "UIEvent",
    "emit_delta",
    "emit_tool_start",
    "emit_tool_end",
    "emit_tool_result",
    "emit_done",
    "emit_error",
    "emit_harness_update",
    "emit_harness_context",
    "emit_clarification_request",    "emit_sse_done",
    "TOOL_RESULT_PREVIEW_CHARS",
    "TOOL_EVENT_VERBOSE",
]
