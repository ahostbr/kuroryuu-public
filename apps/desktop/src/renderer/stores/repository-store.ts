/**
 * Repository Store - GitHub Desktop Clone State Management
 * Manages git status, staging, commits, and history
 */

import { create } from 'zustand';
import type {
  ChangedFile,
  FileDiff,
  Commit,
  CommitDetails,
  RepositoryInfo,
  BranchInfo,
  ActiveTab,
  FileStatus,
} from '../types/repository';

// ============================================================================
// Helper Functions
// ============================================================================

/** Map git status string to FileStatus type */
function mapGitStatus(status: string): FileStatus {
  switch (status.toUpperCase()) {
    case 'A':
    case 'ADDED':
      return 'new';
    case 'M':
    case 'MODIFIED':
      return 'modified';
    case 'D':
    case 'DELETED':
      return 'deleted';
    case 'R':
    case 'RENAMED':
      return 'renamed';
    case 'C':
    case 'COPIED':
      return 'copied';
    case 'U':
    case 'CONFLICTED':
      return 'conflicted';
    case '?':
    case 'UNTRACKED':
      return 'untracked';
    default:
      return 'modified';
  }
}

// ============================================================================
// State Interface
// ============================================================================

interface RepositoryState {
  // Repository info
  repository: RepositoryInfo | null;
  currentBranch: BranchInfo | null;
  lastFetched: Date | null;
  isFetching: boolean;

  // Changes state
  changedFiles: ChangedFile[];
  selectedFile: ChangedFile | null;
  selectedFileDiff: FileDiff | null;
  isLoadingStatus: boolean;
  isLoadingDiff: boolean;

  // Staging state
  stagedFiles: Set<string>;

  // Commit state
  commitSummary: string;
  commitDescription: string;
  isCommitting: boolean;
  commitError: string | null;

  // History state
  commits: Commit[];
  selectedCommit: Commit | null;
  selectedCommitDetails: CommitDetails | null;
  isLoadingHistory: boolean;
  isLoadingCommitDetails: boolean;

  // UI state
  activeTab: ActiveTab;
  filterText: string;
  sidebarWidth: number;

  // Actions
  setActiveTab: (tab: ActiveTab) => void;
  setFilterText: (text: string) => void;
  setSidebarWidth: (width: number) => void;

  // Repository actions
  loadRepository: () => Promise<void>;
  fetchOrigin: () => Promise<void>;

  // Changes actions
  refreshStatus: () => Promise<void>;
  selectFile: (file: ChangedFile | null) => void;
  loadFileDiff: (path: string) => Promise<void>;

  // Staging actions
  stageFile: (path: string) => Promise<void>;
  unstageFile: (path: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  toggleFileStaged: (path: string) => void;
  discardFileChanges: (path: string) => Promise<void>;

  // Commit actions
  setCommitSummary: (summary: string) => void;
  setCommitDescription: (description: string) => void;
  createCommit: () => Promise<boolean>;

  // History actions
  loadHistory: (limit?: number) => Promise<void>;
  selectCommit: (commit: Commit | null) => void;
  loadCommitDetails: (hash: string) => Promise<void>;

  // Initialize
  initialize: () => void;
}

// ============================================================================
// Helper: Parse git status output
// ============================================================================

function parseGitStatus(statusOutput: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  const lines = statusOutput.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    // Git status porcelain format: XY filename
    const match = line.match(/^(.)(.) (.+)$/);
    if (!match) continue;

    const [, index, worktree, path] = match;
    let status: FileStatus = 'modified';
    let oldPath: string | undefined;

    // Check for rename (R) with -> separator
    if (path.includes(' -> ')) {
      const [old, newPath] = path.split(' -> ');
      oldPath = old;
      status = 'renamed';
      files.push({ path: newPath, status, included: true, oldPath });
      continue;
    }

    // Determine status from index and worktree indicators
    if (index === '?' || worktree === '?') {
      status = 'untracked';
    } else if (index === 'A' || worktree === 'A') {
      status = 'new';
    } else if (index === 'D' || worktree === 'D') {
      status = 'deleted';
    } else if (index === 'R' || worktree === 'R') {
      status = 'renamed';
    } else if (index === 'C' || worktree === 'C') {
      status = 'copied';
    } else if (index === 'U' || worktree === 'U') {
      status = 'conflicted';
    } else if (index === 'M' || worktree === 'M') {
      status = 'modified';
    }

    files.push({ path, status, included: true, oldPath });
  }

