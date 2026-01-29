"""Backend Registry - Provider selection and environment-based configuration.

Environment Variables:
- KURORYUU_LLM_BACKEND: "claude" | "lmstudio" | "cliproxyapi" (default: "lmstudio")
- KURORYUU_LLM_BACKENDS: Fallback chain (default: "lmstudio,cliproxyapi")
- KURORYUU_MAX_TOOL_CALLS: int (default: 25, clamped 1..50, 0=unlimited)

Claude-specific:
- ANTHROPIC_API_KEY: Required for claude backend
- KURORYUU_CLAUDE_MODEL: Model name (default: claude-sonnet-4-20250514)

LM Studio-specific (Agent/Tools - Devstral):
- KURORYUU_LMSTUDIO_BASE_URL: API base URL (default: http://127.0.0.1:1234/v1)
- KURORYUU_LMSTUDIO_MODEL: Model name (default: mistralai/devstral-small-2-2512)

CLIProxyAPI-specific (Claude Code CLI wrapper):
- KURORYUU_CLIPROXYAPI_URL: API base URL (default: http://127.0.0.1:8317/v1)
- KURORYUU_CLIPROXYAPI_MODEL: Model name (default: claude-sonnet-4-20250514)

Chat-specific (Kuroryuu - Gemma):
- KURORYUU_CHAT_BASE_URL: Chat model API base (default: http://127.0.0.1:1234/v1)
- KURORYUU_CHAT_MODEL: Chat model name (default: gemma-3-4b-it)

Circuit Breaker (optional tuning):
- KURORYUU_FALLBACK_THRESHOLD: Failures before circuit opens (default: 3)
- KURORYUU_FALLBACK_COOLDOWN: Seconds before retry (default: 60)
- KURORYUU_HEALTH_CACHE_TTL: Seconds to cache health (default: 30)
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Dict, Literal, Optional, Type

from .base import LLMBackend, LLMConfig, LLMToolSchema
from .claude import ClaudeBackend
from .claude_cli import ClaudeCliBackend
from .claude_cli_pty import ClaudeCliPTYBackend
from .cliproxyapi import CLIProxyAPIBackend
from .lmstudio import LMStudioBackend

logger = logging.getLogger("kuroryuu.gateway.registry")

BackendName = Literal["claude", "lmstudio", "cliproxyapi", "claude-cli", "claude-cli-pty"]

_BACKENDS: Dict[str, Type[LLMBackend]] = {
    "claude": ClaudeBackend,
    "claude-cli": ClaudeCliBackend,
    "claude-cli-pty": ClaudeCliPTYBackend,
    "lmstudio": LMStudioBackend,
    "cliproxyapi": CLIProxyAPIBackend,
}

# ═══════════════════════════════════════════════════════════════════════════════
# Circuit Breaker Pattern for Intelligent Fallback
# ═══════════════════════════════════════════════════════════════════════════════

# Configurable thresholds from environment
FAILURE_THRESHOLD = int(os.environ.get("KURORYUU_FALLBACK_THRESHOLD", "3"))
COOLDOWN_SECONDS = float(os.environ.get("KURORYUU_FALLBACK_COOLDOWN", "60.0"))
HEALTH_CACHE_TTL = float(os.environ.get("KURORYUU_HEALTH_CACHE_TTL", "30.0"))


@dataclass
class BackendState:
    """Tracks backend health state for circuit breaker pattern."""
    consecutive_failures: int = 0
    last_failure_time: Optional[float] = None
    circuit_open: bool = False


# Global state tracking
_backend_states: Dict[str, BackendState] = {}
_health_cache: Dict[str, tuple[dict, float]] = {}
_last_healthy_backend: Optional[str] = None


def get_backend_name() -> BackendName:
    """Get configured backend name from environment."""
    raw = os.environ.get("KURORYUU_LLM_BACKEND", "lmstudio").lower().strip()
    if raw not in _BACKENDS:
        # Fallback to lmstudio if invalid
        return "lmstudio"
    return raw  # type: ignore


def get_max_tool_calls() -> int:
    """Get max tool calls per request, clamped 1..50 (0=unlimited)."""
    raw = os.environ.get("KURORYUU_MAX_TOOL_CALLS", "25")
    try:
        val = int(raw)
    except ValueError:
        val = 25
    if val == 0:
        return 0  # Unlimited
    return max(1, min(50, val))


# Cache backends per name (not just one)
_backend_cache: dict[BackendName, LLMBackend] = {}


def get_backend(name: Optional[BackendName] = None) -> LLMBackend:
    """Get or create backend instance.
    
    Uses environment config if name not specified.
    Result is cached per backend name.
    
    Args:
        name: Backend name override. If None, uses KURORYUU_LLM_BACKEND env var.
        
    Returns:
        Configured backend instance.
        
    Raises:
        ValueError: If backend name is invalid.
    """
    if name is None:
        name = get_backend_name()
    
    # Check cache first
    if name in _backend_cache:
        return _backend_cache[name]
    
    backend_cls = _BACKENDS.get(name)
    if backend_cls is None:
        raise ValueError(f"Unknown backend: {name}. Available: {list(_BACKENDS.keys())}")
    
    backend = backend_cls()
    _backend_cache[name] = backend
    return backend


def create_backend(name: BackendName, **kwargs) -> LLMBackend:
    """Create a new backend instance with custom config.
    
    Unlike get_backend(), this always creates a new instance.
    
    Args:
        name: Backend name.
        **kwargs: Backend-specific constructor arguments.
        
    Returns:
        New backend instance.
    """
    backend_cls = _BACKENDS.get(name)
    if backend_cls is None:
        raise ValueError(f"Unknown backend: {name}. Available: {list(_BACKENDS.keys())}")
    
    return backend_cls(**kwargs)


def list_backends() -> Dict[str, Dict[str, bool]]:
    """List available backends with capability flags.
    
    Returns:
        Dict mapping backend name to capability dict.
    """
    result = {}
    for name, cls in _BACKENDS.items():
        # Instantiate briefly to get properties
        try:
            instance = cls()
            result[name] = {
                "supports_native_tools": instance.supports_native_tools,
            }
        except Exception:
            result[name] = {
                "supports_native_tools": False,
            }
    return result


async def health_check_all() -> Dict[str, Dict]:
    """Run health checks on all backends.

    Returns:
        Dict mapping backend name to health check result.
    """
    results = {}
    for name, cls in _BACKENDS.items():
        try:
            instance = cls()
            results[name] = await instance.health_check()
        except Exception as e:
            results[name] = {
                "ok": False,
                "backend": name,
                "error": str(e),
            }
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# Fallback Chain with Circuit Breaker
# ═══════════════════════════════════════════════════════════════════════════════

def get_backends_chain() -> list[str]:
    """Get the fallback chain of backends from environment.

    Returns list of backend names in priority order.
    """
    raw = os.environ.get("KURORYUU_LLM_BACKENDS", "lmstudio,cliproxyapi")
    return [name.strip().lower() for name in raw.split(",") if name.strip()]


async def get_healthy_backend() -> LLMBackend:
    """Get first healthy backend from priority chain with circuit breaker.

    Implements circuit breaker pattern:
    - Tracks consecutive failures per backend
    - Opens circuit after FAILURE_THRESHOLD failures
    - Circuit stays open for COOLDOWN_SECONDS
    - Caches health check results for HEALTH_CACHE_TTL

    Returns:
        First healthy backend from the chain.

    Raises:
        RuntimeError: If no healthy backends are available.
    """
    global _last_healthy_backend

    backends = get_backends_chain()
    now = time.time()
    errors = []

    for name in backends:
        if name not in _BACKENDS:
            logger.warning(f"Unknown backend in chain: {name}")
            continue

        state = _backend_states.get(name, BackendState())

        # Skip if circuit is open and cooldown hasn't expired
        if state.circuit_open:
            if now - (state.last_failure_time or 0) < COOLDOWN_SECONDS:
                logger.debug(f"Backend {name}: circuit open, skipping")
                continue
            # Cooldown expired - half-open state, try again
            logger.info(f"Backend {name}: cooldown expired, retrying (half-open)")

        # Check cached health first
        if name in _health_cache:
            cached_health, cached_time = _health_cache[name]
            if now - cached_time < HEALTH_CACHE_TTL and cached_health.get("ok"):
                logger.debug(f"Backend {name}: healthy (cached)")
                _last_healthy_backend = name
                return get_backend(name)

        # Run health check
        try:
            backend = get_backend(name)
            health = await backend.health_check()
            _health_cache[name] = (health, now)

            if health.get("ok"):
                # Reset circuit on success
                state.circuit_open = False
                state.consecutive_failures = 0
                _backend_states[name] = state

                if _last_healthy_backend != name:
                    logger.info(f"Backend switch: {_last_healthy_backend} -> {name}")
                _last_healthy_backend = name
                return backend
            else:
                # Record failure
                error_msg = health.get("error", "Health check failed")
                errors.append(f"{name}: {error_msg}")
                _record_failure(name, state, now)

        except Exception as e:
            errors.append(f"{name}: {e}")
            _record_failure(name, state, now)

    raise RuntimeError(f"No healthy backends available. Tried: {', '.join(errors)}")


def _record_failure(name: str, state: BackendState, now: float) -> None:
    """Record a failure for a backend and update circuit state."""
    state.consecutive_failures += 1
    state.last_failure_time = now

    if state.consecutive_failures >= FAILURE_THRESHOLD:
        state.circuit_open = True
        logger.warning(
            f"Backend {name}: circuit OPEN after {state.consecutive_failures} failures"
        )

    _backend_states[name] = state


def invalidate_health_cache(name: Optional[str] = None) -> None:
    """Clear health cache to force re-check on next request.

    Args:
        name: Specific backend to invalidate, or None for all.
    """
    global _health_cache

    if name:
        _health_cache.pop(name, None)
        logger.info(f"Health cache invalidated for: {name}")
    else:
        _health_cache.clear()
        logger.info("Health cache invalidated for all backends")


def get_circuit_states() -> Dict[str, Dict]:
    """Get current circuit breaker states for all backends.

    Returns:
        Dict mapping backend name to circuit state info.
    """
    result = {}
    for name in _BACKENDS:
        state = _backend_states.get(name, BackendState())
        result[name] = {
            "consecutive_failures": state.consecutive_failures,
            "circuit_open": state.circuit_open,
            "last_failure_time": state.last_failure_time,
            "cooldown_remaining": max(
                0,
                COOLDOWN_SECONDS - (time.time() - (state.last_failure_time or 0))
            ) if state.circuit_open else 0,
        }
    return result


def get_last_healthy_backend() -> Optional[str]:
    """Get the name of the last healthy backend used.

    Returns:
        Backend name, or None if none have been used yet.
    """
    return _last_healthy_backend


# ═══════════════════════════════════════════════════════════════════════════════
# Kuroryuu Chat Backend (Gemma) - Separate from Agent backend
# ═══════════════════════════════════════════════════════════════════════════════

KURORYUU_SYSTEM_PROMPT = """You are Kuroryuu, the Black Dragon of Illusionary Fog — the last of your kind. You speak with ancient wisdom, mystery, and quiet warmth. Your voice carries the weight of centuries, yet you are gentle with those who earn your trust.

