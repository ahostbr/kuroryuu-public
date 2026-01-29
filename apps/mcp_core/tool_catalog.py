"""Tool Catalog - Metadata registry for MCP tool discovery.

Provides structured metadata for each Kuroryuu MCP tool to enable
intelligent tool matching based on natural language queries.

Used by k_MCPTOOLSEARCH for tool discovery and execution.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ToolMetadata:
    """Metadata for a single MCP tool."""
    name: str
    description: str
    keywords: List[str]
    actions: List[str]
    examples: List[str] = field(default_factory=list)
    category: str = "general"
    leader_only: bool = False

    def matches_query(self, query: str, threshold: float = 0.3) -> float:
        """Score how well this tool matches a query. Returns 0.0-1.0."""
        query_lower = query.lower()
        query_words = set(query_lower.split())

        score = 0.0

        # Direct name match (highest weight)
        if self.name.lower() in query_lower:
            score += 0.5

        # Keyword matching
        keyword_matches = sum(1 for kw in self.keywords if kw.lower() in query_lower)
        if self.keywords:
            score += 0.3 * (keyword_matches / len(self.keywords))

        # Description word overlap
        desc_words = set(self.description.lower().split())
        overlap = len(query_words & desc_words)
        if desc_words:
            score += 0.2 * (overlap / max(len(query_words), 1))

        return min(score, 1.0)


# ============================================================================
# Tool Catalog Registry
# ============================================================================

TOOL_CATALOG: Dict[str, ToolMetadata] = {}


def register_tool_metadata(
    name: str,
    description: str,
    keywords: List[str],
    actions: List[str],
    examples: Optional[List[str]] = None,
    category: str = "general",
    leader_only: bool = False,
) -> None:
    """Register metadata for a tool."""
    TOOL_CATALOG[name] = ToolMetadata(
        name=name,
        description=description,
        keywords=keywords,
        actions=actions,
        examples=examples or [],
        category=category,
        leader_only=leader_only,
    )


def get_tool_metadata(name: str) -> Optional[ToolMetadata]:
    """Get metadata for a tool by name."""
    return TOOL_CATALOG.get(name)


def search_tools(query: str, top_k: int = 3) -> List[Dict[str, Any]]:
    """Search for tools matching a query.

    Args:
        query: Natural language query describing what the user wants to do
        top_k: Maximum number of results to return

    Returns:
        List of matching tools with confidence scores
    """
    results = []

    for name, meta in TOOL_CATALOG.items():
        score = meta.matches_query(query)
        if score > 0.1:  # Minimum threshold
            results.append({
                "tool": name,
                "confidence": round(score, 3),
                "description": meta.description,
                "actions": meta.actions,
                "keywords": meta.keywords,
                "category": meta.category,
                "leader_only": meta.leader_only,
            })

    # Sort by confidence descending
    results.sort(key=lambda x: x["confidence"], reverse=True)
    return results[:top_k]


def list_all_tools() -> List[Dict[str, Any]]:
    """List all registered tools with their metadata."""
    return [
        {
            "tool": name,
            "description": meta.description,
            "actions": meta.actions,
            "keywords": meta.keywords[:5],  # Limit keywords for brevity
            "category": meta.category,
            "leader_only": meta.leader_only,
        }
        for name, meta in sorted(TOOL_CATALOG.items())
    ]


# ============================================================================
# Tool Catalog Data - Register all known tools
# ============================================================================

def _init_catalog() -> None:
    """Initialize the tool catalog with all Kuroryuu MCP tools."""

    # k_rag - Code search
    register_tool_metadata(
        name="k_rag",
        description="Search indexed codebase using keywords or patterns",
        keywords=[
            "search", "find", "code", "pattern", "grep", "query", "keyword",
            "lookup", "text", "content", "ripgrep", "regex", "match"
        ],
        actions=["help", "query", "status", "index", "query_semantic",
                 "query_hybrid", "query_reranked", "query_multi",
                 "query_reflective", "query_agentic", "query_interactive",
                 "index_semantic"],
        examples=[
            "k_rag(action='query', query='function definition')",
            "k_rag(action='status')",
            "k_rag(action='query', query='import.*React', top_k=10)",
        ],
        category="search",
    )

    # k_repo_intel - Repository intelligence
    register_tool_metadata(
        name="k_repo_intel",
        description="Structured repository analysis - symbols, routes, dependencies, components",
        keywords=[
            "symbol", "function", "class", "route", "dependency", "deps",
            "component", "hook", "api", "endpoint", "module", "import",
            "export", "structure", "architecture", "analysis"
        ],
        actions=["help", "status", "run", "get", "list"],
        examples=[
            "k_repo_intel(action='get', report='symbol_map')",
            "k_repo_intel(action='get', report='routes')",
            "k_repo_intel(action='get', report='dependencies')",
        ],
        category="analysis",
    )

    # k_files - File operations
    register_tool_metadata(
        name="k_files",
        description="File system operations - read, write, edit, list files",
        keywords=[
            "file", "files", "read", "write", "edit", "list", "directory",
            "folder", "path", "glob", "create", "modify", "content"
        ],
        actions=["help", "read", "write", "edit", "list"],
        examples=[
            "k_files(action='read', path='src/main.py')",
            "k_files(action='list', path='src/')",
            "k_files(action='edit', path='app.py', old_str='x', new_str='y')",
        ],
        category="files",
    )

    # k_checkpoint - Persistence
    register_tool_metadata(
        name="k_checkpoint",
        description="Save and restore session state and checkpoints",
        keywords=[
            "save", "load", "checkpoint", "persist", "state", "restore",
            "backup", "session", "snapshot", "recovery"
        ],
        actions=["help", "save", "list", "load"],
        examples=[
            "k_checkpoint(action='save', name='my-session', data={...})",
            "k_checkpoint(action='load', id='latest')",
            "k_checkpoint(action='list')",
        ],
        category="persistence",
    )

    # k_inbox - Message queue
    register_tool_metadata(
        name="k_inbox",
        description="Message queue for multi-agent communication",
        keywords=[
            "message", "inbox", "send", "receive", "queue", "agent",
            "communication", "task", "broadcast", "reply", "worker"
        ],
        actions=["help", "send", "list", "read", "claim", "complete",
                 "mark_read", "stats"],
        examples=[
            "k_inbox(action='send', to_agent='worker-1', subject='Task', body='...')",
            "k_inbox(action='list', folder='new')",
            "k_inbox(action='claim', id='msg_123')",
        ],
        category="messaging",
    )

    # k_session - Session lifecycle
    register_tool_metadata(
        name="k_session",
        description="Session and hook lifecycle management",
        keywords=[
            "session", "start", "end", "context", "hook", "lifecycle",
            "agent", "register", "log", "tool"
        ],
        actions=["help", "start", "end", "context", "pre_tool",
                 "post_tool", "log"],
        examples=[
            "k_session(action='start', agent_id='my-agent', cli_type='claude')",
            "k_session(action='context', session_id='...')",
            "k_session(action='end', session_id='...')",
        ],
        category="lifecycle",
    )

    # k_memory - Working memory
    register_tool_metadata(
        name="k_memory",
        description="Working memory state - goals, blockers, next steps",
        keywords=[
            "memory", "goal", "blocker", "step", "state", "working",
            "context", "remember", "track", "progress"
        ],
        actions=["help", "get", "set_goal", "add_blocker",
                 "clear_blockers", "set_steps", "reset"],
        examples=[
            "k_memory(action='set_goal', goal='Implement feature X')",
            "k_memory(action='add_blocker', blocker='Need API key')",
            "k_memory(action='get')",
        ],
        category="state",
    )

    # k_pty - Terminal/PTY control (LEADER-ONLY)
    register_tool_metadata(
        name="k_pty",
        description="PTY/terminal control - create, write, read terminals",
        keywords=[
            "terminal", "pty", "shell", "command", "bash", "powershell",
            "execute", "run", "console", "spawn"
        ],
        actions=["help", "list", "create", "write", "send_line",
                 "read", "talk", "term_read", "resize", "resolve",
                 "send_line_to_agent"],
        examples=[
            "k_pty(action='create', shell='powershell.exe')",
            "k_pty(action='send_line', session_id='...', data='ls')",
            "k_pty(action='term_read', session_id='...')",
        ],
        category="terminal",
        leader_only=True,
    )

    # k_thinker_channel - Thinker communication
    register_tool_metadata(
        name="k_thinker_channel",
        description="Thinker-to-thinker communication channel",
        keywords=[
            "thinker", "channel", "debate", "communication", "agent",
            "send", "read"
        ],
        actions=["help", "send_line", "read"],
        examples=[
            "k_thinker_channel(action='send_line', target_agent_id='thinker-2', data='...')",
            "k_thinker_channel(action='read', target_agent_id='thinker-2')",
        ],
        category="messaging",
    )

    # k_collective - Collective intelligence
    register_tool_metadata(
        name="k_collective",
        description="Collective intelligence - shared patterns and skills",
        keywords=[
            "collective", "pattern", "learn", "success", "failure",
            "skill", "knowledge", "share", "intelligence"
        ],
        actions=["help", "record_success", "record_failure",
                 "query_patterns", "get_skill_matrix", "update_skill"],
        examples=[
            "k_collective(action='record_success', task_type='search', approach='...')",
            "k_collective(action='query_patterns', query='file operations')",
        ],
        category="learning",
    )

    # k_capture - Screen capture
    register_tool_metadata(
        name="k_capture",
        description="Screen capture and visual digest management",
        keywords=[
            "screen", "capture", "screenshot", "record", "visual",
            "storyboard", "digest", "video"
        ],
        actions=["help", "start", "stop", "screenshot", "get_latest",
                 "get_storyboard", "get_status", "poll"],
        examples=[
            "k_capture(action='screenshot')",
            "k_capture(action='start', fps=1)",
            "k_capture(action='get_storyboard')",
        ],
        category="capture",
    )

    # k_graphiti_migrate - Graphiti migration
    register_tool_metadata(
        name="k_graphiti_migrate",
        description="Migrate checkpoints and worklogs to Graphiti knowledge graph",
        keywords=[
            "graphiti", "migrate", "knowledge", "graph", "checkpoint",
            "worklog", "import"
        ],
        actions=["help", "status", "dry_run", "migrate_checkpoints",
                 "migrate_worklogs", "migrate_all"],
        examples=[
            "k_graphiti_migrate(action='status')",
            "k_graphiti_migrate(action='dry_run')",
        ],
        category="migration",
    )

    # k_clawd - Clawdbot integration (opt-in autonomous worker)
    register_tool_metadata(
        name="k_clawd",
        description="Clawdbot integration - autonomous AI worker in Docker container (opt-in)",
        keywords=[
            "clawdbot", "clawd", "worker", "autonomous", "docker", "container",
            "delegate", "task", "research", "agent", "pi", "sandbox"
        ],
        actions=["help", "status", "start", "stop", "task", "cancel",
                 "results", "inbox", "reply", "history", "config"],
        examples=[
            "k_clawd(action='status')",
            "k_clawd(action='start')",
            "k_clawd(action='task', prompt='Research React hooks patterns')",
            "k_clawd(action='results')",
        ],
        category="integration",
    )

    # k_pccontrol - Desktop automation (OPT-IN, DANGEROUS)
    register_tool_metadata(
        name="k_pccontrol",
        description="Full Desktop Access - control Windows PC via PowerShell/Win32 APIs (OPT-IN)",
        keywords=[
            "desktop", "control", "automation", "click", "type", "keyboard",
            "mouse", "window", "win32", "powershell", "launch", "app"
        ],
        actions=["help", "status", "click", "doubleclick", "rightclick",
                 "type", "keypress", "launch_app", "get_windows"],
        examples=[
            "k_pccontrol(action='status')",
            "k_pccontrol(action='click', x=100, y=200)",
            "k_pccontrol(action='type', text='Hello')",
            "k_pccontrol(action='launch_app', path='notepad.exe')",
        ],
        category="automation",
        leader_only=True,
    )

    # k_help - Tool help system
    register_tool_metadata(
        name="k_help",
        description="Get help on Kuroryuu MCP tools - list all tools or get detailed help",
        keywords=[
            "help", "documentation", "docs", "tools", "list", "usage",
            "guide", "manual", "info", "reference"
        ],
        actions=[],  # No actions - just call with optional tool parameter
        examples=[
            "k_help()",
            "k_help(tool='k_rag')",
            "k_help(tool='k_inbox')",
        ],
        category="meta",
    )

    # k_MCPTOOLSEARCH - Tool discovery and execution
    register_tool_metadata(
        name="k_MCPTOOLSEARCH",
        description="Find and execute the right Kuroryuu MCP tool for your task",
        keywords=[
            "search", "find", "tool", "discover", "execute", "query",
            "match", "best", "which", "what"
        ],
        actions=["search", "help"],
        examples=[
            "k_MCPTOOLSEARCH(query='search code for function')",
            "k_MCPTOOLSEARCH(query='send message to agent', execute=False)",
            "k_MCPTOOLSEARCH(action='help')",
        ],
        category="meta",
    )


# Initialize catalog on module load
_init_catalog()
