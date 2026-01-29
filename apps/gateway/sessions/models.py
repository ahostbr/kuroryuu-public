"""
Session Models

Data models for agent chat sessions.
"""
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class MessageStatus(str, Enum):
    PENDING = "pending"
    STREAMING = "streaming"
    COMPLETE = "complete"
    ERROR = "error"


@dataclass
class ToolCallRecord:
    """Record of a tool call within a message."""
    id: str
    name: str
    input: str
    status: str  # running, success, error
    output: Optional[str] = None
    duration_ms: Optional[int] = None
    timestamp: float = field(default_factory=lambda: datetime.now().timestamp())


@dataclass
class SessionMessage:
    """A single message in a session."""
    id: str
    role: MessageRole
    content: str
    timestamp: float = field(default_factory=lambda: datetime.now().timestamp())
    status: MessageStatus = MessageStatus.COMPLETE
    error: Optional[str] = None
    tool_calls: List[ToolCallRecord] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "role": self.role.value if isinstance(self.role, MessageRole) else self.role,
            "content": self.content,
            "timestamp": self.timestamp,
            "status": self.status.value if isinstance(self.status, MessageStatus) else self.status,
            "error": self.error,
            "tool_calls": [
                {
                    "id": tc.id,
                    "name": tc.name,
                    "input": tc.input,
                    "status": tc.status,
                    "output": tc.output,
                    "duration_ms": tc.duration_ms,
                    "timestamp": tc.timestamp,
                }
                for tc in self.tool_calls
            ],
            "metadata": self.metadata,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SessionMessage":
        tool_calls = [
            ToolCallRecord(
                id=tc["id"],
                name=tc["name"],
                input=tc["input"],
                status=tc["status"],
                output=tc.get("output"),
                duration_ms=tc.get("duration_ms"),
                timestamp=tc.get("timestamp", datetime.now().timestamp()),
            )
            for tc in data.get("tool_calls", [])
        ]
        return cls(
            id=data["id"],
            role=MessageRole(data["role"]) if data["role"] in [r.value for r in MessageRole] else data["role"],
            content=data["content"],
            timestamp=data.get("timestamp", datetime.now().timestamp()),
            status=MessageStatus(data.get("status", "complete")),
            error=data.get("error"),
            tool_calls=tool_calls,
            metadata=data.get("metadata", {}),
        )


@dataclass
class SessionMetadata:
    """Metadata about a session."""
    agent_id: str
    agent_name: str
    model_name: Optional[str] = None
    lmstudio_ip: Optional[str] = None
    created_at: float = field(default_factory=lambda: datetime.now().timestamp())
    updated_at: float = field(default_factory=lambda: datetime.now().timestamp())
    total_messages: int = 0
    total_tokens: Optional[int] = None
    tags: List[str] = field(default_factory=list)
    # GitHub OAuth fields
    github_login: Optional[str] = None
    github_id: Optional[int] = None
    authenticated: bool = False
    # Claude Code sub-agent resume support
    subagent_id: Optional[str] = None  # For Claude Code resume parameter
    subagent_config_path: Optional[str] = None  # Path to .claude/agents/*.md
    role: Optional[str] = None  # leader/worker
    # Feature tracking (Dynamic Feature-Task Linking)
    feature_id: Optional[str] = None  # Active feature ID when session was created
    feature_title: Optional[str] = None  # Active feature title when session was created

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "agent_name": self.agent_name,
            "model_name": self.model_name,
            "lmstudio_ip": self.lmstudio_ip,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "total_messages": self.total_messages,
            "total_tokens": self.total_tokens,
            "tags": self.tags,
            "github_login": self.github_login,
            "github_id": self.github_id,
            "authenticated": self.authenticated,
            "subagent_id": self.subagent_id,
            "subagent_config_path": self.subagent_config_path,
            "role": self.role,
            "feature_id": self.feature_id,
            "feature_title": self.feature_title,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SessionMetadata":
        return cls(
            agent_id=data["agent_id"],
            agent_name=data["agent_name"],
            model_name=data.get("model_name"),
            lmstudio_ip=data.get("lmstudio_ip"),
            created_at=data.get("created_at", datetime.now().timestamp()),
            updated_at=data.get("updated_at", datetime.now().timestamp()),
            total_messages=data.get("total_messages", 0),
            total_tokens=data.get("total_tokens"),
            tags=data.get("tags", []),
            github_login=data.get("github_login"),
            github_id=data.get("github_id"),
            authenticated=data.get("authenticated", False),
            subagent_id=data.get("subagent_id"),
            subagent_config_path=data.get("subagent_config_path"),
            role=data.get("role"),
            feature_id=data.get("feature_id"),
            feature_title=data.get("feature_title"),
        )


@dataclass
class AgentSession:
    """Full agent session with messages and metadata."""
    session_id: str
    metadata: SessionMetadata
    messages: List[SessionMessage] = field(default_factory=list)
    
    def add_message(self, message: SessionMessage):
        """Add a message to the session."""
        self.messages.append(message)
        self.metadata.total_messages = len(self.messages)
        self.metadata.updated_at = datetime.now().timestamp()
    
    def clear_messages(self):
        """Clear all messages but keep metadata."""
        self.messages = []
        self.metadata.total_messages = 0
        self.metadata.updated_at = datetime.now().timestamp()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "metadata": self.metadata.to_dict(),
            "messages": [m.to_dict() for m in self.messages],
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AgentSession":
        return cls(
            session_id=data["session_id"],
            metadata=SessionMetadata.from_dict(data["metadata"]),
            messages=[SessionMessage.from_dict(m) for m in data.get("messages", [])],
        )
    
    def to_rag_document(self) -> str:
        """Convert session to a RAG-indexable document."""
        lines = [
            f"# Agent Session: {self.session_id}",
            f"Agent: {self.metadata.agent_name} ({self.metadata.agent_id})",
            f"Model: {self.metadata.model_name or 'unknown'}",
            f"Created: {datetime.fromtimestamp(self.metadata.created_at).isoformat()}",
            f"Messages: {self.metadata.total_messages}",
            "",
            "## Conversation",
            "",
        ]
        
        for msg in self.messages:
            role_label = msg.role.value.upper() if isinstance(msg.role, MessageRole) else msg.role.upper()
            timestamp = datetime.fromtimestamp(msg.timestamp).strftime("%H:%M:%S")
            lines.append(f"[{timestamp}] {role_label}: {msg.content[:500]}...")
            
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    lines.append(f"  -> Tool: {tc.name} ({tc.status})")
        
        return "\n".join(lines)
