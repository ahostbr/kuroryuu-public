"""
Kuroryuu CLI Commands Module

Provider-agnostic command system for the Kuroryuu CLI agent.
Commands work identically across all LLM providers.
"""

from .registry import Command, CommandRegistry
from .preprocessor import (
    preprocess_input,
    format_file_context,
    FILE_REGEX,
    SHELL_REGEX,
)
from .session import SessionManager
from .compact import (
    compact_history,
    estimate_token_count,
    format_usage_stats,
    should_compact,
    COMPACT_PROMPT,
)

__all__ = [
    "Command",
    "CommandRegistry",
    "preprocess_input",
    "format_file_context",
    "FILE_REGEX",
    "SHELL_REGEX",
    "SessionManager",
    "compact_history",
    "estimate_token_count",
    "format_usage_stats",
    "should_compact",
    "COMPACT_PROMPT",
]
