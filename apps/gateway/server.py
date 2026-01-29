"""Gateway Server - FastAPI HTTP interface for AG-UI.

Endpoints:
- POST /v1/chat/stream - SSE streaming chat (legacy harness)
- POST /v2/chat/stream - SSE streaming chat (unified tool loop)
- GET /v1/health - Health check (backends + MCP)
- GET /v1/backends - List available backends
- POST /v1/mcp/call - Direct MCP tool invocation
- POST /v1/harness/invoke - Invoke a harness prompt (BUILD_9)
- /v1/agents/* - Agent registry (M2)
- /v1/agents/messages/* - Agent-to-agent messaging (direct communication)

Environment:
- KURORYUU_LLM_BACKEND: claude | lmstudio (default: lmstudio)
- KURORYUU_MCP_URL: MCP server URL (default: http://127.0.0.1:8100)
- KURORYUU_MAX_TOOL_CALLS: Max tool calls per request (default: 25, 0=unlimited)

See config.py for full list of environment variables.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import hashlib
import secrets
from pathlib import Path

# Centralized configuration (loads .env automatically)
from .config import config

from fastapi import FastAPI, Header, HTTPException, Cookie, Form, Response, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Auth config from centralized config (see config.py)
_AUTH_USERNAME = config.auth_username
_AUTH_PASSWORD_HASH = config.auth_password_hash
_auth_sessions: set[str] = set()

# LLM backends
from .llm import (
    AgentEvent,
    AgentHarness,
    LLMConfig,
    LLMMessage,
    LLMToolSchema,
    get_backend,
    get_backend_name,
    get_backends_chain,
    get_circuit_states,
    get_healthy_backend,
    get_last_healthy_backend,
    health_check_all,
    invalidate_health_cache,
    list_backends,
)

# Unified agent modules
from .agent import (
    InternalMessage,
    ToolLoop,
    ToolResult,
    ToolSchema,
    emit_harness_context,
    emit_harness_update,
    emit_sse_done,
)

# MCP client
from .mcp import get_mcp_client, MCPClient

# Harness
from .harness import (
    get_harness_store,
    # BUILD_13: Prime
    build_prime_context,
    build_prime_report,
    clear_prime_cache,
)

# BUILD_12: Hooks System
from .hooks import (
    HookEvent,
    HookPayload,
    HookResult,
    get_hooks_registry,
    execute_hooks_for_event,
    build_hook_payload,
    build_todo_context_block,
)

# Stateless Agent Architecture
from .context.run_id import generate_run_id, is_valid_run_id, validate_run_id_or_raise
from .context.run_manager import (
    create_run,
    get_current_run,
    save_context_pack,
    load_context_pack,
    update_current_run_heartbeat,
)

# M2: Agent Registry
from .agents.router import router as agents_router
from .agents.messaging_router import router as agent_messaging_router

# M3: Inbox
from .inbox.router import router as inbox_router

# M4: Orchestration
from .orchestration.router import router as orchestration_router

# M5: Chat Proxy (LM Studio/Devstral)
from .chat_proxy import router as chat_proxy_router, get_bootstrap_content

# M5: WebSocket for real-time agent status
from .websocket import router as websocket_router, broadcast_leader_message

# Traffic Monitoring (Network Visualization)
from .traffic.middleware import TrafficMonitoringMiddleware
from .traffic.router import router as traffic_router
from .traffic.websocket import websocket_traffic_flow

# PTY Traffic Monitoring
from .traffic.pty_router import router as pty_traffic_router
from .traffic.pty_websocket import websocket_pty_traffic

# Logging
from .utils.logging_config import setup_logging, get_logger

# M5: Sessions
from .sessions.router import router as sessions_router

# E1: Git Worktrees
from .worktrees.router import router as worktrees_router

# E3: Linear Integration
from .linear.router import router as linear_router

# E4: Repo Intel (AI-powered codebase analysis)
from .repo_intel.router import router as repo_intel_router

# E5: Context Management
from .context.router import router as context_router

# E6: Commands (/commit, /pr, etc.)
from .commands.router import router as commands_router

# E7: PRD Generation
from .prd.router import router as prd_router

# E8: Rules Learning
from .rules.router import router as rules_router

# Auth: GitHub OAuth token validation
from .auth.router import router as auth_router

# Sub-agent: Claude Code sub-agent config generation
from .subagent.router import router as subagent_router

# Chat history persistence for web UI
from .chat_history.router import router as chat_history_router

# Changelog: Git history and changelog generation
from .changelog.router import router as changelog_router

# Artifacts: Canvas artifact management
from .artifacts.router import router as artifacts_router

# Security
from .security.router import router as security_router

# System: Unified stats and health
from .system.router import router as system_router, redirect_router as system_redirect_router

# AG-UI Protocol: Human-in-the-loop interrupts
from .agui import (
    get_interrupt_store,
    InterruptReason,
    emit_run_started,
    emit_run_finished,
    emit_clarification_request,
)
# MCP server URL from centralized config (no longer duplicated)
MCP_URL = config.mcp_url



# ═══════════════════════════════════════════════════════════════════════════════
# BUILD_9: Slash Command Detection
# ═══════════════════════════════════════════════════════════════════════════════

SLASH_COMMANDS = {
    "/plan": "plan",
    "/execute": "execute",
    "/review": "review",
    "/validate": "validate",
    "/prime": "prime",
    "/p": "plan",  # Shorthand
    "/e": "execute",
    "/r": "review",
    "/v": "validate",
}


def detect_slash_command(user_message: str) -> Tuple[Optional[str], str]:
    """Detect slash command and return (prompt_name, remaining_message).
    
    Returns (None, original_message) if no slash command found.
    """
    msg = user_message.strip()
    msg_lower = msg.lower()
    
    for cmd, prompt_name in SLASH_COMMANDS.items():
        if msg_lower.startswith(cmd):
            # Extract remaining message after command
            remainder = msg[len(cmd):].strip()
            return prompt_name, remainder
    
    return None, msg


# ═══════════════════════════════════════════════════════════════════════════════
# BUILD_9: Auto-Evidence Detection
# ═══════════════════════════════════════════════════════════════════════════════

def detect_evidence_from_tools(
    tools_called: List[str],
    results_ok: List[bool],
    min_success_ratio: float = 0.5,
) -> bool:
    """Auto-detect if tool execution provides sufficient evidence.
    
    Evidence is considered present if:
    1. At least one tool was called
    2. At least min_success_ratio of calls succeeded
    
    Default requires 50% success rate.
    """
    if not tools_called:
        return False
    
    success_count = sum(1 for ok in results_ok if ok)
    success_ratio = success_count / len(results_ok)
    
    return success_ratio >= min_success_ratio


def should_auto_advance_feature(
    tools_called: List[str],
    results_ok: List[bool],
    user_message: str,
) -> bool:
    """Detect if user intent suggests feature completion.
    
    Returns True if:
    - Evidence exists from tools
    - User message contains completion signals
    """
    has_evidence = detect_evidence_from_tools(tools_called, results_ok)
    if not has_evidence:
        return False
    
    # Completion signal keywords
    completion_signals = [
        "done", "complete", "finished", "mark done",
        "mark complete", "next feature", "move on",
    ]
    
    msg_lower = user_message.lower()
    return any(signal in msg_lower for signal in completion_signals)


app = FastAPI(
    title="Kuroryuu Gateway",
    description="AG-UI compliant agent gateway with provider-agnostic LLM backends",
    version="0.12.0",  # M5 Complete: chat proxy, websocket, sessions
)

# CORS for web UI (configurable via KURORYUU_CORS_ORIGINS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Traffic monitoring middleware (for network visualization)
app.add_middleware(TrafficMonitoringMiddleware)

# M2: Include agent registry router
app.include_router(agents_router)

# M2: Include agent messaging router (direct agent-to-agent communication)
app.include_router(agent_messaging_router)

# M3: Include inbox router
app.include_router(inbox_router)

# M4: Include orchestration router
app.include_router(orchestration_router)

# M5: Include chat proxy router (LM Studio/Devstral)
app.include_router(chat_proxy_router)

# M5: Include WebSocket router
app.include_router(websocket_router)

# M5: Include sessions router
app.include_router(sessions_router)

# E1: Include worktrees router
app.include_router(worktrees_router)

# E3: Include Linear integration router
app.include_router(linear_router)

# E4: Include Repo Intel router
app.include_router(repo_intel_router)

# E5: Include Context Management router
app.include_router(context_router)

# E6: Include Commands router
app.include_router(commands_router)

# E7: Include PRD router
app.include_router(prd_router)

# E8: Include Rules router
app.include_router(rules_router)

# Auth: Include Auth router
app.include_router(auth_router)

# Sub-agent: Include sub-agent config router
app.include_router(subagent_router)

# Chat history: Include chat history persistence router
app.include_router(chat_history_router)

# Changelog: Include changelog generation router
app.include_router(changelog_router)

# Artifacts: Include canvas artifact management router
app.include_router(artifacts_router)

# Traffic: Include traffic monitoring router
app.include_router(traffic_router)

# PTY Traffic: Include PTY traffic monitoring router
app.include_router(pty_traffic_router)

# Security: Include security defense router
app.include_router(security_router)

# System: Include unified stats and health router
app.include_router(system_router)
app.include_router(system_redirect_router)  # Deprecated stats redirects

# ═══════════════════════════════════════════════════════════════════════════════
# Simple Auth Protection
# ═══════════════════════════════════════════════════════════════════════════════

_LOGIN_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark">
    <title>Login - Kuroryuu</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { 
            font-family: system-ui, -apple-system, sans-serif;
            background: #09090b;
            color: #fafafa;
            min-height: 100vh;
        }
        body {
            display: flex;
            align-items: center;
            justify-content: center;
            background: #09090b;
        }
        .login-box {
            background: #18181b;
            padding: 2.5rem;
            border-radius: 1rem;
            border: 1px solid #27272a;
            width: 100%;
            max-width: 380px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        h1 { color: #fafafa; font-size: 1.5rem; margin-bottom: 1.5rem; text-align: center; font-weight: 600; }
        .error { color: #fafafa; font-size: 0.875rem; margin-bottom: 1rem; text-align: center; background: #7f1d1d; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid #991b1b; }
        label { display: block; color: #a1a1aa; font-size: 0.875rem; margin-bottom: 0.5rem; }
        input { 
            width: 100%; padding: 0.75rem; margin-bottom: 1rem;
            background: #09090b; border: 1px solid #3f3f46;
            border-radius: 0.5rem; color: #fafafa; font-size: 1rem;
        }
        input:focus { outline: none; border-color: #71717a; background: #18181b; }
        input::placeholder { color: #52525b; }
        button {
            width: 100%; padding: 0.75rem; background: #fafafa;
            border: none; border-radius: 0.5rem; color: #09090b;
            font-size: 1rem; cursor: pointer; font-weight: 600;
            transition: background 0.2s;
        }
        button:hover { background: #e4e4e7; }
        .logo { width: 80px; height: 80px; margin: 0 auto 1rem; display: block; }
    </style>
</head>
<body>
    <div class="login-box">
        <img src="/sots_logo.png" alt="Kuroryuu" class="logo">
        <h1>Kuroryuu</h1>
        {error}
        <form method="post" action="/login">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" required autofocus placeholder="Enter username">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required placeholder="Enter password">
            <button type="submit">Sign In</button>
        </form>
    </div>
</body>
</html>
"""

