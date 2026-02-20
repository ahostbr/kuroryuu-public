/**
 * Hook path helpers for Claude Code compatibility.
 *
 * CC 2.1.47+ runs hooks through Git Bash on Windows instead of cmd.exe.
 * Windows backslash paths (C:\Users\...) get mangled by bash — we must
 * emit Git Bash paths (/c/Users/...) for direct commands, and use
 * single-quoted PowerShell wrapping to prevent bash from processing
 * backslashes inside PS -Command strings.
 */

import { detectTool } from '../cli/cli-tool-manager';

let _hooksUseBash: boolean | null = null;

/** CC >= 2.1.47 runs hooks via Git Bash on Windows. Older uses cmd.exe. */
export function hooksUseBash(): boolean {
  if (_hooksUseBash !== null) return _hooksUseBash;
  if (process.platform !== 'win32') {
    _hooksUseBash = true; // Unix always uses bash
    return true;
  }
  try {
    const info = detectTool('claude');
    if (!info.found || !info.version) {
      _hooksUseBash = true; // Default to bash (safer — modern CC)
      return true;
    }
    // Parse "2.1.47" -> compare against threshold
    const parts = info.version.split('.').map(Number);
    const [major = 0, minor = 0, patch = 0] = parts;
    // 2.1.47+ uses bash for hooks
    _hooksUseBash =
      major > 2 ||
      (major === 2 && minor > 1) ||
      (major === 2 && minor === 1 && patch >= 47);
  } catch {
    _hooksUseBash = true; // Detection failed — assume modern CC
  }
  return _hooksUseBash;
}

/** Convert Windows path to Git Bash format: C:\Users\Ryan -> /c/Users/Ryan */
export function toGitBashPath(winPath: string): string {
  return winPath
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`);
}

/**
 * Escape a path for embedding in hook command strings.
 * - CC >= 2.1.47 on Windows: convert to Git Bash format (/c/Users/...)
 * - Older CC on Windows: double-backslash escape (C:\\Users\\...)
 * - Unix: return as-is
 */
export function escapePathForHooks(p: string): string {
  if (process.platform === 'win32') {
    return hooksUseBash() ? toGitBashPath(p) : p.replace(/\\/g, '\\\\');
  }
  return p;
}

/** Reset cached detection (for testing or after CC update). */
export function resetHooksBashCache(): void {
  _hooksUseBash = null;
}
