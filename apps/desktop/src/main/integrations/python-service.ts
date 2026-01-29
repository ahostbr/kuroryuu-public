/**
 * Python/Pip Integration Service
 *
 * Detects Python environments and manages pip package installations
 * for Full Desktop Access (Appium-Python-Client dependency).
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import { exec, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// Configuration
// ============================================================================

// Cache for project root (lazy evaluated)
let _projectRoot: string | null = null;

/**
 * Get the Kuroryuu project root directory.
 * Tries multiple methods to find the correct path.
 * Portable: works from any location by using env vars and marker file detection.
 * Lazy-evaluated and cached.
 */
function getProjectRoot(): string {
  if (_projectRoot) return _projectRoot;

  console.log('[Python] Resolving project root...');

  // 1. Environment variable (set by run_all.ps1 or setup script)
  if (process.env.KURORYUU_PROJECT_ROOT) {
    console.log('[Python] Using KURORYUU_PROJECT_ROOT:', process.env.KURORYUU_PROJECT_ROOT);
    _projectRoot = process.env.KURORYUU_PROJECT_ROOT;
    return _projectRoot;
  }

  // Legacy env var support
  if (process.env.KURORYUU_ROOT) {
    console.log('[Python] Using KURORYUU_ROOT:', process.env.KURORYUU_ROOT);
    _projectRoot = process.env.KURORYUU_ROOT;
    return _projectRoot;
  }

  // 2. Try app.getAppPath() and walk UP looking for marker file
  try {
    const appPath = app.getAppPath();
    console.log('[Python] app.getAppPath():', appPath);

    // Walk up looking for KURORYUU_BOOTSTRAP.md marker file
    let current = appPath;
    for (let i = 0; i < 10; i++) {
      const markerCheck = path.join(current, 'KURORYUU_BOOTSTRAP.md');
      console.log('[Python] Checking for marker:', markerCheck);
      if (fs.existsSync(markerCheck)) {
        console.log('[Python] Found project root via marker:', current);
        _projectRoot = current;
        return _projectRoot;
      }
      const parent = path.dirname(current);
      if (parent === current) break; // Reached filesystem root
      current = parent;
    }
  } catch (e) {
    console.error('[Python] app.getAppPath() error:', e);
  }

  // 3. Try process.cwd() and walk up
  try {
    const cwd = process.cwd();
    console.log('[Python] Trying cwd:', cwd);

    let current = cwd;
    for (let i = 0; i < 10; i++) {
      const markerCheck = path.join(current, 'KURORYUU_BOOTSTRAP.md');
      if (fs.existsSync(markerCheck)) {
        console.log('[Python] Found project root via cwd marker:', current);
        _projectRoot = current;
        return _projectRoot;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch (e) {
    console.error('[Python] cwd error:', e);
  }

  // 4. Fallback to cwd
  console.warn('[Python] Could not find project root, using cwd as fallback');
  _projectRoot = process.cwd();
  return _projectRoot;
}

/**
 * Get the venv path (lazy evaluated)
 */
function getVenvPath(): string {
  return path.join(getProjectRoot(), '.venv_mcp312');
}

// ============================================================================
// Types
// ============================================================================

export interface PythonEnvInfo {
  found: boolean;
  type: 'venv_mcp312' | 'system' | 'none';
  pythonPath: string | null;
  pipPath: string | null;
  version: string | null;
}

export interface PipInstallResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Detect available Python environment.
 * Prefers .venv_mcp312, falls back to system Python.
 */
export async function detectPythonEnv(): Promise<PythonEnvInfo> {
  console.log('[Python] Detecting Python environment...');

  const projectRoot = getProjectRoot();
  const venvDir = getVenvPath();

  console.log('[Python] PROJECT_ROOT:', projectRoot);
  console.log('[Python] VENV_DIR:', venvDir);

  // Check .venv_mcp312 first (preferred)
  const venvPython = path.join(venvDir, 'Scripts', 'python.exe');
  const venvPip = path.join(venvDir, 'Scripts', 'pip.exe');

  console.log('[Python] Checking venv path:', venvPython);
  console.log('[Python] venv exists:', fs.existsSync(venvPython));

  if (fs.existsSync(venvPython)) {
    try {
      const { stdout } = await execAsync(`"${venvPython}" --version`);
      const version = stdout.trim().replace('Python ', '');
      console.log('[Python] Found .venv_mcp312:', venvPython, 'version:', version);
      return {
        found: true,
        type: 'venv_mcp312',
        pythonPath: venvPython,
        pipPath: venvPip,
        version,
      };
    } catch (err) {
      console.error('[Python] .venv_mcp312 exists but failed version check:', err);
    }
  }

  // Check system Python
  try {
    const { stdout: wherePython } = await execAsync('where python');
    const pythonPath = wherePython.trim().split('\n')[0].trim();

    if (pythonPath) {
      const { stdout: versionOutput } = await execAsync(`"${pythonPath}" --version`);
      const version = versionOutput.trim().replace('Python ', '');
      console.log('[Python] Found system Python:', pythonPath, 'version:', version);
      return {
        found: true,
        type: 'system',
        pythonPath,
        pipPath: 'pip', // Use PATH
        version,
      };
    }
  } catch (err) {
    console.log('[Python] System Python not found in PATH:', err);
  }

  // Log detailed failure info for debugging
  console.error('[Python] Detection FAILED. Debug info:', {
    projectRoot,
    venvDir,
    venvPythonPath: venvPython,
    venvExists: fs.existsSync(venvDir),
    scriptsExists: fs.existsSync(path.join(venvDir, 'Scripts')),
    pythonExeExists: fs.existsSync(venvPython),
  });

  return {
    found: false,
    type: 'none',
    pythonPath: null,
    pipPath: null,
    version: null,
  };
}

// ============================================================================
// Package Installation
// ============================================================================

/**
 * Install Appium-Python-Client package via pip.
 * Streams output to renderer via IPC for real-time display.
 */
export async function installAppiumPackage(
  pipPath: string,
  mainWindow: BrowserWindow | null
): Promise<PipInstallResult> {
  return new Promise((resolve) => {
    console.log('[Python] Installing Appium-Python-Client via:', pipPath);

    const proc = spawn(pipPath, ['install', 'Appium-Python-Client>=3.0.0'], {
      shell: true,
      windowsHide: true,
    });

    proc.stdout.on('data', (data) => {
      const line = data.toString();
      console.log('[pip]', line.trim());
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python:pipOutput', line);
      }
    });

    proc.stderr.on('data', (data) => {
      const line = data.toString();
      console.log('[pip stderr]', line.trim());
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python:pipOutput', line);
      }
    });

    proc.on('error', (err) => {
      console.error('[Python] pip spawn error:', err);
      resolve({ success: false, error: err.message });
    });

    proc.on('close', (code) => {
      console.log('[Python] pip install exited with code:', code);
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `pip exited with code ${code}` });
      }
    });
  });
}

