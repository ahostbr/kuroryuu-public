/**
 * GitHub Desktop Toolbar Component
 * Top navigation bar with repository info, branch selector, and context-aware fetch/push/pull button
 */

import { GitBranch, RefreshCw, ChevronDown, ArrowUp, ArrowDown, Check, FolderOpen, Lock, BookMarked, Plus, Pencil, Copy, Trash2 } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useRepositoryStore } from '../../stores/repository-store';
import { showConfirm, showDestructive, showAlert } from '../../stores/dialog-store';

// ============================================================================
// Branch Dropdown
// ============================================================================

interface BranchInfo {
  name: string;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  hasRemote: boolean;
}

/**
 * Sanitize a branch name following git's rules:
 * No spaces, no ~^:?*[\], no leading dot, no trailing .lock, etc.
 */
function sanitizeBranchName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/[~^:?*[\]\\]/g, '-')
    .replace(/^\./, '')
    .replace(/\/$/, '')
    .replace(/\.$/, '')
    .replace(/\.lock$/i, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/** Input field for branch name with live sanitization feedback */
function BranchNameInput({
  defaultValue,
  onChange,
  placeholder,
}: {
  defaultValue?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue || '');
  const [sanitized, setSanitized] = useState(defaultValue || '');

  const handleChange = (raw: string) => {
    setValue(raw);
    const clean = sanitizeBranchName(raw);
    setSanitized(clean);
    onChange(clean);
  };

  // Fire onChange for defaultValue on mount
  useEffect(() => {
    if (defaultValue) onChange(sanitizeBranchName(defaultValue));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ marginTop: '12px' }}>
      <label style={{ display: 'block', fontSize: '13px', color: 'var(--ghd-text-secondary)', marginBottom: '6px' }}>
        Branch name
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder || 'new-branch-name'}
        autoFocus
        style={{
          width: '100%',
          padding: '8px 10px',
          background: 'var(--ghd-bg-primary)',
          border: '1px solid var(--ghd-border)',
          borderRadius: '4px',
          color: 'var(--ghd-text-primary)',
          fontSize: '14px',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {value !== sanitized && sanitized && (
        <div style={{ fontSize: '11px', color: 'var(--ghd-text-muted)', marginTop: '4px' }}>
          Will be created as: <strong>{sanitized}</strong>
        </div>
      )}
      {value && !sanitized && (
        <div style={{ fontSize: '11px', color: 'var(--ghd-accent-red, #f85149)', marginTop: '4px' }}>
          Invalid branch name
        </div>
      )}
    </div>
  );
}

/** Message body for delete branch dialog with optional remote checkbox */
function DeleteBranchMessage({
  branchName,
  hasRemote,
  onRemoteChange,
}: {
  branchName: string;
  hasRemote: boolean;
  onRemoteChange: (v: boolean) => void;
}) {
  const [deleteRemote, setDeleteRemote] = useState(false);

  return (
    <div>
      <p style={{ margin: 0 }}>
        Are you sure you want to delete the branch <strong>{branchName}</strong>?
      </p>
      <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--ghd-text-muted)' }}>
        This action cannot be undone.
      </p>
      {hasRemote && (
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '12px',
          fontSize: '13px',
          color: 'var(--ghd-text-secondary)',
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={deleteRemote}
            onChange={(e) => {
              setDeleteRemote(e.target.checked);
              onRemoteChange(e.target.checked);
            }}
          />
          Also delete the remote branch on origin
        </label>
      )}
    </div>
  );
}

