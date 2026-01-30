"""CLI entry point for Kuroryuu CLI."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from .config import Config, ClaudeAuthMode
from .repl import KuroryuuREPL


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Kuroryuu CLI - Interactive REPL for local LLMs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Start interactive REPL
  kuroryuu-cli

  # Run with initial prompt
  kuroryuu-cli --prompt "write a haiku about coding"

  # Run prompt and exit (non-interactive)
  kuroryuu-cli -p --prompt "explain this error"

  # Start as leader
  kuroryuu-cli --role leader

  # Use Claude API
  kuroryuu-cli --llm-provider claude -p --prompt "hello"
        """,
    )

    # Initial prompt (named argument to avoid conflict with subcommands)
    parser.add_argument(
        "--prompt", "-P",
        type=str,
        default=None,
        help="Initial prompt to send (enters interactive mode after, or use with -p for print mode)",
    )

    # Print mode (non-interactive)
    parser.add_argument(
        "-p", "--print",
        dest="print_mode",
        action="store_true",
        help="Print response and exit (non-interactive)",
    )

    # Role selection
    parser.add_argument(
        "--role",
        choices=["leader", "worker", "auto"],
        default="auto",
        help="Agent role: leader (coordinate tasks), worker (execute tasks), auto (detect)",
    )

    # Agent name
    parser.add_argument(
        "--name",
        type=str,
        help="Custom agent name (default: auto-generated)",
    )

    # Model selection
    parser.add_argument(
        "--model",
        type=str,
        help="Model name (default from KURORYUU_LMSTUDIO_MODEL env)",
    )

    # LLM provider selection
    parser.add_argument(
        "--llm-provider",
        choices=["lmstudio", "claude"],
        default=None,
        help="LLM provider: lmstudio (local), claude (Anthropic API)",
    )

    parser.add_argument(
        "--claude-model",
        type=str,
        help="Claude model (default: claude-opus-4-5-20250514)",
    )

    parser.add_argument(
        "--claude-auth",
        choices=["api_key", "oauth"],
        default=None,
        help="Claude auth mode: api_key (traditional) or oauth (Pro/Max subscription)",
    )

    # Service URLs
    parser.add_argument(
        "--lmstudio-url",
        type=str,
        help="LLM server URL (default: http://127.0.0.1:1234)",
    )

    parser.add_argument(
        "--gateway-url",
        type=str,
        help="Gateway URL (default: http://127.0.0.1:8200)",
    )

    parser.add_argument(
        "--mcp-url",
        type=str,
        help="MCP server URL (default: http://127.0.0.1:8100)",
    )

    # Project root
    parser.add_argument(
        "--project-root",
        type=Path,
        help="Project root directory (default: current directory)",
    )

    # Stateless mode (default on)
    stateless_group = parser.add_mutually_exclusive_group()
    stateless_group.add_argument(
        "--stateless",
        dest="stateless",
        action="store_true",
        default=None,
        help="Run stateless - no conversation history (default)",
    )
    stateless_group.add_argument(
        "--stateful",
        dest="stateless",
        action="store_false",
        help="Run with conversation history accumulated across turns",
    )

    # Version
    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 0.1.0",
    )

    # Subcommands for OAuth management
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Login command
    login_parser = subparsers.add_parser(
        "login",
        help="Authenticate with Anthropic OAuth (Claude Pro/Max)",
    )
    login_parser.add_argument(
        "--mode",
        choices=["max", "console"],
        default="max",
        help="OAuth mode: 'max' for Claude Pro/Max, 'console' for API key creation",
    )
    
    # Logout command
    subparsers.add_parser(
        "logout",
        help="Clear stored OAuth tokens",
    )
    
    # Auth status command
    subparsers.add_parser(
        "auth-status",
        help="Check authentication status",
    )

    return parser.parse_args()


from typing import Literal

async def handle_login(mode: Literal["max", "console"] = "max") -> int:
    """Handle OAuth login command."""
    from .anthropic_oauth import interactive_login, OAuthError
    
    try:
        await interactive_login(mode=mode)
        return 0
    except OAuthError as e:
        print(f"\nLogin failed: {e}")
        return 1
    except KeyboardInterrupt:
        print("\nLogin cancelled")
        return 1


def handle_logout() -> int:
    """Handle logout command."""
    from .anthropic_oauth import clear_tokens
    
    clear_tokens()
    print("Logged out successfully")
    return 0


