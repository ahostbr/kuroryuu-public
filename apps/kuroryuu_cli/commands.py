"""Slash command handlers for the CLI.

Implements patterns from Docs/CaseStudies/ClaudeCode_Integration_Analysis.md:
- Auto progress logging on significant actions (Section 7.2)
- Leader/worker role enforcement (Section 6)
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional, Tuple

from .ui_helpers import ui

if TYPE_CHECKING:
    from .repl import KuroryuuREPL

logger = logging.getLogger(__name__)


class CommandHandler:
    """Handles slash commands in the REPL.

    Per Case Study Section 7.2:
    - Significant actions should call log_progress()
    - Commands like /plan, /execute, /clear are logged
    """

    def __init__(self, repl: "KuroryuuREPL"):
        self.repl = repl

    async def handle(self, command: str) -> Tuple[bool, Optional[str]]:
        """Handle a slash command.

        Args:
            command: Full command string starting with /

        Returns:
            (should_continue, message) tuple
            - should_continue: False to exit REPL
            - message: Optional message to display
        """
        parts = command[1:].split(maxsplit=1)
        cmd = parts[0].lower() if parts else ""
        args = parts[1] if len(parts) > 1 else ""

        handler = getattr(self, f"cmd_{cmd}", None)
        if handler:
            return await handler(args)
        else:
            ui.print_error(f"Unknown command: /{cmd}")
            ui.print_info("Type /help for available commands")
            return True, None

    async def cmd_help(self, args: str) -> Tuple[bool, Optional[str]]:
        """Show help message."""
        ui.print_help()
        return True, None

    async def cmd_exit(self, args: str) -> Tuple[bool, Optional[str]]:
        """Exit the CLI."""
        return False, "Goodbye!"

    async def cmd_quit(self, args: str) -> Tuple[bool, Optional[str]]:
        """Exit the CLI."""
        return False, "Goodbye!"

    async def cmd_status(self, args: str) -> Tuple[bool, Optional[str]]:
        """Show agent status."""
        status = self.repl.session_manager.get_status()
        ui.print_status(status)
        return True, None

    async def cmd_clear(self, args: str) -> Tuple[bool, Optional[str]]:
        """Clear conversation history."""
        self.repl.agent_core.clear_history()
        ui.print_success("Conversation history cleared")

        # Log progress (Case Study Section 7.2)
        await self.repl.session_manager.log_progress("Command: /clear - Conversation history cleared")

        return True, None

    async def cmd_tools(self, args: str) -> Tuple[bool, Optional[str]]:
        """List available tools."""
        tools = await self.repl.mcp_client.list_tools()
        ui.print_tools(tools)
        return True, None

    async def cmd_history(self, args: str) -> Tuple[bool, Optional[str]]:
        """Show conversation history."""
        messages = self.repl.agent_core.messages

        if len(messages) <= 1:  # Only system prompt
            ui.print_info("No conversation history yet")
            return True, None

        ui.print_text(f"\nConversation History ({len(messages) - 1} messages):")
        ui.print_text("-" * 40)

        for msg in messages[1:]:  # Skip system prompt
            role = msg.role.upper()
            content = msg.content[:200] if msg.content else ""
            if len(msg.content or "") > 200:
                content += "..."

            if msg.role == "user":
                ui.print_text(f"[USER] {content}")
            elif msg.role == "assistant":
                ui.print_text(f"[ASSISTANT] {content}")
            elif msg.role == "tool":
                ui.print_text(f"[TOOL:{msg.name}] {content[:100]}")

        return True, None

    async def cmd_plan(self, args: str) -> Tuple[bool, Optional[str]]:
        """Enter plan mode - load Ultimate Quizzer prompt and gather requirements.

        Loads the quizzer prompt which asks structured questions via AskUserQuestion
        to fully understand requirements before proposing any plan.
        """
        # Try full version first, fall back to small
        prompt_paths = [
            self.repl.config.project_root / "ai/prompt_packs/quizmasterplanner/ULTIMATE_QUIZZER PROMPT_full.md",
            self.repl.config.project_root / "ai/prompt_packs/quizmasterplanner/ULTIMATE_QUIZZER_PROMPT_small.md",
        ]

        prompt_content = None
        for prompt_path in prompt_paths:
            if prompt_path.exists():
                prompt_content = prompt_path.read_text(encoding="utf-8")
                ui.print_success(f"Entering plan mode (Ultimate Quizzer)")
                ui.print_info(f"Loaded: {prompt_path.name}")
                break

        if not prompt_content:
            ui.print_error("Plan prompt not found. Expected one of:")
            for p in prompt_paths:
                ui.print_error(f"  - {p}")
            return True, None

        # Log progress
        await self.repl.session_manager.log_progress(
            f"Command: /plan - Entering plan mode with quizzer prompt"
        )

        # Build the initial context
        initial_context = args if args else "I need to plan a task. Start quizzing me."

        # Return the prompt to be processed by the agent
        return True, f"{prompt_content}\n\n---\n\nUser request: {initial_context}"

    async def cmd_execute(self, args: str) -> Tuple[bool, Optional[str]]:
        """Execute a single task step from the plan.

        Loads the execute workflow prompt which:
        1. Reads ai/todo.md for the active task
        2. Executes ONE step using available tools
        3. Updates Docs/DEVLOG.md with progress
        4. Reports outcome to user
        """
        prompt_path = self.repl.config.project_root / "ai/prompts/workflows/execute.md"

        if not prompt_path.exists():
            ui.print_error(f"Execute prompt not found: {prompt_path}")
            return True, None

        prompt_content = prompt_path.read_text(encoding="utf-8")
        ui.print_success("Executing next task step")

        # Log progress
        await self.repl.session_manager.log_progress(
            f"Command: /execute - Loading execute workflow"
        )

        # Build task hint from args or default
        task_hint = args if args else "Execute the next step from ai/todo.md"

        # Return the prompt to be processed by the agent
        return True, f"{prompt_content}\n\n---\n\nTask: {task_hint}"

    async def cmd_agents(self, args: str) -> Tuple[bool, Optional[str]]:
        """List registered agents."""
        try:
            agents = await self.repl.gateway_client.list_agents()

            if not agents:
                ui.print_info("No agents registered")
                return True, None

            ui.print_text("\nRegistered Agents:")
            for agent in agents:
                agent_id = agent.get("agent_id", "unknown")
                role = agent.get("role", "unknown")
                status = agent.get("status", "unknown")
                ui.print_text(f"  [{role}] {agent_id} ({status})")

            return True, None

        except Exception as e:
            ui.print_error(f"Failed to list agents: {e}")
            return True, None

    async def cmd_ask(self, args: str) -> Tuple[bool, Optional[str]]:
        """(Leader) Ask user a question via k_interact.

        Per Case Study Section 6.2:
        - Only leaders can use k_interact tools
        - Provides human-in-the-loop capabilities

        Usage:
            /ask <question>
            /ask choice <question> | option1 | option2 | option3
            /ask confirm <question>
        """
        if not self.repl.session_manager.is_leader():
            ui.print_error("Only leader agents can ask users questions. You are a worker.")
            await self.repl.session_manager.log_progress(
                "Command: /ask BLOCKED - Worker attempted human-in-the-loop"
            )
            return True, None

        if not args:
            ui.print_error("Usage: /ask <question>")
            ui.print_info("  /ask choice <question> | option1 | option2")
            ui.print_info("  /ask confirm <question>")
            return True, None

        # Parse input type and options
        input_type = "text"
        question = args
        options = None

        if args.startswith("choice "):
            input_type = "choice"
            parts = args[7:].split("|")
            question = parts[0].strip()
            options = [p.strip() for p in parts[1:]] if len(parts) > 1 else None
        elif args.startswith("confirm "):
            input_type = "confirm"
            question = args[8:]

        try:
            ui.print_info(f"Asking user: {question}")

            result = await self.repl.mcp_client.call_interact_tool(
                action="ask_user",
                question=question,
                reason="CLI /ask command",
                input_type=input_type,
                options=options,
            )

            if result.ok:
                ui.print_success(f"User response: {result.content}")
                await self.repl.session_manager.log_progress(
                    f"Command: /ask - Asked: {question[:50]}... Response: {result.content[:100]}"
                )
                # Return response as context for agent
                return True, f"User responded to your question '{question}': {result.content}"
            else:
                ui.print_error(f"k_interact failed: {result.error}")
                return True, None

        except Exception as e:
            ui.print_error(f"Failed to ask user: {e}")
            logger.error(f"/ask failed: {e}")
            return True, None

    async def cmd_approve(self, args: str) -> Tuple[bool, Optional[str]]:
        """(Leader) Request user approval for an action via k_interact.

        Per Case Study Section 6.2:
        - Only leaders can request approvals
        - Used for high-risk or irreversible actions

        Usage:
            /approve <action description>
            /approve high <action description>  (high risk)
            /approve critical <action description>  (critical risk)
        """
        if not self.repl.session_manager.is_leader():
            ui.print_error("Only leader agents can request approvals. You are a worker.")
            await self.repl.session_manager.log_progress(
                "Command: /approve BLOCKED - Worker attempted approval request"
            )
            return True, None

        if not args:
            ui.print_error("Usage: /approve <action description>")
            ui.print_info("  /approve high <action>  (high risk)")
            ui.print_info("  /approve critical <action>  (critical risk)")
            return True, None

        # Parse risk level
        risk_level = "medium"
        action_desc = args

        if args.startswith("low "):
            risk_level = "low"
            action_desc = args[4:]
        elif args.startswith("high "):
            risk_level = "high"
            action_desc = args[5:]
        elif args.startswith("critical "):
            risk_level = "critical"
            action_desc = args[9:]

        try:
            ui.print_info(f"Requesting approval ({risk_level}): {action_desc}")

            result = await self.repl.mcp_client.call_interact_tool(
                action="request_approval",
                question=action_desc,  # Passed as action_desc in call_interact_tool
                risk_level=risk_level,
            )

            if result.ok:
                # Parse approval response
                approved = "approved" in result.content.lower() or "yes" in result.content.lower()
                if approved:
                    ui.print_success(f"Action APPROVED: {result.content}")
                    await self.repl.session_manager.log_progress(
                        f"Command: /approve - APPROVED: {action_desc[:50]}..."
                    )
                    return True, f"User approved your action: {action_desc}"
                else:
                    ui.print_error(f"Action DENIED: {result.content}")
                    await self.repl.session_manager.log_progress(
                        f"Command: /approve - DENIED: {action_desc[:50]}..."
                    )
                    return True, f"User denied your action: {action_desc}. Reason: {result.content}"
            else:
                ui.print_error(f"k_interact failed: {result.error}")
                return True, None

        except Exception as e:
            ui.print_error(f"Failed to request approval: {e}")
            logger.error(f"/approve failed: {e}")
            return True, None

    # =========================================================================
    # New Claude Code-style commands
    # =========================================================================

    async def cmd_compact(self, args: str) -> Tuple[bool, Optional[str]]:
        """Compact conversation history to save context.

        Summarizes the conversation and replaces history with a condensed version.
        """
        messages = self.repl.agent_core.messages

        if len(messages) <= 2:  # System prompt + maybe 1 message
            ui.print_info("Conversation too short to compact")
            return True, None

        ui.print_info("Compacting conversation history...")

        # Count before
        msg_count = len(messages) - 1  # Exclude system prompt

        # Create summary prompt
        summary_request = """Summarize the conversation so far in 2-3 sentences,
