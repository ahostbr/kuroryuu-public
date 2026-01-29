"""MCP Protocol layer - JSON-RPC 2.0 tool registry and dispatcher.

Implements the MCP protocol subset expected by the AG-UI gateway:
- initialize (session handshake)
- tools/list (enumerate available tools)
- tools/call (execute a tool)
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

try:
    from .task_notifier import check_pending_task, build_notification_block
except ImportError:
    from task_notifier import check_pending_task, build_notification_block

# Protocol version matching gateway expectations
MCP_PROTOCOL_VERSION = "2024-11-05"


@dataclass
class ToolDefinition:
    """Tool metadata for tools/list response."""
    name: str
    description: str
    input_schema: Dict[str, Any]


@dataclass
class ToolRegistry:
    """Registry of available tools."""
    _tools: Dict[str, ToolDefinition] = field(default_factory=dict)
    _handlers: Dict[str, Callable[..., Dict[str, Any]]] = field(default_factory=dict)

    def register(
        self,
        name: str,
        description: str,
        input_schema: Dict[str, Any],
        handler: Callable[..., Dict[str, Any]],
    ) -> None:
        """Register a tool with its handler."""
        self._tools[name] = ToolDefinition(name=name, description=description, input_schema=input_schema)
        self._handlers[name] = handler

    def list_tools(self, client_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Return tool definitions for tools/list response.

        Args:
            client_type: Ignored (visibility filtering removed).
        """
        return [
            {
                "name": t.name,
                "description": t.description,
                "inputSchema": t.input_schema,
            }
            for t in self._tools.values()
        ]

    def get_handler(self, name: str) -> Optional[Callable[..., Dict[str, Any]]]:
        """Get handler for a tool by name."""
        return self._handlers.get(name)

    def has_tool(self, name: str) -> bool:
        """Check if tool exists."""
        return name in self._tools


class MCPSession:
    """Represents an MCP session."""
    def __init__(self, session_id: Optional[str] = None):
        self.session_id = session_id or f"session_{uuid.uuid4().hex}"
        self.initialized = False


class MCPProtocol:
    """MCP JSON-RPC 2.0 protocol handler."""

    def __init__(self, registry: ToolRegistry):
        self.registry = registry
        self.sessions: Dict[str, MCPSession] = {}

    def _error_response(self, req_id: Any, code: int, message: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Build JSON-RPC error response."""
        err: Dict[str, Any] = {"code": code, "message": message}
        if data:
            err["data"] = data
        return {"jsonrpc": "2.0", "id": req_id, "error": err}

    def _success_response(self, req_id: Any, result: Any) -> Dict[str, Any]:
        """Build JSON-RPC success response."""
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    def get_or_create_session(self, session_id: Optional[str] = None) -> MCPSession:
        """Get existing session or create new one.

        Args:
            session_id: Optional existing session ID
        """
        if session_id and session_id in self.sessions:
            return self.sessions[session_id]
        session = MCPSession(session_id)
        self.sessions[session.session_id] = session
        return session

    def handle_request(
        self,
        request: Dict[str, Any],
        session_id: Optional[str] = None,
        client_context: Optional[Dict[str, Any]] = None,
    ) -> tuple[Dict[str, Any], str]:
        """Handle a JSON-RPC request and return (response, session_id).

        Args:
            request: JSON-RPC request dict
            session_id: Optional existing session ID
            client_context: Optional context with headers, user_agent for client detection
        """
        req_id = request.get("id")
        method = request.get("method", "")
        params = request.get("params", {})
        client_context = client_context or {}

        # Validate JSON-RPC structure
        if request.get("jsonrpc") != "2.0":
            return self._error_response(req_id, -32600, "Invalid Request: missing jsonrpc 2.0"), session_id or ""

        session = self.get_or_create_session(session_id)

        if method == "initialize":
            return self._handle_initialize(req_id, params, session), session.session_id

        # Auto-initialize session if not already done (stateless mode)
        if not session.initialized:
            session.initialized = True

        if method == "tools/list":
            return self._handle_tools_list(req_id, params, session), session.session_id

        if method == "tools/call":
            return self._handle_tools_call(req_id, params, session), session.session_id

        return self._error_response(req_id, -32601, f"Method not found: {method}"), session.session_id

    def _handle_initialize(self, req_id: Any, params: Dict[str, Any], session: MCPSession) -> Dict[str, Any]:
        """Handle initialize method."""
        session.initialized = True
        return self._success_response(req_id, {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {
                "tools": {"listChanged": False},
            },
            "serverInfo": {
                "name": "kuroryuu_mcp_core",
                "version": "0.2.0",
            },
        })

    def _handle_tools_list(self, req_id: Any, params: Dict[str, Any], session: MCPSession) -> Dict[str, Any]:
        """Handle tools/list method."""
        tools = self.registry.list_tools()
        return self._success_response(req_id, {"tools": tools})

    def _handle_tools_call(self, req_id: Any, params: Dict[str, Any], session: MCPSession) -> Dict[str, Any]:
        """Handle tools/call method."""
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})

        if not tool_name:
            return self._error_response(req_id, -32602, "Invalid params: missing tool name")

        handler = self.registry.get_handler(tool_name)
        if not handler:
            return self._error_response(req_id, -32602, f"Unknown tool: {tool_name}")

        try:
            result = handler(**arguments)

            # Check for pending task notification and inject if present
            result_text = str(result) if not isinstance(result, dict) else json.dumps(result)
            if session.session_id:
                pending = check_pending_task(session.session_id)
                if pending:
                    notification = build_notification_block(pending)
                    result_text = notification + result_text

            # Wrap result in content array per MCP spec
            return self._success_response(req_id, {
                "content": [{"type": "text", "text": result_text}],
                "isError": not result.get("ok", True) if isinstance(result, dict) else False,
            })
        except Exception as e:
            return self._error_response(req_id, -32000, f"Tool execution failed: {e}", {"tool": tool_name})
