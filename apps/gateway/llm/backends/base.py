"""LLM Backend Interface - Provider-agnostic streaming abstraction.

All backends yield normalized events:
- {"type": "delta", "text": "..."}
- {"type": "tool_call", "name": "...", "arguments": {...}, "id": "..."}
- {"type": "done", "stop_reason": "...", "usage": {...}}
- {"type": "error", "message": "...", "code": "..."}
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Dict, List, Optional


@dataclass
class LLMMessage:
    """Normalized message format for all backends."""
    role: str  # "system", "user", "assistant", "tool"
    content: str
    name: Optional[str] = None  # For tool messages
    tool_call_id: Optional[str] = None  # For tool results
    tool_calls: Optional[List[Dict[str, Any]]] = None  # For assistant messages with tool calls


@dataclass
class LLMToolSchema:
    """Tool definition for backends that support native tool calling."""
    name: str
    description: str
    parameters: Dict[str, Any]  # JSON Schema


@dataclass
class StreamEvent:
    """Normalized streaming event."""
    type: str  # "delta", "tool_call", "done", "error"
    text: Optional[str] = None
    tool_name: Optional[str] = None
    tool_arguments: Optional[Dict[str, Any]] = None
    tool_id: Optional[str] = None
    stop_reason: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    error_code: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict, omitting None values."""
        d: Dict[str, Any] = {"type": self.type}
        if self.text is not None:
            d["text"] = self.text
        if self.tool_name is not None:
            d["name"] = self.tool_name
        if self.tool_arguments is not None:
            d["arguments"] = self.tool_arguments
        if self.tool_id is not None:
            d["id"] = self.tool_id
        if self.stop_reason is not None:
            d["stop_reason"] = self.stop_reason
        if self.usage is not None:
            d["usage"] = self.usage
        if self.error_message is not None:
            d["message"] = self.error_message
        if self.error_code is not None:
            d["code"] = self.error_code
        return d


@dataclass
class LLMConfig:
    """Backend configuration."""
    model: str
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    tools: List[LLMToolSchema] = field(default_factory=list)
    response_format: Optional[Dict[str, Any]] = None  # JSON Schema for structured output
    # Backend-specific options
    extra: Dict[str, Any] = field(default_factory=dict)


class LLMBackend(ABC):
    """Abstract base class for LLM backends."""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Backend identifier (e.g., 'lmstudio', 'claude')."""
        ...
    
    @property
    @abstractmethod
    def supports_native_tools(self) -> bool:
        """Whether backend supports native tool calling (vs XML parsing)."""
        ...
    
    @abstractmethod
    async def stream_chat(
        self,
        messages: List[LLMMessage],
        config: LLMConfig,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Stream chat completion.
        
        Yields StreamEvent objects:
        - delta: text content chunk
        - tool_call: native tool call (if supports_native_tools)
        - done: completion finished
        - error: error occurred
        """
        ...
    
    async def health_check(self) -> Dict[str, Any]:
        """Check backend health/availability."""
        return {"ok": True, "backend": self.name}
