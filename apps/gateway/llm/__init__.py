"""LLM Layer - Provider-agnostic streaming and tool orchestration.

This module provides the top-level interface for the gateway's LLM interactions.
Includes the agent harness that owns the tool-calling loop.
"""

from .backends import (
    BackendName,
    LLMBackend,
    LLMConfig,
    LLMMessage,
    LLMToolSchema,
    StreamEvent,
    create_backend,
    get_backend,
    get_backend_name,
    get_backends_chain,
    get_circuit_states,
    get_healthy_backend,
    get_last_healthy_backend,
    get_max_tool_calls,
    health_check_all,
    invalidate_health_cache,
    list_backends,
)
from .harness import (
    AgentEvent,
    AgentHarness,
    ToolCall,
    ToolExecutor,
    ToolResult,
    XMLToolParser,
)

__all__ = [
    # Base types
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
    # Fallback chain with circuit breaker
    "get_backends_chain",
    "get_healthy_backend",
    "invalidate_health_cache",
    "get_circuit_states",
    "get_last_healthy_backend",
    # Agent Harness
    "AgentEvent",
    "AgentHarness",
    "ToolCall",
    "ToolExecutor",
    "ToolResult",
    "XMLToolParser",
]
