/**
 * Worktrees List Component
 * List-based view of all worktrees for the GitHub Desktop clone
 */

import { Plus, RefreshCw, FolderGit2, GitBranch } from 'lucide-react';
import { WorktreeListItem } from './WorktreeListItem';
import type { Worktree } from '../../types/worktree';

interface WorktreesListProps {
  worktrees: Worktree[];
  selectedWorktree: Worktree | null;
  onSelectWorktree: (worktree: Worktree) => void;
  onRefresh: () => void;
  onCreate: () => void;
  onMerge: (worktree: Worktree) => void;
  onDelete: (worktree: Worktree) => void;
  onOpenExplorer: (worktree: Worktree) => void;
  onOpenTerminal: (worktree: Worktree) => void;
}

export function WorktreesList({
  worktrees,
  selectedWorktree,
  onSelectWorktree,
  onRefresh,
  onCreate,
  onMerge,
  onDelete,
  onOpenExplorer,
  onOpenTerminal,
}: WorktreesListProps) {
  // Separate task and git worktrees
  const taskWorktrees = worktrees.filter((w) => w.type === 'task' || w.type === 'terminal');
  const gitWorktrees = worktrees.filter((w) => w.type === 'git');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--ghd-bg-primary)' }}>
      {/* Toolbar */}
      <div className="ghd-worktree-toolbar">
        <button className="ghd-worktree-toolbar-btn" onClick={onRefresh}>
          <RefreshCw size={14} />
          Refresh
        </button>
        <button className="ghd-worktree-toolbar-btn primary" onClick={onCreate}>
          <Plus size={14} />
          Create
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
        {worktrees.length === 0 ? (
          <div className="ghd-empty-state">
            <FolderGit2 size={48} className="ghd-empty-state-icon" />
            <div className="ghd-empty-state-title">No worktrees</div>
            <div className="ghd-empty-state-description">
              Create a worktree to work on multiple branches at once
            </div>
          </div>
        ) : (
          <>
            {/* Task Worktrees Section */}
            {taskWorktrees.length > 0 && (
              <div className="ghd-worktree-section">
                <div className="ghd-worktree-section-header">
                  <span className="ghd-worktree-section-title">
                    <FolderGit2 size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Task Worktrees
                  </span>
                  <span className="ghd-worktree-section-count">({taskWorktrees.length})</span>
                </div>
                <div className="ghd-worktree-list">
                  {taskWorktrees.map((worktree) => (
                    <WorktreeListItem
                      key={worktree.id}
                      worktree={worktree}
                      isSelected={selectedWorktree?.id === worktree.id}
                      onSelect={() => onSelectWorktree(worktree)}
                      onOpenExplorer={() => onOpenExplorer(worktree)}
                      onOpenTerminal={() => onOpenTerminal(worktree)}
                      onMerge={() => onMerge(worktree)}
                      onDelete={() => onDelete(worktree)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Git Worktrees Section */}
            {gitWorktrees.length > 0 && (
              <div className="ghd-worktree-section">
                <div className="ghd-worktree-section-header">
                  <span className="ghd-worktree-section-title">
                    <GitBranch size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Git Worktrees
                  </span>
                  <span className="ghd-worktree-section-count">({gitWorktrees.length})</span>
                </div>
                <div className="ghd-worktree-list">
                  {gitWorktrees.map((worktree) => (
                    <WorktreeListItem
                      key={worktree.id}
                      worktree={worktree}
                      isSelected={selectedWorktree?.id === worktree.id}
                      onSelect={() => onSelectWorktree(worktree)}
                      onOpenExplorer={() => onOpenExplorer(worktree)}
                      onOpenTerminal={() => onOpenTerminal(worktree)}
                      onMerge={() => onMerge(worktree)}
                      onDelete={() => onDelete(worktree)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
