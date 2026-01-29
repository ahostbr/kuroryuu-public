"""Kuroryuu Hooks System — Claude Code–Compatible Event Model.

Provides a gateway-level hooks system that mirrors Claude Code's event model
(PreToolUse/PostToolUse/etc.) for:
- Enforcing steering rules
- Emitting AG-UI status/tool events
- Persisting harness artifacts (progress + checkpoints)
- Remaining backend-agnostic (Claude SDK + LM Studio)

BUILD_12 additions:
- HookEvent enum with 6 lifecycle events
- HookRegistry for loading/storing hook definitions
- HookExecutor for running hooks with timeout/error handling
- HookContext for building hook payloads
- todo_sot_enforcer builtin hook

Environment:
- KURORYUU_HOOKS_ENABLED: Enable hooks system (default: 1)
- KURORYUU_HOOKS_DIR: Path to hooks config (default: ai/)
- KURORYUU_TODO_STRICT: Strict mode blocks if todo.md missing tasks (default: 0)
"""

from .hooks_types import (
    HookEvent,
    HookAction,
    HookResult,
    HookConfig,
    HookPayload,
)
from .hooks_registry import (
    HooksRegistry,
    get_hooks_registry,
    load_hooks_config,
)
from .hooks_executor import (
    HookExecutor,
    execute_hook,
    execute_hooks_for_event,
)
from .hooks_context import (
    build_hook_payload,
    build_todo_context_block,
)

__all__ = [
    # Types
    "HookEvent",
    "HookAction",
    "HookResult",
    "HookConfig",
    "HookPayload",
    # Registry
    "HooksRegistry",
    "get_hooks_registry",
    "load_hooks_config",
    # Executor
    "HookExecutor",
    "execute_hook",
    "execute_hooks_for_event",
    # Context
    "build_hook_payload",
    "build_todo_context_block",
]
