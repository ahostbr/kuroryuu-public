"""Subagent system for delegated task execution.

Implements Claude Code-style subagent spawning where the main agent
can delegate tasks to specialized subagents that run within the same
CLI session with restricted tool access.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx

from .config import Config, OperationMode
from .mcp_client import MCPClientWrapper, ToolResult

logger = logging.getLogger(__name__)


# Built-in subagent type configurations
SUBAGENT_TYPES: Dict[str, Dict[str, Any]] = {
    "explorer": {
        "description": "Fast codebase exploration and file discovery",
        "tools": ["k_files:read,list", "k_rag:query", "k_repo_intel:get"],
        "mode": "read",
        "max_turns": 15,
    },
    "planner": {
        "description": "Design implementation plans without executing",
        "tools": ["k_files:read", "k_rag:query", "k_repo_intel:get"],
        "mode": "plan",
        "max_turns": 20,
    },
}

# Respond tool - subagents call this to return their final response
RESPOND_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "respond",
        "description": "Return your final response to the parent agent. Call this tool when you have completed your task and are ready to report your findings. Your summary will be returned to the parent agent.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "Your complete findings/summary to return to the parent agent"
                }
            },
            "required": ["summary"]
        }
    }
}


@dataclass
class SubagentMessage:
    """Message in subagent conversation."""
    role: str  # system, user, assistant, tool
    content: str
    name: Optional[str] = None
    tool_call_id: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None


@dataclass
class SubagentResult:
    """Result from subagent execution."""
    ok: bool
    content: str
    turns_used: int
    tools_called: List[str] = field(default_factory=list)
    subagent_type: str = ""  # Added for parallel results identification
    task: str = ""  # Added for parallel results identification


@dataclass
class ParallelSubagentResult:
    """Result from parallel subagent execution."""
    ok: bool
    results: List[SubagentResult]
    total_turns: int
    failed_count: int

    @property
    def content(self) -> str:
        """Combine all results into a single formatted string."""
        parts = []
        for i, r in enumerate(self.results, 1):
            status = "✓" if r.ok else "✗"
            type_label = r.subagent_type.upper() if r.subagent_type else f"#{i}"
            parts.append(f"## {status} {type_label}\n{r.content}")
        return "\n\n".join(parts)


class SubAgent:
    """Lightweight agent for handling delegated tasks.

    Runs with restricted tool access within the parent's CLI session.
    Returns a final result to the parent agent.
    """

    # Models known to support native tool calling
    NATIVE_TOOL_MODELS = ['qwen', 'llama-3', 'mistral', 'devstral', 'ministral']

    def __init__(
        self,
        config: Config,
        mcp_client: MCPClientWrapper,
        subagent_type: str,
        task: str,
        context: str = "",
        max_turns: Optional[int] = None,
    ):
        """Initialize subagent.

        Args:
            config: Parent config (for LLM settings)
            mcp_client: Shared MCP client
            subagent_type: One of "explorer" or "planner"
            task: Description of what the subagent should accomplish
            context: Optional context or background information
            max_turns: Override default max turns
        """
        self.config = config
        self.mcp_client = mcp_client
        self.subagent_type = subagent_type
        self.task = task
        self.context = context

        # Get type config
        type_config = SUBAGENT_TYPES.get(subagent_type)
        if not type_config:
            raise ValueError(f"Unknown subagent type: {subagent_type}")

        self.description = type_config["description"]
        self.allowed_tools = self._parse_tool_permissions(type_config["tools"])
        self.mode = OperationMode(type_config["mode"])
        self.max_turns = max_turns or type_config["max_turns"]

        self.messages: List[SubagentMessage] = []
        self.tools_called: List[str] = []
        self._http_client: Optional[httpx.AsyncClient] = None

    def _parse_tool_permissions(self, tools: List[str]) -> Dict[str, Set[str]]:
        """Parse 'tool:action1,action2' format into permission dict.

        Args:
            tools: List of tool specs like ["k_files:read,list", "k_rag:query"]

        Returns:
            Dict mapping tool name to set of allowed actions
        """
        permissions: Dict[str, Set[str]] = {}
        for tool_spec in tools:
            if ":" in tool_spec:
                tool, actions = tool_spec.split(":", 1)
                permissions[tool] = set(actions.split(","))
            else:
                permissions[tool_spec] = {"*"}  # All actions
        return permissions

    def _can_use_tool(self, tool_name: str, action: Optional[str]) -> bool:
        """Check if subagent can use this tool/action.

        Args:
            tool_name: Name of the tool
            action: The action parameter value (if any)

        Returns:
            True if allowed, False otherwise
        """
        if tool_name not in self.allowed_tools:
            return False
        allowed = self.allowed_tools[tool_name]
        if "*" in allowed:
            return True
        if action is None:
            return True  # No action to validate
        return action in allowed

    def _supports_native_tools(self) -> bool:
        """Check if current model supports native tool calling."""
        model_lower = self.config.model.lower()
        return any(p in model_lower for p in self.NATIVE_TOOL_MODELS)

    def _load_prompt_template(self, subagent_type: str) -> str:
        """Load system prompt for subagent type.

        Args:
            subagent_type: One of "explorer" or "planner"

        Returns:
            System prompt content
        """
        prompts_dir = Path(__file__).parent / "prompts"
        prompt_path = prompts_dir / f"subagent_{subagent_type}.md"

        if prompt_path.exists():
            try:
                return prompt_path.read_text(encoding="utf-8")
            except Exception as e:
                logger.warning(f"Failed to load subagent prompt: {e}")

        # Fallback prompts
        if subagent_type == "explorer":
            return """You are an Explorer subagent. Your job is to quickly discover and map relevant parts of the codebase.