// ============================================================================
// Verification
// ============================================================================

/**
 * Verify that Appium can be imported in Python.
 */
export async function verifyAppiumImport(pythonPath: string): Promise<boolean> {
  try {
    console.log('[Python] Verifying Appium import with:', pythonPath);
    await execAsync(`"${pythonPath}" -c "from appium import webdriver; print('OK')"`);
    console.log('[Python] Appium import successful');
    return true;
  } catch (err) {
    console.error('[Python] Appium import failed:', err);
    return false;
  }
}

/**
 * Check if Appium-Python-Client is already installed.
 */
export async function checkAppiumInstalled(pipPath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`"${pipPath}" show Appium-Python-Client`);
    return stdout.includes('Name: Appium-Python-Client');
  } catch {
    return false;
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

let mainWindowRef: BrowserWindow | null = null;

/**
 * Set the main window reference for IPC communication.
 * Call this from main/index.ts after creating the window.
 */
export function setMainWindow(window: BrowserWindow): void {
  mainWindowRef = window;
}

/**
 * Register IPC handlers for renderer communication.
 * Call this from main/index.ts during app initialization.
 */
export function registerPythonHandlers(): void {
  console.log('[Python] ==========================================');
  console.log('[Python] Registering IPC handlers NOW');
  console.log('[Python] ==========================================');

  ipcMain.handle('python:detectEnv', async () => {
    console.log('[Python] python:detectEnv handler called!');
    try {
      const result = await detectPythonEnv();
      console.log('[Python] python:detectEnv returning:', JSON.stringify(result));
      return result;
    } catch (err) {
      console.error('[Python] python:detectEnv ERROR:', err);
      return {
        found: false,
        type: 'none' as const,
        pythonPath: null,
        pipPath: null,
        version: null,
      };
    }
  });

  ipcMain.handle('python:installAppium', async () => {
    const env = await detectPythonEnv();
    if (!env.found || !env.pipPath) {
      return { success: false, error: 'No Python environment found' };
    }
    return await installAppiumPackage(env.pipPath, mainWindowRef);
  });

  ipcMain.handle('python:verifyAppium', async () => {
    const env = await detectPythonEnv();
    if (!env.found || !env.pythonPath) {
      return false;
    }
    return await verifyAppiumImport(env.pythonPath);
  });

  ipcMain.handle('python:checkAppiumInstalled', async () => {
    const env = await detectPythonEnv();
    if (!env.found || !env.pipPath) {
      return false;
    }
    return await checkAppiumInstalled(env.pipPath);
  });

  console.log('[Python] IPC handlers registered');
}
