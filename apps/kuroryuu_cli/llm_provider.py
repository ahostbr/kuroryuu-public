"""LLM provider abstraction layer.

Provides a common interface for different LLM backends (LMStudio, Claude, etc.).
Each provider yields AgentEvent objects for consistent REPL handling.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, TYPE_CHECKING

if TYPE_CHECKING:
    from .agent_core import AgentEvent, Message
    from .config import Config


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name for display."""
        ...

    @property
    @abstractmethod
    def supports_native_tools(self) -> bool:
        """Whether this provider supports native tool calling."""
        ...

    @abstractmethod
    async def stream_completion(
        self,
        messages: List["Message"],
        tools: List[Dict[str, Any]],
        config: "Config",
    ) -> AsyncGenerator["AgentEvent", None]:
        """Stream a completion from the LLM.

        Args:
            messages: Conversation history in Message format
            tools: Tool schemas in OpenAI format
            config: Configuration with model settings

        Yields:
            AgentEvent objects:
            - text_delta: Streaming text chunks
            - tool_call: Complete tool call (name, args, id)
            - done: Completion finished (with optional usage stats)
            - error: Error occurred
        """
        ...
        # Make this a generator
        yield  # type: ignore

    async def get_context_window(self) -> int:
        """Get the context window size for this provider.

        Returns:
            Context window size in tokens
        """
        return 32000  # Default fallback


__all__ = ["LLMProvider"]
