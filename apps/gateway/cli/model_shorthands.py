"""Model Shorthand Resolution for CLI.

Maps convenient shorthand names to full model IDs.
Based on the 61 models available via CLIProxyAPI.
"""

from typing import Dict, Optional

# Shorthand -> Full model ID mapping
MODEL_SHORTHANDS: Dict[str, str] = {
    # ===== CLAUDE FAMILY =====
    "opus": "claude-opus-4-5-20251101",
    "opus4.5": "claude-opus-4-5-20251101",
    "opus4.1": "claude-opus-4-1-20250805",
    "opus4": "claude-opus-4-20250514",
    "sonnet": "claude-sonnet-4-5-20250929",
    "sonnet4.5": "claude-sonnet-4-5-20250929",
    "sonnet4": "claude-sonnet-4-20250514",
    "sonnet3.7": "claude-3-7-sonnet-20250219",
    "haiku": "claude-haiku-4-5-20251001",
    "haiku4.5": "claude-haiku-4-5-20251001",
    "haiku3.5": "claude-3-5-haiku-20241022",

    # ===== OPENAI/GPT FAMILY =====
    "gpt5": "gpt-5",
    "gpt-5": "gpt-5",
    "gpt5.1": "gpt-5.1",
    "gpt5.2": "gpt-5.2",
    "codex": "gpt-5-codex",
    "codex5": "gpt-5-codex",
    "codex5.1": "gpt-5.1-codex",
    "codex-max": "gpt-5.1-codex-max",
    "codex-mini": "gpt-5.1-codex-mini",

    # ===== GEMINI FAMILY =====
    "gemini": "gemini-2.5-pro",
    "gemini-pro": "gemini-2.5-pro",
    "gemini2.5": "gemini-2.5-pro",
    "flash": "gemini-2.5-flash",
    "gemini-flash": "gemini-2.5-flash",
    "flash-lite": "gemini-2.5-flash-lite",
    "gemini3": "gemini-3-pro-preview",
    "gemini3-flash": "gemini-3-flash-preview",

    # ===== GITHUB COPILOT =====
    "copilot": "gpt-4o",  # Default copilot model
    "gpt4o": "gpt-4o",
    "gpt-4o": "gpt-4o",
    "gpt4.1": "gpt-4.1",
    "grok": "grok-code-fast-1",
    "raptor": "oswe-vscode-prime",

    # ===== KIRO/AWS =====
    "kiro": "kiro-auto",
    "kiro-auto": "kiro-auto",
    "kiro-opus": "kiro-claude-opus-4-5",
    "kiro-sonnet": "kiro-claude-sonnet-4-5",
    "kiro-haiku": "kiro-claude-haiku-4-5",
    "kiro-agentic": "kiro-claude-sonnet-4-5-agentic",

    # ===== ANTIGRAVITY =====
    "antigravity": "gemini-claude-sonnet-4-5",
    "thinking": "gemini-claude-sonnet-4-5-thinking",
    "thinking-opus": "gemini-claude-opus-4-5-thinking",
    "gpt-oss": "gpt-oss-120b-medium",
}


# Provider info for model families
TOOL_SUPPORTED_PROVIDERS = {"claude", "openai", "gemini", "github-copilot"}
NO_TOOL_PROVIDERS = {"kiro", "antigravity", "qwen", "deepseek"}


def resolve_model(model: str) -> str:
    """Resolve shorthand to full model ID.

    Args:
        model: Shorthand name or full model ID

    Returns:
        Full model ID
    """
    # Check shorthand first (case-insensitive)
    resolved = MODEL_SHORTHANDS.get(model.lower())
    if resolved:
        return resolved
    # If not a shorthand, return as-is (assume it's a full model ID)
    return model


def get_model_family(model_id: str) -> str:
    """Detect model family from model ID.

    Returns: 'claude', 'openai', 'gemini', 'copilot', 'kiro', 'antigravity', or 'other'
    """
    model = model_id.lower()

    # Kiro models (AWS CodeWhisperer)
    if model.startswith("kiro-"):
        return "kiro"

    # Antigravity models (gemini-claude hybrids, thinking models, etc.)
    if model.startswith("gemini-claude-") or "antigravity" in model:
        return "antigravity"
    if model in ("tab_flash_lite_preview", "gpt-oss-120b-medium"):
        return "antigravity"

    # Direct Claude models
    if "claude" in model and not model.startswith("gemini-claude-"):
        return "claude"

    # Direct Gemini models
    if model.startswith("gemini-") and not model.startswith("gemini-claude-"):
        return "gemini"

    # OpenAI models (GPT, o1, o3 series)
    if "gpt" in model or model.startswith("o1") or model.startswith("o3"):
        return "openai"

    # GitHub Copilot special models
    if "copilot" in model or model in ("grok-code-fast-1", "oswe-vscode-prime"):
        return "copilot"

    # Qwen models
    if "qwen" in model:
        return "qwen"

    # DeepSeek models
    if "deepseek" in model:
        return "deepseek"

    return "other"


def model_supports_tools(model_id: str) -> bool:
    """Check if model supports native tool calling.

    Tool support matrix:
    - Claude: ALL models support tools
    - OpenAI GPT-4/GPT-5: Support tools
    - OpenAI o1: NO tools (reasoning only)
    - Gemini: ALL models support tools
    - Copilot: Supports tools (function calling)
    - Kiro: NO tools (CodeWhisperer - code completion only)
    - Antigravity: NO tools (proxied models)
    """
    family = get_model_family(model_id)
    model = model_id.lower()

    if family == "claude":
        return True
    if family == "openai":
        # o1 models don't support tools
        if model.startswith("o1-") or model == "o1":
            return False
        return True
    if family == "gemini":
        return True
    if family == "copilot":
        return True
    if family in ("kiro", "antigravity", "qwen", "deepseek"):
        return False

    return False


def list_shorthands() -> Dict[str, str]:
    """Return all available shorthands with their full model IDs."""
    return MODEL_SHORTHANDS.copy()
