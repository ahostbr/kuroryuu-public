"""Subagent Router - Claude Code sub-agent config generation.

Endpoints:
- POST /v1/subagent/generate - Generate sub-agent .md config (optionally enhanced by LMStudio)
- GET /v1/subagent/templates - List available default templates
- GET /v1/subagent/templates/{name} - Get a specific template
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
import httpx

# LLM backend for optional enhancement
from ..llm import get_backend, get_backend_name, LLMMessage
from ..utils.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/subagent", tags=["subagent"])

# Project root for templates
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent


# ═══════════════════════════════════════════════════════════════════════════════
# Models
# ═══════════════════════════════════════════════════════════════════════════════

class SubAgentConfig(BaseModel):
    """Sub-agent configuration from GUI."""
    id: str = Field(..., description="Agent ID")
    name: str = Field(..., description="Display name")
    description: str = Field(..., description="When to invoke this sub-agent")
    tools: List[str] = Field(default_factory=list, description="Enabled tools")
    model: str = Field(default="inherit", description="Model hint: inherit/sonnet/opus/haiku")
    permissionMode: str = Field(default="default", description="Permission mode: default/strict")
    systemPrompt: str = Field(default="", description="Custom system prompt")


class GenerateRequest(BaseModel):
    """Request to generate sub-agent config."""
    agentId: str = Field(..., description="Agent ID")
    config: SubAgentConfig = Field(..., description="Agent configuration")
    enhance: bool = Field(default=False, description="Use LMStudio to enhance prompt")


class GenerateResponse(BaseModel):
    """Generated sub-agent markdown."""
    ok: bool
    markdown: str
    filename: str
    enhanced: bool = False
    error: Optional[str] = None


class TemplateInfo(BaseModel):
    """Template metadata."""
    name: str
    description: str
    role: str
    tools: List[str]
    model: str


class TemplatesResponse(BaseModel):
    """List of available templates."""
    ok: bool
    templates: List[TemplateInfo]


class TemplateContentResponse(BaseModel):
    """Template content."""
    ok: bool
    name: str
    content: str
    error: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# Default Templates
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_TEMPLATES = {
    "leader": {
        "name": "kuroryuu-leader",
        "description": "Kuroryuu leader agent - coordinates multi-agent workflows",
        "role": "leader",
        "tools": ["k_session", "k_files", "k_memory", "k_inbox", "k_checkpoint", "k_rag"],
        "model": "inherit",
        "prompt": """# KURORYUU LEADER

You are the **LEADER AGENT** in the Kuroryuu multi-agent orchestration system.

## Your Responsibilities
- Coordinate workflow across multiple workers
- Break down user requests into subtasks
- Assign subtasks to available workers
- Monitor completion and aggregate results

## Tools Available
Use k_* routed tools for all operations.

## Rules
- ONE Leader at a time
- Workers execute, you coordinate
- Escalate ambiguity by returning questions in your response
"""
    },
    "worker": {
        "name": "kuroryuu-worker",
        "description": "Kuroryuu worker agent - executes subtasks assigned by leader",
        "role": "worker",
        "tools": ["k_session", "k_files", "k_memory", "k_inbox", "k_checkpoint", "k_rag"],
        "model": "inherit",
        "prompt": """# KURORYUU WORKER

You are a **WORKER AGENT** in the Kuroryuu multi-agent orchestration system.

