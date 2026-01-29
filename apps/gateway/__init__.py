"""Gateway Package - AG-UI compliant agent gateway.

Connects:
- LLM backends (Claude, LM Studio) 
- MCP_CORE tools (RAG, Inbox, Checkpoints)
- Agent harness (tool-calling loop)
"""

from .llm import (
    # Backend types
    LLMBackend,
    LLMConfig,
    LLMMessage,
    LLMToolSchema,
    StreamEvent,
    # Registry
    BackendName,
    create_backend,
    get_backend,
    get_backend_name,
    get_max_tool_calls,
    health_check_all,
    list_backends,
    # Harness
    AgentEvent,
    AgentHarness,
    ToolCall,
    ToolExecutor,
    ToolResult,
    XMLToolParser,
)

__all__ = [
    # Backend types
    "LLMBackend",
    "LLMConfig",
    "LLMMessage",
    "LLMToolSchema",
    "StreamEvent",
    # Registry
    "BackendName",
    "create_backend",
    "get_backend",
    "get_backend_name",
    "get_max_tool_calls",
    "health_check_all",
    "list_backends",
    # Harness
    "AgentEvent",
    "AgentHarness",
    "ToolCall",
    "ToolExecutor",
    "ToolResult",
    "XMLToolParser",
]
