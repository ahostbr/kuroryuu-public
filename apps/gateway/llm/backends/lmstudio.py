"""LM Studio Backend - OpenAI-compatible HTTP streaming."""

from __future__ import annotations

import json
import logging
import os
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional

import httpx

from .base import LLMBackend, LLMConfig, LLMMessage, StreamEvent

if TYPE_CHECKING:
    from apps.gateway.prompts.base import PromptBuilder

# Set up logging
logger = logging.getLogger("kuroryuu.gateway.lmstudio")
logger.setLevel(logging.DEBUG)


class LMStudioBackend(LLMBackend):
    """LM Studio backend using OpenAI-compatible API."""

    # Models known to support native tool calling
    NATIVE_TOOL_MODELS = ['qwen', 'llama-3', 'mistral', 'devstral', 'ministral']

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.base_url = (
            base_url
            or os.environ.get("KURORYUU_LMSTUDIO_BASE_URL")
            or os.environ.get("SOTS_LMSTUDIO_BASE")
            or "http://127.0.0.1:1234/v1"
        ).rstrip("/")
        self.default_model = (
            model
            or os.environ.get("KURORYUU_LMSTUDIO_MODEL")
            or os.environ.get("SOTS_LMSTUDIO_MODEL")
            or "mistralai/devstral-small-2-2512"
        )
    
    @property
    def name(self) -> str:
        return "lmstudio"
    
    @property
    def supports_native_tools(self) -> bool:
        """Check if default model supports native tool calling."""
        model_lower = self.default_model.lower()
        return any(p in model_lower for p in self.NATIVE_TOOL_MODELS)

    def model_supports_tools(self, model: Optional[str] = None) -> bool:
        """Check if specific model supports native tool calling."""
        model_lower = (model or self.default_model).lower()
        return any(p in model_lower for p in self.NATIVE_TOOL_MODELS)

    def get_prompt_builder(self, model: Optional[str] = None) -> "PromptBuilder":
        """Get the appropriate prompt builder for the model.

        Returns DevstralPromptBuilder for Devstral models, otherwise
        the default LMStudioPromptBuilder.
        """
        model_name = (model or self.default_model).lower()

        if "devstral" in model_name:
            from apps.gateway.prompts.devstral import DevstralPromptBuilder
            return DevstralPromptBuilder()

        # Default to LMStudio prompt builder
        from apps.gateway.prompts.lmstudio import LMStudioPromptBuilder
        return LMStudioPromptBuilder()

    def _get_request_headers(self) -> Dict[str, str]:
        """Get headers for HTTP requests. Override in subclasses for auth."""
        return {}

    async def stream_chat(
        self,
        messages: List[LLMMessage],
        config: LLMConfig,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Stream chat completion from LM Studio."""
        url = f"{self.base_url}/chat/completions"
        
        # Convert messages to OpenAI format
        oai_messages: List[Dict[str, Any]] = []
        for msg in messages:
            m: Dict[str, Any] = {"role": msg.role, "content": msg.content}
            if msg.name:
                m["name"] = msg.name
            if msg.tool_call_id:
                m["tool_call_id"] = msg.tool_call_id
            if msg.tool_calls:
                m["tool_calls"] = msg.tool_calls
            oai_messages.append(m)
        
        model = config.model or self.default_model
        logger.info(f"[LMStudio] Config model: '{config.model}' | Default: '{self.default_model}'")
        logger.info(f"[LMStudio] Using model: {model}")
        use_native_tools = self.model_supports_tools(model) and config.tools

        payload: Dict[str, Any] = {
            "model": model,
            "stream": True,
            "messages": oai_messages,
            "temperature": config.temperature,
        }
        if config.max_tokens:
            payload["max_tokens"] = config.max_tokens

        # Add native tools if model supports them
        if use_native_tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    },
                }
                for t in config.tools
            ]
            logger.info(f"[LMStudio] Native tools enabled: {[t.name for t in config.tools]}")

        # Add structured output format if provided
        if config.response_format:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": config.response_format.get("name", "response"),
                    "strict": True,
                    "schema": config.response_format.get("schema", config.response_format),
                },
            }
            logger.info("[LMStudio] Structured output enabled")
        
        logger.info(f"[LMStudio] Request to {url}")
        logger.info(f"[LMStudio] Model: {payload['model']}")
        logger.debug(f"[LMStudio] Messages: {len(oai_messages)} messages")
        
        # Generous timeout for slow local models
        timeout = httpx.Timeout(connect=30.0, read=300.0, write=30.0, pool=30.0)

        full_response = ""  # Collect full response for logging
        # Track streaming tool calls: {index: {"id": ..., "name": ..., "arguments": ""}}
        pending_tool_calls: Dict[int, Dict[str, Any]] = {}

        try:
            headers = self._get_request_headers()
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    response.raise_for_status()
                    logger.info(f"[LMStudio] Response status: {response.status_code}")

                    async for line in response.aiter_lines():
                        if not line:
                            continue

                        data = line[6:] if line.startswith("data: ") else line

                        if data.strip() == "[DONE]":
                            # Emit any pending tool calls before done
                            for tc in pending_tool_calls.values():
                                try:
                                    args = json.loads(tc["arguments"]) if tc["arguments"] else {}
                                except json.JSONDecodeError:
                                    args = {"raw": tc["arguments"]}
                                yield StreamEvent(
                                    type="tool_call",
                                    tool_name=tc["name"],
                                    tool_arguments=args,
                                    tool_id=tc["id"],
                                )
                            yield StreamEvent(type="done", stop_reason="end_turn")
                            return

                        try:
                            obj = json.loads(data)
                        except Exception:
                            continue

                        choice0 = (obj.get("choices") or [{}])[0]
                        delta = choice0.get("delta") or {}

                        # Handle text content
                        content = delta.get("content")
                        if content:
                            full_response += content
                            yield StreamEvent(type="delta", text=content)

                        # Handle streaming tool calls (OpenAI format)
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
                            # Emit any pending tool calls
                            for tc in pending_tool_calls.values():
                                try:
                                    args = json.loads(tc["arguments"]) if tc["arguments"] else {}
                                except json.JSONDecodeError:
                                    args = {"raw": tc["arguments"]}
                                logger.info(f"[LMStudio] Tool call: {tc['name']}")
                                yield StreamEvent(
                                    type="tool_call",
                                    tool_name=tc["name"],
                                    tool_arguments=args,
                                    tool_id=tc["id"],
                                )

                            usage = obj.get("usage")
                            logger.info(f"[LMStudio] Response complete. Length: {len(full_response)} chars")
                            if full_response:
                                logger.debug(f"[LMStudio] Full response:\n{full_response[:1000]}...")
                            yield StreamEvent(
                                type="done",
                                stop_reason=finish,
                                usage=usage,
                            )
                            return
            
            # If we exit without a done event, emit one
            logger.info(f"[LMStudio] Stream ended. Response length: {len(full_response)} chars")
            yield StreamEvent(type="done", stop_reason="end_turn")
            
        except httpx.HTTPStatusError as e:
            # Try to read error body for more context
            error_detail = ""
            try:
                error_body = await e.response.aread()
                if error_body:
                    try:
                        error_json = json.loads(error_body)
                        # OpenAI-style: {"error": {"message": "..."}}
                        error_detail = error_json.get("error", {}).get("message", "")
                        if not error_detail:
                            # FastAPI-style: {"detail": "..."}
                            error_detail = error_json.get("detail", "")
                        if not error_detail:
                            error_detail = str(error_body.decode()[:200])
                    except json.JSONDecodeError:
                        error_detail = error_body.decode()[:200]
            except Exception:
                pass

            base_msg = f"HTTP {e.response.status_code} from {self.name}"
            if error_detail:
                base_msg += f": {error_detail}"

            logger.warning(f"[{self.name}] {base_msg}")
            yield StreamEvent(
                type="error",
                error_message=base_msg,
                error_code="http_error",
            )
        except httpx.ConnectError:
            yield StreamEvent(
                type="error",
                error_message=f"Cannot connect to {self.name} at {self.base_url}",
                error_code="connection_error",
            )
        except Exception as e:
            yield StreamEvent(
                type="error",
                error_message=str(e),
                error_code="unknown_error",
            )
    
    async def health_check(self) -> Dict[str, Any]:
        """Check if LM Studio is reachable."""
        try:
            timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
            headers = self._get_request_headers()
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(f"{self.base_url}/models", headers=headers)
                resp.raise_for_status()
                models = resp.json().get("data", [])
                return {
                    "ok": True,
                    "backend": self.name,
                    "base_url": self.base_url,
                    "model_count": len(models),
                }
        except Exception as e:
            return {
                "ok": False,
                "backend": self.name,
                "base_url": self.base_url,
                "error": str(e),
            }
