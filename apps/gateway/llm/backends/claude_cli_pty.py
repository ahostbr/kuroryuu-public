"""Claude CLI PTY Backend - Persistent Claude CLI session via PTY.

Unlike ClaudeCliBackend (subprocess per message), this maintains
a persistent interactive Claude CLI session with full features:
- /compact, /clear, all slash commands
- MCP tools
- Natural context retention
- Real-time streaming

The session persists for the lifetime of the conversation.
"""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional

from .base import LLMBackend, LLMConfig, LLMMessage, StreamEvent
from .claude_pty_manager import get_claude_pty_manager, PYWINPTY_AVAILABLE

logger = logging.getLogger("kuroryuu.gateway.claude_cli_pty")

# Model aliases
MODEL_ALIASES = {
    "opus": "opus",
    "opus-4.5": "opus",
    "claude-opus-4-5": "opus",
    "claude-opus-4-5-20251101": "opus",
    "claude-opus-4-5-pty": "opus",
    "sonnet": "sonnet",
    "sonnet-4": "sonnet",
    "claude-sonnet-4": "sonnet",
    "haiku": "haiku",
}

# Pattern to strip ANSI escape codes from PTY output
ANSI_ESCAPE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

# Pattern to detect Claude's prompt (end of response)
PROMPT_PATTERNS = [
    r'^>\s*$',
    r'^❯\s*$',
    r'^\s*>\s+',
]
PROMPT_REGEX = re.compile('|'.join(PROMPT_PATTERNS), re.MULTILINE)


class ClaudeCliPTYBackend(LLMBackend):
    """Persistent Claude CLI session via PTY.

    Each conversation gets its own Claude CLI session that persists
    across messages. The CLI maintains full conversation context
    and supports all Claude Code features.
    """

    def __init__(self, model: Optional[str] = None):
        """Initialize the PTY backend.

        Args:
            model: Default model (opus, sonnet, haiku).
        """
        self._default_model = model or "opus"

    @property
    def name(self) -> str:
        return "claude-cli-pty"

    @property
    def supports_native_tools(self) -> bool:
        # Claude CLI handles tools internally
        return False

    def _resolve_model(self, model: str) -> str:
        """Resolve model name to CLI alias."""
        return MODEL_ALIASES.get(model.lower().strip(), model)

    def _clean_output(self, text: str) -> str:
        """Clean PTY output for display.

        - Strip ANSI escape codes
        - Remove prompt lines
        - Clean up extra whitespace
        """
        # Remove ANSI escapes
        text = ANSI_ESCAPE.sub('', text)

        # Remove standalone prompt lines but keep content
        lines = text.split('\n')
        cleaned = []
        for line in lines:
            # Skip pure prompt lines
            if PROMPT_REGEX.match(line):
                continue
            cleaned.append(line)

        return '\n'.join(cleaned)

    async def stream_chat(
        self,
        messages: List[LLMMessage],
        config: LLMConfig,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Execute prompt via persistent Claude CLI PTY session.

        The session maintains conversation context, so we only send
        the latest user message. The CLI handles history internally.
        """
        if not PYWINPTY_AVAILABLE:
            yield StreamEvent(
                type="error",
                error_message="pywinpty not available - cannot use PTY backend",
                error_code="pty_unavailable",
            )
            return

        # Resolve model
        model = self._resolve_model(config.model or self._default_model)

        # Get conversation ID from extra config or generate one
        # Use `or` to handle None values (dict.get default only used when key missing)
        conversation_id = config.extra.get("conversation_id") or str(uuid.uuid4())

        # Get the latest user message
        # (Claude CLI maintains history, so we only send the new message)
        user_message = ""
        for msg in reversed(messages):
            if msg.role == "user":
                user_message = msg.content
                break

        if not user_message:
            yield StreamEvent(
                type="error",
                error_message="No user message found",
                error_code="no_message",
            )
            return

        logger.info(
            f"Claude PTY: conv={conversation_id[:8]}, model={model}, "
            f"msg_len={len(user_message)}"
        )

        manager = get_claude_pty_manager()
        accumulated_text = ""
        last_clean_position = 0

        try:
            async for chunk in manager.send_message(
                conversation_id,
                user_message,
                model=model,
            ):
                # Accumulate and clean the output
                accumulated_text += chunk

                # Clean what we have
                cleaned = self._clean_output(accumulated_text)

                # Only yield new cleaned content
                new_content = cleaned[last_clean_position:]
                if new_content:
                    yield StreamEvent(type="delta", text=new_content)
                    last_clean_position = len(cleaned)

            # Get the PTY session ID for Desktop integration
            pty_session_id = manager.get_session_id(conversation_id)

            yield StreamEvent(
                type="done",
                stop_reason="end_turn",
                usage={
                    "session_type": "persistent_pty",
                    "conversation_id": conversation_id,
                    "pty_session_id": pty_session_id,
                },
            )

        except Exception as e:
            logger.exception("Claude PTY error")
            yield StreamEvent(
                type="error",
                error_message=str(e),
                error_code="pty_error",
            )

    async def health_check(self) -> Dict[str, Any]:
        """Check backend health."""
        manager = get_claude_pty_manager()
        return await manager.health_check()

    async def destroy_session(self, conversation_id: str) -> bool:
        """Explicitly destroy a conversation's PTY session.

        Called when chat is cleared or conversation ends.
        """
        manager = get_claude_pty_manager()
        return await manager.destroy(conversation_id)
