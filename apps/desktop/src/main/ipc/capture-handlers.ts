/**
 * Capture IPC Handlers
 * 
 * Main process IPC handlers for capture functionality.
 * Bridges renderer requests to the CaptureModule.
 * 
 * Requirements: 1.9
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { CaptureModule } from '../features/capture/module';
import { FeatureEventBus, getEventBus } from '../features/event-bus';
import { ConfigManager } from '../features/config-manager';
import { FeatureEventType } from '../features/base';

// ═══════════════════════════════════════════════════════════════════════════════
// Handler Registration
// ═══════════════════════════════════════════════════════════════════════════════

let captureModule: CaptureModule | null = null;

/**
 * Initialize capture module and register IPC handlers
 */
export async function registerCaptureHandlers(mainWindow: BrowserWindow): Promise<void> {
  const eventBus = getEventBus();
  const configManager = new ConfigManager();
  
  // Create and initialize module
  captureModule = new CaptureModule(eventBus, configManager);
  await captureModule.initialize();
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Action Handlers
  // ─────────────────────────────────────────────────────────────────────────────
  
  // Screenshot
  ipcMain.handle('capture:screenshot', async (_event, params) => {
    if (!captureModule) {
      return { success: false, error: { message: 'Capture module not initialized' } };
    }
    return captureModule.execute('screenshot', params);
  });
  
  // Start recording
  ipcMain.handle('capture:start_recording', async (_event, params) => {
    if (!captureModule) {
      return { success: false, error: { message: 'Capture module not initialized' } };
    }
    return captureModule.execute('start_recording', params);
  });
  
  // Stop recording
  ipcMain.handle('capture:stop_recording', async (_event) => {
    if (!captureModule) {
      return { success: false, error: { message: 'Capture module not initialized' } };
    }
    return captureModule.execute('stop_recording', {});
  });
  
  // Get status
  ipcMain.handle('capture:get_status', async (_event) => {
    if (!captureModule) {
      return { success: false, error: { message: 'Capture module not initialized' } };
    }
    return captureModule.execute('get_status', {});
  });
  
  // List presets
  ipcMain.handle('capture:list_presets', async (_event) => {
    if (!captureModule) {
      return { success: false, error: { message: 'Capture module not initialized' } };
    }
    return captureModule.execute('list_presets', {});
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Dialog Handler
  // ─────────────────────────────────────────────────────────────────────────────
  
  ipcMain.handle('dialog:showOpenDialog', async (_event, options) => {
    return dialog.showOpenDialog(mainWindow, options);
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Event Forwarding to Renderer
  // ─────────────────────────────────────────────────────────────────────────────
  
  // Forward capture events to renderer
  eventBus.subscribe(FeatureEventType.CAPTURE_SCREENSHOT_COMPLETE, (data) => {
    mainWindow.webContents.send('capture:screenshot:complete', data);
  });
  
  eventBus.subscribe(FeatureEventType.CAPTURE_RECORD_START, (data) => {
    mainWindow.webContents.send('capture:record:start', data);
  });
  
  eventBus.subscribe(FeatureEventType.CAPTURE_RECORD_STOP, (data) => {
    mainWindow.webContents.send('capture:record:stop', data);
  });
  
  eventBus.subscribe(FeatureEventType.CAPTURE_ERROR, (data) => {
    mainWindow.webContents.send('capture:error', data);
  });
  
  console.log('[CaptureHandlers] Registered');
}

/**
 * Unregister handlers and cleanup
 */
export async function unregisterCaptureHandlers(): Promise<void> {
  if (captureModule) {
    await captureModule.shutdown();
    captureModule = null;
  }
  
  ipcMain.removeHandler('capture:screenshot');
  ipcMain.removeHandler('capture:start_recording');
  ipcMain.removeHandler('capture:stop_recording');
  ipcMain.removeHandler('capture:get_status');
  ipcMain.removeHandler('capture:list_presets');
  ipcMain.removeHandler('dialog:showOpenDialog');
  
  console.log('[CaptureHandlers] Unregistered');
}

/**
 * Get the capture module instance (for testing)
 */
export function getCaptureModule(): CaptureModule | null {
  return captureModule;
}
