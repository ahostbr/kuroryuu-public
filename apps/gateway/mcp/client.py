"""MCP Client - JSON-RPC 2.0 HTTP client for MCP_CORE.

Provides:
- tools/list with caching (TTL-based)
- tools/call execution
- Error handling with ToolResult conversion
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, List, Optional

import httpx

from ..agent.tool_schema import ToolResult, ToolSchema
from ..config import config

# Config - MCP_URL from centralized config (no longer duplicated)
MCP_URL = config.mcp_url
TOOLS_CACHE_TTL = 30  # seconds
MCP_TOOL_TIMEOUT = float(os.environ.get("KURORYUU_MCP_TOOL_TIMEOUT", "20"))
MCP_HEALTH_TIMEOUT = float(os.environ.get("KURORYUU_MCP_HEALTH_TIMEOUT", "5"))


class MCPClient:
    """HTTP client for MCP_CORE server."""
    
    def __init__(self, base_url: str = MCP_URL):
        self.base_url = base_url.rstrip("/")
        self._tools_cache: Optional[List[ToolSchema]] = None
        self._tools_cache_time: float = 0
        self._session_initialized: bool = False
    
    async def _ensure_initialized(self, client: httpx.AsyncClient) -> None:
        """Ensure MCP session is initialized."""
        if self._session_initialized:
            return
        
        resp = await client.post(
            f"{self.base_url}/mcp",
            json={
                "jsonrpc": "2.0",
                "id": "init",
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "kuroryuu-gateway", "version": "1.0"},
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
            if now - self._tools_cache_time < TOOLS_CACHE_TTL:
                return self._tools_cache
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            await self._ensure_initialized(client)
            
            resp = await client.post(
                f"{self.base_url}/mcp",
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
        """Execute a tool and return normalized ToolResult."""
        try:
            async with httpx.AsyncClient(timeout=MCP_TOOL_TIMEOUT) as client:
                await self._ensure_initialized(client)
                
                resp = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "jsonrpc": "2.0",
                        "id": f"call-{name}",
                        "method": "tools/call",
                        "params": {
                            "name": name,
                            "arguments": arguments,
                        },
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                
                if "error" in data:
                    return ToolResult(
                        id="",  # Will be set by caller
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
                    id="",  # Will be set by caller
                    name=name,
                    ok=True,
                    content=content_str,
                    error=None,
                )
        
        except httpx.HTTPStatusError as e:
            return ToolResult(
                id="",
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
                id="",
                name=name,
                ok=False,
                content="",
                error={
                    "code": -1,
                    "message": f"Cannot connect to MCP server at {self.base_url}",
                },
            )
        
        except Exception as e:
            return ToolResult(
                id="",
                name=name,
                ok=False,
                content="",
                error={
                    "code": -1,
                    "message": str(e),
                },
            )
    
    async def health_check(self) -> Dict[str, Any]:
        """Check MCP server health."""
        try:
            async with httpx.AsyncClient(timeout=MCP_HEALTH_TIMEOUT) as client:
                resp = await client.get(f"{self.base_url}/health")
                resp.raise_for_status()
                return {"ok": True, "url": self.base_url, **resp.json()}
        except Exception as e:
            return {"ok": False, "url": self.base_url, "error": str(e)}


# Global singleton
_client: Optional[MCPClient] = None


def get_mcp_client() -> MCPClient:
    """Get or create global MCP client."""
    global _client
    if _client is None:
        _client = MCPClient()
    return _client


__all__ = [
    "MCPClient",
    "get_mcp_client",
    "MCP_URL",
]
