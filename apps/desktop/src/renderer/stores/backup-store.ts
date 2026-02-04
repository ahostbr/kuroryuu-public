/**
 * Backup Store - Zustand state management for Restic backup system
 */
import { create } from 'zustand';
import type {
  BackupConfig,
  BackupStatus,
  BackupSnapshot,
  SnapshotDiff,
  BackupProgress,
  BackupSummary,
  BackupError,
  ResticBinaryStatus,
} from '../types/backup';

// ============================================================================
// Types
// ============================================================================

export type BackupView = 'overview' | 'snapshots' | 'backup' | 'restore' | 'settings';

export interface BackupState {
  // Configuration
  config: BackupConfig | null;
  isConfigured: boolean;
  isLoading: boolean;

  // Status
  status: BackupStatus | null;
  resticStatus: ResticBinaryStatus | null;

  // Snapshots
  snapshots: BackupSnapshot[];
  selectedSnapshotId: string | null;
  snapshotsLoading: boolean;

  // Diff view
  diffData: SnapshotDiff | null;
  diffLoading: boolean;

  // Backup operation
  isBackupRunning: boolean;
  backupProgress: BackupProgress | null;
  backupSummary: BackupSummary | null;
  backupError: BackupError | null;
  currentSessionId: string | null;

  // Restore operation
  isRestoring: boolean;
  restoreProgress: number;
  restoreError: string | null;

  // UI State
  currentView: BackupView;
  showSetupWizard: boolean;

  // Error handling
  error: string | null;

  // Actions
  loadConfig: () => Promise<void>;
  saveConfig: (config: BackupConfig) => Promise<void>;
  createDefaultConfig: (sourcePath: string) => Promise<BackupConfig | null>;
  loadStatus: () => Promise<void>;
  ensureRestic: () => Promise<ResticBinaryStatus | null>;
  initRepository: (password: string) => Promise<boolean>;
  verifyPassword: (password: string) => Promise<boolean>;
  loadSnapshots: (limit?: number) => Promise<void>;
  selectSnapshot: (snapshotId: string | null) => void;
  loadDiff: (snapshotId: string, compareTo?: string) => Promise<void>;
  startBackup: (message?: string, tags?: string[]) => Promise<string | null>;
  restore: (snapshotId: string, targetPath: string, includePaths?: string[]) => Promise<boolean>;
  forgetSnapshot: (snapshotId: string, prune?: boolean) => Promise<boolean>;
  pruneRepository: () => Promise<boolean>;
  checkIntegrity: () => Promise<boolean>;
  setView: (view: BackupView) => void;
  setShowSetupWizard: (show: boolean) => void;
  clearError: () => void;

