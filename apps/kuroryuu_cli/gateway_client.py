"""Gateway API client for agent registration and orchestration."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import httpx

from .config import Config


class GatewayClient:
    """HTTP client for Kuroryuu Gateway agent and orchestration APIs."""

    def __init__(self, config: Config):
        self.config = config
        self.gateway_url = config.gateway_url
        self.agent_id: Optional[str] = None
        self.role: Optional[str] = None
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self._client = httpx.AsyncClient(timeout=30.0)
        return self

    async def __aexit__(self, *args):
        if self._client:
            await self._client.aclose()

    def _ensure_client(self):
        """Ensure HTTP client is available."""
        if self._client is None:
            raise RuntimeError("GatewayClient not initialized. Use 'async with' or call connect().")

    async def connect(self):
        """Initialize HTTP client (alternative to context manager)."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)

    async def disconnect(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    # =========================================================================
    # Agent Registration
    # =========================================================================

    async def register(
        self,
        role: str = "auto",
        capabilities: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Register agent with Gateway.

        Args:
            role: "leader", "worker", or "auto" (auto-detect based on leader slot)
            capabilities: List of agent capabilities

        Returns:
            Registration response with agent_id and assigned role
        """
        self._ensure_client()

        # Generate agent ID
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.agent_id = (
            self.config.agent_name
            or f"kuroryuu_cli_{timestamp}_{uuid.uuid4().hex[:8]}"
        )

        # Build capabilities
        if capabilities is None:
            capabilities = ["local_llm", "chat", "tools"]

        # Determine role
        if role == "auto":
            # Check if leader slot is available
            leader_info = await self.get_leader()
            role = "leader" if leader_info is None else "worker"

        payload = {
            "agent_id": self.agent_id,
            "model_name": f"local/{self.config.model}",
            "role": role,
            "capabilities": capabilities,
        }

        resp = await self._client.post(
            f"{self.gateway_url}/v1/agents/register",
            json=payload,
        )
        resp.raise_for_status()

        data = resp.json()
        self.role = data.get("role", role)
        return data

    async def deregister(self) -> bool:
        """Deregister agent from Gateway."""
        if not self.agent_id:
            return False

        self._ensure_client()

        try:
            resp = await self._client.post(
                f"{self.gateway_url}/v1/agents/{self.agent_id}/deregister"
            )
            return resp.status_code == 200
        except Exception:
            return False

    async def heartbeat(
        self,
        status: str = "idle",
        current_task_id: Optional[str] = None,
    ) -> bool:
        """Send heartbeat to Gateway.

        Args:
            status: "idle" or "busy"
            current_task_id: Currently executing task ID

        Returns:
            True if heartbeat succeeded
        """
        if not self.agent_id:
            return False

        self._ensure_client()

        try:
            resp = await self._client.post(
                f"{self.gateway_url}/v1/agents/{self.agent_id}/heartbeat",
                json={
                    "status": status,
                    "current_task_id": current_task_id,
                },
            )
            return resp.status_code == 200
        except Exception:
            return False

    async def get_leader(self) -> Optional[Dict[str, Any]]:
        """Get current leader agent info.

        Returns:
            Leader info dict or None if no leader
        """
        self._ensure_client()

        try:
            resp = await self._client.get(f"{self.gateway_url}/v1/agents/leader")
            if resp.status_code == 200:
                data = resp.json()
                if data and data.get("agent_id"):
                    return data
        except Exception:
            pass
        return None

    async def list_agents(self) -> List[Dict[str, Any]]:
        """List all registered agents."""
        self._ensure_client()

        try:
            resp = await self._client.get(f"{self.gateway_url}/v1/agents/list")
            resp.raise_for_status()
            return resp.json().get("agents", [])
        except Exception:
            return []

    # =========================================================================
    # Task Management (DEPRECATED METHODS REMOVED)
    # =========================================================================
    # NOTE: The following methods have been REMOVED:
    # - create_task(), breakdown_task(), get_task()
    # - poll_for_work(), claim_subtask(), start_work()
    # - report_result(), release_subtask()
    #
    # Tasks are now managed via ai/todo.md.
    # Workers receive tasks via k_inbox from leader.
    # Use formulas to add tasks to todo.md.

    async def cancel_task(self, task_id: str, reason: str = "") -> Dict[str, Any]:
        """Cancel a task and all its subtasks."""
        self._ensure_client()

        resp = await self._client.post(
            f"{self.gateway_url}/v1/orchestration/cancel",
            json={
                "leader_id": self.agent_id or "system",
                "task_id": task_id,
                "reason": reason,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def finalize_task(
        self,
        task_id: str,
        final_result: str = "",
    ) -> Dict[str, Any]:
        """Finalize a completed task (leader only)."""
        self._ensure_client()

        resp = await self._client.post(
            f"{self.gateway_url}/v1/orchestration/finalize",
            json={
                "leader_id": self.agent_id or "system",
                "task_id": task_id,
                "final_result": final_result,
            },
        )
        resp.raise_for_status()
        return resp.json()

    # =========================================================================
    # Health Check
    # =========================================================================

    async def health_check(self) -> Dict[str, Any]:
        """Check Gateway health."""
        self._ensure_client()

        try:
            resp = await self._client.get(
                f"{self.gateway_url}/v1/health",
                timeout=5.0,
            )
            resp.raise_for_status()
            return {"ok": True, "url": self.gateway_url, **resp.json()}
        except Exception as e:
            return {"ok": False, "url": self.gateway_url, "error": str(e)}


__all__ = ["GatewayClient"]
