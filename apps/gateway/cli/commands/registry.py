"""
Command Registry System

Provider-agnostic command registration and dispatch.
Inspired by OpenCode's unified command namespace.
"""

from dataclasses import dataclass, field
from typing import Callable, Optional, Dict, List, Any, Awaitable, Union
import logging

logger = logging.getLogger(__name__)


@dataclass
class Command:
    """
    A registered CLI command.

    Attributes:
        name: Command name (without leading /)
        description: Short description for /help
        handler: Async function(args: str, context: Any) -> Optional[str]
        template: Optional prompt template with $1, $ARGUMENTS placeholders
        hints: List of placeholder hints (e.g., ["$1", "$ARGUMENTS"])
        aliases: Alternative names for the command
    """
    name: str
    description: str
    handler: Callable[[str, Any], Awaitable[Optional[str]]]
    template: Optional[str] = None
    hints: List[str] = field(default_factory=list)
    aliases: List[str] = field(default_factory=list)

    def __post_init__(self):
        # Extract hints from template if not provided
        if self.template and not self.hints:
            import re
            self.hints = re.findall(r'\$(\d+|ARGUMENTS)', self.template)


class CommandRegistry:
    """
    Registry for CLI commands with dispatch functionality.

    Usage:
        registry = CommandRegistry()
        registry.register(Command("status", "Show status", handle_status))
        await registry.dispatch("status", "", context)
    """

    def __init__(self):
        self._commands: Dict[str, Command] = {}
        self._aliases: Dict[str, str] = {}  # alias -> canonical name

    def register(self, cmd: Command) -> None:
        """Register a command."""
        self._commands[cmd.name] = cmd

        # Register aliases
        for alias in cmd.aliases:
            self._aliases[alias] = cmd.name

        logger.debug(f"Registered command: /{cmd.name}")

    def unregister(self, name: str) -> bool:
        """Unregister a command by name."""
        if name in self._commands:
            cmd = self._commands.pop(name)
            # Remove aliases
            for alias in cmd.aliases:
                self._aliases.pop(alias, None)
            return True
        return False

    def get(self, name: str) -> Optional[Command]:
        """Get a command by name or alias."""
        # Check canonical name first
        if name in self._commands:
            return self._commands[name]
        # Check aliases
        if name in self._aliases:
            return self._commands[self._aliases[name]]
        return None

    def list_all(self) -> List[Command]:
        """List all registered commands."""
        return list(self._commands.values())

    def list_names(self) -> List[str]:
        """List all command names (excluding aliases)."""
        return list(self._commands.keys())

    async def dispatch(
        self,
        name: str,
        args: str,
        context: Any
    ) -> Optional[str]:
        """
        Dispatch a command by name.

        Args:
            name: Command name (without leading /)
            args: Arguments string
            context: Context object passed to handler (usually AgentRunner)

        Returns:
            Command output or error message
        """
        cmd = self.get(name)

        if not cmd:
            # Suggest similar commands
            similar = self._find_similar(name)
            if similar:
                return f"Unknown command: /{name}. Did you mean: {', '.join(f'/{s}' for s in similar)}?"
            return f"Unknown command: /{name}. Type /help for available commands."

        try:
            return await cmd.handler(args, context)
        except Exception as e:
            logger.exception(f"Error executing /{name}")
            return f"Error executing /{name}: {e}"

    def _find_similar(self, name: str, threshold: float = 0.6) -> List[str]:
        """Find commands with similar names."""
        similar = []
        for cmd_name in self._commands.keys():
            # Simple similarity: shared prefix or substring
            if cmd_name.startswith(name[:2]) or name in cmd_name:
                similar.append(cmd_name)
        return similar[:3]  # Max 3 suggestions

    def format_help(self) -> str:
        """Generate help text for all commands."""
        lines = ["Available commands:", ""]

        # Sort by name
        for cmd in sorted(self._commands.values(), key=lambda c: c.name):
            alias_str = ""
            if cmd.aliases:
                alias_str = f" (aliases: {', '.join(cmd.aliases)})"
            lines.append(f"  /{cmd.name:12} - {cmd.description}{alias_str}")

            if cmd.hints:
                lines.append(f"                 Args: {', '.join(cmd.hints)}")

        return "\n".join(lines)


# Singleton registry for global access
_global_registry: Optional[CommandRegistry] = None


def get_registry() -> CommandRegistry:
    """Get the global command registry."""
    global _global_registry
    if _global_registry is None:
        _global_registry = CommandRegistry()
    return _global_registry


def register_command(
    name: str,
    description: str,
    aliases: Optional[List[str]] = None
) -> Callable:
    """
    Decorator to register a command handler.

    Usage:
        @register_command("status", "Show agent status")
        async def handle_status(args: str, context: Any) -> str:
            return "Status: OK"
    """
    def decorator(func: Callable) -> Callable:
        cmd = Command(
            name=name,
            description=description,
            handler=func,
            aliases=aliases or []
        )
        get_registry().register(cmd)
        return func
    return decorator
