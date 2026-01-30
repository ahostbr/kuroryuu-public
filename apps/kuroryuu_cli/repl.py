"""REPL loop - interactive terminal interface."""

from __future__ import annotations

import asyncio
import logging
import random
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

from .config import Config
from .agent_core import AgentCore, AgentEvent
from .agui_events import InterruptRequest
from .gateway_client import GatewayClient
from .mcp_client import MCPClientWrapper
from .session_manager import SessionManager
from .commands import CommandHandler
from .permissions import ToolPermissionManager
from .ui_helpers import ui

# Try to import prompt_toolkit for rich input
try:
    from prompt_toolkit import PromptSession, HTML
    from prompt_toolkit.history import FileHistory
    from prompt_toolkit.patch_stdout import patch_stdout
    from prompt_toolkit.completion import Completer, Completion
    from prompt_toolkit.styles import Style as PTStyle
    from prompt_toolkit.formatted_text import FormattedText
    from prompt_toolkit.input import create_input
    from prompt_toolkit.keys import Keys
    HAS_PROMPT_TOOLKIT = True
except ImportError:
    HAS_PROMPT_TOOLKIT = False

# Prompt toolkit style (Claude-like colors)
PT_STYLE = PTStyle.from_dict({
    'prompt': 'bold ansigreen',
    # Completion menu
    'completion-menu': 'bg:ansibrightblack ansiwhite',
    'completion-menu.completion': 'bg:ansibrightblack',
    'completion-menu.completion.current': 'bg:ansicyan ansiblack',
    'scrollbar.background': 'bg:ansibrightblack',
    'scrollbar.button': 'bg:ansiwhite',
    # Bottom toolbar (context bar)
    'bottom-toolbar': 'bg:#1a1a1a #888888',
    'toolbar': '',
    'toolbar.dim': '#666666',
    'toolbar.ok': '#00ff00',       # Green - low usage
    'toolbar.warn': '#ffff00',     # Yellow - medium usage
    'toolbar.alert': '#ff0000 bold',  # Red - high usage
    'toolbar.plan': '#5599ff bold',   # Blue - PLAN mode
    'toolbar.read': '#00ff00 bold',   # Green - READ mode
}) if HAS_PROMPT_TOOLKIT else None

# Slash commands with descriptions (command, description)
SLASH_COMMANDS = [
    # Core
    ("/help", "Show this help"),
    ("/status", "Agent status and connection info"),
    ("/clear", "Clear conversation history"),
    ("/exit", "Exit CLI"),
    # Provider & Model (key commands)
    ("/provider", "Switch provider: lmstudio | cliproxyapi | claude"),
    ("/model", "Switch model (shorthands: opus, sonnet, codex, gemini, copilot, kiro)"),
    ("/auth", "Check OAuth/API auth status for all providers"),
    # Context
    ("/context", "Show context window usage"),
    ("/compact", "Compact conversation to save tokens"),
    ("/history", "Show conversation history"),
    # Configuration
    ("/config", "View/modify configuration"),
    ("/mode", "Switch operation mode (normal/plan/read)"),
    ("/permissions", "Manage tool approval permissions"),
    # System
    ("/doctor", "Check system health (gateway, MCP, providers)"),
    ("/init", "Initialize project files"),
    ("/memory", "View/edit working memory (goal, blockers, todo)"),
    # Tools
    ("/tools", "List available MCP tools"),
    ("/review", "Request code review"),
    # Agent orchestration
    ("/plan", "Enter plan mode"),
    ("/execute", "Execute next task step"),
    ("/agents", "List registered agents"),
    # Human-in-the-loop
    ("/ask", "Ask user a question (leader only)"),
    ("/approve", "Request user approval (leader only)"),
]


# Fun thinking words (Claude-style)
THINKING_WORDS = [
    "Thinking", "Pondering", "Conjuring", "Reasoning", "Brewing",
    "Contemplating", "Musing", "Ruminating", "Cogitating", "Deliberating",
    "Mulling", "Reflecting", "Considering", "Analyzing", "Processing",
    "Synthesizing", "Formulating", "Calculating", "Decoding", "Unraveling",
    "Boondoggling", "Noodling", "Percolating", "Marinating", "Stewing",
]

