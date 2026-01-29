"""Terminal UI helpers for rich formatting - Claude Code style."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

try:
    from rich.console import Console, Group
    from rich.panel import Panel
    from rich.text import Text
    from rich.spinner import Spinner
    from rich.live import Live
    from rich.markdown import Markdown
    from rich.syntax import Syntax
    from rich.table import Table
    from rich.box import ROUNDED, MINIMAL, SIMPLE
    from rich.rule import Rule
    from rich.style import Style
    from rich.theme import Theme
    from rich.progress import Progress, SpinnerColumn, TextColumn
    HAS_RICH = True

    # Claude-inspired color theme
    CLAUDE_THEME = Theme({
        "info": "dim cyan",
        "warning": "yellow",
        "error": "bold red",
        "success": "bold green",
        "user": "bold green",
        "assistant": "bold blue",
        "tool": "bold magenta",
        "tool.name": "cyan",
        "tool.arg": "dim",
        "tool.success": "green",
        "tool.error": "red",
        "code": "bright_white on grey23",
        "heading": "bold cyan",
        "muted": "dim",
    })

    # Check if terminal supports unicode
    import sys
    import os
    SUPPORTS_UNICODE = (
        sys.stdout.encoding and 'utf' in sys.stdout.encoding.lower()
    ) or os.name != 'nt'

    # Icons (with ASCII fallbacks for Windows)
    if SUPPORTS_UNICODE:
        ICONS = {
            'success': '✔',
            'error': '✖',
            'warning': '⚠',
            'info': 'ℹ',
            'user': '❯',
            'assistant': '◆',
            'tool': '⚡',
            'thinking': '💭',
            'box_top': '╭─',
            'box_mid': '│',
            'box_bot': '╰─',
            'tool_start': '┌─',
            'tool_mid': '│',
            'tool_end': '└─',
        }
    else:
        ICONS = {
            'success': '(OK)',
            'error': '(X)',
            'warning': '(!)',
            'info': '(i)',
            'user': '>',
            'assistant': '*',
            'tool': '>>',
            'thinking': '...',
            'box_top': '+-',
            'box_mid': '|',
            'box_bot': '+-',
            'tool_start': '+-',
            'tool_mid': '|',
            'tool_end': '+-',
        }
except ImportError:
    HAS_RICH = False
    CLAUDE_THEME = None
    SUPPORTS_UNICODE = False  # Safe default without rich
    ICONS = {
        'success': '(OK)',
        'error': '(X)',
        'warning': '(!)',
        'info': '(i)',
        'user': '>',
        'assistant': '*',
        'tool': '>>',
        'thinking': '...',
        'box_top': '+-',
        'box_mid': '|',
        'box_bot': '+-',
        'tool_start': '+-',
        'tool_mid': '|',
        'tool_end': '+-',
    }


# Kuroryuu Dragon ASCII Art Logo
DRAGON_LOGO = """[dim]
                                ==++++++++++=
                            ====    -==+++++++==========
                        #+=+                     ====++++++++
                     ### %%                           ++******%%%
                  +**     %%        **                   #***#%%%%%
               +*+         %%        ##                      %%%%%%%%%
             +              %%%%     %%#%                  *** %%%%%%%%%
                             %%%      %%%                  *  #  #%%#%%%%%
                              %%%      %%%                ++* #    ###%%%%%%
                               %%%     %%%                  +##     #***##*#%
                        *%%     %%%% %% %%%% %%            **         +++*+*%%# # **
                           %%%% ##%%%%%% %%%%%%           *            ++*#%%***     ++
                          ###%%####*#%%%%% %%%%%         #              *########* **    #
              ++=++     #%%  *##%##%%%%%%%%%%%%%% #      %              **####**#+=+#*+
               ++         ##%%%%%%%#%%%%%##%%%%%%%###    %             =+**#####**####=+
                =     **%%%%%%%%%%%##%%%%%%%%%########*  #               +**#######*+=+*
               ***#%#*+***#%%%%%%%%%###%%%%%%%##******## +*    =        ++**###%%%#%#+*#
             *#**%%%%*+#%%%%%%%%%%%#####%%%%%###***#**#   ##             **++*#%%%%%##*#
             **##%%%%%%%#%%#%%%%%%%#%%#%%%%%%%%##**###%%%%%##          ++**=-*##%%##%*+*
               **%%%%%%%%%%%%%%%%%%%%%%%%%####%#****##%%%%%%%#         ++++-=+*#%%%%%#***
      +**++   +#*#*#%%%%%%%%%%%%%####*#%%#%%%####**    ##%%%#*       == +**++*###%%%%%****#
        +****++*** *%%%%%%%##%%#####*   #%%%  ##%#**#    ###       ==== ****#####%%%%%#*#**
          ####**   +*#%%%%%%##**###             #%%%%%##           ==+ +***####%####%%%####
       ######*++    ==#%%%%###***+ %       *  *   %%%%%%*           ++++***##%%%###*#%%#*#*
       ## %%%++    ===+#%%%%%###                 %%%%%%%      +     *****#####%%%%##%%%####
       ## #** *#*   ==+*###****==           %##%%%%%%%%   *    *  ++*#####%%##%%#%%%%%%###
          %%% +**   ==***##**+=+====                     ***#*==+***#####%#######%%#%%%###
             +**    =+++*****#+==+*****                 =+****###***########%%%%%%%%%%%##
