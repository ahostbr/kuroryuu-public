/**
 * Unit Tests for Auto-Updater Module
 *
 * Tests:
 * - Startup update check with settings
 * - Periodic update checks
 * - Event handlers and IPC communication
 * - Error handling
 * - BrowserWindow lifecycle safety
 *
 * Requirements: T109 (Auto-update test strategy)
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('electron-updater', () => ({
  autoUpdater: {
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
    currentVersion: { version: '0.2.0' },
    autoDownload: false,
    autoInstallOnAppQuit: false,
    logger: null,
  },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  BrowserWindow: class MockBrowserWindow {
    webContents = {
      send: vi.fn(),
      isDestroyed: vi.fn().mockReturnValue(false),
    };
    isDestroyed = vi.fn().mockReturnValue(false);
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    transports: {
      file: {
        level: 'info',
      },
    },
  },
}));

vi.mock('../settings/settings-service', () => ({
  getSettingsService: vi.fn(() => ({
    get: vi.fn((key: string) => {
      if (key === 'ui.checkUpdatesOnStartup') return true;
      return undefined;
    }),
  })),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Auto-Updater Module', () => {
  let mainWindow: BrowserWindow;
  let eventHandlers: Map<string, (arg?: any) => void>;
  let ipcHandlers: Map<string, (event: any, ...args: any[]) => any>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Create mock window
    mainWindow = new BrowserWindow();

    // Capture event handlers
    eventHandlers = new Map();
    vi.mocked(autoUpdater.on).mockImplementation((event: string, handler: any) => {
      eventHandlers.set(event, handler);
      return autoUpdater;
    });

    // Capture IPC handlers
    ipcHandlers = new Map();
    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: any) => {
      ipcHandlers.set(channel, handler);
    });

    // Mock checkForUpdates to return a promise
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({
      updateInfo: {
        version: '0.3.0',
        releaseDate: '2026-02-15',
      } as UpdateInfo,
      downloadPromise: null as any,
      cancellationToken: null as any,
      versionInfo: null as any,
      isUpdateAvailable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Initialization Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Initialization', () => {
    it('should call checkForUpdates after 3s delay when setting is true', async () => {
      const { getSettingsService } = await import('../settings/settings-service');
      const mockSettings = {
        get: vi.fn((key: string) => {
          if (key === 'ui.checkUpdatesOnStartup') return true;
          return undefined;
        }),
      };
      vi.mocked(getSettingsService).mockReturnValue(mockSettings as any);

      const { initAutoUpdater } = await import('../updater');
      initAutoUpdater(mainWindow);

      // Should not call immediately
      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();

      // Advance 3s
      await vi.advanceTimersByTimeAsync(3000);

      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('should skip check when checkUpdatesOnStartup is false', async () => {
      const { getSettingsService } = await import('../settings/settings-service');
      const mockSettings = {
        get: vi.fn((key: string) => {
          if (key === 'ui.checkUpdatesOnStartup') return false;
          return undefined;
        }),
      };
      vi.mocked(getSettingsService).mockReturnValue(mockSettings as any);

      const { initAutoUpdater } = await import('../updater');
      initAutoUpdater(mainWindow);

      await vi.advanceTimersByTimeAsync(5000);

      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('should fire periodic check at UPDATE_CHECK_INTERVAL (4 hours)', async () => {
      const { initAutoUpdater } = await import('../updater');
      initAutoUpdater(mainWindow);

      // Skip startup check
      await vi.advanceTimersByTimeAsync(3000);
      vi.mocked(autoUpdater.checkForUpdates).mockClear();

      // Advance to 4 hours
      const FOUR_HOURS = 4 * 60 * 60 * 1000;
      await vi.advanceTimersByTimeAsync(FOUR_HOURS);

      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Handler Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Event Handlers', () => {
    beforeEach(async () => {
      const { initAutoUpdater } = await import('../updater');
      initAutoUpdater(mainWindow);
    });

    it('should send checking-for-update event to renderer', () => {
      const handler = eventHandlers.get('checking-for-update');
      expect(handler).toBeDefined();

      handler!();

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('update-status', {
        status: 'checking',
      });
    });

    it('should send update-available event with version to renderer', () => {
      const handler = eventHandlers.get('update-available');
      expect(handler).toBeDefined();

      const updateInfo: UpdateInfo = {
        version: '0.3.0',
        releaseDate: '2026-02-15',
      } as UpdateInfo;

      handler!(updateInfo);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('update-status', {
        status: 'available',
        version: '0.3.0',
      });
    });

    it('should send update-not-available event to renderer', () => {
      const handler = eventHandlers.get('update-not-available');
      expect(handler).toBeDefined();

      handler!();

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('update-status', {
        status: 'not-available',
      });
    });

    it('should send download-progress event with percent to renderer', () => {
      const handler = eventHandlers.get('download-progress');
      expect(handler).toBeDefined();

      const progress: ProgressInfo = {
        percent: 45.5,
        bytesPerSecond: 1024000,
        total: 10485760,
        transferred: 4767744,
        delta: 0,
      };

      handler!(progress);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('update-status', {
        status: 'downloading',
        percent: 45.5,
      });
    });

    it('should send update-downloaded event with version to renderer', () => {
      const handler = eventHandlers.get('update-downloaded');
      expect(handler).toBeDefined();

      const updateInfo: UpdateInfo = {
        version: '0.3.0',
        releaseDate: '2026-02-15',
      } as UpdateInfo;

      handler!(updateInfo);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('update-status', {
        status: 'ready',
        version: '0.3.0',
      });
    });

    it('should send error event with message to renderer', () => {
      const handler = eventHandlers.get('error');
      expect(handler).toBeDefined();

      const error = new Error('Network timeout');
      handler!(error);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('update-status', {
        status: 'error',
        error: 'Network timeout',
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // IPC Handler Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('IPC Handlers', () => {
    beforeEach(async () => {
      const { initAutoUpdater } = await import('../updater');
      initAutoUpdater(mainWindow);
    });

    it('should return { ok: true, updateInfo } on successful manual check', async () => {
      const handler = ipcHandlers.get('updater:check');
      expect(handler).toBeDefined();

      const result = await handler!(null);

      expect(result).toEqual({
        ok: true,
        updateInfo: {
          version: '0.3.0',
          releaseDate: '2026-02-15',
        },
      });
    });

    it('should return { ok: false, error } on failed manual check', async () => {
      vi.mocked(autoUpdater.checkForUpdates).mockRejectedValueOnce(
        new Error('Update server unreachable')
      );

      const handler = ipcHandlers.get('updater:check');
      expect(handler).toBeDefined();

      const result = await handler!(null);

      expect(result).toEqual({
        ok: false,
        error: 'Error: Update server unreachable',
      });
    });

    it('should call quitAndInstall when updater:install is invoked', () => {
      const handler = ipcHandlers.get('updater:install');
      expect(handler).toBeDefined();

      handler!(null);

      expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
    });

    it('should return current version string when updater:getVersion is invoked', () => {
      const handler = ipcHandlers.get('updater:getVersion');
      expect(handler).toBeDefined();

      const version = handler!(null);

      expect(version).toBe('0.2.0');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // BrowserWindow Lifecycle Safety Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('BrowserWindow Lifecycle Safety', () => {
    it('should handle destroyed BrowserWindow gracefully (no crash)', async () => {
      const { initAutoUpdater } = await import('../updater');

      // Create window that reports as destroyed
      const destroyedWindow = new BrowserWindow();
      vi.mocked(destroyedWindow.isDestroyed).mockReturnValue(true);

      initAutoUpdater(destroyedWindow);

      // Trigger event
      const handler = eventHandlers.get('checking-for-update');
      expect(handler).toBeDefined();

      // Should not throw
      expect(() => handler!()).not.toThrow();

      // Should not call send
      expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('should handle destroyed webContents gracefully', async () => {
      const { initAutoUpdater } = await import('../updater');

      const window = new BrowserWindow();
      vi.mocked(window.webContents.isDestroyed).mockReturnValue(true);

      initAutoUpdater(window);

      const handler = eventHandlers.get('checking-for-update');
      expect(() => handler!()).not.toThrow();
      expect(window.webContents.send).not.toHaveBeenCalled();
    });
  });
});
