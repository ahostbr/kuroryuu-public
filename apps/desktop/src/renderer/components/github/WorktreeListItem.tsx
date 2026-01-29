/**
 * Worktree List Item Component
 * Single-row worktree display with context menu for GitHub Desktop clone
 */

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  FolderGit2,
  GitBranch,
  Terminal,
  FolderOpen,
  GitMerge,
  Trash2,
} from 'lucide-react';
import type { Worktree, WorktreeStatus } from '../../types/worktree';

interface WorktreeListItemProps {
  worktree: Worktree;
  isSelected: boolean;
  onSelect: () => void;
  onOpenExplorer: () => void;
  onOpenTerminal: () => void;
  onMerge: () => void;
  onDelete: () => void;
}

// Status config with Kuroryuu theme colors
const STATUS_CONFIG: Record<WorktreeStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'ghd-worktree-status clean' },
  idle: { label: 'Idle', className: 'ghd-worktree-status clean' },
  dirty: { label: 'Dirty', className: 'ghd-worktree-status dirty' },
  conflict: { label: 'Conflict', className: 'ghd-worktree-status detached' },
  stale: { label: 'Stale', className: 'ghd-worktree-status dirty' },
};

export function WorktreeListItem({
  worktree,
  isSelected,
  onSelect,
  onOpenExplorer,
  onOpenTerminal,
  onMerge,
  onDelete,
}: WorktreeListItemProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const isTaskWorktree = worktree.type === 'task';
  const statusConfig = STATUS_CONFIG[worktree.status];

  // Truncate path for display
  const truncatePath = (path: string, maxLength: number = 40) => {
    if (path.length <= maxLength) return path;
    return '...' + path.slice(-(maxLength - 3));
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        className={`ghd-worktree-item ${isSelected ? 'selected' : ''}`}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
      >
        {/* Icon */}
        <span className="ghd-worktree-icon">
          {isTaskWorktree ? (
            <FolderGit2 size={20} />
          ) : worktree.type === 'terminal' ? (
            <Terminal size={20} />
          ) : (
            <GitBranch size={20} />
          )}
        </span>

        {/* Name */}
        <span className="ghd-worktree-name">
          {worktree.branchName}
          {worktree.specName && (
            <span style={{ color: 'var(--ghd-text-muted)', marginLeft: '4px' }}>
              / {worktree.specName}
            </span>
          )}
        </span>

        {/* Path */}
        <span className="ghd-worktree-path" title={worktree.path}>
          {truncatePath(worktree.path)}
        </span>

        {/* Stats */}
        {worktree.aheadBehind && (
          <span className="ghd-worktree-stats">
            {worktree.aheadBehind.ahead > 0 && (
              <span className="ahead">+{worktree.aheadBehind.ahead}</span>
            )}
            {worktree.aheadBehind.behind > 0 && (
              <span className="behind">-{worktree.aheadBehind.behind}</span>
            )}
          </span>
        )}

        {/* Uncommitted changes indicator */}
        {worktree.uncommittedChanges !== undefined && worktree.uncommittedChanges > 0 && (
          <span className="ghd-worktree-stats">
            <span className="uncommitted">{worktree.uncommittedChanges} changes</span>
          </span>
        )}

        {/* Status badge */}
        <span className={statusConfig.className}>
          {statusConfig.label}
        </span>
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
              {/* Open in Explorer */}
              <DropdownMenu.Item
                className="ghd-context-menu-item"
                onClick={() => {
                  onOpenExplorer();
                  setContextMenu(null);
                }}
              >
                <FolderOpen className="ghd-context-menu-icon" />
                Open in Explorer
              </DropdownMenu.Item>

              {/* Open Terminal */}
              <DropdownMenu.Item
                className="ghd-context-menu-item"
                onClick={() => {
                  onOpenTerminal();
                  setContextMenu(null);
                }}
              >
                <Terminal className="ghd-context-menu-icon" />
                Open in Terminal
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="ghd-context-menu-separator" />

              {/* Merge */}
              <DropdownMenu.Item
                className="ghd-context-menu-item"
                onClick={() => {
                  onMerge();
                  setContextMenu(null);
                }}
              >
                <GitMerge className="ghd-context-menu-icon" />
                Merge to Master
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="ghd-context-menu-separator" />

              {/* Delete */}
              <DropdownMenu.Item
                className="ghd-context-menu-item danger"
                onClick={() => {
                  onDelete();
                  setContextMenu(null);
                }}
              >
                <Trash2 className="ghd-context-menu-icon" />
                Delete Worktree
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </>
  );
}
