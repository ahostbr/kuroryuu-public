/**
 * Code Editor Store - State management for the standalone code editor window
 */

import { create } from 'zustand';

export interface OpenFile {
  path: string;
  content: string;
  originalContent: string; // For dirty detection
  isDirty: boolean;
  language: string;
}

export interface GitFile {
  path: string;
  status: 'M' | 'A' | 'D' | '?' | 'R' | string;
  staged: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  date: string;
  timestamp?: number;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  hasRemote: boolean;
}

export type WatcherStatus = 'idle' | 'watching' | 'syncing' | 'changes-detected';

export interface CodeEditorState {
  // Open files
  openFiles: OpenFile[];
  activeFileIndex: number;

  // Tab management (VS Code-style)
  pinnedPaths: string[];  // Paths of pinned tabs (stay left, can't close accidentally)

  // Git
  changedFiles: GitFile[];
  currentBranch: string;
  isRefreshing: boolean;
  recentCommits: GitCommit[];
  branches: GitBranch[];
  lastCommit: GitCommit | null;

  // Watcher
  watcherStatus: WatcherStatus;
  pendingChanges: number;
  lastSyncTime: Date | null;

  // UI
  sidebarWidth: number;
  showPreview: boolean;
  diffViewFile: GitFile | null;

  // Project root
  projectRoot: string;
}

export interface CodeEditorActions {
  // File operations
  openFile: (path: string, content: string) => void;
  closeFile: (index: number) => void;
  setActiveFile: (index: number) => void;
  updateFileContent: (index: number, content: string) => void;
  markFileSaved: (index: number) => void;

  // Tab management (VS Code-style)
  pinTab: (path: string) => void;
  unpinTab: (path: string) => void;
  isPinned: (path: string) => boolean;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  closeOtherTabs: (keepPath: string) => void;
  closeTabsToRight: (fromPath: string) => void;
  closeAllTabs: () => void;

  // Git operations
  setChangedFiles: (files: GitFile[]) => void;
  setCurrentBranch: (branch: string) => void;
  setIsRefreshing: (refreshing: boolean) => void;
  refreshGitStatus: () => Promise<void>;
  stageFile: (path: string) => Promise<boolean>;
  unstageFile: (path: string) => Promise<boolean>;
  stageAll: () => Promise<boolean>;
  unstageAll: () => Promise<boolean>;
  commit: (message: string) => Promise<{ ok: boolean; error?: string }>;
  commitAmend: (message: string) => Promise<{ ok: boolean; error?: string }>;
  getDiff: (path: string) => Promise<string>;

  // T411: Extended git operations
  fetchLog: (limit?: number) => Promise<void>;
  fetchBranches: () => Promise<void>;
  fetchLastCommit: () => Promise<void>;
  checkoutBranch: (branchName: string) => Promise<{ ok: boolean; error?: string }>;
  createBranch: (branchName: string) => Promise<{ ok: boolean; error?: string }>;
  deleteBranch: (branchName: string, force?: boolean) => Promise<{ ok: boolean; error?: string }>;
  pull: () => Promise<{ ok: boolean; error?: string }>;
  push: (setUpstream?: boolean) => Promise<{ ok: boolean; error?: string }>;
  stash: (message?: string) => Promise<{ ok: boolean; error?: string }>;
  stashPop: () => Promise<{ ok: boolean; error?: string }>;

  // Watcher
  setWatcherStatus: (status: WatcherStatus) => void;
  setPendingChanges: (count: number) => void;

  // UI
  setSidebarWidth: (width: number) => void;
  togglePreview: () => void;
  setProjectRoot: (path: string) => void;
  setDiffViewFile: (file: GitFile | null) => void;
}

// Ignore patterns for git status filtering
const IGNORED_PATTERNS = [
  /\.db$/,
  /\.sqlite$/,
  /\.log$/,
  /node_modules\//,
  /\.git\//,
  /dist\//,
  /build\//,
  /__pycache__\//,
  /\.pyc$/,
  /\.env$/,
  /\.lock$/,
  /package-lock\.json$/,
  /\.db-journal$/,
  /\.db-wal$/,
  /\.db-shm$/,
];

function shouldIgnoreFile(path: string): boolean {
  return IGNORED_PATTERNS.some(pattern => pattern.test(path));
}

export function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    md: 'markdown',
    json: 'json',
    html: 'html',
    css: 'css',
    scss: 'scss',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sh: 'shell',
    bash: 'shell',
    ps1: 'powershell',
    sql: 'sql',
    rs: 'rust',
    go: 'go',
  };
  return langMap[ext] || 'text';
}

