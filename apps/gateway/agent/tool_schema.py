"""Tool Schema Normalization - Unified tool call/result shapes.

All tool interactions go through these normalized dataclasses regardless
of which backend (LM Studio, Claude) is being used.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ToolSchema:
    """Normalized tool definition from MCP."""
    name: str
    description: str
    input_schema: Dict[str, Any]
    
    def to_claude_format(self) -> Dict[str, Any]:
        """Convert to Anthropic tool format."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }
    
    def to_openai_format(self) -> Dict[str, Any]:
        """Convert to OpenAI function format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.input_schema,
            },
        }


@dataclass
class ToolCall:
    """Normalized tool call from LLM response.
    
    Shape:
    {
        "id": "string",           # provider tool_call_id or generated uuid
        "name": "string",         # e.g. "k_rag", "k_checkpoint" (routed tools with action param)
        "arguments": { ... },     # parsed json object
        "raw": { ... },           # optional provider raw payload
        "provider": "lmstudio|claude"
    }
    """
    id: str
    name: str
    arguments: Dict[str, Any]
    provider: str = "unknown"
    raw: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for serialization."""
        return {
            "id": self.id,
            "name": self.name,
            "arguments": self.arguments,
            "provider": self.provider,
            "raw": self.raw,
        }


@dataclass
class ToolResult:
    """Normalized tool execution result.
    
    Shape:
    {
        "id": "string",           # matches ToolCall.id
        "name": "string",
        "ok": true|false,
        "content": { ... },       # tool response (parsed or raw)
        "error": { ... }|null
    }
    """
    id: str
    name: str
    ok: bool
    content: Any  # Can be dict, list, or string
    error: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for serialization."""
        return {
            "id": self.id,
            "name": self.name,
            "ok": self.ok,
            "content": self.content,
            "error": self.error,
        }
    
    def to_claude_tool_result(self) -> Dict[str, Any]:
        """Convert to Claude tool_result content block."""
        content_str = self.content if isinstance(self.content, str) else _to_json(self.content)
        
        result: Dict[str, Any] = {
            "type": "tool_result",
            "tool_use_id": self.id,
            "content": content_str,
        }
        
        if not self.ok:
            result["is_error"] = True
        
        return result
    
    def to_openai_tool_message(self) -> Dict[str, Any]:
        """Convert to OpenAI-style tool message."""
        content_str = self.content if isinstance(self.content, str) else _to_json(self.content)
        
        return {
            "role": "tool",
            "tool_call_id": self.id,
            "name": self.name,
            "content": content_str,
        }


@dataclass
class InternalMessage:
    """Normalized internal conversation message.
    
    This is the gateway's internal representation that can be
    converted to any backend's format.
    """
    role: str  # "system", "user", "assistant", "tool"
    content: str
    name: Optional[str] = None  # Tool name for tool messages
    tool_call_id: Optional[str] = None  # For tool results
    tool_calls: List[ToolCall] = field(default_factory=list)  # For assistant messages with tool calls
    
    def to_claude_message(self) -> Dict[str, Any]:
        """Convert to Claude message format."""
        if self.role == "tool":
            # Tool results go in user message as tool_result block
            return {
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": self.tool_call_id or "unknown",
                    "content": self.content,
                }],
            }
        elif self.role == "assistant" and self.tool_calls:
            # Assistant with tool calls - need tool_use blocks
            content: List[Dict[str, Any]] = []
            if self.content:
                content.append({"type": "text", "text": self.content})
            for tc in self.tool_calls:
                content.append({
                    "type": "tool_use",
                    "id": tc.id,
                    "name": tc.name,
                    "input": tc.arguments,
                })
            return {"role": "assistant", "content": content}
        else:
            return {"role": self.role, "content": self.content}
    
    def to_openai_message(self) -> Dict[str, Any]:
        """Convert to OpenAI message format."""
        if self.role == "tool":
            return {
                "role": "tool",
                "tool_call_id": self.tool_call_id or "unknown",
                "name": self.name or "unknown",
                "content": self.content,
            }
        elif self.role == "assistant" and self.tool_calls:
            msg: Dict[str, Any] = {"role": "assistant"}
            if self.content:
                msg["content"] = self.content
            msg["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.name,
                        "arguments": _to_json(tc.arguments),
                    },
                }
                for tc in self.tool_calls
            ]
            return msg
        else:
            return {"role": self.role, "content": self.content}


def _to_json(obj: Any) -> str:
    """Convert object to JSON string, handling errors gracefully."""
    try:
        import json
        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        return str(obj)


def to_claude_messages(messages: List[InternalMessage]) -> tuple[Optional[str], List[Dict[str, Any]]]:
    """Convert internal messages to Claude format.
    
    Returns (system_prompt, messages_list).
    Claude requires system as separate parameter.
    """
    system_parts: List[str] = []
    converted: List[Dict[str, Any]] = []
    
    for msg in messages:
        if msg.role == "system":
            system_parts.append(msg.content)
        else:
            converted.append(msg.to_claude_message())
    
    system_prompt = "\n\n".join(system_parts) if system_parts else None
    return system_prompt, converted


def to_openai_messages(messages: List[InternalMessage]) -> List[Dict[str, Any]]:
    """Convert internal messages to OpenAI format."""
    return [msg.to_openai_message() for msg in messages]


__all__ = [
    "ToolSchema",
    "ToolCall",
    "ToolResult",
    "InternalMessage",
    "to_claude_messages",
    "to_openai_messages",
]
