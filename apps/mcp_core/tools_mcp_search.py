"""MCP Search tools - Discovery and execution entry point for external LLMs.

Provides:
- k_MCPTOOLSEARCH: Find and execute the right MCP tool based on natural language
- k_help: Get help on available tools

This is the primary entry point for external LLMs that don't have full
knowledge of all Kuroryuu MCP tools.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

try:
    from .tool_catalog import search_tools, list_all_tools, get_tool_metadata
except ImportError:
    from tool_catalog import search_tools, list_all_tools, get_tool_metadata

# Import all tool handlers for execution mode
try:
    from .tools_rag import k_rag
    from .tools_repo_intel import k_repo_intel
    from .tools_files import k_files
    from .tools_checkpoint import k_checkpoint
    from .tools_inbox import k_inbox
    from .tools_hooks import k_session
    from .tools_working_memory import k_memory
    from .tools_pty import k_pty
    from .tools_thinker_channel import k_thinker_channel
    from .tools_collective import k_collective
    from .tools_capture import k_capture
    from .tools_graphiti_migrate import k_graphiti_migrate
except ImportError:
    from tools_rag import k_rag
    from tools_repo_intel import k_repo_intel
    from tools_files import k_files
    from tools_checkpoint import k_checkpoint
    from tools_inbox import k_inbox
    from tools_hooks import k_session
    from tools_working_memory import k_memory
    from tools_pty import k_pty
    from tools_thinker_channel import k_thinker_channel
    from tools_collective import k_collective
    from tools_capture import k_capture
    from tools_graphiti_migrate import k_graphiti_migrate


# ============================================================================
# Tool Dispatch Registry
# ============================================================================

# Map tool names to their handler functions
TOOL_HANDLERS: Dict[str, Callable[..., Dict[str, Any]]] = {
    "k_rag": k_rag,
    "k_repo_intel": k_repo_intel,
    "k_files": k_files,
    "k_checkpoint": k_checkpoint,
    "k_inbox": k_inbox,
    "k_session": k_session,
    "k_memory": k_memory,
    "k_pty": k_pty,
    "k_thinker_channel": k_thinker_channel,
    "k_collective": k_collective,
    "k_capture": k_capture,
    "k_graphiti_migrate": k_graphiti_migrate,
}


# ============================================================================
# k_MCPTOOLSEARCH Implementation
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """Show help for k_MCPTOOLSEARCH."""
    return {
        "ok": True,
        "data": {
            "tool": "k_MCPTOOLSEARCH",
            "description": "Find and execute the right Kuroryuu MCP tool for your task",
            "usage": {
                "discovery_mode": "k_MCPTOOLSEARCH(query='...', execute=False) → returns matching tools",
                "execute_mode": "k_MCPTOOLSEARCH(query='...', params={...}) → finds and runs best tool",
            },
            "parameters": {
                "query": "Natural language description of what you want to do (required)",
                "execute": "If True (default), run the best matching tool. If False, return matches only.",
                "params": "Parameters to pass when executing (dict)",
                "top_k": "Number of tool matches to return in discovery mode (default: 3)",
            },
            "examples": [
                "k_MCPTOOLSEARCH(query='search for function definitions')",
                "k_MCPTOOLSEARCH(query='find TypeScript files', params={'path': 'src/'})",
                "k_MCPTOOLSEARCH(query='check repository symbols', execute=False)",
                "k_MCPTOOLSEARCH(query='save a checkpoint', params={'name': 'my-session', 'data': {...}})",
            ],
        },
        "error": None,
    }


def _action_search(
    query: str,
    execute: bool = True,
    params: Optional[Dict[str, Any]] = None,
    top_k: int = 3,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Search for and optionally execute a tool."""
    if not query:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "query is required",
        }

    # Search for matching tools
    matches = search_tools(query, top_k=top_k)

    if not matches:
        return {
            "ok": False,
            "error_code": "NO_MATCH",
            "message": f"No tools found matching: {query}",
            "suggestion": "Try different keywords or use k_help() to see all available tools",
        }

    # Discovery mode - return matches without executing
    if not execute:
        return {
            "ok": True,
            "mode": "discovery",
            "query": query,
            "matches": matches,
            "suggestion": f"Best match: {matches[0]['tool']} - {matches[0]['description']}",
        }

    # Execute mode - run the best matching tool
    best_match = matches[0]
    tool_name = best_match["tool"]

    # Check if tool exists in our dispatch registry
    handler = TOOL_HANDLERS.get(tool_name)
    if not handler:
        return {
            "ok": False,
            "error_code": "HANDLER_NOT_FOUND",
            "message": f"Handler not found for tool: {tool_name}",
            "matches": matches,
        }

    # Execute the tool with provided params
    try:
        tool_params = params or {}
        result = handler(**tool_params)

        return {
            "ok": True,
            "mode": "execute",
            "query": query,
            "tool_used": tool_name,
            "confidence": best_match["confidence"],
            "params_used": tool_params,
            "result": result,
        }
    except Exception as e:
        return {
            "ok": False,
            "error_code": "EXECUTION_FAILED",
            "message": f"Failed to execute {tool_name}: {str(e)}",
            "tool_used": tool_name,
            "params_used": params,
        }


