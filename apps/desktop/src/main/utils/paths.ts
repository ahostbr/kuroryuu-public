/**
 * Centralized Path Utilities for Kuroryuu Desktop
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
 * __dirname in main process is: apps/desktop/out/main
 * So we go up 4 levels: out -> desktop -> apps -> Kuroryuu
 */
export function getProjectRoot(): string {
  return process.env.KURORYUU_PROJECT_ROOT || path.resolve(__dirname, '../../../..');
}

/**
 * Get the apps directory (apps/)
 */
export function getAppsDir(): string {
  return path.join(getProjectRoot(), 'apps');
}

/**
 * Get the ai directory (ai/)
 */
export function getAiDir(): string {
  return path.join(getProjectRoot(), 'ai');
}

/**
 * Get the WORKING directory (WORKING/)
 */
export function getWorkingDir(): string {
  return path.join(getProjectRoot(), 'WORKING');
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
 * Get the transcribe_audio.py script path.
 */
export function getTranscribeScriptPath(): string {
  return path.join(getAppsDir(), 'desktop', 'scripts', 'transcribe_audio.py');
}

/**
 * Get the voice_input.py script path.
 */
export function getVoiceInputScriptPath(): string {
  return path.join(getAppsDir(), 'desktop', 'scripts', 'voice_input.py');
}

/**
 * Get the capture script path.
 */
export function getCaptureScriptPath(): string {
  return path.join(getAiDir(), 'capture', 'capture_ffmpeg.py');
}

// ============================================================================
// EXTERNAL TOOL PATHS
// ============================================================================

/**
 * Get FFmpeg binary directory.
 * Searches common locations in project.
 */
export function getFFmpegDir(): string | null {
  const projectRoot = getProjectRoot();

  const possiblePaths = [
    path.join(projectRoot, 'ffmpeg', 'win64', 'bin'),
    path.join(projectRoot, 'ffmpeg', 'bin'),
    path.join(projectRoot, 'ffmpeg'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Get Graphiti server directory.
 */
export function getGraphitiServerDir(): string {
  // Note: SASgraphiti-server is a sibling directory to Kuroryuu
  // If it needs to be inside the project, move it and update this
  const projectRoot = getProjectRoot();
  return path.join(path.dirname(projectRoot), 'SASgraphiti-server');
}

// ============================================================================
// CLI PROXY PATHS
// ============================================================================

/**
 * Get CLIProxyAPI data directory.
 * Returns project-local .cliproxyapi/ path.
 */
export function getCLIProxyDataDir(): string {
  return path.join(getProjectRoot(), '.cliproxyapi');
}

/**
 * Get CLIProxyAPI binary path.
 */
export function getCLIProxyBinaryPath(): string {
  const binaryName = process.platform === 'win32' ? 'CLIProxyAPIPlus.exe' : 'CLIProxyAPIPlus';
  return path.join(getCLIProxyDataDir(), binaryName);
}

/**
 * Get CLIProxyAPI config path.
 */
export function getCLIProxyConfigPath(): string {
  return path.join(getCLIProxyDataDir(), 'config.yaml');
}

/**
 * Get CLIProxyAPI auth directory.
 */
export function getCLIProxyAuthDir(): string {
  return path.join(getCLIProxyDataDir(), 'auth');
}

// ============================================================================
// CONFIGURATION PATHS
// ============================================================================

/**
 * Get the agent config file path.
 */
export function getAgentConfigPath(): string {
  return path.join(getAiDir(), 'agents_registry.json');
}

/**
 * Get the hooks directory.
 */
export function getHooksDir(): string {
  return path.join(getAiDir(), 'hooks');
}

/**
 * Get the checkpoints directory.
 */
export function getCheckpointsDir(): string {
  return path.join(getAiDir(), 'checkpoints');
}

/**
 * Get the todo.md path.
 */
export function getTodoPath(): string {
  return path.join(getAiDir(), 'todo.md');
}

// ============================================================================
// PATH RESOLUTION HELPERS
// ============================================================================

/**
 * Resolve a path relative to project root.
 */
export function resolveFromRoot(...segments: string[]): string {
  return path.join(getProjectRoot(), ...segments);
}

/**
 * Resolve a path relative to apps directory.
 */
export function resolveFromApps(...segments: string[]): string {
  return path.join(getAppsDir(), ...segments);
}

/**
 * Resolve a path relative to ai directory.
 */
export function resolveFromAi(...segments: string[]): string {
  return path.join(getAiDir(), ...segments);
}
