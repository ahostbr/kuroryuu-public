"""MCP client wrapper for tool execution.

Implements patterns from Docs/CaseStudies/ClaudeCode_Integration_Analysis.md:
- Routed tools pattern with action parameter validation
- JSON-RPC 2.0 protocol over HTTP
- Proper error handling with structured responses
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set

import httpx

from .config import Config

logger = logging.getLogger(__name__)

# Valid actions synced with MCP_CORE tool_catalog.py (2026-01-22)
K_SESSION_ACTIONS: Set[str] = {
    "help", "start", "end", "context", "pre_tool", "post_tool", "log"
}
K_FILES_ACTIONS: Set[str] = {"help", "read", "write", "edit", "list"}
K_MEMORY_ACTIONS: Set[str] = {
    "help", "get", "set_goal", "add_blocker", "clear_blockers", "set_steps", "reset"
}
K_INBOX_ACTIONS: Set[str] = {
    "help", "send", "list", "read", "claim", "complete", "mark_read", "stats"
}
K_CHECKPOINT_ACTIONS: Set[str] = {"help", "save", "list", "load"}
K_RAG_ACTIONS: Set[str] = {
    "help", "query", "status", "index", "query_semantic", "query_hybrid",
    "query_reranked", "query_multi", "query_reflective", "query_agentic",
    "query_interactive", "index_semantic"
}
K_INTERACT_ACTIONS: Set[str] = {"help", "ask", "approve", "plan", "screenshot"}

# Additional tool action sets
K_PTY_ACTIONS: Set[str] = {
    "help", "list", "create", "write", "send_line", "read", "talk",
    "term_read", "resize", "resolve", "send_line_to_agent"
}
K_COLLECTIVE_ACTIONS: Set[str] = {
    "help", "record_success", "record_failure", "query_patterns",
    "get_skill_matrix", "update_skill"
}
K_THINKER_CHANNEL_ACTIONS: Set[str] = {"help", "send_line", "read"}
K_REPO_INTEL_ACTIONS: Set[str] = {"help", "status", "run", "get", "list"}
K_CAPTURE_ACTIONS: Set[str] = {
    "help", "start", "stop", "screenshot", "get_latest",
    "get_storyboard", "get_status", "poll"
}
K_GRAPHITI_MIGRATE_ACTIONS: Set[str] = {
    "help", "status", "dry_run", "migrate_checkpoints",
    "migrate_worklogs", "migrate_all"
}

# Import subagent schema functions (deferred to avoid circular import)
def _get_spawn_subagent_schema() -> Dict[str, Any]:
    """Get spawn_subagent schema (deferred import)."""
    from .subagent import get_spawn_subagent_schema
    return get_spawn_subagent_schema()


def _get_spawn_parallel_subagents_schema() -> Dict[str, Any]:
    """Get spawn_parallel_subagents schema (deferred import)."""
    from .subagent import get_spawn_parallel_subagents_schema
    return get_spawn_parallel_subagents_schema()


# Local tools (not routed to MCP) - handled by agent_core directly
LOCAL_TOOLS: Dict[str, Dict[str, Any]] = {
    "spawn_subagent": None,  # Schema loaded dynamically via _get_spawn_subagent_schema()
    "spawn_parallel_subagents": None,  # Schema loaded dynamically via _get_spawn_parallel_subagents_schema()
    "ask_user_question": {
        "type": "function",
        "function": {
            "name": "ask_user_question",
            "description": "Ask the user a question. Pauses execution until user responds. Use for clarification, approval, or gathering input.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The question to ask the user"
                    },
                    "options": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "label": {"type": "string"},
                                "description": {"type": "string"}
                            },
                            "required": ["label"]
                        },
                        "description": "Multiple choice options (optional)"
                    },
                    "input_type": {
                        "type": "string",
                        "enum": ["text", "choice", "confirm"],
                        "default": "text",
                        "description": "Type of input: text (free form), choice (pick from options), confirm (yes/no)"
                    },
                    "reason": {
                        "type": "string",
                        "enum": ["clarification", "human_approval", "plan_review"],
                        "default": "clarification",
                        "description": "Why you need this input"
                    }
                },
                "required": ["question"]
            }
        }
    }
}

# Map tool names to valid actions (synced with MCP_CORE 2026-01-24)
ROUTED_TOOL_ACTIONS: Dict[str, Set[str]] = {
    "k_session": K_SESSION_ACTIONS,
    "k_files": K_FILES_ACTIONS,
    "k_memory": K_MEMORY_ACTIONS,
    "k_inbox": K_INBOX_ACTIONS,
    "k_checkpoint": K_CHECKPOINT_ACTIONS,
    "k_rag": K_RAG_ACTIONS,
    "k_interact": K_INTERACT_ACTIONS,
    "k_pty": K_PTY_ACTIONS,
    "k_collective": K_COLLECTIVE_ACTIONS,
    "k_thinker_channel": K_THINKER_CHANNEL_ACTIONS,
    "k_repo_intel": K_REPO_INTEL_ACTIONS,
    "k_capture": K_CAPTURE_ACTIONS,
    "k_graphiti_migrate": K_GRAPHITI_MIGRATE_ACTIONS,
}


@dataclass
class ToolSchema:
    """Tool definition from MCP server."""
    name: str
    description: str
    input_schema: Dict[str, Any]


@dataclass
class ToolResult:
    """Result from tool execution."""
    name: str
    ok: bool
    content: str
    error: Optional[Dict[str, Any]] = None


class MCPClientWrapper:
    """Wrapper around MCP server for tool execution."""

    # Cache settings
    TOOLS_CACHE_TTL = 30  # seconds
    TOOL_TIMEOUT = 20.0  # seconds
    HEALTH_TIMEOUT = 5.0  # seconds

    def __init__(self, config: Config):
        self.config = config
        self.mcp_url = config.mcp_url
        self._client: Optional[httpx.AsyncClient] = None
        self._tools_cache: Optional[List[ToolSchema]] = None
        self._tools_cache_time: float = 0
        self._session_initialized: bool = False

    async def __aenter__(self):
        self._client = httpx.AsyncClient(timeout=30.0)
        return self

    async def __aexit__(self, *args):
        if self._client:
            await self._client.aclose()

    def _ensure_client(self):
        """Ensure HTTP client is available."""
        if self._client is None:
            raise RuntimeError("MCPClientWrapper not initialized. Use 'async with' or call connect().")

    async def connect(self):
        """Initialize HTTP client (alternative to context manager)."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)

    async def disconnect(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _ensure_initialized(self) -> None:
        """Ensure MCP session is initialized."""
        if self._session_initialized:
            return

        self._ensure_client()

        resp = await self._client.post(
            f"{self.mcp_url}/mcp",
            json={
                "jsonrpc": "2.0",
                "id": "init",
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "kuroryuu-cli", "version": "1.0"},
                },
            },
        )
        resp.raise_for_status()
        self._session_initialized = True

    async def list_tools(self, force_refresh: bool = False) -> List[ToolSchema]:
        """Get available tools from MCP server.

        Uses cache with TTL to avoid repeated calls.
        """
        now = time.time()

        if not force_refresh and self._tools_cache is not None:
            if now - self._tools_cache_time < self.TOOLS_CACHE_TTL:
                return self._tools_cache

        self._ensure_client()
        await self._ensure_initialized()

        resp = await self._client.post(
            f"{self.mcp_url}/mcp",
            json={
                "jsonrpc": "2.0",
                "id": "list-tools",
                "method": "tools/list",
                "params": {},
            },
        )
        resp.raise_for_status()
        data = resp.json()

        if "error" in data:
            raise Exception(data["error"].get("message", "MCP error"))

        raw_tools = data.get("result", {}).get("tools", [])

        # Convert to ToolSchema
        self._tools_cache = [
            ToolSchema(
                name=t.get("name", ""),
                description=t.get("description", ""),
                input_schema=t.get("inputSchema", {}),
            )
            for t in raw_tools
        ]
        self._tools_cache_time = now

        return self._tools_cache

    async def call_tool(self, name: str, arguments: Dict[str, Any]) -> ToolResult:
        """Execute a tool and return result."""
        self._ensure_client()

        # Inject project_root for k_files calls so files are relative to CLI's cwd
        if name == "k_files" and "root" not in arguments:
            arguments = {**arguments, "root": str(self.config.project_root)}

        try:
            await self._ensure_initialized()

            resp = await self._client.post(
                f"{self.mcp_url}/mcp",
                json={
                    "jsonrpc": "2.0",
                    "id": f"call-{name}",
                    "method": "tools/call",
                    "params": {
                        "name": name,
                        "arguments": arguments,
                    },
                },
                timeout=self.TOOL_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()

            if "error" in data:
                return ToolResult(
                    name=name,
                    ok=False,
                    content="",
                    error={
                        "code": data["error"].get("code", -1),
                        "message": data["error"].get("message", "Unknown error"),
                    },
                )

            result = data.get("result", {})
            content = result.get("content", [])

            # Extract text from content blocks
            texts = []
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "text":
                        texts.append(block.get("text", ""))
                    elif block.get("type") == "json":
                        texts.append(json.dumps(block.get("json", {})))
                elif isinstance(block, str):
                    texts.append(block)

            content_str = "\n".join(texts) if texts else json.dumps(result)

            return ToolResult(
                name=name,
                ok=True,
                content=content_str,
                error=None,
            )

        except httpx.HTTPStatusError as e:
            return ToolResult(
                name=name,
                ok=False,
                content="",
                error={
                    "code": e.response.status_code,
                    "message": f"HTTP {e.response.status_code}: {e.response.text[:200]}",
                },
            )

        except httpx.ConnectError:
            return ToolResult(
                name=name,
                ok=False,
                content="",
                error={
                    "code": -1,
                    "message": f"Cannot connect to MCP server at {self.mcp_url}",
                },
            )

        except Exception as e:
            return ToolResult(
                name=name,
                ok=False,
                content="",
                error={
                    "code": -1,
                    "message": str(e),
                },
            )

    async def call_session_tool(
        self,
        action: str,
        **kwargs,
    ) -> ToolResult:
        """Convenience method for k_session tool calls.

        Per Case Study Section 8.2 (Routed Tools Pattern):
        - All Kuroryuu tools use an `action` parameter for routing
        - Action is validated against known handlers

        Args:
            action: One of "start", "end", "pre_tool", "post_tool", "log", "context"
            **kwargs: Additional arguments passed to k_session
        """
        # Validate action (Case Study Section 10.1: fail early on invalid actions)
        if action not in K_SESSION_ACTIONS:
            logger.error(f"Invalid k_session action: {action}")
            return ToolResult(
                name="k_session",
                ok=False,
                content="",
                error={
                    "code": -32602,
                    "message": f"Invalid action '{action}'. Valid: {', '.join(sorted(K_SESSION_ACTIONS))}",
                },
            )

        arguments = {"action": action, **kwargs}
        return await self.call_tool("k_session", arguments)

    def validate_routed_tool_action(self, tool_name: str, arguments: Dict[str, Any]) -> Optional[str]:
        """Validate action parameter for routed tools.

        Permissive validation - logs warnings but allows unknown actions through.
        MCP_CORE is the source of truth for validation.

        Args:
            tool_name: Name of the tool
            arguments: Arguments dict (should contain 'action')

        Returns:
            Error message if invalid, None if valid (permissive for unknown actions)
        """
        if tool_name not in ROUTED_TOOL_ACTIONS:
            return None  # Unknown tool, let MCP_CORE handle it

        valid_actions = ROUTED_TOOL_ACTIONS[tool_name]
        action = arguments.get("action")

        if not action:
            return f"Missing required 'action' parameter for {tool_name}"

        if action not in valid_actions:
            # Warn but allow - MCP_CORE will do final validation
            logger.warning(f"Unknown action '{action}' for {tool_name}, passing to MCP_CORE")
            return None  # Permissive: allow unknown actions

        return None

    async def call_interact_tool(
        self,
        action: str,
        question: str = "",
        reason: str = "",
        options: Optional[List[str]] = None,
        input_type: str = "text",
        risk_level: str = "medium",
        rollback_plan: str = "",
        title: str = "",
        steps: Optional[List[Dict[str, Any]]] = None,
        **kwargs,
    ) -> ToolResult:
        """Convenience method for k_interact tool calls.

        Per Case Study Section 6.2 (Leader-Worker Architecture):
        - k_interact is LEADER-ONLY
        - Actions: ask_user, request_approval, present_plan

        Args:
            action: One of "ask_user", "request_approval", "present_plan"
            question: Question to ask user (for ask_user)
            reason: Why you need this information (for ask_user)
            options: Multiple choice options (for ask_user)
            input_type: Type of input expected (for ask_user): text, choice, confirm
            risk_level: Risk level (for request_approval): low, medium, high, critical
            rollback_plan: How to undo if something goes wrong (for request_approval)
            title: Plan title (for present_plan)
            steps: List of planned steps (for present_plan)
            **kwargs: Additional arguments
        """
        # Validate action
        if action not in K_INTERACT_ACTIONS:
            logger.error(f"Invalid k_interact action: {action}")
            return ToolResult(
                name="k_interact",
                ok=False,
                content="",
                error={
                    "code": -32602,
                    "message": f"Invalid action '{action}'. Valid: {', '.join(sorted(K_INTERACT_ACTIONS))}",
                },
            )

        arguments: Dict[str, Any] = {"action": action}

        if action == "ask_user":
            arguments["question"] = question
            if reason:
                arguments["reason"] = reason
            if options:
                arguments["options"] = options
            if input_type:
                arguments["input_type"] = input_type

        elif action == "request_approval":
            arguments["action_desc"] = question  # Reuse question param for action description
            if risk_level:
                arguments["risk_level"] = risk_level
            if rollback_plan:
                arguments["rollback_plan"] = rollback_plan

        elif action == "present_plan":
            arguments["title"] = title or question
            if steps:
                arguments["steps"] = steps

        arguments.update(kwargs)

        return await self.call_tool("k_interact", arguments)

    async def health_check(self) -> Dict[str, Any]:
        """Check MCP server health."""
        self._ensure_client()

        try:
            resp = await self._client.get(
                f"{self.mcp_url}/health",
                timeout=self.HEALTH_TIMEOUT,
            )
            resp.raise_for_status()
            return {"ok": True, "url": self.mcp_url, **resp.json()}
        except Exception as e:
            return {"ok": False, "url": self.mcp_url, "error": str(e)}

    def get_tool_schemas_for_llm(self) -> List[Dict[str, Any]]:
        """Get tool schemas in OpenAI-compatible format for LLM.

        Includes both MCP tools and local tools (like ask_user_question).
        """
        schemas = []

        # Add MCP tools
        if self._tools_cache:
            schemas.extend([
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.input_schema,
                    },
                }
                for tool in self._tools_cache
            ])

        # Add local tools (not routed to MCP)
        for name, schema in LOCAL_TOOLS.items():
            if schema is None:
                # Dynamic schemas (subagent tools)
                if name == "spawn_subagent":
                    schemas.append(_get_spawn_subagent_schema())
                elif name == "spawn_parallel_subagents":
                    schemas.append(_get_spawn_parallel_subagents_schema())
            else:
                schemas.append(schema)

        return schemas

    def is_local_tool(self, name: str) -> bool:
        """Check if tool is handled locally (not via MCP).

        Local tools like ask_user_question are handled by agent_core
        directly, without routing to the MCP server.
        """
        return name in LOCAL_TOOLS


__all__ = [
    "MCPClientWrapper",
    "ToolSchema",
    "ToolResult",
    "K_SESSION_ACTIONS",
    "K_INTERACT_ACTIONS",
    "ROUTED_TOOL_ACTIONS",
    "LOCAL_TOOLS",
]
