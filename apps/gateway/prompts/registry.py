"""Prompt Registry - Central registry for provider-specific prompt builders.

Usage:
    from apps.gateway.prompts import get_prompt_builder
    
    builder = get_prompt_builder("lmstudio")
    prompt = builder.build_system_prompt(tools, context)
"""

from __future__ import annotations

from typing import Dict, List, Optional, Type

from .base import PromptBuilder


class PromptRegistry:
    """Registry of prompt builders by provider name.
    
    Singleton pattern - use get_instance() or the module-level functions.
    """
    
    _instance: Optional["PromptRegistry"] = None
    _builders: Dict[str, Type[PromptBuilder]] = {}
    
    def __new__(cls) -> "PromptRegistry":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._builders = {}
        return cls._instance
    
    @classmethod
    def get_instance(cls) -> "PromptRegistry":
        """Get the singleton registry instance."""
        return cls()
    
    def register(self, provider: str, builder_class: Type[PromptBuilder]) -> None:
        """Register a prompt builder for a provider.
        
        Args:
            provider: Provider name (e.g., 'lmstudio')
            builder_class: PromptBuilder subclass
        """
        self._builders[provider.lower()] = builder_class
    
    def get(self, provider: str) -> Optional[PromptBuilder]:
        """Get a prompt builder instance for a provider.
        
        Args:
            provider: Provider name
            
        Returns:
            PromptBuilder instance or None if not found
        """
        builder_class = self._builders.get(provider.lower())
        if builder_class:
            return builder_class()
        return None
    
    def list_providers(self) -> List[str]:
        """List all registered provider names."""
        return list(self._builders.keys())
    
    def has_provider(self, provider: str) -> bool:
        """Check if a provider is registered."""
        return provider.lower() in self._builders


# ═══════════════════════════════════════════════════════════════════════════════
# Auto-registration on import
# ═══════════════════════════════════════════════════════════════════════════════

def _register_default_builders() -> None:
    """Register all built-in prompt builders."""
    from .lmstudio import LMStudioPromptBuilder
    from .anthropic import AnthropicPromptBuilder
    from .openai import OpenAIPromptBuilder
    
    registry = PromptRegistry.get_instance()
    
    # LM Studio (XML tools)
    registry.register("lmstudio", LMStudioPromptBuilder)
    registry.register("lm_studio", LMStudioPromptBuilder)  # alias
    registry.register("local", LMStudioPromptBuilder)  # alias
    
    # Anthropic (native tools)
    registry.register("anthropic", AnthropicPromptBuilder)
    registry.register("claude", AnthropicPromptBuilder)  # alias
    
    # OpenAI (function calling)
    registry.register("openai", OpenAIPromptBuilder)
    registry.register("gpt", OpenAIPromptBuilder)  # alias
    registry.register("gpt-4", OpenAIPromptBuilder)  # alias


# Register on module import
_register_default_builders()


# ═══════════════════════════════════════════════════════════════════════════════
# Module-level convenience functions
# ═══════════════════════════════════════════════════════════════════════════════

def get_prompt_builder(provider: str) -> PromptBuilder:
    """Get a prompt builder for the specified provider.
    
    Args:
        provider: Provider name ('lmstudio', 'anthropic', 'openai', etc.)
        
    Returns:
        PromptBuilder instance
        
    Raises:
        ValueError: If provider is not registered
    """
    registry = PromptRegistry.get_instance()
    builder = registry.get(provider)
    
    if builder is None:
        available = ", ".join(registry.list_providers())
        raise ValueError(
            f"Unknown prompt provider: {provider}. "
            f"Available providers: {available}"
        )
    
    return builder


def list_providers() -> List[str]:
    """List all registered prompt providers."""
    return PromptRegistry.get_instance().list_providers()


def register_prompt_builder(provider: str, builder_class: Type[PromptBuilder]) -> None:
    """Register a custom prompt builder.
    
    Args:
        provider: Provider name
        builder_class: PromptBuilder subclass
    """
    PromptRegistry.get_instance().register(provider, builder_class)
