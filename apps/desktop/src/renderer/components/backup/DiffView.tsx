/**
 * DiffView - Shows file differences and allows restore
 */

import { useState, useEffect } from 'react';
import {
  Plus,
  Minus,
  FileText,
  Folder,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  RotateCcw,
  Archive,
  AlertCircle,
  Check,
  FolderOpen,
} from 'lucide-react';
import { useBackupStore } from '../../stores/backup-store';
import type { DiffEntry, SnapshotDiff } from '../../types/backup';

// ============================================================================
// Diff Tree Component
// ============================================================================

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  status?: 'added' | 'removed' | 'modified';
  children?: TreeNode[];
}

// Intermediate type for object-based tree construction
interface TreeBuildNode {
  name: string;
  path: string;
  isDirectory: boolean;
  status?: 'added' | 'removed' | 'modified';
  children?: { [key: string]: TreeBuildNode };
}

function buildTree(entries: DiffEntry[]): TreeNode[] {
  const root: { [key: string]: TreeBuildNode } = {};

  entries.forEach((entry) => {
    const parts = entry.path.replace(/^\//, '').split('/');
    let current = root;

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join('/');

      if (!current[part]) {
        current[part] = {
          name: part,
          path,
          isDirectory: !isLast,
          status: isLast ? entry.status : undefined,
          children: isLast ? undefined : {},
        };
      }

      if (!isLast && current[part].children) {
        current = current[part].children!;
      }
    });
  });

  const convertToArray = (obj: { [key: string]: TreeBuildNode }): TreeNode[] => {
    return Object.values(obj)
      .map((node) => ({
        ...node,
        children: node.children ? convertToArray(node.children) : undefined,
      }))
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  };

  return convertToArray(root);
}

