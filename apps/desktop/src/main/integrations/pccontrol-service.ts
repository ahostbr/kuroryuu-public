/**
 * PC Control Service - Simple armed state tracking for Full Desktop Access
 *
 * This service manages the "armed" state for Full Desktop Access.
 * When armed, k_pccontrol MCP tool can control the Windows desktop
 * via PowerShell/Win32 APIs.
 *
 * The armed state is communicated to MCP Core via a flag file:
 * - Armed: writes ai/config/pccontrol-armed.flag
 * - Disarmed: deletes the flag file
 *
 * No external dependencies - pure PowerShell automation.
 */

import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getProjectRoot } from '../utils/paths';

let armed = false;
let mainWindow: BrowserWindow | null = null;

// Flag file path - MCP Core checks this to verify armed state
const FLAG_FILE = path.join(getProjectRoot(), 'ai', 'config', 'pccontrol-armed.flag');

/**
 * Write the armed flag file so MCP Core knows we're armed.
 */
function writeArmedFlag(): void {
  try {
    console.log('[PCControl] Writing armed flag to:', FLAG_FILE);
    const dir = path.dirname(FLAG_FILE);
    if (!fs.existsSync(dir)) {
      console.log('[PCControl] Creating directory:', dir);
      fs.mkdirSync(dir, { recursive: true });
    }
    const content = JSON.stringify({
      armed: true,
      timestamp: new Date().toISOString(),
      pid: process.pid,
    });
    fs.writeFileSync(FLAG_FILE, content, 'utf-8');
    console.log('[PCControl] Armed flag written successfully');
    // Verify it was written
    if (fs.existsSync(FLAG_FILE)) {
      console.log('[PCControl] Flag file verified exists');
    } else {
      console.error('[PCControl] WARNING: Flag file not found after write!');
    }
  } catch (err) {
    console.error('[PCControl] Failed to write armed flag:', err);
  }
}

/**
 * Delete the armed flag file to signal disarmed state.
 */
function deleteArmedFlag(): void {
  try {
    if (fs.existsSync(FLAG_FILE)) {
      fs.unlinkSync(FLAG_FILE);
      console.log('[PCControl] Armed flag deleted');
    }
  } catch (err) {
    console.error('[PCControl] Failed to delete armed flag:', err);
  }
}

/**
 * Check if Full Desktop Access is armed.
 */
export function isArmed(): boolean {
  return armed;
}

/**
 * Arm Full Desktop Access for this session.
 */
export function arm(): { success: boolean; error?: string } {
  try {
    armed = true;
    writeArmedFlag();
    console.log('[PCControl] ARMED - Full Desktop Access enabled');

    // Notify renderer of status change
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pccontrol:statusChanged', { armed: true });
    }

    return { success: true };
  } catch (error) {
    console.error('[PCControl] Failed to arm:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Disarm Full Desktop Access.
 */
export function disarm(): { success: boolean; error?: string } {
  try {
    armed = false;
    deleteArmedFlag();
    console.log('[PCControl] Disarmed - Full Desktop Access disabled');

    // Notify renderer of status change
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pccontrol:statusChanged', { armed: false });
    }

    return { success: true };
  } catch (error) {
    console.error('[PCControl] Failed to disarm:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get current status.
 */
export function getStatus(): { armed: boolean } {
  return { armed };
}

/**
 * Set the main window reference for status notifications.
 */
export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

/**
 * Register IPC handlers for renderer communication.
 */
export function registerPCControlHandlers(): void {
  ipcMain.handle('pccontrol:arm', () => {
    return arm();
  });

  ipcMain.handle('pccontrol:disarm', () => {
    return disarm();
  });

  ipcMain.handle('pccontrol:status', () => {
    return getStatus();
  });

  console.log('[PCControl] IPC handlers registered');
}

/**
 * Cleanup on app quit.
 */
export function cleanup(): void {
  armed = false;
  deleteArmedFlag(); // Always clean up flag file on exit
  mainWindow = null;
  console.log('[PCControl] Cleanup complete');
}
