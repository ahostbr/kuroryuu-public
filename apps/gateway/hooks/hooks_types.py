"""Hook Types — Core dataclasses and enums for the hooks system.

Mirrors Claude Code's event model with Kuroryuu-specific extensions.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Callable


from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

def _get_project_root() -> str:
    """Get project root from env or derive from __file__."""
    env_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if env_root:
        return env_root
    # __file__ is apps/gateway/hooks/hooks_types.py -> go up 3 levels
    return str(Path(__file__).resolve().parent.parent.parent.parent)

def _get_hooks_dir() -> str:
    """Get hooks/ai dir from env or derive from project root."""
    env_dir = os.environ.get("KURORYUU_HOOKS_DIR")
    if env_dir:
        return env_dir
    return str(Path(_get_project_root()) / "ai")

HOOKS_ENABLED = os.environ.get("KURORYUU_HOOKS_ENABLED", "1") == "1"
HOOKS_DIR = _get_hooks_dir()
TODO_STRICT = os.environ.get("KURORYUU_TODO_STRICT", "0") == "1"
HOOK_TIMEOUT_MS = int(os.environ.get("KURORYUU_HOOK_TIMEOUT_MS", "2000"))
WORKLOG_REMIND_MINUTES = int(os.environ.get("KURORYUU_WORKLOG_REMIND_MINUTES", "60"))


# ═══════════════════════════════════════════════════════════════════════════════
# Hook Events (Claude Code Mirror)
# ═══════════════════════════════════════════════════════════════════════════════

class HookEvent(str, Enum):
    """Lifecycle events that hooks can subscribe to.
    
    Mirrors Claude Code's event model with Kuroryuu.* prefix.
    """
    
    # Session / Lifecycle
    SESSION_START = "Kuroryuu.SessionStart"
    SESSION_END = "Kuroryuu.SessionEnd"
    
    # Prompt / Message
    USER_PROMPT_SUBMIT = "Kuroryuu.UserPromptSubmit"
    MODEL_REQUEST_START = "Kuroryuu.ModelRequestStart"
    MODEL_RESPONSE_DONE = "Kuroryuu.ModelResponseDone"
    
    # Tools (Core Mirror)
    PRE_TOOL_USE = "Kuroryuu.PreToolUse"
    POST_TOOL_USE = "Kuroryuu.PostToolUse"
    TOOL_ERROR = "Kuroryuu.ToolError"
    
    # Persistence / Harness
    CHECKPOINT_SAVE = "Kuroryuu.CheckpointSave"

    # Diagnostics
    HEALTH_CHECK = "Kuroryuu.HealthCheck"


# Event mutability matrix
MUTABLE_EVENTS = {
    HookEvent.USER_PROMPT_SUBMIT,
    HookEvent.MODEL_REQUEST_START,
    HookEvent.PRE_TOOL_USE,
}

BLOCKABLE_EVENTS = {
    HookEvent.USER_PROMPT_SUBMIT,
    HookEvent.MODEL_REQUEST_START,
    HookEvent.PRE_TOOL_USE,
}


# ═══════════════════════════════════════════════════════════════════════════════
# Hook Action Types
# ═══════════════════════════════════════════════════════════════════════════════

class HookActionType(str, Enum):
    """Type of hook handler."""
    BUILTIN = "builtin"  # Python function in repo
    COMMAND = "command"  # Shell command (v0.2+)


@dataclass
class HookAction:
    """A hook action to execute."""
    
    id: str
    event: HookEvent
    type: HookActionType
    target: str  # For builtin: "module.path:function", for command: shell string
    priority: int = 50  # Lower runs first
    enabled: bool = True
    timeout_ms: int = HOOK_TIMEOUT_MS
    continue_on_error: bool = True
    
    # Optional filters
    tool_name_pattern: Optional[str] = None  # Only fire for matching tools (PreToolUse/PostToolUse)
    
    # Stateless architecture: mutation effects
    # If a hook has effects, it will be blocked for workers (hard error if strict_worker_guards=true)
    # Missing effects = UNKNOWN = blocked for workers
    effects: List[str] = field(default_factory=list)  # e.g., ["todo_write", "working_memory_write"]
    
    def __post_init__(self):
        if isinstance(self.event, str):
            self.event = HookEvent(self.event)
        if isinstance(self.type, str):
            self.type = HookActionType(self.type)


# ═══════════════════════════════════════════════════════════════════════════════
# Hook Result
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class HookNote:
    """A note/message from a hook."""
    level: str  # "info", "warn", "error"
    message: str


@dataclass
class HookUIEvent:
    """A UI event to emit from a hook."""
    type: str
    level: str = "info"
    text: str = ""
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class HookArtifacts:
    """Artifacts to create from a hook."""
    append_progress: Optional[Dict[str, Any]] = None
    save_checkpoint: Optional[Dict[str, Any]] = None
    update_todo: Optional[Dict[str, Any]] = None


@dataclass
class HookResult:
    """Return value from a hook execution."""
    
    ok: bool = True
    
    # Blocking/allowing
    allow: bool = True
    block_reason: Optional[str] = None
    
    # Mutations (JSONPath-like dotted keys)
    mutations: Dict[str, Any] = field(default_factory=dict)
    
    # Notes for logging/UI
    notes: List[HookNote] = field(default_factory=list)
    
    # UI events to emit
    ui_events: List[HookUIEvent] = field(default_factory=list)
    
    # Artifacts to create
    artifacts: Optional[HookArtifacts] = None
    
    # Error info (if ok=False)
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    error_details: Dict[str, Any] = field(default_factory=dict)
    
    # Context injection (for system prompt)
    inject_context: Optional[str] = None
    
    @classmethod
    def success(cls, **kwargs) -> "HookResult":
        """Create a successful result."""
        return cls(ok=True, allow=True, **kwargs)
    
    @classmethod
    def blocked(cls, reason: str, **kwargs) -> "HookResult":
        """Create a blocked result."""
        return cls(ok=True, allow=False, block_reason=reason, **kwargs)
    
    @classmethod
    def error(cls, code: str, message: str, **kwargs) -> "HookResult":
        """Create an error result."""
        return cls(ok=False, error_code=code, error_message=message, **kwargs)


# ═══════════════════════════════════════════════════════════════════════════════
# Hook Configuration
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class HookConfig:
    """Configuration for the hooks system."""
    
    spec_version: str = "kuroryuu-hooks-config/0.1"
    enabled: bool = True
    
    # Defaults
    default_timeout_ms: int = HOOK_TIMEOUT_MS
    continue_on_error: bool = True
    
    # Hook definitions
    hooks: List[HookAction] = field(default_factory=list)
    
    def get_hooks_for_event(self, event: HookEvent) -> List[HookAction]:
        """Get all enabled hooks for an event, sorted by priority."""
        return sorted(
            [h for h in self.hooks if h.event == event and h.enabled],
            key=lambda h: h.priority
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Hook Payload
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class SessionInfo:
    """Session context for hook payloads."""
    session_id: str
    thread_id: str
    user_id: str = "local"
    backend: str = "claude"
    project_root: str = field(default_factory=_get_project_root)


@dataclass
class HarnessInfo:
    """Harness context for hook payloads."""
    dir: str = field(default_factory=_get_hooks_dir)
    todo_path: str = field(default_factory=lambda: str(Path(_get_hooks_dir()) / "todo.md"))


@dataclass
class UIInfo:
    """UI context for hook payloads."""
    agui_protocol: str = "ag-ui"
    connection_id: str = ""
    stream_id: str = ""


@dataclass
class HookPayload:
    """Full payload passed to hooks."""
    
    spec_version: str = "kuroryuu-hooks/0.1"
    event: HookEvent = HookEvent.SESSION_START
    time: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    run_id: str = ""
    
    # Stateless architecture fields
    agent_role: str = "leader"  # "leader" or "worker"
    agent_run_id: str = ""  # Run ID from X-Agent-Run-Id header
    
    session: SessionInfo = field(default_factory=SessionInfo)
    harness: HarnessInfo = field(default_factory=HarnessInfo)
    ui: UIInfo = field(default_factory=UIInfo)
    
    # Event-specific data
    data: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "spec_version": self.spec_version,
            "event": self.event.value if isinstance(self.event, HookEvent) else self.event,
            "time": self.time,
            "run_id": self.run_id,
            "agent_role": self.agent_role,
            "agent_run_id": self.agent_run_id,
            "session": {
                "session_id": self.session.session_id,
                "thread_id": self.session.thread_id,
                "user_id": self.session.user_id,
                "backend": self.session.backend,
                "project_root": self.session.project_root,
            },
            "harness": {
                "dir": self.harness.dir,
                "todo_path": self.harness.todo_path,
            },
            "ui": {
                "agui_protocol": self.ui.agui_protocol,
                "connection_id": self.ui.connection_id,
                "stream_id": self.ui.stream_id,
            },
            "data": self.data,
        }
