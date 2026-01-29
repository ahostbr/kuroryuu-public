/**
 * Worktrees Manager Component
 * Displays git worktrees and task-based worktrees with merge/delete actions
 */

import { useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  GitBranch,
  RefreshCw,
  Trash2,
  FolderOpen,
  FolderGit2,
  GitMerge,
  FileCode,
  Plus,
  Minus,
  Terminal,
  X,
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useWorktreesStore } from '../stores/worktrees-store';
import type { Worktree, MergeConflict } from '../types/worktree';
import { WORKTREE_STATUS_CONFIG } from '../types/worktree';
import { CreateWorktreeDialog } from './worktrees/CreateWorktreeDialog';
import { WorktreesList } from './github/WorktreesList';
import { ThemedFrame } from './ui/ThemedFrame';
import { useIsThemedStyle } from '../hooks/useTheme';

// ============================================================================
// Worktree Card Component
// ============================================================================

function WorktreeCard({
  worktree,
  isSelected,
  onSelect,
  onMerge,
  onDelete,
  onOpenExplorer,
  onOpenTerminal,
}: {
  worktree: Worktree;
  isSelected: boolean;
  onSelect: () => void;
  onMerge: () => void;
  onDelete: () => void;
  onOpenExplorer: () => void;
  onOpenTerminal: () => void;
}) {
  const statusConfig = WORKTREE_STATUS_CONFIG[worktree.status];
  const isTaskWorktree = worktree.type === 'task';

  const formatLastActivity = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div
      onClick={onSelect}
      className={`
        p-4 rounded-lg border cursor-pointer transition-all group
        ${isSelected 
          ? 'bg-secondary border-primary/50' 
          : 'bg-card/50 border-border hover:border-border'
        }
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {isTaskWorktree ? (
            <FolderGit2 className="w-5 h-5 text-primary" />
          ) : (
            <GitBranch className="w-5 h-5 text-purple-400" />
          )}
          <div>
            <h4 className="text-sm font-medium text-foreground">{worktree.branchName}</h4>
            {worktree.specName && (
              <p className="text-xs text-muted-foreground">{worktree.specName}</p>
            )}
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${statusConfig.bgColor} ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </div>

      {/* Task Link */}
      {worktree.taskTitle && (
        <div className="mb-3 p-2 bg-card rounded border border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ChevronRight className="w-3 h-3" />
            <span className="truncate">{worktree.taskTitle}</span>
          </div>
        </div>
      )}

      {/* Path */}
      <p className="text-xs text-muted-foreground truncate mb-3" title={worktree.path}>
        {worktree.path}
      </p>

      {/* Stats Row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
        {worktree.aheadBehind && (
          <>
            <span className="flex items-center gap-1">
              <Plus className="w-3 h-3 text-green-400" />
              {worktree.aheadBehind.ahead} ahead
            </span>
            <span className="flex items-center gap-1">
              <Minus className="w-3 h-3 text-red-400" />
              {worktree.aheadBehind.behind} behind
            </span>
          </>
        )}
        {worktree.uncommittedChanges !== undefined && worktree.uncommittedChanges > 0 && (
          <span className="flex items-center gap-1">
            <FileCode className="w-3 h-3 text-primary" />
            {worktree.uncommittedChanges} uncommitted
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {formatLastActivity(worktree.lastActivity)}
        </span>
        
        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onOpenExplorer(); }}
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title="Open in Explorer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenTerminal(); }}
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title="Open Terminal"
          >
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMerge(); }}
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title="Merge to main"
          >
            <GitMerge className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title="Delete worktree"
          >
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Merge Dialog Component
// ============================================================================

function ConflictItem({
  conflict,
  onResolve,
}: {
  conflict: MergeConflict;
  onResolve: (resolution: 'ours' | 'theirs') => void;
}) {
  return (
    <div className="p-3 bg-card rounded-lg border border-red-500/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-red-400" />
          <span className="text-sm text-foreground">{conflict.filePath}</span>
        </div>
        {conflict.lineNumbers && (
          <span className="text-xs text-muted-foreground">
            Lines {conflict.lineNumbers.start}-{conflict.lineNumbers.end}
          </span>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2 bg-secondary rounded text-xs">
          <p className="text-green-400 mb-1">Ours (current):</p>
          <code className="text-muted-foreground whitespace-pre-wrap break-all">
            {conflict.ourChanges?.slice(0, 100)}...
          </code>
        </div>
        <div className="p-2 bg-secondary rounded text-xs">
          <p className="text-blue-400 mb-1">Theirs (incoming):</p>
          <code className="text-muted-foreground whitespace-pre-wrap break-all">
            {conflict.theirChanges?.slice(0, 100)}...
          </code>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={() => onResolve('ours')}
          className="flex-1 px-3 py-1.5 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
        >
          Keep Ours
        </button>
        <button
          onClick={() => onResolve('theirs')}
          className="flex-1 px-3 py-1.5 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
        >
          Keep Theirs
        </button>
      </div>
    </div>
  );
}

function MergeDialog() {
  const { isKuroryuu, isGrunge } = useIsThemedStyle();
  const {
    mergeDialogOpen,
    mergeWorktree,
    mergeMode,
    mergeResult,
    isMerging,
    closeMergeDialog,
    setMergeMode,
    executeMerge,
    resolveConflict,
  } = useWorktreesStore();

  if (!mergeWorktree) return null;

  return (
    <Dialog.Root open={mergeDialogOpen} onOpenChange={(open) => !open && closeMergeDialog()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="lg"
            className="w-[600px] max-h-[80vh] overflow-hidden"
          >
            {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <GitMerge className="w-5 h-5 text-primary" />
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Merge Worktree
                </Dialog.Title>
                <p className="text-sm text-muted-foreground">{mergeWorktree.branchName} → main</p>
              </div>
            </div>
            <Dialog.Close className="p-2 hover:bg-secondary rounded-lg transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[calc(80vh-140px)]">
            {!mergeResult ? (
              <>
                {/* Merge Mode Toggle */}
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground mb-2">Merge Mode</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMergeMode('full')}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${
                        mergeMode === 'full'
                          ? 'bg-primary text-black'
                          : 'bg-secondary text-foreground hover:bg-muted'
                      }`}
                    >
                      Full Merge
                    </button>
                    <button
                      onClick={() => setMergeMode('stage-only')}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${
                        mergeMode === 'stage-only'
                          ? 'bg-primary text-black'
                          : 'bg-secondary text-foreground hover:bg-muted'
                      }`}
                    >
                      Stage Only
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {mergeMode === 'full' 
                      ? 'Merge and commit changes to main branch'
                      : 'Stage changes for review before committing'
                    }
                  </p>
                </div>

                {/* Worktree Info */}
                <div className="p-4 bg-card/50 rounded-lg border border-border mb-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Branch</p>
                      <p className="text-foreground">{mergeWorktree.branchName}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <p className={WORKTREE_STATUS_CONFIG[mergeWorktree.status].color}>
                        {WORKTREE_STATUS_CONFIG[mergeWorktree.status].label}
                      </p>
                    </div>
                    {mergeWorktree.aheadBehind && (
                      <>
                        <div>
                          <p className="text-muted-foreground">Ahead</p>
                          <p className="text-green-400">{mergeWorktree.aheadBehind.ahead} commits</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Behind</p>
                          <p className="text-red-400">{mergeWorktree.aheadBehind.behind} commits</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Warning for conflicts */}
                {mergeWorktree.status === 'conflict' && (
                  <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-4">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-red-400 font-medium">Potential Conflicts</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        This worktree has known conflicts. You may need to resolve them during merge.
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Merge Result */}
                {mergeResult.success ? (
                  <div className="text-center py-6">
                    <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="w-6 h-6 text-green-400" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">Merge Successful</h3>
                    <p className="text-sm text-muted-foreground mb-4">{mergeResult.message}</p>
                    
                    {mergeResult.mergedFiles.length > 0 && (
                      <div className="text-left p-3 bg-card rounded-lg">
                        <p className="text-xs text-muted-foreground mb-2">Merged Files:</p>
                        <ul className="space-y-1">
                          {mergeResult.mergedFiles.map(file => (
                            <li key={file} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Check className="w-3 h-3 text-green-400" />
                              {file}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-4">
                      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-red-400 font-medium">Conflicts Detected</p>
                        <p className="text-xs text-muted-foreground mt-1">{mergeResult.message}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      {mergeResult.conflicts.map(conflict => (
                        <ConflictItem
                          key={conflict.filePath}
                          conflict={conflict}
                          onResolve={(resolution) => resolveConflict(conflict.filePath, resolution)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
            <button
              onClick={closeMergeDialog}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {mergeResult?.success ? 'Close' : 'Cancel'}
            </button>
            {!mergeResult && (
              <button
                onClick={executeMerge}
                disabled={isMerging}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {isMerging ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <GitMerge className="w-4 h-4" />
                    Start Merge
                  </>
                )}
              </button>
            )}
          </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ============================================================================
// Delete Confirmation Dialog
// ============================================================================

function DeleteDialog() {
  const { isKuroryuu, isGrunge } = useIsThemedStyle();
  const {
    deleteDialogOpen,
    deleteWorktree,
    isDeleting,
    closeDeleteDialog,
    confirmDelete,
  } = useWorktreesStore();

  if (!deleteWorktree) return null;

  return (
    <AlertDialog.Root open={deleteDialogOpen} onOpenChange={(open) => !open && closeDeleteDialog()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="sm"
            className="w-[400px]"
          >
            <AlertDialog.Title className="text-lg font-semibold text-foreground mb-2">
            Delete Worktree
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-muted-foreground mb-4">
            Are you sure you want to delete the worktree <strong className="text-foreground">{deleteWorktree.branchName}</strong>? 
            This will remove the worktree directory and cannot be undone.
          </AlertDialog.Description>
          
          {deleteWorktree.uncommittedChanges && deleteWorktree.uncommittedChanges > 0 && (
            <div className="flex items-start gap-3 p-3 bg-primary/10 border border-primary/30 rounded-lg mb-4">
              <AlertTriangle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-primary">
                This worktree has {deleteWorktree.uncommittedChanges} uncommitted changes that will be lost.
              </p>
            </div>
          )}
          
          <div className="flex items-center justify-end gap-3">
            <AlertDialog.Cancel className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={confirmDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete
                </>
              )}
            </AlertDialog.Action>
          </div>
          </ThemedFrame>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

// ============================================================================
// Worktrees Content Component (for third tab)
// ============================================================================

function WorktreesContent() {
  const {
    worktrees,
    isLoading,
    selectedWorktree,
    selectWorktree,
    refreshWorktrees,
    openMergeDialog,
    openDeleteDialog,
    openInExplorer,
    openTerminal,
    openCreateDialog,
    initialize,
  } = useWorktreesStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Use new list-based layout matching GitHub Desktop aesthetic
  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--ghd-bg-primary)' }}>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="ghd-spinner" />
        </div>
      ) : (
        <WorktreesList
          worktrees={worktrees}
          selectedWorktree={selectedWorktree}
          onSelectWorktree={selectWorktree}
          onRefresh={refreshWorktrees}
          onCreate={openCreateDialog}
          onMerge={openMergeDialog}
          onDelete={openDeleteDialog}
          onOpenExplorer={openInExplorer}
          onOpenTerminal={openTerminal}
        />
      )}

      {/* Dialogs */}
      <MergeDialog />
      <DeleteDialog />
      <CreateWorktreeDialog />
    </div>
  );
}

// ============================================================================
// Main Worktrees Component (GitHub Desktop Clone)
// ============================================================================

import { RepositoryView } from './github/RepositoryView';

export function Worktrees() {
  return (
    <RepositoryView worktreesContent={<WorktreesContent />} />
  );
}
