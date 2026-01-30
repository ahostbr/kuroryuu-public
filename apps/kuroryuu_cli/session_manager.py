"""Session manager for Kuroryuu lifecycle and hooks integration.

Implements patterns from Docs/CaseStudies/ClaudeCode_Integration_Analysis.md:
- Proper hook response validation (check `ok` field)
- Fail loudly on critical hooks (start, end)
- Pre-tool hook respects server-side blocking
- Post-tool hook awaited with validation
- Context retrieval for dynamic system prompt refresh
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Dict, Optional

from .config import Config
from .gateway_client import GatewayClient
from .mcp_client import MCPClientWrapper

logger = logging.getLogger(__name__)


class SessionStartError(Exception):
    """Raised when session start hook fails."""
    pass


class SessionEndError(Exception):
    """Raised when session end hook fails."""
    pass


class SessionManager:
    """Manages Kuroryuu session lifecycle and hook integration.

    Responsibilities:
    - Register agent with Gateway
    - Call k_session hooks (start, pre_tool, post_tool, log, end, context)
    - Background heartbeat loop
    - Track session state

    Per Case Study Section 7 (Session Lifecycle):
    - Bootstrap → Register → Heartbeat → Execute → End
    - All hook responses validated for `ok` field
    - Critical hooks (start, end) raise exceptions on failure
    """

    def __init__(self, config: Config):
        self.config = config
        self.gateway_client = GatewayClient(config)
        self.mcp_client = MCPClientWrapper(config)

        self.session_id: Optional[str] = None
        self.feature_id: Optional[str] = None
        self.agent_id: Optional[str] = None
        self.role: Optional[str] = None
        self._context: str = ""  # Cached context from k_session

        self._heartbeat_task: Optional[asyncio.Task] = None
        self._running: bool = False

    async def start(self) -> Dict[str, Any]:
        """Initialize session: connect, register, start hooks.

        Returns:
            Session info dict with session_id, role, feature_id
        """
        # Connect HTTP clients
        await self.gateway_client.connect()
        await self.mcp_client.connect()

        # Check services health with clear error messages
        try:
            gateway_health = await self.gateway_client.health_check()
        except Exception as e:
            raise ConnectionError(
                f"Cannot reach Gateway at {self.config.gateway_url}\n"
                f"  Error: {e}\n\n"
                "  Start services with: .\\run_all.ps1\n"
                "  Or start Gateway only: .\\apps\\gateway\\run.ps1"
            )

        try:
            mcp_health = await self.mcp_client.health_check()
        except Exception as e:
            raise ConnectionError(
                f"Cannot reach MCP Core at {self.config.mcp_url}\n"
                f"  Error: {e}\n\n"
                "  Start services with: .\\run_all.ps1\n"
                "  Or start MCP Core only: .\\apps\\mcp_core\\run.ps1"
            )

        if not gateway_health.get("ok"):
            error_detail = gateway_health.get("error", "Not responding")
            raise ConnectionError(
                f"Gateway not available at {self.config.gateway_url}\n"
                f"  Status: {error_detail}\n\n"
                "  Start services with: .\\run_all.ps1\n"
                "  Or start Gateway only: .\\apps\\gateway\\run.ps1"
            )

        if not mcp_health.get("ok"):
            error_detail = mcp_health.get("error", "Not responding")
            raise ConnectionError(
                f"MCP Core not available at {self.config.mcp_url}\n"
                f"  Status: {error_detail}\n\n"
                "  Start services with: .\\run_all.ps1\n"
                "  Or start MCP Core only: .\\apps\\mcp_core\\run.ps1"
            )

        # Register with Gateway
        reg_result = await self.gateway_client.register(
            role=self.config.role,
            capabilities=["local_llm", "chat", "tools"],
        )

        self.agent_id = self.gateway_client.agent_id
        self.role = self.gateway_client.role

        # Start Kuroryuu session via MCP
        # Per Case Study Section 7.1: Session registration is CRITICAL
        session_result = await self.mcp_client.call_session_tool(
            action="start",
            process_id=os.getpid(),
            cli_type="kuroryuu_cli",
            agent_id=self.agent_id,
        )

        # CRITICAL: Validate hook response (Case Study Section 4.5)
        if not session_result.ok:
            error_msg = session_result.error.get("message", "Unknown error") if session_result.error else "Unknown error"
            logger.error(f"Session start hook failed: {error_msg}")
            raise SessionStartError(f"k_session(action='start') failed: {error_msg}")

        # Parse session info - fail loudly on parse error (no silent UUID generation)
        try:
            content = session_result.content
            if content.startswith("{"):
                data = json.loads(content)
                # Check inner ok field (Kuroryuu hook response format)
                if not data.get("ok", True):
                    raise SessionStartError(f"Session start rejected: {data.get('message', 'unknown')}")
                self.session_id = data.get("session_id")
                self.feature_id = data.get("feature_id")
                self._context = data.get("context", "")
            else:
                # Text response - try to extract session_id
                for line in content.split("\n"):
                    if "session_id" in line.lower():
                        parts = line.split(":")
                        if len(parts) > 1:
                            self.session_id = parts[1].strip()
                            break
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse session start response: {e}")
            raise SessionStartError(f"Invalid JSON in session start response: {e}")

        if not self.session_id:
            raise SessionStartError("Session start returned no session_id - check MCP server logs")

        # Start background heartbeat
        self._running = True
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

        # Load available tools
        await self.mcp_client.list_tools()

        return {
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "role": self.role,
            "feature_id": self.feature_id,
        }

    async def stop(self, summary: str = "Session ended") -> None:
        """End session: stop heartbeat, deregister, cleanup."""
        self._running = False

        # Cancel heartbeat
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
            self._heartbeat_task = None

        # End Kuroryuu session (Case Study Section 7.3)
        if self.session_id:
            end_result = await self.mcp_client.call_session_tool(
                action="end",
                session_id=self.session_id,
                exit_code=0,
                summary=summary,
            )
            # Validate end hook response
            if not end_result.ok:
                error_msg = end_result.error.get("message", "Unknown") if end_result.error else "Unknown"
                logger.warning(f"Session end hook failed: {error_msg}")
                # Don't raise - cleanup should continue
            else:
                logger.info(f"Session {self.session_id} ended successfully")

        # Deregister from Gateway
        await self.gateway_client.deregister()

        # Disconnect clients
        await self.gateway_client.disconnect()
        await self.mcp_client.disconnect()

    async def _heartbeat_loop(self) -> None:
        """Background heartbeat loop."""
        while self._running:
            try:
                await self.gateway_client.heartbeat(status="idle")
            except Exception:
                pass  # Non-fatal, continue
            await asyncio.sleep(self.config.heartbeat_interval)

    # =========================================================================
    # Tool Hooks
    # =========================================================================

    async def pre_tool(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Call pre-tool hook before tool execution.

        Per Case Study Section 7.2 (Tool Execution Flow):
        - Pre-hook can BLOCK tool execution
        - Must check `ok` field first, then `allow` field
        - Fail-closed: if parse fails, DO NOT silently allow

        Returns:
            {"ok": bool, "allow": bool, "reason": str}
        """
        if not self.session_id:
            logger.warning("pre_tool called without session - allowing (no hooks)")
            return {"ok": True, "allow": True, "reason": "No session"}

        result = await self.mcp_client.call_session_tool(
            action="pre_tool",
            session_id=self.session_id,
            tool_name=tool_name,
            arguments=json.dumps(arguments),
        )

        # Check HTTP-level success first
        if not result.ok:
            error_msg = result.error.get("message", "Unknown") if result.error else "Hook call failed"
            logger.error(f"pre_tool hook failed: {error_msg}")
            # Fail-closed: block tool execution on hook failure
            return {"ok": False, "allow": False, "reason": f"Hook error: {error_msg}"}

        # Parse hook response
        try:
            data = json.loads(result.content)
            # Check inner ok field (Kuroryuu hook response format per Section 4.5)
            if not data.get("ok", True):
                return {
                    "ok": False,
                    "allow": False,
                    "reason": data.get("message", "Hook rejected"),
                }
            return {
                "ok": True,
                "allow": data.get("allow", True),
                "reason": data.get("reason", ""),
            }
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse pre_tool response: {e}")
            # Fail-closed on parse error (Case Study: fail loudly, don't silently allow)
            return {"ok": False, "allow": False, "reason": f"Parse error: {e}"}

    async def post_tool(
        self,
        tool_name: str,
        success: bool,
        result_summary: str,
    ) -> Dict[str, Any]:
        """Call post-tool hook after tool execution.

        Per Case Study Section 7.2:
        - Post-hook logs to ai/progress.md
        - Response should be validated (not fire-and-forget)
        - Truncates result_summary to 500 chars

        Returns:
            {"ok": bool, "logged": bool}
        """
        if not self.session_id:
            logger.debug("post_tool called without session - skipping")
            return {"ok": True, "logged": False}

        result = await self.mcp_client.call_session_tool(
            action="post_tool",
            session_id=self.session_id,
            tool_name=tool_name,
            result_ok=success,
            result_summary=result_summary[:500] if result_summary else "",
        )

        # Validate response (not fire-and-forget per Case Study)
        if not result.ok:
            error_msg = result.error.get("message", "Unknown") if result.error else "Unknown"
            logger.warning(f"post_tool hook failed: {error_msg}")
            return {"ok": False, "logged": False}

        # Parse response for confirmation
        try:
            data = json.loads(result.content)
            if not data.get("ok", True):
                logger.warning(f"post_tool hook rejected: {data.get('message', 'unknown')}")
                return {"ok": False, "logged": False}
            return {"ok": True, "logged": True}
        except json.JSONDecodeError:
            # Post-tool parse errors are non-fatal but logged
            logger.debug("post_tool response not JSON - assuming success")
            return {"ok": True, "logged": True}

    async def log_progress(self, message: str) -> bool:
        """Log progress entry.

        Per Case Study Section 7.2:
        - Logs to ai/progress.md
        - Should be called on significant actions (commands, task completion)

        Returns:
            True if logged successfully
        """
        if not self.session_id:
            return False

        result = await self.mcp_client.call_session_tool(
            action="log",
            session_id=self.session_id,
            message=message,
        )

        if not result.ok:
            logger.warning(f"log_progress failed: {result.error}")
            return False
        return True

    async def get_context(self) -> str:
        """Get current context block for system prompt injection.

        Per Case Study Section 3.5 (Tool Catalog):
        - k_session(action="context") returns formatted todo.md context
        - Should be called periodically to refresh context

        Returns:
            Context string for system prompt, or empty string on error
        """
        if not self.session_id:
            return self._context

        result = await self.mcp_client.call_session_tool(
            action="context",
            session_id=self.session_id,
        )

        if not result.ok:
            logger.warning(f"get_context failed: {result.error}")
            return self._context  # Return cached context

        try:
            data = json.loads(result.content)
            if data.get("ok"):
                self._context = data.get("context", "")
                return self._context
        except json.JSONDecodeError:
            # Raw text response
            self._context = result.content
            return self._context

        return self._context

    # =========================================================================
    # Status
    # =========================================================================

    def is_leader(self) -> bool:
        """Check if this agent is the leader."""
        return self.role == "leader"

    def is_worker(self) -> bool:
        """Check if this agent is a worker."""
        return self.role == "worker"

    def get_status(self) -> Dict[str, Any]:
        """Get current session status."""
        return {
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "role": self.role,
            "feature_id": self.feature_id,
            "running": self._running,
            "model": self.config.model,
            "lmstudio_url": self.config.lmstudio_url,
            "gateway_url": self.config.gateway_url,
            "mcp_url": self.config.mcp_url,
        }


__all__ = ["SessionManager", "SessionStartError", "SessionEndError"]
