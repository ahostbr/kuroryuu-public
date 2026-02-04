"""Agent Harness - Tool-calling loop that remains provider-agnostic.

The gateway owns the tool-call loop, not the backend.
This module implements the agentic pattern from SOTS_AssistantChatAction.

Flow:
1. User message → LLM
2. If LLM returns tool_call → execute tool → inject result → goto 2
3. If LLM returns text → yield to user
4. Continue until done or max_tool_calls reached

The harness supports both:
- Native tool calling (Claude, GPT-4) - via StreamEvent.tool_call
- XML tool calling (LM Studio) - via XML parsing in response text
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Callable, Coroutine, Dict, List, Optional

from .backends import (
    LLMBackend,
    LLMConfig,
    LLMMessage,
    LLMToolSchema,
    StreamEvent,
    get_backend,
    get_max_tool_calls,
)

# Import XMLToolParser from the canonical location (agent.tool_loop)
# to avoid duplication - only used for legacy XML-based tool calling
from ..agent.tool_loop import XMLToolParser


@dataclass
class ToolCall:
    """Parsed tool call from LLM response."""
    id: str
    name: str
    arguments: Dict[str, Any]


@dataclass
class ToolResult:
    """Result from tool execution."""
    tool_call_id: str
    content: str
    is_error: bool = False


@dataclass
class AgentEvent:
    """Event emitted by the agent harness.

    Types:
    - "text_delta": Text being streamed (data: str)
    - "tool_start": Tool execution starting (data: ToolCall)
    - "tool_end": Tool execution finished (data: ToolResult)
    - "done": Agent finished (data: {"stop_reason": str, "usage": dict})
    - "error": Error occurred (data: {"message": str, "code": str})
    """
    type: str
    data: Any


# Type alias for tool executor function
ToolExecutor = Callable[[str, Dict[str, Any]], Coroutine[Any, Any, str]]


class AgentHarness:
    """Provider-agnostic agent harness that manages the tool-calling loop.
    
    The harness:
    1. Streams from the LLM backend
    2. Intercepts tool calls (native or XML)
    3. Executes tools via the provided executor
    4. Injects results back into the conversation
    5. Continues until done or max iterations
    """
    
    def __init__(
        self,
        backend: Optional[LLMBackend] = None,
        tool_executor: Optional[ToolExecutor] = None,
        max_tool_calls: Optional[int] = None,
    ):
        """Initialize the harness.
        
        Args:
            backend: LLM backend to use. Defaults to get_backend().
            tool_executor: Async function(name, args) -> result_str.
                          If None, tool calls will error.
            max_tool_calls: Max tool calls per run. Defaults to env config.
        """
        self.backend = backend or get_backend()
        self.tool_executor = tool_executor
        self.max_tool_calls = max_tool_calls or get_max_tool_calls()
    
    async def run(
        self,
        messages: List[LLMMessage],
        config: LLMConfig,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Run the agent loop.
        
        Yields AgentEvents as the conversation progresses.
        Modifies messages in-place as tool results are added.
        """
        tool_call_count = 0
        consecutive_failures = 0
        MAX_CONSECUTIVE_FAILURES = 3
        
        while True:
            # Collect response from LLM
            accumulated_text = ""
            native_tool_calls: List[ToolCall] = []
            stop_reason: Optional[str] = None
            usage: Optional[Dict[str, Any]] = None
            had_error = False
            
            async for event in self.backend.stream_chat(messages, config):
                if event.type == "delta":
                    # Stream text to caller
                    if event.text:
                        accumulated_text += event.text
                        # Only yield if not building XML tool call
                        if self.backend.supports_native_tools or not XMLToolParser.has_partial_tool_call(accumulated_text):
                            yield AgentEvent(type="text_delta", data=event.text)
                
                elif event.type == "tool_call":
                    # Native tool call from backend
                    native_tool_calls.append(ToolCall(
                        id=event.tool_id or f"native_{uuid.uuid4().hex[:8]}",
                        name=event.tool_name or "unknown",
                        arguments=event.tool_arguments or {},
                    ))
                
                elif event.type == "done":
                    stop_reason = event.stop_reason
                    usage = event.usage
                
                elif event.type == "error":
                    had_error = True
                    yield AgentEvent(type="error", data={
                        "message": event.error_message,
                        "code": event.error_code,
                    })
                    break
            
            if had_error:
                consecutive_failures += 1
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    yield AgentEvent(type="done", data={
                        "stop_reason": "max_failures",
                        "usage": usage,
                    })
                    return
                continue
            
            # Reset failure counter on successful response
            consecutive_failures = 0
            
            # Parse XML tool calls if backend doesn't support native
            xml_tool_calls: List[ToolCall] = []
            if not self.backend.supports_native_tools and accumulated_text:
                clean_text, xml_tool_calls = XMLToolParser.extract_tool_calls(accumulated_text)
                
                # If we extracted tool calls, yield the clean text
                if xml_tool_calls and clean_text:
                    yield AgentEvent(type="text_delta", data=clean_text)
            
            # Merge tool calls
            all_tool_calls = native_tool_calls + xml_tool_calls
            
            # If no tool calls, we're done
            if not all_tool_calls:
                # Add assistant message to history
                if accumulated_text:
                    messages.append(LLMMessage(role="assistant", content=accumulated_text))
                
                yield AgentEvent(type="done", data={
                    "stop_reason": stop_reason or "end_turn",
                    "usage": usage,
                })
                return
            
            # Check tool call limit
            tool_call_count += len(all_tool_calls)
            if tool_call_count > self.max_tool_calls:
                yield AgentEvent(type="error", data={
                    "message": f"Tool call limit exceeded ({self.max_tool_calls})",
                    "code": "tool_limit_exceeded",
                })
                yield AgentEvent(type="done", data={
                    "stop_reason": "tool_limit",
                    "usage": usage,
                })
                return
            
            # Add assistant message with tool calls to history
            # For native tools, the content might be empty
            assistant_content = accumulated_text
            if not self.backend.supports_native_tools:
                # For XML, include the original text with tool calls
                assistant_content = accumulated_text
            
            messages.append(LLMMessage(role="assistant", content=assistant_content))
            
            # Execute each tool call
            for tc in all_tool_calls:
                # DEBUG: Log tool call details
                import logging
                logging.info(f"[Harness] Yielding tool_start: name={tc.name} id={tc.id} args={tc.arguments}")
                yield AgentEvent(type="tool_start", data=tc)
                
                result = await self._execute_tool(tc)
                
                yield AgentEvent(type="tool_end", data=result)
                
                # Add tool result to messages
                messages.append(LLMMessage(
                    role="tool",
                    content=result.content,
                    tool_call_id=result.tool_call_id,
                    name=tc.name,
                ))
            
            # Continue loop for next LLM response
    
    async def _execute_tool(self, tool_call: ToolCall) -> ToolResult:
        """Execute a single tool call."""
        if self.tool_executor is None:
            return ToolResult(
                tool_call_id=tool_call.id,
                content=f"Error: No tool executor configured for {tool_call.name}",
                is_error=True,
            )
        
        try:
            result = await self.tool_executor(tool_call.name, tool_call.arguments)
            return ToolResult(
                tool_call_id=tool_call.id,
                content=result,
                is_error=False,
            )
        except Exception as e:
            return ToolResult(
                tool_call_id=tool_call.id,
                content=f"Tool execution error: {str(e)}",
                is_error=True,
            )


__all__ = [
    "ToolCall",
    "ToolResult",
    "AgentEvent",
    "ToolExecutor",
    "XMLToolParser",
    "AgentHarness",
]