def _check_auth(session_token: str | None) -> bool:
    """Check if session token is valid."""
    return session_token is not None and session_token in _auth_sessions

@app.get("/login")
async def login_page(error: str = ""):
    """Show login page."""
    error_html = f'<div class="error">{error}</div>' if error else ""
    return HTMLResponse(_LOGIN_HTML.replace("{error}", error_html))

@app.post("/login")
async def login_submit(response: Response, username: str = Form(...), password: str = Form(...)):
    """Handle login form submission."""
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    if username == _AUTH_USERNAME and password_hash == _AUTH_PASSWORD_HASH:
        # Create session
        token = secrets.token_urlsafe(32)
        _auth_sessions.add(token)
        resp = RedirectResponse(url="/", status_code=303)
        resp.set_cookie("kuroryuu_session", token, httponly=True, max_age=config.session_ttl_seconds)
        return resp
    return RedirectResponse(url="/login?error=Invalid+credentials", status_code=303)

@app.get("/logout")
async def logout(response: Response, kuroryuu_session: str = Cookie(None)):
    """Logout and clear session."""
    if kuroryuu_session in _auth_sessions:
        _auth_sessions.discard(kuroryuu_session)
    resp = RedirectResponse(url="/login", status_code=303)
    resp.delete_cookie("kuroryuu_session")
    return resp

# Static files: Serve web UI (MUST be defined LAST to not shadow API routes)
# We'll define these routes after all API routes using a sub-router with lower priority
_web_dist = Path(__file__).parent.parent / "web" / "dist"
_web_router = APIRouter()

if _web_dist.exists():
    # Mount static assets (no auth needed for CSS/JS)
    app.mount("/assets", StaticFiles(directory=str(_web_dist / "assets")), name="static")


# ═══════════════════════════════════════════════════════════════════════════════
# Request/Response Models
# ═══════════════════════════════════════════════════════════════════════════════

class ChatMessage(BaseModel):
    """Chat message in request."""
    role: str = Field(..., description="Message role: system, user, assistant, tool")
    content: str = Field(..., description="Message content")
    name: Optional[str] = Field(None, description="Tool name for tool messages")
    tool_call_id: Optional[str] = Field(None, description="Tool call ID for tool results")


class ChatRequest(BaseModel):
    """Chat completion request."""
    messages: List[ChatMessage] = Field(..., description="Conversation messages")
    model: Optional[str] = Field(None, description="Model override")
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(None, description="Max output tokens")
    tools: Optional[List[Dict[str, Any]]] = Field(None, description="Available tools")
    backend: Optional[str] = Field(None, description="Backend override: claude | lmstudio")
    extra: Optional[Dict[str, Any]] = Field(None, description="Extra params passed to backend (e.g., conversation_id)")


class MCPCallRequest(BaseModel):
    """Direct MCP tool call request."""
    tool: str = Field(..., description="Tool name")
    arguments: Dict[str, Any] = Field(default_factory=dict)



class ClarifyRequest(BaseModel):
    """Request to resolve a pending interrupt/clarification."""
    thread_id: str = Field(..., description="Thread ID from the interrupt")
    interrupt_id: str = Field(..., description="Interrupt ID to resolve")
    answer: Any = Field(..., description="User's answer (string, bool, dict, etc.)")
    modifications: Optional[Dict[str, Any]] = Field(None, description="Optional modifications")


class ClarifyResponse(BaseModel):
    """Response after resolving an interrupt."""
    ok: bool
    message: str
    interrupt_id: str
    answer: Any
# ═══════════════════════════════════════════════════════════════════════════════
# Global MCP Client
# ═══════════════════════════════════════════════════════════════════════════════

mcp_client = get_mcp_client()


