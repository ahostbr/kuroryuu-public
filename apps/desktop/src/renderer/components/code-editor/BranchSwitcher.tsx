/**
 * BranchSwitcher - Git branch dropdown with create/pull/push actions
 * T412: Branch Switcher Component
 */

import { useState, useEffect, useRef } from 'react';
import { useCodeEditorStore } from '../../stores/code-editor-store';
import { toast } from '../ui/toaster';
import {
  GitBranch,
  ChevronDown,
  Plus,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  Cloud,
  CloudOff,
  Trash2,
  Check,
  X,
} from 'lucide-react';

export function BranchSwitcher() {
  const {
    currentBranch,
    branches,
    fetchBranches,
    checkoutBranch,
    createBranch,
    deleteBranch,
    pull,
    push,
    refreshGitStatus,
  } = useCodeEditorStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch branches on mount and when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchBranches();
    }
  }, [isOpen, fetchBranches]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowCreateForm(false);
        setBranchToDelete(null);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Get current branch info
  const currentBranchInfo = branches.find(b => b.isCurrent);

  // Handle branch checkout
  const handleCheckout = async (branchName: string) => {
    if (branchName === currentBranch) return;

    setIsLoading(true);
    const result = await checkoutBranch(branchName);
    setIsLoading(false);

    if (result.ok) {
      toast.success(`Switched to ${branchName}`);
      setIsOpen(false);
    } else {
      toast.error(`Failed to switch branch: ${result.error}`);
    }
  };

  // Handle create branch
  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;

    // Validate branch name
    const sanitized = newBranchName.trim().replace(/\s+/g, '-');
    if (!/^[a-zA-Z0-9_\-/.]+$/.test(sanitized)) {
      toast.error('Invalid branch name');
      return;
    }

    setIsLoading(true);
    const result = await createBranch(sanitized);
    setIsLoading(false);

    if (result.ok) {
      toast.success(`Created and switched to ${sanitized}`);
      setNewBranchName('');
      setShowCreateForm(false);
      setIsOpen(false);
    } else {
      toast.error(`Failed to create branch: ${result.error}`);
    }
  };

  // Handle delete branch
  const handleDeleteBranch = async (branchName: string, force: boolean = false) => {
    setIsLoading(true);
    const result = await deleteBranch(branchName, force);
    setIsLoading(false);

    if (result.ok) {
      toast.success(`Deleted branch ${branchName}`);
      setBranchToDelete(null);
    } else {
      if (result.error?.includes('not fully merged')) {
        // Offer force delete
        setBranchToDelete(branchName);
      } else {
        toast.error(`Failed to delete branch: ${result.error}`);
      }
    }
  };

  // Handle pull
  const handlePull = async () => {
    setIsLoading(true);
    const result = await pull();
    setIsLoading(false);

    if (result.ok) {
      toast.success('Pulled latest changes');
      await refreshGitStatus();
    } else {
      toast.error(`Pull failed: ${result.error}`);
    }
  };

  // Handle push
  const handlePush = async (setUpstream: boolean = false) => {
    setIsLoading(true);
    const result = await push(setUpstream);
    setIsLoading(false);

    if (result.ok) {
      toast.success('Pushed changes');
    } else {
      toast.error(`Push failed: ${result.error}`);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Branch button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-muted transition-colors disabled:opacity-50"
      >
        <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="font-medium">{currentBranch}</span>
        {currentBranchInfo && (
          <>
            {currentBranchInfo.ahead > 0 && (
              <span className="text-green-500 flex items-center gap-0.5">
                <ArrowUp className="w-3 h-3" />
                {currentBranchInfo.ahead}
              </span>
            )}
            {currentBranchInfo.behind > 0 && (
              <span className="text-yellow-500 flex items-center gap-0.5">
                <ArrowDown className="w-3 h-3" />
                {currentBranchInfo.behind}
              </span>
            )}
          </>
        )}
        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        {isLoading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          {/* Actions bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">Git Actions</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePull}
                disabled={isLoading || !currentBranchInfo?.hasRemote}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted transition-colors disabled:opacity-50"
                title="Pull"
              >
                <ArrowDown className="w-3 h-3" />
                Pull
              </button>
              <button
                onClick={() => handlePush(!currentBranchInfo?.hasRemote)}
                disabled={isLoading}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted transition-colors disabled:opacity-50"
                title={currentBranchInfo?.hasRemote ? 'Push' : 'Push (set upstream)'}
              >
                <ArrowUp className="w-3 h-3" />
                Push
              </button>
            </div>
          </div>

          {/* Create branch form */}
          {showCreateForm ? (
            <div className="px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="new-branch-name"
                  className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateBranch();
                    if (e.key === 'Escape') {
                      setShowCreateForm(false);
                      setNewBranchName('');
                    }
                  }}
                />
                <button
                  onClick={handleCreateBranch}
                  disabled={!newBranchName.trim() || isLoading}
                  className="p-1 rounded hover:bg-green-500/20 text-green-500 transition-colors disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewBranchName('');
                  }}
                  className="p-1 rounded hover:bg-red-500/20 text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-primary hover:bg-muted/50 transition-colors border-b border-border"
            >
              <Plus className="w-3.5 h-3.5" />
              Create new branch
            </button>
          )}

          {/* Force delete confirmation */}
          {branchToDelete && (
            <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30">
              <p className="text-xs text-red-500 mb-2">
                Branch "{branchToDelete}" is not fully merged. Force delete?
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDeleteBranch(branchToDelete, true)}
                  className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  Force Delete
                </button>
                <button
                  onClick={() => setBranchToDelete(null)}
                  className="px-2 py-1 text-xs bg-muted rounded hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Branch list */}
          <div className="max-h-64 overflow-y-auto">
            {branches.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />
                Loading branches...
              </div>
            ) : (
              branches.map((branch) => (
                <div
                  key={branch.name}
                  className={`flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors group ${
                    branch.isCurrent ? 'bg-primary/10' : ''
                  }`}
                >
                  <button
                    onClick={() => handleCheckout(branch.name)}
                    disabled={branch.isCurrent || isLoading}
                    className="flex-1 flex items-center gap-2 text-left disabled:cursor-default"
                  >
                    {/* Current indicator */}
                    <div className={`w-1.5 h-1.5 rounded-full ${branch.isCurrent ? 'bg-primary' : 'bg-transparent'}`} />

                    {/* Branch name */}
                    <span className={branch.isCurrent ? 'font-medium text-primary' : ''}>
                      {branch.name}
                    </span>

                    {/* Remote status */}
                    {branch.hasRemote ? (
                      <span title={`Tracks ${branch.upstream}`}>
                        <Cloud className="w-3 h-3 text-muted-foreground/50" />
                      </span>
                    ) : (
                      <span title="No remote">
                        <CloudOff className="w-3 h-3 text-muted-foreground/30" />
                      </span>
                    )}

                    {/* Ahead/behind */}
                    {(branch.ahead > 0 || branch.behind > 0) && (
                      <span className="flex items-center gap-1 ml-auto text-muted-foreground">
                        {branch.ahead > 0 && (
                          <span className="text-green-500 flex items-center">
                            <ArrowUp className="w-3 h-3" />
                            {branch.ahead}
                          </span>
                        )}
                        {branch.behind > 0 && (
                          <span className="text-yellow-500 flex items-center">
                            <ArrowDown className="w-3 h-3" />
                            {branch.behind}
                          </span>
                        )}
                      </span>
                    )}
                  </button>

                  {/* Delete button (not for current branch) */}
                  {!branch.isCurrent && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBranch(branch.name);
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-500 transition-all"
                      title="Delete branch"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer with branch count */}
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border bg-muted/30">
            {branches.length} branch{branches.length !== 1 ? 'es' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
