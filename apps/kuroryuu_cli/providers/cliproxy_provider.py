"""CLIProxyAPI provider - direct access to 61 models across 6 providers.

This provider connects directly to CLIProxyAPI without fallback logic.
Supports: Claude, OpenAI, Gemini, GitHub Copilot, Kiro, Antigravity.
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, TYPE_CHECKING

import httpx

from ..llm_provider import LLMProvider

if TYPE_CHECKING:
    from ..agent_core import AgentEvent, Message
    from ..config import Config

logger = logging.getLogger(__name__)


class CLIProxyProvider(LLMProvider):
    """Direct CLIProxyAPI provider - OpenAI-compatible API for 61 models."""

    def __init__(self, http_client: httpx.AsyncClient):
        """Initialize with shared HTTP client.

        Args:
            http_client: Shared async HTTP client from AgentCore
        """
        self._http_client = http_client
        self._context_window: int = 200000  # Most CLIProxy models support 200K

    @property
    def name(self) -> str:
        return "cliproxyapi"

    @property
    def supports_native_tools(self) -> bool:
        return True  # CLIProxyAPI supports OpenAI tool format

    async def fetch_model_info(self, config: "Config") -> int:
        """Fetch available models from CLIProxyAPI.

        Args:
            config: Configuration with cliproxy_url

        Returns:
            Context window size
        """
        try:
            url = f"{config.cliproxy_url}/v1/models"
            headers = {"Authorization": "Bearer kuroryuu-local"}
            resp = await self._http_client.get(url, timeout=5.0, headers=headers)
            resp.raise_for_status()
            data = resp.json()

            # Find model in list
            for model_info in data.get("data", []):
                if model_info.get("id") == config.cliproxy_model:
                    ctx = model_info.get("context_length") or model_info.get("max_tokens")
                    if ctx:
                        self._context_window = ctx
                        logger.debug(f"CLIProxy model context window: {ctx}")
                        return ctx

            # Default context for known model families
            model = config.cliproxy_model.lower()
            if "opus" in model or "sonnet" in model or "haiku" in model:
                self._context_window = 200000
            elif "gpt-5" in model or "codex" in model:
                self._context_window = 200000
            elif "gemini" in model:
                self._context_window = 1000000  # Gemini 2.0+ has 1M
            elif model.startswith("kiro-"):
                self._context_window = 200000  # Kiro uses Claude backend
            elif "copilot" in model or "grok" in model or "oswe" in model:
                self._context_window = 128000  # GitHub Copilot models
            elif "deepseek" in model:
                self._context_window = 64000
            elif "qwen" in model:
                self._context_window = 32000
            elif "antigravity" in model or model.startswith("gemini-claude-") or model == "tab_flash_lite_preview" or model == "gpt-oss-120b-medium":
                self._context_window = 200000  # Antigravity models

        except Exception as e:
            logger.debug(f"Could not fetch CLIProxy model info: {e}")

        return self._context_window

    async def get_context_window(self) -> int:
        return self._context_window

    async def stream_completion(
        self,
        messages: List["Message"],
        tools: List[Dict[str, Any]],
        config: "Config",
    ) -> AsyncGenerator["AgentEvent", None]:
        """Stream completion directly from CLIProxyAPI.

        Args:
            messages: Conversation history
            tools: Tool schemas in OpenAI format
            config: Configuration with model settings

        Yields:
            AgentEvent objects
        """
        # Import here to avoid circular dependency
        from ..agent_core import AgentEvent

        url = f"{config.cliproxy_url}/v1/chat/completions"
        model = config.cliproxy_model

        # Build messages for API
        oai_messages = []
        for msg in messages:
            m: Dict[str, Any] = {"role": msg.role, "content": msg.content}

            if msg.name:
                m["name"] = msg.name
            if msg.tool_call_id:
                m["tool_call_id"] = msg.tool_call_id
            if msg.tool_calls:
                m["tool_calls"] = msg.tool_calls
            oai_messages.append(m)

        # Build payload
        payload: Dict[str, Any] = {
            "model": model,
            "stream": True,
            "messages": oai_messages,
            "temperature": 0.7,
            "stream_options": {"include_usage": True},
        }

        # Add tools if provided
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
            logger.debug(f"Sending {len(tools)} tools to CLIProxyAPI")

        # CLIProxyAPI requires Bearer auth
        headers = {"Authorization": "Bearer kuroryuu-local"}

        try:
            async with self._http_client.stream("POST", url, json=payload, headers=headers) as response:
                # Check status before streaming - read error body if failed
                if response.status_code >= 400:
                    error_body = await response.aread()
                    yield AgentEvent(type="error", data={
                        "message": f"HTTP {response.status_code}: {error_body.decode()[:500]}"
                    })
                    return

                pending_tool_calls: Dict[int, Dict[str, Any]] = {}
                response_usage: Dict[str, int] = {}

                async for line in response.aiter_lines():
                    if not line:
                        continue

                    data = line[6:] if line.startswith("data: ") else line

                    if data.strip() == "[DONE]":
                        # Emit pending tool calls
                        for tc in pending_tool_calls.values():
                            try:
                                args = json.loads(tc["arguments"]) if tc["arguments"] else {}
                            except json.JSONDecodeError:
                                args = {"raw": tc["arguments"]}
                            yield AgentEvent(type="tool_call", data={
                                "id": tc["id"],
                                "name": tc["name"],
                                "arguments": args,
                            })
                        yield AgentEvent(type="done", data={
                            "stop_reason": "end_turn",
                            "usage": response_usage if response_usage else None,
                        })
                        return

                    try:
                        obj = json.loads(data)
                    except Exception:
                        continue

                    # Capture usage stats
                    usage = obj.get("usage")
                    if usage:
                        response_usage = usage

                    choice0 = (obj.get("choices") or [{}])[0]
                    delta = choice0.get("delta") or {}

                    # Handle text content
                    content = delta.get("content")
                    if content:
                        yield AgentEvent(type="text_delta", data=content)

                    # Handle streaming tool calls
                    tool_calls = delta.get("tool_calls")
                    if tool_calls:
                        for tc in tool_calls:
                            idx = tc.get("index", 0)
                            if idx not in pending_tool_calls:
                                pending_tool_calls[idx] = {
                                    "id": tc.get("id", f"call_{idx}"),
                                    "name": "",
                                    "arguments": "",
                                }
                            if tc.get("id"):
                                pending_tool_calls[idx]["id"] = tc["id"]
                            func = tc.get("function", {})
                            if func.get("name"):
                                pending_tool_calls[idx]["name"] = func["name"]
                            if func.get("arguments"):
                                pending_tool_calls[idx]["arguments"] += func["arguments"]

                    # Check for finish reason
                    finish = choice0.get("finish_reason")
                    if finish:
                        # Emit pending tool calls
                        for tc in pending_tool_calls.values():
                            try:
                                args = json.loads(tc["arguments"]) if tc["arguments"] else {}
                            except json.JSONDecodeError:
                                args = {"raw": tc["arguments"]}
                            yield AgentEvent(type="tool_call", data={
                                "id": tc["id"],
                                "name": tc["name"],
                                "arguments": args,
                            })
                        yield AgentEvent(type="done", data={
                            "stop_reason": finish,
                            "usage": response_usage if response_usage else None,
                        })
                        return

        except httpx.ConnectError:
            yield AgentEvent(type="error", data={
                "message": f"Cannot connect to CLIProxyAPI at {config.cliproxy_url}"
            })

        except httpx.HTTPStatusError as e:
            # Should not reach here with new status check, but keep as fallback
            yield AgentEvent(type="error", data={
                "message": f"HTTP error: {e}"
            })

        except Exception as e:
            yield AgentEvent(type="error", data={
                "message": str(e)
            })