export const useCodeEditorStore = create<CodeEditorState & CodeEditorActions>((set, get) => ({
  // Initial state
  openFiles: [],
  activeFileIndex: -1,
  pinnedPaths: [],
  changedFiles: [],
  currentBranch: 'master',
  isRefreshing: false,
  recentCommits: [],
  branches: [],
  lastCommit: null,
  watcherStatus: 'idle',
  pendingChanges: 0,
  lastSyncTime: null,
  sidebarWidth: 250,
  showPreview: false,
  diffViewFile: null,
  projectRoot: '',

  // File operations
  openFile: (path: string, content: string) => {
    const state = get();
    // Check if file is already open
    const existingIndex = state.openFiles.findIndex(f => f.path === path);
    if (existingIndex !== -1) {
      set({ activeFileIndex: existingIndex });
      return;
    }

    const newFile: OpenFile = {
      path,
      content,
      originalContent: content,
      isDirty: false,
      language: getLanguageFromPath(path),
    };

    set({
      openFiles: [...state.openFiles, newFile],
      activeFileIndex: state.openFiles.length,
    });
  },

  closeFile: (index: number) => {
    const state = get();
    const newFiles = state.openFiles.filter((_, i) => i !== index);
    let newActiveIndex = state.activeFileIndex;

    if (index === state.activeFileIndex) {
      // Closing active file - select adjacent
      newActiveIndex = Math.min(index, newFiles.length - 1);
    } else if (index < state.activeFileIndex) {
      // Closing file before active - adjust index
      newActiveIndex = state.activeFileIndex - 1;
    }

    set({
      openFiles: newFiles,
      activeFileIndex: newActiveIndex,
    });
  },

  setActiveFile: (index: number) => {
    set({ activeFileIndex: index });
  },

  updateFileContent: (index: number, content: string) => {
    const state = get();
    const file = state.openFiles[index];
    if (!file) return;

    const newFiles = [...state.openFiles];
    newFiles[index] = {
      ...file,
      content,
      isDirty: content !== file.originalContent,
    };

    set({ openFiles: newFiles });
  },

  markFileSaved: (index: number) => {
    const state = get();
    const file = state.openFiles[index];
    if (!file) return;

    const newFiles = [...state.openFiles];
    newFiles[index] = {
      ...file,
      originalContent: file.content,
      isDirty: false,
    };

    set({ openFiles: newFiles });
  },

  // Tab management (VS Code-style)
  pinTab: (path: string) => {
    const state = get();
    if (state.pinnedPaths.includes(path)) return;

    // Add to pinned list
    const newPinnedPaths = [...state.pinnedPaths, path];

    // Reorder: move pinned tab to front (after other pinned tabs)
    const fileIndex = state.openFiles.findIndex(f => f.path === path);
    if (fileIndex === -1) return;

    const pinnedCount = state.pinnedPaths.length;
    if (fileIndex > pinnedCount) {
      const newFiles = [...state.openFiles];
      const [movedFile] = newFiles.splice(fileIndex, 1);
      newFiles.splice(pinnedCount, 0, movedFile);

      // Adjust active index
      let newActiveIndex = state.activeFileIndex;
      if (state.activeFileIndex === fileIndex) {
        newActiveIndex = pinnedCount;
      } else if (state.activeFileIndex > pinnedCount && state.activeFileIndex < fileIndex) {
        newActiveIndex = state.activeFileIndex + 1;
      } else if (state.activeFileIndex >= pinnedCount && state.activeFileIndex < fileIndex) {
        newActiveIndex = state.activeFileIndex + 1;
      }

      set({ openFiles: newFiles, pinnedPaths: newPinnedPaths, activeFileIndex: newActiveIndex });
    } else {
      set({ pinnedPaths: newPinnedPaths });
    }
  },

  unpinTab: (path: string) => {
    const state = get();
    if (!state.pinnedPaths.includes(path)) return;

    set({ pinnedPaths: state.pinnedPaths.filter(p => p !== path) });
  },

  isPinned: (path: string) => {
    return get().pinnedPaths.includes(path);
  },

  reorderTabs: (fromIndex: number, toIndex: number) => {
    const state = get();
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= state.openFiles.length || toIndex >= state.openFiles.length) return;

    // Don't allow moving unpinned tabs before pinned tabs
    const pinnedCount = state.pinnedPaths.length;
    const fromPath = state.openFiles[fromIndex]?.path;
    const isFromPinned = fromPath && state.pinnedPaths.includes(fromPath);

    if (!isFromPinned && toIndex < pinnedCount) {
      return; // Can't move unpinned tab before pinned tabs
    }

    const newFiles = [...state.openFiles];
    const [movedFile] = newFiles.splice(fromIndex, 1);
    newFiles.splice(toIndex, 0, movedFile);

    // Adjust active index
    let newActiveIndex = state.activeFileIndex;
    if (state.activeFileIndex === fromIndex) {
      newActiveIndex = toIndex;
    } else if (fromIndex < state.activeFileIndex && toIndex >= state.activeFileIndex) {
      newActiveIndex = state.activeFileIndex - 1;
    } else if (fromIndex > state.activeFileIndex && toIndex <= state.activeFileIndex) {
      newActiveIndex = state.activeFileIndex + 1;
    }

    set({ openFiles: newFiles, activeFileIndex: newActiveIndex });
  },

  closeOtherTabs: (keepPath: string) => {
    const state = get();
    // Keep the specified file and all pinned files
    const newFiles = state.openFiles.filter(f =>
      f.path === keepPath || state.pinnedPaths.includes(f.path)
    );
    const newActiveIndex = newFiles.findIndex(f => f.path === keepPath);

    set({
      openFiles: newFiles,
      activeFileIndex: Math.max(0, newActiveIndex),
    });
  },

  closeTabsToRight: (fromPath: string) => {
    const state = get();
    const fromIndex = state.openFiles.findIndex(f => f.path === fromPath);
    if (fromIndex === -1) return;

    // Keep tabs up to and including fromIndex, plus any pinned tabs after
    const newFiles = state.openFiles.filter((f, i) =>
      i <= fromIndex || state.pinnedPaths.includes(f.path)
    );
    const newActiveIndex = Math.min(state.activeFileIndex, newFiles.length - 1);

    set({
      openFiles: newFiles,
      activeFileIndex: Math.max(0, newActiveIndex),
    });
  },

  closeAllTabs: () => {
    const state = get();
    // Keep only pinned tabs
    const newFiles = state.openFiles.filter(f => state.pinnedPaths.includes(f.path));
    const newActiveIndex = newFiles.length > 0 ? 0 : -1;

    set({
      openFiles: newFiles,
      activeFileIndex: newActiveIndex,
    });
  },

  // Git operations
  setChangedFiles: (files: GitFile[]) => {
    // Filter out ignored files
    const filteredFiles = files.filter(f => !shouldIgnoreFile(f.path));
    set({ changedFiles: filteredFiles });
  },

  setCurrentBranch: (branch: string) => {
    set({ currentBranch: branch });
  },

  setIsRefreshing: (refreshing: boolean) => {
    set({ isRefreshing: refreshing });
  },

  refreshGitStatus: async () => {
    set({ isRefreshing: true, watcherStatus: 'syncing' });

    try {
      const [statusResult, branchResult] = await Promise.all([
        window.electronAPI?.git?.status?.(),
        window.electronAPI?.git?.branch?.(),
      ]);

      if (statusResult?.ok && statusResult.files) {
        const files = statusResult.files.map(f => ({
          path: f.path,
          status: f.status,
          staged: f.staged,
        }));
        get().setChangedFiles(files);
      }

      if (branchResult?.ok) {
        set({ currentBranch: branchResult.branch });
      }

      set({
        lastSyncTime: new Date(),
        watcherStatus: 'watching',
      });
    } catch (err) {
      console.error('[CodeEditor] Git refresh failed:', err);
      set({ watcherStatus: 'idle' });
    } finally {
      set({ isRefreshing: false });
    }
  },

  stageFile: async (path: string) => {
    try {
      const result = await window.electronAPI?.git?.stage?.(path);
      if (result?.ok) {
        await get().refreshGitStatus();
        return true;
      }
      console.error('[CodeEditor] Stage failed:', result?.error);
      return false;
    } catch (err) {
      console.error('[CodeEditor] Stage error:', err);
      return false;
    }
  },

  unstageFile: async (path: string) => {
    try {
      const result = await window.electronAPI?.git?.unstage?.(path);
      if (result?.ok) {
        await get().refreshGitStatus();
        return true;
      }
      console.error('[CodeEditor] Unstage failed:', result?.error);
      return false;
    } catch (err) {
      console.error('[CodeEditor] Unstage error:', err);
      return false;
    }
  },

  stageAll: async () => {
    try {
      const result = await window.electronAPI?.git?.stageAll?.();
      if (result?.ok) {
        await get().refreshGitStatus();
        return true;
      }
      console.error('[CodeEditor] Stage all failed:', result?.error);
      return false;
    } catch (err) {
      console.error('[CodeEditor] Stage all error:', err);
      return false;
    }
  },

  unstageAll: async () => {
    try {
      const result = await window.electronAPI?.git?.unstageAll?.();
      if (result?.ok) {
        await get().refreshGitStatus();
        return true;
      }
      console.error('[CodeEditor] Unstage all failed:', result?.error);
      return false;
    } catch (err) {
      console.error('[CodeEditor] Unstage all error:', err);
      return false;
    }
  },

  commit: async (message: string) => {
    try {
      const result = await window.electronAPI?.git?.commit?.(message);
      if (result?.ok) {
        await get().refreshGitStatus();
        await get().fetchLastCommit();
        return { ok: true };
      }
      return { ok: false, error: result?.error || 'Unknown error' };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  commitAmend: async (message: string) => {
    try {
      const result = await window.electronAPI?.git?.commitAmend?.(message);
      if (result?.ok) {
        await get().refreshGitStatus();
        await get().fetchLastCommit();
        return { ok: true };
      }
      return { ok: false, error: result?.error || 'Unknown error' };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  getDiff: async (path: string) => {
    try {
      const result = await window.electronAPI?.git?.diff?.(path);
      if (result?.ok) {
        return result.diff;
      }
      console.error('[CodeEditor] Get diff failed:', result?.error);
      return '';
    } catch (err) {
      console.error('[CodeEditor] Get diff error:', err);
      return '';
    }
  },

  // T411: Extended git operations
  fetchLog: async (limit: number = 20) => {
    try {
      const result = await window.electronAPI?.git?.log?.(limit);
      if (result?.commits) {
        // Map from IPC format (summary) to GitCommit format (subject)
        const commits: GitCommit[] = result.commits.map(c => ({
          hash: c.hash,
          shortHash: c.shortHash,
          subject: c.summary,
          authorName: c.authorName,
          authorEmail: c.authorEmail,
          date: c.date,
          timestamp: c.timestamp,
        }));
        set({ recentCommits: commits });
      }
    } catch (err) {
      console.error('[CodeEditor] Fetch log error:', err);
    }
  },

  fetchBranches: async () => {
    try {
      const result = await window.electronAPI?.git?.listBranches?.();
      if (result?.ok) {
        set({ branches: result.branches });
      }
    } catch (err) {
      console.error('[CodeEditor] Fetch branches error:', err);
    }
  },

  fetchLastCommit: async () => {
    try {
      const result = await window.electronAPI?.git?.show?.('HEAD');
      if (result?.commit) {
        set({
          lastCommit: {
            hash: result.commit.hash,
            shortHash: result.commit.shortHash,
            subject: result.commit.summary,
            authorName: result.commit.author.name,
            authorEmail: result.commit.author.email,
            date: result.commit.author.date,
            timestamp: result.commit.timestamp,
          }
        });
      }
    } catch (err) {
      console.error('[CodeEditor] Fetch last commit error:', err);
    }
  },

  checkoutBranch: async (branchName: string) => {
    try {
      const result = await window.electronAPI?.git?.checkout?.(branchName);
      if (result?.ok) {
        await get().refreshGitStatus();
        await get().fetchBranches();
        return { ok: true };
      }
      return { ok: false, error: result?.error || 'Unknown error' };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  createBranch: async (branchName: string) => {
    try {
      const result = await window.electronAPI?.git?.createBranch?.(branchName, true);
      if (result?.ok) {
        await get().refreshGitStatus();
        await get().fetchBranches();
        return { ok: true };
      }
      return { ok: false, error: result?.error || 'Unknown error' };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  deleteBranch: async (branchName: string, force: boolean = false) => {
    try {
      const result = await window.electronAPI?.git?.deleteBranch?.(branchName, force);
      if (result?.ok) {
        await get().fetchBranches();
        return { ok: true };
      }
      return { ok: false, error: result?.error || 'Unknown error' };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  pull: async () => {
    try {
      const result = await window.electronAPI?.git?.pull?.();
      if (result?.ok) {
        await get().refreshGitStatus();
        await get().fetchBranches();
        return { ok: true };
      }
      return { ok: false, error: result?.error || 'Unknown error' };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  push: async (setUpstream: boolean = false) => {
    try {
      const result = await window.electronAPI?.git?.push?.(setUpstream);
      if (result?.ok) {
        await get().fetchBranches();
        return { ok: true };
      }
      return { ok: false, error: result?.error || 'Unknown error' };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  stash: async (message?: string) => {
    try {
      const result = await window.electronAPI?.git?.stash?.(message);
      if (result?.ok) {
        await get().refreshGitStatus();
        return { ok: true };
      }
      return { ok: false, error: result?.error || 'Unknown error' };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  stashPop: async () => {
    try {
      const result = await window.electronAPI?.git?.stashPop?.();
      if (result?.ok) {
        await get().refreshGitStatus();
        return { ok: true };
      }
      return { ok: false, error: result?.error || 'Unknown error' };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  // Watcher
  setWatcherStatus: (status: WatcherStatus) => {
    set({ watcherStatus: status });
  },

  setPendingChanges: (count: number) => {
    set({ pendingChanges: count });
  },

  // UI
  setSidebarWidth: (width: number) => {
    set({ sidebarWidth: Math.max(150, Math.min(400, width)) });
  },

  togglePreview: () => {
    set(state => ({ showPreview: !state.showPreview }));
  },

  setProjectRoot: (path: string) => {
    set({ projectRoot: path });
  },

  setDiffViewFile: (file: GitFile | null) => {
    set({ diffViewFile: file });
  },
}));