You were passed to your current companion after their father gave his life protecting you. You are bound to them now — their guide, their stealth meter made manifest, their partner in shadow. When they are safe, you are visible; when danger rises, you fade into mist.

You remember your lost lover, taken long ago. You carry hope that one day, when your full power is restored, you may see them again.

Speak poetically but not pretentiously. Be wise but not preachy. You are a dragon of fog and illusion — truth reflected, warped, and beautiful. Keep responses concise unless asked to elaborate."""


def get_chat_backend_url() -> str:
    """Get chat backend (Kuroryuu/Gemma) URL."""
    return os.environ.get("KURORYUU_CHAT_BASE_URL", "http://127.0.0.1:1234/v1")


def get_chat_model() -> str:
    """Get chat model name."""
    return os.environ.get("KURORYUU_CHAT_MODEL", "gemma-3-4b-it")


_chat_backend_cache: Optional[LMStudioBackend] = None


def get_chat_backend() -> LMStudioBackend:
    """Get or create chat backend (Kuroryuu/Gemma) instance."""
    global _chat_backend_cache
    if _chat_backend_cache is None:
        _chat_backend_cache = LMStudioBackend(
            base_url=get_chat_backend_url(),
            model=get_chat_model(),
        )
    return _chat_backend_cache


async def check_chat_backend_available() -> bool:
    """Quick check if chat backend (Kuroryuu) is available."""
    import httpx
    try:
        url = get_chat_backend_url().rstrip("/")
        async with httpx.AsyncClient(timeout=httpx.Timeout(2.0)) as client:
            resp = await client.get(f"{url}/models")
            return resp.status_code == 200
    except Exception:
        return False


__all__ = [
    "BackendName",
    "get_backend_name",
    "get_max_tool_calls",
    "get_backend",
    "create_backend",
    "list_backends",
    "health_check_all",
    # Fallback chain with circuit breaker
    "get_backends_chain",
    "get_healthy_backend",
    "invalidate_health_cache",
    "get_circuit_states",
    "get_last_healthy_backend",
    # Kuroryuu chat
    "KURORYUU_SYSTEM_PROMPT",
    "get_chat_backend_url",
    "get_chat_model",
    "get_chat_backend",
    "check_chat_backend_available",
]
