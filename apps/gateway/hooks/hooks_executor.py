"""Hook Executor — Execute hooks with timeout/error handling.

Handles:
- Running hooks with timeout protection
- Aggregating results from multiple hooks
- Applying mutations to payloads
- Blocking requests when hooks deny
- Role-gating for stateless architecture (workers can't mutate shared state)
"""

from __future__ import annotations

import asyncio
import json
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .hooks_types import (
    HookAction,
    HookEvent,
    HookPayload,
    HookResult,
    HookNote,
    MUTABLE_EVENTS,
    BLOCKABLE_EVENTS,
)
from .hooks_registry import get_hooks_registry


# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

# Thread pool for sync hook execution
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="hook_")

# Effects that indicate shared state mutation (skipped for workers)
MUTATING_EFFECTS = {"todo_write", "working_memory_write", "leader_state_write"}


def load_settings() -> Dict[str, Any]:
    """Load settings from ai/settings.json."""
    settings_file = Path(__file__).parent.parent.parent / "ai" / "settings.json"
    if settings_file.exists():
        try:
            return json.loads(settings_file.read_text())
        except json.JSONDecodeError:
            pass
    return {"strict_worker_guards": True}


class HookGateResult:
    """Result of checking if a hook should run for a role."""
    ALLOW = "allow"           # Run the hook normally
    SKIP = "skip"             # Skip this hook (known mutating, worker mode)
    HARD_ERROR = "hard_error" # Fail the request (unknown effects, worker mode)


def check_hook_for_role(hook: HookAction, agent_role: str) -> Tuple[str, str]:
    """
    Check if a hook should run for the given agent role.
    
    Semantics (per ChatGPT review):
    - Leader: always ALLOW
    - Worker + effects=[] (safe): ALLOW
    - Worker + effects contains mutating: SKIP (don't run, log it)
    - Worker + effects missing/None (UNKNOWN): HARD_ERROR (fail-closed)
    
    Args:
        hook: The hook action
        agent_role: "leader" or "worker"
        
    Returns:
        (result, reason) tuple where result is HookGateResult value
    """
    if agent_role == "leader":
        return HookGateResult.ALLOW, ""
    
    # Worker mode - check effects
    if hook.effects is None or (not isinstance(hook.effects, list)):
        # Missing/invalid effects = UNKNOWN = hard error for workers (fail-closed)
        return HookGateResult.HARD_ERROR, f"Hook {hook.id} has no declared effects (unknown = hard error for workers)"
    
    # Empty list = safe hook, no mutations
    if len(hook.effects) == 0:
        return HookGateResult.ALLOW, ""
    
    # Check for mutating effects
    mutating = set(hook.effects) & MUTATING_EFFECTS
    if mutating:
        # SKIP mutating hooks for workers (don't run, but don't error)
        return HookGateResult.SKIP, f"Hook {hook.id} has mutating effects {mutating} (skipped for workers)"
    
    # Non-mutating effects = safe
    return HookGateResult.ALLOW, ""


# ═══════════════════════════════════════════════════════════════════════════════
# Hook Executor
# ═══════════════════════════════════════════════════════════════════════════════

