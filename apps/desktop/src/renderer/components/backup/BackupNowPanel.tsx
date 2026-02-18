/**
 * BackupNowPanel - Create a new backup with message and progress
 */

import { useState } from 'react';
import {
  FolderSync,
  RefreshCw,
  Check,
  AlertCircle,
  Tag,
  Plus,
  X,
  Archive,
  File,
  Clock,
} from 'lucide-react';
import { useBackupStore } from '../../stores/backup-store';
import { useBackupProgress } from '../../hooks/useBackupProgress';

// ============================================================================
// Progress Display Component
// ============================================================================

function BackupProgressDisplay() {
  const { backupProgress, backupSummary, backupError, isBackupRunning, error } = useBackupStore();

  if (!isBackupRunning && !backupSummary && !backupError && !error) {
    return null;
  }

  // Show general store error (e.g. startup failure)
  if (error && !isBackupRunning) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
        <div className="flex items-center gap-2 text-red-500 mb-2">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">Startup Failed</span>
        </div>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  // Show error
  if (backupError) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
        <div className="flex items-center gap-2 text-red-500 mb-2">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">Backup Failed</span>
        </div>
        <p className="text-sm text-red-400">{backupError.message}</p>
        <p className="text-xs text-red-400/70 mt-1">Error code: {backupError.code}</p>
      </div>
    );
  }

  // Show summary (completed)
  if (backupSummary) {
    return (
      <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
        <div className="flex items-center gap-2 text-green-500 mb-3">
          <Check className="w-5 h-5" />
          <span className="font-medium">Backup Complete</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Snapshot</p>
            <code className="text-foreground font-mono text-xs">
              {backupSummary.snapshot_id?.slice(0, 8)}
            </code>
          </div>
          <div>
            <p className="text-muted-foreground">Files</p>
            <p className="text-foreground">
              <span className="text-green-500">+{backupSummary.files_new}</span>
              {' '}
              <span className="text-amber-500">~{backupSummary.files_changed}</span>
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="text-foreground">{backupSummary.duration_seconds.toFixed(1)}s</p>
          </div>
        </div>
      </div>
    );
  }

  // Show progress (in progress)
  if (isBackupRunning && backupProgress) {
    const percent = Math.round(backupProgress.percent);
    const formatBytes = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    return (
      <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-primary">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="font-medium">Backing up...</span>
          </div>
          <span className="text-sm text-foreground">{percent}%</span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-secondary rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <File className="w-3 h-3" />
            {backupProgress.files_done.toLocaleString()} / {backupProgress.total_files.toLocaleString()} files
          </div>
          <div className="flex items-center gap-2">
            <Archive className="w-3 h-3" />
            {formatBytes(backupProgress.bytes_done)} / {formatBytes(backupProgress.total_bytes)}
          </div>
        </div>

        {/* Current file */}
        {backupProgress.current_file && (
          <p className="text-xs text-muted-foreground mt-2 truncate">
            {backupProgress.current_file}
          </p>
        )}
      </div>
    );
  }

  // Initial running state (no progress yet)
  if (isBackupRunning) {
    return (
      <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg">
        <div className="flex items-center gap-2 text-primary">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="font-medium">Starting backup...</span>
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================================
// Main Component
// ============================================================================

export function BackupNowPanel() {
  const { config, isBackupRunning, startBackup, clearBackupState } = useBackupStore();
  const [message, setMessage] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  // Connect to WebSocket for progress
  useBackupProgress({ autoConnect: true });

  const addTag = () => {
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleStartBackup = async () => {
    clearBackupState();
    await startBackup(message || undefined, tags.length > 0 ? tags : undefined);
    // Don't clear form - let user see what they backed up
  };

  return (
    <div className="space-y-6">
      {/* Source Info */}
      <div className="p-4 bg-secondary/50 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <FolderSync className="w-4 h-4" />
          <span>Backup Source</span>
        </div>
        <p className="text-foreground truncate">{config?.backup?.source_path || 'Not configured'}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {config?.backup?.exclusions?.length || 0} exclusion patterns configured
        </p>
      </div>

      {/* Message Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Backup Message</label>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe this backup (e.g., 'Pre-release backup')..."
          disabled={isBackupRunning}
          className="w-full px-4 py-2 bg-secondary/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          Like a git commit message - helps identify this backup later
        </p>
      </div>

      {/* Tags Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Tags (optional)</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
              placeholder="Add tag..."
              disabled={isBackupRunning}
              className="w-full pl-10 pr-4 py-2 bg-secondary/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          </div>
          <button
            onClick={addTag}
            disabled={isBackupRunning || !newTag}
            className="px-3 py-2 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 px-2 py-1 bg-primary/20 text-primary text-xs rounded"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  disabled={isBackupRunning}
                  className="hover:text-primary/70 disabled:opacity-50"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Progress Display */}
      <BackupProgressDisplay />

      {/* Start Button */}
      <button
        onClick={handleStartBackup}
        disabled={isBackupRunning}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isBackupRunning ? (
          <>
            <RefreshCw className="w-5 h-5 animate-spin" />
            Backup in Progress...
          </>
        ) : (
          <>
            <FolderSync className="w-5 h-5" />
            Start Backup
          </>
        )}
      </button>
    </div>
  );
}

export default BackupNowPanel;
