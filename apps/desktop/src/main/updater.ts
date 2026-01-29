/**
 * Auto-Updater Module
 *
 * Handles automatic updates for the Kuroryuu desktop app.
 * Uses electron-updater with GitHub Releases provider.
 */
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';
import { getSettingsService } from './settings/settings-service';

// Configure logging
autoUpdater.logger = log;
log.transports.file.level = 'info';

// Enable auto-download and auto-install on quit
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Update check interval (4 hours)
const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000;

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error';
  version?: string;
  percent?: number;
  error?: string;
}

/**
 * Send update status to renderer process
 */
function sendToRenderer(win: BrowserWindow, channel: string, data: unknown): void {
  try {
    if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  } catch {
    // Window was likely destroyed
  }
}

/**
 * Initialize auto-updater with event handlers
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  log.info('[Updater] Initializing auto-updater...');

  // Check for updates on startup (with delay)
  setTimeout(async () => {
    const settings = getSettingsService();
    const checkOnStartup = settings.get('ui.checkUpdatesOnStartup') ?? true;

    if (!checkOnStartup) {
      log.info('[Updater] Startup check disabled by user preference');
      return;
    }

    log.info('[Updater] Checking for updates on startup...');
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('[Updater] Startup check failed:', err);
    });
  }, 3000);

  // Check for updates periodically
  setInterval(() => {
    log.info('[Updater] Periodic update check...');
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('[Updater] Periodic check failed:', err);
    });
  }, UPDATE_CHECK_INTERVAL);

  // Event: Checking for update
  autoUpdater.on('checking-for-update', () => {
    log.info('[Updater] Checking for update...');
    sendToRenderer(mainWindow, 'update-status', {
      status: 'checking',
    } as UpdateStatus);
  });

  // Event: Update available
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info('[Updater] Update available:', info.version);
    sendToRenderer(mainWindow, 'update-status', {
      status: 'available',
      version: info.version,
    } as UpdateStatus);
  });

  // Event: No update available
  autoUpdater.on('update-not-available', () => {
    log.info('[Updater] No update available');
    sendToRenderer(mainWindow, 'update-status', {
      status: 'not-available',
    } as UpdateStatus);
  });

  // Event: Download progress
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    log.info(`[Updater] Download progress: ${progress.percent.toFixed(1)}%`);
    sendToRenderer(mainWindow, 'update-status', {
      status: 'downloading',
      percent: progress.percent,
    } as UpdateStatus);
  });

  // Event: Update downloaded
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info('[Updater] Update downloaded:', info.version);
    sendToRenderer(mainWindow, 'update-status', {
      status: 'ready',
      version: info.version,
    } as UpdateStatus);
  });

  // Event: Error
  autoUpdater.on('error', (err: Error) => {
    log.error('[Updater] Error:', err);
    sendToRenderer(mainWindow, 'update-status', {
      status: 'error',
      error: err.message,
    } as UpdateStatus);
  });

  // IPC: Manual update check
  ipcMain.handle('updater:check', async () => {
    log.info('[Updater] Manual update check requested');
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, updateInfo: result?.updateInfo };
    } catch (err) {
      log.error('[Updater] Manual check failed:', err);
      return { ok: false, error: String(err) };
    }
  });

  // IPC: Quit and install
  ipcMain.handle('updater:install', () => {
    log.info('[Updater] Installing update...');
    autoUpdater.quitAndInstall();
  });

  // IPC: Get current version
  ipcMain.handle('updater:getVersion', () => {
    return autoUpdater.currentVersion.version;
  });

  log.info('[Updater] Auto-updater initialized');
}