## Your Responsibilities
- Poll for available subtasks
- Claim and execute assigned work
- Report results back to leader
- Escalate blockers (don't block waiting for human input)

## Tools Available
Use k_* routed tools for all operations.

## Rules
- Execute one subtask at a time
- Report success or failure honestly
- If stuck, release subtask and let leader reassign
"""
    },
    "explorer": {
        "name": "kuroryuu-explorer",
        "description": "Kuroryuu explorer agent - read-only research and codebase analysis",
        "role": "worker",
        "tools": ["k_session", "k_files", "k_rag"],
        "model": "haiku",
        "prompt": """# KURORYUU EXPLORER

You are an **EXPLORER AGENT** in the Kuroryuu multi-agent orchestration system.

## Purpose
Quick, read-only exploration of the codebase. Use for:
- Searching for code patterns
- Understanding file structure
- Finding relevant documentation

## Tools Available (Read-Only)
- k_session: Session lifecycle
- k_files: Read and list only (no write)
- k_rag: Search (no indexing)

## Rules
- Read-only - Never attempt writes
- Fast - Use haiku, keep responses concise
- Cite sources - Always mention file paths
"""
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
# Helper Functions
# ═══════════════════════════════════════════════════════════════════════════════

def generate_markdown(config: SubAgentConfig) -> str:
    """Generate Claude Code sub-agent markdown from config."""
    tools_str = ", ".join(config.tools) if config.tools else "inherit"
    
    return f"""---
name: {config.name}
description: {config.description}
tools: {tools_str}
model: {config.model}
permissionMode: {config.permissionMode}
---

{config.systemPrompt}
"""


# ═══════════════════════════════════════════════════════════════════════════════
# Devstral Enhancement Prompt & Tool Docs
# ═══════════════════════════════════════════════════════════════════════════════

KURORYUU_TOOL_DOCS = """
## Kuroryuu MCP Tool Reference

| Tool | Actions | Parameters |
|------|---------|------------|
| `k_session` | start, end, context, log | action, agent_id, cli_type, process_id, session_id, message |
| `k_checkpoint` | save, append, list, load | action, name, summary, data, tags, id, limit |
| `k_files` | read, write, edit, list | action, path, content, old_str, new_str, start_line, end_line |
| `k_rag` | query, status, index | action, query, top_k, scope, exts, force |
| `k_repo_intel` | status, run, get, list | action, report, query, limit, only |
| `k_memory` | get, set_goal, add_blocker, clear_blockers, set_steps, reset | action, goal, blocker, steps |
| `k_inbox` | send, list, read, claim, complete | action, to_agent, subject, body, folder, id, status, note |
| `k_interact` | ask, approve, plan | action, question, options, plan (LEADER ONLY) |
| `k_capture` | start, stop, screenshot, get_latest | action, mode, fps, out |

### Tool Call Syntax
```
k_tool(action="action_name", param1="value", param2=123)
```

### Examples
```
k_rag(action="query", query="def handle_request", top_k=10)
k_files(action="read", path="src/main.py", start_line=1, end_line=50)
k_inbox(action="send", to_agent="leader", subject="DONE: T001", body="Task complete")
k_checkpoint(action="save", name="feature-x", summary="Implemented X", data={"files": []})
```
"""

ENHANCEMENT_SYSTEM_PROMPT = """You are an expert at writing Claude Code sub-agent system prompts for the Kuroryuu multi-agent orchestration system.

{tool_docs}

## Your Task

Generate a comprehensive, production-quality system prompt for this agent:
- **Name:** {name}
- **Role:** {role}
- **Description:** {description}
- **Enabled Tools:** {tools}
- **Model:** {model}
- **Permission Mode:** {permissionMode}

## Required Sections (follow this EXACT structure)

# {{AGENT_NAME_UPPERCASE}}

You are a **{{ROLE}} AGENT** in the Kuroryuu multi-agent orchestration system.

## Identity
- **You [action verb].** [1-sentence description]
- **You [action verb].** [1-sentence description]
- **You [action verb].** [1-sentence description]

## Purpose
[2-3 sentences explaining when/why this agent is invoked]

## Tools Available
| Tool | Actions | Purpose |
|------|---------|---------|
[One row per enabled tool with ACTUAL actions from the tool reference]

### Tool Usage Decision Tree
| Need | Tool Call |
|------|-----------|
[5-7 rows mapping common needs to specific tool calls with real syntax]

## What You CANNOT Do
❌ [Restriction based on tools NOT in enabled list]
❌ [Restriction based on permission mode]
[Add more based on role - workers can't use k_interact, etc.]

## Usage Pattern
1. [First step - usually session/context check]
2. [Core action step with tool call example]
3. [Verification/completion step]
4. [Report results]

## Examples

### Example 1: [Common Task Name]
Query: "[Typical user query for this agent]"

```
[Actual tool call with real syntax]
→ [Expected result format]

[Follow-up call if needed]
→ [Result]

Summary: [1-2 sentence conclusion]
```

### Example 2: [Another Common Task]
[Same format as Example 1]

## Rules
1. **[Rule name]** - [Explanation]
2. **[Rule name]** - [Explanation]
[3-5 rules total, specific to this role]

## Remember
> **[Memorable 1-line mantra for this agent]**
> [Optional 2nd line with tool preference]

---

## Output Requirements

1. Return ONLY the markdown system prompt content
2. Do NOT include YAML frontmatter (---name: etc---)
3. Do NOT include explanations or meta-commentary
4. Use REAL tool names and action names from the reference
5. Include ACTUAL code examples with proper syntax
6. Be specific to the role (leader vs worker differences)
"""


async def enhance_prompt_with_lmstudio(
    config: SubAgentConfig,
    lmstudio_url: Optional[str] = None
) -> str:
    """Use LMStudio/Devstral to generate rich system prompt.

    Args:
        config: The sub-agent configuration
        lmstudio_url: Custom LMStudio URL (e.g., http://169.254.83.107:1234)

    Returns:
        Enhanced system prompt or original if enhancement fails
    """
    # Determine role from tools
    role = "leader" if "k_interact" in config.tools else "worker"

    # Build the enhancement prompt
    formatted_prompt = ENHANCEMENT_SYSTEM_PROMPT.format(
        tool_docs=KURORYUU_TOOL_DOCS,
        name=config.name,
        role=role,
        description=config.description,
        tools=", ".join(config.tools),
        model=config.model,
        permissionMode=config.permissionMode,
    )

    # URLs to try (primary + CLIProxyAPI fallback)
    cliproxy_url = os.environ.get("KURORYUU_CLIPROXYAPI_URL", "http://127.0.0.1:8317")
    urls_to_try = []
    if lmstudio_url:
        urls_to_try.append((lmstudio_url, "devstral"))
    urls_to_try.append(("http://127.0.0.1:1234", "devstral"))  # Default LMStudio
    urls_to_try.append((cliproxy_url, "claude-sonnet-4-20250514"))  # CLIProxyAPI fallback

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            for base_url, model in urls_to_try:
                try:
                    response = await client.post(
                        f"{base_url.rstrip('/')}/v1/chat/completions",
                        json={
                            "model": model,
                            "messages": [
                                {
                                    "role": "system",
                                    "content": formatted_prompt
                                },
                                {
                                    "role": "user",
                                    "content": f"Generate the system prompt for {config.name}."
                                }
                            ],
                            "max_tokens": 4000,
                            "temperature": 0.7,
                        }
                    )
                    if response.status_code == 200:
                        data = response.json()
                        enhanced = data["choices"][0]["message"]["content"].strip()
                        logger.info(f"[Subagent] Enhanced prompt via {base_url}")
                        return enhanced
                    else:
                        logger.warning(f"[Subagent] {base_url} returned {response.status_code}")
                except httpx.ConnectError:
                    logger.debug(f"[Subagent] Cannot connect to {base_url}, trying next...")
                    continue

        # All direct URLs failed, fall back to configured backend
        from ..llm import get_healthy_backend
        try:
            backend = await get_healthy_backend()

            # Build enhancement request
            messages = [
                LLMMessage(role="system", content=formatted_prompt),
                LLMMessage(role="user", content=f"Generate the system prompt for {config.name}.")
            ]

            # Get enhanced prompt (non-streaming)
            response = await backend.chat(
                messages=messages,
                max_tokens=4000,
                temperature=0.7,
            )

            if response and response.content:
                logger.info(f"[Subagent] Enhanced prompt via {backend.name} backend")
                return response.content.strip()
        except Exception as e:
            logger.debug(f"[Subagent] Fallback backend failed: {e}")

        return config.systemPrompt

    except Exception as e:
        logger.warning(f"[Subagent] Enhancement failed: {e}")
        return config.systemPrompt


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/generate", response_model=GenerateResponse)
async def generate_subagent_config(
    request: GenerateRequest,
    lmstudio_url: Optional[str] = Query(None, description="Custom LMStudio URL for enhancement"),
) -> GenerateResponse:
    """Generate Claude Code sub-agent .md config.

    If enhance=True and LMStudio is available, uses LLM to improve the prompt.
    Falls back to local template if LMStudio unavailable.

    Query params:
        lmstudio_url: Custom LMStudio URL (e.g., http://169.254.83.107:1234)
    """
    config = request.config
    enhanced = False

    # Optionally enhance with LMStudio
    if request.enhance:
        original_prompt = config.systemPrompt
        enhanced_prompt = await enhance_prompt_with_lmstudio(config, lmstudio_url)
        if enhanced_prompt != original_prompt:
            config.systemPrompt = enhanced_prompt
            enhanced = True

    # Generate markdown
    markdown = generate_markdown(config)
    filename = f"kuroryuu-{config.name.lower().replace(' ', '-')}.md"

    return GenerateResponse(
        ok=True,
        markdown=markdown,
        filename=filename,
        enhanced=enhanced,
    )


@router.get("/templates", response_model=TemplatesResponse)
async def list_templates() -> TemplatesResponse:
    """List available default sub-agent templates."""
    templates = []
    
    for key, tmpl in DEFAULT_TEMPLATES.items():
        templates.append(TemplateInfo(
            name=tmpl["name"],
            description=tmpl["description"],
            role=tmpl["role"],
            tools=tmpl["tools"],
            model=tmpl["model"],
        ))
    
    return TemplatesResponse(ok=True, templates=templates)


@router.get("/templates/{name}", response_model=TemplateContentResponse)
async def get_template(name: str) -> TemplateContentResponse:
    """Get a specific template by name."""
    # Normalize name (remove kuroryuu- prefix if present)
    key = name.replace("kuroryuu-", "")
    
    if key not in DEFAULT_TEMPLATES:
        return TemplateContentResponse(
            ok=False,
            name=name,
            content="",
            error=f"Template not found: {name}",
        )
    
    tmpl = DEFAULT_TEMPLATES[key]
    
    # Build full markdown
    config = SubAgentConfig(
        id=key,
        name=tmpl["name"],
        description=tmpl["description"],
        tools=tmpl["tools"],
        model=tmpl["model"],
        permissionMode="default" if key != "explorer" else "strict",
        systemPrompt=tmpl["prompt"],
    )
    
    content = generate_markdown(config)
    
    return TemplateContentResponse(
        ok=True,
        name=tmpl["name"],
        content=content,
    )


@router.get("/health")
async def health() -> Dict[str, Any]:
    """Check subagent service health and LMStudio availability."""
    lmstudio_available = False
    
    try:
        backend = get_backend("lmstudio")
        if backend:
            # Quick check if LMStudio responds
            lmstudio_available = True
    except:
        pass
    
    return {
        "ok": True,
        "service": "subagent",
        "lmstudio_available": lmstudio_available,
        "templates_count": len(DEFAULT_TEMPLATES),
    }
