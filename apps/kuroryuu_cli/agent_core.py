"""Agent core - LLM interaction and tool orchestration.

Implements patterns from Docs/CaseStudies/ClaudeCode_Integration_Analysis.md:
- Pre/post tool hooks with proper validation (Section 7.2)
- Context refresh for dynamic system prompt (Section 3.5)
- Routed tool action validation (Section 8.2)
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

import httpx

from .config import Config, OperationMode
from .llm_provider import LLMProvider
from .mcp_client import MCPClientWrapper, ToolResult, K_INTERACT_ACTIONS
from .session_manager import SessionManager
from .agui_events import InterruptRequest, ResumePayload, InterruptReason
from .subagent import (
    SubAgent,
    SubagentResult,
    ParallelSubagentResult,
    SUBAGENT_TYPES,
    spawn_parallel_subagents,
)

logger = logging.getLogger(__name__)

# Auto-compaction settings
AUTO_COMPACT_THRESHOLD = 0.75  # Trigger at 75% usage
KEEP_RECENT_MESSAGES = 6  # Always keep last N messages

# Compaction summarization prompt
COMPACTION_PROMPT = """Summarize the following conversation history concisely.
Focus on:
- Key decisions made
- Important findings or code changes
- Current task state and blockers
- Any context the assistant needs to continue

Keep under 500 words. Use bullet points.

CONVERSATION:
{conversation}