Rules:
- Use k_files(action="list") to explore directories
- Use k_rag to search for patterns
- Be fast and focused - you have limited turns
- Return a clear summary of what you found

You are in READ mode - you cannot modify files."""

        elif subagent_type == "planner":
            return """You are a Planner subagent. Your job is to design implementation approaches.

Rules:
- Analyze the codebase to understand patterns
- Create step-by-step implementation plans
- Identify files that need to be modified
- Consider edge cases and potential issues

You are in PLAN mode - describe what WOULD be done, don't execute."""

        return f"You are a {subagent_type} subagent."

    def _build_system_prompt(self) -> str:
        """Build system prompt for subagent."""
        base_prompt = self._load_prompt_template(self.subagent_type)

        # Add context if provided
        context_block = ""
        if self.context:
            context_block = f"\n\n## Context\n{self.context}"

        # Add tool info
        tools_list = ", ".join(
            f"{tool}:{','.join(sorted(actions))}" if "*" not in actions else tool
            for tool, actions in self.allowed_tools.items()
        )
        tool_block = f"\n\n## Available Tools\n{tools_list}"

        # Add turn limit reminder
        limit_block = f"\n\n## Limits\nYou have {self.max_turns} turns maximum. Be efficient."

        return base_prompt + context_block + tool_block + limit_block

    def _get_filtered_tool_schemas(self) -> List[Dict[str, Any]]:
        """Get tool schemas filtered to allowed tools + respond tool."""
        all_schemas = self.mcp_client.get_tool_schemas_for_llm()
        filtered = []

        for schema in all_schemas:
            func = schema.get("function", {})
            name = func.get("name", "")

            # Check if tool is allowed
            if name in self.allowed_tools:
                filtered.append(schema)

        # Always add respond tool so subagent can signal completion
        filtered.append(RESPOND_TOOL)

        return filtered

    async def run(self) -> SubagentResult:
        """Run subagent on task, return final result.

        Returns:
            SubagentResult with ok status, content, and metadata
        """
        self._http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=30.0, read=120.0, write=30.0, pool=30.0)
        )

        try:
            # Initialize conversation
            system_prompt = self._build_system_prompt()
            self.messages = [
                SubagentMessage(role="system", content=system_prompt),
                SubagentMessage(role="user", content=self.task),
            ]

            turns = 0
            final_response = ""

            while turns < self.max_turns:
                turns += 1
                logger.debug(f"Subagent {self.subagent_type} turn {turns}/{self.max_turns}")

                # Call LLM
                response = await self._call_llm()

                if response.get("error"):
                    return SubagentResult(
                        ok=False,
                        content=f"LLM error: {response['error']}",
                        turns_used=turns,
                        tools_called=self.tools_called,
                        subagent_type=self.subagent_type,
                        task=self.task,
                    )

                content = response.get("content", "")
                tool_calls = response.get("tool_calls", [])
                raw_tool_calls = response.get("raw_tool_calls", [])

                if tool_calls:
                    # Add assistant message with tool calls (use raw format for API)
                    self.messages.append(SubagentMessage(
                        role="assistant",
                        content=content,
                        tool_calls=raw_tool_calls,  # Use original API format
                    ))

                    # Execute each tool
                    for tc in tool_calls:
                        tool_id = tc.get("id", f"call_{turns}")
                        tool_name = tc.get("name", "")
                        tool_args = tc.get("arguments", {})

                        # Check for respond tool - TERMINATES THE LOOP
                        if tool_name == "respond":
                            summary = tool_args.get("summary", "") if isinstance(tool_args, dict) else ""
                            self.tools_called.append("respond")
                            logger.info(f"Subagent {self.subagent_type} called respond() after {turns} turns")
                            return SubagentResult(
                                ok=True,
                                content=summary,
                                turns_used=turns,
                                tools_called=self.tools_called,
                                subagent_type=self.subagent_type,
                                task=self.task,
                            )

                        action = tool_args.get("action") if isinstance(tool_args, dict) else None

                        # Check permissions
                        if not self._can_use_tool(tool_name, action):
                            result_content = f"Tool not allowed for {self.subagent_type} subagent: {tool_name}"
                            if action:
                                result_content += f" (action: {action})"
                            logger.info(f"Subagent blocked: {tool_name}")
                        else:
                            # Execute tool
                            self.tools_called.append(tool_name)
                            result = await self.mcp_client.call_tool(tool_name, tool_args)
                            result_content = result.content if result.ok else f"Error: {result.error}"

                        # Add tool result
                        self.messages.append(SubagentMessage(
                            role="tool",
                            content=result_content,
                            name=tool_name,
                            tool_call_id=tool_id,
                        ))
                else:
                    # No tools = final response
                    final_response = content
                    break

            if not final_response:
                final_response = f"[Subagent reached {self.max_turns} turns without final response]"

            return SubagentResult(
                ok=True,
                content=final_response,
                turns_used=turns,
                tools_called=self.tools_called,
                subagent_type=self.subagent_type,
                task=self.task,
            )

        finally:
            if self._http_client:
                await self._http_client.aclose()
                self._http_client = None

    async def _call_llm(self) -> Dict[str, Any]:
        """Call LLM (non-streaming) and return response.

        Returns:
            Dict with "content" (str), "tool_calls" (list), or "error" (str)
        """
        url = f"{self.config.lmstudio_url}/v1/chat/completions"

        # Build messages for API
        oai_messages = []
        for msg in self.messages:
            m: Dict[str, Any] = {"role": msg.role, "content": msg.content or ""}
            if msg.name:
                m["name"] = msg.name
            if msg.tool_call_id:
                m["tool_call_id"] = msg.tool_call_id
            if msg.tool_calls:
                m["tool_calls"] = msg.tool_calls
            oai_messages.append(m)

        # Build payload
        payload: Dict[str, Any] = {
            "model": self.config.model,
            "stream": False,
            "messages": oai_messages,
            "temperature": 0.5,  # Lower temp for focused execution
            "max_tokens": 2000,
        }

        # Add filtered tools if supported
        if self._supports_native_tools():
            tools = self._get_filtered_tool_schemas()
            if tools:
                payload["tools"] = tools
                payload["tool_choice"] = "auto"

        try:
            resp = await self._http_client.post(url, json=payload, timeout=120.0)
            resp.raise_for_status()
            data = resp.json()

            choice = data.get("choices", [{}])[0]
            message = choice.get("message", {})

            content = message.get("content", "")
            raw_tool_calls = message.get("tool_calls", [])

            # Parse tool calls for execution, but keep raw for message history
            parsed_calls = []
            for tc in raw_tool_calls:
                func = tc.get("function", {})
                args_str = func.get("arguments", "{}")
                try:
                    args = json.loads(args_str) if isinstance(args_str, str) else args_str
                except json.JSONDecodeError:
                    args = {"raw": args_str}

                parsed_calls.append({
                    "id": tc.get("id", "call_0"),
                    "name": func.get("name", ""),
                    "arguments": args,
                    # Keep raw format for message history
                    "_raw": tc,
                })

            return {
                "content": content,
                "tool_calls": parsed_calls,
                "raw_tool_calls": raw_tool_calls,  # Original format for API
            }

        except httpx.ConnectError:
            return {"error": f"Cannot connect to LLM at {self.config.lmstudio_url}"}
        except httpx.HTTPStatusError as e:
            return {"error": f"HTTP {e.response.status_code}: {e.response.text[:200]}"}
        except Exception as e:
            return {"error": str(e)}