+             ==     +++=-+*+++=+####*+*                 ==++**#####%%##%###########%%%#*
+               ++    =*#++*+=+*#%%%%###%               ++*+++++#%%##%%%%%%#%%%%##%%%##**
                      +*##**+######%%#           #      %%%*++%%%%%%%%%%%##*#**#%#%%%##*
                       #########%%%%%%%#+=    *%%*##%%%%%%%%%%%%%%%%%%%%%%%%#**#%%%%%#*
  #%                    #%%%%%%%%%%%%%%%#*#%%%%%%%#%%%%#*%%%%%%%%%%%%%%%%%%%%%##+*#%%##
++         *             *###%%%%%%%%%%%%#####%%%%%####**%%%%%%%%%%%%%%%%%%%%%%%##%%%%
*+* ++         *       == ####*##%%%%%%%##*+*#%%%%%*+##%%%%%%%#%%%%%%%%%%%%%%%%%%%%%#+==
   *++  #   *    ++     ==+++#*##%%%%%###**+++*###*+*+%#%%%%%%#%%%%%%%%%%%%%%%%%%%%#*===
      ==  * **%%% %%     ==   ###%%%%####***+++++++######%%%%##%%%%%%%%%%%%%%%%%%%%#
    *+ +****** %%##%%%#     #++ %%%%%#######**+++*#####%%%%%%%%##%%%%%%%%%%%%%%%%%##*
            =   %%%%%%%%#            %########***++#####%%%%%%%%%**#%%%%%%%%%%**#####*
               %%%%%%%%%%%#               *##*+++**####%%%%%%%%%#++**#%%%%%%%%##++=
                *%%%%%%%%%%  =                  %%%  %%%%%% %%%##=++*%%%%%%%%%#*+
                 %%%%%%%%%%                    %%%%%%%%%%%  %%   +-*%%%%%%%%%#**=
                   %%%%%%%%                      %%%%%%%%%        #%%%%%%%%%%**+
                   #%#%%%%%#              *      %%% %% %%       %%%%%%%%%%#*+=
                        %###*             +       #  %%   #   *%%%%%%%%%%#++==
                           #####                            %%%%%%%%%%%#%##+
                             ######*%#                *+   %%###%%%%%%%%%#====
                               #####%###%%     #%%%#* *##+*#%%%*++#***#%%
                                  =*#%%%%%%%%%%%%%%%%%%#####%%%#
[/]
[bold white]                                    K U R O R Y U U[/]
[dim]                                     Black Dragon[/]
"""

# Plain ASCII version (no Rich markup)
DRAGON_LOGO_ASCII = """
                                ==++++++++++=
                            ====    -==+++++++==========
                        #+=+                     ====++++++++
                     ### %%                           ++******%%%
                  +**     %%        **                   #***#%%%%%
               +*+         %%        ##                      %%%%%%%%%
             +              %%%%     %%#%                  *** %%%%%%%%%
                             %%%      %%%                  *  #  #%%#%%%%%
                              %%%      %%%                ++* #    ###%%%%%%
                               %%%     %%%                  +##     #***##*#%
                        *%%     %%%% %% %%%% %%            **         +++*+*%%#
                           %%%% ##%%%%%% %%%%%%           *            ++*#%%***
                          ###%%####*#%%%%% %%%%%         #              *########*
              ++=++     #%%  *##%##%%%%%%%%%%%%%% #      %              **####**#+=
               ++         ##%%%%%%%#%%%%%##%%%%%%%###    %             =+**#####**##
                =     **%%%%%%%%%%%##%%%%%%%%%########*  #               +**#######*+
               ***#%#*+***#%%%%%%%%%###%%%%%%%##******## +*    =        ++**###%%%#%#
             *#**%%%%*+#%%%%%%%%%%%#####%%%%%###***#**#   ##             **++*#%%%%%##
             **##%%%%%%%#%%#%%%%%%%#%%#%%%%%%%%##**###%%%%%##          ++**=-*##%%##%*
               **%%%%%%%%%%%%%%%%%%%%%%%%%####%#****##%%%%%%%#         ++++-=+*#%%%%%#
      +**++   +#*#*#%%%%%%%%%%%%%####*#%%#%%%####**    ##%%%#*       == +**++*###%%%%%*
        +****++*** *%%%%%%%##%%#####*   #%%%  ##%#**#    ###       ==== ****#####%%%%%#
          ####**   +*#%%%%%%##**###             #%%%%%##           ==+ +***####%####%%%
       ######*++    ==#%%%%###***+ %       *  *   %%%%%%*           ++++***##%%%###*#%%
       ## %%%++    ===+#%%%%%###                 %%%%%%%      +     *****#####%%%%##%%%
       ## #** *#*   ==+*###****==           %##%%%%%%%%   *    *  ++*#####%%##%%#%%%%%%
          %%% +**   ==***##**+=+====                     ***#*==+***#####%#######%%#%%%
             +**    =+++*****#+==+*****                 =+****###***########%%%%%%%%%%%
