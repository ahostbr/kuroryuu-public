/**
 * Types for Worktrees Manager
 * Manages git worktrees and task-based worktrees
 */

export type WorktreeType = 'task' | 'git' | 'terminal';
export type WorktreeStatus = 'active' | 'idle' | 'dirty' | 'conflict' | 'stale';

export interface Worktree {
  id: string;
  type: WorktreeType;
  branchName: string;
  specName?: string; // For task-based worktrees
  path: string;
  taskId?: string; // Associated task
  taskTitle?: string;
  status: WorktreeStatus;
  lastActivity?: number;
  aheadBehind?: { ahead: number; behind: number };
  isDirty?: boolean;
  uncommittedChanges?: number;
}

export interface MergeConflict {
  filePath: string;
  conflictType: 'content' | 'delete' | 'rename' | 'binary';
  ourChanges?: string;
  theirChanges?: string;
  lineNumbers?: { start: number; end: number };
}

export interface MergeResult {
  success: boolean;
  worktreeId: string;
  targetBranch: string;
  conflicts: MergeConflict[];
  mergedFiles: string[];
  message?: string;
}

export type MergeMode = 'full' | 'stage-only';

export interface WorktreeAction {
  type: 'merge' | 'delete' | 'open' | 'terminal';
  worktreeId: string;
}

/** Request to create a new worktree */
export interface CreateWorktreeRequest {
  name: string;
  taskId?: string;
  baseBranch: string;
  createGitBranch: boolean;
  type: 'task' | 'terminal';
}

/** Branch info for selection dropdown */
export interface BranchInfo {
  name: string;
  isDefault: boolean;
  isRemote: boolean;
  isCurrent: boolean;
}

export const WORKTREE_STATUS_CONFIG: Record<WorktreeStatus, { label: string; color: string; bgColor: string }> = {
  'active': { label: 'Active', color: 'text-green-400', bgColor: 'bg-green-500/20' },
  'idle': { label: 'Idle', color: 'text-zinc-400', bgColor: 'bg-zinc-500/20' },
  'dirty': { label: 'Dirty', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
  'conflict': { label: 'Conflict', color: 'text-red-400', bgColor: 'bg-red-500/20' },
  'stale': { label: 'Stale', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
};

export const WORKTREE_TYPE_CONFIG: Record<WorktreeType, { label: string; icon: string }> = {
  'task': { label: 'Task Worktree', icon: 'FolderGit2' },
  'git': { label: 'Git Worktree', icon: 'GitBranch' },
  'terminal': { label: 'Terminal Worktree', icon: 'Terminal' },
};
