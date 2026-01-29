"""Anthropic Prompt Builder - Native tool calling format.

Implements prompt building for Claude models with native tool support.
Claude uses JSON Schema tool definitions passed via the API, not embedded
in the system prompt.

Reference: https://docs.anthropic.com/claude/docs/tool-use
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from .base import PromptBuilder, PromptContext, ToolDefinition


class AnthropicPromptBuilder(PromptBuilder):
    """Builds prompts for Claude with native tool calling support.
    
    Key features:
    - Tools passed as API parameter (not in system prompt)
    - Minimal system prompt (Claude handles tools natively)
    - JSON Schema tool definitions
    - Structured tool results
    """
    
    @property
    def provider_name(self) -> str:
        return "anthropic"
    
    @property
    def uses_xml_tools(self) -> bool:
        return False  # Claude uses native tool calling API
    
    def build_system_prompt(
        self,
        tools: List[ToolDefinition],
        context: PromptContext,
    ) -> str:
        """Build system prompt for Claude.
        
        Note: Tools are NOT embedded in the prompt - they're passed
        via the API. The system prompt is minimal.
        """
        sections = [
            self._build_identity_section(context),
            self._build_context_section(context),
            self._build_workflow_section(),
        ]
        
        return "\n\n".join(s for s in sections if s)
    
    def render_tools(
        self,
        tools: List[ToolDefinition],
        context: PromptContext,
    ) -> List[Dict[str, Any]]:
        """Render tools as Anthropic tool definitions.
        
        Returns list of tool schemas for the API, NOT for the prompt.
        """
        return [
            self._render_tool_schema(tool, context)
            for tool in tools
        ]
    
    def render_tool_result(
        self,
        tool_name: str,
        result: Any,
        is_error: bool = False,
    ) -> Dict[str, Any]:
        """Render tool result in Claude format.
        
        Returns structured dict for the tool_result content block.
        """
        if isinstance(result, dict):
            content = json.dumps(result)
        elif isinstance(result, list):
            content = json.dumps(result)
        else:
            content = str(result)
        
        return {
            "type": "tool_result",
            "tool_use_id": "",  # Set by caller
            "content": content,
            "is_error": is_error,
        }
    
    # ═══════════════════════════════════════════════════════════════════════════
    # Section Builders
    # ═══════════════════════════════════════════════════════════════════════════
    
    def _build_identity_section(self, context: PromptContext) -> str:
        """Build minimal identity section."""
        return """You are Kuroryuu, an autonomous coding agent with expert knowledge across programming languages, frameworks, and best practices.

You have access to tools that let you interact with the filesystem, run commands, and search code. Use them thoughtfully to accomplish tasks efficiently."""
    
    def _build_context_section(self, context: PromptContext) -> str:
        """Build context section with workspace info."""
        parts = []
        
        if context.cwd:
            parts.append(f"Working Directory: {context.cwd}")
        
        if context.workspace_name:
            parts.append(f"Workspace: {context.workspace_name}")
        
        if context.model_id:
            parts.append(f"Model: {context.model_id}")
        
        if not parts:
            return ""
        
        return "# Context\n\n" + "\n".join(parts)
    
    def _build_workflow_section(self) -> str:
        """Build workflow guidance."""
        return """# Workflow

1. **Understand**: Analyze the request carefully
2. **Plan**: Break complex tasks into manageable steps
3. **Gather**: Read relevant files and understand context
4. **Execute**: Make changes incrementally
5. **Verify**: Test and validate your changes
6. **Report**: Summarize what was accomplished

Use tools step-by-step, waiting for results before proceeding."""
    
    # ═══════════════════════════════════════════════════════════════════════════
    # Tool Rendering
    # ═══════════════════════════════════════════════════════════════════════════
    
    def _render_tool_schema(
        self,
        tool: ToolDefinition,
        context: PromptContext,
    ) -> Dict[str, Any]:
        """Render tool as Anthropic tool definition.

        For routed tools, enhance description with available actions.
        """
        description = tool.description

        # Replace context placeholders
        if context.cwd:
            description = description.replace("{{CWD}}", context.cwd)

        # Enhance description for routed tools
        if tool.is_routed_tool():
            actions = tool.get_routed_actions()
            if actions:
                action_list = ", ".join(actions)
                description = f"{description}\n\nAvailable actions: {action_list}. Use the 'action' parameter to specify which action to perform."

        return {
            "name": tool.name,
            "description": description,
            "input_schema": self._normalize_schema(tool.parameters),
        }
    
    def _normalize_schema(self, schema: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize JSON Schema for Anthropic API."""
        # Ensure top-level type
        normalized = {
            "type": schema.get("type", "object"),
        }
        
        if "properties" in schema:
            normalized["properties"] = schema["properties"]
        
        if "required" in schema:
            normalized["required"] = schema["required"]
        
        return normalized