  // Progress updates (called by WebSocket hook)
  setBackupProgress: (progress: BackupProgress) => void;
  setBackupSummary: (summary: BackupSummary) => void;
  setBackupError: (error: BackupError) => void;
  clearBackupState: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useBackupStore = create<BackupState>((set, get) => ({
  // Initial state
  config: null,
  isConfigured: false,
  isLoading: false,
  status: null,
  resticStatus: null,
  snapshots: [],
  selectedSnapshotId: null,
  snapshotsLoading: false,
  diffData: null,
  diffLoading: false,
  isBackupRunning: false,
  backupProgress: null,
  backupSummary: null,
  backupError: null,
  currentSessionId: null,
  isRestoring: false,
  restoreProgress: 0,
  restoreError: null,
  currentView: 'overview',
  showSetupWizard: false,
  error: null,

  // ─────────────────────────────────────────────────────────────────────────
  // Configuration Actions
  // ─────────────────────────────────────────────────────────────────────────

  loadConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.backup.getConfig();
      if (result.ok) {
        const config = (result.data as BackupConfig) || null;
        set({
          config,
          isConfigured: !!config,
          isLoading: false,
          showSetupWizard: !config,
        });
      } else {
        set({
          error: result.error || 'Failed to load config',
          isLoading: false,
          showSetupWizard: true,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ error: message, isLoading: false, showSetupWizard: true });
    }
  },

  saveConfig: async (config: BackupConfig) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.backup.saveConfig(config);
      if (result.ok) {
        set({ config, isConfigured: true, isLoading: false, showSetupWizard: false });
      } else {
        set({ error: result.error || 'Failed to save config', isLoading: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ error: message, isLoading: false });
    }
  },

  createDefaultConfig: async (sourcePath: string) => {
    try {
      const result = await window.electronAPI.backup.createDefaultConfig(sourcePath);
      if (result.ok && result.data) {
        return result.data as BackupConfig;
      }
      return null;
    } catch {
      return null;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Status Actions
  // ─────────────────────────────────────────────────────────────────────────

  loadStatus: async () => {
    try {
      const result = await window.electronAPI.backup.getStatus();
      if (result.ok && result.data) {
        set({ status: result.data });
      }
    } catch (err) {
      console.error('[BackupStore] loadStatus failed:', err);
    }
  },

  ensureRestic: async () => {
    try {
      const result = await window.electronAPI.backup.ensureRestic();
      if (result.ok && result.data) {
        set({ resticStatus: result.data });
        return result.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Repository Actions
  // ─────────────────────────────────────────────────────────────────────────

  initRepository: async (password: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.backup.initRepo(password);
      set({ isLoading: false });
      if (result.ok) {
        // Reload config to get updated initialized status
        await get().loadConfig();
        await get().loadStatus();
        return true;
      } else {
        set({ error: result.error || 'Failed to initialize repository' });
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ error: message, isLoading: false });
      return false;
    }
  },

  verifyPassword: async (password: string) => {
    try {
      const result = await window.electronAPI.backup.verifyPassword(password);
      return result.ok && result.data?.valid === true;
    } catch {
      return false;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Snapshot Actions
  // ─────────────────────────────────────────────────────────────────────────

  loadSnapshots: async (limit = 50) => {
    set({ snapshotsLoading: true });
    try {
      const result = await window.electronAPI.backup.list(limit);
      if (result.ok) {
        set({ snapshots: result.snapshots || [], snapshotsLoading: false });
      } else {
        set({ snapshots: [], snapshotsLoading: false });
      }
    } catch {
      set({ snapshots: [], snapshotsLoading: false });
    }
  },

  selectSnapshot: (snapshotId: string | null) => {
    set({ selectedSnapshotId: snapshotId, diffData: null });
  },

  loadDiff: async (snapshotId: string, compareTo?: string) => {
    set({ diffLoading: true, diffData: null });
    try {
      const result = await window.electronAPI.backup.diff({ snapshotId, compareTo });
      if (result.ok && result.data) {
        set({ diffData: result.data as SnapshotDiff, diffLoading: false });
      } else {
        set({ diffLoading: false });
      }
    } catch {
      set({ diffLoading: false });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Backup Actions
  // ─────────────────────────────────────────────────────────────────────────

  startBackup: async (message?: string, tags?: string[]) => {
    set({
      isBackupRunning: true,
      backupProgress: null,
      backupSummary: null,
      backupError: null,
      error: null,
    });

    try {
      const result = await window.electronAPI.backup.create({ message, tags });
      if (result.ok) {
        set({ currentSessionId: result.session_id });
        return result.session_id;
      } else {
        set({
          isBackupRunning: false,
          error: result.error || 'Failed to start backup',
        });
        return null;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      set({ isBackupRunning: false, error: msg });
      return null;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Restore Actions
  // ─────────────────────────────────────────────────────────────────────────

  restore: async (snapshotId: string, targetPath: string, includePaths?: string[]) => {
    set({ isRestoring: true, restoreProgress: 0, restoreError: null });
    try {
      const result = await window.electronAPI.backup.restore({
        snapshotId,
        targetPath,
        includePaths,
      });
      set({ isRestoring: false });
      if (result.ok) {
        return true;
      } else {
        set({ restoreError: result.error || 'Restore failed' });
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ isRestoring: false, restoreError: message });
      return false;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Maintenance Actions
  // ─────────────────────────────────────────────────────────────────────────

  forgetSnapshot: async (snapshotId: string, prune = false) => {
    try {
      const result = await window.electronAPI.backup.forget({ snapshotId, prune });
      if (result.ok) {
        // Refresh snapshot list
        await get().loadSnapshots();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  pruneRepository: async () => {
    set({ isLoading: true });
    try {
      const result = await window.electronAPI.backup.prune();
      set({ isLoading: false });
      return result.ok;
    } catch {
      set({ isLoading: false });
      return false;
    }
  },

  checkIntegrity: async () => {
    set({ isLoading: true });
    try {
      const result = await window.electronAPI.backup.check();
      set({ isLoading: false });
      return result.ok;
    } catch {
      set({ isLoading: false });
      return false;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // UI Actions
  // ─────────────────────────────────────────────────────────────────────────

  setView: (view: BackupView) => {
    set({ currentView: view });
  },

  setShowSetupWizard: (show: boolean) => {
    set({ showSetupWizard: show });
  },

  clearError: () => {
    set({ error: null });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Progress Updates (called by WebSocket hook)
  // ─────────────────────────────────────────────────────────────────────────

  setBackupProgress: (progress: BackupProgress) => {
    set({ backupProgress: progress });
  },

  setBackupSummary: (summary: BackupSummary) => {
    set({
      backupSummary: summary,
      isBackupRunning: false,
      currentSessionId: null,
    });
    // Refresh snapshots after backup completes
    get().loadSnapshots();
  },

  setBackupError: (error: BackupError) => {
    set({
      backupError: error,
      isBackupRunning: false,
      currentSessionId: null,
    });
  },

  clearBackupState: () => {
    set({
      isBackupRunning: false,
      backupProgress: null,
      backupSummary: null,
      backupError: null,
      currentSessionId: null,
    });
  },
}));
