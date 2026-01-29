/**
 * Repository Types for GitHub Desktop Clone
 * Types for git status, diff, commits, and repository state
 */

// ============================================================================
// File Status Types
// ============================================================================

export type FileStatus =
  | 'new'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'conflicted'
  | 'untracked';

export interface ChangedFile {
  path: string;
  status: FileStatus;
  included: boolean;
  oldPath?: string; // For renamed files
}

// ============================================================================
// Diff Types
// ============================================================================

export type DiffLineType = 'add' | 'delete' | 'context' | 'hunk';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  isBinary: boolean;
}

// ============================================================================
// Commit Types
// ============================================================================

export interface CommitAuthor {
  name: string;
  email: string;
  date: string;
}

export interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  summary: string; // First line of message
  author: CommitAuthor;
  timestamp: number;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface CommitFile {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
}

export interface CommitDetails extends Commit {
  body: string; // Full message after first line
  files: CommitFile[];
  parents: string[];
}

// ============================================================================
// Repository Types
// ============================================================================

export interface RepositoryInfo {
  name: string;
  path: string;
  remoteUrl?: string;
}

export interface BranchInfo {
  name: string;
  isHead: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
}

// ============================================================================
// UI State Types
// ============================================================================

export type ActiveTab = 'changes' | 'history' | 'worktrees';

export interface FilterOptions {
  showNew: boolean;
  showModified: boolean;
  showDeleted: boolean;
  showConflicted: boolean;
}

// ============================================================================
// File Status Config
// ============================================================================

export const FILE_STATUS_CONFIG: Record<FileStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: 'plus' | 'edit' | 'minus' | 'arrow-right' | 'copy' | 'alert-triangle' | 'file';
}> = {
  new: {
    label: 'New',
    color: 'text-green-400',
    bgColor: 'bg-green-500',
    icon: 'plus',
  },
  modified: {
    label: 'Modified',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500',
    icon: 'edit',
  },
  deleted: {
    label: 'Deleted',
    color: 'text-red-400',
    bgColor: 'bg-red-500',
    icon: 'minus',
  },
  renamed: {
    label: 'Renamed',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500',
    icon: 'arrow-right',
  },
  copied: {
    label: 'Copied',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500',
    icon: 'copy',
  },
  conflicted: {
    label: 'Conflicted',
    color: 'text-red-400',
    bgColor: 'bg-red-500',
    icon: 'alert-triangle',
  },
  untracked: {
    label: 'Untracked',
    color: 'text-green-400',
    bgColor: 'bg-green-500',
    icon: 'file',
  },
};