  return files;
}

// ============================================================================
// Store
// ============================================================================

export const useRepositoryStore = create<RepositoryState>((set, get) => ({
  // Initial state
  repository: null,
  currentBranch: null,
  lastFetched: null,
  isFetching: false,

  changedFiles: [],
  selectedFile: null,
  selectedFileDiff: null,
  isLoadingStatus: false,
  isLoadingDiff: false,

  stagedFiles: new Set(),

  commitSummary: '',
  commitDescription: '',
  isCommitting: false,
  commitError: null,

  commits: [],
  selectedCommit: null,
  selectedCommitDetails: null,
  isLoadingHistory: false,
  isLoadingCommitDetails: false,

  activeTab: 'changes',
  filterText: '',
  sidebarWidth: 300,

  // UI Actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  setFilterText: (text) => set({ filterText: text }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  // Repository actions
  loadRepository: async () => {
    try {
      // Get repo name from directory
      const repoName = await window.electronAPI?.git?.getRepoName?.() || 'Kuroryuu';
      const repoPath = await window.electronAPI?.git?.getRepoPath?.() || process.cwd();

      // Get current branch
      const branchResult = await window.electronAPI?.git?.getCurrentBranch?.();
      const branchName = branchResult?.branch || 'master';

      set({
        repository: { name: repoName, path: repoPath },
        currentBranch: {
          name: branchName,
          isHead: true,
          ahead: branchResult?.ahead || 0,
          behind: branchResult?.behind || 0,
        },
      });
    } catch (error) {
      console.error('Failed to load repository:', error);
    }
  },

  fetchOrigin: async () => {
    set({ isFetching: true });
    try {
      await window.electronAPI?.git?.fetch?.();
      set({ lastFetched: new Date(), isFetching: false });
      // Refresh status after fetch
      get().refreshStatus();
    } catch (error) {
      console.error('Failed to fetch:', error);
      set({ isFetching: false });
    }
  },

  // Changes actions
  refreshStatus: async () => {
    set({ isLoadingStatus: true });
    try {
      const result = await window.electronAPI?.git?.status?.();
      if (result?.output) {
        const files = parseGitStatus(result.output);
        // Preserve included state from existing files
        const { changedFiles: existing, stagedFiles } = get();
        const existingMap = new Map(existing.map(f => [f.path, f]));

        const mergedFiles = files.map(f => ({
          ...f,
          included: stagedFiles.has(f.path) || (existingMap.get(f.path)?.included ?? true),
        }));

        set({ changedFiles: mergedFiles, isLoadingStatus: false });
      } else {
        set({ changedFiles: [], isLoadingStatus: false });
      }
    } catch (error) {
      console.error('Failed to get status:', error);
      set({ changedFiles: [], isLoadingStatus: false });
    }
  },

  selectFile: (file) => {
    set({ selectedFile: file, selectedFileDiff: null });
    if (file) {
      get().loadFileDiff(file.path);
    }
  },

  loadFileDiff: async (path) => {
    set({ isLoadingDiff: true });
    try {
      const result = await window.electronAPI?.git?.diff?.(path);
      if (result?.diff) {
        // Parse the diff output into structured format
        const diff = parseDiff(result.diff, path);
        set({ selectedFileDiff: diff, isLoadingDiff: false });
      } else {
        set({ selectedFileDiff: null, isLoadingDiff: false });
      }
    } catch (error) {
      console.error('Failed to load diff:', error);
      set({ selectedFileDiff: null, isLoadingDiff: false });
    }
  },

  // Staging actions
  stageFile: async (path) => {
    try {
      await window.electronAPI?.git?.stage?.(path);
      set(state => ({
        stagedFiles: new Set([...state.stagedFiles, path]),
        changedFiles: state.changedFiles.map(f =>
          f.path === path ? { ...f, included: true } : f
        ),
      }));
    } catch (error) {
      console.error('Failed to stage file:', error);
    }
  },

  unstageFile: async (path) => {
    try {
      await window.electronAPI?.git?.unstage?.(path);
      set(state => {
        const newStaged = new Set(state.stagedFiles);
        newStaged.delete(path);
        return {
          stagedFiles: newStaged,
          changedFiles: state.changedFiles.map(f =>
            f.path === path ? { ...f, included: false } : f
          ),
        };
      });
    } catch (error) {
      console.error('Failed to unstage file:', error);
    }
  },

  stageAll: async () => {
    try {
      await window.electronAPI?.git?.stageAll?.();
      set(state => ({
        stagedFiles: new Set(state.changedFiles.map(f => f.path)),
        changedFiles: state.changedFiles.map(f => ({ ...f, included: true })),
      }));
    } catch (error) {
      console.error('Failed to stage all:', error);
    }
  },

  unstageAll: async () => {
    try {
      await window.electronAPI?.git?.unstageAll?.();
      set(state => ({
        stagedFiles: new Set(),
        changedFiles: state.changedFiles.map(f => ({ ...f, included: false })),
      }));
    } catch (error) {
      console.error('Failed to unstage all:', error);
    }
  },

  toggleFileStaged: (path) => {
    const { changedFiles, stageFile, unstageFile } = get();
    const file = changedFiles.find(f => f.path === path);
    if (file) {
      if (file.included) {
        unstageFile(path);
      } else {
        stageFile(path);
      }
    }
  },

  discardFileChanges: async (path) => {
    try {
      const result = await (window.electronAPI?.git as {
        discardChanges?: (path: string) => Promise<{ success: boolean; error?: string }>;
      })?.discardChanges?.(path);

      if (result?.success) {
        // Refresh status to reflect the discarded changes
        get().refreshStatus();
      } else if (result?.error) {
        console.error('Failed to discard changes:', result.error);
      }
    } catch (error) {
      console.error('Failed to discard changes:', error);
    }
  },

  // Commit actions
  setCommitSummary: (summary) => set({ commitSummary: summary }),
  setCommitDescription: (description) => set({ commitDescription: description }),

  createCommit: async () => {
    const { commitSummary, commitDescription, changedFiles, refreshStatus, loadHistory } = get();

    if (!commitSummary.trim()) {
      set({ commitError: 'Summary is required' });
      return false;
    }

    const includedFiles = changedFiles.filter(f => f.included);
    if (includedFiles.length === 0) {
      set({ commitError: 'No files selected for commit' });
      return false;
    }

    set({ isCommitting: true, commitError: null });

    try {
      // Build commit message
      const message = commitDescription
        ? `${commitSummary}\n\n${commitDescription}`
        : commitSummary;

      // Stage included files first
      for (const file of includedFiles) {
        await window.electronAPI?.git?.stage?.(file.path);
      }

      // Create commit
      const result = await window.electronAPI?.git?.commit?.(message);

      if (result?.ok) {
        // Clear form and refresh
        set({
          commitSummary: '',
          commitDescription: '',
          isCommitting: false,
          stagedFiles: new Set(),
        });
        await refreshStatus();
        await loadHistory();
        return true;
      } else {
        set({ commitError: result?.error || 'Commit failed', isCommitting: false });
        return false;
      }
    } catch (error) {
      console.error('Failed to create commit:', error);
      set({ commitError: String(error), isCommitting: false });
      return false;
    }
  },

  // History actions
  loadHistory: async (limit = 50) => {
    set({ isLoadingHistory: true });
    try {
      const result = await window.electronAPI?.git?.log?.(limit);
      if (result?.commits) {
        // Transform API response to Commit type
        const commits: Commit[] = result.commits.map((c) => ({
          hash: c.hash,
          shortHash: c.shortHash,
          message: c.subject,
          summary: c.subject,
          author: {
            name: c.authorName,
            email: c.authorEmail,
            date: c.date,
          },
          timestamp: new Date(c.date).getTime(),
          filesChanged: 0,
          additions: 0,
          deletions: 0,
        }));
        set({ commits, isLoadingHistory: false });
      } else {
        set({ commits: [], isLoadingHistory: false });
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      set({ commits: [], isLoadingHistory: false });
    }
  },

  selectCommit: (commit) => {
    set({ selectedCommit: commit, selectedCommitDetails: null });
    if (commit) {
      get().loadCommitDetails(commit.hash);
    }
  },

  loadCommitDetails: async (hash) => {
    set({ isLoadingCommitDetails: true });
    try {
      const result = await window.electronAPI?.git?.show?.(hash);
      if (result?.commit) {
        const c = result.commit;
        // Transform API response to CommitDetails type
        const commitDetails: CommitDetails = {
          hash: c.hash,
          shortHash: c.shortHash,
          message: c.subject,
          summary: c.subject,
          body: c.body,
          author: {
            name: c.authorName,
            email: c.authorEmail,
            date: c.date,
          },
          timestamp: new Date(c.date).getTime(),
          filesChanged: c.files?.length || 0,
          additions: 0,
          deletions: 0,
          parents: [],
          files: (c.files || []).map((f) => ({
            path: f.path,
            status: mapGitStatus(f.status),
            additions: 0,
            deletions: 0,
          })),
        };
        set({ selectedCommitDetails: commitDetails, isLoadingCommitDetails: false });
      } else {
        set({ selectedCommitDetails: null, isLoadingCommitDetails: false });
      }
    } catch (error) {
      console.error('Failed to load commit details:', error);
      set({ selectedCommitDetails: null, isLoadingCommitDetails: false });
    }
  },

  // Initialize
  initialize: () => {
    const { loadRepository, refreshStatus, loadHistory } = get();
    loadRepository();
    refreshStatus();
    loadHistory();
  },
}));

// ============================================================================
// Helper: Parse diff output
// ============================================================================

function parseDiff(diffOutput: string, path: string): FileDiff {
  const hunks: import('../types/repository').DiffHunk[] = [];
  let additions = 0;
  let deletions = 0;
  let isBinary = false;

  const lines = diffOutput.split('\n');
  let currentHunk: import('../types/repository').DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    // Check for binary file
    if (line.includes('Binary files')) {
      isBinary = true;
      continue;
    }

    // Parse hunk header: @@ -start,count +start,count @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunkMatch) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      const oldStart = parseInt(hunkMatch[1], 10);
      const oldCount = parseInt(hunkMatch[2] || '1', 10);
      const newStart = parseInt(hunkMatch[3], 10);
      const newCount = parseInt(hunkMatch[4] || '1', 10);

      currentHunk = {
        header: line,
        oldStart,
        oldCount,
        newStart,
        newCount,
        lines: [{
          type: 'hunk',
          content: hunkMatch[5] || '',
        }],
      };
      oldLineNum = oldStart;
      newLineNum = newStart;
      continue;
    }

    if (!currentHunk) continue;

    // Parse diff lines
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
      currentHunk.lines.push({
        type: 'add',
        content: line.substring(1),
        newLineNumber: newLineNum++,
      });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
      currentHunk.lines.push({
        type: 'delete',
        content: line.substring(1),
        oldLineNumber: oldLineNum++,
      });
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({
        type: 'context',
        content: line.substring(1),
        oldLineNumber: oldLineNum++,
        newLineNumber: newLineNum++,
      });
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return {
    path,
    hunks,
    additions,
    deletions,
    isBinary,
  };
}