function BranchDropdown({ onClose }: { onClose: () => void }) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { loadRepository, refreshStatus } = useRepositoryStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; branch: BranchInfo } | null>(null);

  const refreshBranches = useCallback(async () => {
    try {
      const result = await window.electronAPI?.git?.listBranches?.();
      if (result?.ok && result.branches) {
        setBranches(result.branches);
      }
    } catch (err) {
      console.error('Failed to list branches:', err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshBranches();
      setLoading(false);
    })();
  }, [refreshBranches]);

  // Focus filter input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const handleCheckout = useCallback(async (branchName: string) => {
    try {
      const result = await window.electronAPI?.git?.checkout?.(branchName);
      if (result?.ok) {
        await loadRepository();
        await refreshStatus();
        onClose();
      } else {
        console.error('Checkout failed:', result?.error);
      }
    } catch (err) {
      console.error('Checkout error:', err);
    }
  }, [loadRepository, refreshStatus, onClose]);

  const handleCreateBranch = useCallback(async () => {
    let branchName = '';
    const confirmed = await showConfirm(
      'Create a Branch',
      <BranchNameInput onChange={(v) => { branchName = v; }} placeholder="my-new-branch" />,
      { confirmLabel: 'Create Branch', cancelLabel: 'Cancel' },
    );
    if (confirmed && branchName) {
      try {
        const result = await window.electronAPI?.git?.createBranch?.(branchName, true);
        if (result?.ok) {
          await loadRepository();
          await refreshStatus();
          await refreshBranches();
        } else {
          await showAlert('Create Branch Failed', result?.error || 'Unknown error');
        }
      } catch (err) {
        await showAlert('Create Branch Failed', String(err));
      }
    }
  }, [loadRepository, refreshStatus, refreshBranches]);

  const handleDeleteBranch = useCallback(async (branch: BranchInfo) => {
    setContextMenu(null);
    let deleteRemote = false;
    const confirmed = await showDestructive(
      'Delete Branch',
      <DeleteBranchMessage
        branchName={branch.name}
        hasRemote={branch.hasRemote}
        onRemoteChange={(v) => { deleteRemote = v; }}
      />,
      { confirmLabel: 'Delete', cancelLabel: 'Cancel' },
    );
    if (confirmed) {
      try {
        const result = await window.electronAPI?.git?.deleteBranch?.(branch.name, false);
        if (!result?.ok) {
          // Branch not fully merged — offer force delete
          const forceConfirmed = await showDestructive(
            'Branch Not Fully Merged',
            `The branch "${branch.name}" is not fully merged. Force delete anyway?`,
            { confirmLabel: 'Force Delete', cancelLabel: 'Cancel' },
          );
          if (forceConfirmed) {
            await window.electronAPI?.git?.deleteBranch?.(branch.name, true);
          } else {
            return;
          }
        }
        if (deleteRemote && branch.hasRemote) {
          const git = window.electronAPI?.git as { deleteRemoteBranch?: (name: string, remote?: string) => Promise<{ ok: boolean; error?: string }> };
          await git?.deleteRemoteBranch?.(branch.name);
        }
        await refreshBranches();
        await loadRepository();
      } catch (err) {
        await showAlert('Delete Failed', String(err));
      }
    }
  }, [refreshBranches, loadRepository]);

  const handleRenameBranch = useCallback(async (branch: BranchInfo) => {
    setContextMenu(null);
    let newName = '';

    const messageContent = (
      <div>
        {branch.hasRemote && (
          <p style={{ color: 'var(--ghd-accent-yellow, #d29922)', fontSize: '12px', margin: '0 0 8px' }}>
            This branch tracks a remote. Renaming locally will not rename the remote branch.
          </p>
        )}
        <BranchNameInput
          defaultValue={branch.name}
          onChange={(v) => { newName = v; }}
        />
      </div>
    );

    const confirmed = await showConfirm(
      'Rename Branch',
      messageContent,
      { confirmLabel: 'Rename', cancelLabel: 'Cancel' },
    );
    if (confirmed && newName && newName !== branch.name) {
      try {
        const git = window.electronAPI?.git as { renameBranch?: (old: string, n: string) => Promise<{ ok: boolean; error?: string }> };
        const result = await git?.renameBranch?.(branch.name, newName);
        if (result?.ok) {
          await refreshBranches();
          await loadRepository();
        } else {
          await showAlert('Rename Failed', result?.error || 'Unknown error');
        }
      } catch (err) {
        await showAlert('Rename Failed', String(err));
      }
    }
  }, [refreshBranches, loadRepository]);

  const handleCopyBranchName = useCallback((name: string) => {
    navigator.clipboard.writeText(name);
    setContextMenu(null);
  }, []);

  const handleBranchContextMenu = useCallback((e: React.MouseEvent, branch: BranchInfo) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, branch });
  }, []);

  const filtered = branches.filter(b =>
    b.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        minWidth: '250px',
        background: 'var(--ghd-bg-secondary)',
        border: '1px solid var(--ghd-border)',
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
      {/* Filter */}
      <div style={{ padding: '8px', borderBottom: '1px solid var(--ghd-border)' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Filter branches..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: 'var(--ghd-bg-primary)',
            border: '1px solid var(--ghd-border)',
            borderRadius: '4px',
            color: 'var(--ghd-text-primary)',
            fontSize: 'var(--ghd-font-size-sm)',
            outline: 'none',
          }}
        />
      </div>

      {/* New branch button */}
      <button
        onClick={handleCreateBranch}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--ghd-border)',
          color: 'var(--ghd-accent-blue, #58a6ff)',
          fontSize: 'var(--ghd-font-size-sm)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ghd-bg-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <Plus size={14} />
        New branch
      </button>

      {/* Branch list */}
      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '12px', color: 'var(--ghd-text-muted)', textAlign: 'center', fontSize: 'var(--ghd-font-size-sm)' }}>
            Loading branches...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '12px', color: 'var(--ghd-text-muted)', textAlign: 'center', fontSize: 'var(--ghd-font-size-sm)' }}>
            No branches found
          </div>
        ) : (
          filtered.map((branch) => (
            <button
              key={branch.name}
              onClick={() => !branch.isCurrent && handleCheckout(branch.name)}
              onContextMenu={(e) => handleBranchContextMenu(e, branch)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '8px 12px',
                background: branch.isCurrent ? 'var(--ghd-bg-active)' : 'transparent',
                border: 'none',
                color: 'var(--ghd-text-primary)',
                fontSize: 'var(--ghd-font-size-sm)',
                cursor: branch.isCurrent ? 'default' : 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (!branch.isCurrent) (e.currentTarget.style.background = 'var(--ghd-bg-hover)');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = branch.isCurrent ? 'var(--ghd-bg-active)' : 'transparent';
              }}
            >
              <span style={{ width: '16px', flexShrink: 0 }}>
                {branch.isCurrent && <Check size={14} style={{ color: 'var(--ghd-accent-green)' }} />}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {branch.name}
              </span>
              {/* Ahead/behind badges */}
              {branch.ahead > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--ghd-accent-green)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <ArrowUp size={10} />{branch.ahead}
                </span>
              )}
              {branch.behind > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--ghd-accent-blue)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <ArrowDown size={10} />{branch.behind}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <DropdownMenu.Root
          open={true}
          onOpenChange={(open) => !open && setContextMenu(null)}
        >
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="ghd-context-menu"
              style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y }}
              onInteractOutside={() => setContextMenu(null)}
              onEscapeKeyDown={() => setContextMenu(null)}
            >
              <DropdownMenu.Item
                className="ghd-context-menu-item"
                disabled={contextMenu.branch.isCurrent}
                onClick={() => handleRenameBranch(contextMenu.branch)}
              >
                <Pencil className="ghd-context-menu-icon" />
                Rename...
              </DropdownMenu.Item>

              <DropdownMenu.Item
                className="ghd-context-menu-item"
                onClick={() => handleCopyBranchName(contextMenu.branch.name)}
              >
                <Copy className="ghd-context-menu-icon" />
                Copy Branch Name
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="ghd-context-menu-separator" />

              <DropdownMenu.Item
                className={`ghd-context-menu-item ${contextMenu.branch.isCurrent ? '' : 'danger'}`}
                disabled={contextMenu.branch.isCurrent}
                onClick={() => handleDeleteBranch(contextMenu.branch)}
              >
                <Trash2 className="ghd-context-menu-icon" />
                Delete...
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  );
}

