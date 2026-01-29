"""MCP Package - Client for MCP_CORE server."""

from .client import MCPClient, get_mcp_client, MCP_URL

__all__ = [
    "MCPClient",
    "get_mcp_client",
    "MCP_URL",
]
