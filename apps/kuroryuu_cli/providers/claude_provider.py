"""Claude provider - Anthropic API backend.

Supports two authentication modes:
1. API Key: Traditional ANTHROPIC_API_KEY authentication (RECOMMENDED)
2. OAuth: Claude Pro/Max subscription authentication (BLOCKED - see OAUTH_NOTES.md)

WARNING: OAuth mode is implemented but Anthropic blocks third-party tokens.
         See apps/kuroryuu_cli/OAUTH_NOTES.md for full details.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, AsyncGenerator, Dict, List, Literal, Optional, Union

import httpx

from ..llm_provider import LLMProvider
from ..agent_core import AgentEvent, Message
from ..config import Config

logger = logging.getLogger(__name__)

# Claude context windows by model
CLAUDE_CONTEXT_WINDOWS = {
    "claude-opus-4-5-20251101": 200000,  # Current Opus 4.5 (November 2025)
    "claude-sonnet-4-20250514": 200000,
    "claude-3-5-sonnet-20241022": 200000,
    "claude-3-5-haiku-20241022": 200000,
    "claude-3-opus-20240229": 200000,
}
DEFAULT_CONTEXT_WINDOW = 200000

# OAuth constants - must include oauth-2025-04-20 for OAuth Bearer auth
ANTHROPIC_OAUTH_BETA = "oauth-2025-04-20,interleaved-thinking-2025-05-14"
ANTHROPIC_OAUTH_USER_AGENT = "kuroryuu-cli/1.0.0"


class ClaudeProvider(LLMProvider):
    """Claude provider using Anthropic API.
    
    Supports both API key and OAuth authentication modes.
    OAuth mode enables Claude Pro/Max subscription usage (zero API cost).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        oauth_access_token: Optional[str] = None,
        auth_mode: Literal["api_key", "oauth"] = "api_key",
    ):
        """Initialize Claude provider.

        Args:
            api_key: Anthropic API key (for api_key mode)
            oauth_access_token: OAuth access token (for oauth mode)
            auth_mode: Authentication mode - "api_key" or "oauth"
        """
        self._api_key = api_key
        self._oauth_token = oauth_access_token
        self._auth_mode = auth_mode
        self._client = None
        self._http_client: Optional[httpx.AsyncClient] = None
        self._use_raw_http = False  # True for OAuth mode

        # Validate auth configuration
        if auth_mode == "api_key" and not api_key:
            logger.warning("API key mode selected but no API key provided")
        elif auth_mode == "oauth" and not oauth_access_token:
            logger.warning("OAuth mode selected but no access token provided")

    @property
    def name(self) -> str:
        return "claude"

    @property
    def supports_native_tools(self) -> bool:
        return True

    @property
    def auth_mode(self) -> str:
        """Return current authentication mode."""
        return self._auth_mode
    
    @property
    def is_oauth(self) -> bool:
        """Check if using OAuth authentication."""
        return self._auth_mode == "oauth"

    def _get_client(self):
        """Lazy-load Anthropic client.

        For OAuth mode, we use raw httpx with Bearer token (SDK uses x-api-key).
        For API key mode, we use the standard SDK.
        """
        if self._auth_mode == "oauth" and self._oauth_token:
            # OAuth mode: Use raw httpx with proper Authorization: Bearer header
            # The SDK always sends x-api-key which doesn't work for OAuth
            if self._http_client is None:
                self._use_raw_http = True
                self._http_client = httpx.AsyncClient(
                    base_url="https://api.anthropic.com",
                    headers={
                        "Authorization": f"Bearer {self._oauth_token}",
                        "anthropic-version": "2023-06-01",
                        "anthropic-beta": ANTHROPIC_OAUTH_BETA,
                        "User-Agent": ANTHROPIC_OAUTH_USER_AGENT,
                        "Content-Type": "application/json",
                    },
                    timeout=httpx.Timeout(connect=30.0, read=300.0, write=30.0, pool=30.0),
                )
            return None  # Signal to use raw HTTP
        else:
            # API key mode: Use standard SDK
            self._use_raw_http = False
            if self._client is None:
                try:
                    import anthropic
                    self._client = anthropic.AsyncAnthropic(api_key=self._api_key)
                except ImportError:
                    raise ImportError(
                        "anthropic package not installed. Run: pip install anthropic"
                    )
            return self._client
    
    async def refresh_oauth_token(self) -> bool:
        """Refresh OAuth token if expired.
        
        Returns:
            True if token was refreshed, False if refresh not needed or failed
        """
        if self._auth_mode != "oauth":
            return False
        
        try:
            from ..anthropic_oauth import get_valid_access_token, load_tokens
            
            tokens = load_tokens()
            if tokens and tokens.is_expired():
                new_token = await get_valid_access_token()
                if new_token:
                    self._oauth_token = new_token
                    self._client = None  # Force client recreation
                    self._http_client = None  # Force HTTP client recreation
                    logger.info("OAuth token refreshed successfully")
                    return True
        except Exception as e:
            logger.error(f"Failed to refresh OAuth token: {e}")
        
        return False

    async def get_context_window(self) -> int:
        """Get context window size (Claude supports 200K)."""
        return DEFAULT_CONTEXT_WINDOW

    def _convert_messages(
        self, messages: List[Message]
    ) -> tuple[Optional[str], List[Dict[str, Any]]]:
        """Convert CLI messages to Anthropic format.

        Returns:
            (system_prompt, messages_list)
            Anthropic requires system as separate parameter.
        """
        system_prompt: Optional[str] = None
        converted: List[Dict[str, Any]] = []

        for msg in messages:
            if msg.role == "system":
                # Accumulate system messages
                if system_prompt:
                    system_prompt += "\n\n" + (
                        msg.content if isinstance(msg.content, str) else str(msg.content)
                    )
                else:
                    system_prompt = (
                        msg.content if isinstance(msg.content, str) else str(msg.content)
                    )

            elif msg.role == "tool":
                # Tool results - Anthropic expects tool_result blocks in user messages
                converted.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": msg.tool_call_id or "unknown",
                        "content": msg.content if isinstance(msg.content, str) else str(msg.content),
                    }]
                })

            elif msg.role == "assistant":
                # Assistant messages may have tool_calls
                if msg.tool_calls:
                    # Build content with tool_use blocks
                    content_blocks: List[Dict[str, Any]] = []

                    # Add text content if present
                    if msg.content:
                        if isinstance(msg.content, str) and msg.content.strip():
                            content_blocks.append({
                                "type": "text",
                                "text": msg.content,
                            })

                    # Add tool_use blocks
                    for tc in msg.tool_calls:
                        func = tc.get("function", {})
                        tool_args = func.get("arguments", "{}")
                        if isinstance(tool_args, str):
                            try:
                                tool_args = json.loads(tool_args)
                            except json.JSONDecodeError:
                                tool_args = {}

                        content_blocks.append({
                            "type": "tool_use",
                            "id": tc.get("id", f"tool_{uuid.uuid4().hex[:8]}"),
                            "name": func.get("name", "unknown"),
                            "input": tool_args,
                        })

                    converted.append({
                        "role": "assistant",
                        "content": content_blocks,
                    })
                else:
                    # Regular assistant message
                    converted.append({
                        "role": "assistant",
                        "content": self._convert_content(msg.content),
                    })

            else:
                # User messages - handle multimodal content
                converted.append({
                    "role": "user",
                    "content": self._convert_content(msg.content),
                })

        return system_prompt, converted

    def _convert_content(
        self, content: Union[str, List[Dict[str, Any]]]
    ) -> Union[str, List[Dict[str, Any]]]:
        """Convert content to Anthropic format.

        Handles:
        - Plain text strings
        - OpenAI multimodal format (image_url, text)
        """
        if isinstance(content, str):
            return content

        # Multimodal content - convert from OpenAI format to Anthropic format
        converted_blocks: List[Dict[str, Any]] = []

        for block in content:
            block_type = block.get("type")

            if block_type == "text":
                converted_blocks.append({
                    "type": "text",
                    "text": block.get("text", ""),
                })

            elif block_type == "image_url":
                # OpenAI format: {"type": "image_url", "image_url": {"url": "data:..."}}
                image_url = block.get("image_url", {})
                url = image_url.get("url", "")

                if url.startswith("data:"):
                    # Base64 data URL
                    # Format: data:image/png;base64,<data>
                    try:
                        header, data = url.split(",", 1)
                        media_type = header.split(":")[1].split(";")[0]
                        converted_blocks.append({
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": data,
                            }
                        })
                    except (ValueError, IndexError):
                        logger.warning(f"Invalid base64 image URL format")
                else:
                    # URL reference (Anthropic supports URL images)
                    converted_blocks.append({
                        "type": "image",
                        "source": {
                            "type": "url",
                            "url": url,
                        }
                    })

        return converted_blocks if converted_blocks else ""

    def _convert_tools(
        self, tools: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Convert OpenAI tool format to Anthropic format.

        OpenAI format:
        {
            "type": "function",
            "function": {
                "name": "...",
                "description": "...",
                "parameters": {...}
            }
        }

        Anthropic format:
        {
            "name": "...",
            "description": "...",
            "input_schema": {...}
        }
        """
        converted = []
        for tool in tools:
            if tool.get("type") == "function":
                func = tool.get("function", {})
                converted.append({
                    "name": func.get("name", "unknown"),
                    "description": func.get("description", ""),
                    "input_schema": func.get("parameters", {"type": "object", "properties": {}}),
                })
            else:
                # Already in a simpler format or unknown
                converted.append({
                    "name": tool.get("name", "unknown"),
                    "description": tool.get("description", ""),
                    "input_schema": tool.get("input_schema") or tool.get("parameters", {"type": "object", "properties": {}}),
                })
        return converted

    async def _stream_raw_http(
        self,
        kwargs: Dict[str, Any],
    ) -> AsyncGenerator[AgentEvent, None]:
        """Stream completion using raw HTTP for OAuth mode.

        Args:
            kwargs: Request parameters (model, messages, etc.)

        Yields:
            AgentEvent objects
        """
        kwargs["stream"] = True

        # Track tool calls being assembled
        current_tool_id: Optional[str] = None
        current_tool_name: Optional[str] = None
        current_tool_json: str = ""
        usage: Optional[Dict[str, int]] = None

        try:
            async with self._http_client.stream(
                "POST", "/v1/messages", json=kwargs
            ) as response:
                if response.status_code != 200:
                    error = await response.aread()
                    yield AgentEvent(type="error", data={
                        "message": f"HTTP {response.status_code}: {error.decode()}"
                    })
                    return

                # Parse SSE events
                async for line in response.aiter_lines():
                    if not line:
                        continue

                    if line.startswith("event:"):
                        # Skip event type lines, we parse from data
                        continue

                    if not line.startswith("data:"):
                        continue

                    data = line[5:].strip()  # Remove "data:" prefix
                    if not data:
                        continue

                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue

                    event_type = event.get("type")

                    if event_type == "content_block_start":
                        block = event.get("content_block", {})
                        if block.get("type") == "tool_use":
                            current_tool_id = block.get("id", f"tool_{uuid.uuid4().hex[:8]}")
                            current_tool_name = block.get("name")
                            current_tool_json = ""

                    elif event_type == "content_block_delta":
                        delta = event.get("delta", {})
                        delta_type = delta.get("type")

                        if delta_type == "text_delta":
                            text = delta.get("text", "")
                            if text:
                                yield AgentEvent(type="text_delta", data=text)

                        elif delta_type == "thinking_delta":
                            thinking = delta.get("thinking", "")
                            if thinking:
                                yield AgentEvent(type="thinking_delta", data=thinking)

                        elif delta_type == "input_json_delta":
                            partial_json = delta.get("partial_json", "")
                            if partial_json:
                                current_tool_json += partial_json

                    elif event_type == "content_block_stop":
                        if current_tool_id and current_tool_name:
                            try:
                                args = json.loads(current_tool_json) if current_tool_json else {}
                            except json.JSONDecodeError:
                                args = {"raw": current_tool_json}

                            yield AgentEvent(type="tool_call", data={
                                "id": current_tool_id,
                                "name": current_tool_name,
                                "arguments": args,
                            })

                            current_tool_id = None
                            current_tool_name = None
                            current_tool_json = ""

                    elif event_type == "message_delta":
                        # Contains usage stats
                        msg_usage = event.get("usage", {})
                        if msg_usage:
                            usage = {
                                "input_tokens": msg_usage.get("input_tokens", 0),
                                "output_tokens": msg_usage.get("output_tokens", 0),
                            }

                    elif event_type == "message_stop":
                        yield AgentEvent(type="done", data={
                            "stop_reason": "end_turn",
                            "usage": usage,
                        })
                        return

            # Fallback done event
            yield AgentEvent(type="done", data={"stop_reason": "end_turn"})

        except Exception as e:
            error_msg = str(e)
            if self._oauth_token and self._oauth_token in error_msg:
                error_msg = error_msg.replace(self._oauth_token, "[REDACTED]")
            yield AgentEvent(type="error", data={"message": error_msg})

    async def stream_completion(
        self,
        messages: List[Message],
        tools: List[Dict[str, Any]],
        config: Config,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Stream completion from Claude API.

        Args:
            messages: Conversation history
            tools: Tool schemas in OpenAI format
            config: Configuration with model settings

        Yields:
            AgentEvent objects
        """
        try:
            client = self._get_client()
        except Exception as e:
            yield AgentEvent(type="error", data={"message": str(e)})
            return

        # Convert messages to Anthropic format
        system_prompt, claude_messages = self._convert_messages(messages)

        # Build request kwargs
        kwargs: Dict[str, Any] = {
            "model": config.claude_model,
            "messages": claude_messages,
            "max_tokens": 8192,  # Claude default
        }

        if system_prompt:
            kwargs["system"] = system_prompt

        # Add tools if provided
        if tools:
            kwargs["tools"] = self._convert_tools(tools)

        # Use raw HTTP for OAuth mode (SDK sends x-api-key, OAuth needs Bearer)
        if self._use_raw_http:
            async for event in self._stream_raw_http(kwargs):
                yield event
            return

        # SDK-based streaming for API key mode
        current_tool_id: Optional[str] = None
        current_tool_name: Optional[str] = None
        current_tool_json: str = ""

        try:
            async with client.messages.stream(**kwargs) as stream:
                async for event in stream:
                    event_type = getattr(event, 'type', None)

                    if event_type == 'content_block_start':
                        block = getattr(event, 'content_block', None)
                        if block and getattr(block, 'type', None) == 'tool_use':
                            current_tool_id = getattr(block, 'id', f"tool_{uuid.uuid4().hex[:8]}")
                            current_tool_name = getattr(block, 'name', None)
                            current_tool_json = ""

                    elif event_type == 'content_block_delta':
                        delta = getattr(event, 'delta', None)
                        if delta:
                            delta_type = getattr(delta, 'type', None)

                            if delta_type == 'text_delta':
                                text = getattr(delta, 'text', '')
                                if text:
                                    yield AgentEvent(type="text_delta", data=text)

                            elif delta_type == 'thinking_delta':
                                thinking = getattr(delta, 'thinking', '')
                                if thinking:
                                    yield AgentEvent(type="thinking_delta", data=thinking)

                            elif delta_type == 'input_json_delta':
                                partial_json = getattr(delta, 'partial_json', '')
                                if partial_json:
                                    current_tool_json += partial_json

                    elif event_type == 'content_block_stop':
                        if current_tool_id and current_tool_name:
                            try:
                                args = json.loads(current_tool_json) if current_tool_json else {}
                            except json.JSONDecodeError:
                                args = {"raw": current_tool_json}

                            yield AgentEvent(type="tool_call", data={
                                "id": current_tool_id,
                                "name": current_tool_name,
                                "arguments": args,
                            })

                            current_tool_id = None
                            current_tool_name = None
                            current_tool_json = ""

                    elif event_type == 'message_stop':
                        final_message = await stream.get_final_message()
                        usage = None
                        if hasattr(final_message, 'usage'):
                            u = final_message.usage
                            usage = {
                                "input_tokens": getattr(u, 'input_tokens', 0),
                                "output_tokens": getattr(u, 'output_tokens', 0),
                            }

                        stop_reason = getattr(final_message, 'stop_reason', 'end_turn')
                        yield AgentEvent(type="done", data={
                            "stop_reason": stop_reason,
                            "usage": usage,
                        })
                        return

            yield AgentEvent(type="done", data={"stop_reason": "end_turn"})

        except Exception as e:
            error_msg = str(e)
            if self._api_key and self._api_key in error_msg:
                error_msg = error_msg.replace(self._api_key, "[REDACTED]")
            yield AgentEvent(type="error", data={"message": error_msg})
