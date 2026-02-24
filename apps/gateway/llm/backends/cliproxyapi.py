"""CLIProxyAPIPlus Backend - Multi-provider CLI proxy as OpenAI-compatible API.

CLIProxyAPIPlus (https://github.com/router-for-me/CLIProxyAPIPlus) provides an OpenAI-compatible
API wrapper around multiple CLI tools:
- Claude Code CLI (Anthropic) - claude-sonnet-4-20250514, claude-opus-4-5-20251101, etc.
- ChatGPT Codex (OpenAI) - gpt-5, gpt-5-codex, gpt-5.1-codex-max, etc.
- Gemini CLI (Google) - gemini-2.5-pro, gemini-3-pro-preview
- Qwen Code (Alibaba) - qwen-coder models
- GitHub Copilot - gpt-4.1, gpt-4o, grok-code-fast-1, oswe-vscode-prime
- Kiro/AWS CodeWhisperer - kiro-auto, kiro-claude-opus-4-5, kiro-claude-sonnet-4-5-agentic
- Antigravity - gemini-claude-sonnet-4-5-thinking, tab_flash_lite_preview, gpt-oss-120b-medium

CLIProxyAPIPlus adds:
- GitHub Copilot support (--github-copilot-login)
- Kiro/AWS CodeWhisperer support (--kiro-aws-authcode)
- Built-in rate limiting
- Automatic token refresh
- Request metrics/monitoring

The backend dynamically selects the appropriate prompt builder and tool support
based on the model being used.

Default port: 8317

Environment Variables:
- KURORYUU_CLIPROXYAPI_URL: API base URL (default: http://127.0.0.1:8317/v1)
- KURORYUU_CLIPROXYAPI_MODEL: Model name (default: claude-sonnet-4-20250514)
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Dict, Any, Optional

from .lmstudio import LMStudioBackend

if TYPE_CHECKING:
    from apps.gateway.prompts.base import PromptBuilder


class CLIProxyAPIBackend(LMStudioBackend):
    """CLIProxyAPIPlus backend - multi-provider CLI proxy.

    CLIProxyAPIPlus wraps multiple CLI tools as an OpenAI-compatible API:
    - Claude Code CLI (Anthropic)
    - ChatGPT Codex (OpenAI)
    - Gemini CLI (Google)
    - Qwen Code (Alibaba)
    - GitHub Copilot (new in Plus)
    - Kiro/CodeWhisperer (new in Plus)
    - iFlow, Antigravity, others

    Key features:
    - Default port 8317
    - Dynamic prompt builder selection based on model family
    - Dynamic tool support detection (o1 models don't support tools)
    - Multi-account load balancing (handled by CLIProxyAPIPlus)
    - Rate limiting and token refresh (Plus feature)
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        # Use CLIProxyAPI defaults (port 8317, Claude model)
        super().__init__(
            base_url=base_url or os.environ.get(
                "KURORYUU_CLIPROXYAPI_URL", "http://127.0.0.1:8317/v1"
            ),
            model=model or os.environ.get(
                "KURORYUU_CLIPROXYAPI_MODEL", "claude-sonnet-4-20250514"
            ),
        )

    @property
    def name(self) -> str:
        return "cliproxyapi"

    def _get_request_headers(self) -> Dict[str, str]:
        """CLIProxyAPI requires Bearer auth."""
        return {"Authorization": "Bearer kuroryuu-local"}

    @property
    def supports_native_tools(self) -> bool:
        # Dynamic - depends on the current model
        return self.model_supports_tools(self.default_model)

    def _get_model_family(self, model: Optional[str] = None) -> str:
        """Detect model family from model ID.

        Returns: 'claude', 'openai', 'gemini', 'qwen', 'copilot', 'kiro', 'antigravity', 'deepseek', or 'other'
        """
        model_id = (model or self.default_model or "").lower()

        # Kiro models (AWS CodeWhisperer)
        if model_id.startswith("kiro-") or "codewhisperer" in model_id or "amazon-q" in model_id:
            return "kiro"

        # Antigravity models (gemini-claude hybrids, tab_flash, gpt-oss)
        if model_id.startswith("gemini-claude-") or "antigravity" in model_id:
            return "antigravity"
        if model_id in ("tab_flash_lite_preview", "gpt-oss-120b-medium"):
            return "antigravity"

        # Direct Claude models
        if "claude" in model_id:
            return "claude"

        # Direct Gemini models (after gemini-claude check)
        if model_id.startswith("gemini-"):
            return "gemini"

        # OpenAI models (GPT, o1, o3 series)
        if "gpt" in model_id or model_id.startswith("o1") or model_id.startswith("o3"):
            return "openai"

        # GitHub Copilot special models
        if "copilot" in model_id or model_id in ("grok-code-fast-1", "oswe-vscode-prime"):
            return "copilot"

        # Qwen models
        if "qwen" in model_id:
            return "qwen"

        # DeepSeek models
        if "deepseek" in model_id:
            return "deepseek"

        return "other"

    def model_supports_tools(self, model: Optional[str] = None) -> bool:
        """Check if model supports native tool calling.

        Tool support by family:
        - Claude: Yes (all models)
        - OpenAI GPT-4/5: Yes
        - OpenAI o1: No (reasoning models don't support tools)
        - Gemini: Yes
        - Copilot: Yes (GitHub Copilot supports function calling)
        - Kiro base: No (CodeWhisperer focused on code completion)
        - Kiro agentic: Yes (agentic mode enables tool use)
        - Antigravity: No (proxied models)
        - Qwen: No (typically)
        - DeepSeek: No
        - Other: No (safe default)
        """
        model_id = (model or self.default_model or "").lower()
        family = self._get_model_family(model)

        if family == "claude":
            return True
        if family == "openai":
            # o1 models don't support tools
            if model_id.startswith("o1-") or model_id == "o1":
                return False
            return True  # GPT-4, GPT-5, etc. support tools
        if family == "gemini":
            return True
        if family == "copilot":
            return True  # GitHub Copilot supports function calling
        if family == "kiro":
            # Kiro agentic models support tools, base models do not
            return "agentic" in model_id
        if family in ("antigravity", "qwen", "deepseek"):
            return False
        return False  # Default to no tools for unknown models

    def get_prompt_builder(self, model: Optional[str] = None) -> "PromptBuilder":
        """Get the appropriate prompt builder for the model.

        Selects builder based on model family:
        - Claude: AnthropicPromptBuilder
        - OpenAI/Gemini/Other: OpenAIPromptBuilder (most compatible)
        """
        family = self._get_model_family(model)

        if family == "claude":
            from apps.gateway.prompts.anthropic import AnthropicPromptBuilder
            return AnthropicPromptBuilder()
        else:
            # OpenAI-compatible format works for GPT, Gemini, and most others
            from apps.gateway.prompts.openai import OpenAIPromptBuilder
            return OpenAIPromptBuilder()

    async def health_check(self) -> Dict[str, Any]:
        """Check if CLIProxyAPI is reachable.

        Extends parent health_check with CLIProxyAPI-specific info.
        """
        result = await super().health_check()

        # Override backend name
        result["backend"] = self.name

        # Add CLIProxyAPIPlus-specific info based on model family
        if result.get("ok"):
            family = self._get_model_family()
            cli_map = {
                "claude": "claude-code",
                "openai": "chatgpt-codex",
                "gemini": "gemini-cli",
                "qwen": "qwen-code",
                "copilot": "github-copilot",
                "kiro": "kiro-codewhisperer",
                "antigravity": "antigravity",
                "deepseek": "deepseek",
                "other": "unknown",
            }
            result["wrapped_cli"] = cli_map.get(family, "unknown")
            result["model_family"] = family
            result["supports_tools"] = self.supports_native_tools

        return result
