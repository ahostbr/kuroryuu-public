"""
Worktree data models
"""

from dataclasses import dataclass, field
from typing import Optional, Literal
from enum import Enum


class WorktreeStatus(str, Enum):
    """Status of a worktree"""
    ACTIVE = "active"
    IDLE = "idle"
    DIRTY = "dirty"
    MERGING = "merging"
    CONFLICT = "conflict"


class WorktreeType(str, Enum):
    """Type of worktree"""
    TASK = "task"
    GIT = "git"


class MergeMode(str, Enum):
    """Merge mode for worktree"""
    FULL = "full"
    STAGE_ONLY = "stage-only"


@dataclass
class AheadBehind:
    """Ahead/behind counts for a branch"""
    ahead: int = 0
    behind: int = 0


@dataclass
class MergeConflict:
    """Represents a merge conflict in a file"""
    file_path: str
    our_changes: Optional[str] = None
    their_changes: Optional[str] = None
    line_start: Optional[int] = None
    line_end: Optional[int] = None


@dataclass
class Worktree:
    """Represents a git worktree"""
    id: str
    type: WorktreeType
    branch_name: str
    path: str
    status: WorktreeStatus = WorktreeStatus.IDLE
    spec_name: Optional[str] = None
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    last_activity: Optional[int] = None
    ahead_behind: Optional[AheadBehind] = None
    is_dirty: bool = False
    uncommitted_changes: int = 0


@dataclass
class MergeResult:
    """Result of a merge operation"""
    success: bool
    merged_files: list[str] = field(default_factory=list)
    conflicts: list[MergeConflict] = field(default_factory=list)
    error: Optional[str] = None


@dataclass
class CreateWorktreeRequest:
    """Request to create a new worktree"""
    branch_name: str
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    spec_name: Optional[str] = None
    base_branch: str = "main"


@dataclass
class MergeWorktreeRequest:
    """Request to merge a worktree"""
    worktree_id: str
    mode: MergeMode = MergeMode.FULL
    target_branch: str = "main"


@dataclass
class ResolveConflictRequest:
    """Request to resolve a merge conflict"""
    worktree_id: str
    file_path: str
    resolution: Literal["ours", "theirs"]