def get_spawn_subagent_schema() -> Dict[str, Any]:
    """Get tool schema for spawn_subagent tool."""
    return {
        "type": "function",
        "function": {
            "name": "spawn_subagent",
            "description": "Spawn a specialized subagent to handle a specific task. "
                           "The subagent runs autonomously with restricted tool access and returns results. "
                           "Use 'explorer' for codebase discovery, 'planner' for implementation design.",
            "parameters": {
                "type": "object",
                "properties": {
                    "subagent_type": {
                        "type": "string",
                        "enum": list(SUBAGENT_TYPES.keys()),
                        "description": "Type of subagent: 'explorer' (fast codebase discovery) or 'planner' (design plans)"
                    },
                    "task": {
                        "type": "string",
                        "description": "Clear description of what the subagent should accomplish"
                    },
                    "context": {
                        "type": "string",
                        "description": "Optional context or background information for the subagent"
                    },
                },
                "required": ["subagent_type", "task"]
            }
        }
    }


def get_spawn_parallel_subagents_schema() -> Dict[str, Any]:
    """Get tool schema for spawn_parallel_subagents tool."""
    return {
        "type": "function",
        "function": {
            "name": "spawn_parallel_subagents",
            "description": "Spawn multiple subagents to explore different aspects. "
                           "Use this when you need to investigate multiple areas at once (e.g., 'find auth files', "
                           "'find API endpoints', 'find database models'). "
                           "For local LLMs (LMStudio/Ollama): runs sequentially with progress updates. "
                           "For cloud APIs: runs truly in parallel. Results are aggregated.",
            "parameters": {
                "type": "object",
                "properties": {
                    "subagents": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "subagent_type": {
                                    "type": "string",
                                    "enum": list(SUBAGENT_TYPES.keys()),
                                    "description": "Type: 'explorer' or 'planner'"
                                },
                                "task": {
                                    "type": "string",
                                    "description": "What this subagent should accomplish"
                                },
                                "context": {
                                    "type": "string",
                                    "description": "Optional context for this subagent"
                                }
                            },
                            "required": ["subagent_type", "task"]
                        },
                        "minItems": 1,
                        "maxItems": 5,
                        "description": "Array of subagent specs to spawn in parallel (max 5)"
                    },
                    "shared_context": {
                        "type": "string",
                        "description": "Optional context shared by all subagents"
                    }
                },
                "required": ["subagents"]
            }
        }
    }


