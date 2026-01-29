/**
 * Zustand store for Worktrees Manager
 * Handles worktree listing, merge operations, and deletion
 * Connected to real IPC backend via window.electronAPI.worktree
 */

import { create } from 'zustand';
import type { Worktree, MergeResult, MergeConflict, MergeMode, WorktreeStatus, CreateWorktreeRequest, BranchInfo } from '../types/worktree';

// Type for raw worktree data from IPC
interface RawWorktree {
  path: string;
  branch?: string;
  head?: string;
  name: string;
  bare?: boolean;
  detached?: boolean;
  isMain: boolean;
}

// Type for worktree status from IPC
interface RawWorktreeStatus {
  changes: Array<{ status: string; file: string }>;
  ahead: number;
  behind: number;
  clean: boolean;
}

interface WorktreesState {
  // Worktree list
  worktrees: Worktree[];
  isLoading: boolean;
  selectedWorktree: Worktree | null;

  // Merge state
  mergeDialogOpen: boolean;
  mergeWorktree: Worktree | null;
  mergeMode: MergeMode;
  mergeResult: MergeResult | null;
  isMerging: boolean;

  // Delete state
  deleteDialogOpen: boolean;
  deleteWorktree: Worktree | null;
  isDeleting: boolean;

  // Create state (NEW)
  createDialogOpen: boolean;
  isCreating: boolean;
  availableBranches: BranchInfo[];
  loadingBranches: boolean;
  createError: string | null;

  // Actions
  setWorktrees: (worktrees: Worktree[]) => void;
  selectWorktree: (worktree: Worktree | null) => void;
  refreshWorktrees: () => Promise<void>;

  // Merge actions
  openMergeDialog: (worktree: Worktree) => void;
  closeMergeDialog: () => void;
  setMergeMode: (mode: MergeMode) => void;
  executeMerge: () => Promise<void>;
  resolveConflict: (filePath: string, resolution: 'ours' | 'theirs') => void;

  // Delete actions
  openDeleteDialog: (worktree: Worktree) => void;
  closeDeleteDialog: () => void;
  confirmDelete: () => Promise<void>;

  // Create actions (NEW)
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  loadBranches: () => Promise<void>;
  createWorktree: (request: CreateWorktreeRequest) => Promise<boolean>;

  // Other actions
  openInExplorer: (worktree: Worktree) => void;
  openTerminal: (worktree: Worktree) => void;

  // Initialize
  initialize: () => void;
}

/**
 * Determine worktree status based on IPC status data
 */
function computeStatus(rawStatus: RawWorktreeStatus, behind: number): WorktreeStatus {
  // If behind by too many commits, it's stale
  if (behind > 10) return 'stale';
  // If has uncommitted changes, it's dirty
  if (!rawStatus.clean) return 'dirty';
  // If ahead of upstream, it's active
  if (rawStatus.ahead > 0) return 'active';
  // Otherwise idle
  return 'idle';
}

/**
 * Map raw IPC worktree to frontend Worktree type
 */
async function mapWorktree(raw: RawWorktree): Promise<Worktree> {
  // Skip main repo
  if (raw.isMain) {
    return {
      id: `wt-main`,
      type: 'git',
      branchName: raw.branch || 'main',
      path: raw.path,
      status: 'active',
      isDirty: false,
      uncommittedChanges: 0,
    };
  }

  // Get status for this worktree
  let status: RawWorktreeStatus = { changes: [], ahead: 0, behind: 0, clean: true };
  try {
    status = await window.electronAPI.worktree.getStatus(raw.path);
  } catch (e) {
    console.warn('Failed to get worktree status:', raw.path, e);
  }

  // Determine type based on branch name
  const isTask = raw.branch?.startsWith('task/') || raw.name.match(/^\d{3}-/);

  return {
    id: `wt-${raw.name}`,
    type: isTask ? 'task' : 'git',
    branchName: raw.branch || raw.name,
    specName: isTask ? raw.name : undefined,
    path: raw.path,
    taskId: isTask ? raw.name : undefined,
    status: computeStatus(status, status.behind),
    aheadBehind: { ahead: status.ahead, behind: status.behind },
    isDirty: !status.clean,
    uncommittedChanges: status.changes.length,
  };
}

