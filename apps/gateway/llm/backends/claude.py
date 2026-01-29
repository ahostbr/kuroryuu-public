"""Claude Backend - Anthropic API streaming with native tool support."""

from __future__ import annotations

import json
import os
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional

from .base import LLMBackend, LLMConfig, LLMMessage, LLMToolSchema, StreamEvent


class ClaudeBackend(LLMBackend):
    """Claude backend using Anthropic API."""
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.default_model = (
            model
            or os.environ.get("KURORYUU_CLAUDE_MODEL")
            or "claude-sonnet-4-20250514"
        )
        self._client = None
    
    @property
    def name(self) -> str:
        return "claude"
    
    @property
    def supports_native_tools(self) -> bool:
        # Claude supports native tool calling
        return True
    
    def _get_client(self):
        """Lazy-load Anthropic client."""
        if self._client is None:
            try:
                import anthropic
                if not self.api_key:
                    raise ValueError("ANTHROPIC_API_KEY not set")
                self._client = anthropic.AsyncAnthropic(api_key=self.api_key)
            except ImportError:
                raise ImportError("anthropic package not installed. Run: pip install anthropic")
        return self._client
    
    def _convert_messages(self, messages: List[LLMMessage]) -> tuple[Optional[str], List[Dict[str, Any]]]:
        """Convert messages to Anthropic format.
        
        Returns (system_prompt, messages_list).
        Anthropic requires system as separate parameter, not in messages.
        """
        system_prompt: Optional[str] = None
        converted: List[Dict[str, Any]] = []
        
        for msg in messages:
            if msg.role == "system":
                # Accumulate system messages
                if system_prompt:
                    system_prompt += "\n\n" + msg.content
                else:
                    system_prompt = msg.content
            elif msg.role == "tool":
                # Tool results in Anthropic format
                converted.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": msg.tool_call_id or "unknown",
                        "content": msg.content,
                    }]
                })
            else:
                # User or assistant messages
                converted.append({
                    "role": msg.role,
                    "content": msg.content,
                })
        
        return system_prompt, converted
    
    def _convert_tools(self, tools: List[LLMToolSchema]) -> List[Dict[str, Any]]:
        """Convert tool schemas to Anthropic format."""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.parameters,
            }
            for tool in tools
        ]
    
    async def stream_chat(
        self,
        messages: List[LLMMessage],
        config: LLMConfig,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Stream chat completion from Claude."""
        try:
            client = self._get_client()
        except Exception as e:
            yield StreamEvent(
                type="error",
                error_message=str(e),
                error_code="client_init_error",
            )
            return
        
        system_prompt, claude_messages = self._convert_messages(messages)
        
        # Build request kwargs
        kwargs: Dict[str, Any] = {
            "model": config.model or self.default_model,
            "messages": claude_messages,
            "max_tokens": config.max_tokens or 4096,
        }
        
        if system_prompt:
            kwargs["system"] = system_prompt
        
        # Add tools if provided
        if config.tools:
            kwargs["tools"] = self._convert_tools(config.tools)
        
        # Track tool calls being assembled
        tool_calls: Dict[str, Dict[str, Any]] = {}
        current_tool_id: Optional[str] = None
        current_tool_name: Optional[str] = None
        current_tool_json: str = ""
        
        try:
            async with client.messages.stream(**kwargs) as stream:
                async for event in stream:
                    event_type = getattr(event, 'type', None)
                    
                    if event_type == 'content_block_start':
                        # Check if this is a tool_use block
                        block = getattr(event, 'content_block', None)
                        if block and getattr(block, 'type', None) == 'tool_use':
                            current_tool_id = getattr(block, 'id', f"tool_{uuid.uuid4().hex[:8]}")
                            current_tool_name = getattr(block, 'name', None)
                            current_tool_json = ""
                    
                    elif event_type == 'content_block_delta':
                        delta = getattr(event, 'delta', None)
                        if delta:
                            delta_type = getattr(delta, 'type', None)
                            
                            if delta_type == 'text_delta':
                                # Regular text content
                                text = getattr(delta, 'text', '')
                                if text:
                                    yield StreamEvent(type="delta", text=text)
                            
                            elif delta_type == 'input_json_delta':
                                # Tool argument JSON being streamed
                                partial_json = getattr(delta, 'partial_json', '')
                                if partial_json:
                                    current_tool_json += partial_json
                    
                    elif event_type == 'content_block_stop':
                        # If we were building a tool call, emit it
                        if current_tool_id and current_tool_name:
                            try:
                                args = json.loads(current_tool_json) if current_tool_json else {}
                            except json.JSONDecodeError:
                                args = {"raw": current_tool_json}
                            
                            yield StreamEvent(
                                type="tool_call",
                                tool_name=current_tool_name,
                                tool_arguments=args,
                                tool_id=current_tool_id,
                            )
                            
                            # Reset
                            current_tool_id = None
                            current_tool_name = None
                            current_tool_json = ""
                    
                    elif event_type == 'message_stop':
                        # Get final message for usage stats
                        final_message = await stream.get_final_message()
                        usage = None
                        if hasattr(final_message, 'usage'):
                            u = final_message.usage
                            usage = {
                                "input_tokens": getattr(u, 'input_tokens', 0),
                                "output_tokens": getattr(u, 'output_tokens', 0),
                            }
                        
                        stop_reason = getattr(final_message, 'stop_reason', 'end_turn')
                        yield StreamEvent(
                            type="done",
                            stop_reason=stop_reason,
                            usage=usage,
                        )
                        return
            
            # Fallback done event
            yield StreamEvent(type="done", stop_reason="end_turn")
            
        except Exception as e:
            error_msg = str(e)
            # Don't leak API key in error messages
            if self.api_key and self.api_key in error_msg:
                error_msg = error_msg.replace(self.api_key, "[REDACTED]")
            
            yield StreamEvent(
                type="error",
                error_message=error_msg,
                error_code="api_error",
            )
    
    async def health_check(self) -> Dict[str, Any]:
        """Check if Claude API is accessible."""
        if not self.api_key:
            return {
                "ok": False,
                "backend": self.name,
                "error": "ANTHROPIC_API_KEY not set",
            }
        
        try:
            client = self._get_client()
            # Quick non-streaming call to verify credentials
            # Use a minimal request
            response = await client.messages.create(
                model=self.default_model,
                max_tokens=10,
                messages=[{"role": "user", "content": "Hi"}],
            )
            return {
                "ok": True,
                "backend": self.name,
                "model": self.default_model,
                "api_version": getattr(response, '_api_version', 'unknown'),
            }
        except Exception as e:
            error_msg = str(e)
            if self.api_key and self.api_key in error_msg:
                error_msg = error_msg.replace(self.api_key, "[REDACTED]")
            return {
                "ok": False,
                "backend": self.name,
                "error": error_msg,
            }
