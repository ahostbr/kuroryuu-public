"""Hook Registry — Load/store hook definitions from ai/hooks.json.

Handles:
- Loading hook configuration from disk
- Validating hook definitions
- Resolving builtin hook targets to callables
- Thread-safe singleton access
"""

from __future__ import annotations

import importlib
import json
import os
import threading
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .hooks_types import (
    HookAction,
    HookActionType,
    HookConfig,
    HookEvent,
    HOOKS_DIR,
    HOOKS_ENABLED,
)
from ..utils.logging_config import get_logger

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

HOOKS_CONFIG_FILE = "hooks.json"
DEFAULT_HOOKS_PATH = Path(HOOKS_DIR) / HOOKS_CONFIG_FILE


# ═══════════════════════════════════════════════════════════════════════════════
# Hook Registry
# ═══════════════════════════════════════════════════════════════════════════════

class HooksRegistry:
    """Registry for hook definitions and resolved callables.
    
    Handles loading hooks from ai/hooks.json and resolving builtin
    targets to Python callables.
    """
    
    def __init__(self, config_path: Optional[Path] = None):
        self.config_path = config_path or DEFAULT_HOOKS_PATH
        self._config: Optional[HookConfig] = None
        self._callables: Dict[str, Callable] = {}
        self._lock = threading.Lock()
        self._loaded = False
    
    @property
    def enabled(self) -> bool:
        """Check if hooks system is enabled."""
        return HOOKS_ENABLED and (self._config is None or self._config.enabled)
    
    @property
    def config(self) -> HookConfig:
        """Get the current configuration, loading if needed."""
        if self._config is None:
            self.load()
        return self._config
    
    def load(self, force: bool = False) -> HookConfig:
        """Load hook configuration from disk.
        
        Args:
            force: If True, reload even if already loaded.
            
        Returns:
            The loaded HookConfig.
        """
        with self._lock:
            if self._loaded and not force:
                return self._config
            
            if not self.config_path.exists():
                # Create default config
                self._config = self._create_default_config()
                self._save_config()
            else:
                self._config = self._load_from_file()
            
            # Resolve builtin callables
            self._resolve_callables()
            self._loaded = True
            
            return self._config
    
    def _load_from_file(self) -> HookConfig:
        """Load configuration from JSON file."""
        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            return self._parse_config(data)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid hooks.json: {e}")
        except Exception as e:
            raise ValueError(f"Failed to load hooks.json: {e}")
    
    def _parse_config(self, data: Dict[str, Any]) -> HookConfig:
        """Parse configuration dictionary into HookConfig."""
        hooks = []
        
        for hook_data in data.get("hooks", []):
            try:
                hook = HookAction(
                    id=hook_data["id"],
                    event=hook_data["event"],
                    type=hook_data.get("type", "builtin"),
                    target=hook_data["target"],
                    priority=hook_data.get("priority", 50),
                    enabled=hook_data.get("enabled", True),
                    timeout_ms=hook_data.get("timeout_ms", data.get("defaults", {}).get("timeout_ms", 2000)),
                    continue_on_error=hook_data.get("continue_on_error", data.get("defaults", {}).get("continue_on_error", True)),
                    tool_name_pattern=hook_data.get("tool_name_pattern"),
                    effects=hook_data.get("effects", []),  # Stateless architecture: mutation effects
                )
                hooks.append(hook)
            except (KeyError, ValueError) as e:
                # Skip invalid hooks but log
                logger.warning(f"[hooks] Skipping invalid hook: {e}")
                continue
        
        return HookConfig(
            spec_version=data.get("spec_version", "kuroryuu-hooks-config/0.1"),
            enabled=data.get("enabled", True),
            default_timeout_ms=data.get("defaults", {}).get("timeout_ms", 2000),
            continue_on_error=data.get("defaults", {}).get("continue_on_error", True),
            hooks=hooks,
        )
    
    def _create_default_config(self) -> HookConfig:
        """Create default configuration with todo_sot_enforcer hook."""
        return HookConfig(
            spec_version="kuroryuu-hooks-config/0.1",
            enabled=True,
            hooks=[
                # Todo Source-of-Truth Enforcer (runs early, on multiple events)
                HookAction(
                    id="todo_sot_enforcer",
                    event=HookEvent.SESSION_START,
                    type=HookActionType.BUILTIN,
                    target="apps.gateway.hooks.builtins.todo_sot_enforcer:on_session_start",
                    priority=5,
                    enabled=True,
                ),
                HookAction(
                    id="todo_sot_enforcer_prompt",
                    event=HookEvent.USER_PROMPT_SUBMIT,
                    type=HookActionType.BUILTIN,
                    target="apps.gateway.hooks.builtins.todo_sot_enforcer:on_user_prompt",
                    priority=5,
                    enabled=True,
                ),
                HookAction(
                    id="todo_sot_enforcer_post_tool",
                    event=HookEvent.POST_TOOL_USE,
                    type=HookActionType.BUILTIN,
                    target="apps.gateway.hooks.builtins.todo_sot_enforcer:on_post_tool",
                    priority=30,
                    enabled=True,
                ),
                HookAction(
                    id="todo_sot_enforcer_response",
                    event=HookEvent.MODEL_RESPONSE_DONE,
                    type=HookActionType.BUILTIN,
                    target="apps.gateway.hooks.builtins.todo_sot_enforcer:on_model_response",
                    priority=30,
                    enabled=True,
                ),
            ],
        )
    
    def _save_config(self) -> None:
        """Save current configuration to disk."""
        if self._config is None:
            return
        
        # Ensure directory exists
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        
        data = {
            "spec_version": self._config.spec_version,
            "enabled": self._config.enabled,
            "defaults": {
                "timeout_ms": self._config.default_timeout_ms,
                "continue_on_error": self._config.continue_on_error,
            },
            "hooks": [
                {
                    "id": h.id,
                    "event": h.event.value if isinstance(h.event, HookEvent) else h.event,
                    "type": h.type.value if isinstance(h.type, HookActionType) else h.type,
                    "target": h.target,
                    "priority": h.priority,
                    "enabled": h.enabled,
                    "timeout_ms": h.timeout_ms,
                    "continue_on_error": h.continue_on_error,
                    **({"tool_name_pattern": h.tool_name_pattern} if h.tool_name_pattern else {}),
                }
                for h in self._config.hooks
            ],
        }
        
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    
    def _resolve_callables(self) -> None:
        """Resolve builtin hook targets to Python callables."""
        self._callables.clear()
        
        for hook in self._config.hooks:
            if hook.type == HookActionType.BUILTIN and hook.enabled:
                try:
                    callable_fn = self._import_target(hook.target)
                    self._callables[hook.id] = callable_fn
                except Exception as e:
                    logger.warning(f"[hooks] Failed to resolve {hook.id}: {e}")
    
    def _import_target(self, target: str) -> Callable:
        """Import a target string like 'module.path:function'."""
        if ":" not in target:
            raise ValueError(f"Invalid target format: {target} (expected 'module:function')")
        
        module_path, func_name = target.rsplit(":", 1)
        
        try:
            module = importlib.import_module(module_path)
            func = getattr(module, func_name)
            if not callable(func):
                raise ValueError(f"{target} is not callable")
            return func
        except ImportError as e:
            raise ValueError(f"Cannot import module {module_path}: {e}")
        except AttributeError:
            raise ValueError(f"Function {func_name} not found in {module_path}")
    
    def get_callable(self, hook_id: str) -> Optional[Callable]:
        """Get the resolved callable for a hook."""
        return self._callables.get(hook_id)
    
    def get_hooks_for_event(self, event: HookEvent) -> List[HookAction]:
        """Get all enabled hooks for an event, sorted by priority."""
        return self.config.get_hooks_for_event(event)
    
    def add_hook(self, hook: HookAction) -> None:
        """Add a hook to the registry."""
        with self._lock:
            # Remove existing hook with same ID
            self._config.hooks = [h for h in self._config.hooks if h.id != hook.id]
            self._config.hooks.append(hook)
            
            # Resolve callable if builtin
            if hook.type == HookActionType.BUILTIN and hook.enabled:
                try:
                    self._callables[hook.id] = self._import_target(hook.target)
                except Exception:
                    pass
            
            self._save_config()
    
    def remove_hook(self, hook_id: str) -> bool:
        """Remove a hook from the registry."""
        with self._lock:
            before = len(self._config.hooks)
            self._config.hooks = [h for h in self._config.hooks if h.id != hook_id]
            self._callables.pop(hook_id, None)
            
            if len(self._config.hooks) < before:
                self._save_config()
                return True
            return False
    
    def set_hook_enabled(self, hook_id: str, enabled: bool) -> bool:
        """Enable or disable a hook."""
        with self._lock:
            for hook in self._config.hooks:
                if hook.id == hook_id:
                    hook.enabled = enabled
                    self._save_config()
                    return True
            return False


# ═══════════════════════════════════════════════════════════════════════════════
# Singleton Access
# ═══════════════════════════════════════════════════════════════════════════════

_registry: Optional[HooksRegistry] = None
_registry_lock = threading.Lock()


def get_hooks_registry(config_path: Optional[Path] = None) -> HooksRegistry:
    """Get the singleton hooks registry."""
    global _registry
    
    with _registry_lock:
        if _registry is None:
            _registry = HooksRegistry(config_path)
        return _registry


def load_hooks_config(force: bool = False) -> HookConfig:
    """Load hooks configuration (convenience function)."""
    return get_hooks_registry().load(force=force)
