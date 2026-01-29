"""Orchestration module for Leader/Worker coordination.

M4 Multi-Agent Message Bus implementation.

Provides:
- LeaderOrchestrator: Breaks down tasks, assigns to workers
- WorkerOrchestrator: Polls for work, executes, reports results
- SingleAgentExecutor: Disk-based state for context-limited agents
- RecoveryManager: Pause/resume, checkpoints, rollback
- Task lifecycle management
"""

from .models import (
    Task,
    TaskStatus,
    TaskBreakdown,
    SubTask,
    WorkerPollRequest,
    WorkerPollResponse,
    TaskResultRequest,
)
from .leader import LeaderOrchestrator
from .worker import WorkerOrchestrator, WorkerConfig
from .single_agent import SingleAgentExecutor, AgentState, create_single_agent_executor
from .recovery import (
    RecoveryManager,
    PauseState,
    PauseReason,
    Checkpoint,
    get_recovery_manager,
)
from .router import router as orchestration_router

__all__ = [
    "Task",
    "TaskStatus",
    "TaskBreakdown",
    "SubTask",
    "WorkerPollRequest",
    "WorkerPollResponse",
    "TaskResultRequest",
    "LeaderOrchestrator",
    "WorkerOrchestrator",
    "WorkerConfig",
    "SingleAgentExecutor",
    "AgentState",
    "create_single_agent_executor",
    "RecoveryManager",
    "PauseState",
    "PauseReason",
    "Checkpoint",
    "get_recovery_manager",
    "orchestration_router",
]