def handle_auth_status() -> int:
    """Handle auth-status command."""
    import time
    from .anthropic_oauth import load_tokens
    
    tokens = load_tokens()
    
    print("\n  Anthropic OAuth Status")
    print("  ----------------------")
    
    if tokens is None:
        print("  Status:  Not authenticated")
        print("\n  To login: kuroryuu-cli login")
    elif tokens.is_expired():
        print("  Status:  Token expired (will refresh on next use)")
        print(f"  Expired: {time.ctime(tokens.expires_at)}")
    else:
        print("  Status:  Authenticated")
        print(f"  Expires: {time.ctime(tokens.expires_at)}")
        if tokens.email:
            print(f"  Email:   {tokens.email}")
    
    print()
    return 0


def main() -> int:
    """Main entry point."""
    args = parse_args()

    # Handle subcommands
    if args.command == "login":
        return asyncio.run(handle_login(mode=args.mode))
    elif args.command == "logout":
        return handle_logout()
    elif args.command == "auth-status":
        return handle_auth_status()

    # Create config from args
    config = Config.from_args(args)

    # Print startup info
    print(f"\n  Kuroryuu CLI")
    print(f"  ------------")
    print(f"  Provider: {config.llm_provider}")
    if config.llm_provider == "claude":
        print(f"  Model:    {config.claude_model}")
        print(f"  Auth:     {config.claude_auth_mode.value}")
        if config.claude_auth_mode == ClaudeAuthMode.OAUTH:
            oauth_status = "authenticated" if config.claude_oauth_token else "NOT AUTHENTICATED"
            print(f"  OAuth:    {oauth_status}")
        else:
            api_status = "loaded" if config.claude_api_key else "NOT FOUND"
            print(f"  API Key:  {api_status}")
    else:
        print(f"  LLM:      {config.lmstudio_url}")
        print(f"  Model:    {config.model}")
    print(f"  Gateway:  {config.gateway_url}")
    print(f"  MCP:      {config.mcp_url}")
    print(f"  Role:     {config.role}")
    print()

    # Create and run REPL with auto-start of services
    repl = KuroryuuREPL(config)

    try:
        return asyncio.run(repl.run(
            initial_prompt=args.prompt,
            print_mode=args.print_mode,
        ))
    except KeyboardInterrupt:
        print("\nInterrupted")
        return 0
    except ConnectionError as e:
        # Backend not available - auto-start services
        import subprocess
        import time
        import httpx

        print(f"\n  \033[93mServices not running - starting automatically...\033[0m")

        # Find run_all.ps1 relative to project root
        run_all_script = config.project_root / "run_all.ps1"
        if not run_all_script.exists():
            # Try relative to CLI location
            run_all_script = Path(__file__).parent.parent.parent / "run_all.ps1"

        if not run_all_script.exists():
            print(f"  \033[91mCannot find run_all.ps1\033[0m")
            print(f"  Start services manually: .\\run_all.ps1")
            input("\n  Press Enter to exit...")
            return 1

        # Start services in background
        try:
            subprocess.Popen(
                ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", str(run_all_script)],
                cwd=str(run_all_script.parent),
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
            print(f"  Started: {run_all_script.name}")
        except Exception as start_err:
            print(f"  \033[91mFailed to start services: {start_err}\033[0m")
            input("\n  Press Enter to exit...")
            return 1

        # Wait for services to come up (max 30 seconds)
        print(f"  Waiting for services to start...")
        gateway_url = config.gateway_url
        mcp_url = config.mcp_url

        for i in range(30):
            time.sleep(1)
            sys.stdout.write(f"\r  [{i+1}/30s] Checking...")
            sys.stdout.flush()

            try:
                # Check both services
                with httpx.Client(timeout=2.0) as client:
                    gw_ok = client.get(f"{gateway_url}/v1/health").status_code == 200
                    mcp_ok = client.get(f"{mcp_url}/health").status_code == 200

                    if gw_ok and mcp_ok:
                        print(f"\r  \033[92mServices ready!\033[0m                    ")
                        # Retry the REPL
                        repl = KuroryuuREPL(config)
                        return asyncio.run(repl.run(
                            initial_prompt=args.prompt,
                            print_mode=args.print_mode,
                        ))
            except Exception:
                pass  # Keep waiting

        print(f"\r  \033[91mServices did not start within 30 seconds\033[0m")
        print(f"  Check the service windows for errors.")
        input("\n  Press Enter to exit...")
        return 1


if __name__ == "__main__":
    sys.exit(main())
