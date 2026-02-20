/**
 * Backup IPC Handlers
 *
 * Main process IPC handlers for backup functionality.
 * Bridges renderer requests to the BackupService.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import {
  BackupService,
  getBackupService,
  initializeBackupService,
  getBackupSettingsDir,
  getResticBinDir,
  getDefaultRepoPath,
} from '../services/backup-service';
import type { BackupConfig } from '../../renderer/types/backup';

// ============================================================================
// Handler Registration
// ============================================================================

let backupService: BackupService | null = null;

/**
 * Initialize backup service and register IPC handlers
 */
export async function registerBackupHandlers(mainWindow: BrowserWindow): Promise<void> {
  // Initialize the backup service
  backupService = await initializeBackupService();

  // ─────────────────────────────────────────────────────────────────────────
  // Configuration Handlers
  // ─────────────────────────────────────────────────────────────────────────

  // Get current configuration
  ipcMain.handle('backup:get-config', async () => {
    if (!backupService) {
      return { ok: false, error: 'Backup service not initialized' };
    }

    const config = backupService.getConfig();
    return {
      ok: true,
      data: config,
      paths: {
        settingsDir: getBackupSettingsDir(),
        binDir: getResticBinDir(),
        defaultRepoPath: getDefaultRepoPath(),
      },
    };
  });

  // Save configuration
  ipcMain.handle('backup:save-config', async (_event, config: BackupConfig) => {
    if (!backupService) {
      return { ok: false, error: 'Backup service not initialized' };
    }

    try {
      await backupService.saveConfig(config);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  });

  // Create default configuration
  ipcMain.handle('backup:create-default-config', async (_event, sourcePath: string) => {
    if (!backupService) {
      return { ok: false, error: 'Backup service not initialized' };
    }

    const config = backupService.createDefaultConfig(sourcePath);
    return { ok: true, data: config };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Status Handlers
  // ─────────────────────────────────────────────────────────────────────────

  // Get comprehensive status
  ipcMain.handle('backup:get-status', async () => {
    if (!backupService) {
      return { ok: false, error: 'Backup service not initialized' };
    }

    try {
      const status = await backupService.getStatus();
      return { ok: true, data: status };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  });

  // Ensure restic binary is installed
  ipcMain.handle('backup:ensure-restic', async () => {
    if (!backupService) {
      return { ok: false, error: 'Backup service not initialized' };
    }

    try {
      const status = await backupService.ensureRestic();
      return { ok: true, data: status };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Repository Handlers
  // ─────────────────────────────────────────────────────────────────────────

  // Initialize repository
  ipcMain.handle('backup:init-repo', async (_event, password: string) => {
    if (!backupService) {
      return { ok: false, error: 'Backup service not initialized' };
    }

    try {
      const result = await backupService.initRepository(password);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  });

  // Full reset (delete repo + config)
  ipcMain.handle('backup:reset', async () => {
    if (!backupService) {
      return { ok: false, error: 'Backup service not initialized' };
    }

    try {
      const result = await backupService.resetRepository();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  });

  // Verify repository password
  ipcMain.handle('backup:verify-password', async (_event, password: string) => {
    if (!backupService) {
      return { ok: false, error: 'Backup service not initialized' };
    }

    try {
      const valid = await backupService.verifyPassword(password);
      return { ok: true, data: { valid } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Backup Handlers
  // ─────────────────────────────────────────────────────────────────────────

  // Create backup
  ipcMain.handle(
    'backup:create',
    async (_event, params: { message?: string; tags?: string[] }) => {
      if (!backupService) {
        return { ok: false, error: 'Backup service not initialized' };
      }

      try {
        const result = await backupService.createBackup(params.message, params.tags);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { ok: false, error: message };
      }
    }
  );

  // List snapshots
  ipcMain.handle('backup:list', async (_event, limit?: number) => {
    if (!backupService) {
      return { ok: false, error: 'Backup service not initialized' };
    }

    try {
      const result = await backupService.listSnapshots(limit);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  });

  // Get diff
  ipcMain.handle(
    'backup:diff',
    async (_event, params: { snapshotId: string; compareTo?: string }) => {
      if (!backupService) {
        return { ok: false, error: 'Backup service not initialized' };
      }

      try {
        const diff = await backupService.getDiff(params.snapshotId, params.compareTo);
        return { ok: !!diff, data: diff };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { ok: false, error: message };
      }
    }
  );

  // Restore snapshot
  ipcMain.handle(
    'backup:restore',
    async (
      _event,
      params: { snapshotId: string; targetPath: string; includePaths?: string[] }
    ) => {
      if (!backupService) {
        return { ok: false, error: 'Backup service not initialized' };
      }

      try {
        const result = await backupService.restore(
          params.snapshotId,
          params.targetPath,
          params.includePaths
        );
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { ok: false, error: message };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Maintenance Handlers
  // ─────────────────────────────────────────────────────────────────────────

  // Forget snapshot
  ipcMain.handle(
    'backup:forget',
    async (_event, params: { snapshotId: string; prune?: boolean }) => {
      if (!backupService) {
        return { ok: false, error: 'Backup service not initialized' };
      }

      try {
        const result = await backupService.forgetSnapshot(params.snapshotId, params.prune);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { ok: false, error: message };
      }
    }
  );

  // Prune repository
  ipcMain.handle('backup:prune', async () => {
    if (!backupService) {
      return { ok: false, error: 'Backup service not initialized' };
    }

    try {
      const result = await backupService.prune();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  });

  // Check repository integrity
  ipcMain.handle('backup:check', async () => {
    if (!backupService) {
      return { ok: false, error: 'Backup service not initialized' };
    }

    try {
      const result = await backupService.checkIntegrity();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Dialog Handlers
  // ─────────────────────────────────────────────────────────────────────────

  // Select source directory for backup
  ipcMain.handle('backup:select-source-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Source Directory to Backup',
      properties: ['openDirectory'],
    });

    if (result.canceled || !result.filePaths.length) {
      return { ok: false, canceled: true };
    }

    return { ok: true, data: { path: result.filePaths[0] } };
  });

  // Select target directory for restore
  ipcMain.handle('backup:select-restore-target', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Restore Target Directory',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !result.filePaths.length) {
      return { ok: false, canceled: true };
    }

    return { ok: true, data: { path: result.filePaths[0] } };
  });

  console.log('[BackupHandlers] Registered');
}

/**
 * Unregister handlers and cleanup
 */
export async function unregisterBackupHandlers(): Promise<void> {
  // Remove all handlers
  const handlers = [
    'backup:get-config',
    'backup:save-config',
    'backup:create-default-config',
    'backup:get-status',
    'backup:ensure-restic',
    'backup:init-repo',
    'backup:reset',
    'backup:verify-password',
    'backup:create',
    'backup:list',
    'backup:diff',
    'backup:restore',
    'backup:forget',
    'backup:prune',
    'backup:check',
    'backup:select-source-dir',
    'backup:select-restore-target',
  ];

  for (const handler of handlers) {
    ipcMain.removeHandler(handler);
  }

  backupService = null;

  console.log('[BackupHandlers] Unregistered');
}

/**
 * Get the backup service instance (for testing)
 */
export function getBackupServiceInstance(): BackupService | null {
  return backupService;
}
