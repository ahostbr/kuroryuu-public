"""Base classes for provider-specific prompt building.

Provides the abstract PromptBuilder class and shared data structures.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class ToolDefinition:
    """Normalized tool definition from MCP or built-in tools.
    
    This is the input format - each provider's PromptBuilder will
    render this into their specific format (XML, JSON Schema, etc.)
    """
    name: str
    description: str
    parameters: Dict[str, Any]  # JSON Schema format
    
    @classmethod
    def from_mcp(cls, mcp_tool: Dict[str, Any]) -> "ToolDefinition":
        """Create from MCP tool response format."""
        return cls(
            name=mcp_tool.get("name", "unknown"),
            description=mcp_tool.get("description", ""),
            parameters=mcp_tool.get("inputSchema", {}),
        )
    
    def get_required_params(self) -> List[str]:
        """Get list of required parameter names."""
        return self.parameters.get("required", [])
    
    def get_param_schema(self, param_name: str) -> Dict[str, Any]:
        """Get schema for a specific parameter."""
        props = self.parameters.get("properties", {})
        return props.get(param_name, {})

    def is_routed_tool(self) -> bool:
        """Check if this is a routed tool (has action parameter with enum)."""
        props = self.parameters.get("properties", {})
        action_schema = props.get("action", {})
        return "enum" in action_schema and action_schema.get("type") == "string"

    def get_routed_actions(self) -> List[str]:
        """Get list of available actions for a routed tool."""
        if not self.is_routed_tool():
            return []
        props = self.parameters.get("properties", {})
        action_schema = props.get("action", {})
        return action_schema.get("enum", [])

    def get_action_description(self, action: str) -> str:
        """Get description for a specific action (if documented).

        Looks for pattern like 'Read a file. Parameters: ...' in tool description.
        This is a heuristic for documented routed tools.
        """
        # This is a simple heuristic - real documentation could be richer
        # For now, we'll rely on the action enum being in the tool description
        return ""


@dataclass
class PromptContext:
    """Context passed to prompt builders for customization.
    
    Provider-agnostic context that any prompt builder can use.
    """
    # Workspace info
    cwd: str = ""
    workspace_name: str = ""
    
    # Model info
    model_id: str = ""
    model_family: str = ""
    
    # Session info
    session_id: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    # Capabilities
    supports_images: bool = False
    supports_tools: bool = True
    supports_streaming: bool = True
    
    # UI state
    is_plan_mode: bool = False
    auto_approve: bool = False
    
    # Custom data for extensions
    extra: Dict[str, Any] = field(default_factory=dict)


class PromptBuilder(ABC):
    """Abstract base class for provider-specific prompt builders.
    
    Each provider (LM Studio, Claude, OpenAI) has different optimal formats
    for system prompts and tool definitions. This class provides the interface
    for building provider-specific prompts.
    
    Key Methods:
    - build_system_prompt(): Generate the full system prompt
    - render_tools(): Format tools for the provider
    - build_tool_result(): Format a tool result for the conversation
    """
    
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Provider identifier (e.g., 'lmstudio', 'anthropic', 'openai')."""
        ...
    
    @property
    @abstractmethod
    def uses_xml_tools(self) -> bool:
        """Whether this provider uses XML tool format in prompts.
        
        True = tools embedded as XML in system prompt (LM Studio)
        False = tools passed as native API parameter (Claude, GPT)
        """
        ...
    
    @abstractmethod
    def build_system_prompt(
        self,
        tools: List[ToolDefinition],
        context: PromptContext,
    ) -> str:
        """Build the complete system prompt for this provider.
        
        Args:
            tools: List of available tools to include
            context: Contextual information for the prompt
            
        Returns:
            Complete system prompt string
        """
        ...
    
    @abstractmethod
    def render_tools(
        self,
        tools: List[ToolDefinition],
        context: PromptContext,
    ) -> Any:
        """Render tools in provider-specific format.
        
        For XML providers: Returns string to embed in system prompt
        For native providers: Returns list of tool schemas for API
        
        Args:
            tools: List of tools to render
            context: Contextual information
            
        Returns:
            Provider-specific tool representation
        """
        ...
    
    @abstractmethod
    def render_tool_result(
        self,
        tool_name: str,
        result: Any,
        is_error: bool = False,
    ) -> str:
        """Render a tool execution result for the conversation.
        
        Args:
            tool_name: Name of the tool that was executed
            result: Result data (dict, string, or error)
            is_error: Whether this is an error result
            
        Returns:
            Formatted result string for the conversation
        """
        ...
    
    # ═══════════════════════════════════════════════════════════════════════════
    # Common Helper Methods
    # ═══════════════════════════════════════════════════════════════════════════
    
    def _format_datetime(self, dt: Optional[datetime] = None) -> str:
        """Format datetime for prompts."""
        dt = dt or datetime.now()
        return dt.strftime("%Y-%m-%d %H:%M")
    
    def _escape_xml(self, text: str) -> str:
        """Escape XML special characters."""
        return (
            text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;")
        )
    
    def _json_schema_to_description(self, schema: Dict[str, Any]) -> str:
        """Convert JSON Schema to human-readable description."""
        parts = []
        
        if "type" in schema:
            parts.append(f"Type: {schema['type']}")
        
        if "description" in schema:
            parts.append(schema["description"])
        
        if "enum" in schema:
            parts.append(f"Allowed values: {', '.join(str(v) for v in schema['enum'])}")
        
        if "default" in schema:
            parts.append(f"Default: {schema['default']}")
        
        return " | ".join(parts) if parts else ""