SUMMARY:"""


@dataclass
class Message:
    """Chat message."""
    role: str  # system, user, assistant, tool
    content: Union[str, List[Dict[str, Any]]]  # String OR multimodal content blocks
    name: Optional[str] = None
    tool_call_id: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None


@dataclass
class AgentEvent:
    """Event emitted during agent processing.

    Types:
    - text_delta: Streaming text (data: str)
    - tool_start: Tool execution starting (data: {"name": str, "args": dict, "id": str})
    - tool_end: Tool execution finished (data: {"name": str, "ok": bool, "result": str})
    - interrupt: Agent needs user input (data: AG-UI interrupt payload)
    - done: Agent finished (data: {"stop_reason": str})
    - error: Error occurred (data: {"message": str})
    """
    type: str
    data: Any

# Type alias for interrupt handler callback
InterruptHandler = Optional[Any]  # Callable[[InterruptRequest], Awaitable[Any]]


class AgentCore:
    """Core agent logic - manages conversation, LLM calls, and tool execution.

    Integrates with:
    - Local LLM for inference (OpenAI-compatible API)
    - MCP for tool execution
    - SessionManager for hooks

    Per Case Study:
    - Section 7.2: Pre/post tool hooks with proper validation
    - Section 3.5: Context retrieval for system prompt refresh
    - Section 8.2: Routed tool action validation
    """

    # Models known to support native tool calling
    NATIVE_TOOL_MODELS = ['qwen', 'llama-3', 'mistral', 'devstral', 'ministral']

    # Context refresh interval (messages between refreshes)
    CONTEXT_REFRESH_INTERVAL = 10

    def __init__(
        self,
        config: Config,
        session_manager: SessionManager,
        interrupt_handler: InterruptHandler = None,
        permission_manager: Optional[Any] = None,
        tool_approval_handler: Optional[Any] = None,
    ):
        self.config = config
        self.session_manager = session_manager
        self.mcp_client = session_manager.mcp_client
        self.interrupt_handler = interrupt_handler  # Callback for HITL
        self.permission_manager = permission_manager  # Tool approval state
        self.tool_approval_handler = tool_approval_handler  # Callback for approval prompts
        self.messages: List[Message] = []
        self._http_client: Optional[httpx.AsyncClient] = None
        self._messages_since_context_refresh: int = 0
        self._pending_interrupt: Optional[InterruptRequest] = None

        # Token tracking (updated from LLM responses)
        self.total_prompt_tokens: int = 0
        self.total_completion_tokens: int = 0
        self.last_prompt_tokens: int = 0
        self.last_completion_tokens: int = 0
        self.context_window: int = 32000  # Default, updated from /v1/models

        # Cancellation support (ESC key hard stop)
        self._cancelled: bool = False

        # LLM provider (initialized in initialize())
        self._provider: Optional[LLMProvider] = None

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count from text (~4 chars per token).

        This is a rough estimation since LM Studio doesn't return
        usage data in streaming responses.
        """
        if not text:
            return 0
        return len(text) // 4

    def _estimate_message_tokens(self, messages: List[Message]) -> int:
        """Estimate total tokens for a list of messages."""
        total = 0
        for msg in messages:
            # Message overhead (~4 tokens for role, formatting)
            total += 4
            if msg.content:
                total += self._estimate_tokens(msg.content)
            # Tool calls add extra tokens
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    if hasattr(tc, 'function'):
                        total += self._estimate_tokens(tc.function.get('name', ''))
                        total += self._estimate_tokens(tc.function.get('arguments', ''))
                    elif isinstance(tc, dict):
                        func = tc.get('function', {})
                        total += self._estimate_tokens(func.get('name', ''))
                        total += self._estimate_tokens(func.get('arguments', ''))
        return total

    def _should_auto_compact(self) -> bool:
        """Check if context usage warrants auto-compaction.

        Returns True if:
        - In stateful mode (not stateless)
        - Current context usage exceeds AUTO_COMPACT_THRESHOLD
        """
        if self.config.stateless:
            return False
        current = self._estimate_message_tokens(self.messages)
        threshold = int(self.context_window * AUTO_COMPACT_THRESHOLD)
        return current > threshold

    async def _auto_compact_with_summary(self) -> int:
        """Auto-compact using LLM summarization.

        Summarizes older messages into a single summary message,
        keeping recent messages intact.

        Returns:
            Number of messages removed (0 if nothing to compact)
        """
        if len(self.messages) <= KEEP_RECENT_MESSAGES + 2:
            return 0  # Too short to compact

        system_msg = self.messages[0] if self.messages[0].role == "system" else None

        # Split: older messages to summarize, recent to keep
        split_idx = len(self.messages) - KEEP_RECENT_MESSAGES
        to_summarize = self.messages[1:split_idx]  # Exclude system prompt
        to_keep = self.messages[split_idx:]

        if not to_summarize:
            return 0

        # Format conversation for summarization
        conversation_text = self._format_messages_for_summary(to_summarize)

        # Get summary from LLM (non-streaming, short response)
        summary = await self._get_llm_summary(conversation_text)

        # Build new message list with summary
        summary_msg = Message(
            role="user",
            content=f"[Previous conversation summary]\n{summary}"
        )

        if system_msg:
            self.messages = [system_msg, summary_msg] + to_keep
        else:
            self.messages = [summary_msg] + to_keep

        removed = len(to_summarize)
        logger.info(f"Auto-compacted: summarized {removed} messages into summary")
        return removed

    def _format_messages_for_summary(self, messages: List[Message]) -> str:
        """Format messages for summarization prompt.

        Args:
            messages: List of messages to format

        Returns:
            Formatted string for summarization
        """
        lines = []
        for msg in messages:
            role = msg.role.upper()
            content = msg.content[:500] if msg.content else ""
            if msg.role == "tool":
                lines.append(f"[TOOL:{msg.name}] {content[:200]}")
            else:
                lines.append(f"[{role}] {content}")
        return "\n".join(lines)

    async def _get_llm_summary(self, conversation: str) -> str:
        """Get LLM summary of conversation (non-streaming).

        Args:
            conversation: Formatted conversation text

        Returns:
            Summary text, or fallback message on error
        """
        prompt = COMPACTION_PROMPT.format(conversation=conversation)

        payload = {
            "model": self.config.model,
            "stream": False,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 800,
        }

        try:
            url = f"{self.config.lmstudio_url}/v1/chat/completions"
            resp = await self._http_client.post(url, json=payload, timeout=60.0)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"Summary failed: {e}")
            return "[Summary unavailable - older context was trimmed]"

    async def initialize(self) -> None:
        """Initialize agent - build system prompt and load tools."""
        self._http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=30.0, read=300.0, write=30.0, pool=30.0)
        )

        # Load tools
        await self.mcp_client.list_tools()

        # Initialize LLM provider based on config
        if self.config.llm_provider == "claude":
            from .providers.claude_provider import ClaudeProvider
            from .config import ClaudeAuthMode
            
            # Check authentication based on mode
            if self.config.claude_auth_mode == ClaudeAuthMode.OAUTH:
                if self.config.claude_oauth_token:
                    self._provider = ClaudeProvider(
                        oauth_access_token=self.config.claude_oauth_token,
                        auth_mode="oauth",
                    )
                    logger.info("Initialized Claude provider with OAuth (Pro/Max)")
                elif self.config.claude_api_key:
                    # Fallback to API key if OAuth token not available
                    logger.warning("OAuth mode selected but no token found, falling back to API key")
                    self._provider = ClaudeProvider(
                        api_key=self.config.claude_api_key,
                        auth_mode="api_key",
                    )
                else:
                    raise ValueError(
                        "Claude OAuth not authenticated.\n"
                        "Run: kuroryuu-cli login\n"
                        "Or use API key: set ANTHROPIC_API_KEY or create 'claude_api.ini'"
                    )
            else:
                # API key mode
                if not self.config.claude_api_key:
                    raise ValueError(
                        "Claude API key not found.\n"
                        "Create 'claude_api.ini' next to CLI with your API key,\n"
                        "or set ANTHROPIC_API_KEY environment variable.\n"
                        "Or use OAuth: kuroryuu-cli login --claude-auth oauth"
                    )
                self._provider = ClaudeProvider(
                    api_key=self.config.claude_api_key,
                    auth_mode="api_key",
                )
            
            self.context_window = await self._provider.get_context_window()
            logger.info(f"Initialized Claude provider (context: {self.context_window})")
        else:
            from .providers.lmstudio_provider import LMStudioProvider
            self._provider = LMStudioProvider(http_client=self._http_client)
            # Fetch model info from LMStudio
            await self._fetch_model_info()

        # Build system prompt
        system_prompt = self._build_system_prompt()
        self.messages = [Message(role="system", content=system_prompt)]

    async def _fetch_model_info(self) -> None:
        """Fetch model info from LMStudio API.

        Uses /api/v0/models (native API) for accurate context info,
        falls back to /v1/models (OpenAI-compatible) if unavailable.
        """
        try:
            # Try LM Studio native API first - has accurate context info
            resp = await self._http_client.get(f"{self.config.lmstudio_url}/api/v0/models")
            if resp.status_code == 200:
                data = resp.json()
                models = data.get("data", [])

                # Find our model by ID
                model_info = None
                for model in models:
                    if model.get("id") == self.config.model:
                        model_info = model
                        break

                # Fall back to first model if exact match not found
                if not model_info and models:
                    model_info = models[0]

                if model_info:
                    # Prefer loaded_context_length (user's actual setting) over max
                    loaded = model_info.get("loaded_context_length")
                    max_ctx = model_info.get("max_context_length")

                    if loaded and int(loaded) > 0:
                        self.context_window = int(loaded)
                        logger.info(f"Model context window (loaded): {self.context_window}")
                        return
                    elif max_ctx and int(max_ctx) > 0:
                        self.context_window = int(max_ctx)
                        logger.info(f"Model context window (max): {self.context_window}")
                        return

            # Fallback to OpenAI-compatible endpoint
            resp = await self._http_client.get(f"{self.config.lmstudio_url}/v1/models")
            if resp.status_code == 200:
                data = resp.json()
                models = data.get("data", [])

                for model in models:
                    ctx_length = model.get("context_length") or model.get("max_context_length")
                    if ctx_length:
                        self.context_window = int(ctx_length)
                        logger.info(f"Model context window: {self.context_window}")
                        return

            # Last resort: heuristics based on model name
            model_lower = self.config.model.lower()
            if "128k" in model_lower or "qwen2.5" in model_lower:
                self.context_window = 131072
            elif "32k" in model_lower:
                self.context_window = 32768
            elif "16k" in model_lower:
                self.context_window = 16384
            elif "8k" in model_lower:
                self.context_window = 8192
            logger.info(f"Inferred context window: {self.context_window}")
        except Exception as e:
            logger.warning(f"Could not fetch model info: {e}")

    async def shutdown(self) -> None:
        """Cleanup resources."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None

    async def switch_provider(self, provider: str) -> None:
        """Switch to a different LLM provider at runtime.

        Args:
            provider: Provider name ('lmstudio', 'claude', 'cliproxyapi')

        Raises:
            ValueError: If provider is unknown or auth fails
        """
        from .providers.lmstudio_provider import LMStudioProvider
        from .providers.claude_provider import ClaudeProvider
        from .providers.cliproxy_provider import CLIProxyProvider
        from .config import ClaudeAuthMode, Config

        # Clear existing provider
        self._provider = None

        # Create new provider based on selection
        if provider == "claude":
            # Claude direct API - requires ANTHROPIC_API_KEY (OAuth tokens are blocked)
            # For Max/Pro subscription users, use 'cliproxyapi' instead which wraps Claude CLI
            if not self.config.claude_api_key:
                self.config.claude_api_key = Config._load_claude_api_key()

            if not self.config.claude_api_key:
                raise ValueError(
                    "Claude direct API requires ANTHROPIC_API_KEY.\n"
                    "OAuth tokens are blocked by Anthropic for direct API use.\n"
                    "For Max/Pro subscription: use '/provider cliproxyapi' instead."
                )

            self._provider = ClaudeProvider(
                api_key=self.config.claude_api_key,
                auth_mode="api_key",
            )
            self.config.claude_auth_mode = ClaudeAuthMode.API_KEY
            self.context_window = await self._provider.get_context_window()

        elif provider == "cliproxyapi":
            self._provider = CLIProxyProvider(http_client=self._http_client)
            await self._provider.fetch_model_info(self.config)
            self.context_window = await self._provider.get_context_window()

        else:  # lmstudio (default)
            self._provider = LMStudioProvider(http_client=self._http_client)
            await self._fetch_model_info()

        # Update config
        self.config.llm_provider = provider
        logger.info(f"Switched provider to: {provider} (context: {self.context_window})")

    def cancel(self) -> None:
        """Cancel current processing (ESC key hard stop).

        Sets cancellation flag that is checked during agent processing loop.
        The agent will stop at the next check point and yield a cancelled event.
        """
        self._cancelled = True
        logger.info("Agent processing cancelled by user")

    def _load_prompt_template(self, filename: str) -> str:
        """Load a prompt template from the prompts directory.

        Args:
            filename: Name of the prompt file (e.g., 'system_native.md')

        Returns:
            Content of the prompt file, or empty string if not found
        """
        # First try CLI prompts directory
        cli_prompts_dir = Path(__file__).parent / "prompts"
        prompt_path = cli_prompts_dir / filename

        if prompt_path.exists():
            try:
                return prompt_path.read_text(encoding="utf-8")
            except Exception as e:
                logger.warning(f"Failed to load prompt {filename}: {e}")

        logger.warning(f"Prompt file not found: {prompt_path}")
        return ""

    def _build_system_prompt(self, context_override: Optional[str] = None) -> str:
        """Build system prompt by loading from disk and substituting variables.

        Prompts are loaded from apps/kuroryuu_cli/prompts/:
        - system_devstral.md: Optimized for LMStudio + Devstral
        - system_native.md: For models with native tool calling
        - system_xml.md: For models requiring XML tool format

        Template variables:
        - {{role}}: Agent role (leader/worker)
        - {{session_id}}: Current session ID
        - {{project_root}}: Working directory
        - {{model}}: Model name
        - {{bootstrap}}: Content of KURORYUU_BOOTSTRAP.md
        - {{context}}: Dynamic context from k_session

        Args:
            context_override: Fresh context from k_session, if available
        """
        # Get current model based on active provider
        if self.config.llm_provider == "cliproxyapi":
            current_model = self.config.cliproxy_model
        elif self.config.llm_provider == "claude":
            current_model = self.config.claude_model
        else:
            current_model = self.config.model

        # Check for Devstral-specific prompt (optimized for local Devstral models)
        model_lower = current_model.lower()
        is_devstral = "devstral" in model_lower
        is_lmstudio = self.config.llm_provider == "lmstudio"

        # Load appropriate template
        if is_devstral and is_lmstudio:
            template = self._load_prompt_template("system_devstral.md")
            if template:
                logger.debug("Using Devstral-optimized system prompt")
        elif self._supports_native_tools():
            template = self._load_prompt_template("system_native.md")
        else:
            template = self._load_prompt_template("system_xml.md")

        # Fallback to hardcoded minimal prompt if template not found
        if not template:
            template = """You are Kuroryuu, an autonomous coding agent powered by {{model}}.
