/**
 * Backup & Restore Panel
 * Manage settings backups and restore from previous states
 */

import {
  Archive,
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  HardDrive,
  FolderOpen,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { toast } from '../ui/toaster';
import { useKuroryuuDialog } from '../../hooks/useKuroryuuDialog';

interface BackupInfo {
  path: string;
  timestamp: number;
  scope: 'user' | 'project';
  size: number;
  filename: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface BackupListProps {
  scope: 'user' | 'project';
  scopeLabel: string;
  onRestore: () => void;
}

function BackupList({ scope, scopeLabel, onRestore }: BackupListProps) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { confirm, confirmDestructive } = useKuroryuuDialog();

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.electronAPI?.settings?.listBackups?.(scope);
      setBackups(list || []);
    } catch (err) {
      console.error(`Failed to list ${scope} backups:`, err);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const backup = await window.electronAPI?.settings?.createBackup?.(scope);
      if (backup) {
        toast.success(`Created backup: ${backup.filename}`);
        loadBackups();
      }
    } catch (err: any) {
      toast.error(`Failed to create backup: ${err.message || err}`);
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (backup: BackupInfo) => {
    const yes = await confirm({
      title: 'Restore Backup',
      message: `Restore settings from ${backup.filename}?\n\nThis will overwrite your current ${scopeLabel} settings.`,
      confirmLabel: 'Restore',
      cancelLabel: 'Cancel',
    });
    if (!yes) return;

    setRestoring(backup.path);
    try {
      const result = await window.electronAPI?.settings?.restoreBackup?.(backup.path, scope);
      if (result?.ok) {
        toast.success(`Restored from ${backup.filename}`);
        onRestore();
      } else {
        toast.error('Restore failed');
      }
    } catch (err: any) {
      toast.error(`Restore failed: ${err.message || err}`);
    } finally {
      setRestoring(null);
    }
  };

  const handleDelete = async (backup: BackupInfo) => {
    const yes = await confirmDestructive({
      title: 'Delete Backup',
      message: `Delete backup ${backup.filename}?\n\nThis cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!yes) return;

    setDeleting(backup.path);
    try {
      const result = await window.electronAPI?.settings?.deleteBackup?.(backup.path);
      if (result?.ok) {
        toast.success(`Deleted ${backup.filename}`);
        loadBackups();
      } else {
        toast.error('Delete failed');
      }
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message || err}`);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{scopeLabel}</span>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-primary/20 text-primary border border-primary/30 rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50"
        >
          {creating ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Archive className="w-3 h-3" />
          )}
          Create Backup
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        </div>
      ) : backups.length === 0 ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          No backups found
        </div>
      ) : (
        <div className="space-y-2">
          {backups.map((backup) => (
            <div
              key={backup.path}
              className="flex items-center justify-between p-2.5 bg-secondary/50 border border-border rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{backup.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(backup.timestamp)} • {formatBytes(backup.size)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 ml-3">
                <button
                  onClick={() => handleRestore(backup)}
                  disabled={restoring === backup.path}
                  title="Restore from this backup"
                  className="p-1.5 text-primary hover:bg-primary/20 rounded transition-colors disabled:opacity-50"
                >
                  {restoring === backup.path ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(backup)}
                  disabled={deleting === backup.path}
                  title="Delete this backup"
                  className="p-1.5 text-destructive hover:bg-destructive/20 rounded transition-colors disabled:opacity-50"
                >
                  {deleting === backup.path ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BackupRestorePanel() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRestore = () => {
    // Increment key to refresh the lists and trigger settings reload
    setRefreshKey((k) => k + 1);
    toast.info('Settings restored. You may need to restart for all changes to take effect.');
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Create backups before making changes or restore from a previous state.
        Backups are stored alongside settings files.
      </p>

      <BackupList
        key={`user-${refreshKey}`}
        scope="user"
        scopeLabel="User Settings"
        onRestore={handleRestore}
      />

      <div className="border-t border-border my-3" />

      <BackupList
        key={`project-${refreshKey}`}
        scope="project"
        scopeLabel="Project Settings"
        onRestore={handleRestore}
      />

      <div className="p-3 bg-secondary/30 border border-border rounded-lg">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">About backups</p>
            <ul className="space-y-0.5">
              <li>• User settings are stored in %APPDATA%/Kuroryuu/</li>
              <li>• Project settings are stored in your project folder</li>
              <li>• Backups use timestamped .bak extension</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
