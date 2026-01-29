"""
Kuroryuu CLI Agent Runner - Multi-Backend Support

Standalone agent that:
- Supports 61 models across 6+ providers via CLIProxyAPI
- Registers with gateway
- Heartbeats every 5s
- Polls orchestration for work
- Handles slash commands and interactive mode
- Provider-agnostic command system (@file, !shell, /compact, /resume)

Usage:
    # Basic usage (auto-fallback)
    python agent_runner.py

    # Select backend
    python agent_runner.py --backend cliproxyapi
    python agent_runner.py --backend lmstudio

    # Select model (shorthand or full ID)
    python agent_runner.py --model opus
    python agent_runner.py --model gpt5
    python agent_runner.py --model claude-opus-4-5-20251101

    # List available models
    python agent_runner.py --list-models

    # OAuth management
    python agent_runner.py --auth-status
    python agent_runner.py --login claude

Interactive Commands:
    /status    - Show agent status
    /model     - Switch model (interactive menu)
    /providers - Show provider health dashboard
    /compact   - Summarize history to save tokens
    /save      - Save current session
    /resume    - Load previous session
    /sessions  - List saved sessions
    /usage     - Show token usage stats
    /context   - Show current context
    /clear     - Clear conversation history
    /help      - Show available commands

File/Context:
    @file.ts   - Include file in context
    @./path/   - Include directory listing
    !`command` - Execute shell, include output
"""
import argparse
import asyncio
import httpx
import json
import os
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List, TYPE_CHECKING

# Import command system
from .commands import (
    Command,
    CommandRegistry,
    preprocess_input,
    format_file_context,
    SessionManager,
    compact_history,
    estimate_token_count,
    format_usage_stats,
    should_compact,
)

if TYPE_CHECKING:
    from apps.gateway.llm.backends.base import LLMBackend

# Default configuration
DEFAULT_GATEWAY_URL = "http://127.0.0.1:8200"
DEFAULT_LMSTUDIO_URL = "http://127.0.0.1:1234"
DEFAULT_CLIPROXYAPI_URL = "http://127.0.0.1:8317"
HEARTBEAT_INTERVAL = 5  # seconds
POLL_INTERVAL = 2  # seconds
MAX_RETRIES = 3
RETRY_BACKOFF = [1, 2, 4]  # exponential backoff

# Provider tool support matrix
# Note: These match the "owned_by" field from CLIProxyAPI /v1/models
TOOL_PROVIDERS = {
    "claude", "anthropic",        # Claude models (both naming conventions)
    "openai",                      # OpenAI GPT models
    "gemini", "google",            # Gemini models
    "github-copilot",              # GitHub Copilot models
}

# OAuth login flags for CLIProxyAPIPlus
OAUTH_FLAGS = {
    "claude": "-claude-login",
    "openai": "-codex-login",
    "gemini": "-login",
    "copilot": "-github-copilot-login",
    "kiro": "-kiro-aws-authcode",
    "antigravity": "-antigravity-login",
}


def get_cliproxy_root() -> str:
    """
    Get CLIProxyAPI root directory, preferring project-local .cliproxyapi/.

    Search order:
    1. KURORYUU_PROJECT_ROOT/.cliproxyapi/ (if env var set and dir exists)
    2. Relative to __file__ location (development mode)
    3. Global %APPDATA%/Kuroryuu/cliproxyapi (fallback)
    """
    from pathlib import Path

    # Check KURORYUU_PROJECT_ROOT first (canonical env var)
    project_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if project_root:
        project_local = Path(project_root) / ".cliproxyapi"
        if project_local.exists():
            return str(project_local)

    # Fallback: detect from __file__ location (agent_runner.py is in apps/gateway/cli/)
    # Go up to project root: cli -> gateway -> apps -> project_root
    project_local = Path(__file__).parent.parent.parent.parent / ".cliproxyapi"
    if project_local.exists():
        return str(project_local)

    # Last resort: global path
    return os.path.expandvars(r"%APPDATA%\Kuroryuu\cliproxyapi")


