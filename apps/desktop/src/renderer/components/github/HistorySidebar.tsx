/**
 * GitHub Desktop History Sidebar Component
 * Scrollable list of commits with relative timestamps and context menu
 */

import { GitCommit, Copy, RotateCcw, GitBranch, ExternalLink } from 'lucide-react';
import { useRepositoryStore } from '../../stores/repository-store';
import type { Commit } from '../../types/repository';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';

export function HistorySidebar() {
  const {
    commits,
    selectedCommit,
    isLoadingHistory,
    selectCommit,
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
            onSelect={() => selectCommit(commit)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Commit Item
// ============================================================================

interface CommitItemProps {
  commit: Commit;
  isSelected: boolean;
  onSelect: () => void;
}

function CommitItem({ commit, isSelected, onSelect }: CommitItemProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Format relative time
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
    // TODO: Implement branch creation dialog
    console.log('Create branch from commit:', commit.hash);
    setContextMenu(null);
  };

  return (
    <>
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
              {/* Copy SHA */}
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

              {/* Branch from commit */}
              <DropdownMenu.Item
                className="ghd-context-menu-item"
                onClick={handleCreateBranch}
              >
                <GitBranch className="ghd-context-menu-icon" />
                Create Branch from Commit
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="ghd-context-menu-separator" />

              {/* Revert */}
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
