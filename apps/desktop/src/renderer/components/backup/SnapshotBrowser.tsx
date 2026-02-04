/**
 * SnapshotBrowser - Git-log style snapshot list
 */

import { useEffect, useState } from 'react';
import {
  Archive,
  GitCommit,
  ChevronRight,
  RefreshCw,
  Clock,
  HardDrive,
  Filter,
  Search,
  Trash2,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { useBackupStore } from '../../stores/backup-store';
import type { BackupSnapshot } from '../../types/backup';

// ============================================================================
// Snapshot Card Component
// ============================================================================

function SnapshotCard({
  snapshot,
  isSelected,
  onSelect,
  onRestore,
  onDelete,
  onViewDiff,
}: {
  snapshot: BackupSnapshot;
  isSelected: boolean;
  onSelect: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onViewDiff: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`
        relative p-4 border rounded-lg cursor-pointer transition-all
        ${isSelected
          ? 'bg-primary/10 border-primary/50'
          : 'bg-card/50 border-border hover:border-primary/30'
        }
      `}
    >
      {/* Git-style commit line */}
      <div className="absolute left-8 top-0 bottom-0 w-px bg-border -z-10" />

      {/* Commit dot */}
      <div className="flex items-start gap-4">
        <div className={`
          w-4 h-4 rounded-full flex-shrink-0 mt-1
          ${isSelected ? 'bg-primary' : 'bg-muted-foreground'}
        `} />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-foreground truncate">
                {snapshot.message || 'Unnamed backup'}
              </h4>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <GitCommit className="w-3 h-3" />
                <code className="font-mono">{snapshot.short_id}</code>
                {snapshot.parent && (
                  <>
                    <span>•</span>
                    <span>parent: {snapshot.parent.slice(0, 8)}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {snapshot.formatted?.time_ago || snapshot.time_ago}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs">
            <span className="text-green-500">
              +{snapshot.stats?.files_new || 0} new
            </span>
            <span className="text-amber-500">
              ~{snapshot.stats?.files_changed || 0} changed
            </span>
            <span className="text-muted-foreground">
              {snapshot.formatted?.data_added || '0 B'} added
            </span>
          </div>

          {/* Tags */}
          {snapshot.tags && snapshot.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-2">
              {snapshot.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-secondary text-xs text-muted-foreground rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Actions (shown when selected) */}
          {isSelected && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDiff();
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 rounded transition-colors"
              >
                <FileText className="w-3 h-3" />
                View Diff
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore();
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Restore
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 rounded transition-colors ml-auto"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SnapshotBrowser() {
  const {
    snapshots,
    snapshotsLoading,
    selectedSnapshotId,
    loadSnapshots,
    selectSnapshot,
    forgetSnapshot,
    loadDiff,
    setView,
  } = useBackupStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const filteredSnapshots = searchQuery
    ? snapshots.filter(
        (s) =>
          s.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.short_id.includes(searchQuery) ||
          s.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : snapshots;

  const handleRestore = (snapshotId: string) => {
    selectSnapshot(snapshotId);
    loadDiff(snapshotId);
    setView('restore');
  };

  const handleDelete = async (snapshotId: string) => {
    const success = await forgetSnapshot(snapshotId, false);
    if (success) {
      setShowDeleteConfirm(null);
    }
  };

  const handleViewDiff = (snapshotId: string) => {
    selectSnapshot(snapshotId);
    loadDiff(snapshotId);
    setView('restore');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-medium text-foreground">Snapshots</h3>
          <span className="text-sm text-muted-foreground">
            {snapshots.length} total
          </span>
        </div>
        <button
          onClick={() => loadSnapshots()}
          disabled={snapshotsLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${snapshotsLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search snapshots..."
          className="w-full pl-10 pr-4 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Snapshot List */}
      <div className="space-y-2">
        {snapshotsLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : filteredSnapshots.length === 0 ? (
          <div className="text-center py-12">
            <Archive className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {searchQuery ? 'No matching snapshots' : 'No snapshots yet'}
            </p>
          </div>
        ) : (
          filteredSnapshots.map((snapshot) => (
            <SnapshotCard
              key={snapshot.id}
              snapshot={snapshot}
              isSelected={selectedSnapshotId === snapshot.id}
              onSelect={() => selectSnapshot(snapshot.id)}
              onRestore={() => handleRestore(snapshot.id)}
              onDelete={() => setShowDeleteConfirm(snapshot.id)}
              onViewDiff={() => handleViewDiff(snapshot.id)}
            />
          ))
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4">
            <h4 className="text-lg font-medium text-foreground mb-2">Delete Snapshot?</h4>
            <p className="text-sm text-muted-foreground mb-4">
              This will permanently remove the snapshot from the repository.
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SnapshotBrowser;