def _is_local_llm(url: str) -> bool:
    """Check if LLM URL points to a local instance (LMStudio, Ollama, etc.).

    Local LLMs process requests sequentially, so parallel spawning
    provides no speedup and may confuse users.
    """
    url_lower = url.lower()
    local_patterns = [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "192.168.",  # Local network
        "10.0.",     # Local network
        ":1234",     # LMStudio default port
        ":11434",    # Ollama default port
    ]
    return any(p in url_lower for p in local_patterns)


async def spawn_parallel_subagents(
    config: "Config",
    mcp_client: "MCPClientWrapper",
    subagents: List[Dict[str, Any]],
    shared_context: str = "",
    on_progress: Optional[callable] = None,
) -> ParallelSubagentResult:
    """Spawn multiple subagents (parallel for cloud APIs, sequential for local LLMs).

    For local LLMs (LMStudio, Ollama), requests are processed sequentially anyway,
    so we run subagents one at a time with progress updates.

    For cloud APIs with true parallelism, we use asyncio.gather().

    Args:
        config: Parent config (for LLM settings)
        mcp_client: Shared MCP client
        subagents: List of subagent specs [{subagent_type, task, context?}, ...]
        shared_context: Optional context shared by all subagents
        on_progress: Optional callback(index, total, subagent_type, status) for progress updates

    Returns:
        ParallelSubagentResult with aggregated results
    """
    if not subagents:
        return ParallelSubagentResult(
            ok=False,
            results=[],
            total_turns=0,
            failed_count=0,
        )

    # Cap at 5 to prevent resource exhaustion
    subagents = subagents[:5]
    is_local = _is_local_llm(config.lmstudio_url)

    async def run_one(spec: Dict[str, Any], index: int = 0) -> SubagentResult:
        """Run a single subagent."""
        subagent_type = spec.get("subagent_type", "explorer")
        task = spec.get("task", "")
        context = spec.get("context", "")

        # Combine shared + individual context
        full_context = f"{shared_context}\n\n{context}".strip() if shared_context else context

        # Progress callback - starting
        if on_progress:
            on_progress(index, len(subagents), subagent_type, "starting")

        try:
            agent = SubAgent(
                config=config,
                mcp_client=mcp_client,
                subagent_type=subagent_type,
                task=task,
                context=full_context,
            )
            result = await agent.run()

            # Progress callback - completed
            if on_progress:
                on_progress(index, len(subagents), subagent_type, "completed" if result.ok else "failed")

            return result
        except Exception as e:
            logger.error(f"Subagent failed: {e}")
            if on_progress:
                on_progress(index, len(subagents), subagent_type, "error")
            return SubagentResult(
                ok=False,
                content=f"Error: {e}",
                turns_used=0,
                tools_called=[],
                subagent_type=subagent_type,
                task=task,
            )

    # Choose execution strategy based on LLM type
    if is_local:
        # Sequential execution for local LLMs (they queue anyway)
        logger.info(f"Spawning {len(subagents)} subagents SEQUENTIALLY (local LLM detected)")
        results = []
        for i, spec in enumerate(subagents):
            result = await run_one(spec, i)
            results.append(result)
    else:
        # True parallel execution for cloud APIs
        logger.info(f"Spawning {len(subagents)} subagents in PARALLEL (cloud API)")
        results = await asyncio.gather(*[run_one(spec, i) for i, spec in enumerate(subagents)])

    # Aggregate results
    total_turns = sum(r.turns_used for r in results)
    failed_count = sum(1 for r in results if not r.ok)
    overall_ok = failed_count < len(results)  # At least one succeeded

    mode = "sequential" if is_local else "parallel"
    logger.info(f"Subagents complete ({mode}): {len(results) - failed_count}/{len(results)} succeeded, {total_turns} total turns")

    return ParallelSubagentResult(
        ok=overall_ok,
        results=list(results),
        total_turns=total_turns,
        failed_count=failed_count,
    )


__all__ = [
    "SubAgent",
    "SubagentResult",
    "SubagentMessage",
    "ParallelSubagentResult",
    "SUBAGENT_TYPES",
    "get_spawn_subagent_schema",
    "get_spawn_parallel_subagents_schema",
    "spawn_parallel_subagents",
]