# ANSI colors for shimmer effect (yellow/orange gradient)
SHIMMER_COLORS = [
    "\033[38;5;220m",  # Gold
    "\033[38;5;221m",  # Light gold
    "\033[38;5;222m",  # Pale gold
    "\033[38;5;223m",  # Very pale
    "\033[38;5;222m",  # Back
    "\033[38;5;221m",
    "\033[38;5;220m",
    "\033[38;5;214m",  # Orange
    "\033[38;5;208m",  # Dark orange
    "\033[38;5;214m",  # Back up
]
RESET = "\033[0m"


class SlashCommandCompleter(Completer):
    """Custom completer for slash commands with descriptions."""

    def get_completions(self, document, complete_event):
        text = document.text_before_cursor

        # Only complete if starts with /
        if not text.startswith("/"):
            return

        # Get the word being typed
        word = text.lstrip("/").lower()

        for cmd, desc in SLASH_COMMANDS:
            cmd_name = cmd.lstrip("/").lower()
            if cmd_name.startswith(word):
                yield Completion(
                    cmd,
                    start_position=-len(text),
                    display=cmd,
                    display_meta=desc,
                )


class KuroryuuREPL:
    """Interactive REPL for Kuroryuu CLI."""

    def __init__(self, config: Config):
        self.config = config
        self.session_manager = SessionManager(config)
        self.gateway_client = self.session_manager.gateway_client
        self.mcp_client = self.session_manager.mcp_client
        self.agent_core: Optional[AgentCore] = None
        self.command_handler: Optional[CommandHandler] = None
        self.running = False
        self._processing_done = True  # Flag for ESC key listener
        self.permission_manager = ToolPermissionManager(config)  # Tool approval state

        # Setup prompt session with command completion and styling
        # Deferred until needed - set to None initially
        self.prompt_session = None
        self._prompt_session_initialized = False

    def _ensure_prompt_session(self) -> None:
        """Lazily initialize PromptSession when needed for interactive input."""
        if self._prompt_session_initialized:
            return
        self._prompt_session_initialized = True

        if HAS_PROMPT_TOOLKIT:
            try:
                history_path = self.config.get_history_path()
                self.prompt_session = PromptSession(
                    history=FileHistory(str(history_path)),
                    enable_history_search=False,
                    completer=SlashCommandCompleter(),
                    complete_while_typing=True,
                    complete_in_thread=True,
                    reserve_space_for_menu=8,
                    bottom_toolbar=lambda: self._format_context_toolbar(),
                    refresh_interval=0.5,
                    style=PT_STYLE,
                )
            except Exception as e:
                # Fall back to basic input if console not available (e.g., print mode)
                logger.warning(f"Could not initialize PromptSession: {e}")
                self.prompt_session = None

    def _format_context_toolbar(self) -> Any:
        """Format bottom toolbar with context usage bar and operation mode."""
        if not self.agent_core:
            return [("class:toolbar.dim", " Ready ")]

        current = self.agent_core.last_prompt_tokens
        total = self.agent_core.context_window
        pct = (current / total) * 100 if total > 0 else 0

        # Visual bar (20 chars)
        bar_width = 20
        filled = int(bar_width * pct / 100)
        bar = "█" * filled + "░" * (bar_width - filled)

        # Color based on usage
        if pct < 50:
            bar_style = "class:toolbar.ok"
        elif pct < 75:
            bar_style = "class:toolbar.warn"
        else:
            bar_style = "class:toolbar.alert"

        result = [
            ("class:toolbar.dim", "─" * 40),
            ("class:toolbar", " "),
            (bar_style, bar),
            ("class:toolbar", f" {pct:>3.0f}% "),
            ("class:toolbar.dim", f"({current:,}/{total:,} tokens)"),
        ]

        # Add operation mode indicator if not NORMAL
        op_mode = self.config.operation_mode.value.upper()
        if op_mode != "NORMAL":
            # PLAN = blue, READ = green
            mode_style = "class:toolbar.plan" if op_mode == "PLAN" else "class:toolbar.read"
            result.extend([
                ("class:toolbar", " | "),
                (mode_style, f"[{op_mode}]"),
            ])

        result.append(("class:toolbar", " "))
        return result

    async def run(
        self,
        initial_prompt: Optional[str] = None,
        print_mode: bool = False,
    ) -> int:
        """Run the REPL loop.

        Args:
            initial_prompt: Optional prompt to process immediately on start
            print_mode: If True, process prompt and exit (non-interactive)

        Returns:
            Exit code (0 = success, 1 = error)
        """
        try:
            # Initialize session
            ui.print_info("Connecting to Kuroryuu services...")

            try:
                session_info = await self.session_manager.start()
            except ConnectionError as e:
                ui.print_error(str(e))
                return 1

            # Initialize agent with interrupt handler for HITL and tool approval
            self.agent_core = AgentCore(
                self.config,
                self.session_manager,
                interrupt_handler=self.handle_interrupt,
                permission_manager=self.permission_manager,
                tool_approval_handler=self.handle_tool_approval,
            )
            await self.agent_core.initialize()

            # Initialize command handler
            self.command_handler = CommandHandler(self)

            # Print logo and startup banner (skip in print mode for cleaner output)
            if not print_mode:
                ui.print_logo()
                ui.print_banner(
                    role=session_info.get("role", "unknown"),
                    model=self.config.model,
                    session_id=session_info.get("session_id", "unknown"),
                    project_root=str(self.config.project_root),
                )
                ui.print_text("")

            # Handle initial prompt if provided
            if initial_prompt:
                await self._process_message(initial_prompt)
                if print_mode:
                    # Exit after processing in print mode
                    return 0

            # Main loop (skip if print_mode already handled above)
            if print_mode and not initial_prompt:
                ui.print_error("No prompt provided with -p flag")
                return 1

            self.running = True
            return await self._main_loop()

        except KeyboardInterrupt:
            ui.print_text("\n")
            ui.print_info("Interrupted")
            return 0

        except Exception as e:
            ui.print_error(f"Unexpected error: {e}")
            return 1

        finally:
            await self._cleanup()

    async def _main_loop(self) -> int:
        """Main REPL loop."""
        while self.running:
            try:
                # Get user input
                user_input = await self._get_input()

                if user_input is None:
                    # EOF
                    break

                user_input = user_input.strip()
                if not user_input:
                    continue

                # Detect and process images in input
                from .image_handler import detect_image_paths, create_image_content_block

                image_paths = detect_image_paths(user_input)
                if image_paths:
                    # Build multimodal content blocks
                    content_blocks = []

                    # Add text block (remove image paths from text)
                    clean_text = user_input
                    for img_path in image_paths:
                        clean_text = clean_text.replace(img_path, "").strip()

                    if clean_text:
                        content_blocks.append({"type": "text", "text": clean_text})

                    # Add image blocks
                    for img_path_str in image_paths:
                        img_path = Path(img_path_str)
                        if not img_path.is_absolute():
                            img_path = self.config.project_root / img_path

                        if not img_path.exists():
                            ui.print_error(f"Image not found: {img_path}")
                            continue

                        try:
                            content_blocks.append(create_image_content_block(img_path))
                            ui.print_info(f"📎 Attached image: {img_path.name}")
                        except Exception as e:
                            ui.print_error(f"Failed to load image {img_path}: {e}")

                    # Process multimodal message if we have content
                    if content_blocks:
                        await self._process_message(content_blocks)
                        continue

                # Handle slash commands
                if user_input.startswith("/"):
                    should_continue, extra_prompt = await self.command_handler.handle(user_input)

                    if not should_continue:
                        if extra_prompt:
                            ui.print_text(extra_prompt)
                        break

                    # If command returned a prompt, process it
                    if extra_prompt:
                        await self._process_message(extra_prompt)

                    continue

                # Process as chat message
                await self._process_message(user_input)

            except KeyboardInterrupt:
                ui.print_text("\n")
                ui.print_info("Use /exit to quit")
                continue

            except Exception as e:
                ui.print_error(f"Error: {e}")
                continue

        return 0

    async def _get_input(self) -> Optional[str]:
        """Get input from user with styled prompt."""
        self._ensure_prompt_session()
        if self.prompt_session:
            # Use prompt_toolkit for rich input with styled prompt
            try:
                # Use > for Windows compatibility
                prompt = HTML('<ansigreen><b>&gt;</b></ansigreen> ')
                return await self.prompt_session.prompt_async(prompt)
            except EOFError:
                return None
        else:
            # Fallback to basic input
            try:
                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(None, lambda: input("You> "))
            except EOFError:
                return None

    async def _check_esc_key(self) -> None:
        """Check for ESC key press and cancel agent if detected.

        Uses prompt_toolkit's input reader which doesn't conflict with
        the prompt session. Runs concurrently with agent processing.
        """
        if not HAS_PROMPT_TOOLKIT:
            return

        try:
            inp = create_input()

            with inp.raw_mode():
                while not self._processing_done:
                    await asyncio.sleep(0.05)  # 50ms polling
                    # Read any available keys
                    for key_press in inp.read_keys():
                        if key_press.key == Keys.Escape:
                            if self.agent_core:
                                self.agent_core.cancel()
                            return
                        # Non-ESC keys pass through - not consumed
        except Exception:
            # Silently fail - ESC detection is optional
            pass

    async def _thinking_shimmer(self) -> None:
        """Show shimmering thinking animation (Claude-style)."""
        word = random.choice(THINKING_WORDS)
        color_idx = 0
        try:
            while True:
                # Build shimmering text - each char gets offset color
                shimmer_text = ""
                for i, char in enumerate(word):
                    c_idx = (color_idx + i) % len(SHIMMER_COLORS)
                    shimmer_text += f"{SHIMMER_COLORS[c_idx]}{char}"

                # Add the asterisk and ellipsis
                sys.stdout.write(f"\r\033[K\033[38;5;167m*{RESET} {shimmer_text}{RESET}...")
                sys.stdout.flush()

                color_idx = (color_idx + 1) % len(SHIMMER_COLORS)
                await asyncio.sleep(0.08)  # Fast shimmer
        except asyncio.CancelledError:
            # Clear the thinking line
            sys.stdout.write("\r\033[K")
            sys.stdout.flush()

    async def _process_message(self, message: Union[str, List[Dict[str, Any]]]) -> None:
        """Process a chat message through the agent.

        Args:
            message: Either a string (text-only) or list of content blocks (multimodal)
        """
        ui.print_assistant_prefix()

        accumulated_text = ""
        self._processing_done = False
        first_response = False

        # Start ESC key listener and thinking animation concurrently
        esc_task = asyncio.create_task(self._check_esc_key())
        thinking_task = asyncio.create_task(self._thinking_shimmer())

        try:
            async for event in self.agent_core.process(message):
                # Stop thinking animation on first response
                if not first_response:
                    first_response = True
                    thinking_task.cancel()
                    try:
                        await thinking_task
                    except asyncio.CancelledError:
                        pass

                if event.type == "text_delta":
                    # Stream text
                    text = event.data
                    accumulated_text += text
                    ui.print_text(text, end="")
                    sys.stdout.flush()

                elif event.type == "thinking_delta":
                    # Stream thinking content (dimmed)
                    thinking = event.data
                    ui.print_thinking(thinking)
                    sys.stdout.flush()

                elif event.type == "tool_start":
                    # Tool starting
                    if accumulated_text:
                        ui.print_text("")  # Newline
                    ui.print_tool_start(
                        event.data["name"],
                        event.data["args"],
                    )

                elif event.type == "tool_end":
                    # Tool finished
                    ui.print_tool_end(
                        event.data["name"],
                        event.data["ok"],
                        event.data["result"],
                    )
                    # Reset for next text
                    accumulated_text = ""
                    ui.print_assistant_prefix()

                elif event.type == "done":
                    # Finished
                    if accumulated_text:
                        ui.print_text("")  # Final newline
                    ui.print_text("")  # Blank line after response

                elif event.type == "cancelled":
                    # User pressed ESC - hard stop
                    ui.print_text("")
                    ui.print_warning("Cancelled by user (ESC)")
                    ui.print_text("")
                    break

                elif event.type == "interrupt":
                    # AG-UI interrupt event - displayed for logging/debugging
                    # The actual blocking happens in handle_interrupt
                    if accumulated_text:
                        ui.print_text("")
                    accumulated_text = ""

                elif event.type == "info":
                    # Info message (e.g., auto-compaction notification)
                    ui.print_text("")
                    ui.print_info(event.data.get("message", ""))

                elif event.type == "tool_planned":
                    # PLAN mode: Show what would execute
                    if accumulated_text:
                        ui.print_text("")
                    ui.print_tool_planned(
                        event.data["name"],
                        event.data["args"],
                    )
                    accumulated_text = ""

                elif event.type == "tool_blocked":
                    # READ mode: Show blocked tool
                    if accumulated_text:
                        ui.print_text("")
                    ui.print_tool_blocked(
                        event.data["name"],
                        event.data.get("reason", "Blocked by operation mode"),
                    )
                    accumulated_text = ""

                elif event.type == "subagent_start":
                    # Subagent spawning
                    if accumulated_text:
                        ui.print_text("")
                    ui.print_subagent_start(
                        event.data["type"],
                        event.data.get("task", ""),
                        event.data.get("tools", []),
                        event.data.get("max_turns", 5),
                    )
                    accumulated_text = ""

                elif event.type == "subagent_end":
                    # Subagent completed
                    ui.print_subagent_end(
                        event.data["type"],
                        event.data.get("ok", False),
                        event.data.get("turns_used", 0),
                        event.data.get("tools_called", []),
                        event.data.get("content_preview", ""),
                        event.data.get("error", ""),
                    )
                    # Resume main agent display
                    ui.print_assistant_prefix()

                elif event.type == "error":
                    ui.print_text("")
                    ui.print_error(event.data.get("message", "Unknown error"))

        finally:
            self._processing_done = True
            # Cancel both background tasks
            for task in [esc_task, thinking_task]:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    async def handle_interrupt(self, interrupt: InterruptRequest) -> Any:
        """Handle AG-UI interrupt by displaying question and getting user input.

        This is called by AgentCore when the agent calls ask_user_question.
        It blocks until the user provides input.

        Args:
            interrupt: The AG-UI interrupt request with question and options

        Returns:
            The user's answer (string, bool, or selected option)
        """
        # Display styled question panel
        ui.print_interrupt(interrupt)

        if interrupt.input_type == "choice" and interrupt.options:
            # Show numbered options
            for i, opt in enumerate(interrupt.options, 1):
                label = opt.get("label", str(opt))
                desc = opt.get("description", "")
                ui.print_option(i, label, desc)

            # Always show "Other" option
            ui.print_option(len(interrupt.options) + 1, "Other", "Type custom response")
            ui.print_text("")

            response = await self._get_interrupt_input("Your choice: ")

            if response and response.isdigit():
                idx = int(response) - 1
                if 0 <= idx < len(interrupt.options):
                    return interrupt.options[idx].get("label")
                elif idx == len(interrupt.options):
                    # "Other" selected - get custom input
                    return await self._get_interrupt_input("Custom response: ")
            return response

        elif interrupt.input_type == "confirm":
            response = await self._get_interrupt_input("[y/n]: ")
            return response.lower() in ("y", "yes", "true", "1")

        else:  # text
            return await self._get_interrupt_input("> ")

    async def _get_interrupt_input(self, prompt_text: str) -> str:
        """Get user input for interrupt response."""
        self._ensure_prompt_session()
        if self.prompt_session:
            try:
                with patch_stdout():
                    return await self.prompt_session.prompt_async(
                        HTML(f'<ansicyan>{prompt_text}</ansicyan>')
                    )
            except EOFError:
                return ""
        else:
            try:
                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(None, lambda: input(prompt_text))
            except EOFError:
                return ""

    async def handle_tool_approval(
        self,
        tool_name: str,
        tool_args: dict,
        tool_id: str,
    ) -> str:
        """Handle tool approval prompt.

        Shows tool info panel and waits for user decision.

        Args:
            tool_name: Name of the tool
            tool_args: Tool arguments
            tool_id: Tool call ID

        Returns:
            One of: "allow", "block", "always_tool", "always_all"
        """
        # Check if dangerous
        is_dangerous = self.permission_manager._is_dangerous(tool_name, tool_args)

        # Display approval panel
        ui.print_tool_approval(tool_name, tool_args, is_dangerous)

        # Get user input
        while True:
            response = await self._get_approval_input(is_dangerous)
            if response:
                return response

    async def _get_approval_input(self, is_dangerous: bool) -> Optional[str]:
        """Get user approval input.

        Args:
            is_dangerous: If True, disable Always/All options

        Returns:
            One of: "allow", "block", "always_tool", "always_all", or None for retry
        """
        if is_dangerous:
            prompt = "[Y]es / [N]o: "
        else:
            prompt = "[Y]es / [N]o / [A]lways / A[l]l: "

        response = await self._get_interrupt_input(prompt)
        if not response:
            return None

        key = response.lower().strip()

        if key in ("y", "yes", ""):
            return "allow"
        elif key in ("n", "no"):
            return "block"
        elif key in ("a", "always") and not is_dangerous:
            return "always_tool"
        elif key in ("l", "all") and not is_dangerous:
            return "always_all"

        # Invalid input
        if is_dangerous and key in ("a", "l", "always", "all"):
            ui.print_warning("Always/All disabled for dangerous tools")
        return None  # Retry

    async def _cleanup(self) -> None:
        """Cleanup resources."""
        ui.print_info("Cleaning up...")

        if self.agent_core:
            await self.agent_core.shutdown()

        await self.session_manager.stop(summary="CLI session ended normally")


__all__ = ["KuroryuuREPL"]