class AgentRunner:
    """Multi-backend agent runner with gateway integration."""

    def __init__(
        self,
        name: Optional[str] = None,
        gateway_url: str = DEFAULT_GATEWAY_URL,
        lmstudio_url: str = DEFAULT_LMSTUDIO_URL,
        cliproxyapi_url: str = DEFAULT_CLIPROXYAPI_URL,
        backend: str = "auto",
        model: Optional[str] = None,
        project_root: Optional[str] = None,
    ):
        self.gateway_url = gateway_url.rstrip("/")
        self.lmstudio_url = lmstudio_url.rstrip("/")
        self.cliproxyapi_url = cliproxyapi_url.rstrip("/")
        self.backend_type = backend
        self.model = model
        self.agent_id = f"devstral_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
        self.name = name or self.agent_id
        self.running = False
        self.session_id: Optional[str] = None
        self._client: Optional[httpx.AsyncClient] = None
        self._backend: Optional["LLMBackend"] = None
        self._conversation_history: List[Dict[str, str]] = []

        # Project root for file resolution
        self.project_root = Path(project_root) if project_root else self._detect_project_root()
        self.cwd = self.project_root  # Current working directory

        # Initialize command system
        self._registry = CommandRegistry()
        self._session_mgr = SessionManager(self.project_root)
        self._register_commands()

    def _detect_project_root(self) -> Path:
        """Detect project root from environment or file location."""
        # Check env var first
        if os.environ.get("KURORYUU_PROJECT_ROOT"):
            return Path(os.environ["KURORYUU_PROJECT_ROOT"])
        # Fall back to parent of apps/gateway/cli
        return Path(__file__).parent.parent.parent.parent

    def _register_commands(self) -> None:
        """Register all built-in commands."""
        # Core commands
        self._registry.register(Command(
            "status", "Show agent status",
            self._cmd_status
        ))
        self._registry.register(Command(
            "model", "Switch model (interactive or direct)",
            self._cmd_model,
            hints=["[shorthand]"]
        ))
        self._registry.register(Command(
            "providers", "Show provider health dashboard",
            self._cmd_providers
        ))
        self._registry.register(Command(
            "clear", "Clear conversation history",
            self._cmd_clear
        ))
        self._registry.register(Command(
            "help", "Show available commands",
            self._cmd_help
        ))
        self._registry.register(Command(
            "quit", "Exit the agent",
            self._cmd_quit,
            aliases=["exit", "q"]
        ))
        self._registry.register(Command(
            "restart", "Restart the agent",
            self._cmd_restart
        ))

        # New unified commands
        self._registry.register(Command(
            "compact", "Summarize history to save tokens",
            self._cmd_compact
        ))
        self._registry.register(Command(
            "save", "Save current session",
            self._cmd_save,
            hints=["[name]"]
        ))
        self._registry.register(Command(
            "resume", "Load a previous session",
            self._cmd_resume,
            hints=["<session_id or name>"]
        ))
        self._registry.register(Command(
            "sessions", "List saved sessions",
            self._cmd_sessions,
            aliases=["ls"]
        ))
        self._registry.register(Command(
            "usage", "Show token usage statistics",
            self._cmd_usage,
            aliases=["stats"]
        ))
        self._registry.register(Command(
            "context", "Show what's in current context",
            self._cmd_context
        ))

    async def __aenter__(self):
        self._client = httpx.AsyncClient(timeout=30)
        return self

    async def __aexit__(self, *args):
        if self._client:
            await self._client.aclose()

    # =========================================================================
    # Backend Resolution
    # =========================================================================

    async def _resolve_backend(self) -> "LLMBackend":
        """Resolve backend based on config."""
        # Import here to avoid circular imports
        from apps.gateway.llm.backends import (
            get_backend,
            create_backend,
            get_healthy_backend,
        )

        if self._backend:
            return self._backend

        try:
            if self.backend_type == "auto":
                # Try lmstudio first, then cliproxyapi
                self._backend = await get_healthy_backend()
            elif self.backend_type == "cliproxyapi":
                self._backend = create_backend(
                    "cliproxyapi",
                    base_url=f"{self.cliproxyapi_url}/v1",
                    model=self.model,
                )
            elif self.backend_type == "claude":
                self._backend = create_backend("claude", model=self.model)
            else:  # lmstudio
                self._backend = create_backend(
                    "lmstudio",
                    base_url=f"{self.lmstudio_url}/v1",
                    model=self.model,
                )
        except Exception as e:
            raise RuntimeError(f"Failed to resolve backend: {e}")

        return self._backend

    async def check_backend(self) -> bool:
        """Check if configured backend is reachable."""
        for attempt, delay in enumerate(RETRY_BACKOFF):
            try:
                backend = await self._resolve_backend()
                health = await backend.health_check()
                if health.get("ok"):
                    print(f"[ok] Backend {backend.name} ready")
                    if health.get("model_count"):
                        print(f"     Models: {health['model_count']}")
                    if health.get("model_family"):
                        print(f"     Family: {health['model_family']}")
                    return True
                print(f"[err] {backend.name}: {health.get('error', 'unknown error')}")
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    print(f"[retry] Backend check failed, retry in {delay}s...")
                    await asyncio.sleep(delay)
                    continue
                print(f"[err] Backend unreachable: {e}")
                return False
        return False

    async def send_to_backend(
        self,
        messages: List[Dict[str, str]],
        stream: bool = True,
    ) -> str:
        """Send to configured backend using LLMBackend abstraction."""
        from apps.gateway.llm.backends.base import LLMConfig, LLMMessage

        backend = await self._resolve_backend()

        # Convert dict messages to LLMMessage objects
        llm_messages = [
            LLMMessage(role=m["role"], content=m["content"]) for m in messages
        ]

        config = LLMConfig(
            model=self.model or backend.default_model,
            temperature=0.7,
        )

        full_response = ""
        try:
            async for event in backend.stream_chat(llm_messages, config):
                if event.type == "delta" and event.text:
                    if stream:
                        print(event.text, end="", flush=True)
                    full_response += event.text
                elif event.type == "error":
                    print(f"\n[err] {event.error_message}")
                    break
                elif event.type == "done":
                    if stream:
                        print()  # Newline after streaming
                    break
        except Exception as e:
            raise RuntimeError(f"Backend stream error: {e}")

        return full_response

    # =========================================================================
    # Model Listing
    # =========================================================================

    async def list_models(self) -> None:
        """List available models grouped by provider."""
        print("\nAvailable Models (via CLIProxyAPI)")
        print("=" * 60)

        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(
                    f"{self.cliproxyapi_url}/v1/models",
                    headers={"Authorization": "Bearer kuroryuu-local"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    models = data.get("data", [])

                    # Group by owned_by (provider)
                    by_provider: Dict[str, List[str]] = {}
                    for m in models:
                        provider = m.get("owned_by", "other")
                        by_provider.setdefault(provider, []).append(m["id"])

                    total = 0
                    for provider in sorted(by_provider.keys()):
                        ids = by_provider[provider]
                        total += len(ids)
                        tools = "[tools]" if provider in TOOL_PROVIDERS else "[no-tools]"
                        print(f"\n{provider.upper()} ({len(ids)} models) {tools}")
                        for model_id in sorted(ids)[:7]:  # Show first 7
                            print(f"  - {model_id}")
                        if len(ids) > 7:
                            print(f"  ... and {len(ids) - 7} more")

                    print("-" * 60)
                    print(f"Total: {total} models available")
                else:
                    print(f"[err] CLIProxyAPI returned {resp.status_code}")
                    await self._show_fallback_models()
        except Exception as e:
            print(f"[err] CLIProxyAPI unavailable: {e}")
            await self._show_fallback_models()

    async def _show_fallback_models(self) -> None:
        """Show shorthands when CLIProxyAPI is unavailable."""
        from .model_shorthands import MODEL_SHORTHANDS

        print("\nModel Shorthands (use with --model):")
        print("-" * 40)

        # Group shorthands by family
        families = {"claude": [], "openai": [], "gemini": [], "copilot": [], "kiro": [], "other": []}
        for short, full in MODEL_SHORTHANDS.items():
            if "claude" in full.lower():
                families["claude"].append((short, full))
            elif "gpt" in full.lower() or full.startswith("o"):
                families["openai"].append((short, full))
            elif "gemini" in full.lower():
                families["gemini"].append((short, full))
            elif "kiro" in full.lower():
                families["kiro"].append((short, full))
            else:
                families["other"].append((short, full))

        for family, items in families.items():
            if items:
                print(f"\n{family.upper()}:")
                for short, full in items[:5]:
                    print(f"  {short:15} -> {full}")
                if len(items) > 5:
                    print(f"  ... and {len(items) - 5} more")

    # =========================================================================
    # OAuth Management
    # =========================================================================

    async def check_auth_status(self) -> None:
        """Show OAuth status for all CLIProxyAPI providers."""
        print("\nOAuth Provider Status")
        print("=" * 50)

        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(
                    f"{self.cliproxyapi_url}/v1/models",
                    headers={"Authorization": "Bearer kuroryuu-local"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    models = data.get("data", [])

                    # Count models per provider to infer auth status
                    providers: Dict[str, int] = {}
                    for m in models:
                        p = m.get("owned_by", "other")
                        providers[p] = providers.get(p, 0) + 1

                    # Check expected providers (with aliases for different owned_by values)
                    provider_aliases = {
                        "claude": ["claude", "anthropic"],
                        "openai": ["openai"],
                        "gemini": ["gemini", "google"],
                        "github-copilot": ["github-copilot"],
                        "kiro": ["kiro", "aws"],
                        "antigravity": ["antigravity"],
                    }
                    for display_name, aliases in provider_aliases.items():
                        count = sum(providers.get(alias, 0) for alias in aliases)
                        status = "[OK]" if count > 0 else "[--]"
                        tools = "[tools]" if display_name in {"claude", "openai", "gemini", "github-copilot"} else "[no-tools]"
                        print(f"{status} {display_name:18} {count:>2} models  {tools}")

                    print("-" * 50)
                    print(f"Total authenticated: {len(models)} models")
                    print("\nTo login: python agent_runner.py --login <provider>")
                else:
                    print(f"[err] CLIProxyAPI returned {resp.status_code}")
        except Exception as e:
            print(f"[err] Cannot reach CLIProxyAPI: {e}")
            print("Make sure CLIProxyAPI is running on port 8317")

    async def start_oauth_login(self, provider: str) -> None:
        """Trigger OAuth login for a provider via CLIProxyAPIPlus."""
        flag = OAUTH_FLAGS.get(provider)
        if not flag:
            print(f"[err] Unknown provider: {provider}")
            print(f"Available: {', '.join(OAUTH_FLAGS.keys())}")
            return

        # Try project-local binary first, then global, then docker
        cliproxy_root = get_cliproxy_root()
        binary_path = os.path.join(cliproxy_root, "CLIProxyAPIPlus.exe")

        if os.path.exists(binary_path):
            print(f"Starting {provider} OAuth via native binary...")
            print(f"[info] A browser window will open for authentication")
            try:
                subprocess.run([binary_path, flag, "-no-browser"], check=False)
                print(f"[ok] OAuth flow completed for {provider}")
            except Exception as e:
                print(f"[err] OAuth failed: {e}")
        else:
            # Try Docker
            print(f"Starting {provider} OAuth via Docker...")
            try:
                subprocess.run(
                    [
                        "docker", "exec", "cli-proxy-api",
                        "/CLIProxyAPIPlus/CLIProxyAPIPlus", flag, "-no-browser"
                    ],
                    check=False,
                )
                print(f"[ok] OAuth flow completed for {provider}")
            except Exception as e:
                print(f"[err] Docker OAuth failed: {e}")
                print("[info] Make sure Docker is running with cli-proxy-api container")

    # =========================================================================
    # Gateway Registration
    # =========================================================================

    async def register(self) -> bool:
        """Register with the gateway."""
        try:
            backend = await self._resolve_backend()
            resp = await self._client.post(
                f"{self.gateway_url}/v1/agents/register",
                json={
                    "agent_id": self.agent_id,
                    "model_name": self.name,
                    "role": "leader",
                    "capabilities": [backend.name, "chat", "tools"],
                    "backend": backend.name,
                    "model": self.model,
                },
            )
            if resp.status_code == 200:
                print(f"[ok] Registered as {self.agent_id}")
                return True
            else:
                print(f"[err] Registration failed: {resp.status_code} {resp.text}")
                return False
        except Exception as e:
            print(f"[err] Registration error: {e}")
            return False

    async def deregister(self) -> bool:
        """Deregister from the gateway."""
        try:
            resp = await self._client.post(
                f"{self.gateway_url}/v1/agents/{self.agent_id}/deregister"
            )
            if resp.status_code == 200:
                print(f"[ok] Deregistered {self.agent_id}")
                return True
            return False
        except Exception as e:
            print(f"[err] Deregister error: {e}")
            return False

    async def heartbeat(self):
        """Send heartbeat to gateway."""
        try:
            resp = await self._client.post(
                f"{self.gateway_url}/v1/agents/{self.agent_id}/heartbeat",
                json={"status": "idle"},
            )
            if resp.status_code != 200:
                print(f"[warn] Heartbeat failed: {resp.status_code}")
        except Exception as e:
            # Silently ignore heartbeat errors to avoid spam
            pass

    # =========================================================================
    # Work Polling
    # =========================================================================

    async def poll_inbox(self) -> Optional[Dict[str, Any]]:
        """Poll the inbox for work."""
        try:
            resp = await self._client.get(
                f"{self.gateway_url}/v1/inbox/{self.agent_id}"
            )
            if resp.status_code == 200:
                data = resp.json()
                messages = data.get("messages", [])
                if messages:
                    return messages[0]  # Return first pending message
        except Exception:
            pass
        return None

    async def run_heartbeat_loop(self):
        """Background heartbeat loop."""
        while self.running:
            await self.heartbeat()
            await asyncio.sleep(HEARTBEAT_INTERVAL)

    async def run_poll_loop(self):
        """Main polling loop for work."""
        while self.running:
            work = await self.poll_inbox()
            if work:
                await self.process_work_item(work)
            await asyncio.sleep(POLL_INTERVAL)

    async def process_work_item(self, work: Dict[str, Any]):
        """Process a work item from the inbox."""
        try:
            msg_id = work.get("id", "unknown")
            subject = work.get("subject", "no subject")
            body = work.get("body", "")
            from_agent = work.get("from_agent", "unknown")

            print(f"[inbox] Processing: {subject} (from {from_agent})")

            # Build conversation context
            messages = [
                {"role": "system", "content": "You are a helpful AI assistant. Process the following task."},
                {"role": "user", "content": f"Task: {subject}\n\n{body}"},
            ]

            # Send to backend
            response = await self.send_to_backend(messages, stream=False)

            # Send response back via gateway
            await self._client.post(
                f"{self.gateway_url}/v1/inbox/send",
                json={
                    "from_agent": self.agent_id,
                    "to_agent": from_agent,
                    "subject": f"Re: {subject}",
                    "body": response,
                    "message_type": "reply",
                    "reply_to": msg_id,
                },
            )

            # Mark message as complete
            await self._client.post(
                f"{self.gateway_url}/v1/inbox/{msg_id}/complete",
                json={"status": "done", "note": "Processed by agent runner"},
            )

            print(f"[ok] Completed: {subject}")

        except Exception as e:
            print(f"[err] Failed to process work: {e}")

    # =========================================================================
    # Interactive Mode
    # =========================================================================

    async def run_interactive(self):
        """Run in interactive mode for testing."""
        backend = await self._resolve_backend()
        model_display = self.model or backend.default_model or "default"

        print(f"\n[agent] {self.name} ready")
        print(f"[backend] {backend.name} | model: {model_display}")
        print("[commands] /status, /model, /providers, /clear, /restart, /quit")
        print("-" * 60)

        while self.running:
            try:
                user_input = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: input("\nYou: ")
                )

                if not user_input.strip():
                    continue

                # Handle slash commands
                if user_input.startswith("/"):
                    result = await self._handle_command(user_input)
                    if result == "quit":
                        break
                    elif result == "restart":
                        return "restart"
                    continue

                # Preprocess @file and !shell references
                processed_input, file_parts = await preprocess_input(
                    user_input,
                    self.cwd,
                    resolve_files=True,
                    execute_shell=True
                )

                # Build user message with file context
                user_content = processed_input
                if file_parts:
                    file_context = format_file_context(file_parts)
                    user_content = f"{file_context}\n\n{processed_input}"

                # Add to conversation history
                self._conversation_history.append({"role": "user", "content": user_content})

                # Build messages with history
                messages = [
                    {"role": "system", "content": "You are a helpful AI assistant."},
                    *self._conversation_history[-10:],  # Keep last 10 turns
                ]

                # Send to backend
                print("Assistant: ", end="", flush=True)
                try:
                    response = await self.send_to_backend(messages, stream=True)
                    self._conversation_history.append({"role": "assistant", "content": response})
                except Exception as e:
                    print(f"\n[err] {e}")
                    self.running = False
                    return "error"

            except KeyboardInterrupt:
                print("\n\n[interrupt] Shutting down...")
                self.running = False
                break

        return "quit"

    async def _handle_command(self, cmd_input: str) -> Optional[str]:
        """Handle slash commands via registry."""
        parts = cmd_input.split(maxsplit=1)
        cmd = parts[0][1:].lower()  # Remove leading /
        args = parts[1] if len(parts) > 1 else ""

        # Dispatch through registry
        result = await self._registry.dispatch(cmd, args, self)

        # Print result if it's a message (not a control signal)
        if result and result not in ("quit", "restart"):
            print(result)

        return result

    # =========================================================================
    # Command Handlers
    # =========================================================================

    async def _cmd_status(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """Show agent status."""
        backend = await self._resolve_backend()
        model_display = self.model or backend.default_model or "default"
        lines = [
            "",
            f"[agent] {self.name} ({self.agent_id})",
            f"[gateway] {self.gateway_url}",
            f"[backend] {backend.name}",
            f"[model] {model_display}",
            f"[tools] {'supported' if backend.supports_native_tools else 'not supported'}",
            f"[history] {len(self._conversation_history)} messages",
            f"[cwd] {self.cwd}",
        ]
        return "\n".join(lines)

    async def _cmd_model(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """Switch model."""
        await self._handle_model_switch(args)
        return None

    async def _cmd_providers(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """Show provider health."""
        await self._show_providers_dashboard()
        return None

    async def _cmd_clear(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """Clear conversation history."""
        self._conversation_history.clear()
        return "[ok] Conversation cleared"

    async def _cmd_help(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """Show help."""
        return self._registry.format_help()

    async def _cmd_quit(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """Exit agent."""
        print("Goodbye!")
        self.running = False
        return "quit"

    async def _cmd_restart(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """Restart agent."""
        print("Restarting...")
        self.running = False
        return "restart"

    async def _cmd_compact(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """Summarize history to save tokens."""
        if not self._conversation_history:
            return "[info] No conversation history to compact."

        print("[compact] Summarizing history...")

        # Create a simple LLM client wrapper
        class LLMClientWrapper:
            def __init__(wrapper_self, runner: "AgentRunner"):
                wrapper_self.runner = runner

            async def complete(wrapper_self, messages, model=None):
                # Use send_to_backend which returns the response text
                return await wrapper_self.runner.send_to_backend(messages, stream=False)

        client = LLMClientWrapper(self)

        try:
            summary = await compact_history(
                self._conversation_history,
                client,
                model=self.model
            )

            # Replace history with summary
            old_count = len(self._conversation_history)
            self._conversation_history = [
                {"role": "system", "content": f"[Compacted context from {old_count} messages]\n{summary}"}
            ]

            return f"[ok] Compacted {old_count} messages into summary ({len(summary)} chars)"

        except Exception as e:
            return f"[err] Compaction failed: {e}"

    async def _cmd_save(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """Save current session."""
        name = args.strip() if args.strip() else None

        try:
            result = await self._session_mgr.save(
                session_id=self.session_id,
                messages=self._conversation_history,
                model=self.model,
                backend=self.backend_type,
                name=name
            )
            self.session_id = result["id"]
            return f"[ok] Saved session: {result['name']} ({result['message_count']} messages)"

        except Exception as e:
            return f"[err] Save failed: {e}"

    async def _cmd_resume(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """Load a previous session."""
        if not args.strip():
            # Show sessions list if no arg
            sessions = await self._session_mgr.list_sessions(limit=10)
            return self._session_mgr.format_session_list(sessions)

        try:
            data = await self._session_mgr.load(args.strip())
            self._conversation_history = data.get("messages", [])
            self.session_id = data["id"]

            # Restore model if saved
            if data.get("model"):
                self.model = data["model"]
                self._backend = None  # Force re-resolution

            return f"[ok] Loaded session: {data['name']} ({len(self._conversation_history)} messages)"

        except FileNotFoundError:
            return f"[err] Session not found: {args.strip()}"
        except Exception as e:
            return f"[err] Load failed: {e}"

    async def _cmd_sessions(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """List saved sessions."""
        sessions = await self._session_mgr.list_sessions(limit=20)
        return self._session_mgr.format_session_list(sessions)

    async def _cmd_usage(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """Show token usage statistics."""
        return format_usage_stats(self._conversation_history)

    async def _cmd_context(self, args: str, ctx: "AgentRunner") -> Optional[str]:
        """Show what's in current context."""
        lines = ["Current Context:", ""]

        # System message
        system_msgs = [m for m in self._conversation_history if m.get("role") == "system"]
        if system_msgs:
            lines.append(f"System messages: {len(system_msgs)}")

        # Conversation
        user_msgs = [m for m in self._conversation_history if m.get("role") == "user"]
        assistant_msgs = [m for m in self._conversation_history if m.get("role") == "assistant"]

        lines.append(f"User messages: {len(user_msgs)}")
        lines.append(f"Assistant messages: {len(assistant_msgs)}")

        # Token estimate
        tokens = estimate_token_count(self._conversation_history)
        lines.append(f"Estimated tokens: ~{tokens:,}")

        # Compaction suggestion
        if should_compact(self._conversation_history):
            lines.append("")
            lines.append("[Tip: Use /compact to reduce token usage]")

        return "\n".join(lines)

    async def _handle_model_switch(self, model_arg: str) -> None:
        """Handle /model command for mid-session model switching."""
        from .model_shorthands import resolve_model, get_model_family, model_supports_tools

        if model_arg:
            # Direct switch
            new_model = resolve_model(model_arg)
            family = get_model_family(new_model)
            tools = model_supports_tools(new_model)

            self.model = new_model
            self._backend = None  # Force re-resolution

            print(f"[ok] Switched to: {new_model}")
            print(f"     Family: {family} | Tools: {'yes' if tools else 'no'}")
            return

        # Interactive menu
        print("\nProviders (61+ models available):")
        providers = [
            ("1", "Claude", 8, True),
            ("2", "OpenAI (GPT-5)", 9, True),
            ("3", "Gemini", 5, True),
            ("4", "GitHub Copilot", 21, True),
            ("5", "Kiro (AWS)", 9, False),
            ("6", "Antigravity", 10, False),
            ("7", "LMStudio (local)", "?", True),
        ]

        for num, name, count, tools in providers:
            tool_icon = "[tools]" if tools else "[no-tools]"
            print(f"  [{num}] {name:18} {count:>3} models {tool_icon}")

        print("\nEnter number [1-7] or model shorthand (opus, gpt5, gemini, etc.):")
        choice = await asyncio.get_event_loop().run_in_executor(
            None, lambda: input("Choice: ")
        )

        if not choice.strip():
            return

        # Handle numeric provider selection
        if choice.isdigit() and 1 <= int(choice) <= 7:
            await self._show_provider_models(providers[int(choice) - 1][1])
        else:
            # Treat as shorthand/model ID
            new_model = resolve_model(choice.strip())
            self.model = new_model
            self._backend = None
            print(f"[ok] Switched to: {new_model}")

    async def _show_provider_models(self, provider_name: str) -> None:
        """Show models for a specific provider."""
        from .model_shorthands import resolve_model

        # Provider model samples
        provider_models = {
            "Claude": ["opus", "sonnet", "haiku", "opus4.1", "sonnet3.7"],
            "OpenAI (GPT-5)": ["gpt5", "codex", "codex-max", "gpt5.1", "gpt5.2"],
            "Gemini": ["gemini", "flash", "flash-lite", "gemini3", "gemini3-flash"],
            "GitHub Copilot": ["gpt4o", "gpt4.1", "grok", "raptor"],
            "Kiro (AWS)": ["kiro", "kiro-opus", "kiro-sonnet", "kiro-agentic"],
            "Antigravity": ["antigravity", "thinking", "thinking-opus", "gpt-oss"],
            "LMStudio (local)": [],
        }

        models = provider_models.get(provider_name, [])
        if not models:
            print(f"[info] {provider_name}: Use --list-models to see all available")
            return

        print(f"\n{provider_name} Models:")
        for i, short in enumerate(models, 1):
            full = resolve_model(short)
            print(f"  [{i}] {short:15} -> {full}")

        print("\nEnter number or shorthand:")
        choice = await asyncio.get_event_loop().run_in_executor(
            None, lambda: input("Choice: ")
        )

        if choice.isdigit() and 1 <= int(choice) <= len(models):
            short = models[int(choice) - 1]
            new_model = resolve_model(short)
        else:
            new_model = resolve_model(choice.strip())

        self.model = new_model
        self._backend = None
        print(f"[ok] Switched to: {new_model}")

    async def _show_providers_dashboard(self) -> None:
        """Show provider health dashboard."""
        print("\n" + "=" * 60)
        print("PROVIDER HEALTH DASHBOARD")
        print("=" * 60)

        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(
                    f"{self.cliproxyapi_url}/v1/models",
                    headers={"Authorization": "Bearer kuroryuu-local"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    models = data.get("data", [])

                    # Group by provider
                    by_provider: Dict[str, List[str]] = {}
                    for m in models:
                        p = m.get("owned_by", "other")
                        by_provider.setdefault(p, []).append(m["id"])

                    # Display each provider (with aliases for different owned_by values)
                    provider_aliases = {
                        "claude": ["claude", "anthropic"],
                        "openai": ["openai"],
                        "gemini": ["gemini", "google"],
                        "github-copilot": ["github-copilot"],
                        "kiro": ["kiro", "aws"],
                        "antigravity": ["antigravity"],
                    }
                    for display_name, aliases in provider_aliases.items():
                        combined_models = []
                        for alias in aliases:
                            combined_models.extend(by_provider.get(alias, []))
                        count = len(combined_models)
                        status = "[OK]" if count > 0 else "[--]"
                        tools = "[tools]" if display_name in {"claude", "openai", "gemini", "github-copilot"} else "[completion]"
                        print(f"{status} {display_name:18} {count:>2} models  {tools}")

                    print("-" * 60)
                    print(f"Total: {len(models)} models available")
                    print(f"CLIProxyAPI: {self.cliproxyapi_url}")
                else:
                    print(f"[err] CLIProxyAPI returned {resp.status_code}")
        except Exception as e:
            print(f"[err] CLIProxyAPI unavailable: {e}")

        # Also check LMStudio
        try:
            async with httpx.AsyncClient(timeout=2) as client:
                resp = await client.get(f"{self.lmstudio_url}/v1/models")
                if resp.status_code == 200:
                    data = resp.json()
                    count = len(data.get("data", []))
                    print(f"[OK] lmstudio            {count:>2} models  [tools]")
                else:
                    print(f"[--] lmstudio             0 models")
        except Exception:
            print(f"[--] lmstudio             0 models  (offline)")

    # =========================================================================
    # Agent Start
    # =========================================================================

    async def start(self, interactive: bool = True):
        """Start the agent."""
        # Check backend first
        if not await self.check_backend():
            return False

        # Register with gateway
        if not await self.register():
            return False

        self.running = True

        try:
            if interactive:
                # Start heartbeat in background
                heartbeat_task = asyncio.create_task(self.run_heartbeat_loop())

                # Run interactive loop
                result = await self.run_interactive()

                # Cancel heartbeat
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass

                return result
            else:
                # Run both loops concurrently
                await asyncio.gather(
                    self.run_heartbeat_loop(),
                    self.run_poll_loop(),
                )
        finally:
            await self.deregister()


async def main():
    parser = argparse.ArgumentParser(
        description="Kuroryuu Multi-Backend Agent Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                              # Auto-fallback (lmstudio -> cliproxyapi)
  %(prog)s --backend cliproxyapi        # Force CLIProxyAPI
  %(prog)s --model opus                 # Use Claude Opus 4.5
  %(prog)s --model gpt5                 # Use GPT-5
  %(prog)s --list-models                # Show all 61 models
  %(prog)s --auth-status                # Check OAuth status
  %(prog)s --login claude               # Start Claude OAuth flow
        """,
    )

    # Existing args
    parser.add_argument("--name", type=str, help="Agent name")
    parser.add_argument(
        "--gateway",
        type=str,
        default=DEFAULT_GATEWAY_URL,
        help="Gateway URL",
    )
    parser.add_argument(
        "--lmstudio",
        type=str,
        default=DEFAULT_LMSTUDIO_URL,
        help="LM Studio URL",
    )
    parser.add_argument(
        "--daemon",
        action="store_true",
        help="Run as daemon (non-interactive)",
    )

    # New multi-backend args
    parser.add_argument(
        "--backend",
        type=str,
        default="auto",
        choices=["lmstudio", "cliproxyapi", "claude", "auto"],
        help="Backend: lmstudio | cliproxyapi | claude | auto (default: auto)",
    )
    parser.add_argument(
        "--cliproxyapi",
        type=str,
        default=DEFAULT_CLIPROXYAPI_URL,
        help="CLIProxyAPI URL (default: http://127.0.0.1:8317)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Model name or shorthand (opus, sonnet, gpt5, gemini, etc.)",
    )

    # Utility commands
    parser.add_argument(
        "--list-models",
        action="store_true",
        help="List available models grouped by provider",
    )
    parser.add_argument(
        "--auth-status",
        action="store_true",
        help="Show OAuth authentication status for all providers",
    )
    parser.add_argument(
        "--login",
        type=str,
        metavar="PROVIDER",
        choices=["claude", "openai", "gemini", "copilot", "kiro", "antigravity"],
        help="Start OAuth login for a provider",
    )

    args = parser.parse_args()

    # Resolve model shorthand
    model = None
    if args.model:
        from .model_shorthands import resolve_model
        model = resolve_model(args.model)

    # Handle utility commands first (no full agent startup needed)
    if args.list_models:
        async with AgentRunner(cliproxyapi_url=args.cliproxyapi) as runner:
            await runner.list_models()
        return

    if args.auth_status:
        async with AgentRunner(cliproxyapi_url=args.cliproxyapi) as runner:
            await runner.check_auth_status()
        return

    if args.login:
        async with AgentRunner(cliproxyapi_url=args.cliproxyapi) as runner:
            await runner.start_oauth_login(args.login)
        return

    # Full agent startup
    print("Kuroryuu Agent Runner")
    print(f"  Backend: {args.backend}")
    print(f"  Gateway: {args.gateway}")
    if model:
        print(f"  Model: {model}")

    async with AgentRunner(
        name=args.name,
        gateway_url=args.gateway,
        lmstudio_url=args.lmstudio,
        cliproxyapi_url=args.cliproxyapi,
        backend=args.backend,
        model=model,
    ) as runner:
        result = await runner.start(interactive=not args.daemon)

        if result == "restart":
            print("\n[restart] Restart requested...")
            # Could recursively restart here


if __name__ == "__main__":
    asyncio.run(main())