# ═══════════════════════════════════════════════════════════════════════════════
# Tool Executors
# ═══════════════════════════════════════════════════════════════════════════════

async def execute_tool_legacy(name: str, arguments: Dict[str, Any]) -> str:
    """Execute a tool via MCP_CORE (legacy string result)."""
    result = await mcp_client.call_tool(name, arguments)
    if result.ok:
        return result.content if isinstance(result.content, str) else json.dumps(result.content)
    else:
        return f"Error: {result.error.get('message', 'Unknown error') if result.error else 'Unknown error'}"


async def execute_tool_v2(name: str, arguments: Dict[str, Any]) -> ToolResult:
    """Execute a tool via MCP_CORE (normalized ToolResult)."""
    return await mcp_client.call_tool(name, arguments)


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/v1/health")
async def health():
    """Health check for all components - simplified."""
    return {"ok": True, "status": "running", "version": app.version}


# ═══════════════════════════════════════════════════════════════════════════════
# Kuroryuu Chat Endpoint (Web Frontend - Gemma)
# ═══════════════════════════════════════════════════════════════════════════════

from apps.gateway.llm.backends.registry import (
    KURORYUU_SYSTEM_PROMPT,
    get_chat_backend,
    check_chat_backend_available,
)


class KuroryuuChatRequest(BaseModel):
    """Simple chat request for Kuroryuu."""
    message: str
    history: List[Dict[str, str]] = []  # [{"role": "user/assistant", "content": "..."}]


@app.get("/v1/kuroryuu/status")
async def kuroryuu_status():
    """Check if Kuroryuu (chat model) is awake."""
    available = await check_chat_backend_available()
    return {"available": available, "sleeping": not available}


@app.post("/v1/kuroryuu/chat")
async def kuroryuu_chat(req: KuroryuuChatRequest):
    """Chat with Kuroryuu - returns sleeping status if model unavailable.

    Response format:
    - If sleeping: {"sleeping": true}
    - If awake: SSE stream with delta events
    """
    # Check if Kuroryuu is awake
    available = await check_chat_backend_available()
    if not available:
        return JSONResponse(
            content={"sleeping": True, "message": "Kuroryuu is sleeping..."},
            status_code=503,
            headers={"Retry-After": "30"},
        )

    # Build messages with system prompt
    messages = [LLMMessage(role="system", content=KURORYUU_SYSTEM_PROMPT)]

    # Add history
    for h in req.history:
        messages.append(LLMMessage(role=h.get("role", "user"), content=h.get("content", "")))

    # Add current message
    messages.append(LLMMessage(role="user", content=req.message))

    # Get chat backend (Gemma)
    backend = get_chat_backend()
    config = LLMConfig(model=backend.default_model, temperature=0.8, max_tokens=500)

    async def stream_kuroryuu():
        """Stream Kuroryuu's response."""
        try:
            async for event in backend.stream_chat(messages, config):
                if event.type == "delta" and event.text:
                    yield f"data: {json.dumps({'type': 'delta', 'text': event.text})}\n\n"
                elif event.type == "done":
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                elif event.type == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': event.error_message})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream_kuroryuu(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Kuroryuu-Model": backend.default_model,
        },
    )


@app.get("/v1/backends")
async def backends():
    """List available LLM backends."""
    return {
        "active": get_backend_name(),
        "backends": list_backends(),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Backend Management API (Fallback Chain & Circuit Breaker)
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/backends")
async def api_backends():
    """List all backends with health status and circuit breaker state.

    Returns comprehensive backend info including:
    - Health status for each backend
    - Circuit breaker state
    - Fallback chain configuration
    """
    health = await health_check_all()
    circuits = get_circuit_states()

    result = {}
    for name in list_backends():
        result[name] = {
            "health": health.get(name, {"ok": False, "error": "Unknown"}),
            "circuit": circuits.get(name, {}),
        }

    return {
        "ok": True,
        "active": get_backend_name(),
        "last_healthy": get_last_healthy_backend(),
        "fallback_chain": get_backends_chain(),
        "backends": result,
    }


@app.get("/api/backends/current")
async def api_backends_current():
    """Get currently active backend (first healthy from fallback chain).

    Uses circuit breaker pattern to skip unhealthy backends.
    Returns the backend that would be used for the next request.
    """
    try:
        backend = await get_healthy_backend()
        return {
            "ok": True,
            "backend": backend.name,
            "base_url": backend.base_url,
            "model": backend.default_model,
            "supports_native_tools": backend.supports_native_tools,
        }
    except RuntimeError as e:
        return {
            "ok": False,
            "error": str(e),
            "fallback_chain": get_backends_chain(),
            "circuits": get_circuit_states(),
        }


@app.post("/api/backends/invalidate")
async def api_backends_invalidate(backend: Optional[str] = None):
    """Force health re-check on next request.

    Clears health cache to ensure fresh health check.

    Args:
        backend: Specific backend to invalidate, or None for all.
    """
    invalidate_health_cache(backend)
    return {
        "ok": True,
        "invalidated": backend or "all",
        "message": f"Health cache invalidated for {backend or 'all backends'}",
    }


@app.get("/v1/tools")
async def tools():
    """List available MCP tools."""
    try:
        tool_list = await mcp_client.list_tools()
        # Convert ToolSchema to dict for JSON response
        return {"tools": [{"name": t.name, "description": t.description, "inputSchema": t.input_schema} for t in tool_list]}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"MCP unavailable: {e}")


