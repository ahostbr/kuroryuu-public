"""CLIProxyAPIPlus Backend - Multi-provider CLI proxy as OpenAI-compatible API.

CLIProxyAPIPlus (https://github.com/router-for-me/CLIProxyAPIPlus) provides an OpenAI-compatible
API wrapper around multiple CLI tools:
- Claude Code CLI (Anthropic)
- ChatGPT Codex (OpenAI) - GPT-4o, o1-preview, o1-mini
- Gemini CLI (Google) - gemini-2.5-pro, gemini-1.5-pro
- Qwen Code (Alibaba) - qwen-coder models
- GitHub Copilot - copilot models (new in Plus)
- Kiro/AWS CodeWhisperer - amazon-q models (new in Plus)
- iFlow, Antigravity, and others

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

        Returns: 'claude', 'openai', 'gemini', 'qwen', 'copilot', 'kiro', or 'other'
        """
        model_id = (model or self.default_model or "").lower()
        if "claude" in model_id:
            return "claude"
        if "gpt" in model_id or model_id.startswith("o1-") or model_id.startswith("o1"):
            return "openai"
        if "gemini" in model_id:
            return "gemini"
        if "qwen" in model_id:
            return "qwen"
        if "copilot" in model_id:
            return "copilot"
        if "kiro" in model_id or "codewhisperer" in model_id or "amazon-q" in model_id:
            return "kiro"
        return "other"

    def model_supports_tools(self, model: Optional[str] = None) -> bool:
        """Check if model supports native tool calling.

        Tool support by family:
        - Claude: Yes (all models)
        - OpenAI GPT-4: Yes
        - OpenAI o1: No (reasoning models don't support tools)
        - Gemini: Yes
        - Copilot: Yes (GitHub Copilot supports function calling)
        - Kiro: No (CodeWhisperer focused on code completion)
        - Qwen: No (typically)
        - Other: No (safe default)
        """
        model_id = (model or self.default_model or "").lower()
        family = self._get_model_family(model)

        if family == "claude":
            return True
        if family == "openai":
            # o1 models don't support tools
            if model_id.startswith("o1-") or model_id.startswith("o1"):
                return False
            return True  # GPT-4, etc. support tools
        if family == "gemini":
            return True
        if family == "copilot":
            return True  # GitHub Copilot supports function calling
        if family == "kiro":
            return False  # CodeWhisperer focused on code completion
        if family == "qwen":
            return False  # Qwen Code typically doesn't support tools
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
                "other": "unknown",
            }
            result["wrapped_cli"] = cli_map.get(family, "unknown")
            result["model_family"] = family
            result["supports_tools"] = self.supports_native_tools

        return result
