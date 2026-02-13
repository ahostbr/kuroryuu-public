"""
Chat Proxy Router

Proxies chat messages to LM Studio (Devstral) or Claude API with streaming support.
- LM Studio: Pass-through to local Devstral model
- Claude: Anthropic API with bootstrap context injection

BUILD_14: Added Claude API support with automatic bootstrap injection.
"""
from __future__ import annotations

import os
import httpx
from pathlib import Path
from typing import Optional, List, Dict, Any, AsyncGenerator
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import json

router = APIRouter(prefix="/v1/chat", tags=["chat-proxy"])

# LM Studio default URL and model
LMSTUDIO_URL = os.environ.get("KURORYUU_LMSTUDIO_URL", "http://127.0.0.1:1234")
LMSTUDIO_MODEL = os.environ.get("KURORYUU_LMSTUDIO_MODEL", "mistralai/devstral-small-2-2512")

# CLIProxyAPI (multi-provider CLI proxy)
CLIPROXYAPI_URL = os.environ.get("KURORYUU_CLIPROXYAPI_URL", "http://127.0.0.1:8317")
CLIPROXYAPI_AUTH = "Bearer kuroryuu-local-key"

# Claude API
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = os.environ.get("KURORYUU_CLAUDE_MODEL", "claude-sonnet-4-20250514")

# Bootstrap injection
# Path: apps/gateway/chat_proxy.py -> go up to apps/ -> up to Kuroryuu/
REPO_ROOT = Path(__file__).parent.parent.parent  # apps/gateway -> apps -> Kuroryuu
BOOTSTRAP_PATH = REPO_ROOT / "KURORYUU_BOOTSTRAP.md"
_BOOTSTRAP_CACHE: Optional[str] = None


def get_bootstrap_content() -> str:
    """Load bootstrap content (cached)."""
    global _BOOTSTRAP_CACHE
    if _BOOTSTRAP_CACHE is None:
        if BOOTSTRAP_PATH.exists():
            _BOOTSTRAP_CACHE = BOOTSTRAP_PATH.read_text(encoding="utf-8")
        else:
            _BOOTSTRAP_CACHE = "# KURORYUU Bootstrap\nNo bootstrap file found."
    return _BOOTSTRAP_CACHE


def build_system_with_bootstrap(custom_system: Optional[str] = None) -> str:
    """Build system prompt with bootstrap injected."""
    bootstrap = get_bootstrap_content()
    base = f"""You are an agent in the Kuroryuu multi-agent system.

## MANDATORY BOOTSTRAP (READ FIRST)
{bootstrap}

## END BOOTSTRAP
"""
    if custom_system:
        base += f"\n## Agent-Specific Instructions\n{custom_system}"
    return base


class ChatMessage(BaseModel):
    """Single chat message."""
    role: str = Field(..., description="Role: user, assistant, system, tool")
    content: Any = Field(..., description="Message content: string or multimodal content blocks")
    tool_call_id: Optional[str] = Field(None, description="Tool call ID for tool responses")


