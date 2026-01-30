"""Tool permission state management for kuroryuu-cli.

Manages per-tool approval state with session-scoped tracking and
optional persistence. Distinguishes between safe and dangerous tools.
Also enforces operation modes (normal, plan, read).
"""

from __future__ import annotations

import json
import logging
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, Optional, Set, Tuple

if TYPE_CHECKING:
    from .config import Config

from .config import OperationMode

logger = logging.getLogger(__name__)

# Tool action classification for operation modes
READ_ONLY_ACTIONS: Dict[str, Set[str]] = {
    "k_files": {"read", "list"},
    "k_rag": {"help", "query", "status", "query_semantic", "query_hybrid",
              "query_reranked", "query_multi", "query_reflective",
              "query_agentic", "query_interactive"},
    "k_repo_intel": {"help", "status", "get", "list", "run"},  # run rebuilds index (safe)
    "k_checkpoint": {"help", "list", "load"},
    "k_session": {"help", "context", "start", "end", "log"},
    "k_memory": {"help", "get"},
    "k_collective": {"help", "query_patterns", "get_skill_matrix"},
    "k_inbox": {"help", "list", "read", "stats"},
    "k_pty": {"help", "list", "read", "term_read", "resolve"},
}

WRITE_ACTIONS: Dict[str, Set[str]] = {
    "k_files": {"write", "edit", "delete"},
    "k_pty": {"send_line", "write", "talk", "create", "send_line_to_agent", "resize"},
    "k_checkpoint": {"save"},
    "k_inbox": {"send", "complete", "claim", "mark_read"},
    "k_memory": {"set_goal", "add_blocker", "clear_blockers", "set_steps", "reset"},
    "k_interact": {"ask", "approve", "plan", "screenshot"},
    "k_collective": {"record_success", "record_failure", "update_skill"},
}


class PermissionDecision(str, Enum):
    """Permission decision for a tool."""

    ALWAYS_ALLOW = "always_allow"
    ALWAYS_DENY = "always_deny"
    ASK = "ask"


