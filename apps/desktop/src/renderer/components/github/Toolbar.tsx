/**
 * GitHub Desktop Toolbar Component
 * Top navigation bar with repository info, branch selector, and context-aware fetch/push/pull button
 */

import { GitBranch, RefreshCw, ChevronDown, ArrowUp, ArrowDown, Check, FolderOpen, Lock, BookMarked } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRepositoryStore } from '../../stores/repository-store';

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

function BranchDropdown({ onClose }: { onClose: () => void }) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { loadRepository, refreshStatus } = useRepositoryStore();

  useEffect(() => {
    (async () => {
      try {
        const result = await window.electronAPI?.git?.listBranches?.();
        if (result?.ok && result.branches) {
          setBranches(result.branches);
        }
      } catch (err) {
        console.error('Failed to list branches:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
        // Refresh everything after branch switch
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