export const useWorktreesStore = create<WorktreesState>((set, get) => ({
  // Initial state
  worktrees: [],
  isLoading: false,
  selectedWorktree: null,

  mergeDialogOpen: false,
  mergeWorktree: null,
  mergeMode: 'full',
  mergeResult: null,
  isMerging: false,

  deleteDialogOpen: false,
  deleteWorktree: null,
  isDeleting: false,

  // Create state (NEW)
  createDialogOpen: false,
  isCreating: false,
  availableBranches: [],
  loadingBranches: false,
  createError: null,
  
  // Actions
  setWorktrees: (worktrees) => set({ worktrees }),
  selectWorktree: (worktree) => set({ selectedWorktree: worktree }),

  refreshWorktrees: async () => {
    set({ isLoading: true });
    try {
      const result = await window.electronAPI.worktree.list();
      if (result.error) {
        console.error('Failed to list worktrees:', result.error);
        set({ worktrees: [], isLoading: false });
        return;
      }

      // Map raw worktrees to frontend format (with status)
      const mappedWorktrees = await Promise.all(
        result.worktrees
          .filter((wt: RawWorktree) => !wt.isMain) // Exclude main repo
          .map((wt: RawWorktree) => mapWorktree(wt))
      );

      set({ worktrees: mappedWorktrees, isLoading: false });
    } catch (error) {
      console.error('Failed to refresh worktrees:', error);
      set({ worktrees: [], isLoading: false });
    }
  },
  
  // Merge actions
  openMergeDialog: (worktree) => set({ 
    mergeDialogOpen: true, 
    mergeWorktree: worktree,
    mergeResult: null,
    mergeMode: 'full',
  }),
  
  closeMergeDialog: () => set({ 
    mergeDialogOpen: false, 
    mergeWorktree: null,
    mergeResult: null,
  }),
  
  setMergeMode: (mode) => set({ mergeMode: mode }),
  
  executeMerge: async () => {
    const { mergeWorktree, mergeMode } = get();
    if (!mergeWorktree) return;

    set({ isMerging: true });

    try {
      const ipcResult = await window.electronAPI.worktree.merge({
        path: mergeWorktree.path,
        targetBranch: 'main',
        deleteAfter: mergeMode === 'full',
      });

      // Build MergeResult from IPC response
      const conflicts: MergeConflict[] = (ipcResult.conflicts || []).map((file: string) => ({
        filePath: file,
        conflictType: 'content' as const,
      }));

      const result: MergeResult = {
        success: ipcResult.ok && (ipcResult.merged ?? false),
        worktreeId: mergeWorktree.id,
        targetBranch: 'main',
        conflicts,
        mergedFiles: ipcResult.merged ? [] : [], // IPC doesn't return merged files
        message: ipcResult.error
          || (conflicts.length > 0
            ? `Merge has ${conflicts.length} conflict(s) that need resolution`
            : 'Merge completed successfully'),
      };

      set({ mergeResult: result, isMerging: false });

      // If successful, refresh worktrees
      if (result.success) {
        const { refreshWorktrees } = get();
        await refreshWorktrees();
      }
    } catch (error) {
      console.error('Merge failed:', error);
      set({
        mergeResult: {
          success: false,
          worktreeId: mergeWorktree.id,
          targetBranch: 'main',
          conflicts: [],
          mergedFiles: [],
          message: `Merge failed: ${error}`,
        },
        isMerging: false,
      });
    }
  },
  
  resolveConflict: (filePath, resolution) => {
    const { mergeResult } = get();
    if (!mergeResult) return;
    
    const updatedConflicts = mergeResult.conflicts.filter(c => c.filePath !== filePath);
    const resolvedFile = mergeResult.conflicts.find(c => c.filePath === filePath);
    
    set({
      mergeResult: {
        ...mergeResult,
        conflicts: updatedConflicts,
        mergedFiles: resolvedFile 
          ? [...mergeResult.mergedFiles, resolvedFile.filePath]
          : mergeResult.mergedFiles,
        success: updatedConflicts.length === 0,
        message: updatedConflicts.length === 0 
          ? 'All conflicts resolved. Merge completed.'
          : `${updatedConflicts.length} conflict(s) remaining`,
      },
    });
  },
  
  // Delete actions
  openDeleteDialog: (worktree) => set({ deleteDialogOpen: true, deleteWorktree: worktree }),
  closeDeleteDialog: () => set({ deleteDialogOpen: false, deleteWorktree: null }),
  
  confirmDelete: async () => {
    const { deleteWorktree } = get();
    if (!deleteWorktree) return;

    set({ isDeleting: true });

    try {
      const result = await window.electronAPI.worktree.delete({
        path: deleteWorktree.path,
        force: deleteWorktree.isDirty, // Force if has uncommitted changes
        deleteBranch: true,
      });

      if (!result.ok) {
        console.error('Failed to delete worktree:', result.error);
        set({ isDeleting: false });
        return;
      }

      // Refresh the list
      const { refreshWorktrees } = get();
      await refreshWorktrees();

      set({
        isDeleting: false,
        deleteDialogOpen: false,
        deleteWorktree: null,
        selectedWorktree: null,
      });
    } catch (error) {
      console.error('Delete failed:', error);
      set({ isDeleting: false });
    }
  },
  
  // Create actions (NEW)
  openCreateDialog: () => set({ createDialogOpen: true, createError: null }),
  closeCreateDialog: () => set({ createDialogOpen: false, availableBranches: [], createError: null }),

  loadBranches: async () => {
    set({ loadingBranches: true });
    try {
      const result = await window.electronAPI.worktree.listBranches(15);
      if (result.error) {
        console.error('Failed to load branches:', result.error);
        set({ availableBranches: [], loadingBranches: false });
        return;
      }
      set({ availableBranches: result.branches || [], loadingBranches: false });
    } catch (error) {
      console.error('Failed to load branches:', error);
      set({ availableBranches: [], loadingBranches: false });
    }
  },

  createWorktree: async (request) => {
    set({ isCreating: true, createError: null });
    try {
      // Generate branch name based on type
      const branchName = request.createGitBranch
        ? (request.type === 'task' ? `task/${request.name}` : `terminal/${request.name}`)
        : undefined;

      const result = await window.electronAPI.worktree.create({
        taskId: request.taskId ?? request.name,  // Pass actual task ID, not worktree name
        branchName: branchName ?? undefined,
        baseBranch: request.baseBranch,
      });

      if (result.error) {
        set({ isCreating: false, createError: result.error });
        return false;
      }

      // Refresh worktrees list
      const { refreshWorktrees, closeCreateDialog } = get();
      await refreshWorktrees();
      closeCreateDialog();
      set({ isCreating: false });
      return true;
    } catch (error) {
      console.error('Failed to create worktree:', error);
      set({ isCreating: false, createError: String(error) });
      return false;
    }
  },

  // Other actions
  openInExplorer: (worktree) => {
    // Use shell.openPath via IPC
    if (window.electronAPI?.shell?.openPath) {
      window.electronAPI.shell.openPath(worktree.path);
    } else {
      console.log('Opening in explorer:', worktree.path);
    }
  },

  openTerminal: (worktree) => {
    // Open terminal at worktree path via IPC
    if (window.electronAPI?.worktree?.openTerminal) {
      window.electronAPI.worktree.openTerminal(worktree.path);
    } else {
      console.log('Opening terminal at:', worktree.path);
    }
  },

  // Initialize - load real worktrees from IPC
  initialize: () => {
    const { refreshWorktrees } = get();
    refreshWorktrees();
  },
}));