class ToolPermissionManager:
    """Manages tool approval state (session-scoped + optional persistence).

    Tracks which tools have been granted "always accept" status,
    allowing users to skip confirmation prompts for trusted tools.

    Dangerous tools (k_pty write, k_files write/edit) always require
    confirmation regardless of permission state.
    """

    def __init__(self, config: "Config"):
        self.config = config
        self._accept_all: bool = False
        self._always_approved: Set[str] = set()
        self._always_denied: Set[str] = set()
        self._config_path = config.project_root / ".kuroryuu_permissions.json"

        # Dangerous tools that ALWAYS require confirmation
        self.DANGEROUS_TOOLS: Set[str] = {"k_pty", "k_files"}
        self.DANGEROUS_ACTIONS: Dict[str, Set[str]] = {
            "k_files": {"write", "edit", "delete"},
            "k_pty": {"send_line", "write", "talk", "create", "send_line_to_agent"},
        }

        # Safe paths that are exempt from dangerous tool checks (auto-allowed)
        # These are agent working files, not user code
        self.SAFE_WRITE_PATHS: Set[str] = {
            "ai/agent_context.md",
            "ai/todo.md",
            "ai/progress.md",
            "ai/sessions.json",
        }
        # Safe path prefixes (anything under these directories)
        self.SAFE_WRITE_PREFIXES: tuple = (
            "ai/checkpoints/",
            "ai/inbox/",
        )

    def should_auto_approve(
        self, tool_name: str, args: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Check if tool should be auto-approved (skip confirmation).

        Args:
            tool_name: Name of the tool being called
            args: Tool arguments (for action-specific checks)

        Returns:
            True if tool should be auto-approved, False if user prompt needed
        """
        # Check if dangerous action - always prompt
        if self._is_dangerous(tool_name, args):
            return False

        # Check accept_all flag
        if self._accept_all:
            return True

        # Check per-tool approval
        if tool_name in self._always_approved:
            return True

        # Note: _always_denied tools are blocked, not prompted
        # That logic is handled in should_block()

        return False  # Default: ask

    def should_block(self, tool_name: str) -> bool:
        """Check if tool should be blocked without prompting.

        Args:
            tool_name: Name of the tool

        Returns:
            True if tool should be blocked
        """
        return tool_name in self._always_denied

    def _is_dangerous(
        self, tool_name: str, args: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Check if tool call is dangerous (requires confirmation every time).

        Args:
            tool_name: Name of the tool
            args: Tool arguments

        Returns:
            True if dangerous and should always prompt
        """
        if tool_name not in self.DANGEROUS_TOOLS:
            return False

        # Check action-specific danger
        if args and tool_name in self.DANGEROUS_ACTIONS:
            action = args.get("action", "")
            if action in self.DANGEROUS_ACTIONS[tool_name]:
                # Check if path is in safe whitelist (k_files writes to ai/ files)
                if tool_name == "k_files" and action in {"write", "edit"}:
                    path = args.get("path", "")
                    # Normalize path separators
                    path_normalized = path.replace("\\", "/")

                    # Check exact matches
                    if path_normalized in self.SAFE_WRITE_PATHS:
                        return False  # Safe - auto-allow

                    # Check prefix matches
                    if path_normalized.startswith(self.SAFE_WRITE_PREFIXES):
                        return False  # Safe - auto-allow

                return True  # Dangerous - require confirmation
            # Safe actions (like "read", "list") are not dangerous
            return False

        # No args or no action - default to dangerous for safety
        return True

    def grant_tool(self, tool_name: str) -> None:
        """Grant always-allow for a tool (session-scoped).

        Args:
            tool_name: Name of the tool to allow
        """
        self._always_approved.add(tool_name)
        self._always_denied.discard(tool_name)
        logger.info(f"Granted always-allow for {tool_name}")

    def grant_all(self) -> None:
        """Grant always-allow for all tools (session-scoped).

        Note: Dangerous tools still require confirmation.
        """
        self._accept_all = True
        logger.info("Granted accept-all for session")

    def deny_tool(self, tool_name: str) -> None:
        """Set always-deny for a tool (blocks without prompting).

        Args:
            tool_name: Name of the tool to deny
        """
        self._always_denied.add(tool_name)
        self._always_approved.discard(tool_name)
        logger.info(f"Set always-deny for {tool_name}")

    def reset(self) -> None:
        """Reset all permissions to default (ask)."""
        self._accept_all = False
        self._always_approved.clear()
        self._always_denied.clear()
        logger.info("Reset all permissions")

    def get_status(self) -> Dict[str, Any]:
        """Get current permission state.

        Returns:
            Dict with accept_all, always_approved, always_denied lists
        """
        return {
            "accept_all": self._accept_all,
            "always_approved": sorted(self._always_approved),
            "always_denied": sorted(self._always_denied),
            "dangerous_tools": sorted(self.DANGEROUS_TOOLS),
            "operation_mode": self.config.operation_mode.value,
        }

    # =========================================================================
    # Operation Mode Enforcement (PLAN / READ / NORMAL)
    # =========================================================================

    def is_read_only_action(
        self, tool_name: str, args: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Check if tool action is read-only.

        Args:
            tool_name: Name of the tool
            args: Tool arguments (checks 'action' field)

        Returns:
            True if this is a read-only action
        """
        action = (args or {}).get("action", "")

        if tool_name in READ_ONLY_ACTIONS:
            allowed_actions = READ_ONLY_ACTIONS[tool_name]
            # If action is in allowed set, or no action specified (default safe for known tools)
            return action in allowed_actions or (not action and tool_name in READ_ONLY_ACTIONS)

        return False  # Unknown tool = not read-only by default

    def is_write_action(
        self, tool_name: str, args: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Check if tool action is a write/execute action.

        Args:
            tool_name: Name of the tool
            args: Tool arguments (checks 'action' field)

        Returns:
            True if this is a write action
        """
        action = (args or {}).get("action", "")

        if tool_name in WRITE_ACTIONS:
            return action in WRITE_ACTIONS[tool_name]

        # Unknown tools default to write (safer to block in restricted modes)
        return tool_name not in READ_ONLY_ACTIONS

    def check_operation_mode(
        self, tool_name: str, args: Optional[Dict[str, Any]] = None
    ) -> Tuple[bool, str]:
        """Check if tool is allowed in current operation mode.

        Args:
            tool_name: Name of the tool
            args: Tool arguments

        Returns:
            (allowed, reason) tuple:
            - allowed=True: Tool can execute
            - allowed=False: Tool blocked or planned
            - reason: Explanation for blocking
        """
        mode = self.config.operation_mode

        # NORMAL mode: Everything allowed (subject to other checks)
        if mode == OperationMode.NORMAL:
            return True, ""

        # Check if read-only action (always allowed in all modes)
        if self.is_read_only_action(tool_name, args):
            return True, ""

        # READ mode: Block write actions entirely
        if mode == OperationMode.READ:
            action = (args or {}).get("action", "unknown")
            return False, f"Blocked in READ mode: {tool_name}:{action}"

        # PLAN mode: Record but don't execute write actions
        if mode == OperationMode.PLAN:
            action = (args or {}).get("action", "unknown")
            return False, f"Planned (not executed): {tool_name}:{action}"

        return True, ""

    # Optional: Persistence methods (for future use)

    def save(self) -> bool:
        """Save persistent permissions to config file.

        Returns:
            True if saved successfully
        """
        try:
            data = {
                "accept_all": self._accept_all,
                "always_approved": list(self._always_approved),
                "always_denied": list(self._always_denied),
            }
            self._config_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            logger.info(f"Saved permissions to {self._config_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to save permissions: {e}")
            return False

    def load(self) -> bool:
        """Load persistent permissions from config file.

        Returns:
            True if loaded successfully
        """
        if not self._config_path.exists():
            return False

        try:
            data = json.loads(self._config_path.read_text(encoding="utf-8"))
            self._accept_all = data.get("accept_all", False)
            self._always_approved = set(data.get("always_approved", []))
            self._always_denied = set(data.get("always_denied", []))
            logger.info(f"Loaded permissions from {self._config_path}")
            return True
        except Exception as e:
            logger.warning(f"Failed to load permissions: {e}")
            return False


__all__ = ["ToolPermissionManager", "PermissionDecision"]
