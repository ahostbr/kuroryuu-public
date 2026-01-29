/**
 * Centralized Path Utilities for Kuroryuu Tray Companion
 *
 * Provides path-agnostic helpers that work regardless of where the repo is located.
 * All paths are derived from either:
 * 1. KURORYUU_PROJECT_ROOT environment variable (set by desktop app on startup)
 * 2. __dirname-based calculation (fallback for development)
 */

import * as path from 'path';
import { existsSync } from 'fs';

// ============================================================================
// PROJECT ROOT DETECTION
// ============================================================================

/**
 * Get the project root directory.
 * __dirname in main process is: apps/tray_companion/out/main
 * So we go up 4 levels: out -> tray_companion -> apps -> Kuroryuu
 */
export function getProjectRoot(): string {
  return process.env.KURORYUU_PROJECT_ROOT || path.resolve(__dirname, '../../../..');
}

// ============================================================================
// PYTHON ENVIRONMENT
// ============================================================================

/**
 * Get the Python executable path.
 * Searches for venv in project root, falls back to system Python.
 */
export function getPythonExe(): string {
  const projectRoot = getProjectRoot();

  const possiblePaths = [
    // Primary venv (Python 3.12 for MCP)
    path.join(projectRoot, '.venv_mcp312', 'Scripts', 'python.exe'),
    // Alternative venv
    path.join(projectRoot, '.venv', 'Scripts', 'python.exe'),
    // Linux/Mac paths
    path.join(projectRoot, '.venv_mcp312', 'bin', 'python'),
    path.join(projectRoot, '.venv', 'bin', 'python'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Fall back to system Python
  return 'python';
}

// ============================================================================
// SCRIPT PATHS
// ============================================================================

/**
 * Get the voice_input.py script path.
 */
export function getVoiceInputScriptPath(): string {
  return path.join(getProjectRoot(), 'apps', 'tray_companion', 'scripts', 'voice_input.py');
}
