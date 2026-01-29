"""Devstral Prompt Builder - Optimized for Mistral's Devstral model.

Devstral uses:
- [INST][/INST] instruction tags
- Native OpenAI-compatible tool_calls
- [TOOL_CALLS] and [TOOL_RESULTS] tokens
- Minimal system prompt for efficiency
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from .base import PromptBuilder, PromptContext, ToolDefinition


class DevstralPromptBuilder(PromptBuilder):
    """Builds prompts optimized for Devstral model.

    Always uses native tool calling - never falls back to XML mode.
    Loads tool schemas from the centralized JSON schema file.
    """

    @property
    def provider_name(self) -> str:
        return "devstral"

    @property
    def uses_xml_tools(self) -> bool:
        return False  # Devstral always uses native tool calling

    def build_system_prompt(
        self,
        tools: List[ToolDefinition],
        context: PromptContext,
    ) -> str:
        """Build minimal system prompt for native tool calling.

        Devstral works best with concise prompts when using native tools.
        Tool documentation is provided via the API, not in the prompt.
        """
        cwd = context.cwd or "."

        # Minimal ~100 token prompt
        return f"""You are Kuroryuu, an autonomous coding agent using routed MCP tools.

Working directory: {cwd}

Each tool uses an 'action' parameter to route to specific operations:
- k_files: read, write, list files
- k_memory: get/set goals, blockers, steps
- k_rag: search code with keywords
- k_inbox: send/receive messages
- k_checkpoint: save/load state
- k_session: lifecycle management
- k_capture: screen capture

Use tools step-by-step. Verify changes after making them."""

    def render_tools(
        self,
        tools: List[ToolDefinition],
        context: PromptContext,
    ) -> List[Dict[str, Any]]:
        """Render tools in OpenAI-compatible format.

        Returns list of tool definitions for API payload.
        """
        if not tools:
            return []

        # Convert ToolDefinitions to OpenAI format
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                },
            }
            for tool in tools
        ]

    def render_tool_result(
        self,
        tool_name: str,
        result: Any,
        is_error: bool = False,
    ) -> str:
        """Render tool result for conversation.

        For Devstral, tool results are handled by the API layer,
        but this method provides a fallback string format.
        """
        if isinstance(result, dict):
            result_str = json.dumps(result, indent=2, ensure_ascii=False)
        elif isinstance(result, list):
            result_str = json.dumps(result, indent=2, ensure_ascii=False)
        else:
            result_str = str(result)

        if is_error:
            return f"[TOOL_ERROR] {tool_name}: {result_str}"

        return result_str

    @staticmethod
    def load_schema_tools() -> List[Dict[str, Any]]:
        """Load tools from the centralized JSON schema.

        Returns tools in OpenAI-compatible format ready for API payload.
        """
        try:
            from apps.gateway.llm.schemas import get_devstral_tools
            return get_devstral_tools()
        except ImportError:
            return []


__all__ = ["DevstralPromptBuilder"]
