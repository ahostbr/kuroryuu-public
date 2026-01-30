"""Model Shorthand Resolution for CLI.

Maps convenient shorthand names to full model IDs.
Static model list matching apps/desktop/src/renderer/services/model-registry.ts
"""

from typing import Dict, List, Optional, TypedDict


class ModelInfo(TypedDict, total=False):
    """Model information matching TypeScript ModelInfo."""
    id: str
    name: str
    source: str  # Provider source: claude, openai, gemini, github-copilot, kiro, antigravity
    context_window: int
    supports_tools: bool


# ============================================================================
# STATIC MODEL LIST - Canonical source matching model-registry.ts
# ============================================================================

STATIC_MODELS: List[ModelInfo] = [
    # ===== ANTIGRAVITY (10) - NO TOOLS =====
    {"id": "gemini-claude-sonnet-4-5-thinking", "name": "Claude Sonnet 4.5 (Thinking)", "source": "antigravity", "context_window": 200000, "supports_tools": False},
    {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "source": "antigravity", "context_window": 1000000, "supports_tools": False},
    {"id": "gemini-3-flash-preview", "name": "Gemini 3 Flash", "source": "antigravity", "context_window": 1000000, "supports_tools": False},
    {"id": "gemini-3-pro-image-preview", "name": "Gemini 3 Pro Image", "source": "antigravity", "context_window": 1000000, "supports_tools": False},
    {"id": "gemini-claude-opus-4-5-thinking", "name": "Claude Opus 4.5 (Thinking)", "source": "antigravity", "context_window": 200000, "supports_tools": False},
    {"id": "tab_flash_lite_preview", "name": "Tab Flash Lite Preview", "source": "antigravity", "context_window": 1000000, "supports_tools": False},
    {"id": "gpt-oss-120b-medium", "name": "GPT-OSS 120B (Medium)", "source": "antigravity", "context_window": 128000, "supports_tools": False},
    {"id": "gemini-claude-sonnet-4-5", "name": "Claude Sonnet 4.5", "source": "antigravity", "context_window": 200000, "supports_tools": False},
    {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash Lite", "source": "antigravity", "context_window": 1000000, "supports_tools": False},
    {"id": "gemini-3-pro-preview", "name": "Gemini 3 Pro (High)", "source": "antigravity", "context_window": 1000000, "supports_tools": False},

    # ===== CLAUDE (8) =====
    {"id": "claude-haiku-4-5-20251001", "name": "Claude 4.5 Haiku", "source": "claude", "context_window": 200000, "supports_tools": True},
    {"id": "claude-sonnet-4-5-20250929", "name": "Claude 4.5 Sonnet", "source": "claude", "context_window": 200000, "supports_tools": True},
    {"id": "claude-opus-4-5-20251101", "name": "Claude 4.5 Opus", "source": "claude", "context_window": 200000, "supports_tools": True},
    {"id": "claude-opus-4-1-20250805", "name": "Claude 4.1 Opus", "source": "claude", "context_window": 200000, "supports_tools": True},
    {"id": "claude-opus-4-20250514", "name": "Claude 4 Opus", "source": "claude", "context_window": 200000, "supports_tools": True},
    {"id": "claude-sonnet-4-20250514", "name": "Claude 4 Sonnet", "source": "claude", "context_window": 200000, "supports_tools": True},
    {"id": "claude-3-7-sonnet-20250219", "name": "Claude 3.7 Sonnet", "source": "claude", "context_window": 200000, "supports_tools": True},
    {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku", "source": "claude", "context_window": 200000, "supports_tools": True},

    # ===== OPENAI (9) =====
    {"id": "gpt-5", "name": "GPT 5", "source": "openai", "context_window": 128000, "supports_tools": True},
    {"id": "gpt-5-codex", "name": "GPT 5 Codex", "source": "openai", "context_window": 200000, "supports_tools": True},
    {"id": "gpt-5-codex-mini", "name": "GPT 5 Codex Mini", "source": "openai", "context_window": 128000, "supports_tools": True},
    {"id": "gpt-5.1", "name": "GPT 5.1", "source": "openai", "context_window": 128000, "supports_tools": True},
    {"id": "gpt-5.1-codex", "name": "GPT 5.1 Codex", "source": "openai", "context_window": 200000, "supports_tools": True},
    {"id": "gpt-5.1-codex-mini", "name": "GPT 5.1 Codex Mini", "source": "openai", "context_window": 128000, "supports_tools": True},
    {"id": "gpt-5.1-codex-max", "name": "GPT 5.1 Codex Max", "source": "openai", "context_window": 200000, "supports_tools": True},
    {"id": "gpt-5.2", "name": "GPT 5.2", "source": "openai", "context_window": 128000, "supports_tools": True},
    {"id": "gpt-5.2-codex", "name": "GPT 5.2 Codex", "source": "openai", "context_window": 200000, "supports_tools": True},

    # ===== GITHUB-COPILOT (21) =====
    {"id": "gpt-4.1", "name": "GPT-4.1", "source": "github-copilot", "context_window": 128000, "supports_tools": True},
    {"id": "gpt-4o", "name": "GPT-4o", "source": "github-copilot", "context_window": 128000, "supports_tools": True},
    {"id": "gpt-5", "name": "GPT-5", "source": "github-copilot", "context_window": 128000, "supports_tools": True},
    {"id": "gpt-5-mini", "name": "GPT-5 Mini", "source": "github-copilot", "context_window": 128000, "supports_tools": True},
    {"id": "gpt-5-codex", "name": "GPT-5 Codex", "source": "github-copilot", "context_window": 200000, "supports_tools": True},
    {"id": "gpt-5.1", "name": "GPT-5.1", "source": "github-copilot", "context_window": 128000, "supports_tools": True},
    {"id": "gpt-5.1-codex", "name": "GPT-5.1 Codex", "source": "github-copilot", "context_window": 200000, "supports_tools": True},
    {"id": "gpt-5.1-codex-mini", "name": "GPT-5.1 Codex Mini", "source": "github-copilot", "context_window": 128000, "supports_tools": True},
    {"id": "gpt-5.1-codex-max", "name": "GPT-5.1 Codex Max", "source": "github-copilot", "context_window": 200000, "supports_tools": True},
    {"id": "gpt-5.2", "name": "GPT-5.2", "source": "github-copilot", "context_window": 128000, "supports_tools": True},
    {"id": "gpt-5.2-codex", "name": "GPT-5.2 Codex", "source": "github-copilot", "context_window": 200000, "supports_tools": True},
    {"id": "claude-haiku-4.5", "name": "Claude Haiku 4.5", "source": "github-copilot", "context_window": 200000, "supports_tools": True},
    {"id": "claude-opus-4.1", "name": "Claude Opus 4.1", "source": "github-copilot", "context_window": 200000, "supports_tools": True},
    {"id": "claude-opus-4.5", "name": "Claude Opus 4.5", "source": "github-copilot", "context_window": 200000, "supports_tools": True},
    {"id": "claude-sonnet-4", "name": "Claude Sonnet 4", "source": "github-copilot", "context_window": 200000, "supports_tools": True},
    {"id": "claude-sonnet-4.5", "name": "Claude Sonnet 4.5", "source": "github-copilot", "context_window": 200000, "supports_tools": True},
    {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "source": "github-copilot", "context_window": 1000000, "supports_tools": True},
    {"id": "gemini-3-pro-preview", "name": "Gemini 3 Pro (Preview)", "source": "github-copilot", "context_window": 1000000, "supports_tools": True},
    {"id": "gemini-3-flash-preview", "name": "Gemini 3 Flash (Preview)", "source": "github-copilot", "context_window": 1000000, "supports_tools": True},
    {"id": "grok-code-fast-1", "name": "Grok Code Fast 1", "source": "github-copilot", "context_window": 128000, "supports_tools": True},
    {"id": "oswe-vscode-prime", "name": "Raptor mini (Preview)", "source": "github-copilot", "context_window": 128000, "supports_tools": True},

    # ===== KIRO (9) - Base models NO TOOLS, Agentic models HAVE TOOLS =====
    {"id": "kiro-auto", "name": "Kiro Auto", "source": "kiro", "context_window": 128000, "supports_tools": False},
    {"id": "kiro-claude-opus-4-5", "name": "Kiro Claude Opus 4.5", "source": "kiro", "context_window": 200000, "supports_tools": False},
    {"id": "kiro-claude-sonnet-4-5", "name": "Kiro Claude Sonnet 4.5", "source": "kiro", "context_window": 200000, "supports_tools": False},
    {"id": "kiro-claude-sonnet-4", "name": "Kiro Claude Sonnet 4", "source": "kiro", "context_window": 200000, "supports_tools": False},
    {"id": "kiro-claude-haiku-4-5", "name": "Kiro Claude Haiku 4.5", "source": "kiro", "context_window": 200000, "supports_tools": False},
    {"id": "kiro-claude-opus-4-5-agentic", "name": "Kiro Claude Opus 4.5 (Agentic)", "source": "kiro", "context_window": 200000, "supports_tools": True},
    {"id": "kiro-claude-sonnet-4-5-agentic", "name": "Kiro Claude Sonnet 4.5 (Agentic)", "source": "kiro", "context_window": 200000, "supports_tools": True},
    {"id": "kiro-claude-sonnet-4-agentic", "name": "Kiro Claude Sonnet 4 (Agentic)", "source": "kiro", "context_window": 200000, "supports_tools": True},
    {"id": "kiro-claude-haiku-4-5-agentic", "name": "Kiro Claude Haiku 4.5 (Agentic)", "source": "kiro", "context_window": 200000, "supports_tools": True},

    # ===== GEMINI (5) =====
    {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "source": "gemini", "context_window": 1000000, "supports_tools": True},
    {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "source": "gemini", "context_window": 1000000, "supports_tools": True},
    {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash Lite", "source": "gemini", "context_window": 1000000, "supports_tools": True},
    {"id": "gemini-3-pro-preview", "name": "Gemini 3 Pro Preview", "source": "gemini", "context_window": 1000000, "supports_tools": True},
    {"id": "gemini-3-flash-preview", "name": "Gemini 3 Flash Preview", "source": "gemini", "context_window": 1000000, "supports_tools": True},
]


def get_static_models() -> List[ModelInfo]:
    """Get the static model list (canonical source)."""
    return STATIC_MODELS.copy()


def get_models_by_source() -> Dict[str, List[ModelInfo]]:
    """Get models grouped by source provider."""
    by_source: Dict[str, List[ModelInfo]] = {}
    for model in STATIC_MODELS:
        source = model.get("source", "other")
        by_source.setdefault(source, []).append(model)
    return by_source


def get_source_counts() -> Dict[str, int]:
    """Get model counts per source provider."""
    by_source = get_models_by_source()
    return {source: len(models) for source, models in by_source.items()}


# ============================================================================
# Display name mapping for sources
# ============================================================================

SOURCE_DISPLAY_NAMES = {
    "claude": "Claude",
    "openai": "OpenAI",
    "gemini": "Gemini",
    "github-copilot": "Copilot",
    "kiro": "Kiro",
    "antigravity": "Antigravity",
}

TOOL_SUPPORTED_SOURCES = {"claude", "openai", "gemini", "github-copilot"}
NO_TOOL_SOURCES = {"kiro", "antigravity"}

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
    - Kiro base: NO tools (CodeWhisperer - code completion only)
    - Kiro agentic: YES tools (agentic mode enables tool use)
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
    if family == "kiro":
        # Kiro agentic models support tools, base models do not
        return "agentic" in model
    if family in ("antigravity", "qwen", "deepseek"):
        return False

    return False


def list_shorthands() -> Dict[str, str]:
    """Return all available shorthands with their full model IDs."""
    return MODEL_SHORTHANDS.copy()
