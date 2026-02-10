/**
 * Repository Store - GitHub Desktop Clone State Management
 * Manages git status, staging, commits, and history
 */

import { create } from 'zustand';
import { getDomainConfig } from './domain-config-store';
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
  isSummarizing: boolean;
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
  summarizeCommit: () => Promise<void>;

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

function parseGitStatus(statusOutput: string, format?: string): ChangedFile[] {
  const files: ChangedFile[] = [];

  // NUL-delimited format from `git status --porcelain -z` (GitHub Desktop pattern)
  if (format === 'nul') {
    const entries = statusOutput.split('\0').filter(Boolean);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const match = entry.match(/^(.)(.) (.+)$/);
      if (!match) continue;

      const [, index, worktree, path] = match;
      let status: FileStatus = 'modified';
      let oldPath: string | undefined;

      // Renames/copies: next NUL-delimited entry is the source path
      if (index === 'R' || index === 'C') {
        status = index === 'R' ? 'renamed' : 'copied';
        if (i + 1 < entries.length && !entries[i + 1].match(/^.{2} /)) {
          oldPath = entries[++i];
        }
        files.push({ path, status, included: true, oldPath });
        continue;
      }

      // Determine status from index and worktree indicators
      if (index === '?' || worktree === '?') {
        status = 'untracked';
      } else if (index === 'A' || worktree === 'A') {
        status = 'new';
      } else if (index === 'D' || worktree === 'D') {
        status = 'deleted';
      } else if (index === 'U' || worktree === 'U') {
        status = 'conflicted';
      } else if (index === 'M' || worktree === 'M') {
        status = 'modified';
      }

      files.push({ path, status, included: true, oldPath });
    }

    return files;
  }

  // Legacy newline-delimited format fallback
  const lines = statusOutput.trimEnd().split('\n').filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(.)(.) (.+)$/);
    if (!match) continue;

    const [, index, worktree, path] = match;
    let status: FileStatus = 'modified';
    let oldPath: string | undefined;

    if (path.includes(' -> ')) {
      const [old, newPath] = path.split(' -> ');
      oldPath = old;
      status = 'renamed';
      files.push({ path: newPath, status, included: true, oldPath });
      continue;
    }

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
  isSummarizing: false,
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
        const files = parseGitStatus(result.output, result.format);
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

  summarizeCommit: async () => {
    const { changedFiles } = get();
    if (changedFiles.length === 0) return;

    set({ isSummarizing: true, commitError: null });

    try {
      // Collect diffs from all changed files
      const diffs: string[] = [];
      for (const file of changedFiles) {
        const result = await window.electronAPI?.git?.diff?.(file.path);
        if (result?.diff) {
          diffs.push(`--- ${file.path} ---\n${result.diff}`);
        }
      }

      if (diffs.length === 0) {
        set({ isSummarizing: false, commitError: 'No diffs available to summarize' });
        return;
      }

      const diffText = diffs.join('\n\n');
      // Truncate to ~8k chars to stay within model context
      const truncated = diffText.length > 8000
        ? diffText.slice(0, 8000) + '\n\n... (truncated)'
        : diffText;

      // Get domain config for git-commit
      const domainCfg = getDomainConfig('git-commit');

      const messages = [
        {
          role: 'system',
          content: 'Generate a concise git commit message from the following diff. Return ONLY the commit message. First line: summary (max 72 chars, imperative tense, e.g. "Fix bug" not "Fixed bug"). Then a blank line. Then optional bullet-point description of key changes. No markdown formatting, no code blocks.',
        },
        {
          role: 'user',
          content: truncated,
        },
      ];

      const result = await window.electronAPI?.gateway?.chat?.(
        messages,
        domainCfg.modelId || 'mistralai/devstral-small-2-2512',
        { backend: domainCfg.provider, direct: true }
      );

      if (!result?.ok || !result.chunks?.length) {
        set({ isSummarizing: false, commitError: result?.error || 'Summarization failed' });
        return;
      }

      // Assemble response from SSE chunks
      // Gateway AG-UI format: { type: "delta", text: "..." }
      // OpenAI format: { choices: [{ delta: { content: "..." } }] }
      let response = '';
      for (const chunkStr of result.chunks) {
        try {
          const chunk = JSON.parse(chunkStr);
          // Gateway AG-UI format (primary): { type: "delta", text: "..." }
          if (chunk.type === 'delta' && chunk.text) {
            response += chunk.text;
          }
          // OpenAI SSE format: choices[0].delta.content
          else if (chunk?.choices?.[0]?.delta?.content) {
            response += chunk.choices[0].delta.content;
          }
        } catch {
          // skip unparseable
        }
      }

      // Parse: first line = summary, rest = description
      const lines = response.trim().split('\n');
      const summary = lines[0]?.trim() || '';
      const description = lines.slice(1).join('\n').trim();

      set({
        commitSummary: summary,
        commitDescription: description,
        isSummarizing: false,
      });
    } catch (error) {
      console.error('Failed to summarize commit:', error);
      set({ isSummarizing: false, commitError: String(error) });
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
          message: c.summary,
          summary: c.summary,
          author: {
            name: c.authorName,
            email: c.authorEmail,
            date: c.date,
          },
          timestamp: c.timestamp || 0,
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
          message: c.summary || c.message,
          summary: c.summary,
          body: c.body,
          author: {
            name: c.author.name,
            email: c.author.email,
            date: c.author.date,
          },
          timestamp: c.timestamp || 0,
          filesChanged: c.filesChanged || c.files?.length || 0,
          additions: c.additions || 0,
          deletions: c.deletions || 0,
          parents: c.parents || [],
          files: (c.files || []).map((f) => ({
            path: f.path,
            status: mapGitStatus(f.status),
            additions: f.additions || 0,
            deletions: f.deletions || 0,
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