Role: {{role}}
Session: {{session_id}}
Working directory: {{project_root}}
Model: {{model}}
{{context}}"""

        # Load bootstrap content for XML mode
        bootstrap_content = ""
        bootstrap_path = self.config.project_root / "KURORYUU_BOOTSTRAP.md"
        if bootstrap_path.exists():
            try:
                bootstrap_content = bootstrap_path.read_text(encoding="utf-8")
            except Exception:
                pass

        # Build context block
        dynamic_context = context_override or self.session_manager._context
        context_block = f"\n\n# Current Context\n{dynamic_context}" if dynamic_context else ""

        # Get model name from provider or config
        model_name = current_model

        # Substitute template variables
        prompt = template.replace("{{role}}", self.session_manager.role or "unknown")
        prompt = prompt.replace("{{session_id}}", self.session_manager.session_id or "unknown")
        prompt = prompt.replace("{{project_root}}", str(self.config.project_root))
        prompt = prompt.replace("{{model}}", model_name)
        prompt = prompt.replace("{{bootstrap}}", bootstrap_content)
        prompt = prompt.replace("{{context}}", context_block)

        return prompt

    def _supports_native_tools(self) -> bool:
        """Check if current model supports native tool calling."""
        if self._provider:
            return self._provider.supports_native_tools
        # Fallback during init - get model based on provider
        if self.config.llm_provider == "cliproxyapi":
            model_lower = self.config.cliproxy_model.lower()
        elif self.config.llm_provider == "claude":
            model_lower = self.config.claude_model.lower()
        else:
            model_lower = self.config.model.lower()
        return any(p in model_lower for p in self.NATIVE_TOOL_MODELS)

    async def refresh_context(self) -> None:
        """Refresh system prompt context from k_session.

        Per Case Study Section 3.5:
        - Call k_session(action="context") to get fresh todo.md context
        - Inject into system prompt dynamically
        """
        new_context = await self.session_manager.get_context()
        if new_context and self.messages and self.messages[0].role == "system":
            # Rebuild system prompt with fresh context
            self.messages[0] = Message(
                role="system",
                content=self._build_system_prompt(context_override=new_context)
            )
            logger.debug("System prompt context refreshed")
        self._messages_since_context_refresh = 0

    async def process(
        self,
        user_input: Union[str, List[Dict[str, Any]]],
    ) -> AsyncGenerator[AgentEvent, None]:
        """Process user input and generate response with tool execution.

        Yields AgentEvents as processing proceeds.

        Args:
            user_input: Either a string (text-only) or list of content blocks (multimodal)

        Stateless mode (default): Each request starts fresh with only system + user message.
        Stateful mode: Accumulates conversation history across turns.
        """
        # Check if context refresh needed (Case Study Section 3.5)
        self._messages_since_context_refresh += 1
        if self._messages_since_context_refresh >= self.CONTEXT_REFRESH_INTERVAL:
            await self.refresh_context()

        # Auto-compact in stateful mode if context is filling up
        if self._should_auto_compact():
            removed = await self._auto_compact_with_summary()
            if removed > 0:
                # Emit event so UI can show feedback
                yield AgentEvent(type="info", data={
                    "message": f"Auto-compacted: summarized {removed} older messages"
                })

        # Stateless mode: Reset to just system prompt + user message
        if self.config.stateless and len(self.messages) > 1:
            system_msg = self.messages[0] if self.messages and self.messages[0].role == "system" else None
            if system_msg:
                self.messages = [system_msg]
            else:
                self.messages = []
            logger.debug("Stateless mode: reset conversation history")

        # Add user message (extract text only if multimodal - don't store images)
        if isinstance(user_input, list):
            # Multimodal content - extract text blocks only for history
            text_parts = []
            image_count = 0
            for block in user_input:
                if block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
                elif block.get("type") == "image_url":
                    image_count += 1

            # Store text-only version in history (images are one-off)
            user_text = " ".join(text_parts) if text_parts else f"[{image_count} image(s)]"
            self.messages.append(Message(role="user", content=user_text))
            logger.debug(f"Stored text-only user message in history ({image_count} images stripped)")
        else:
            # Regular text message
            self.messages.append(Message(role="user", content=user_input))

        # Reset cancellation flag for new request
        self._cancelled = False

        tool_call_count = 0
        max_tool_calls = self.config.max_tool_calls

        # Track if we need to inject multimodal content for first LLM call
        first_call_multimodal = user_input if isinstance(user_input, list) else None

        # Track screenshot from k_capture to auto-inject for next LLM call
        pending_screenshot_injection: Optional[List[Dict[str, Any]]] = None

        while True:
            # Check for cancellation (ESC key)
            if self._cancelled:
                yield AgentEvent(type="cancelled", data={"reason": "user_cancelled"})
                return

            # Call LLM (use multimodal content for first call only)
            accumulated_text = ""
            native_tool_calls: List[Dict[str, Any]] = []
            stop_reason = None

            async for event in self._stream_llm(
                override_last_user_content=first_call_multimodal,
                inject_screenshot=pending_screenshot_injection
            ):
                # Clear multimodal content after first call
                if first_call_multimodal is not None:
                    first_call_multimodal = None
                if pending_screenshot_injection is not None:
                    pending_screenshot_injection = None
                if event.type == "text_delta":
                    accumulated_text += event.data
                    yield event
                elif event.type == "tool_call":
                    native_tool_calls.append(event.data)
                elif event.type == "done":
                    stop_reason = event.data.get("stop_reason")
                elif event.type == "error":
                    yield event
                    return

            # Parse XML tool calls if model doesn't support native
            xml_tool_calls: List[Dict[str, Any]] = []
            if not self._supports_native_tools() and accumulated_text:
                xml_tool_calls = self._parse_xml_tool_calls(accumulated_text)

            # Merge tool calls
            all_tool_calls = native_tool_calls + xml_tool_calls

            # If no tool calls, we're done
            if not all_tool_calls:
                # Add assistant message
                if accumulated_text:
                    self.messages.append(Message(role="assistant", content=accumulated_text))

                yield AgentEvent(type="done", data={"stop_reason": stop_reason or "end_turn"})
                return

            # Check tool call limit (0 = unlimited)
            tool_call_count += len(all_tool_calls)
            if max_tool_calls > 0 and tool_call_count > max_tool_calls:
                yield AgentEvent(type="error", data={
                    "message": f"Tool call limit exceeded ({max_tool_calls})"
                })
                yield AgentEvent(type="done", data={"stop_reason": "tool_limit"})
                return

            # Add assistant message with tool calls
            self.messages.append(Message(
                role="assistant",
                content=accumulated_text,
                tool_calls=[{
                    "id": tc.get("id", f"call_{uuid.uuid4().hex[:8]}"),
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["arguments"]) if isinstance(tc["arguments"], dict) else tc["arguments"],
                    },
                } for tc in all_tool_calls] if self._supports_native_tools() else None,
            ))

            # Check if we can parallelize (multiple auto-approved MCP tools)
            _parallel_executed = False
            if self._can_parallelize_tools(all_tool_calls):
                # Parallel execution for auto-approved MCP tools
                logger.debug(f"Executing {len(all_tool_calls)} tools in parallel")
                async for event in self._execute_tools_parallel(all_tool_calls):
                    yield event
                _parallel_executed = True

            # Sequential execution (skip if already done in parallel)
            if not _parallel_executed:
                for tc in all_tool_calls:
                    # Check for cancellation before each tool
                    if self._cancelled:
                        yield AgentEvent(type="cancelled", data={"reason": "user_cancelled"})
                        return

                    tool_id = tc.get("id", f"call_{uuid.uuid4().hex[:8]}")
                    tool_name = tc["name"]
                    tool_args = tc["arguments"]

                    yield AgentEvent(type="tool_start", data={
                        "name": tool_name,
                        "args": tool_args,
                        "id": tool_id,
                    })

                    # === TOOL APPROVAL CHECK ===
                    if self.permission_manager:
                        # Check if auto-blocked
                        if self.permission_manager.should_block(tool_name):
                            result = ToolResult(
                                name=tool_name,
                                ok=False,
                                content="Tool blocked by user (always-deny)",
                            )
                            yield AgentEvent(type="tool_end", data={
                                "name": tool_name,
                                "ok": False,
                                "result": result.content,
                                "id": tool_id,
                            })
                            self.messages.append(Message(
                                role="tool",
                                content=result.content,
                                name=tool_name,
                                tool_call_id=tool_id,
                            ))
                            continue  # Skip to next tool

                        # Check if needs approval
                        if not self.permission_manager.should_auto_approve(tool_name, tool_args):
                            approval = await self._prompt_tool_approval(tool_name, tool_args, tool_id)

                            if approval == "block":
                                result = ToolResult(
                                    name=tool_name,
                                    ok=False,
                                    content="Tool blocked by user",
                                )
                                yield AgentEvent(type="tool_end", data={
                                    "name": tool_name,
                                    "ok": False,
                                    "result": result.content,
                                    "id": tool_id,
                                })
                                self.messages.append(Message(
                                    role="tool",
                                    content=result.content,
                                    name=tool_name,
                                    tool_call_id=tool_id,
                                ))
                                continue  # Skip to next tool

                            elif approval == "always_tool":
                                self.permission_manager.grant_tool(tool_name)

                            elif approval == "always_all":
                                self.permission_manager.grant_all()
                    # === END APPROVAL CHECK ===

                    # === OPERATION MODE CHECK ===
                    if self.permission_manager:
                        allowed, mode_reason = self.permission_manager.check_operation_mode(
                            tool_name, tool_args
                        )
                        if not allowed:
                            if self.config.operation_mode == OperationMode.PLAN:
                                # PLAN mode: Record the planned action
                                yield AgentEvent(type="tool_planned", data={
                                    "name": tool_name,
                                    "args": tool_args,
                                    "id": tool_id,
                                })
                                result = ToolResult(
                                    name=tool_name,
                                    ok=True,
                                    content=f"[PLANNED] Would execute: {tool_name}({json.dumps(tool_args)[:200]})",
                                )
                            else:
                                # READ mode: Block entirely
                                yield AgentEvent(type="tool_blocked", data={
                                    "name": tool_name,
                                    "args": tool_args,
                                    "reason": mode_reason,
                                })
                                result = ToolResult(
                                    name=tool_name,
                                    ok=False,
                                    content=f"Blocked: {mode_reason}",
                                )

                            yield AgentEvent(type="tool_end", data={
                                "name": tool_name,
                                "ok": result.ok,
                                "result": result.content,
                                "id": tool_id,
                            })
                            self.messages.append(Message(
                                role="tool",
                                content=result.content,
                                name=tool_name,
                                tool_call_id=tool_id,
                            ))
                            continue  # Skip to next tool
                    # === END MODE CHECK ===

                    # Check for local tools (handled by agent_core, not MCP)
                    if self.mcp_client.is_local_tool(tool_name):
                        if tool_name == "ask_user_question":
                            # Handle AG-UI interrupt
                            result, interrupt_event = await self._handle_ask_user_question(tool_args, tool_id)
                            if interrupt_event:
                                yield interrupt_event
                        elif tool_name == "spawn_subagent":
                            # Handle subagent spawning
                            result, subagent_events = await self._handle_spawn_subagent(tool_args, tool_id)
                            for event in subagent_events:
                                yield event
                        elif tool_name == "spawn_parallel_subagents":
                            # Handle parallel subagent spawning
                            result, subagent_events = await self._handle_spawn_parallel_subagents(tool_args, tool_id)
                            for event in subagent_events:
                                yield event
                        else:
                            result = ToolResult(
                                name=tool_name,
                                ok=False,
                                content=f"Unknown local tool: {tool_name}",
                            )
                    # Role-based gating for k_interact (LEADER-ONLY)
                    # Per Case Study Section 6.2: Workers cannot call k_interact
                    elif (is_interact_tool := (
                        tool_name == "k_interact" or
                        tool_name in ("ask_user", "request_approval", "present_plan") or
                        (tool_name == "k_interact" and tool_args.get("action") in K_INTERACT_ACTIONS)
                    )) and not self.session_manager.is_leader():
                        result = ToolResult(
                            name=tool_name,
                            ok=False,
                            content="k_interact is LEADER-ONLY. Workers cannot request human input.",
                        )
                        logger.warning(f"Worker blocked from calling {tool_name} (leader-only)")
                        await self.session_manager.log_progress(
                            f"BLOCKED: Worker attempted k_interact ({tool_args.get('action', tool_name)})"
                        )
                    # Validate routed tool action (Case Study Section 8.2)
                    elif (action_error := self.mcp_client.validate_routed_tool_action(tool_name, tool_args)):
                        result = ToolResult(
                            name=tool_name,
                            ok=False,
                            content=f"Invalid tool action: {action_error}",
                        )
                        logger.warning(f"Tool action validation failed: {action_error}")
                    else:
                        # Pre-tool hook (Case Study Section 7.2)
                        pre_result = await self.session_manager.pre_tool(tool_name, tool_args)

                        # Check both ok and allow fields per updated session_manager
                        if not pre_result.get("ok", True):
                            # Hook itself failed (e.g., network error, parse error)
                            result = ToolResult(
                                name=tool_name,
                                ok=False,
                                content=f"Pre-tool hook failed: {pre_result.get('reason', 'unknown')}",
                            )
                            logger.error(f"Pre-tool hook error for {tool_name}: {pre_result.get('reason')}")
                        elif not pre_result.get("allow", True):
                            # Hook blocked the tool (e.g., feature blocked, strict mode)
                            result = ToolResult(
                                name=tool_name,
                                ok=False,
                                content=f"Tool blocked by hook: {pre_result.get('reason', 'unknown')}",
                            )
                            logger.info(f"Tool {tool_name} blocked by pre-tool hook: {pre_result.get('reason')}")
                        else:
                            # Execute tool
                            result = await self.mcp_client.call_tool(tool_name, tool_args)

                    # Post-tool hook (Case Study Section 7.2)
                    # Now properly awaited with validation
                    post_result = await self.session_manager.post_tool(
                        tool_name,
                        result.ok,
                        result.content[:500] if result.content else "",
                    )
                    if not post_result.get("ok"):
                        logger.warning(f"Post-tool hook failed for {tool_name}")

                    # Check if this is a screenshot result - extract path for auto-injection
                    screenshot_path_for_injection: Optional[str] = None
                    if tool_name == "k_capture" and result.ok:
                        try:
                            result_data = json.loads(result.content)
                            if isinstance(result_data, dict) and result_data.get("ok"):
                                data = result_data.get("data", {})
                                if "path" in data:
                                    screenshot_path_for_injection = data["path"]
                                    logger.debug(f"Will auto-inject screenshot: {screenshot_path_for_injection}")
                        except (json.JSONDecodeError, KeyError):
                            pass

                    yield AgentEvent(type="tool_end", data={
                        "name": tool_name,
                        "ok": result.ok,
                        "result": result.content,
                        "id": tool_id,
                    })

                    # Add tool result to messages
                    self.messages.append(Message(
                        role="tool",
                        content=result.content,
                        name=tool_name,
                        tool_call_id=tool_id,
                    ))

                    # Auto-inject screenshot as a user message if captured
                    if screenshot_path_for_injection:
                        from .image_handler import create_image_content_block
                        from pathlib import Path

                        try:
                            img_path = Path(screenshot_path_for_injection)
                            if img_path.exists():
                                # Create multimodal content with screenshot
                                screenshot_content = [
                                    {
                                        "type": "text",
                                        "text": f"[Screenshot captured: {img_path.name}]"
                                    },
                                    create_image_content_block(img_path)
                                ]

                                # Inject as user message for next LLM call only (one-off)
                                pending_screenshot_injection = screenshot_content
                                logger.debug(f"Prepared screenshot injection: {img_path.name}")
                        except Exception as e:
                            logger.error(f"Failed to prepare screenshot injection: {e}")

            # Continue loop for next LLM response

    def _can_parallelize_tools(self, tool_calls: List[Dict[str, Any]]) -> bool:
        """Check if tool calls can be executed in parallel.

        Parallel execution is allowed when:
        - Multiple tools (>1)
        - All tools are MCP tools (not local like ask_user_question)
        - All tools are auto-approved (no user prompt needed)
        - All tools pass operation mode check

        Args:
            tool_calls: List of tool call dicts

        Returns:
            True if parallel execution is safe
        """
        if len(tool_calls) <= 1:
            return False

        for tc in tool_calls:
            tool_name = tc["name"]
            tool_args = tc.get("arguments", {})

            # Check for local tools
            if self.mcp_client.is_local_tool(tool_name):
                return False

            # Check permission manager
            if self.permission_manager:
                # Check if blocked
                if self.permission_manager.should_block(tool_name):
                    return False

                # Check if needs approval prompt
                if not self.permission_manager.should_auto_approve(tool_name, tool_args):
                    return False

                # Check operation mode
                allowed, _ = self.permission_manager.check_operation_mode(tool_name, tool_args)
                if not allowed:
                    return False

        return True

    async def _execute_tools_parallel(
        self,
        tool_calls: List[Dict[str, Any]],
    ) -> AsyncGenerator[AgentEvent, None]:
        """Execute multiple tool calls in parallel.

        Yields tool_start/tool_end events and adds results to messages.
        Only call this after _can_parallelize_tools returns True.

        Args:
            tool_calls: List of tool call dicts (all must be MCP tools)

        Yields:
            AgentEvent for tool_start/tool_end
        """
        from .mcp_client import ToolResult

        # Yield all tool_start events first
        for tc in tool_calls:
            tool_id = tc.get("id", f"call_{uuid.uuid4().hex[:8]}")
            yield AgentEvent(type="tool_start", data={
                "name": tc["name"],
                "args": tc.get("arguments", {}),
                "id": tool_id,
            })

        async def execute_single(tc: Dict[str, Any]) -> Tuple[Dict[str, Any], Any]:
            """Execute a single tool and return (tool_call, result)."""
            tool_name = tc["name"]
            tool_args = tc.get("arguments", {})
            tool_id = tc.get("id", f"call_{uuid.uuid4().hex[:8]}")

            # Pre-tool hook
            pre_result = await self.session_manager.pre_tool(tool_name, tool_args)
            if not pre_result.get("ok", True) or not pre_result.get("allow", True):
                return (tc, ToolResult(
                    name=tool_name,
                    ok=False,
                    content=f"Hook blocked: {pre_result.get('reason', 'unknown')}",
                ))

            try:
                result = await self.mcp_client.call_tool(tool_name, tool_args)
                await self.session_manager.post_tool(
                    tool_name, result.ok, result.content[:500] if result.content else ""
                )
                return (tc, result)
            except Exception as e:
                await self.session_manager.post_tool(tool_name, False, str(e))
                return (tc, ToolResult(name=tool_name, ok=False, content=str(e)))

        # Execute all tools in parallel
        results = await asyncio.gather(
            *[execute_single(tc) for tc in tool_calls],
            return_exceptions=False,
        )

        # Yield tool_end events and add to messages (in order)
        for tc, result in results:
            tool_id = tc.get("id", f"call_{uuid.uuid4().hex[:8]}")
            tool_name = tc["name"]

            yield AgentEvent(type="tool_end", data={
                "name": tool_name,
                "ok": result.ok,
                "result": result.content,
                "id": tool_id,
            })

            self.messages.append(Message(
                role="tool",
                content=result.content,
                name=tool_name,
                tool_call_id=tool_id,
            ))

    async def _stream_llm(
        self,
        override_last_user_content: Optional[Union[str, List[Dict[str, Any]]]] = None,
        inject_screenshot: Optional[List[Dict[str, Any]]] = None
    ) -> AsyncGenerator[AgentEvent, None]:
        """Stream chat completion from LLM provider.

        Args:
            override_last_user_content: If provided, use this content for the last user message
                                        instead of what's in self.messages (for one-off image reads)
            inject_screenshot: If provided, inject this as an additional user message after building history
        """
        # Build messages list, handling overrides and injections
        messages_to_send: List[Message] = []

        for i, msg in enumerate(self.messages):
            # Use override content for last user message if provided (one-off image reads)
            is_last_user = (i == len(self.messages) - 1 and msg.role == "user")
            if override_last_user_content is not None and is_last_user:
                # Create a new message with override content
                messages_to_send.append(Message(
                    role="user",
                    content=override_last_user_content,
                    name=msg.name,
                    tool_call_id=msg.tool_call_id,
                    tool_calls=msg.tool_calls,
                ))
            else:
                messages_to_send.append(msg)

        # Inject screenshot as user message if provided (one-off, not stored in history)
        if inject_screenshot:
            messages_to_send.append(Message(role="user", content=inject_screenshot))
            logger.debug("Injected screenshot into message stream (one-off)")

        # Get tools if supported
        tools: List[Dict[str, Any]] = []
        if self._supports_native_tools():
            tools = self.mcp_client.get_tool_schemas_for_llm()
            if tools:
                logger.debug(f"Sending {len(tools)} tools to LLM")

        # Estimate prompt tokens before request
        self.last_prompt_tokens = self._estimate_message_tokens(messages_to_send)

        # Delegate to provider
        async for event in self._provider.stream_completion(messages_to_send, tools, self.config):
            # Track usage from done event
            if event.type == "done" and event.data:
                usage = event.data.get("usage")
                if usage:
                    # Handle both OpenAI (prompt_tokens/completion_tokens) and
                    # Claude (input_tokens/output_tokens) format
                    prompt_tokens = usage.get("prompt_tokens") or usage.get("input_tokens", 0)
                    completion_tokens = usage.get("completion_tokens") or usage.get("output_tokens", 0)
                    self.last_prompt_tokens = prompt_tokens
                    self.last_completion_tokens = completion_tokens
                    self.total_prompt_tokens += prompt_tokens
                    self.total_completion_tokens += completion_tokens

            yield event

    async def _prompt_tool_approval(
        self,
        tool_name: str,
        tool_args: Dict[str, Any],
        tool_id: str,
    ) -> str:
        """Prompt user for tool approval.

        Args:
            tool_name: Name of the tool
            tool_args: Tool arguments
            tool_id: Tool call ID

        Returns:
            One of: "allow", "block", "always_tool", "always_all"
        """
        if self.tool_approval_handler:
            return await self.tool_approval_handler(tool_name, tool_args, tool_id)
        return "allow"  # Default if no handler configured

    async def _handle_ask_user_question(
        self,
        args: Dict[str, Any],
        tool_id: str,
    ) -> tuple[ToolResult, Optional[AgentEvent]]:
        """Handle ask_user_question local tool by emitting interrupt and blocking for response.

        Creates an AG-UI interrupt, emits an interrupt event, then calls the
        interrupt handler (if configured) to get user input.

        Args:
            args: Tool arguments (question, options, input_type, reason)
            tool_id: Tool call ID for tracing

        Returns:
            Tuple of (ToolResult, Optional[AgentEvent for interrupt])
        """
        # Create AG-UI interrupt request
        interrupt = InterruptRequest.create(
            question=args.get("question", "Please provide input:"),
            options=args.get("options"),
            input_type=args.get("input_type", "text"),
            reason=args.get("reason", "clarification"),
        )

        # Store pending interrupt for potential resume
        self._pending_interrupt = interrupt

        # Create interrupt event for UI
        interrupt_event = AgentEvent(type="interrupt", data=interrupt.to_agui_interrupt())

        # If we have an interrupt handler, call it (blocks for user input)
        if self.interrupt_handler:
            try:
                answer = await self.interrupt_handler(interrupt)
                resume = ResumePayload(interrupt_id=interrupt.id, answer=answer)
                logger.info(f"User responded to interrupt {interrupt.id}: {answer}")

                return (
                    ToolResult(
                        name="ask_user_question",
                        ok=True,
                        content=json.dumps({"answer": answer}),
                    ),
                    interrupt_event,
                )
            except Exception as e:
                logger.error(f"Interrupt handler failed: {e}")
                return (
                    ToolResult(
                        name="ask_user_question",
                        ok=False,
                        content=f"Interrupt handler error: {e}",
                    ),
                    interrupt_event,
                )
        else:
            # No handler configured - return error
            logger.warning("ask_user_question called but no interrupt_handler configured")
            return (
                ToolResult(
                    name="ask_user_question",
                    ok=False,
                    content="No interrupt handler configured. Cannot get user input.",
                ),
                interrupt_event,
            )

    async def _handle_spawn_subagent(
        self,
        args: Dict[str, Any],
        tool_id: str,
    ) -> tuple[ToolResult, List[AgentEvent]]:
        """Handle spawn_subagent local tool.

        Creates a SubAgent, runs it with the specified task, and returns results.

        Args:
            args: Tool arguments (subagent_type, task, context)
            tool_id: Tool call ID for tracing

        Returns:
            Tuple of (ToolResult, List[AgentEvent])
        """
        events: List[AgentEvent] = []

        subagent_type = args.get("subagent_type", "explorer")
        task = args.get("task", "")
        context = args.get("context", "")

        # Validate subagent type
        if subagent_type not in SUBAGENT_TYPES:
            return (
                ToolResult(
                    name="spawn_subagent",
                    ok=False,
                    content=f"Unknown subagent type: {subagent_type}. Valid: {', '.join(SUBAGENT_TYPES.keys())}",
                ),
                events,
            )

        # Emit subagent_start event
        type_config = SUBAGENT_TYPES[subagent_type]
        events.append(AgentEvent(type="subagent_start", data={
            "type": subagent_type,
            "task": task[:100],  # Truncate for display
            "tools": type_config["tools"],
            "max_turns": type_config["max_turns"],
        }))

        try:
            # Create and run subagent
            subagent = SubAgent(
                config=self.config,
                mcp_client=self.mcp_client,
                subagent_type=subagent_type,
                task=task,
                context=context,
            )

            result = await subagent.run()

            # Emit subagent_end event
            events.append(AgentEvent(type="subagent_end", data={
                "type": subagent_type,
                "ok": result.ok,
                "turns_used": result.turns_used,
                "tools_called": result.tools_called,
                "content_preview": result.content[:200] if result.content else "",
            }))

            return (
                ToolResult(
                    name="spawn_subagent",
                    ok=result.ok,
                    content=f"[Subagent:{subagent_type}] {result.content}",
                ),
                events,
            )

        except Exception as e:
            logger.error(f"Subagent error: {e}")
            events.append(AgentEvent(type="subagent_end", data={
                "type": subagent_type,
                "ok": False,
                "error": str(e),
            }))
            return (
                ToolResult(
                    name="spawn_subagent",
                    ok=False,
                    content=f"Subagent error: {e}",
                ),
                events,
            )

    async def _handle_spawn_parallel_subagents(
        self,
        args: Dict[str, Any],
        tool_id: str,
    ) -> tuple[ToolResult, List[AgentEvent]]:
        """Handle spawn_parallel_subagents local tool.

        Creates multiple SubAgents, runs them in parallel, and returns aggregated results.

        Args:
            args: Tool arguments (subagents, shared_context)
            tool_id: Tool call ID for tracing

        Returns:
            Tuple of (ToolResult, List[AgentEvent])
        """
        events: List[AgentEvent] = []

        subagents_spec = args.get("subagents", [])
        shared_context = args.get("shared_context", "")

        if not subagents_spec:
            return (
                ToolResult(
                    name="spawn_parallel_subagents",
                    ok=False,
                    content="No subagents specified",
                ),
                events,
            )

        # Cap at 5
        subagents_spec = subagents_spec[:5]

        # Emit parallel_start event
        events.append(AgentEvent(type="parallel_subagents_start", data={
            "count": len(subagents_spec),
            "types": [s.get("subagent_type", "explorer") for s in subagents_spec],
            "tasks": [s.get("task", "")[:50] for s in subagents_spec],
        }))

        # Track progress events for sequential mode
        progress_events: List[AgentEvent] = []

        def on_progress(index: int, total: int, subagent_type: str, status: str):
            """Emit progress events during sequential execution."""
            progress_events.append(AgentEvent(type="subagent_progress", data={
                "index": index,
                "total": total,
                "subagent_type": subagent_type,
                "status": status,
            }))

        try:
            # Run subagents (sequential for local LLMs, parallel for cloud)
            result = await spawn_parallel_subagents(
                config=self.config,
                mcp_client=self.mcp_client,
                subagents=subagents_spec,
                shared_context=shared_context,
                on_progress=on_progress,
            )

            # Yield progress events (for UI updates)
            for evt in progress_events:
                events.append(evt)

            # Emit parallel_end event
            events.append(AgentEvent(type="parallel_subagents_end", data={
                "ok": result.ok,
                "count": len(result.results),
                "total_turns": result.total_turns,
                "failed_count": result.failed_count,
                "success_count": len(result.results) - result.failed_count,
            }))

            return (
                ToolResult(
                    name="spawn_parallel_subagents",
                    ok=result.ok,
                    content=result.content,
                ),
                events,
            )

        except Exception as e:
            logger.error(f"Parallel subagents error: {e}")
            events.append(AgentEvent(type="parallel_subagents_end", data={
                "ok": False,
                "error": str(e),
            }))
            return (
                ToolResult(
                    name="spawn_parallel_subagents",
                    ok=False,
                    content=f"Parallel subagents error: {e}",
                ),
                events,
            )

    def _parse_xml_tool_calls(self, text: str) -> List[Dict[str, Any]]:
        """Parse XML tool calls from response text."""
        import re

        tool_calls = []
        pattern = r'<tool_call>\s*<name>([^<]+)</name>\s*<arguments>([^<]*)</arguments>\s*</tool_call>'

        for match in re.finditer(pattern, text, re.DOTALL):
            name = match.group(1).strip()
            args_str = match.group(2).strip()

            try:
                args = json.loads(args_str)
            except json.JSONDecodeError:
                args = {"raw": args_str}

            tool_calls.append({
                "id": f"xml_{uuid.uuid4().hex[:8]}",
                "name": name,
                "arguments": args,
            })

        return tool_calls

    def clear_history(self) -> None:
        """Clear conversation history, keeping system prompt."""
        system_msg = self.messages[0] if self.messages and self.messages[0].role == "system" else None
        self.messages = [system_msg] if system_msg else []

    def rebuild_system_prompt(self) -> None:
        """Rebuild system prompt with current config values.

        Call this after changing model or provider to update the system prompt
        with the correct model name and settings.
        """
        new_prompt = self._build_system_prompt()
        if self.messages and self.messages[0].role == "system":
            self.messages[0] = Message(role="system", content=new_prompt)
        else:
            self.messages.insert(0, Message(role="system", content=new_prompt))
        logger.info("System prompt rebuilt with current config")

    def get_message_count(self) -> int:
        """Get number of messages in history."""
        return len(self.messages)


__all__ = ["AgentCore", "AgentEvent", "Message", "InterruptHandler"]