class ChatRequest(BaseModel):
    """Chat completion request."""
    messages: List[ChatMessage]
    agent_id: Optional[str] = Field(None, description="Agent ID for session tracking")
    session_id: Optional[str] = Field(None, description="Session ID for persistence")
    stream: bool = Field(True, description="Enable streaming")
    temperature: float = Field(0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(None, ge=1)
    backend: str = Field("lmstudio", description="Backend: lmstudio | claude")
    inject_bootstrap: bool = Field(True, description="Inject bootstrap into system prompt")
    tools: Optional[List[Dict[str, Any]]] = Field(None, description="Tool definitions for native LM Studio tool calling")
    model: Optional[str] = Field(None, description="LM Studio model name (required if multiple models loaded)")


class ChatResponse(BaseModel):
    """Non-streaming chat response."""
    content: str
    agent_id: Optional[str] = None
    session_id: Optional[str] = None
    finish_reason: str = "stop"
    usage: Optional[Dict[str, int]] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None  # Native LM Studio tool calls


async def stream_lmstudio_response(
    messages: List[Dict[str, str]],
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    model: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Stream response from LM Studio."""
    async with httpx.AsyncClient(timeout=120) as client:
        payload = {
            "model": model or LMSTUDIO_MODEL,  # Required when multiple models loaded
            "messages": messages,
            "stream": True,
            "temperature": temperature,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if tools:
            payload["tools"] = tools  # LM Studio injects as [AVAILABLE_TOOLS]
        
        async with client.stream(
            "POST",
            f"{LMSTUDIO_URL}/v1/chat/completions",
            json=payload,
        ) as response:
            if response.status_code != 200:
                error_text = await response.aread()
                yield f"data: {json.dumps({'error': error_text.decode()})}\n\n"
                return
            
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data.strip() == "[DONE]":
                        yield "data: [DONE]\n\n"
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield f"data: {json.dumps({'content': content})}\n\n"
                    except json.JSONDecodeError:
                        continue


async def stream_cliproxyapi_response(
    messages: List[Dict[str, str]],
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    model: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Stream response from CLIProxyAPI (multi-provider CLI proxy)."""
    async with httpx.AsyncClient(timeout=120) as client:
        payload = {
            "model": model or "claude-sonnet-4-20250514",
            "messages": messages,
            "stream": True,
            "temperature": temperature,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if tools:
            payload["tools"] = tools

        async with client.stream(
            "POST",
            f"{CLIPROXYAPI_URL}/v1/chat/completions",
            json=payload,
            headers={"Authorization": CLIPROXYAPI_AUTH},
        ) as response:
            if response.status_code != 200:
                error_text = await response.aread()
                yield f"data: {json.dumps({'error': error_text.decode()})}\n\n"
                return

            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data.strip() == "[DONE]":
                        yield "data: [DONE]\n\n"
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield f"data: {json.dumps({'content': content})}\n\n"
                    except json.JSONDecodeError:
                        continue


@router.post("/proxy")
async def chat_proxy(request: ChatRequest):
    """Proxy chat to LM Studio, CLIProxyAPI, or Claude API.

    Streams response back via SSE if stream=True.
    Routes based on backend parameter:
    - lmstudio: Local LM Studio (Devstral)
    - cliproxyapi: Multi-provider CLI proxy (Claude, GPT, Gemini via OAuth)
    - claude: Direct Claude API

    BUILD_14: Injects bootstrap into system prompt automatically.
    """
    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    # BUILD_14: Inject bootstrap into system prompt
    if request.inject_bootstrap:
        # Find existing system message or create one
        system_idx = next((i for i, m in enumerate(messages) if m["role"] == "system"), None)
        if system_idx is not None:
            # Prepend bootstrap to existing system message
            messages[system_idx]["content"] = build_system_with_bootstrap(messages[system_idx]["content"])
        else:
            # Insert bootstrap system message at start
            messages.insert(0, {"role": "system", "content": build_system_with_bootstrap()})

    # Route based on backend
    backend = request.backend.lower() if request.backend else "lmstudio"

    if request.stream:
        if backend in ("cliproxyapi", "claude"):
            generator = stream_cliproxyapi_response(
                messages,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                tools=request.tools,
                model=request.model,
            )
        else:
            # Default to LM Studio
            generator = stream_lmstudio_response(
                messages,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                tools=request.tools,
                model=request.model,
            )

        return StreamingResponse(
            generator,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Agent-Id": request.agent_id or "",
                "X-Session-Id": request.session_id or "",
            }
        )
    else:
        # Non-streaming
        async with httpx.AsyncClient(timeout=120) as client:
            # Select URL and headers based on backend
            if backend in ("cliproxyapi", "claude"):
                url = f"{CLIPROXYAPI_URL}/v1/chat/completions"
                headers = {"Authorization": CLIPROXYAPI_AUTH}
                default_model = "claude-sonnet-4-20250514"
            else:
                url = f"{LMSTUDIO_URL}/v1/chat/completions"
                headers = {}
                default_model = LMSTUDIO_MODEL

            payload = {
                "model": request.model or default_model,
                "messages": messages,
                "stream": False,
                "temperature": request.temperature,
                "max_tokens": request.max_tokens,
            }
            if request.tools:
                payload["tools"] = request.tools

            response = await client.post(url, json=payload, headers=headers)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Backend error ({backend}): {response.text}"
                )
            
            data = response.json()
            message = data["choices"][0]["message"]
            content = message.get("content") or ""
            tool_calls = message.get("tool_calls")
            usage = data.get("usage")
            
            return ChatResponse(
                content=content,
                agent_id=request.agent_id,
                session_id=request.session_id,
                finish_reason=data["choices"][0].get("finish_reason", "stop"),
                usage=usage,
                tool_calls=tool_calls,
            )


@router.get("/lmstudio/health")
async def lmstudio_health():
    """Check LM Studio connection health."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{LMSTUDIO_URL}/v1/models")
            if response.status_code == 200:
                data = response.json()
                models = data.get("data", [])
                return {
                    "status": "connected",
                    "url": LMSTUDIO_URL,
                    "models": [m.get("id") for m in models],
                }
            else:
                return {
                    "status": "error",
                    "url": LMSTUDIO_URL,
                    "error": f"HTTP {response.status_code}",
                }
    except httpx.ConnectError:
        return {
            "status": "disconnected",
            "url": LMSTUDIO_URL,
            "error": "Connection refused",
        }
    except Exception as e:
        return {
            "status": "error",
            "url": LMSTUDIO_URL,
            "error": str(e),
        }
