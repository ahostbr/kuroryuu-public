"""OpenAI Prompt Builder - Function calling format.

Implements prompt building for OpenAI models (GPT-4, etc.) with native
function calling support.

Reference: https://platform.openai.com/docs/guides/function-calling
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from .base import PromptBuilder, PromptContext, ToolDefinition


class OpenAIPromptBuilder(PromptBuilder):
    """Builds prompts for OpenAI with function calling support.
    
    Key features:
    - Functions passed as API parameter
    - OpenAI function schema format
    - Minimal system prompt
    - JSON function call results
    """
    
    @property
    def provider_name(self) -> str:
        return "openai"
    
    @property
    def uses_xml_tools(self) -> bool:
        return False  # OpenAI uses native function calling
    
    def build_system_prompt(
        self,
        tools: List[ToolDefinition],
        context: PromptContext,
    ) -> str:
        """Build system prompt for OpenAI.
        
        Tools are passed via the API, not in the system prompt.
        """
        sections = [
            self._build_identity_section(context),
            self._build_context_section(context),
            self._build_guidelines_section(),
        ]
        
        return "\n\n".join(s for s in sections if s)
    
    def render_tools(
        self,
        tools: List[ToolDefinition],
        context: PromptContext,
    ) -> List[Dict[str, Any]]:
        """Render tools as OpenAI function definitions.
        
        Returns list of function schemas for the API tools parameter.
        """
        return [
            self._render_function_schema(tool, context)
            for tool in tools
        ]
    
    def render_tool_result(
        self,
        tool_name: str,
        result: Any,
        is_error: bool = False,
    ) -> str:
        """Render function result as JSON string.
        
        OpenAI expects function results as string content.
        """
        if isinstance(result, dict):
            if is_error:
                result["_error"] = True
            return json.dumps(result)
        elif isinstance(result, list):
            return json.dumps(result)
        else:
            if is_error:
                return json.dumps({"error": str(result)})
            return str(result)
    
    # ═══════════════════════════════════════════════════════════════════════════
    # Section Builders
    # ═══════════════════════════════════════════════════════════════════════════
    
    def _build_identity_section(self, context: PromptContext) -> str:
        """Build identity section."""
        return """You are Kuroryuu, an expert autonomous coding agent.

You have access to functions that let you interact with files, run commands, and search code. Use them systematically to accomplish tasks."""
    
    def _build_context_section(self, context: PromptContext) -> str:
        """Build context section."""
        parts = []
        
        if context.cwd:
            parts.append(f"Working Directory: {context.cwd}")
        
        if context.workspace_name:
            parts.append(f"Workspace: {context.workspace_name}")
        
        if not parts:
            return ""
        
        return "## Context\n\n" + "\n".join(parts)
    
    def _build_guidelines_section(self) -> str:
        """Build guidelines section."""
        return """## Guidelines

1. Use functions to gather information before making changes
2. Work incrementally - one step at a time
3. Verify changes after making them
4. Communicate clearly about progress and issues
5. Follow existing code patterns and conventions"""
    
    # ═══════════════════════════════════════════════════════════════════════════
    # Tool Rendering
    # ═══════════════════════════════════════════════════════════════════════════
    
    def _render_function_schema(
        self,
        tool: ToolDefinition,
        context: PromptContext,
    ) -> Dict[str, Any]:
        """Render tool as OpenAI function definition."""
        description = tool.description
        
        # Replace context placeholders
        if context.cwd:
            description = description.replace("{{CWD}}", context.cwd)
        
        return {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": description,
                "parameters": self._normalize_parameters(tool.parameters),
            },
        }
    
    def _normalize_parameters(self, schema: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize parameters for OpenAI function calling."""
        # OpenAI requires strict parameter schema format
        normalized = {
            "type": "object",
            "properties": schema.get("properties", {}),
            "required": schema.get("required", []),
            "additionalProperties": False,
        }
        
        return normalized
