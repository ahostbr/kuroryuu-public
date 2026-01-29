"""LMStudio provider - OpenAI-compatible local LLM backend."""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

import httpx

from ..llm_provider import LLMProvider
from ..agent_core import AgentEvent, Message
from ..config import Config

logger = logging.getLogger(__name__)

# Models known to support native tool calling
NATIVE_TOOL_MODELS = ['qwen', 'llama-3', 'mistral', 'devstral', 'ministral']


class LMStudioProvider(LLMProvider):
    """LMStudio provider using OpenAI-compatible API."""

    def __init__(self, http_client: httpx.AsyncClient):
        """Initialize with shared HTTP client.

        Args:
            http_client: Shared async HTTP client from AgentCore
        """
        self._http_client = http_client
        self._context_window: int = 32000  # Updated by fetch_model_info
        self._using_fallback: bool = False  # Track if using CLIProxyAPI fallback

    @property
    def name(self) -> str:
        return "lmstudio"

    @property
    def supports_native_tools(self) -> bool:
        # Check handled by AgentCore based on model name
        return True  # Always true, actual check is in AgentCore

    def supports_tools_for_model(self, model: str) -> bool:
        """Check if the given model supports native tool calling."""
        model_lower = model.lower()
        return any(p in model_lower for p in NATIVE_TOOL_MODELS)

    async def fetch_model_info(self, config: Config) -> int:
        """Fetch model info and update context window.

        Args:
            config: Configuration with lmstudio_url

        Returns:
            Context window size
        """
        try:
            url = f"{config.lmstudio_url}/v1/models"
            resp = await self._http_client.get(url, timeout=5.0)
            resp.raise_for_status()
            data = resp.json()

            # Find model in list
            for model_info in data.get("data", []):
                if model_info.get("id") == config.model:
                    ctx = model_info.get("context_length") or model_info.get("max_tokens")
                    if ctx:
                        self._context_window = ctx
                        logger.debug(f"Model context window: {ctx}")
                        return ctx

            # Fallback: try to get any model's context
            if data.get("data"):
                first_model = data["data"][0]
                ctx = first_model.get("context_length") or first_model.get("max_tokens", 32000)
                self._context_window = ctx
                return ctx

        except Exception as e:
            logger.debug(f"Could not fetch model info: {e}")

        return self._context_window

    async def get_context_window(self) -> int:
        return self._context_window

    async def stream_completion(
        self,
        messages: List[Message],
        tools: List[Dict[str, Any]],
        config: Config,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Stream completion from LMStudio with CLIProxyAPI fallback.

        Args:
            messages: Conversation history
            tools: Tool schemas in OpenAI format
            config: Configuration with model settings

        Yields:
            AgentEvent objects
        """
        # Use fallback URL if primary failed previously
        if self._using_fallback:
            url = f"{config.cliproxy_url}/v1/chat/completions"
            model = config.cliproxy_model
        else:
            url = f"{config.lmstudio_url}/v1/chat/completions"
            model = config.model

        # Build messages for API
        oai_messages = []
        for msg in messages:
            # Handle both string and multimodal content
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
            logger.debug(f"Sending {len(tools)} tools to LLM")

        try:
            async with self._http_client.stream("POST", url, json=payload) as response:
                response.raise_for_status()

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
            # Try fallback to CLIProxyAPI if not already using it
            if not self._using_fallback:
                logger.info(f"LMStudio connection failed, trying CLIProxyAPI fallback...")
                self._using_fallback = True
                # Retry with fallback - recursive call with fallback flag set
                async for event in self.stream_completion(messages, tools, config):
                    yield event
                return

            yield AgentEvent(type="error", data={
                "message": f"Cannot connect to LLM server (tried {config.lmstudio_url} and {config.cliproxy_url})"
            })

        except httpx.HTTPStatusError as e:
            yield AgentEvent(type="error", data={
                "message": f"HTTP {e.response.status_code}: {e.response.text[:200]}"
            })

        except Exception as e:
            yield AgentEvent(type="error", data={
                "message": str(e)
            })