# Action handlers map
ACTION_HANDLERS = {
    "help": _action_help,
    "search": _action_search,
}


def k_MCPTOOLSEARCH(
    query: str = "",
    action: str = "search",
    execute: bool = True,
    params: Optional[Dict[str, Any]] = None,
    top_k: int = 3,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Find and execute the right Kuroryuu MCP tool for your task.

    This is the primary entry point for external LLMs to discover and use
    Kuroryuu MCP tools without needing to know all available tools.

    Usage:
    1. Execute mode (default): Find and run the best matching tool
       k_MCPTOOLSEARCH(query="search for code", params={"query": "function"})

    2. Discovery mode: Just find matching tools without executing
       k_MCPTOOLSEARCH(query="search for code", execute=False)

    Args:
        query: Natural language description of what you want to do
        action: "search" (default) or "help"
        execute: If True, run the best matching tool. If False, just return matches.
        params: Parameters to pass when executing the found tool
        top_k: Number of tool matches to return in discovery mode

    Returns:
        In discovery mode: List of matching tools with confidence scores
        In execute mode: Result from the executed tool

    Examples:
        - "search for function definitions" → k_rag
        - "find TypeScript files" → k_files
        - "check function symbols" → k_repo_intel
        - "save checkpoint" → k_checkpoint
        - "send message to worker" → k_inbox
    """
    act = (action or "search").strip().lower()

    if act == "help":
        return _action_help(**kwargs)

    # Default to search action
    return _action_search(
        query=query,
        execute=execute,
        params=params,
        top_k=top_k,
        **kwargs,
    )


# ============================================================================
# k_help Implementation
# ============================================================================

def k_help(
    tool: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Get help on Kuroryuu MCP tools.

    Args:
        tool: Optional tool name for detailed help. If empty, lists all tools.

    Returns:
        Tool help information

    Examples:
        k_help() → Overview of all tools
        k_help(tool="k_rag") → Detailed help for k_rag
    """
    if not tool:
        # Return overview of all tools
        all_tools = list_all_tools()

        # Group by category
        by_category: Dict[str, List[Dict[str, Any]]] = {}
        for t in all_tools:
            cat = t.get("category", "general")
            if cat not in by_category:
                by_category[cat] = []
            by_category[cat].append({
                "tool": t["tool"],
                "description": t["description"],
                "actions": t["actions"],
            })

        return {
            "ok": True,
            "tools_count": len(all_tools),
            "categories": by_category,
            "usage": "Use k_help(tool='k_rag') for detailed help on a specific tool",
            "tip": "Use k_MCPTOOLSEARCH(query='...') to find the right tool for your task",
        }

    # Get help for specific tool
    tool_name = tool.lower().strip()

    # Check if tool has help action
    handler = TOOL_HANDLERS.get(tool_name)
    if handler:
        try:
            # Call the tool's help action
            result = handler(action="help")
            return {
                "ok": True,
                "tool": tool_name,
                "help": result,
            }
        except Exception as e:
            pass  # Fall through to metadata

    # Get metadata from catalog
    meta = get_tool_metadata(tool_name)
    if meta:
        return {
            "ok": True,
            "tool": tool_name,
            "description": meta.description,
            "actions": meta.actions,
            "keywords": meta.keywords,
            "examples": meta.examples,
            "category": meta.category,
            "leader_only": meta.leader_only,
        }

    return {
        "ok": False,
        "error_code": "NOT_FOUND",
        "message": f"Tool not found: {tool}",
        "available_tools": list(TOOL_HANDLERS.keys()),
    }


# ============================================================================
# Tool Registration
# ============================================================================

def register_mcp_search_tools(registry: "ToolRegistry") -> None:
    """Register k_MCPTOOLSEARCH and k_help tools with the registry."""

    # k_MCPTOOLSEARCH - Discovery and execution
    registry.register(
        name="k_MCPTOOLSEARCH",
        description="Find and execute the right Kuroryuu MCP tool for your task. "
                    "Use query to describe what you want, params to pass arguments. "
                    "Default: executes best match. Set execute=False for discovery only.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language description of what you want to do",
                },
                "action": {
                    "type": "string",
                    "enum": ["search", "help"],
                    "default": "search",
                    "description": "Action: 'search' (default) or 'help'",
                },
                "execute": {
                    "type": "boolean",
                    "default": True,
                    "description": "If True (default), run the best matching tool. "
                                   "If False, return matches only.",
                },
                "params": {
                    "type": "object",
                    "description": "Parameters to pass when executing the found tool",
                },
                "top_k": {
                    "type": "integer",
                    "default": 3,
                    "description": "Number of tool matches to return in discovery mode",
                },
            },
            "required": [],
        },
        handler=k_MCPTOOLSEARCH,
    )

    # k_help - Meta help tool
    registry.register(
        name="k_help",
        description="Get help on Kuroryuu MCP tools. "
                    "Call without arguments to list all tools, "
                    "or with tool='name' for detailed help.",
        input_schema={
            "type": "object",
            "properties": {
                "tool": {
                    "type": "string",
                    "description": "Optional tool name for detailed help (e.g., 'k_rag', 'k_inbox')",
                },
            },
            "required": [],
        },
        handler=k_help,
    )