+             ==     +++=-+*+++=+####*+*                 ==++**#####%%##%###########%%%
+               ++    =*#++*+=+*#%%%%###%               ++*+++++#%%##%%%%%%#%%%%##%%%##
                      +*##**+######%%#           #      %%%*++%%%%%%%%%%%##*#**#%#%%%##
                       #########%%%%%%%#+=    *%%*##%%%%%%%%%%%%%%%%%%%%%%%%#**#%%%%%#
  #%                    #%%%%%%%%%%%%%%%#*#%%%%%%%#%%%%#*%%%%%%%%%%%%%%%%%%%%%##+*#%%#
++         *             *###%%%%%%%%%%%%#####%%%%%####**%%%%%%%%%%%%%%%%%%%%%%%##%%%%
*+* ++         *       == ####*##%%%%%%%##*+*#%%%%%*+##%%%%%%%#%%%%%%%%%%%%%%%%%%%%%#+
   *++  #   *    ++     ==+++#*##%%%%%###**+++*###*+*+%#%%%%%%#%%%%%%%%%%%%%%%%%%%%#*=
      ==  * **%%% %%     ==   ###%%%%####***+++++++######%%%%##%%%%%%%%%%%%%%%%%%%%#
    *+ +****** %%##%%%#     #++ %%%%%#######**+++*#####%%%%%%%%##%%%%%%%%%%%%%%%%%##*
            =   %%%%%%%%#            %########***++#####%%%%%%%%%**#%%%%%%%%%%**#####
               %%%%%%%%%%%#               *##*+++**####%%%%%%%%%#++**#%%%%%%%%##++=
                *%%%%%%%%%%  =                  %%%  %%%%%% %%%##=++*%%%%%%%%%#*+
                 %%%%%%%%%%                    %%%%%%%%%%%  %%   +-*%%%%%%%%%#**=
                   %%%%%%%%                      %%%%%%%%%        #%%%%%%%%%%**+
                   #%#%%%%%#              *      %%% %% %%       %%%%%%%%%%#*+=
                        %###*             +       #  %%   #   *%%%%%%%%%%#++==
                           #####                            %%%%%%%%%%%#%##+
                             ######*%#                *+   %%###%%%%%%%%%#====
                               #####%###%%     #%%%#* *##+*#%%%*++#***#%%
                                  =*#%%%%%%%%%%%%%%%%%%#####%%%#

                                    K U R O R Y U U
                                     Black Dragon