capturing the main topics discussed and any important decisions or findings."""

        # For now, just trim old messages keeping recent context
        # A full implementation would use the LLM to summarize
        if len(messages) > 10:
            # Keep system prompt + last 6 messages
            kept = [messages[0]] + messages[-6:]
            self.repl.agent_core.messages = kept
            removed = msg_count - 6
            ui.print_success(f"Compacted: removed {removed} old messages, kept last 6")
        else:
            ui.print_info("Conversation not long enough to compact (need >10 messages)")

        await self.repl.session_manager.log_progress(
            f"Command: /compact - Compacted conversation from {msg_count} to {len(self.repl.agent_core.messages)-1} messages"
        )

        return True, None

    async def cmd_config(self, args: str) -> Tuple[bool, Optional[str]]:
        """View or modify configuration.

        Usage:
            /config              - Show all settings
            /config <key>        - Show specific setting
            /config <key> <val>  - Set a value (session only)
        """
        config = self.repl.config

        if not args:
            # Show all config
            ui.print_text("\nConfiguration:")
            ui.print_text("-" * 40)
            ui.print_text(f"  role:          {config.role}")
            ui.print_text(f"  agent_name:    {config.agent_name or '(auto)'}")
            ui.print_text(f"  model:         {config.model}")
            ui.print_text(f"  llm_url:       {config.lmstudio_url}")
            ui.print_text(f"  gateway_url:   {config.gateway_url}")
            ui.print_text(f"  mcp_url:       {config.mcp_url}")
            ui.print_text(f"  project_root:  {config.project_root}")
            ui.print_text(f"  max_tools:     {config.max_tool_calls}")
            ui.print_text(f"  streaming:     {config.streaming}")
            return True, None

        parts = args.split(maxsplit=1)
        key = parts[0]

        if len(parts) == 1:
            # Show specific setting
            if hasattr(config, key):
                ui.print_text(f"{key}: {getattr(config, key)}")
            else:
                ui.print_error(f"Unknown config key: {key}")
            return True, None

        # Set value (session only - not persisted)
        value = parts[1]
        if key == "model":
            config.model = value
            ui.print_success(f"Model set to: {value} (session only)")
        elif key == "max_tools":
            config.max_tool_calls = int(value)
            ui.print_success(f"Max tool calls set to: {value}")
        elif key == "streaming":
            config.streaming = value.lower() in ("true", "1", "yes")
            ui.print_success(f"Streaming set to: {config.streaming}")
        else:
            ui.print_error(f"Cannot modify '{key}' at runtime")

        return True, None

    async def cmd_context(self, args: str) -> Tuple[bool, Optional[str]]:
        """Show context usage with visual progress bar.

        Displays current token usage, context window utilization,
        and breakdown by message type - Claude Code style.
        Data pulled from LMStudio API responses.
        """
        agent = self.repl.agent_core

        # Get real token counts from LLM responses
        # If we have actual usage data from API
        if agent.last_prompt_tokens > 0:
            # Use real data from last LLM call
            current_context_tokens = agent.last_prompt_tokens
            total_generated = agent.total_completion_tokens
            source = "LMStudio API"
        else:
            # Fallback to estimation if no API calls yet
            system_chars = len(agent.messages[0].content) if agent.messages else 0
            msg_chars = sum(len(m.content or "") for m in agent.messages[1:])
            current_context_tokens = (system_chars + msg_chars) // 4
            total_generated = 0
            source = "estimated"

        # Get context window from agent (fetched from /v1/models)
        context_window = agent.context_window

        # Calculate percentage
        pct = min(100, (current_context_tokens / context_window) * 100)

        # Create visual progress bar (20 chars wide)
        bar_width = 20
        filled = int(bar_width * pct / 100)
        empty = bar_width - filled

        # Color coding based on usage
        if pct < 50:
            bar_char = "█"
            color = "green"
        elif pct < 75:
            bar_char = "█"
            color = "yellow"
        else:
            bar_char = "█"
            color = "red"

        bar = bar_char * filled + "░" * empty

        # Count messages
        user_msgs = sum(1 for m in agent.messages if m.role == "user")
        assistant_msgs = sum(1 for m in agent.messages if m.role == "assistant")
        tool_msgs = sum(1 for m in agent.messages if m.role == "tool")
        total_msgs = len(agent.messages) - 1  # Exclude system

        ui.print_text("")

        # Main context bar
        if ui.console:
            from rich.text import Text
            line = Text()
            line.append("Context: ", style="dim")
            line.append(bar, style=color)
            line.append(f" {pct:.0f}% ", style=f"bold {color}")
            line.append(f"({current_context_tokens:,}/{context_window:,} tokens)", style="dim")
            ui.console.print(line)
        else:
            ui.print_text(f"Context: [{bar}] {pct:.0f}% ({current_context_tokens:,}/{context_window:,} tokens)")

        ui.print_text("")

        # Token breakdown
        ui.print_text(f"  Current prompt:   {current_context_tokens:>8,} tokens")
        ui.print_text(f"  Total generated:  {total_generated:>8,} tokens")
        ui.print_text(f"  Context window:   {context_window:>8,} tokens")
        ui.print_text("")

        # Message breakdown
        ui.print_text(f"  Messages: {total_msgs} total ({user_msgs} user, {assistant_msgs} assistant, {tool_msgs} tool)")
        ui.print_text(f"  Source:   {source}")

        # Session totals if we have them
        if agent.total_prompt_tokens > 0:
            ui.print_text("")
            ui.print_text(f"  Session totals:")
            ui.print_text(f"    Prompt tokens:     {agent.total_prompt_tokens:>8,}")
            ui.print_text(f"    Completion tokens: {agent.total_completion_tokens:>8,}")
            ui.print_text(f"    Total:             {agent.total_prompt_tokens + agent.total_completion_tokens:>8,}")

        # Recommendations
        if pct > 75:
            ui.print_text("")
            ui.print_warning("Context nearly full! Use /compact or /clear")
        elif pct > 50:
            ui.print_text("")
            ui.print_info("Tip: Use /compact to free up context space")

        return True, None

    # Keep /cost as alias for /context
    async def cmd_cost(self, args: str) -> Tuple[bool, Optional[str]]:
        """Alias for /context."""
        return await self.cmd_context(args)

    async def cmd_doctor(self, args: str) -> Tuple[bool, Optional[str]]:
        """Check system health - verify all services are running."""
        import httpx

        ui.print_text("\nSystem Health Check:")
        ui.print_text("-" * 40)

        checks = []

        # Check LLM server
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.repl.config.lmstudio_url}/v1/models")
                if resp.status_code == 200:
                    models = resp.json().get("data", [])
                    ui.print_success(f"LLM Server:  OK ({len(models)} models)")
                    checks.append(True)
                else:
                    ui.print_error(f"LLM Server:  Error (HTTP {resp.status_code})")
                    checks.append(False)
        except Exception as e:
            ui.print_error(f"LLM Server:  OFFLINE ({e})")
            checks.append(False)

        # Check Gateway
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.repl.config.gateway_url}/health")
                if resp.status_code == 200:
                    ui.print_success("Gateway:     OK")
                    checks.append(True)
                else:
                    ui.print_error(f"Gateway:     Error (HTTP {resp.status_code})")
                    checks.append(False)
        except Exception as e:
            ui.print_error(f"Gateway:     OFFLINE ({e})")
            checks.append(False)

        # Check MCP
        try:
            tools = await self.repl.mcp_client.list_tools()
            ui.print_success(f"MCP Server:  OK ({len(tools)} tools)")
            checks.append(True)
        except Exception as e:
            ui.print_error(f"MCP Server:  OFFLINE ({e})")
            checks.append(False)

        # Check working memory
        try:
            result = await self.repl.mcp_client.call_tool("k_memory", {"action": "get_context"})
            if result.ok:
                ui.print_success("Memory:      OK")
                checks.append(True)
            else:
                ui.print_warning("Memory:      Error (but MCP running)")
                checks.append(True)
        except Exception:
            ui.print_warning("Memory:      Unavailable")
            checks.append(False)

        # Summary
        ui.print_text("")
        if all(checks):
            ui.print_success("All systems operational!")
        else:
            failed = len([c for c in checks if not c])
            ui.print_error(f"{failed} service(s) need attention")

        return True, None

    async def cmd_init(self, args: str) -> Tuple[bool, Optional[str]]:
        """Initialize project with Kuroryuu bootstrap files.

        Creates KURORYUU_BOOTSTRAP.md and ai/ directory if missing.
        """
        from pathlib import Path

        project_root = self.repl.config.project_root

        ui.print_text("\nInitializing Kuroryuu project...")
        ui.print_text("-" * 40)

        created = []

        # Check/create ai/ directory
        ai_dir = project_root / "ai"
        if not ai_dir.exists():
            ai_dir.mkdir(parents=True)
            ui.print_success(f"Created: ai/")
            created.append("ai/")
        else:
            ui.print_info(f"Exists:  ai/")

        # Check/create ai/todo.md
        todo_file = ai_dir / "todo.md"
        if not todo_file.exists():
            todo_file.write_text("""# Active Focus
