"""Tool Loop - Provider-agnostic tool-calling loop driver.

This module implements the unified tool loop that works identically
for LM Studio and Claude backends.

Flow:
1. Call backend.stream(messages, tools, system_prompt) → yields events
2. Stream delta events to UI immediately
3. If tool_call event: execute via MCP, inject result, continue loop
4. Stop when done or max_tool_calls exceeded

The gateway owns this loop - backends only stream.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any, AsyncGenerator, Callable, Coroutine, Dict, List, Optional

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
    emit_clarification_request,
)
# Config
# Default: 0 = unlimited. Leaders can set limits on workers via /v1/leader/worker-config
DEFAULT_MAX_TOOL_CALLS = int(os.environ.get("KURORYUU_MAX_TOOL_CALLS", "0"))
if DEFAULT_MAX_TOOL_CALLS > 0:
    DEFAULT_MAX_TOOL_CALLS = max(1, min(50, DEFAULT_MAX_TOOL_CALLS))  # Clamp 1..50 if set
MAX_CONSECUTIVE_FAILURES = 3

# Per-worker config set by leader (worker_id -> config dict)
# Structure: { worker_id: { "max_tool_calls": int, "set_by": str, "timestamp": str } }
_worker_configs: Dict[str, Dict[str, Any]] = {}


def get_worker_tool_limit(worker_id: Optional[str] = None) -> int:
    """Get tool limit for a worker. 0 = unlimited.
    
    Priority:
    1. Worker-specific config set by leader
    2. Environment default (KURORYUU_MAX_TOOL_CALLS)
    3. 0 (unlimited)
    """
    if worker_id and worker_id in _worker_configs:
        return _worker_configs[worker_id].get("max_tool_calls", 0)
    return DEFAULT_MAX_TOOL_CALLS


def set_worker_tool_limit(worker_id: str, max_calls: int, set_by: str = "leader") -> Dict[str, Any]:
    """Leader sets tool limit for a worker. 0 = unlimited."""
    from datetime import datetime
    if max_calls > 0:
        max_calls = max(1, min(50, max_calls))  # Clamp 1..50 if set
    _worker_configs[worker_id] = {
        "max_tool_calls": max_calls,
        "set_by": set_by,
        "timestamp": datetime.now().isoformat(),
    }
    return _worker_configs[worker_id]


def clear_worker_tool_limit(worker_id: str) -> bool:
    """Clear worker-specific config, reverting to default."""
    if worker_id in _worker_configs:
        del _worker_configs[worker_id]
        return True
    return False


def get_all_worker_configs() -> Dict[str, Dict[str, Any]]:
    """Get all worker configs (for admin/debug)."""
    return dict(_worker_configs)


# Type alias for tool executor
ToolExecutor = Callable[[str, Dict[str, Any]], Coroutine[Any, Any, ToolResult]]


class XMLToolParser:
    """Parse XML tool calls from LLM responses (for LM Studio).
    
    Expected format:
    <tool_call>
    <name>tool_name</name>
    <arguments>{"key": "value"}</arguments>
    </tool_call>
    
    Also handles alternate format from some models:
    <tool_call>
    [TOOL_CALLS]tool_name[ARGS]{"key": "value"}
    </tool_call>
    """
    
    # Standard XML format
    TOOL_CALL_PATTERN = re.compile(
        r"<tool_call>\s*<name>([^<]+)</name>\s*<arguments>(.*?)</arguments>\s*</tool_call>",
        re.DOTALL | re.IGNORECASE,
    )
    
    # Alternative format: [TOOL_CALLS]name[ARGS]json or [TOOL_CALLS]name>json</tool_call>
    ALT_TOOL_PATTERN = re.compile(
        r"<tool_call>\s*\[TOOL_CALLS\](\w+)(?:\[ARGS\]|>)\s*(\{[^}]*\})",
        re.DOTALL | re.IGNORECASE,
    )
    
    @classmethod
    def extract_tool_calls(cls, text: str, provider: str = "lmstudio") -> tuple[str, List[ToolCall]]:
        """Extract tool calls from text, return (clean_text, tool_calls)."""
        tool_calls: List[ToolCall] = []
        
        def replace_match(m: re.Match) -> str:
            name = m.group(1).strip()
            args_raw = m.group(2).strip()
            
            try:
                args = json.loads(args_raw) if args_raw else {}
            except json.JSONDecodeError:
                args = {"raw": args_raw}
            
            tool_calls.append(ToolCall(
                id=f"xml_{uuid.uuid4().hex[:8]}",
                name=name,
                arguments=args,
                provider=provider,
                raw={"xml": m.group(0)},
            ))
            return ""
        
        # Try standard format first
        clean_text = cls.TOOL_CALL_PATTERN.sub(replace_match, text)
        
        # Try alternative format if no matches found
        if not tool_calls:
            clean_text = cls.ALT_TOOL_PATTERN.sub(replace_match, text)
        
        return clean_text.strip(), tool_calls
    
    @classmethod
    def has_partial_tool_call(cls, text: str) -> bool:
        """Check if text has an unclosed tool_call tag."""
        open_count = text.lower().count("<tool_call>")
        close_count = text.lower().count("</tool_call>")
        return open_count > close_count


class ToolLoop:
    """Provider-agnostic tool-calling loop.
    
    This is the main orchestrator that:
    1. Manages the conversation state
    2. Calls the LLM backend (stream)
    3. Intercepts tool calls
    4. Executes tools via MCP
    5. Injects results back
    6. Continues until done
    """
    
    def __init__(
        self,
        backend: Any,  # LLMBackend from llm/backends
        tool_executor: ToolExecutor,
        tools: List[ToolSchema],
        max_tool_calls: Optional[int] = None,
        worker_id: Optional[str] = None,
        model: Optional[str] = None,  # Model override (uses backend default if not set)
        extra: Optional[Dict[str, Any]] = None,  # Extra params for backend (e.g., conversation_id)
    ):
        self.backend = backend
        self.tool_executor = tool_executor
        self.tools = tools
        self.worker_id = worker_id
        self.model = model  # Model to use (or None for backend default)
        self.extra = extra or {}  # Extra params passed to LLMConfig
        # Get limit: explicit param > worker config > default
        if max_tool_calls is not None:
            self.max_tool_calls = max_tool_calls
        else:
            self.max_tool_calls = get_worker_tool_limit(worker_id)
    
    async def run(
        self,
        messages: List[InternalMessage],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> AsyncGenerator[UIEvent, None]:
        """Run the tool loop.
        
        Yields UIEvents for SSE streaming to the UI.
        """
        tool_call_count = 0
        consecutive_failures = 0
        
        while True:
            # Build backend request based on provider
            backend_messages, system_prompt = self._prepare_messages(messages)
            
            # Collect response from LLM
            accumulated_text = ""
            native_tool_calls: List[ToolCall] = []
            stop_reason: Optional[str] = None
            usage: Optional[Dict[str, Any]] = None
            had_error = False
            
            try:
                async for event in self._stream_backend(
                    backend_messages,
                    system_prompt,
                    temperature,
                    max_tokens,
                ):
                    if event.get("type") == "delta":
                        text = event.get("text", "")
                        if text:
                            accumulated_text += text
                            # Buffer if potentially building XML tool call
                            if self.backend.supports_native_tools or not XMLToolParser.has_partial_tool_call(accumulated_text):
                                yield emit_delta(text)
                    
                    elif event.get("type") == "tool_call":
                        native_tool_calls.append(ToolCall(
                            id=event.get("id", f"native_{uuid.uuid4().hex[:8]}"),
                            name=event.get("name", "unknown"),
                            arguments=event.get("arguments", {}),
                            provider=self.backend.name,
                            raw=event.get("raw"),
                        ))
                    
                    elif event.get("type") == "done":
                        stop_reason = event.get("stop_reason")
                        usage = event.get("usage")
                    
                    elif event.get("type") == "error":
                        had_error = True
                        yield emit_error(
                            event.get("message", "Unknown error"),
                            event.get("code", "backend_error"),
                        )
                        break
            
            except Exception as e:
                had_error = True
                yield emit_error(str(e), "stream_error")
            
            if had_error:
                consecutive_failures += 1
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    yield emit_done("max_failures", usage, model=self.model)
                    return
                continue
            
            consecutive_failures = 0
            
            # Parse XML tool calls if backend doesn't support native
            xml_tool_calls: List[ToolCall] = []
            clean_text = accumulated_text
            
            if not self.backend.supports_native_tools and accumulated_text:
                clean_text, xml_tool_calls = XMLToolParser.extract_tool_calls(
                    accumulated_text, 
                    provider=self.backend.name,
                )
                
                # Yield any remaining clean text
                if xml_tool_calls and clean_text and clean_text != accumulated_text:
                    # Text was already streamed character by character
                    pass
            
            # Merge tool calls
            all_tool_calls = native_tool_calls + xml_tool_calls
            
            # If no tool calls, we're done
            if not all_tool_calls:
                if clean_text:
                    messages.append(InternalMessage(
                        role="assistant",
                        content=clean_text,
                    ))
                
                yield emit_done(stop_reason or "end_turn", usage, model=self.model)
                return

            # Check tool call limit (0 = unlimited)
            tool_call_count += len(all_tool_calls)
            if self.max_tool_calls > 0 and tool_call_count > self.max_tool_calls:
                yield emit_error(
                    f"Tool call limit exceeded ({self.max_tool_calls})",
                    "tool_limit_exceeded",
                )
                
                # Add message explaining limit
                messages.append(InternalMessage(
                    role="assistant",
                    content=f"I've reached the maximum number of tool calls ({self.max_tool_calls}). Please let me summarize what I found so far.",
                ))
                
                yield emit_done("tool_limit", usage, model=self.model)
                return

            # Add assistant message with tool calls
            messages.append(InternalMessage(
                role="assistant",
                content=clean_text,
                tool_calls=all_tool_calls,
            ))
            
            # Execute each tool call
            for tc in all_tool_calls:
                yield emit_tool_start(tc)
                
                result = await self.tool_executor(tc.name, tc.arguments)
                # Ensure result has correct id
                result.id = tc.id
                result.name = tc.name
                
                yield emit_tool_end(result)
                
                # Check for pending clarification request (human-in-the-loop)
                if result.ok and isinstance(result.content, dict):
                    content_dict = result.content
                    if content_dict.get("pending") is True:
                        # Emit clarification request and pause
                        yield emit_clarification_request(
                            prompt_id=content_dict.get("prompt_id", tc.id),
                            question=content_dict.get("question", "Clarification needed"),
                            options=content_dict.get("options"),
                            input_type=content_dict.get("input_type", "text"),
                            reason=content_dict.get("reason"),
                            context=content_dict.get("context"),
                        )
                        # Return with interrupt stop reason - UI will resume later
                        yield emit_done("interrupt", None, model=self.model)
                        return                
                # Add tool result to messages
                content = result.content if isinstance(result.content, str) else json.dumps(result.content)
                messages.append(InternalMessage(
                    role="tool",
                    content=content,
                    name=tc.name,
                    tool_call_id=tc.id,
                ))
            
            # Continue loop
    
    def _prepare_messages(
        self,
        messages: List[InternalMessage],
    ) -> tuple[List[Dict[str, Any]], Optional[str]]:
        """Convert internal messages to backend format."""
        if self.backend.name == "claude":
            system, msgs = to_claude_messages(messages)
            return msgs, system
        else:
            # OpenAI format (LM Studio)
            return to_openai_messages(messages), None
    
    async def _stream_backend(
        self,
        messages: List[Dict[str, Any]],
        system_prompt: Optional[str],
        temperature: float,
        max_tokens: Optional[int],
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream from backend, yielding normalized events."""
        from ..llm.backends import LLMConfig, LLMMessage, LLMToolSchema
        
        # Convert to LLMMessage format
        llm_messages = []
        if system_prompt:
            llm_messages.append(LLMMessage(role="system", content=system_prompt))
        
        for msg in messages:
            if isinstance(msg, dict):
                llm_messages.append(LLMMessage(
                    role=msg.get("role", "user"),
                    content=msg.get("content", ""),
                    name=msg.get("name"),
                    tool_call_id=msg.get("tool_call_id"),
                    tool_calls=msg.get("tool_calls"),
                ))
        
        # Convert tools
        llm_tools = [
            LLMToolSchema(
                name=t.name,
                description=t.description,
                parameters=t.input_schema,
            )
            for t in self.tools
        ]
        
        config = LLMConfig(
            model=self.model or "",  # Use explicit model or backend default
            temperature=temperature,
            max_tokens=max_tokens,
            tools=llm_tools,
            extra=self.extra,  # Pass through extra params (e.g., conversation_id for PTY backend)
        )
        
        async for event in self.backend.stream_chat(llm_messages, config):
            yield {
                "type": event.type,
                "text": event.text,
                "name": event.tool_name,
                "id": event.tool_id,
                "arguments": event.tool_arguments,
                "stop_reason": event.stop_reason,
                "usage": event.usage,
                "message": event.error_message,
                "code": event.error_code,
            }


__all__ = [
    "ToolLoop",
    "ToolExecutor",
    "XMLToolParser",
    "MAX_TOOL_CALLS",
]