class HookExecutor:
    """Executes hooks with timeout and error handling.
    
    Supports both sync and async execution modes.
    """
    
    def __init__(self):
        self.registry = get_hooks_registry()
    
    def execute_sync(
        self,
        hook: HookAction,
        payload: HookPayload,
    ) -> HookResult:
        """Execute a single hook synchronously.
        
        Args:
            hook: The hook action to execute.
            payload: The payload to pass to the hook.
            
        Returns:
            HookResult from the hook.
        """
        callable_fn = self.registry.get_callable(hook.id)
        
        if callable_fn is None:
            return HookResult.error(
                "hook_not_resolved",
                f"Hook {hook.id} callable not resolved"
            )
        
        start_time = time.time()
        
        try:
            # Execute with timeout
            result = callable_fn(payload.to_dict())
            
            # Normalize result to HookResult
            if result is None:
                result = HookResult.success()
            elif isinstance(result, dict):
                result = self._dict_to_result(result)
            elif not isinstance(result, HookResult):
                result = HookResult.success(
                    notes=[HookNote("info", f"Hook returned: {result}")]
                )
            
            return result
            
        except TimeoutError:
            return HookResult.error(
                "hook_timeout",
                f"Hook {hook.id} timed out after {hook.timeout_ms}ms"
            )
        except Exception as e:
            tb = traceback.format_exc()
            return HookResult.error(
                "hook_exception",
                str(e),
                error_details={"traceback": tb, "hook_id": hook.id}
            )
    
    async def execute_async(
        self,
        hook: HookAction,
        payload: HookPayload,
    ) -> HookResult:
        """Execute a single hook asynchronously.
        
        Wraps sync execution in a thread pool for non-blocking behavior.
        """
        loop = asyncio.get_event_loop()
        
        try:
            # Run in thread pool with timeout
            result = await asyncio.wait_for(
                loop.run_in_executor(_executor, self.execute_sync, hook, payload),
                timeout=hook.timeout_ms / 1000.0
            )
            return result
        except asyncio.TimeoutError:
            return HookResult.error(
                "hook_timeout",
                f"Hook {hook.id} timed out after {hook.timeout_ms}ms"
            )
    
    def execute_all_for_event_sync(
        self,
        event: HookEvent,
        payload: HookPayload,
    ) -> Tuple[HookResult, HookPayload]:
        """Execute all hooks for an event synchronously.
        
        Returns aggregated result and potentially mutated payload.
        
        Note: Applies role-gating for stateless architecture.
        Workers cannot run hooks with mutating effects.
        """
        hooks = self.registry.get_hooks_for_event(event)
        
        if not hooks:
            return HookResult.success(), payload
        
        aggregated = HookResult.success()
        current_payload = payload
        settings = load_settings()
        strict_guards = settings.get("strict_worker_guards", True)
        
        for hook in hooks:
            # Role-gating: check if hook should run for this role
            gate_result, reason = check_hook_for_role(hook, payload.agent_role)
            
            if gate_result == HookGateResult.HARD_ERROR:
                # Unknown effects = fail-closed
                return HookResult.error(
                    "worker_guard_violation",
                    reason
                ), payload
            
            if gate_result == HookGateResult.SKIP:
                # Known mutating hook = skip but log
                aggregated.notes.append(HookNote("info", f"Skipped (worker mode): {reason}"))
                continue
            
            # gate_result == HookGateResult.ALLOW - run normally
            
            # Generate run ID for this execution
            payload.run_id = str(uuid.uuid4())[:8]
            
            result = self.execute_sync(hook, current_payload)
            
            # Aggregate results
            aggregated = self._aggregate_results(aggregated, result)
            
            # Check for blocking
            if not result.allow and event in BLOCKABLE_EVENTS:
                aggregated.allow = False
                aggregated.block_reason = result.block_reason
                break
            
            # Apply mutations if event is mutable
            if result.mutations and event in MUTABLE_EVENTS:
                current_payload = self._apply_mutations(current_payload, result.mutations)
            
            # Stop if hook failed and not continue_on_error
            if not result.ok and not hook.continue_on_error:
                break
        
        return aggregated, current_payload
    
    async def execute_all_for_event_async(
        self,
        event: HookEvent,
        payload: HookPayload,
    ) -> Tuple[HookResult, HookPayload]:
        """Execute all hooks for an event asynchronously.
        
        Note: Applies role-gating for stateless architecture.
        Workers cannot run hooks with mutating effects.
        """
        hooks = self.registry.get_hooks_for_event(event)
        
        if not hooks:
            return HookResult.success(), payload
        
        aggregated = HookResult.success()
        current_payload = payload
        
        for hook in hooks:
            # Role-gating: check if hook should run for this role
            gate_result, reason = check_hook_for_role(hook, payload.agent_role)
            
            if gate_result == HookGateResult.HARD_ERROR:
                # Unknown effects = fail-closed
                return HookResult.error(
                    "worker_guard_violation",
                    reason
                ), payload
            
            if gate_result == HookGateResult.SKIP:
                # Known mutating hook = skip but log
                aggregated.notes.append(HookNote("info", f"Skipped (worker mode): {reason}"))
                continue
            
            # gate_result == HookGateResult.ALLOW - run normally
            
            payload.run_id = str(uuid.uuid4())[:8]
            
            result = await self.execute_async(hook, current_payload)
            
            aggregated = self._aggregate_results(aggregated, result)
            
            if not result.allow and event in BLOCKABLE_EVENTS:
                aggregated.allow = False
                aggregated.block_reason = result.block_reason
                break
            
            if result.mutations and event in MUTABLE_EVENTS:
                current_payload = self._apply_mutations(current_payload, result.mutations)
            
            if not result.ok and not hook.continue_on_error:
                break
        
        return aggregated, current_payload
    
    def _dict_to_result(self, data: Dict[str, Any]) -> HookResult:
        """Convert a dictionary to HookResult."""
        notes = [
            HookNote(n.get("level", "info"), n.get("message", ""))
            for n in data.get("notes", [])
        ]
        
        return HookResult(
            ok=data.get("ok", True),
            allow=data.get("actions", {}).get("allow", True),
            block_reason=data.get("actions", {}).get("block_reason"),
            mutations=data.get("actions", {}).get("mutations", {}),
            notes=notes,
            inject_context=data.get("inject_context"),
            error_code=data.get("error_code"),
            error_message=data.get("message"),
        )
    
    def _aggregate_results(self, acc: HookResult, new: HookResult) -> HookResult:
        """Aggregate two hook results."""
        acc.notes.extend(new.notes)
        acc.ui_events.extend(new.ui_events)
        
        if new.inject_context:
            if acc.inject_context:
                acc.inject_context += "\n\n" + new.inject_context
            else:
                acc.inject_context = new.inject_context
        
        if not new.ok:
            acc.ok = False
            acc.error_code = acc.error_code or new.error_code
            acc.error_message = acc.error_message or new.error_message
        
        return acc
    
    def _apply_mutations(self, payload: HookPayload, mutations: Dict[str, Any]) -> HookPayload:
        """Apply mutations to payload (shallow implementation)."""
        # For v0.1, only support top-level data mutations
        for key, value in mutations.items():
            if key.startswith("data."):
                # Parse dotted path into payload.data
                path_parts = key[5:].split(".")
                target = payload.data
                for part in path_parts[:-1]:
                    if part not in target:
                        target[part] = {}
                    target = target[part]
                target[path_parts[-1]] = value
        
        return payload


# ═══════════════════════════════════════════════════════════════════════════════
# Convenience Functions
# ═══════════════════════════════════════════════════════════════════════════════

_default_executor: Optional[HookExecutor] = None


def _get_executor() -> HookExecutor:
    """Get the default hook executor."""
    global _default_executor
    if _default_executor is None:
        _default_executor = HookExecutor()
    return _default_executor


def execute_hook(hook: HookAction, payload: HookPayload) -> HookResult:
    """Execute a single hook (sync convenience function)."""
    return _get_executor().execute_sync(hook, payload)


def execute_hooks_for_event(
    event: HookEvent,
    payload: HookPayload,
) -> Tuple[HookResult, HookPayload]:
    """Execute all hooks for an event (sync convenience function)."""
    return _get_executor().execute_all_for_event_sync(event, payload)


async def execute_hooks_for_event_async(
    event: HookEvent,
    payload: HookPayload,
) -> Tuple[HookResult, HookPayload]:
    """Execute all hooks for an event (async convenience function)."""
    return await _get_executor().execute_all_for_event_async(event, payload)
