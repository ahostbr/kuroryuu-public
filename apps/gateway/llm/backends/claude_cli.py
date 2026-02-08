"""Claude CLI Backend - Spawns claude CLI for real Opus 4.5 access.

Uses Claude Code CLI credentials (Max/Pro subscription) to access
Anthropic models directly through the CLI.

Usage:
    Backend processes prompts via: claude -p --output-format json --model opus "prompt"

Environment:
- KURORYUU_CLAUDE_CLI_MODEL: Model alias (default: opus)
    Aliases: opus, sonnet, haiku
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
from typing import Any, AsyncGenerator, Dict, List, Optional

from .base import LLMBackend, LLMConfig, LLMMessage, LLMToolSchema, StreamEvent

logger = logging.getLogger("kuroryuu.gateway.claude_cli")

# Model aliases supported by claude CLI
MODEL_ALIASES = {
    "opus": "opus",
    "claude-opus-4-6-20260205": "opus",
    "opus-4.5": "opus",
    "claude-opus-4-5": "opus",
    "claude-opus-4-5-20251101": "opus",
    "claude-opus-4-5-direct": "opus",  # Desktop model entry ID
    "sonnet": "sonnet",
    "sonnet-4": "sonnet",
    "claude-sonnet-4": "sonnet",
    "claude-sonnet-4-20250514": "sonnet",
    "haiku": "haiku",
    "claude-3-5-haiku": "haiku",
}


class ClaudeCliBackend(LLMBackend):
    """Backend that spawns Claude CLI for real model access.

    This bypasses API rate limiting and model routing issues by using
    the Claude Code CLI directly with subscription credentials.
    """

    def __init__(
        self,
        model: Optional[str] = None,
        timeout: float = 120.0,
    ):
        """Initialize Claude CLI backend.

        Args:
            model: Model alias (opus, sonnet, haiku). Default from env.
            timeout: Command timeout in seconds.
        """
        self._model = model or os.environ.get("KURORYUU_CLAUDE_CLI_MODEL", "opus")
        self._timeout = timeout

    @property
    def name(self) -> str:
        return "claude-cli"

    @property
    def supports_native_tools(self) -> bool:
        # Claude CLI supports tools but we'll use simple prompts for now
        return False

    def _resolve_model(self, model: str) -> str:
        """Resolve model name to Claude CLI alias."""
        model_lower = model.lower().strip()
        return MODEL_ALIASES.get(model_lower, model_lower)

    def _build_prompt(self, messages: List[LLMMessage]) -> str:
        """Convert messages to a single prompt string."""
        parts = []
        for msg in messages:
            if msg.role == "system":
                parts.append(f"[System]\n{msg.content}")
            elif msg.role == "user":
                parts.append(f"[User]\n{msg.content}")
            elif msg.role == "assistant":
                parts.append(f"[Assistant]\n{msg.content}")
            elif msg.role == "tool":
                parts.append(f"[Tool Result: {msg.name}]\n{msg.content}")

        return "\n\n".join(parts)

    async def stream_chat(
        self,
        messages: List[LLMMessage],
        config: LLMConfig,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Execute prompt via Claude CLI and yield results.

        Note: This doesn't truly stream - it runs the CLI and returns
        the result. For streaming, we'd need to use --output-format stream.
        """
        model = self._resolve_model(config.model or self._model)
        prompt = self._build_prompt(messages)

        logger.info(f"Claude CLI: model={model}, prompt_len={len(prompt)}")

        try:
            # Use stdin piping for robust prompt handling (avoids shell escaping issues)
            import platform

            # Build command without the prompt argument - we'll pipe it via stdin
            base_cmd = [
                "claude",
                "-p",
                "--output-format", "json",
                "--model", model,
                "--dangerously-skip-permissions",
            ]

            if platform.system() == "Windows":
                # Windows: use shell for PATH resolution
                cmd_str = " ".join(base_cmd)
                proc = await asyncio.create_subprocess_shell(
                    cmd_str,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
            else:
                # Unix: use exec
                proc = await asyncio.create_subprocess_exec(
                    *base_cmd,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )

            try:
                # Pass prompt via stdin (encoded as UTF-8)
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(input=prompt.encode("utf-8")),
                    timeout=self._timeout,
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                yield StreamEvent(
                    type="error",
                    error_message=f"Claude CLI timeout after {self._timeout}s",
                    error_code="timeout",
                )
                return

            if proc.returncode != 0:
                error_msg = stderr.decode("utf-8", errors="replace").strip()
                stdout_preview = stdout.decode("utf-8", errors="replace")[:500] if stdout else ""
                logger.error(f"Claude CLI failed (exit={proc.returncode}): stderr={error_msg}, stdout_preview={stdout_preview}")
                yield StreamEvent(
                    type="error",
                    error_message=error_msg or f"Claude CLI failed with exit code {proc.returncode}",
                    error_code="cli_error",
                )
                return

            # Parse JSON output
            output = stdout.decode("utf-8", errors="replace").strip()
            try:
                result = json.loads(output)
            except json.JSONDecodeError as e:
                logger.error(f"Claude CLI invalid JSON: {e}")
                yield StreamEvent(
                    type="error",
                    error_message=f"Invalid JSON from CLI: {e}",
                    error_code="parse_error",
                )
                return

            # Extract result text
            text = result.get("result", "")
            if not text and result.get("type") == "result":
                # Try content blocks
                content = result.get("content", [])
                if isinstance(content, list):
                    text = "".join(
                        block.get("text", "")
                        for block in content
                        if isinstance(block, dict) and block.get("type") == "text"
                    )

            # Emit as single delta
            if text:
                yield StreamEvent(type="delta", text=text)

            # Extract usage
            usage = result.get("usage", {})
            model_usage = result.get("modelUsage", {})

            # Get actual model used
            actual_model = None
            if model_usage:
                actual_model = list(model_usage.keys())[0] if model_usage else None

            yield StreamEvent(
                type="done",
                stop_reason=result.get("subtype", "end_turn"),
                usage={
                    "input_tokens": usage.get("input_tokens", 0),
                    "output_tokens": usage.get("output_tokens", 0),
                    "total_cost_usd": result.get("total_cost_usd", 0),
                    "actual_model": actual_model,
                    "duration_ms": result.get("duration_ms", 0),
                },
            )

        except FileNotFoundError:
            yield StreamEvent(
                type="error",
                error_message="Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code",
                error_code="not_found",
            )
        except Exception as e:
            logger.exception("Claude CLI error")
            yield StreamEvent(
                type="error",
                error_message=str(e),
                error_code="unknown",
            )

    async def health_check(self) -> Dict[str, Any]:
        """Check if Claude CLI is available and authenticated."""
        import platform

        try:
            if platform.system() == "Windows":
                proc = await asyncio.create_subprocess_shell(
                    "claude --version",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
            else:
                proc = await asyncio.create_subprocess_exec(
                    "claude", "--version",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5.0)

            if proc.returncode == 0:
                version = stdout.decode().strip()
                return {
                    "ok": True,
                    "backend": self.name,
                    "version": version,
                    "model": self._model,
                }
            else:
                return {
                    "ok": False,
                    "backend": self.name,
                    "error": "Claude CLI returned non-zero exit code",
                }
        except FileNotFoundError:
            return {
                "ok": False,
                "backend": self.name,
                "error": "Claude CLI not installed",
            }
        except asyncio.TimeoutError:
            return {
                "ok": False,
                "backend": self.name,
                "error": "Claude CLI health check timeout",
            }
        except Exception as e:
            return {
                "ok": False,
                "backend": self.name,
                "error": str(e),
            }