"""


class UIHelpers:
    """Helper class for terminal UI formatting with Claude Code style."""

    def __init__(self):
        if HAS_RICH and CLAUDE_THEME:
            self.console = Console(theme=CLAUDE_THEME, highlight=True)
            self._live: Optional[Live] = None
            self._streaming_text = ""
        elif HAS_RICH:
            self.console = Console(highlight=True)
            self._live: Optional[Live] = None
            self._streaming_text = ""
        else:
            self.console = None
            self._streaming_text = ""

    def print(self, *args, **kwargs):
        """Print to console."""
        if self.console:
            self.console.print(*args, **kwargs)
        else:
            print(*args)

    def print_logo(self):
        """Print the Kuroryuu dragon logo."""
        if self.console:
            # Use Rich markup version
            self.console.print(DRAGON_LOGO)
        else:
            # Use plain ASCII version
            print(DRAGON_LOGO_ASCII)

    def print_banner(self, role: str, model: str, session_id: str, project_root: str = ""):
        """Print startup banner with Claude-style formatting."""
        if self.console:
            # Role badge
            role_style = "bold yellow" if role == "leader" else "bold cyan"

            # Build content
            content = Text()
            content.append(f"{ICONS['box_top']} ", style="dim cyan")
            content.append("Kuroryuu", style="bold cyan")
            content.append(" CLI\n", style="dim")
            content.append(f"{ICONS['box_mid']}\n", style="dim cyan")
            content.append(f"{ICONS['box_mid']}  ", style="dim cyan")
            content.append(f"Role:    ", style="dim")
            content.append(f"{role.upper()}\n", style=role_style)
            content.append(f"{ICONS['box_mid']}  ", style="dim cyan")
            content.append(f"Model:   ", style="dim")
            content.append(f"{model}\n", style="green")
            content.append(f"{ICONS['box_mid']}  ", style="dim cyan")
            content.append(f"Root:    ", style="dim")
            content.append(f"{project_root}\n", style="white")
            content.append(f"{ICONS['box_mid']}  ", style="dim cyan")
            content.append(f"Session: ", style="dim")
            content.append(f"{session_id[:40]}...\n", style="blue")
            content.append(f"{ICONS['box_mid']}\n", style="dim cyan")
            content.append(f"{ICONS['box_bot']} ", style="dim cyan")
            content.append("Type ", style="dim")
            content.append("/help", style="cyan")
            content.append(" for commands, ", style="dim")
            content.append("/exit", style="cyan")
            content.append(" to quit", style="dim")

            self.console.print(content)
            self.console.print()
        else:
            print(f"\n=== Kuroryuu CLI [{role.upper()}] ===")
            print(f"Model: {model}")
            print(f"Root: {project_root}")
            print(f"Session: {session_id}")
            print("=" * 40)

    def print_help(self):
        """Print help with styled table."""
        if self.console:
            table = Table(
                title="[bold cyan]Commands[/]",
                box=ROUNDED,
                border_style="dim cyan",
                header_style="bold",
                show_edge=True,
                padding=(0, 1),
            )
            table.add_column("Command", style="cyan", no_wrap=True)
            table.add_column("Description", style="dim")
            table.add_column("Role", style="yellow", justify="center")

            commands = [
                # Core
                ("/help", "Show this help", "all"),
                ("/status", "Show agent status", "all"),
                ("/clear", "Clear conversation history", "all"),
                ("/exit, /quit", "Exit the CLI", "all"),
                ("", "", ""),
                # Context management
                ("/context", "Show context usage with visual bar", "all"),
                ("/compact", "Compact conversation to save context", "all"),
                ("/history", "Show conversation history", "all"),
                ("", "", ""),
                # Configuration
                ("/config", "View/modify configuration", "all"),
                ("/model", "Switch LLM model", "all"),
                ("/permissions", "View tool permissions", "all"),
                ("", "", ""),
                # System
                ("/doctor", "Check system health", "all"),
                ("/init", "Initialize Kuroryuu project files", "all"),
                ("/memory", "View/edit working memory", "all"),
                ("", "", ""),
                # Tools
                ("/tools", "List available MCP tools", "all"),
                ("/review [file]", "Request code review", "all"),
                ("", "", ""),
                # Orchestration (Leader)
                ("/plan <desc>", "Create task from description", "leader"),
                ("/ask <question>", "Ask user a question", "leader"),
                ("/approve <action>", "Request user approval", "leader"),
                ("", "", ""),
                # Orchestration (Worker)
                ("/execute", "Poll for work and execute", "worker"),
                ("/agents", "List registered agents", "all"),
            ]

            for cmd, desc, role in commands:
                if not cmd:
                    table.add_row("", "", "")
                else:
                    role_badge = "" if role == "all" else f"[yellow]{role}[/]"
                    table.add_row(cmd, desc, role_badge)

            self.console.print(table)
        else:
            print("\nCommands:")
            print("  Core:    /help /status /clear /exit")
            print("  Context: /context /compact /history")
            print("  Config:  /config /model /permissions")
            print("  System:  /doctor /init /memory")
            print("  Tools:   /tools /review")
            print("  Leader:  /plan /ask /approve")
            print("  Worker:  /execute /agents")

    def print_status(self, status: Dict[str, Any]):
        """Print agent status in a panel."""
        if self.console:
            content = Text()
            for key, value in status.items():
                content.append(f"  {key}: ", style="dim")

                # Color-code certain values
                if key == "role":
                    style = "yellow" if value == "leader" else "cyan"
                elif key == "connected":
                    style = "green" if value else "red"
                else:
                    style = "white"
                content.append(f"{value}\n", style=style)

            panel = Panel(
                content,
                title="[bold]Agent Status[/]",
                border_style="dim",
                box=ROUNDED,
            )
            self.console.print(panel)
        else:
            print("\nAgent Status:")
            for key, value in status.items():
                print(f"  {key}: {value}")

    def print_tools(self, tools: list):
        """Print available tools in a styled table."""
        if self.console:
            table = Table(
                title="[bold magenta]MCP Tools[/]",
                box=SIMPLE,
                border_style="dim",
                padding=(0, 1),
            )
            table.add_column("Tool", style="magenta", no_wrap=True)
            table.add_column("Description", style="dim", max_width=60)

            for tool in tools:
                name = tool.name if hasattr(tool, 'name') else str(tool)
                desc = tool.description if hasattr(tool, 'description') else ""
                if len(desc) > 60:
                    desc = desc[:57] + "..."
                table.add_row(name, desc)

            self.console.print(table)
            self.console.print(f"[dim]  {len(tools)} tools available[/]")
        else:
            print("\nAvailable Tools:")
            for tool in tools:
                name = tool.name if hasattr(tool, 'name') else str(tool)
                print(f"  {name}")

    def print_user_prompt(self) -> str:
        """Get styled user prompt."""
        if self.console:
            return f"[bold green]{ICONS['user']}[/] "
        return "> "

    def print_assistant_prefix(self):
        """Print assistant response prefix."""
        if self.console:
            self.console.print(f"\n[bold blue]{ICONS['assistant']}[/] ", end="")
        else:
            print("\nAssistant: ", end="")

    def print_text(self, text: str, end: str = "\n"):
        """Print plain text."""
        if self.console:
            self.console.print(text, end=end, highlight=False)
        else:
            print(text, end=end)

    def print_thinking(self, text: str, end: str = ""):
        """Print thinking content in dimmed italic style."""
        if self.console:
            from rich.text import Text
            styled = Text(text, style="dim italic")
            self.console.print(styled, end=end)
        else:
            print(text, end=end, flush=True)

    def print_streaming_text(self, text: str):
        """Print streaming text with markdown detection."""
        if self.console:
            # Accumulate text for markdown rendering
            self._streaming_text += text
            self.console.print(text, end="", highlight=False)
        else:
            print(text, end="", flush=True)

    def end_streaming(self):
        """End streaming and render final markdown if needed."""
        if self.console and self._streaming_text:
            # Check if we should re-render as markdown
            if self._has_markdown(self._streaming_text):
                self.console.print()  # newline
                self.console.print(Rule(style="dim"))
                self.print_markdown(self._streaming_text)
            self._streaming_text = ""

    def _has_markdown(self, text: str) -> bool:
        """Check if text contains markdown that should be rendered."""
        patterns = [
            r'```',           # code blocks
            r'^#{1,6}\s',     # headings
            r'\*\*.*\*\*',    # bold
            r'^\s*[-*]\s',    # lists
            r'^\s*\d+\.\s',   # numbered lists
        ]
        for pattern in patterns:
            if re.search(pattern, text, re.MULTILINE):
                return True
        return False

    def print_tool_start(self, name: str, args: Dict[str, Any]):
        """Print tool execution starting with styled box."""
        if self.console:
            # Format args nicely
            args_parts = []
            for k, v in args.items():
                v_str = repr(v)
                if len(v_str) > 30:
                    v_str = v_str[:27] + "..."
                args_parts.append(f"[dim]{k}=[/][white]{v_str}[/]")
            args_str = ", ".join(args_parts)

            self.console.print(f"\n  [dim]{ICONS['tool_start']}[/] [magenta]{ICONS['tool']} {name}[/]")
            if args_str:
                self.console.print(f"  [dim]{ICONS['tool_mid']}[/]  {args_str}")
            self.console.print(f"  [dim]{ICONS['tool_mid']}[/]  [dim italic]executing...[/]")
        else:
            print(f"\n  -> {name}({args})")

    def print_tool_end(self, name: str, ok: bool, result: str):
        """Print tool execution result."""
        if self.console:
            # Truncate and clean result
            result_clean = result.replace("\n", " ")[:100]
            if len(result) > 100:
                result_clean += "..."

            if ok:
                self.console.print(f"  [dim]{ICONS['tool_end']}[/] [green]{ICONS['success']}[/] [dim]{result_clean}[/]")
            else:
                self.console.print(f"  [dim]{ICONS['tool_end']}[/] [red]{ICONS['error']}[/] [red]{result_clean}[/]")
        else:
            symbol = "OK" if ok else "ERR"
            print(f"  <- [{symbol}] {result[:80]}")

    def print_tool_result_full(self, name: str, ok: bool, result: str):
        """Print full tool result with syntax highlighting if code."""
        if not self.console:
            print(result)
            return

        # Detect if result is code-like
        if self._looks_like_code(result):
            lang = self._detect_language(result)
            syntax = Syntax(result, lang, theme="monokai", line_numbers=True)
            panel = Panel(
                syntax,
                title=f"[magenta]{name}[/] result",
                border_style="dim magenta",
                box=ROUNDED,
            )
            self.console.print(panel)
        else:
            self.console.print(f"[dim]{result}[/]")

    def _looks_like_code(self, text: str) -> bool:
        """Detect if text looks like code."""
        code_indicators = [
            'def ', 'class ', 'import ', 'from ',  # Python
            'function ', 'const ', 'let ', 'var ',  # JS
            '{', '}', '=>', '->',
        ]
        return any(ind in text for ind in code_indicators)

    def _detect_language(self, text: str) -> str:
        """Detect programming language from code."""
        if 'def ' in text or 'import ' in text:
            return 'python'
        if 'function ' in text or 'const ' in text:
            return 'javascript'
        if 'fn ' in text or 'let mut' in text:
            return 'rust'
        return 'text'

    def print_error(self, message: str):
        """Print error with icon."""
        if self.console:
            self.console.print(f"[bold red]{ICONS['error']} Error:[/] {message}")
        else:
            print(f"Error: {message}")

    def print_warning(self, message: str):
        """Print warning with icon."""
        if self.console:
            self.console.print(f"[yellow]{ICONS['warning']} Warning:[/] {message}")
        else:
            print(f"Warning: {message}")

    def print_success(self, message: str):
        """Print success with icon."""
        if self.console:
            self.console.print(f"[bold green]{ICONS['success']}[/] {message}")
        else:
            print(f"OK: {message}")

    def print_info(self, message: str):
        """Print info message."""
        if self.console:
            self.console.print(f"[dim]{ICONS['info']} {message}[/]")
        else:
            print(f"[INFO] {message}")

    def print_markdown(self, text: str):
        """Print rendered markdown."""
        if self.console:
            # Extract and render code blocks with syntax highlighting
            md = Markdown(text, code_theme="monokai")
            self.console.print(md)
        else:
            print(text)

    def print_code(self, code: str, language: str = "python"):
        """Print syntax-highlighted code block."""
        if self.console:
            syntax = Syntax(
                code,
                language,
                theme="monokai",
                line_numbers=True,
                word_wrap=True,
            )
            panel = Panel(syntax, border_style="dim", box=ROUNDED)
            self.console.print(panel)
        else:
            print(code)

    def print_thinking(self, message: str = "Thinking..."):
        """Print thinking indicator."""
        if self.console:
            self.console.print(f"[dim italic]{ICONS['thinking']} {message}[/]")
        else:
            print(f"... {message}")

    def print_divider(self, title: str = ""):
        """Print a horizontal divider."""
        if self.console:
            if title:
                self.console.print(Rule(title, style="dim"))
            else:
                self.console.print(Rule(style="dim"))
        else:
            print("-" * 40)

    def create_spinner(self, message: str = "Processing..."):
        """Create a spinner context manager."""
        if self.console:
            return self.console.status(f"[dim]{message}[/]", spinner="dots")
        return DummySpinner()

    def print_conversation_entry(self, role: str, content: str, truncate: int = 200):
        """Print a conversation history entry."""
        if self.console:
            icon = ICONS['user'] if role == "user" else ICONS['assistant'] if role == "assistant" else ICONS['tool']
            style = "green" if role == "user" else "blue" if role == "assistant" else "magenta"

            display = content[:truncate]
            if len(content) > truncate:
                display += "..."

            self.console.print(f"[{style}]{icon}[/] [{style}]{role.upper()}[/]: [dim]{display}[/]")
        else:
            print(f"[{role.upper()}] {content[:truncate]}")

    def print_interrupt(self, interrupt: Any) -> None:
        """Display AG-UI interrupt as styled panel.

        Args:
            interrupt: InterruptRequest object with question, reason, etc.
        """
        # Color based on interrupt reason
        reason_colors = {
            "clarification": "cyan",
            "human_approval": "yellow",
            "plan_review": "magenta",
            "upload_required": "blue",
            "error_recovery": "red",
        }

        # Get reason value (handle enum or string)
        reason_value = interrupt.reason.value if hasattr(interrupt.reason, 'value') else str(interrupt.reason)
        color = reason_colors.get(reason_value, "white")

        # Icons for different reasons (with fallbacks)
        reason_icons = {
            "clarification": "?" if not SUPPORTS_UNICODE else "🤔",
            "human_approval": "!" if not SUPPORTS_UNICODE else "⚠️",
            "plan_review": "*" if not SUPPORTS_UNICODE else "📋",
            "upload_required": "^" if not SUPPORTS_UNICODE else "📁",
            "error_recovery": "X" if not SUPPORTS_UNICODE else "🔧",
        }
        icon = reason_icons.get(reason_value, "?")

        if self.console:
            title_text = f"{icon} {reason_value.replace('_', ' ').title()}"
            panel = Panel(
                interrupt.question,
                title=f"[bold {color}]{title_text}[/bold {color}]",
                border_style=color,
                padding=(1, 2),
            )
            self.console.print()
            self.console.print(panel)
        else:
            print()
            print(f"=== {reason_value.upper()} ===")
            print(interrupt.question)
            print("=" * 40)

    def print_option(self, index: int, label: str, description: str = "") -> None:
        """Display a numbered option for multiple choice.

        Args:
            index: Option number (1-based)
            label: Option label text
            description: Optional description
        """
        if self.console:
            if description:
                self.console.print(f"  [cyan]{index}.[/cyan] [bold]{label}[/bold]")
                self.console.print(f"      [dim]{description}[/dim]")
            else:
                self.console.print(f"  [cyan]{index}.[/cyan] {label}")
        else:
            if description:
                print(f"  {index}. {label}")
                print(f"      {description}")
            else:
                print(f"  {index}. {label}")

    def print_tool_approval(
        self, tool_name: str, args: Dict[str, Any], is_dangerous: bool = False
    ) -> None:
        """Display tool approval prompt panel.

        Args:
            tool_name: Name of the tool being called
            args: Tool arguments
            is_dangerous: Whether tool is dangerous (disables Always/All options)
        """
        if self.console:
            content = Text()
            content.append(f"{tool_name}\n", style="bold magenta")

            if args:
                content.append("\nArguments:\n", style="dim")
                for k, v in list(args.items())[:5]:  # Max 5 args shown
                    v_str = str(v)
                    if len(v_str) > 50:
                        v_str = v_str[:47] + "..."
                    content.append(f"  {k}: ", style="cyan")
                    content.append(f"{v_str}\n", style="white")

            if is_dangerous:
                title = "[bold red]⚠️ DANGEROUS TOOL[/bold red]"
                border = "red"
                content.append(
                    "\n⚠ Always/All disabled for dangerous tools", style="dim yellow"
                )
            else:
                title = f"[bold cyan]{ICONS['tool']} Tool Approval[/bold cyan]"
                border = "cyan"

            panel = Panel(content, title=title, border_style=border, padding=(0, 2))
            self.console.print()
            self.console.print(panel)
        else:
            # Fallback for non-rich environments
            danger_marker = "DANGEROUS " if is_dangerous else ""
            print(f"\n=== {danger_marker}TOOL: {tool_name} ===")
            for k, v in list(args.items())[:5]:
                v_str = str(v)
                if len(v_str) > 50:
                    v_str = v_str[:47] + "..."
                print(f"  {k}: {v_str}")
            if is_dangerous:
                print("  [!] Always/All disabled for dangerous tools")
            print("=" * 40)

    def print_tool_planned(self, tool_name: str, args: Dict[str, Any]) -> None:
        """Display planned tool action (PLAN mode).

        Shows what would be executed without actually executing.

        Args:
            tool_name: Name of the tool
            args: Tool arguments
        """
        if self.console:
            content = Text()
            content.append(f"{tool_name}\n", style="bold blue")

            if args:
                for k, v in list(args.items())[:4]:  # Max 4 args shown
                    v_str = str(v)
                    if len(v_str) > 50:
                        v_str = v_str[:47] + "..."
                    content.append(f"  {k}: ", style="dim")
                    content.append(f"{v_str}\n", style="white")

            content.append("\n[Would execute - not run in PLAN mode]", style="dim blue")

            panel = Panel(
                content,
                title="[bold blue]PLANNED[/bold blue]",
                border_style="blue",
                padding=(0, 2),
            )
            self.console.print()
            self.console.print(panel)
        else:
            print(f"\n[PLANNED] {tool_name}")
            for k, v in list(args.items())[:4]:
                v_str = str(v)[:50]
                print(f"  {k}: {v_str}")
            print("  (Would execute - not run in PLAN mode)")

    def print_tool_blocked(self, tool_name: str, reason: str) -> None:
        """Display blocked tool (READ mode).

        Args:
            tool_name: Name of the blocked tool
            reason: Reason for blocking
        """
        if self.console:
            content = Text()
            content.append(f"{tool_name}\n", style="bold green")
            content.append(f"\n{reason}", style="dim")

            panel = Panel(
                content,
                title="[bold green]BLOCKED[/bold green]",
                border_style="green",
                padding=(0, 2),
            )
            self.console.print()
            self.console.print(panel)
        else:
            print(f"\n[BLOCKED] {tool_name}")
            print(f"  Reason: {reason}")

    def print_subagent_start(
        self,
        subagent_type: str,
        task: str,
        tools: List[str],
        max_turns: int,
    ) -> None:
        """Display subagent starting panel.

        Args:
            subagent_type: Type of subagent (explorer, planner)
            task: Task description (truncated)
            tools: List of tool permissions
            max_turns: Maximum turns allowed
        """
        # Color based on subagent type
        type_colors = {
            "explorer": "cyan",
            "planner": "yellow",
        }
        color = type_colors.get(subagent_type, "magenta")

        # Icons (with fallbacks)
        type_icons = {
            "explorer": "o" if not SUPPORTS_UNICODE else "🔍",
            "planner": "*" if not SUPPORTS_UNICODE else "📝",
        }
        icon = type_icons.get(subagent_type, ">")

        if self.console:
            content = Text()
            content.append(f"Task: ", style="dim")
            content.append(f"{task}\n", style="white")
            content.append(f"Mode: ", style="dim")
            content.append(f"{subagent_type.upper()}\n", style=f"bold {color}")
            content.append(f"Turns: ", style="dim")
            content.append(f"0/{max_turns}\n", style="white")
            content.append(f"Tools: ", style="dim")
            content.append(", ".join(tools), style="dim cyan")

            panel = Panel(
                content,
                title=f"[bold {color}]{icon} SUBAGENT: {subagent_type}[/bold {color}]",
                border_style=color,
                padding=(0, 2),
            )
            self.console.print()
            self.console.print(panel)
        else:
            print(f"\n=== SUBAGENT: {subagent_type.upper()} ===")
            print(f"  Task: {task}")
            print(f"  Turns: 0/{max_turns}")
            print(f"  Tools: {', '.join(tools)}")

    def print_subagent_end(
        self,
        subagent_type: str,
        ok: bool,
        turns_used: int,
        tools_called: List[str],
        content_preview: str = "",
        error: str = "",
    ) -> None:
        """Display subagent completion panel.

        Args:
            subagent_type: Type of subagent
            ok: Whether subagent succeeded
            turns_used: Number of turns used
            tools_called: List of tools that were called
            content_preview: Preview of result content
            error: Error message if failed
        """
        # Color based on success/failure
        color = "green" if ok else "red"
        status_icon = ICONS['success'] if ok else ICONS['error']

        # Type icons
        type_icons = {
            "explorer": "o" if not SUPPORTS_UNICODE else "🔍",
            "planner": "*" if not SUPPORTS_UNICODE else "📝",
        }
        icon = type_icons.get(subagent_type, ">")

        if self.console:
            content = Text()
            content.append(f"Status: ", style="dim")
            content.append(f"{status_icon} ", style=color)
            content.append("Completed\n" if ok else "Failed\n", style=f"bold {color}")
            content.append(f"Turns: ", style="dim")
            content.append(f"{turns_used}\n", style="white")

            if tools_called:
                content.append(f"Tools used: ", style="dim")
                content.append(f"{len(tools_called)} ({', '.join(set(tools_called))})\n", style="dim cyan")

            if error:
                content.append(f"\nError: ", style="dim red")
                content.append(f"{error}\n", style="red")
            elif content_preview:
                content.append(f"\nResult preview:\n", style="dim")
                content.append(f"{content_preview[:200]}", style="white")
                if len(content_preview) > 200:
                    content.append("...", style="dim")

            panel = Panel(
                content,
                title=f"[bold {color}]{icon} SUBAGENT: {subagent_type} {status_icon}[/bold {color}]",
                border_style=color,
                padding=(0, 2),
            )
            self.console.print()
            self.console.print(panel)
        else:
            status = "OK" if ok else "FAILED"
            print(f"\n=== SUBAGENT: {subagent_type.upper()} [{status}] ===")
            print(f"  Turns: {turns_used}")
            if tools_called:
                print(f"  Tools used: {', '.join(set(tools_called))}")
            if error:
                print(f"  Error: {error}")
            elif content_preview:
                print(f"  Preview: {content_preview[:100]}...")


class DummySpinner:
    """Fallback spinner for non-rich environments."""
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass


# Global instance
ui = UIHelpers()


__all__ = ["UIHelpers", "ui", "HAS_RICH"]
