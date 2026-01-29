/**
 * CreateWorktreeDialog
 * Dialog for creating new worktrees with task association and branch selection
 */

import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  GitBranch,
  FolderGit2,
  RefreshCw,
  AlertTriangle,
  Terminal,
} from 'lucide-react';
import { useWorktreesStore } from '../../stores/worktrees-store';
import { useTaskStore } from '../../stores/task-store';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';

export function CreateWorktreeDialog() {
  const { isKuroryuu, isGrunge } = useIsThemedStyle();
  const {
    createDialogOpen,
    closeCreateDialog,
    availableBranches,
    loadingBranches,
    loadBranches,
    createWorktree,
    isCreating,
    createError,
  } = useWorktreesStore();

  const { tasks } = useTaskStore();
  const backlogTasks = tasks.filter(t => t.status === 'backlog');

  // Form state
  const [name, setName] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [baseBranch, setBaseBranch] = useState('main');
  const [createGitBranch, setCreateGitBranch] = useState(true);
  const [worktreeType, setWorktreeType] = useState<'task' | 'terminal'>('terminal');

  // Load branches when dialog opens
  useEffect(() => {
    if (createDialogOpen) {
      loadBranches();
    }
  }, [createDialogOpen, loadBranches]);

  // Set default branch when branches load
  useEffect(() => {
    const defaultBranch = availableBranches.find(b => b.isDefault);
    if (defaultBranch) {
      setBaseBranch(defaultBranch.name);
    }
  }, [availableBranches]);

  // Name validation regex (lowercase alphanumeric with hyphens)
  const nameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
  const isValidName = name.length >= 1 && nameRegex.test(name);
  const nameError = name.length > 0 && !isValidName
    ? 'Name must be lowercase alphanumeric with hyphens'
    : '';

  // Auto-fill name from task
  useEffect(() => {
    if (selectedTaskId) {
      const task = tasks.find(t => t.id === selectedTaskId);
      if (task) {
        const slugified = task.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 30);
        setName(slugified);
        setWorktreeType('task');
      }
    }
  }, [selectedTaskId, tasks]);

  const handleCreate = async () => {
    const success = await createWorktree({
      name,
      taskId: selectedTaskId,
      baseBranch,
      createGitBranch,
      type: worktreeType,
    });

    if (success) {
      // Reset form
      setName('');
      setSelectedTaskId(undefined);
      setCreateGitBranch(true);
      setWorktreeType('terminal');
    }
  };

  const handleClose = () => {
    closeCreateDialog();
    setName('');
    setSelectedTaskId(undefined);
    setCreateGitBranch(true);
    setWorktreeType('terminal');
  };

  const branchPrefix = worktreeType === 'task' ? 'task' : 'terminal';

  return (
    <Dialog.Root open={createDialogOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="md"
            className="w-[480px] overflow-hidden"
          >
            {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <FolderGit2 className="w-5 h-5 text-primary" />
              <Dialog.Title className="text-lg font-semibold text-foreground">
                Create Worktree
              </Dialog.Title>
            </div>
            <Dialog.Close className="p-2 hover:bg-secondary rounded-lg transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Worktree Type Selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Worktree Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setWorktreeType('terminal')}
                  className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                    worktreeType === 'terminal'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  <Terminal className="w-4 h-4" />
                  <span className="text-sm">Terminal</span>
                </button>
                <button
                  onClick={() => setWorktreeType('task')}
                  className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                    worktreeType === 'task'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  <FolderGit2 className="w-4 h-4" />
                  <span className="text-sm">Task</span>
                </button>
              </div>
            </div>

            {/* Name Input */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Worktree Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="e.g., add-user-auth"
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {nameError && (
                <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {nameError}
                </p>
              )}
            </div>

            {/* Task Association (Optional) */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Link to Task (Optional)
              </label>
              <select
                value={selectedTaskId || ''}
                onChange={(e) => setSelectedTaskId(e.target.value || undefined)}
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">No task association</option>
                {backlogTasks.map(task => (
                  <option key={task.id} value={task.id}>
                    {task.id}: {task.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Base Branch Selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Base Branch
              </label>
              {loadingBranches ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Loading branches...
                </div>
              ) : (
                <select
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {availableBranches.length === 0 ? (
                    <option value="main">main</option>
                  ) : (
                    availableBranches.map(branch => (
                      <option key={branch.name} value={branch.name}>
                        {branch.name} {branch.isDefault ? '(default)' : ''} {branch.isCurrent ? '(current)' : ''}
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            {/* Create Git Branch Toggle */}
            <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-foreground">Create new git branch</span>
              </div>
              <button
                onClick={() => setCreateGitBranch(!createGitBranch)}
                className={`w-10 h-5 rounded-full transition-colors ${
                  createGitBranch ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    createGitBranch ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {createGitBranch && (
              <p className="text-xs text-muted-foreground">
                Branch name: <code className="px-1 py-0.5 bg-muted rounded">{branchPrefix}/{name || 'name'}</code>
              </p>
            )}

            {/* Error Display */}
            {createError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {createError}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!isValidName || isCreating || !name}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderGit2 className="w-4 h-4" />
                  Create Worktree
                </>
              )}
            </button>
          </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