@app.post("/v1/mcp/call")
async def mcp_call(req: MCPCallRequest):
    """Direct MCP tool invocation."""
    try:
        result = await execute_tool_legacy(req.tool, req.arguments)
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# Harness Endpoints
# ═══════════════════════════════════════════════════════════════════════════════
# Harness Prompt Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/v1/harness/prompts")
async def harness_prompts():
    """List available harness prompts."""
    store = get_harness_store()
    prompts = store.list_prompts()
    return {
        "prompts": prompts,
        "slash_commands": SLASH_COMMANDS,  # BUILD_9: Include command mappings
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Todo.md Append Endpoint (for Add Feature flow)
# ═══════════════════════════════════════════════════════════════════════════════

class TodoAppendRequest(BaseModel):
    """Request to append content to todo.md."""
    content: str = Field(..., description="Content to append to todo.md")


@app.post("/v1/todo/append")
async def todo_append(req: TodoAppendRequest):
    """Append content to ai/todo.md.

    Used by Dojo "Add Feature" to insert feature notes that
    instruct agents to run plan-feature.md workflow.
    """
    from pathlib import Path

    # Get todo.md path from harness directory
    todo_path = Path(__file__).parent.parent.parent / "ai" / "todo.md"

    if not todo_path.exists():
        return {"ok": False, "error": f"todo.md not found at {todo_path}"}

    try:
        # Append content to todo.md
        with open(todo_path, "a", encoding="utf-8") as f:
            f.write("\n")
            f.write(req.content)
            f.write("\n")

        return {
            "ok": True,
            "message": "Content appended to todo.md",
            "path": str(todo_path),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/v1/harness/prompts/{name}")
async def harness_prompt(name: str):
    """Get a specific harness prompt."""
    store = get_harness_store()
    content = store.load_prompt(name)
    if not content:
        raise HTTPException(status_code=404, detail=f"Prompt '{name}' not found")
    return {"name": name, "content": content}


# ═══════════════════════════════════════════════════════════════════════════════
# BUILD_9: Prompt Invocation Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

class InvokePromptRequest(BaseModel):
    """Request to invoke a harness prompt."""
    name: str = Field(..., description="Prompt name (e.g., 'plan', 'execute')")
    context: Optional[str] = Field(None, description="Additional context to append")


@app.post("/v1/harness/invoke")
async def harness_invoke_prompt(req: InvokePromptRequest):
    """Invoke a harness prompt and return enriched content.

    BUILD_9: Prompts as pseudo-tools - returns prompt content ready for LLM injection.
    """
    store = get_harness_store()
    content = store.load_prompt(req.name)

    if not content:
        raise HTTPException(status_code=404, detail=f"Prompt '{req.name}' not found")

    # Enrich prompt with user context if provided
    enriched_content = content

    if req.context:
        enriched_content += f"\n\n## User Context\n{req.context}"

    return {
        "name": req.name,
        "content": enriched_content,
        "message": f"Loaded prompt '{req.name}'",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# BUILD_10: Checkpoint Endpoints
# ═══════════════════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════════════════
# BUILD_13: Prime Endpoint (U-P-G-E-V-R Context Loader)
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/v1/harness/prime")
async def harness_prime(force_refresh: bool = False, format: str = "json"):
    """Load comprehensive project context for /prime command.
    
    BUILD_13: Bootstrap-aware context loader.
    KURORYUU_BOOTSTRAP.md is THE authority - this gathers state.
    
    Args:
        force_refresh: Bypass cache and rebuild context
        format: "json" (default) or "report" (formatted markdown)
    
    Returns:
        Context block with harness, repo_intel, git state, and alerts.
        Includes staleness warnings if repo_intel is >24h old.
    """
    context = build_prime_context(force_refresh=force_refresh)
    
    if format == "report":
        return {
            "ok": True,
            "report": build_prime_report(context),
            "alerts": context.get("alerts", []),
            "cached": context.get("cached", False),
        }
    
    return context


@app.post("/v1/harness/prime/clear-cache")
async def harness_prime_clear_cache():
    """Clear the prime context cache.
    
    BUILD_13: Force next /prime call to rebuild context.
    """
    clear_prime_cache()
    return {"ok": True, "message": "Prime cache cleared"}


# ═══════════════════════════════════════════════════════════════════════════════
# BUILD_12: Hooks Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/v1/hooks")
async def hooks_list():
    """List all registered hooks.
    
    BUILD_12: Returns hook definitions from ai/hooks.json.
    """
    registry = get_hooks_registry()
    config = registry.config
    
    return {
        "enabled": registry.enabled,
        "spec_version": config.spec_version,
        "hooks": [
            {
                "id": h.id,
                "event": h.event.value if hasattr(h.event, "value") else h.event,
                "type": h.type.value if hasattr(h.type, "value") else h.type,
                "target": h.target,
                "priority": h.priority,
                "enabled": h.enabled,
            }
            for h in config.hooks
        ],
    }


@app.get("/v1/hooks/{hook_id}")
async def hooks_get(hook_id: str):
    """Get a specific hook configuration.
    
    BUILD_12: Returns hook details by ID.
    """
    registry = get_hooks_registry()
    
    for h in registry.config.hooks:
        if h.id == hook_id:
            return {
                "id": h.id,
                "event": h.event.value if hasattr(h.event, "value") else h.event,
                "type": h.type.value if hasattr(h.type, "value") else h.type,
                "target": h.target,
                "priority": h.priority,
                "enabled": h.enabled,
                "timeout_ms": h.timeout_ms,
                "continue_on_error": h.continue_on_error,
            }
    
    raise HTTPException(status_code=404, detail=f"Hook '{hook_id}' not found")


class HookEnableRequest(BaseModel):
    """Request to enable/disable a hook."""
    enabled: bool


@app.put("/v1/hooks/{hook_id}")
async def hooks_update(hook_id: str, req: HookEnableRequest):
    """Enable or disable a hook.
    
    BUILD_12: Updates hook enabled state in ai/hooks.json.
    """
    registry = get_hooks_registry()
    
    if registry.set_hook_enabled(hook_id, req.enabled):
        return {"ok": True, "message": f"Hook '{hook_id}' {'enabled' if req.enabled else 'disabled'}"}
    
    raise HTTPException(status_code=404, detail=f"Hook '{hook_id}' not found")


@app.get("/v1/hooks/todo/context")
async def hooks_todo_context():
    """Get the current todo context block.
    
    BUILD_12: Returns the todo.md summary for system prompt injection.
    """
    return {
        "context": build_todo_context_block(),
    }


class HookFireRequest(BaseModel):
    """Request to manually fire a hook event."""
    event: str = Field(..., description="Hook event name (e.g., 'Kuroryuu.SessionStart')")
    data: Dict[str, Any] = Field(default_factory=dict, description="Event-specific data")


@app.post("/v1/hooks/fire")
async def hooks_fire(req: HookFireRequest):
    """Manually fire a hook event for testing.
    
    BUILD_12: Executes all hooks for the specified event.
    """
    try:
        event = HookEvent(req.event)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid event: {req.event}")
    
    payload = build_hook_payload(event, data=req.data)
    result, _ = execute_hooks_for_event(event, payload)
    
    return {
        "ok": result.ok,
        "allow": result.allow,
        "block_reason": result.block_reason,
        "notes": [{"level": n.level, "message": n.message} for n in result.notes],
        "inject_context": result.inject_context,
    }


@app.post("/v1/chat/stream")
async def chat_stream(req: ChatRequest):
    """Streaming chat completion with tool execution.
    
    Returns Server-Sent Events (SSE) stream.
    """
    # Convert messages
    messages = [
        LLMMessage(
            role=m.role,
            content=m.content,
            name=m.name,
            tool_call_id=m.tool_call_id,
        )
        for m in req.messages
    ]
    
    # Build tool schemas from MCP tools
    tool_schemas: List[LLMToolSchema] = []
    if req.tools:
        # Use provided tools
        for t in req.tools:
            tool_schemas.append(LLMToolSchema(
                name=t.get("name", ""),
                description=t.get("description", ""),
                parameters=t.get("inputSchema", t.get("parameters", {})),
            ))
    else:
        # Fetch from MCP
        try:
            mcp_tools = await mcp_client.list_tools()
            for t in mcp_tools:
                tool_schemas.append(LLMToolSchema(
                    name=t.name,
                    description=t.description,
                    parameters=t.input_schema,
                ))
        except Exception:
            pass  # No tools available
    
    config = LLMConfig(
        model=req.model or "",
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        tools=tool_schemas,
    )
    
    # Create harness - use request backend if provided, otherwise use fallback chain
    if req.backend:
        selected_backend = get_backend(req.backend)
    else:
        try:
            selected_backend = await get_healthy_backend()
        except RuntimeError:
            selected_backend = get_backend()  # Fall back to default
    harness = AgentHarness(
        backend=selected_backend,
        tool_executor=execute_tool_legacy,
    )
    
    async def event_generator():
        """Generate SSE events."""
        try:
            # Emit model/backend metadata at start of stream
            yield f"data: {json.dumps({'type': 'metadata', 'backend': selected_backend.name, 'model': req.model})}\n\n"

            async for event in harness.run(messages, config):
                if event.type == "text_delta":
                    yield f"data: {json.dumps({'type': 'delta', 'text': event.data})}\n\n"
                
                elif event.type == "tool_start":
                    tc = event.data
                    yield f"data: {json.dumps({'type': 'tool_start', 'name': tc.name, 'id': tc.id})}\n\n"
                
                elif event.type == "tool_end":
                    tr = event.data
                    yield f"data: {json.dumps({'type': 'tool_end', 'id': tr.tool_call_id, 'is_error': tr.is_error})}\n\n"
                
                elif event.type == "done":
                    yield f"data: {json.dumps({'type': 'done', **event.data})}\n\n"
                
                elif event.type == "error":
                    yield f"data: {json.dumps({'type': 'error', **event.data})}\n\n"
            
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# M1: Direct Mode - Pure LLM Passthrough
# ═══════════════════════════════════════════════════════════════════════════════

async def _chat_stream_direct(req: ChatRequest) -> StreamingResponse:
    """Direct mode: bypass harness/inbox for pure LM Studio testing.
    
    M1 implementation for Multi-Agent Message Bus plan.
    - No harness context injection
    - No tools/MCP
    - No hooks
    - No slash commands
    - Pure streaming chat passthrough to LLM backend
    
    This is the foundation for Direct Mode toggle in UI.
    """
    # Convert messages to internal format - no context injection
    messages: List[InternalMessage] = []
    
    for m in req.messages:
        messages.append(InternalMessage(
            role=m.role,
            content=m.content,
            name=m.name,
            tool_call_id=m.tool_call_id,
        ))
    
    # Create tool loop with no tools (pure chat) - use request backend if provided
    if req.backend:
        selected_backend = get_backend(req.backend)
    else:
        try:
            selected_backend = await get_healthy_backend()
        except RuntimeError:
            selected_backend = get_backend()  # Fall back to default
    logger.info(f"[Direct Mode] Creating ToolLoop with model='{req.model}' backend='{selected_backend.name}'")
    loop = ToolLoop(
        backend=selected_backend,
        tool_executor=execute_tool_v2,  # Won't be called since no tools
        tools=[],  # No tools in direct mode
        model=req.model,  # Pass model from request
    )
    
    async def event_generator():
        """Generate SSE events from direct chat (no tools)."""
        try:
            # Emit model/backend metadata at start of stream
            yield f"data: {json.dumps({'type': 'metadata', 'backend': selected_backend.name, 'model': req.model})}\n\n"

            # Emit direct mode indicator
            yield f"data: {json.dumps({'type': 'info', 'message': 'Direct Mode: Bypassing harness/inbox'})}\n\n"

            # Run tool loop (will just do chat since no tools)
            async for event in loop.run(
                messages,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
            ):
                yield event.to_sse()
            
            yield emit_sse_done()
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            yield emit_sse_done()
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# V2 Endpoint - Unified Tool Loop with Harness
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/v2/chat/stream")
async def chat_stream_v2(
    req: ChatRequest,
    direct: bool = False,
    x_agent_role: Optional[str] = Header(None, alias="X-Agent-Role"),
    x_agent_run_id: Optional[str] = Header(None, alias="X-Agent-Run-Id"),
    x_worker_id: Optional[str] = Header(None, alias="X-Worker-Id"),
):
    """Streaming chat with unified tool loop (provider-agnostic).
    
    Returns Server-Sent Events (SSE) stream using the normalized
    ToolLoop that works identically for LM Studio and Claude.
    
    Query Parameters:
    - direct: bool = False - When True, bypass harness/inbox for pure LM Studio testing.
                             No context injection, no tools, just raw chat.
    
    Headers (Stateless Architecture):
    - X-Agent-Role: "leader" (default) or "worker"
    - X-Agent-Run-Id: Run ID for worker coordination (generated for leader if missing)
    - X-Worker-Id: Worker identifier for leader-controlled config (tool limits, etc.)
    
    Harness integration (when direct=False):
    - Injects active feature context into system prompt
    - Appends progress entry after tool loop completion
    - Emits harness_context event at start
    
    BUILD_9 features:
    - Slash command detection (/plan, /execute, /review, /validate)
    - Auto-evidence detection from tool results
    - Prompt injection for slash commands
    
    BUILD_12 features:
    - Hooks system integration (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse)
    - Todo source-of-truth context injection
    
    M1 Direct Mode (BUILD_XX):
    - When direct=True: Skip harness, hooks, tools, context injection
    - Pure passthrough to LLM backend for solo testing
    
    Stateless Architecture:
    - Leaders: Generate run_id, create run folder, update heartbeat, full state access
    - Workers: Require run_id, load context_pack from run folder, no direct ai/* access
    """
    # M1: Direct Mode - bypass all orchestration
    if direct:
        return await _chat_stream_direct(req)
    
    # Stateless Architecture: Extract and validate role/run_id
    agent_role = (x_agent_role or "leader").lower()
    if agent_role not in ("leader", "worker"):
        raise HTTPException(status_code=400, detail=f"Invalid X-Agent-Role: {agent_role}")
    
    agent_run_id = x_agent_run_id or ""
    
    # Role-specific run management
    if agent_role == "worker":
        # Workers MUST have a run_id
        if not agent_run_id:
            raise HTTPException(status_code=400, detail="X-Agent-Run-Id required for worker role")
        try:
            validate_run_id_or_raise(agent_run_id)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Workers load context from run folder (not ai/*)
        context_pack = load_context_pack(agent_run_id)
        if context_pack is None:
            raise HTTPException(status_code=404, detail=f"No context_pack.json found for run: {agent_run_id}")
    else:
        # Leader: generate run_id if not provided
        if not agent_run_id:
            agent_run_id = generate_run_id()
            create_run(agent_run_id)  # Create run folder structure
        else:
            try:
                validate_run_id_or_raise(agent_run_id)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        
        # Update heartbeat for leader
        update_current_run_heartbeat()
    
    # Load harness store for prompts
    harness = get_harness_store()
    harness_ctx = ""  # No harness context injection (features removed)
    active_feature = None  # Features removed - this prevents NameError in closures

    # Track tool calls for progress
    tools_called: List[str] = []
    tool_results_ok: List[bool] = []
    
    # BUILD_12: Fire SessionStart hook
    session_id = str(id(req))[:8]  # Simple session ID from request object
    hooks_registry = get_hooks_registry()
    
    if hooks_registry.enabled:
        session_payload = build_hook_payload(
            HookEvent.SESSION_START,
            session_id=session_id,
            active_feature_id=None,
            agent_role=agent_role,
            agent_run_id=agent_run_id,
        )
        session_result, _ = execute_hooks_for_event(HookEvent.SESSION_START, session_payload)
    
    # BUILD_9: Detect slash command in last user message
    slash_prompt_name: Optional[str] = None
    slash_prompt_content: Optional[str] = None
    user_remainder: str = ""
    
    # Find last user message for slash command detection
    last_user_msg = None
    for m in reversed(req.messages):
        if m.role == "user":
            last_user_msg = m
            break
    
    if last_user_msg:
        slash_prompt_name, user_remainder = detect_slash_command(last_user_msg.content)
        if slash_prompt_name:
            slash_prompt_content = harness.load_prompt(slash_prompt_name)
    
    # BUILD_12: Fire UserPromptSubmit hook
    hook_context_injection: Optional[str] = None
    if hooks_registry.enabled and last_user_msg:
        prompt_payload = build_hook_payload(
            HookEvent.USER_PROMPT_SUBMIT,
            session_id=session_id,
            active_feature_id=None,
            data={"prompt": last_user_msg.content},
            agent_role=agent_role,
            agent_run_id=agent_run_id,
        )
        prompt_result, _ = execute_hooks_for_event(HookEvent.USER_PROMPT_SUBMIT, prompt_payload)
        
        # Check if hooks blocked the request
        if not prompt_result.allow:
            # Return blocked response
            async def blocked_generator():
                yield f"data: {json.dumps({'type': 'error', 'message': f'Blocked by hook: {prompt_result.block_reason}'})}\n\n"
                yield emit_sse_done()
            
            return StreamingResponse(
                blocked_generator(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
            )
        
        # Capture context to inject
        hook_context_injection = prompt_result.inject_context
    
    # Convert messages to internal format
    messages: List[InternalMessage] = []
    
    # Build system message with harness context + optional prompt injection + BUILD_12 hook context
    # Include bootstrap for tool calling format
    bootstrap_content = get_bootstrap_content()
    system_content_parts = [f"## KURORYUU BOOTSTRAP\n{bootstrap_content}\n## END BOOTSTRAP", harness_ctx]
    
    if slash_prompt_content:
        system_content_parts.append(f"\n\n## Loaded Prompt: /{slash_prompt_name}\n{slash_prompt_content}")
    
    # BUILD_12: Add todo context from hook
    if hook_context_injection:
        system_content_parts.append(hook_context_injection)
    
    combined_system = "\n".join(system_content_parts)
    
    # Inject harness context as system message if not already present
    has_system = any(m.role == "system" for m in req.messages)
    if not has_system:
        messages.append(InternalMessage(
            role="system",
            content=combined_system,
        ))
    
    for m in req.messages:
        content = m.content
        
        # Append harness context to existing system message
        if m.role == "system":
            content = f"{m.content}\n\n{combined_system}"
            has_system = True
        
        # BUILD_9: Replace user message content if slash command was used
        if m.role == "user" and m == last_user_msg and slash_prompt_name:
            # Keep original intent but note the command
            if user_remainder:
                content = f"[Using /{slash_prompt_name} prompt]\n\n{user_remainder}"
            else:
                content = f"[Using /{slash_prompt_name} prompt] Please proceed with the {slash_prompt_name} workflow."
        
        messages.append(InternalMessage(
            role=m.role,
            content=content,
            name=m.name,
            tool_call_id=m.tool_call_id,
        ))
    
    # Get tools from MCP
    tools: List[ToolSchema] = []
    if req.tools:
        for t in req.tools:
            tools.append(ToolSchema(
                name=t.get("name", ""),
                description=t.get("description", ""),
                input_schema=t.get("inputSchema", t.get("parameters", {})),
            ))
    else:
        try:
            tools = await mcp_client.list_tools()
        except Exception:
            pass  # No tools available
    
    # Wrap tool executor to track calls + BUILD_12 hooks
    async def tracking_executor(name: str, arguments: dict) -> ToolResult:
        # BUILD_12: Fire PreToolUse hook
        if hooks_registry.enabled:
            pre_payload = build_hook_payload(
                HookEvent.PRE_TOOL_USE,
                session_id=session_id,
                active_feature_id=active_feature.id if active_feature else None,
                data={"tool": {"name": name, "arguments": arguments}},
                agent_role=agent_role,
                agent_run_id=agent_run_id,
            )
            pre_result, _ = execute_hooks_for_event(HookEvent.PRE_TOOL_USE, pre_payload)
            
            # Check if hooks blocked the tool call
            if not pre_result.allow:
                return ToolResult(
                    ok=False,
                    content=f"Blocked by hook: {pre_result.block_reason}",
                    error={"code": "hook_blocked", "message": pre_result.block_reason},
                )
        
        # Execute the tool
        result = await execute_tool_v2(name, arguments)
        tools_called.append(name)
        tool_results_ok.append(result.ok)
        
        # BUILD_12: Fire PostToolUse hook
        if hooks_registry.enabled:
            post_payload = build_hook_payload(
                HookEvent.POST_TOOL_USE,
                session_id=session_id,
                active_feature_id=active_feature.id if active_feature else None,
                data={
                    "tool": {"name": name, "arguments": arguments},
                    "result": {"ok": result.ok, "content": str(result.content)[:500]},
                },
                agent_role=agent_role,
                agent_run_id=agent_run_id,
            )
            execute_hooks_for_event(HookEvent.POST_TOOL_USE, post_payload)
        
        return result
    
    # Create tool loop - use request backend if provided
    # Worker ID for leader-controlled limits (derived from header or run_id)
    worker_id = x_worker_id or (agent_run_id if agent_role == "worker" else None)
    selected_backend = get_backend(req.backend) if req.backend else get_backend()
    loop = ToolLoop(
        backend=selected_backend,
        tool_executor=tracking_executor,
        tools=tools,
        worker_id=worker_id,
        model=req.model,  # Pass model from request
        extra=req.extra,  # Pass extra params (e.g., conversation_id for PTY backend)
    )
    
    async def event_generator():
        """Generate SSE events from unified tool loop."""
        try:
            # Emit model/backend metadata at start of stream
            # This enables frontend to display actual model/provider info
            yield f"data: {json.dumps({'type': 'metadata', 'backend': selected_backend.name, 'model': req.model})}\n\n"

            # Emit harness context at start
            if active_feature:
                yield emit_harness_context(
                    active_feature.id,
                    active_feature.title,
                    active_feature.status,
                ).to_sse()

            # BUILD_9: Emit slash command notification if detected
            if slash_prompt_name:
                yield emit_harness_update(
                    "slash_command_loaded",
                    f"Loaded /{slash_prompt_name} prompt into context"
                ).to_sse()
            
            # Run tool loop
            async for event in loop.run(
                messages,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
            ):
                yield event.to_sse()
            
            # BUILD_9: Auto-evidence detection
            has_evidence = detect_evidence_from_tools(tools_called, tool_results_ok)
            
            # Append progress entry after loop completes
            if tools_called and active_feature:
                success_count = sum(1 for ok in tool_results_ok if ok)
                fail_count = len(tool_results_ok) - success_count
                
            yield emit_sse_done()
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            yield emit_sse_done()
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )



# ═══════════════════════════════════════════════════════════════════════════════
# AG-UI Human-in-the-Loop: Clarification Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/v2/chat/clarify")
async def chat_clarify(req: ClarifyRequest) -> ClarifyResponse:
    """Resolve a pending interrupt/clarification request.
    
    This endpoint is called by the UI when the user responds to a
    clarification_request event. The answer is stored and can be
    retrieved by the agent to continue processing.
    
    AG-UI Protocol Reference:
    - https://docs.ag-ui.com/drafts/interrupts
    
    Flow:
    1. Agent calls ask_user tool → returns pending=True
    2. Gateway emits clarification_request SSE event
    3. UI renders interactive prompt
    4. User responds → UI calls this endpoint
    5. Gateway stores answer
    6. Next agent request can retrieve answer from context
    
    Note: Only leader agents can create interrupts. Workers must
    return "needs X" to the leader if they lack information.
    """
    interrupt_store = get_interrupt_store()
    
    # Resolve the interrupt
    response = interrupt_store.resolve_interrupt(
        thread_id=req.thread_id,
        interrupt_id=req.interrupt_id,
        answer=req.answer,
        modifications=req.modifications,
    )
    
    if response is None:
        raise HTTPException(
            status_code=404,
            detail=f"Interrupt not found: {req.interrupt_id} in thread {req.thread_id}"
        )
    
    return ClarifyResponse(
        ok=True,
        message="Clarification received",
        interrupt_id=req.interrupt_id,
        answer=req.answer,
    )


@app.get("/v2/chat/interrupts/{thread_id}")
async def get_pending_interrupts(thread_id: str):
    """Get all pending interrupts for a thread.
    
    Returns list of unresolved clarification requests that the UI
    should render for user input.
    """
    interrupt_store = get_interrupt_store()
    pending = interrupt_store.get_pending(thread_id)
    
    return {
        "ok": True,
        "thread_id": thread_id,
        "pending_count": len(pending),
        "interrupts": [
            {
                "interrupt_id": p.request.interrupt_id,
                "reason": p.request.reason.value,
                "question": p.request.payload.question,
                "options": p.request.payload.options,
                "input_type": p.request.payload.input_type,
                "context": p.request.payload.context,
                "created_at": p.created_at.isoformat(),
            }
            for p in pending
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Leader-to-Worker Message Injection (M5)
# ═══════════════════════════════════════════════════════════════════════════════

# In-memory queue for leader messages to workers
# Structure: { worker_id: [{ id, content, timestamp, from_leader, read }] }
_leader_message_queue: Dict[str, List[Dict[str, Any]]] = {}


class LeaderInjectRequest(BaseModel):
    """Request from leader to inject message/command into agent or terminal."""
    target_id: str = Field(..., description="Target agent ID or terminal ID")
    target_type: str = Field(default="agent", description="Type: 'agent' (chat) or 'terminal' (PTY)")
    content: str = Field(..., description="Message content or shell command")
    message_type: str = Field(default="instruction", description="For agent: instruction, bootstrap, task. For terminal: command")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Optional metadata")
    # Backwards compatibility aliases
    worker_id: Optional[str] = Field(default=None, description="Deprecated: use target_id")
    message: Optional[str] = Field(default=None, description="Deprecated: use content")


class LeaderInjectResponse(BaseModel):
    """Response after injecting message/command."""
    ok: bool
    message_id: str
    target_id: str
    target_type: str
    queued_at: str


@app.post("/v1/leader/inject", response_model=LeaderInjectResponse)
async def leader_inject_message(req: LeaderInjectRequest):
    """Leader injects a message/command into an agent's chat or terminal PTY.

    target_type='agent': Message appears in chat UI, triggers AI response
    target_type='terminal': Command written directly to PTY stdin

    Messages are stored durably in k_inbox, then notification pushed via WebSocket.
    Workers claim from inbox to process.
    """
    from datetime import datetime

    timestamp = datetime.now().isoformat()

    # Backwards compatibility: use worker_id/message if target_id/content not provided
    target_id = req.target_id or req.worker_id or "default"
    content = req.content or req.message or ""
    target_type = req.target_type or "agent"

    # Build payload for durable storage
    payload = {
        "content": content,
        "type": req.message_type,
        "target_type": target_type,
        "target_id": target_id,
        "from_leader": True,
        "metadata": req.metadata or {},
    }

    # Store durably in k_inbox
    inbox_result = await execute_tool_v2("k_inbox", {
        "action": "send",
        "title": f"Leader message to {target_id}",
        "payload": payload,
        "thread_id": f"leader-{target_id}",
    })

    if not inbox_result.ok:
        # Fallback to in-memory queue if inbox fails
        import uuid
        message_id = str(uuid.uuid4())[:8]

        if target_id not in _leader_message_queue:
            _leader_message_queue[target_id] = []

        msg_data = {
            "id": message_id,
            "content": content,
            "type": req.message_type,
            "target_type": target_type,
            "timestamp": timestamp,
            "from_leader": True,
            "read": False,
            "metadata": req.metadata or {},
        }
        _leader_message_queue[target_id].append(msg_data)

        # Broadcast full message as fallback
        await broadcast_leader_message(target_id, msg_data)
    else:
        # Extract inbox message ID from MCP response
        # inbox_result.content can be: dict, list of content blocks, or string
        inbox_msg = {}
        try:
            if isinstance(inbox_result.content, dict):
                inbox_msg = inbox_result.content.get("message", {})
            elif isinstance(inbox_result.content, list) and len(inbox_result.content) > 0:
                # MCP returns list of content blocks: [{"type": "text", "text": "..."}]
                first_block = inbox_result.content[0]
                if isinstance(first_block, dict) and "text" in first_block:
                    parsed = json.loads(first_block["text"])
                    inbox_msg = parsed.get("message", {})
            elif isinstance(inbox_result.content, str):
                parsed = json.loads(inbox_result.content)
                inbox_msg = parsed.get("message", {})
        except (json.JSONDecodeError, TypeError, KeyError):
            pass

        message_id = inbox_msg.get("id", "unknown")[:8]

        # Broadcast notification only (not full content) - worker claims from inbox
        await broadcast_leader_message(target_id, {
            "id": message_id,
            "inbox_id": inbox_msg.get("id"),
            "type": "inbox_notification",
            "target_type": target_type,
            "timestamp": timestamp,
            "from_leader": True,
            "title": f"Leader message to {target_id}",
            # Note: content NOT included - worker must claim from inbox
        })

    return LeaderInjectResponse(
        ok=True,
        message_id=message_id,
        target_id=target_id,
        target_type=target_type,
        queued_at=timestamp,
    )


@app.get("/v1/leader/messages/{worker_id}")
async def get_leader_messages(
    worker_id: str,
    unread_only: bool = True,
    mark_read: bool = True,
):
    """Get messages from leader for a specific worker.

    Called by the desktop app to poll for leader instructions.

    Args:
        worker_id: The worker agent ID
        unread_only: Only return unread messages (default True)
        mark_read: Mark returned messages as read (default True)

    Returns:
        List of messages from leader to this worker
    """
    messages = _leader_message_queue.get(worker_id, [])

    if unread_only:
        result = [m for m in messages if not m.get("read", False)]
    else:
        result = messages

    # Mark as read if requested
    if mark_read:
        for msg in result:
            msg["read"] = True

    return {
        "ok": True,
        "worker_id": worker_id,
        "messages": result,
        "count": len(result),
    }


@app.delete("/v1/leader/messages/{worker_id}")
async def clear_leader_messages(worker_id: str):
    """Clear all messages for a worker."""
    if worker_id in _leader_message_queue:
        count = len(_leader_message_queue[worker_id])
        _leader_message_queue[worker_id] = []
        return {"ok": True, "cleared": count}
    return {"ok": True, "cleared": 0}


# ═══════════════════════════════════════════════════════════════════════════════
# Leader Worker Config (Tool Limits, etc.)
# ═══════════════════════════════════════════════════════════════════════════════

from .agent import (
    get_worker_tool_limit,
    set_worker_tool_limit,
    clear_worker_tool_limit,
    get_all_worker_configs,
)


class WorkerConfigRequest(BaseModel):
    """Request to configure a worker's settings."""
    worker_id: str = Field(..., description="Target worker ID")
    max_tool_calls: int = Field(default=0, description="Tool call limit (0 = unlimited)")
    set_by: str = Field(default="leader", description="Who set this config")


class WorkerConfigResponse(BaseModel):
    """Response after setting worker config."""
    ok: bool
    worker_id: str
    max_tool_calls: int
    set_by: str
    timestamp: str


@app.post("/v1/leader/worker-config", response_model=WorkerConfigResponse)
async def set_worker_config(req: WorkerConfigRequest):
    """Leader sets configuration for a worker.
    
    Currently supports:
    - max_tool_calls: Limit tool calls per request (0 = unlimited, default off)
    
    This allows leaders to throttle workers to prevent runaway tool usage.
    Workers automatically pick up these limits on their next request.
    """
    config = set_worker_tool_limit(req.worker_id, req.max_tool_calls, req.set_by)
    return WorkerConfigResponse(
        ok=True,
        worker_id=req.worker_id,
        max_tool_calls=config["max_tool_calls"],
        set_by=config["set_by"],
        timestamp=config["timestamp"],
    )


@app.get("/v1/leader/worker-config/{worker_id}")
async def get_worker_config(worker_id: str):
    """Get current config for a specific worker."""
    limit = get_worker_tool_limit(worker_id)
    all_configs = get_all_worker_configs()
    worker_config = all_configs.get(worker_id)
    
    return {
        "ok": True,
        "worker_id": worker_id,
        "max_tool_calls": limit,
        "has_custom_config": worker_config is not None,
        "config": worker_config,
    }


@app.get("/v1/leader/worker-configs")
async def list_worker_configs():
    """List all worker configs set by leader."""
    all_configs = get_all_worker_configs()
    return {
        "ok": True,
        "count": len(all_configs),
        "configs": all_configs,
    }


@app.delete("/v1/leader/worker-config/{worker_id}")
async def delete_worker_config(worker_id: str):
    """Clear custom config for a worker, reverting to defaults."""
    cleared = clear_worker_tool_limit(worker_id)
    return {
        "ok": True,
        "worker_id": worker_id,
        "cleared": cleared,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Static Web UI Routes (MUST BE LAST - lowest priority, after all API routes)
# ═══════════════════════════════════════════════════════════════════════════════

if _web_dist.exists():
    # Serve index.html at root (with auth)
    @app.get("/")
    async def serve_root(kuroryuu_session: str = Cookie(None)):
        if not _check_auth(kuroryuu_session):
            return RedirectResponse(url="/login", status_code=303)
        return FileResponse(str(_web_dist / "index.html"))
    
    # Catch-all for SPA routing - MUST be last route defined
    @app.get("/{path:path}")
    async def serve_spa(path: str, kuroryuu_session: str = Cookie(None)):
        # Allow static files without auth (images, favicon, etc.)
        static_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf')
        if path.endswith(static_extensions):
            file_path = _web_dist / path
            if file_path.exists() and file_path.is_file():
                return FileResponse(str(file_path))
            raise HTTPException(status_code=404, detail="Not Found")
        
        # Auth check for web UI pages
        if not _check_auth(kuroryuu_session):
            return RedirectResponse(url="/login", status_code=303)
        # Check if it's a static file
        file_path = _web_dist / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        # Fallback to index.html for SPA routing
        return FileResponse(str(_web_dist / "index.html"))


# ═══════════════════════════════════════════════════════════════════════════════
# Leader Dashboards (Phase 0 Tier 1.2 - Task 4)
# ═══════════════════════════════════════════════════════════════════════════════


@app.get("/v1/leader/dashboard/{leader_id}")
async def get_leader_dashboard(leader_id: str):
    """
    Get leader dashboard data (JSON format).

    Returns worker status, recent evidence, interventions, and summary.
    """
    try:
        from .orchestration.task_manager import TaskManager

        manager = TaskManager()
        tasks = manager.get_all_active_tasks()

        workers = []
        total_escalations = 0
        workers_stuck = 0

        for task in tasks:
            for subtask in task.subtasks:
                worker_info = {
                    "worker_id": subtask.assigned_to or "unassigned",
                    "agent_id": getattr(subtask, "agent_id", "unknown"),
                    "status": subtask.status.value if hasattr(subtask.status, "value") else str(subtask.status),
                    "current_task": f"{task.task_id}: {getattr(subtask, 'description', 'Unknown')}",
                    "progress": f"{subtask.current_iteration}/{subtask.max_iterations}" if subtask.max_iterations else "0%",
                    "iterations": f"{subtask.current_iteration}/{subtask.max_iterations}",
                    "context_usage": f"{(subtask.context_tokens_total / subtask.context_budget_tokens * 100) if subtask.context_budget_tokens > 0 else 0:.0f}%",
                    "recent_evidence": [],
                    "interventions": [],
                }

                # Add escalation level indicator
                if subtask.escalation_level > 0:
                    workers_stuck += 1
                    total_escalations += 1

                workers.append(worker_info)

        summary = {
            "total_workers": len(workers),
            "workers_in_progress": sum(1 for w in workers if "in_progress" in w["status"].lower()),
            "workers_stuck": workers_stuck,
            "total_escalations": total_escalations,
            "total_interventions": 0,  # Would be populated from evidence packs
        }

        return {
            "leader_id": leader_id,
            "dashboard_generated_at": datetime.utcnow().isoformat() + "Z",
            "workers": workers,
            "summary": summary,
        }

    except Exception as e:
        return {
            "error": f"Failed to generate dashboard: {str(e)}",
            "workers": [],
            "summary": {"total_workers": 0, "workers_stuck": 0, "total_escalations": 0},
        }


@app.get("/v1/leader/dashboard/{leader_id}/text")
async def get_leader_dashboard_text(leader_id: str):
    """
    Get leader dashboard as plain text (for terminal display).
    """
    try:
        from .orchestration.task_manager import TaskManager

        manager = TaskManager()
        tasks = manager.get_all_active_tasks()

        dashboard_lines = [
            "╔══════════════════════════════════════════════════════════════════════════════╗",
            "║                    LEADER WORKER ORCHESTRATION DASHBOARD                     ║",
            "║                        Session: 2026-01-11 Live                              ║",
            "╚══════════════════════════════════════════════════════════════════════════════╝",
            "",
            "┌─ WORKER STATUS ────────────────────────────────────────────────────────────┐",
            "│                                                                             │",
        ]

        workers_stuck_count = 0
        for task in tasks:
            for i, subtask in enumerate(task.subtasks):
                status_icon = "🔴" if subtask.escalation_level > 0 else "🟢"
                status = (
                    f"[STUCK]" if subtask.escalation_level > 0 else f"[PROGRESS] {subtask.current_iteration}/{subtask.max_iterations}"
                )
                progress = f"{(subtask.current_iteration / subtask.max_iterations * 100) if subtask.max_iterations > 0 else 0:.0f}%"

                line = f"│ {status_icon} Task {task.task_id}   {status:20s} {progress:>6s}  │"
                dashboard_lines.append(line)

                if subtask.escalation_level > 0:
                    workers_stuck_count += 1

        dashboard_lines.append("│                                                                             │")
        dashboard_lines.append("└─────────────────────────────────────────────────────────────────────────────┘")
        dashboard_lines.append("")
        dashboard_lines.append("┌─ SUMMARY ──────────────────────────────────────────────────────────────────┐")
        dashboard_lines.append(f"│ Total Workers: {len([w for t in tasks for w in t.subtasks]):2d}   Stuck: {workers_stuck_count:2d}   Escalations: {workers_stuck_count:2d}                              │")
        dashboard_lines.append("└────────────────────────────────────────────────────────────────────────────┘")

        return "\n".join(dashboard_lines)

    except Exception as e:
        return f"Error generating dashboard: {str(e)}"


# ═══════════════════════════════════════════════════════════════════════════════
# Traffic Monitoring WebSocket
# ═══════════════════════════════════════════════════════════════════════════════

from fastapi import WebSocket

@app.websocket("/ws/traffic-flow")
async def ws_traffic_flow(websocket: WebSocket):
    """WebSocket endpoint for real-time traffic flow visualization."""
    await websocket_traffic_flow(websocket)


@app.websocket("/ws/pty-traffic")
async def ws_pty_traffic(websocket: WebSocket):
    """WebSocket endpoint for real-time PTY traffic visualization."""
    await websocket_pty_traffic(websocket)


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    """Run the gateway server."""
    import uvicorn
    from .harness import HARNESS_DIR

    # Use centralized config (already loaded from env/.env file)
    port = config.port
    host = config.host
    
    # Initialize harness store
    harness_store = get_harness_store()

    # Initialize logging
    logger = setup_logging()
    logger.info(f"Starting Kuroryuu Gateway on {host}:{port}")
    logger.info(f"LLM Backend: {get_backend_name()}")
    logger.info(f"MCP Server: {MCP_URL}")
    logger.info(f"Harness Dir: {HARNESS_DIR}")
    logger.info(f"Slash Commands: {', '.join(SLASH_COMMANDS.keys())}")
    
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
