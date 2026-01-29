"""Provider-specific prompt system for Kuroryuu Gateway.

This module implements provider-specific prompt formatting following Cline's
proven XML tool format for LM Studio and native tool schemas for other providers.

Key Concepts:
- PromptBuilder: Base class for building system prompts
- ToolRenderer: Provider-specific tool rendering (XML vs JSON Schema)
- PromptRegistry: Central registry of prompt builders per provider

Usage:
    from apps.gateway.prompts import get_prompt_builder

    builder = get_prompt_builder("lmstudio")
    system_prompt = builder.build_system_prompt(tools=mcp_tools, context=ctx)
"""

from .registry import (
    PromptRegistry,
    get_prompt_builder,
    list_providers,
)
from .base import (
    PromptBuilder,
    PromptContext,
    ToolDefinition,
)
from .lmstudio import LMStudioPromptBuilder
from .anthropic import AnthropicPromptBuilder
from .openai import OpenAIPromptBuilder
from .devstral import DevstralPromptBuilder

__all__ = [
    "PromptRegistry",
    "get_prompt_builder",
    "list_providers",
    "PromptBuilder",
    "PromptContext",
    "ToolDefinition",
    "LMStudioPromptBuilder",
    "AnthropicPromptBuilder",
    "OpenAIPromptBuilder",
    "DevstralPromptBuilder",
]
