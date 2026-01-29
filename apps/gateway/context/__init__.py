"""Context management module."""
from .router import router
from .run_id import generate_run_id, parse_run_id, is_valid_run_id
from .run_manager import (
    RunStatus,
    create_run,
    get_current_run,
    set_current_run,
    update_current_run_heartbeat,
    clear_current_run,
    get_leader_state,
    update_leader_state,
    append_task_log,
    append_worker_result,
    complete_run,
    list_runs,
    cleanup_abandoned_runs,
    init_run_manager,
    load_settings,
    # Context pack storage (Trap #2 fix)
    save_context_pack,
    load_context_pack,
    get_context_pack_for_role
)
from .context_pack import (
    ContextBudget,
    AgentRole,
    ContextPack,
    build_context_pack,
    get_effective_budget
)

__all__ = [
    "router",
    # run_id
    "generate_run_id",
    "parse_run_id", 
    "is_valid_run_id",
    # run_manager
    "RunStatus",
    "create_run",
    "get_current_run",
    "set_current_run",
    "update_current_run_heartbeat",
    "clear_current_run",
    "get_leader_state",
    "update_leader_state",
    "append_task_log",
    "append_worker_result",
    "complete_run",
    "list_runs",
    "cleanup_abandoned_runs",
    "init_run_manager",
    "load_settings",
    "save_context_pack",
    "load_context_pack",
    "get_context_pack_for_role",
    # context_pack
    "ContextBudget",
    "AgentRole",
    "ContextPack",
    "build_context_pack",
    "get_effective_budget"
]