function DiffTreeNode({
  node,
  depth = 0,
  selectedPaths,
  onToggle,
}: {
  node: TreeNode;
  depth?: number;
  selectedPaths: Set<string>;
  onToggle: (path: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const isSelected = selectedPaths.has(node.path);

  const statusColors = {
    added: 'text-green-500',
    removed: 'text-red-500',
    modified: 'text-amber-500',
  };

  const statusIcons = {
    added: Plus,
    removed: Minus,
    modified: FileText,
  };

  const Icon = node.isDirectory
    ? isExpanded
      ? ChevronDown
      : ChevronRight
    : node.status
    ? statusIcons[node.status]
    : FileText;

  return (
    <div>
      <div
        className={`
          flex items-center gap-2 px-2 py-1 rounded cursor-pointer
          hover:bg-secondary/50 transition-colors
          ${isSelected ? 'bg-primary/20' : ''}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (node.isDirectory) {
            setIsExpanded(!isExpanded);
          } else {
            onToggle(node.path);
          }
        }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(node.path)}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
        />
        <Icon
          className={`w-4 h-4 ${
            node.status ? statusColors[node.status] : 'text-muted-foreground'
          }`}
        />
        <span
          className={`text-sm ${
            node.status ? statusColors[node.status] : 'text-foreground'
          }`}
        >
          {node.name}
        </span>
      </div>

      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <DiffTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPaths={selectedPaths}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Diff Summary Component
// ============================================================================

function DiffSummary({ diff }: { diff: SnapshotDiff }) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="flex items-center gap-1 text-green-500">
        <Plus className="w-4 h-4" />
        {diff.added.length} added
      </span>
      <span className="flex items-center gap-1 text-red-500">
        <Minus className="w-4 h-4" />
        {diff.removed.length} removed
      </span>
      <span className="flex items-center gap-1 text-amber-500">
        <FileText className="w-4 h-4" />
        {diff.modified.length} modified
      </span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DiffView() {
  const {
    selectedSnapshotId,
    diffData,
    diffLoading,
    isRestoring,
    restoreError,
    loadDiff,
    restore,
    snapshots,
  } = useBackupStore();

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [targetPath, setTargetPath] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  const selectedSnapshot = snapshots.find((s) => s.id === selectedSnapshotId);

  useEffect(() => {
    if (selectedSnapshotId && !diffData) {
      loadDiff(selectedSnapshotId);
    }
  }, [selectedSnapshotId, diffData, loadDiff]);

  const togglePath = (path: string) => {
    const newSelected = new Set(selectedPaths);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedPaths(newSelected);
  };

  const selectAll = () => {
    if (!diffData) return;
    const allPaths = [
      ...diffData.added.map((e) => e.path),
      ...diffData.removed.map((e) => e.path),
      ...diffData.modified.map((e) => e.path),
    ];
    setSelectedPaths(new Set(allPaths));
  };

  const selectNone = () => {
    setSelectedPaths(new Set());
  };

  const handleSelectTarget = async () => {
    const result = await window.electronAPI.backup.selectRestoreTarget();
    if (result.ok && result.data?.path) {
      setTargetPath(result.data.path);
    }
  };

  const handleRestore = async () => {
    if (!selectedSnapshotId || !targetPath) return;

    setRestoreSuccess(false);
    const includePaths = selectedPaths.size > 0 ? Array.from(selectedPaths) : undefined;
    const success = await restore(selectedSnapshotId, targetPath, includePaths);
    if (success) {
      setRestoreSuccess(true);
    }
  };

  if (!selectedSnapshotId) {
    return (
      <div className="text-center py-12">
        <Archive className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">Select a snapshot to view differences</p>
        <p className="text-xs text-muted-foreground mt-1">
          Go to Snapshots tab and select one
        </p>
      </div>
    );
  }

  if (diffLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!diffData) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-amber-500" />
        <p className="text-muted-foreground">Failed to load diff data</p>
      </div>
    );
  }

  const allEntries = [
    ...diffData.added.map((e) => ({ ...e, status: 'added' as const })),
    ...diffData.removed.map((e) => ({ ...e, status: 'removed' as const })),
    ...diffData.modified.map((e) => ({ ...e, status: 'modified' as const })),
  ];

  const treeNodes = buildTree(allEntries);

  return (
    <div className="space-y-4">
      {/* Snapshot Info */}
      <div className="p-4 bg-secondary/50 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              {selectedSnapshot?.message || 'Unnamed backup'}
            </h4>
            <p className="text-xs text-muted-foreground">
              <code>{selectedSnapshot?.short_id}</code> • {selectedSnapshot?.formatted?.time_ago}
            </p>
          </div>
          <DiffSummary diff={diffData} />
        </div>
      </div>

      {/* Selection Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={selectAll}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            Select All
          </button>
          <span className="text-muted-foreground">•</span>
          <button
            onClick={selectNone}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            Select None
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          {selectedPaths.size} files selected
        </span>
      </div>

      {/* Diff Tree */}
      <div className="max-h-64 overflow-y-auto border border-border rounded-lg p-2 bg-card/50">
        {treeNodes.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            No differences found
          </p>
        ) : (
          treeNodes.map((node) => (
            <DiffTreeNode
              key={node.path}
              node={node}
              selectedPaths={selectedPaths}
              onToggle={togglePath}
            />
          ))
        )}
      </div>

      {/* Target Path */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Restore Target</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={targetPath}
            onChange={(e) => setTargetPath(e.target.value)}
            placeholder="Select target directory..."
            className="flex-1 px-4 py-2 bg-secondary/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleSelectTarget}
            className="px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Files will be restored to this directory
        </p>
      </div>

      {/* Status Messages */}
      {restoreError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{restoreError}</span>
          </div>
        </div>
      )}

      {restoreSuccess && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-green-500">
            <Check className="w-5 h-5" />
            <span className="text-sm">Restore completed successfully!</span>
          </div>
        </div>
      )}

      {/* Restore Button */}
      <button
        onClick={handleRestore}
        disabled={isRestoring || !targetPath}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRestoring ? (
          <>
            <RefreshCw className="w-5 h-5 animate-spin" />
            Restoring...
          </>
        ) : (
          <>
            <RotateCcw className="w-5 h-5" />
            Restore {selectedPaths.size > 0 ? `${selectedPaths.size} Files` : 'All Files'}
          </>
        )}
      </button>
    </div>
  );
}

export default DiffView;
