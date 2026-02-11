/**
 * GitHub Desktop History Sidebar Component
 * Scrollable list of commits with expandable inline details and file list
 */

import { GitCommit, Copy, RotateCcw, GitBranch, User, Calendar, FileText } from 'lucide-react';
import { useRepositoryStore } from '../../stores/repository-store';
import type { Commit, CommitDetails, CommitFile } from '../../types/repository';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';

export function HistorySidebar() {
  const {
    commits,
    selectedCommit,
    selectedCommitDetails,
    isLoadingHistory,
    isLoadingCommitDetails,
    selectCommit,
    selectedHistoryFile,
    loadCommitFileDiff,
  } = useRepositoryStore();

  if (isLoadingHistory) {
    return (
      <div className="ghd-sidebar">
        <div className="ghd-loading" style={{ flex: 1 }}>
          <div className="ghd-spinner" />
        </div>
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="ghd-sidebar">
        <div className="ghd-empty-state">
          <GitCommit size={48} className="ghd-empty-state-icon" />
          <div className="ghd-empty-state-title">No commits</div>
          <div className="ghd-empty-state-description">
            This repository has no commit history yet
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ghd-sidebar">
      <div className="ghd-commit-list">
        {commits.map((commit) => (
          <CommitItem
            key={commit.hash}
            commit={commit}
            isSelected={selectedCommit?.hash === commit.hash}
            details={selectedCommit?.hash === commit.hash ? selectedCommitDetails : null}
            isLoadingDetails={selectedCommit?.hash === commit.hash && isLoadingCommitDetails}
            selectedFilePath={selectedHistoryFile}
            onSelect={() => {
              if (selectedCommit?.hash === commit.hash) {
                selectCommit(null); // toggle collapse
              } else {
                selectCommit(commit);
              }
            }}
            onFileSelect={(filePath) => loadCommitFileDiff(commit.hash, filePath)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Commit Item (with expandable details)
// ============================================================================

interface CommitItemProps {
  commit: Commit;
  isSelected: boolean;
  details: CommitDetails | null;
  isLoadingDetails: boolean;
  selectedFilePath: string | null;
  onSelect: () => void;
  onFileSelect: (filePath: string) => void;
}

function CommitItem({ commit, isSelected, details, isLoadingDetails, selectedFilePath, onSelect, onFileSelect }: CommitItemProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
    if (weeks < 4) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    return `${months} month${months !== 1 ? 's' : ''} ago`;
  };

  const formatDate = (timestamp?: number, dateStr?: string) => {
    if (timestamp) {
      return new Date(timestamp).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (dateStr) {
      return new Date(dateStr).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    return 'Unknown date';
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCopySHA = () => {
    navigator.clipboard.writeText(commit.hash);
    setContextMenu(null);
  };

  const handleCopyShortSHA = () => {
    navigator.clipboard.writeText(commit.shortHash);
    setContextMenu(null);
  };

  const handleRevertCommit = async () => {
    try {
      await (window.electronAPI?.git as {
        revertCommit?: (hash: string) => Promise<{ success: boolean; error?: string }>;
      })?.revertCommit?.(commit.hash);
      setContextMenu(null);
    } catch (error) {
      console.error('Failed to revert commit:', error);
    }
  };

  const handleCreateBranch = () => {
    console.log('Create branch from commit:', commit.hash);
    setContextMenu(null);
  };

  const statusColors: Record<string, string> = {
    new: 'var(--ghd-status-new)',
    modified: 'var(--ghd-status-modified)',
    deleted: 'var(--ghd-status-deleted)',
    renamed: 'var(--ghd-status-renamed)',
  };

  // Type guard for files
  const hasFiles = (d: CommitDetails | null): d is CommitDetails =>
    d !== null && 'files' in d && Array.isArray(d.files);

  return (
    <>
      {/* Commit summary row (always visible) */}
      <div
        className={`ghd-commit-item ${isSelected ? 'selected' : ''}`}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
      >
        <div className="ghd-commit-message" title={commit.message}>
          {commit.summary}
        </div>
        <div className="ghd-commit-meta">
          <span className="ghd-commit-hash">{commit.shortHash}</span>
          <span>-</span>
          <span>{formatRelativeTime(commit.timestamp)}</span>
        </div>
      </div>

      {/* Expanded details (only when selected) */}
      {isSelected && (
        <div style={{
          background: 'var(--ghd-bg-primary)',
          borderBottom: '1px solid var(--ghd-border)',
          fontSize: 'var(--ghd-font-size-sm)',
        }}>
          {isLoadingDetails ? (
            <div style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
              <div className="ghd-spinner" />
            </div>
          ) : (
            <>
              {/* Commit meta */}
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid var(--ghd-border)' }}>
                {details?.author && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ghd-text-secondary)' }}>
                    <User size={12} />
                    <span>{details.author.name}</span>
                    <span style={{ color: 'var(--ghd-text-muted)' }}>
                      &lt;{details.author.email}&gt;
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ghd-text-muted)' }}>
                  <Calendar size={12} />
                  <span>{formatDate(details?.timestamp || commit.timestamp, details?.author?.date)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ghd-text-muted)' }}>
                  <GitCommit size={12} />
                  <span style={{ fontFamily: 'var(--ghd-font-mono)' }}>{commit.shortHash}</span>
                </div>
              </div>

              {/* Full message body (if different from summary) */}
              {details?.message && String(details.message).trim() !== details.summary && (
                <div style={{
                  padding: '8px 12px',
                  color: 'var(--ghd-text-secondary)',
                  whiteSpace: 'pre-wrap',
                  fontSize: 'var(--ghd-font-size-xs)',
                  borderBottom: '1px solid var(--ghd-border)',
                }}>
                  {String(details.message).trim()}
                </div>
              )}

              {/* Files changed */}
              {hasFiles(details) && details.files.length > 0 && (
                <div>
                  <div style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--ghd-text-muted)',
                  }}>
                    Files changed ({details.files.length})
                  </div>
                  {details.files.map((file: CommitFile) => (
                    <button
                      key={file.path}
                      onClick={(e) => { e.stopPropagation(); onFileSelect(file.path); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '5px 12px',
                        background: selectedFilePath === file.path ? 'var(--ghd-bg-active)' : 'transparent',
                        border: 'none',
                        color: 'var(--ghd-text-primary)',
                        fontSize: 'var(--ghd-font-size-xs)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedFilePath !== file.path) e.currentTarget.style.background = 'var(--ghd-bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = selectedFilePath === file.path ? 'var(--ghd-bg-active)' : 'transparent';
                      }}
                    >
                      <FileText
                        size={12}
                        style={{ color: statusColors[file.status] || 'var(--ghd-text-muted)', flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.path}
                      </span>
                      <span style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        {file.additions > 0 && (
                          <span style={{ color: 'var(--ghd-diff-add-text)' }}>+{file.additions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span style={{ color: 'var(--ghd-diff-del-text)' }}>-{file.deletions}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Context Menu */}
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
                onClick={handleCopySHA}
              >
                <Copy className="ghd-context-menu-icon" />
                Copy Full SHA
              </DropdownMenu.Item>

              <DropdownMenu.Item
                className="ghd-context-menu-item"
                onClick={handleCopyShortSHA}
              >
                <Copy className="ghd-context-menu-icon" />
                Copy Short SHA
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="ghd-context-menu-separator" />

              <DropdownMenu.Item
                className="ghd-context-menu-item"
                onClick={handleCreateBranch}
              >
                <GitBranch className="ghd-context-menu-icon" />
                Create Branch from Commit
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="ghd-context-menu-separator" />

              <DropdownMenu.Item
                className="ghd-context-menu-item danger"
                onClick={handleRevertCommit}
              >
                <RotateCcw className="ghd-context-menu-icon" />
                Revert This Commit
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </>
  );
}
