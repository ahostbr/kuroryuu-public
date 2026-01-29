"""LLM Backends - Provider-agnostic streaming abstractions.

Usage:
    from apps.gateway.llm.backends import get_backend, LLMMessage, LLMConfig

    backend = get_backend()  # Uses KURORYUU_LLM_BACKEND env var

    # Or use fallback chain with circuit breaker:
    backend = await get_healthy_backend()  # First healthy from chain

    messages = [
        LLMMessage(role="system", content="You are helpful."),
        LLMMessage(role="user", content="Hello!"),
    ]

    async for event in backend.stream_chat(messages, LLMConfig(model="...")):
        if event.type == "delta":
            print(event.text, end="", flush=True)
        elif event.type == "tool_call":
            # Handle tool call
            pass
        elif event.type == "done":
            print(f"\\nDone: {event.stop_reason}")
        elif event.type == "error":
            print(f"Error: {event.error_message}")

Environment Variables:
    KURORYUU_LLM_BACKEND: "claude" | "lmstudio" | "cliproxyapi" (default: "lmstudio")
    KURORYUU_LLM_BACKENDS: Fallback chain (default: "lmstudio,cliproxyapi")
    KURORYUU_MAX_TOOL_CALLS: int 1..50 (default: 25, 0=unlimited)

    Claude:
        ANTHROPIC_API_KEY: Required
        KURORYUU_CLAUDE_MODEL: Model name (default: claude-sonnet-4-20250514)

    LM Studio:
        KURORYUU_LMSTUDIO_BASE_URL: API base (default: http://127.0.0.1:1234/v1)
        KURORYUU_LMSTUDIO_MODEL: Model name (default: mistralai/devstral-small-2-2512)

    CLIProxyAPI (Claude Code CLI wrapper):
        KURORYUU_CLIPROXYAPI_URL: API base (default: http://127.0.0.1:8317/v1)
        KURORYUU_CLIPROXYAPI_MODEL: Model name (default: claude-sonnet-4-20250514)
"""

from .base import (
    LLMBackend,
    LLMConfig,
    LLMMessage,
    LLMToolSchema,
    StreamEvent,
)
from .registry import (
    BackendName,
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
]