None

# Current Blockers
None

# Tasks
- [ ] Initialize project

# Completed
""")
            ui.print_success(f"Created: ai/todo.md")
            created.append("ai/todo.md")
        else:
            ui.print_info(f"Exists:  ai/todo.md")

        # Check/create ai/progress.md
        progress_file = ai_dir / "progress.md"
        if not progress_file.exists():
            progress_file.write_text("""# Progress Log

## Session Start
- Initialized Kuroryuu project
""")
            ui.print_success(f"Created: ai/progress.md")
            created.append("ai/progress.md")
        else:
            ui.print_info(f"Exists:  ai/progress.md")

        # Check KURORYUU_BOOTSTRAP.md
        bootstrap = project_root / "KURORYUU_BOOTSTRAP.md"
        if not bootstrap.exists():
            ui.print_warning(f"Missing: KURORYUU_BOOTSTRAP.md")
            ui.print_info("  Copy from Kuroryuu repo or create manually")
        else:
            ui.print_info(f"Exists:  KURORYUU_BOOTSTRAP.md")

        if created:
            ui.print_success(f"\nCreated {len(created)} file(s)")
            await self.repl.session_manager.log_progress(
                f"Command: /init - Created: {', '.join(created)}"
            )
        else:
            ui.print_info("\nProject already initialized")

        return True, None

    async def cmd_memory(self, args: str) -> Tuple[bool, Optional[str]]:
        """View or edit working memory.

        Usage:
            /memory              - Show current working memory
            /memory goal <text>  - Set active goal
            /memory blocker <t>  - Add a blocker
            /memory clear        - Clear blockers
            /memory todo         - Show ai/todo.md
        """
        if not args:
            # Get working context
            try:
                result = await self.repl.mcp_client.call_tool("k_memory", {"action": "get_context"})
                if result.ok:
                    ui.print_text("\nWorking Memory:")
                    ui.print_text("-" * 40)
                    ui.print_text(result.content)
                else:
                    ui.print_error(f"Failed to get memory: {result.error}")
            except Exception as e:
                ui.print_error(f"Memory unavailable: {e}")
            return True, None

        parts = args.split(maxsplit=1)
        subcmd = parts[0]
        value = parts[1] if len(parts) > 1 else ""

        if subcmd == "goal":
            if not value:
                ui.print_error("Usage: /memory goal <description>")
                return True, None
            try:
                result = await self.repl.mcp_client.call_tool("k_memory", {
                    "action": "set_goal",
                    "goal": value
                })
                if result.ok:
                    ui.print_success(f"Goal set: {value}")
                else:
                    ui.print_error(f"Failed: {result.error}")
            except Exception as e:
                ui.print_error(f"Failed to set goal: {e}")

        elif subcmd == "blocker":
            if not value:
                ui.print_error("Usage: /memory blocker <description>")
                return True, None
            try:
                result = await self.repl.mcp_client.call_tool("k_memory", {
                    "action": "add_blocker",
                    "blocker": value
                })
                if result.ok:
                    ui.print_success(f"Blocker added: {value}")
                else:
                    ui.print_error(f"Failed: {result.error}")
            except Exception as e:
                ui.print_error(f"Failed to add blocker: {e}")

        elif subcmd == "clear":
            try:
                result = await self.repl.mcp_client.call_tool("k_memory", {
                    "action": "clear_blockers"
                })
                if result.ok:
                    ui.print_success("Blockers cleared")
                else:
                    ui.print_error(f"Failed: {result.error}")
            except Exception as e:
                ui.print_error(f"Failed to clear blockers: {e}")

        elif subcmd == "todo":
            # Read ai/todo.md
            todo_path = self.repl.config.project_root / "ai" / "todo.md"
            if todo_path.exists():
                ui.print_text("\nai/todo.md:")
                ui.print_text("-" * 40)
                ui.print_text(todo_path.read_text(encoding="utf-8")[:2000])
            else:
                ui.print_error("ai/todo.md not found. Run /init first.")

        else:
            ui.print_error(f"Unknown subcommand: {subcmd}")
            ui.print_info("Usage: /memory [goal|blocker|clear|todo] [value]")

        return True, None

    async def cmd_model(self, args: str) -> Tuple[bool, Optional[str]]:
        """Switch LLM model with interactive selection.

        Usage:
            /model              - Interactive provider/model selection
            /model help         - Show all model shorthands
            /model <shorthand>  - Switch directly (opus, sonnet, codex, etc.)
        """
        import httpx
        from apps.gateway.cli.model_shorthands import (
            resolve_model, get_model_family, model_supports_tools, MODEL_SHORTHANDS,
            get_models_by_source, get_source_counts, SOURCE_DISPLAY_NAMES,
            TOOL_SUPPORTED_SOURCES,
        )

        provider = self.repl.config.llm_provider

        if args.lower().strip() == "help":
            # Show all shorthands from canonical source
            ui.print_text("\n" + "=" * 60)
            ui.print_text("MODEL SHORTHANDS")
            ui.print_text("=" * 60)

            # Group shorthands by family
            by_family = {}
            for short, full in MODEL_SHORTHANDS.items():
                family = get_model_family(full)
                by_family.setdefault(family, []).append((short, full))

            family_order = ["claude", "openai", "gemini", "copilot", "kiro", "antigravity"]
            family_names = {
                "claude": "Claude (Anthropic) [tools]",
                "openai": "OpenAI/GPT [tools]",
                "gemini": "Gemini (Google) [tools]",
                "copilot": "GitHub Copilot [tools]",
                "kiro": "Kiro/AWS [completion]",
                "antigravity": "Antigravity [completion]",
            }

            for family in family_order:
                if family in by_family:
                    ui.print_text(f"\n{family_names.get(family, family)}")
                    ui.print_text("-" * 40)
                    for short, full in sorted(by_family[family], key=lambda x: x[0]):
                        ui.print_text(f"  {short:15} → {full}")

            ui.print_text("\n" + "=" * 60)
            ui.print_text("Usage: /model <shorthand>  (e.g., /model opus)")
            ui.print_text("=" * 60)

            return True, None

        if not args:
            # Interactive mode - show provider menu
            if provider != "cliproxyapi":
                # For LMStudio/Claude, just show models
                current = self.repl.config.model if provider == "lmstudio" else self.repl.config.claude_model
                ui.print_text(f"\nProvider: {provider}")
                ui.print_text(f"Current: {current}")
                ui.print_info("Use /model <name> to switch")
                return True, None

            current = self.repl.config.cliproxy_model

            # Use static model list (canonical source matching desktop)
            by_source = get_models_by_source()
            source_counts = get_source_counts()
            total_models = sum(source_counts.values())

            # Show provider menu
            ui.print_text(f"\nCurrent: {current}")
            family = get_model_family(current)
            tools = "[tools]" if model_supports_tools(current) else "[completion]"
            ui.print_text(f"Family: {family} {tools}")

            ui.print_text(f"\nProviders ({total_models} models available):")
            ui.print_text("-" * 50)

            # Display in canonical order
            source_order = ["claude", "openai", "gemini", "github-copilot", "kiro", "antigravity"]
            for i, source in enumerate(source_order, 1):
                display_name = SOURCE_DISPLAY_NAMES.get(source, source.title())
                count = source_counts.get(source, 0)
                tools_tag = "[tools]" if source in TOOL_SUPPORTED_SOURCES else "[completion]"
                status = f"{count:>2} models" if count > 0 else " 0 models"
                ui.print_text(f"  [{i}] {display_name:12} {status}  {tools_tag}")

            ui.print_text("\nShorthands: opus, sonnet, haiku, codex, gpt5, gemini, flash, kiro")
            ui.print_text("")
            ui.print_text("Usage:")
            ui.print_text("  /model <shorthand>         - Quick switch (opus, codex, etc.)")
            ui.print_text("  /model <source>:<model>    - Specify source (copilot:gpt-5.2)")
            ui.print_text("  /model help                - Show all shorthands")

            return True, None

        # Direct model switch - supports multiple formats:
        #   /model opus              -> shorthand resolution
        #   /model gpt-5.2           -> exact model ID
        #   /model copilot:gpt-5.2   -> source:model format (for duplicates)
        #   /model copilot gpt-5.2   -> source model format (space separated)

        parts = args.strip().split()
        source_hint = None

        if len(parts) == 1:
            # Single argument - could be shorthand, model ID, or source:model
            if ":" in parts[0]:
                # source:model format
                source_hint, model_arg = parts[0].split(":", 1)
            else:
                model_arg = parts[0]
        elif len(parts) == 2:
            # Two arguments - source model
            source_hint = parts[0].lower()
            model_arg = parts[1]
        else:
            # Too many args
            ui.print_error("Usage: /model <shorthand> or /model <source>:<model>")
            ui.print_info("Examples: /model opus, /model copilot:gpt-5.2, /model openai gpt-5")
            return True, None

        # Resolve shorthand
        model = resolve_model(model_arg) if provider == "cliproxyapi" else model_arg

        # If source hint provided, format as source:model for CLIProxyAPI
        if source_hint:
            # Normalize source names
            source_map = {
                "copilot": "github-copilot",
                "openai": "openai",
                "claude": "claude",
                "gemini": "gemini",
                "kiro": "kiro",
                "antigravity": "antigravity",
            }
            source = source_map.get(source_hint.lower(), source_hint.lower())
            # Some APIs use source:model format, others use model@source
            # Try the model with source prefix for routing
            display_model = f"{source}:{model}"
        else:
            display_model = model

        # Update config based on provider
        if provider == "cliproxyapi":
            old_model = self.repl.config.cliproxy_model
            self.repl.config.cliproxy_model = model  # Store just the model ID
        elif provider == "claude":
            old_model = self.repl.config.claude_model
            self.repl.config.claude_model = model
        else:
            old_model = self.repl.config.model
            self.repl.config.model = model

        # Rebuild system prompt with new model name
        self.repl.agent_core.rebuild_system_prompt()

        # Show result with family info
        family = get_model_family(model)
        tools = "[tools]" if model_supports_tools(model) else "[completion]"

        if source_hint:
            ui.print_success(f"Switched: {model} (source: {source_hint})")
        elif model_arg.lower() != model.lower():
            ui.print_success(f"Switched: {model} (from '{model_arg}')")
        else:
            ui.print_success(f"Switched: {model}")
        ui.print_info(f"  Family: {family} {tools}")

        if source_hint:
            ui.print_warning(f"  Note: Source routing ({source_hint}) requires CLIProxyAPI support")

        await self.repl.session_manager.log_progress(
            f"Command: /model - Switched from {old_model} to {model}"
        )

        return True, None

    async def cmd_provider(self, args: str) -> Tuple[bool, Optional[str]]:
        """Switch LLM provider with health dashboard.

        Usage:
            /provider              - Show provider health dashboard
            /provider help         - Detailed explanation of each provider
            /provider <name>       - Switch to provider (cliproxyapi/lmstudio/claude)
        """
        import httpx
        from apps.gateway.cli.model_shorthands import (
            get_model_family, model_supports_tools,
            get_source_counts, SOURCE_DISPLAY_NAMES, TOOL_SUPPORTED_SOURCES,
        )

        # Get static model counts
        source_counts = get_source_counts()
        total_static = sum(source_counts.values())

        PROVIDERS = {
            "cliproxyapi": {
                "name": "CLI Proxy API",
                "desc": f"{total_static} models: Claude, OpenAI, Gemini, Copilot, Kiro, Antigravity",
                "url": self.repl.config.cliproxy_url,
            },
            "lmstudio": {
                "name": "LM Studio",
                "desc": "Local LLM server",
                "url": self.repl.config.lmstudio_url,
            },
            "claude": {
                "name": "Claude API",
                "desc": "Direct Anthropic API (requires ANTHROPIC_API_KEY)",
                "url": "api.anthropic.com",
            },
        }

        if args.lower().strip() == "help":
            # Detailed provider help
            ui.print_text("\n" + "=" * 60)
            ui.print_text("PROVIDER GUIDE")
            ui.print_text("=" * 60)

            ui.print_text("\n[1] cliproxyapi (RECOMMENDED)")
            ui.print_text("-" * 40)
            ui.print_text(f"  URL: {self.repl.config.cliproxy_url}")
            ui.print_text("  Auth: Bearer token (local)")
            ui.print_text(f"  Models: {total_static} models across 6 providers")
            ui.print_text("")
            ui.print_text("  Providers: Claude, OpenAI, Gemini, Copilot, Kiro, Antigravity")
            ui.print_text("  OAuth handled by CLIProxyAPI binary per-provider")
            ui.print_text("")
            ui.print_text("  Quick start:")
            ui.print_text("    /provider cliproxyapi")
            ui.print_text("    /model opus")

            ui.print_text("\n[2] lmstudio")
            ui.print_text("-" * 40)
            ui.print_text(f"  URL: {self.repl.config.lmstudio_url}")
            ui.print_text("  Auth: None (local)")
            ui.print_text("  Models: Whatever you load in LM Studio")
            ui.print_text("")
            ui.print_text("  Good for: Offline, privacy, local models")

            ui.print_text("\n[3] claude")
            ui.print_text("-" * 40)
            ui.print_text("  Auth: ANTHROPIC_API_KEY environment variable")
            ui.print_text("  Note: Requires paid API key (OAuth blocked)")

            ui.print_text("\n" + "=" * 60)

            return True, None

        if not args:
            # Show provider health dashboard
            current = self.repl.config.llm_provider

            ui.print_text("\n" + "=" * 60)
            ui.print_text("PROVIDER HEALTH DASHBOARD")
            ui.print_text("=" * 60)

            # Check CLIProxyAPI connectivity
            cliproxy_status = "[--]"
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    headers = {"Authorization": "Bearer kuroryuu-local"}
                    resp = await client.get(
                        f"{self.repl.config.cliproxy_url}/v1/models",
                        headers=headers
                    )
                    if resp.status_code == 200:
                        cliproxy_status = "[OK]"
            except httpx.ConnectError:
                cliproxy_status = "[--]"
            except Exception:
                cliproxy_status = "[??]"

            # Check LMStudio
            lmstudio_status = "[--]"
            lmstudio_models = 0
            try:
                async with httpx.AsyncClient(timeout=2.0) as client:
                    resp = await client.get(f"{self.repl.config.lmstudio_url}/v1/models")
                    if resp.status_code == 200:
                        lmstudio_status = "[OK]"
                        lmstudio_models = len(resp.json().get("data", []))
            except Exception:
                pass

            # Check Claude API key
            claude_status = "[OK]" if self.repl.config.claude_api_key else "[--]"

            # Display backend status
            ui.print_text("\nBackends:")
            marker = "→" if current == "cliproxyapi" else " "
            ui.print_text(f"  {marker} {cliproxy_status} cliproxyapi  {total_static:>3} models  {self.repl.config.cliproxy_url}")
            marker = "→" if current == "lmstudio" else " "
            ui.print_text(f"  {marker} {lmstudio_status} lmstudio     {lmstudio_models:>3} models  {self.repl.config.lmstudio_url}")
            marker = "→" if current == "claude" else " "
            status_note = "API key set" if self.repl.config.claude_api_key else "no API key"
            ui.print_text(f"  {marker} {claude_status} claude             ({status_note})")

            # Display CLIProxyAPI provider breakdown using static list
            ui.print_text("\nCLIProxyAPI Providers:")
            source_order = ["claude", "openai", "gemini", "github-copilot", "kiro", "antigravity"]
            for source in source_order:
                display_name = SOURCE_DISPLAY_NAMES.get(source, source.title())
                count = source_counts.get(source, 0)
                tools_tag = "[tools]" if source in TOOL_SUPPORTED_SOURCES else "[completion]"
                status = "[OK]" if count > 0 else "[--]"
                ui.print_text(f"  {status} {display_name:12} {count:>2} models  {tools_tag}")

            # Show current model info
            if current == "cliproxyapi":
                model = self.repl.config.cliproxy_model
            elif current == "claude":
                model = self.repl.config.claude_model
            else:
                model = self.repl.config.model

            family = get_model_family(model)
            tools = "[tools]" if model_supports_tools(model) else "[completion]"
            ui.print_text(f"\nCurrent: {current} | Model: {model}")
            ui.print_text(f"Family: {family} {tools}")

            ui.print_text("\n" + "=" * 60)
            ui.print_text("Switch: /provider <name>  |  Help: /provider help")
            ui.print_text("=" * 60)

            return True, None

        # Switch provider
        provider = args.lower().strip()
        if provider not in PROVIDERS:
            ui.print_error(f"Unknown provider: {provider}")
            ui.print_info(f"Available: {', '.join(PROVIDERS.keys())}")
            return True, None

        try:
            old_provider = self.repl.config.llm_provider

            # Reinitialize provider in agent_core
            await self.repl.agent_core.switch_provider(provider)

            ui.print_success(f"Switched to {PROVIDERS[provider]['name']}")

            # Show current model for new provider
            if provider == "cliproxyapi":
                model = self.repl.config.cliproxy_model
            elif provider == "claude":
                model = self.repl.config.claude_model
            else:
                model = self.repl.config.model

            family = get_model_family(model)
            tools = "[tools]" if model_supports_tools(model) else "[completion]"
            ui.print_info(f"  Model: {model} ({family} {tools})")

            # Log progress
            await self.repl.session_manager.log_progress(
                f"Command: /provider - Switched from {old_provider} to {provider}"
            )

        except Exception as e:
            ui.print_error(f"Failed to switch provider: {e}")
            logger.error(f"/provider failed: {e}")

        return True, None

    async def cmd_auth(self, args: str) -> Tuple[bool, Optional[str]]:
        """Check authentication status for providers.

        Usage:
            /auth              - Show auth status for current provider
            /auth claude       - Check Claude OAuth status
            /auth status       - Show all provider auth status
        """
        import httpx

        if not args or args == "status":
            # Show auth status for CLIProxyAPI (OAuth-based)
            ui.print_text("\nAuthentication Status")
            ui.print_text("-" * 40)

            # Check CLIProxyAPI
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    headers = {"Authorization": "Bearer kuroryuu-local"}
                    resp = await client.get(
                        f"{self.repl.config.cliproxy_url}/v1/models",
                        headers=headers
                    )
                    if resp.status_code == 200:
                        models = resp.json().get("data", [])
                        ui.print_success(f"CLIProxyAPI: Connected ({len(models)} models)")
                    else:
                        ui.print_warning(f"CLIProxyAPI: HTTP {resp.status_code}")
            except httpx.ConnectError:
                ui.print_error("CLIProxyAPI: Not running (start CLIProxyAPI on port 8317)")
            except Exception as e:
                ui.print_error(f"CLIProxyAPI: {e}")

            # Check Claude API key
            if self.repl.config.claude_api_key:
                ui.print_success("Claude API: Key configured")
            else:
                ui.print_info("Claude API: No API key (use CLIProxyAPI for OAuth)")

            # Check LMStudio
            try:
                async with httpx.AsyncClient(timeout=2.0) as client:
                    resp = await client.get(f"{self.repl.config.lmstudio_url}/v1/models")
                    if resp.status_code == 200:
                        ui.print_success("LMStudio: Connected")
                    else:
                        ui.print_warning(f"LMStudio: HTTP {resp.status_code}")
            except httpx.ConnectError:
                ui.print_info("LMStudio: Not running")
            except Exception:
                ui.print_info("LMStudio: Not available")

            return True, None

        # Provider-specific auth check
        provider = args.lower().strip()

        if provider == "claude":
            # Check kuroryuu OAuth tokens
            try:
                from .anthropic_oauth import load_tokens
                import time

                tokens = load_tokens()
                if tokens is None:
                    ui.print_error("Claude OAuth: Not authenticated")
                    ui.print_info("Note: OAuth tokens are blocked for direct API use")
                    ui.print_info("Use CLIProxyAPI instead: /provider cliproxyapi")
                elif tokens.is_expired():
                    ui.print_warning(f"Claude OAuth: Token expired ({time.ctime(tokens.expires_at)})")
                else:
                    ui.print_success(f"Claude OAuth: Authenticated until {time.ctime(tokens.expires_at)}")
                    if tokens.email:
                        ui.print_info(f"  Email: {tokens.email}")
                    ui.print_warning("Note: OAuth tokens blocked by Anthropic for direct API")
            except ImportError:
                ui.print_error("OAuth module not available")

        else:
            ui.print_info(f"Use '/auth status' to see all provider status")

        return True, None

    async def cmd_permissions(self, args: str) -> Tuple[bool, Optional[str]]:
        """View/manage tool approval permissions.

        Usage:
            /permissions          - Show status
            /permissions reset    - Reset all to ask
            /permissions grant X  - Always allow tool X
            /permissions deny X   - Always deny tool X
            /permissions all      - Accept all (non-dangerous)
        """
        pm = self.repl.permission_manager

        if not args:
            # Show current permission status
            status = pm.get_status()

            ui.print_text("\nTool Approval Permissions")
            ui.print_text("-" * 40)

            # Accept all status
            if status["accept_all"]:
                ui.print_success("  Accept All: ENABLED (non-dangerous tools auto-approved)")
            else:
                ui.print_text("  Accept All: disabled")

            # Always approved tools
            approved = status["always_approved"]
            if approved:
                ui.print_text(f"\n  Always Approved ({len(approved)}):")
                for tool in approved:
                    ui.print_text(f"    [green]✔[/green] {tool}" if ui.console else f"    [OK] {tool}")
            else:
                ui.print_text("\n  Always Approved: none")

            # Always denied tools
            denied = status["always_denied"]
            if denied:
                ui.print_text(f"\n  Always Denied ({len(denied)}):")
                for tool in denied:
                    ui.print_text(f"    [red]✖[/red] {tool}" if ui.console else f"    [X] {tool}")
            else:
                ui.print_text("\n  Always Denied: none")

            # Dangerous tools (always prompt)
            dangerous = status["dangerous_tools"]
            ui.print_text(f"\n  Dangerous Tools (always prompt):")
            for tool in dangerous:
                ui.print_text(f"    [yellow]⚠[/yellow] {tool}" if ui.console else f"    [!] {tool}")

            ui.print_text("\nCommands:")
            ui.print_info("  /permissions reset    - Clear all permissions")
            ui.print_info("  /permissions grant X  - Always allow tool X")
            ui.print_info("  /permissions deny X   - Always deny tool X")
            ui.print_info("  /permissions all      - Auto-approve all (non-dangerous)")

            return True, None

        # Parse subcommand
        parts = args.split()
        cmd = parts[0].lower()

        if cmd == "reset":
            pm.reset()
            ui.print_success("All permissions reset to default (ask)")
            await self.repl.session_manager.log_progress(
                "Command: /permissions reset - All permissions cleared"
            )

        elif cmd == "grant" and len(parts) > 1:
            tool_name = parts[1]
            pm.grant_tool(tool_name)
            ui.print_success(f"Granted always-allow: {tool_name}")
            await self.repl.session_manager.log_progress(
                f"Command: /permissions grant {tool_name}"
            )

        elif cmd == "deny" and len(parts) > 1:
            tool_name = parts[1]
            pm.deny_tool(tool_name)
            ui.print_success(f"Set always-deny: {tool_name}")
            await self.repl.session_manager.log_progress(
                f"Command: /permissions deny {tool_name}"
            )

        elif cmd == "all":
            pm.grant_all()
            ui.print_success("Accepting all tools (dangerous tools still prompt)")
            await self.repl.session_manager.log_progress(
                "Command: /permissions all - Accept all enabled"
            )

        else:
            ui.print_error("Usage: /permissions [reset|grant X|deny X|all]")

        return True, None

    async def cmd_mode(self, args: str) -> Tuple[bool, Optional[str]]:
        """/mode - View or switch modes.

        Usage:
            /mode              - Show current modes
            /mode stateful     - Conversation accumulates
            /mode stateless    - Conversation resets each turn
            /mode normal       - Full tool access (default)
            /mode plan         - Read + plan actions (dry run)
            /mode read         - Read-only (safe exploration)
        """
        from .config import OperationMode
        config = self.repl.config

        if not args:
            # Show both mode types
            conv_mode = "stateless" if config.stateless else "stateful"
            op_mode = config.operation_mode.value

            ui.print_text(f"\nConversation: {conv_mode}")
            ui.print_text(f"Operation:    {op_mode}")
            ui.print_text("")

            if op_mode == "plan":
                ui.print_info("  PLAN mode: Read-only + planned actions shown")
            elif op_mode == "read":
                ui.print_info("  READ mode: Read-only tools only")
            else:
                ui.print_info("  NORMAL mode: Full tool access")

            ui.print_text("")
            ui.print_info("Commands:")
            ui.print_info("  /mode stateful|stateless  - Conversation mode")
            ui.print_info("  /mode normal|plan|read    - Operation mode")
            return True, None

        mode = args.strip().lower()

        # Conversation modes
        if mode in ("stateful", "statefull", "state"):
            config.stateless = False
            ui.print_success("Switched to STATEFUL conversation")
            ui.print_info("  Conversation will accumulate across turns")
            mode = "stateful"
        elif mode in ("stateless", "statless"):
            config.stateless = True
            ui.print_success("Switched to STATELESS conversation")
            ui.print_info("  Conversation resets to system prompt each turn")
            mode = "stateless"

        # Operation modes
        elif mode in ("normal", "full"):
            config.operation_mode = OperationMode.NORMAL
            ui.print_success("Switched to NORMAL mode (full access)")
            mode = "normal"
        elif mode in ("plan", "planning", "dry"):
            config.operation_mode = OperationMode.PLAN
            ui.print_success("Switched to PLAN mode")
            ui.print_info("  Write actions will be planned, not executed")
            mode = "plan"
        elif mode in ("read", "readonly", "safe"):
            config.operation_mode = OperationMode.READ
            ui.print_success("Switched to READ mode")
            ui.print_info("  Only read-only tools allowed")
            mode = "read"

        else:
            ui.print_error(f"Unknown mode: {mode}")
            ui.print_info("Valid: stateful, stateless, normal, plan, read")
            return True, None

        await self.repl.session_manager.log_progress(f"Command: /mode {mode}")
        return True, None

    async def cmd_review(self, args: str) -> Tuple[bool, Optional[str]]:
        """Request a code review from the LLM.

        Usage:
            /review <file>       - Review a specific file
            /review              - Review recent changes (git diff)
        """
        if not args:
            # Review git diff
            import subprocess
            try:
                result = subprocess.run(
                    ["git", "diff", "--staged"],
                    capture_output=True,
                    text=True,
                    cwd=str(self.repl.config.project_root),
                    timeout=10
                )
                diff = result.stdout

                if not diff:
                    # Try unstaged
                    result = subprocess.run(
                        ["git", "diff"],
                        capture_output=True,
                        text=True,
                        cwd=str(self.repl.config.project_root),
                        timeout=10
                    )
                    diff = result.stdout

                if not diff:
                    ui.print_info("No changes to review. Specify a file: /review <path>")
                    return True, None

                ui.print_info("Requesting review of git changes...")

                # Truncate if too long
                if len(diff) > 8000:
                    diff = diff[:8000] + "\n... (truncated)"

                review_prompt = f"""Please review these code changes and provide feedback:

```diff
{diff}
```

Focus on:
1. Potential bugs or issues
2. Code style and best practices
3. Security concerns
4. Suggestions for improvement"""

                return True, review_prompt

            except subprocess.TimeoutExpired:
                ui.print_error("Git command timed out")
                return True, None
            except FileNotFoundError:
                ui.print_error("Git not found. Specify a file: /review <path>")
                return True, None

        # Review specific file
        from pathlib import Path
        file_path = Path(args)
        if not file_path.is_absolute():
            file_path = self.repl.config.project_root / file_path

        if not file_path.exists():
            ui.print_error(f"File not found: {args}")
            return True, None

        try:
            content = file_path.read_text(encoding="utf-8")

            # Truncate if too long
            if len(content) > 10000:
                content = content[:10000] + "\n... (truncated)"

            ui.print_info(f"Requesting review of {args}...")

            review_prompt = f"""Please review this code and provide feedback:

File: {args}
```
{content}
```

Focus on:
1. Potential bugs or issues
2. Code style and best practices
3. Security concerns
4. Suggestions for improvement"""

            return True, review_prompt

        except Exception as e:
            ui.print_error(f"Failed to read file: {e}")
            return True, None


__all__ = ["CommandHandler"]