// ============================================================================
// Repo Info Popover
// ============================================================================

interface GitHubRepoItem {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
}

function RepoInfoPopover({ repoPath, repoName, onClose }: { repoPath: string; repoName: string; onClose: () => void }) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState('');
  const [repos, setRepos] = useState<GitHubRepoItem[]>([]);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  // Outside click to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Fetch repos on mount
  useEffect(() => {
    (async () => {
      try {
        const isConnected = await window.electronAPI?.auth?.github?.isConnected?.();
        setConnected(!!isConnected);
        if (!isConnected) { setLoading(false); return; }

        const [user, repoList] = await Promise.all([
          window.electronAPI?.auth?.github?.getUser?.(),
          window.electronAPI?.auth?.github?.listRepos?.({ sort: 'full_name', per_page: 100 }),
        ]);

        if (user?.login) setUsername(user.login);
        if (Array.isArray(repoList)) setRepos(repoList);
      } catch (err) {
        console.error('Failed to fetch GitHub repos:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Focus filter input
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = repos.filter(r =>
    r.name.toLowerCase().includes(filter.toLowerCase())
  );

  const currentRepoLower = repoName.toLowerCase();

  const handleOpenExplorer = async () => {
    try {
      await window.electronAPI?.shell?.openPath?.(repoPath);
    } catch {
      console.error('Failed to open path');
    }
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        minWidth: '280px',
        background: 'var(--ghd-bg-secondary)',
        border: '1px solid var(--ghd-border)',
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
      {/* Filter */}
      <div style={{ padding: '8px', borderBottom: '1px solid var(--ghd-border)' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Filter repositories..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: 'var(--ghd-bg-primary)',
            border: '1px solid var(--ghd-border)',
            borderRadius: '4px',
            color: 'var(--ghd-text-primary)',
            fontSize: 'var(--ghd-font-size-sm)',
            outline: 'none',
          }}
        />
      </div>

      {/* Repo list */}
      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '12px', color: 'var(--ghd-text-muted)', textAlign: 'center', fontSize: 'var(--ghd-font-size-sm)' }}>
            Loading repositories...
          </div>
        ) : !connected ? (
          <div style={{ padding: '12px', color: 'var(--ghd-text-muted)', textAlign: 'center', fontSize: 'var(--ghd-font-size-sm)' }}>
            Sign in to GitHub to see your repos
          </div>
        ) : (
          <>
            {/* Account header */}
            {username && (
              <div style={{
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--ghd-text-muted)',
                textTransform: 'lowercase',
              }}>
                {username}
              </div>
            )}
            {filtered.length === 0 ? (
              <div style={{ padding: '12px', color: 'var(--ghd-text-muted)', textAlign: 'center', fontSize: 'var(--ghd-font-size-sm)' }}>
                No repositories found
              </div>
            ) : (
              filtered.map((repo) => {
                const isCurrent = repo.name.toLowerCase() === currentRepoLower
                  || repo.name.toLowerCase() === currentRepoLower.replace(/-master$/, '')
                  || repo.name.toLowerCase() === currentRepoLower.replace(/-main$/, '');
                return (
                  <div
                    key={repo.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '7px 12px',
                      background: isCurrent ? 'var(--ghd-bg-active)' : 'transparent',
                      color: 'var(--ghd-text-primary)',
                      fontSize: 'var(--ghd-font-size-sm)',
                    }}
                  >
                    {repo.private
                      ? <Lock size={14} style={{ color: 'var(--ghd-text-muted)', flexShrink: 0 }} />
                      : <BookMarked size={14} style={{ color: 'var(--ghd-text-muted)', flexShrink: 0 }} />
                    }
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {repo.name}
                    </span>
                    {isCurrent && (
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--ghd-accent-blue, #58a6ff)',
                        flexShrink: 0,
                      }} />
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* Open in Explorer */}
      <div style={{ borderTop: '1px solid var(--ghd-border)' }}>
        <button
          onClick={handleOpenExplorer}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            padding: '10px 12px',
            background: 'transparent',
            border: 'none',
            color: 'var(--ghd-text-primary)',
            fontSize: 'var(--ghd-font-size-sm)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ghd-bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <FolderOpen size={14} style={{ color: 'var(--ghd-text-secondary)' }} />
          Open in Explorer
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Toolbar
// ============================================================================

export function Toolbar() {
  const {
    repository,
    currentBranch,
    lastFetched,
    isFetching,
    isPushing,
    isPulling,
    fetchOrigin,
    pushOrigin,
    pullOrigin,
  } = useRepositoryStore();

  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [showRepoPopover, setShowRepoPopover] = useState(false);

  const ahead = currentBranch?.ahead || 0;
  const behind = currentBranch?.behind || 0;

  // Determine which action the right button should perform
  const isBusy = isFetching || isPushing || isPulling;

  let actionLabel = 'Fetch origin';
  let actionIcon = <RefreshCw size={16} style={{ color: 'var(--ghd-text-secondary)' }} className={isFetching ? 'animate-spin' : ''} />;
  let actionHandler = fetchOrigin;
  let actionSubLabel = formatLastFetched(lastFetched);

  if (isPushing) {
    actionLabel = 'Pushing...';
    actionIcon = <ArrowUp size={16} style={{ color: 'var(--ghd-accent-green)' }} className="animate-pulse" />;
  } else if (isPulling) {
    actionLabel = 'Pulling...';
    actionIcon = <ArrowDown size={16} style={{ color: 'var(--ghd-accent-blue)' }} className="animate-pulse" />;
  } else if (ahead > 0) {
    actionLabel = `Push origin`;
    actionSubLabel = `${ahead} commit${ahead !== 1 ? 's' : ''} ahead`;
    actionIcon = <ArrowUp size={16} style={{ color: 'var(--ghd-accent-green)' }} />;
    actionHandler = pushOrigin;
  } else if (behind > 0) {
    actionLabel = `Pull origin`;
    actionSubLabel = `${behind} commit${behind !== 1 ? 's' : ''} behind`;
    actionIcon = <ArrowDown size={16} style={{ color: 'var(--ghd-accent-blue)' }} />;
    actionHandler = pullOrigin;
  }

  return (
    <div className="ghd-toolbar">
      {/* Repository Section */}
      <div className="ghd-toolbar-section" style={{ minWidth: '180px', position: 'relative' }}>
        <button
          className="ghd-toolbar-dropdown"
          onClick={() => setShowRepoPopover(!showRepoPopover)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span className="ghd-toolbar-dropdown-label">Current repository</span>
            <span className="ghd-toolbar-dropdown-value">
              {repository?.name || 'No repository'}
            </span>
          </div>
          <ChevronDown size={16} style={{ color: 'var(--ghd-text-secondary)' }} />
        </button>
        {showRepoPopover && repository?.path && (
          <RepoInfoPopover
            repoPath={repository.path}
            repoName={repository.name || ''}
            onClose={() => setShowRepoPopover(false)}
          />
        )}
      </div>

      {/* Branch Section */}
      <div className="ghd-toolbar-section" style={{ minWidth: '180px', position: 'relative' }}>
        <button
          className="ghd-toolbar-dropdown"
          onClick={() => setShowBranchDropdown(!showBranchDropdown)}
        >
          <GitBranch size={16} style={{ color: 'var(--ghd-text-secondary)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span className="ghd-toolbar-dropdown-label">Current branch</span>
            <span className="ghd-toolbar-dropdown-value">
              {currentBranch?.name || 'No branch'}
            </span>
          </div>
          <ChevronDown size={16} style={{ color: 'var(--ghd-text-secondary)' }} />
        </button>
        {showBranchDropdown && (
          <BranchDropdown onClose={() => setShowBranchDropdown(false)} />
        )}
      </div>

      {/* Fetch / Push / Pull Section */}
      <div className="ghd-toolbar-section" style={{ flex: 1, justifyContent: 'flex-start', borderRight: 'none' }}>
        <button
          className="ghd-toolbar-dropdown"
          onClick={actionHandler}
          disabled={isBusy}
          style={{ gap: '12px' }}
        >
          {actionIcon}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span className="ghd-toolbar-dropdown-value">
              {actionLabel}
            </span>
            <span className="ghd-toolbar-dropdown-label">
              {actionSubLabel}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatLastFetched(lastFetched: Date | null): string {
  if (!lastFetched) return 'Never fetched';

  const now = new Date();
  const diff = now.getTime() - lastFetched.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Last fetched just now';
  if (minutes < 60) return `Last fetched ${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `Last fetched ${hours} hour${hours !== 1 ? 's' : ''} ago`;
  return `Last fetched ${days} day${days !== 1 ? 's' : ''} ago`;
}
