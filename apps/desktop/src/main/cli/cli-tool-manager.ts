/**
 * CLI Tool Manager for Kuroryuu
 *
 * Centralized management for CLI tools (Kiro, Git, Python) used throughout
 * the application. Provides intelligent multi-level detection with user
 * configuration support.
 *
 * Detection Priority:
 * 1. User configuration (from settings)
 * 2. Homebrew (macOS - architecture-aware for Apple Silicon vs Intel)
 * 3. System PATH
 * 4. Platform-specific standard locations
 * 5. NVM paths (for npm-installed kiro)
 *
 * Ported from: Auto-Claude-develop/apps/frontend/src/main/cli-tool-manager.ts
 */

import { execFileSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Supported CLI tools
 */
export type CLITool = 'claude' | 'kiro' | 'git' | 'python';

/**
 * User configuration for CLI tool paths
 */
export interface ToolConfig {
  kiroPath?: string;
  gitPath?: string;
  pythonPath?: string;
}

/**
 * Detection result for a CLI tool
 */
export interface ToolDetectionResult {
  found: boolean;
  path?: string;
  version?: string;
  source: string;
  message: string;
}

/**
 * Cache entry for detected tool path
 */
interface CacheEntry {
  path: string;
  version?: string;
  source: string;
}

/**
 * Internal validation result
 */
interface ToolValidation {
  valid: boolean;
  version?: string;
  message: string;
}

/**
 * Check if a path is from a different platform
 */
function isWrongPlatformPath(pathStr: string | undefined): boolean {
  if (!pathStr) return false;

  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // On Windows, reject Unix-style absolute paths
    if (pathStr.startsWith('/') && !pathStr.startsWith('//')) {
      return true;
    }
  } else {
    // On Unix, reject Windows-style paths
    if (/^[A-Za-z]:[/\\]/.test(pathStr)) {
      return true;
    }
    if (pathStr.includes('\\')) {
      return true;
    }
  }

  return false;
}

/**
 * Find executable in PATH
 */
function findExecutable(name: string): string | null {
  const isWindows = process.platform === 'win32';
  const pathSeparator = isWindows ? ';' : ':';
  const extensions = isWindows ? ['.exe', '.cmd', '.bat', ''] : [''];
  
  // Augment PATH with common locations
  const additionalPaths = isWindows
    ? [
        path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
        'C:\\Program Files\\Git\\bin',
      ]
    : [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        path.join(os.homedir(), '.local', 'bin'),
        path.join(os.homedir(), 'bin'),
      ];

  const searchPaths = [
    ...(process.env.PATH?.split(pathSeparator) || []),
    ...additionalPaths,
  ];

  for (const dir of searchPaths) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, name + ext);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Centralized CLI Tool Manager
 */
class CLIToolManager {
  private cache: Map<CLITool, CacheEntry> = new Map();
  private userConfig: ToolConfig = {};

  /**
   * Configure with user settings
   */
  configure(config: ToolConfig): void {
    this.userConfig = config;
    this.cache.clear();
    console.log('[CLI Tools] Configuration updated, cache cleared');
  }

  /**
   * Get the path for a CLI tool
   */
  getToolPath(tool: CLITool): string {
    // Check cache first
    const cached = this.cache.get(tool);
    if (cached) {
      return cached.path;
    }

    // Detect and cache
    const result = this.detectTool(tool);
    if (result.found && result.path) {
      this.cache.set(tool, {
        path: result.path,
        version: result.version,
        source: result.source,
      });
      console.log(`[CLI Tools] Detected ${tool}: ${result.path} (${result.source})`);
      return result.path;
    }

    // Fallback to tool name
    console.log(`[CLI Tools] ${tool} not found, using fallback: "${tool}"`);
    return tool;
  }

  /**
   * Get detection result for a tool (includes metadata)
   */
  detectTool(tool: CLITool): ToolDetectionResult {
    switch (tool) {
      case 'claude':
        return this.detectClaude();
      case 'kiro':
        return this.detectKiro();
      case 'git':
        return this.detectGit();
      case 'python':
        return this.detectPython();
      default:
        return {
          found: false,
          source: 'fallback',
          message: `Unknown tool: ${tool}`,
        };
    }
  }

  /**
   * Clear cache (call when settings change)
   */
  clearCache(): void {
    this.cache.clear();
  }

  // =====================================================================
  // CLAUDE DETECTION
  // =====================================================================

  private detectClaude(): ToolDetectionResult {
    // System PATH
    const claudePath = findExecutable('claude');
    if (claudePath) {
      const validation = this.validateClaude(claudePath);
      if (validation.valid) {
        return {
          found: true,
          path: claudePath,
          version: validation.version,
          source: 'system-path',
          message: `Using system Claude CLI: ${claudePath}`,
        };
      }
    }

    // Platform-specific locations
    const homeDir = os.homedir();
    const platformPaths = process.platform === 'win32'
      ? [
          path.join(homeDir, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
          path.join(homeDir, '.local', 'bin', 'claude.exe'),
        ]
      : [
          path.join(homeDir, '.local', 'bin', 'claude'),
          '/usr/local/bin/claude',
          '/opt/homebrew/bin/claude',
        ];

    for (const claudePath of platformPaths) {
      if (existsSync(claudePath)) {
        const validation = this.validateClaude(claudePath);
        if (validation.valid) {
          return {
            found: true,
            path: claudePath,
            version: validation.version,
            source: 'system-path',
            message: `Using Claude CLI: ${claudePath}`,
          };
        }
      }
    }

    return {
      found: false,
      source: 'fallback',
      message: 'Claude CLI not found. Install from https://claude.ai/code',
    };
  }

  private validateClaude(claudeCmd: string): ToolValidation {
    try {
      const needsShell = process.platform === 'win32' &&
        (claudeCmd.endsWith('.cmd') || claudeCmd.endsWith('.bat'));

      const version = execFileSync(claudeCmd, ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
        shell: needsShell,
      }).trim();

      const match = version.match(/(\d+\.\d+\.\d+)/);
      const versionStr = match ? match[1] : version.split('\n')[0];

      return {
        valid: true,
        version: versionStr,
        message: `Claude CLI ${versionStr} is available`,
      };
    } catch (error) {
      return {
        valid: false,
        message: `Failed to validate Claude CLI: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // =====================================================================
  // KIRO DETECTION
  // =====================================================================

  private detectKiro(): ToolDetectionResult {
    // 1. User configuration
    if (this.userConfig.kiroPath) {
      if (isWrongPlatformPath(this.userConfig.kiroPath)) {
        console.log(`[Kiro CLI] User path is from different platform, ignoring`);
      } else {
        const validation = this.validateKiro(this.userConfig.kiroPath);
        if (validation.valid) {
          return {
            found: true,
            path: this.userConfig.kiroPath,
            version: validation.version,
            source: 'user-config',
            message: `Using user-configured Kiro CLI: ${this.userConfig.kiroPath}`,
          };
        }
      }
    }

    // 2. Homebrew (macOS)
    if (process.platform === 'darwin') {
      const homebrewPaths = [
        '/opt/homebrew/bin/kiro', // Apple Silicon
        '/usr/local/bin/kiro',    // Intel Mac
      ];

      for (const kiroPath of homebrewPaths) {
        if (existsSync(kiroPath)) {
          const validation = this.validateKiro(kiroPath);
          if (validation.valid) {
            return {
              found: true,
              path: kiroPath,
              version: validation.version,
              source: 'homebrew',
              message: `Using Homebrew Kiro CLI: ${kiroPath}`,
            };
          }
        }
      }
    }

    // 3. System PATH
    const kiroPath = findExecutable('kiro');
    if (kiroPath) {
      const validation = this.validateKiro(kiroPath);
      if (validation.valid) {
        return {
          found: true,
          path: kiroPath,
          version: validation.version,
          source: 'system-path',
          message: `Using system Kiro CLI: ${kiroPath}`,
        };
      }
    }

    // 4. Platform-specific locations
    const homeDir = os.homedir();
    const platformPaths = process.platform === 'win32'
      ? [
          path.join(homeDir, 'AppData', 'Local', 'Programs', 'kiro', 'kiro.exe'),
          path.join(homeDir, 'AppData', 'Roaming', 'npm', 'kiro.cmd'),
          path.join(homeDir, '.local', 'bin', 'kiro.exe'),
          'C:\\Program Files\\Kiro\\kiro.exe',
          'C:\\Program Files (x86)\\Kiro\\kiro.exe',
        ]
      : [
          path.join(homeDir, '.local', 'bin', 'kiro'),
          path.join(homeDir, 'bin', 'kiro'),
        ];

    // 4.5. NVM paths (Unix only)
    if (process.platform !== 'win32') {
      const nvmVersionsDir = path.join(homeDir, '.nvm', 'versions', 'node');
      try {
        if (existsSync(nvmVersionsDir)) {
          const nodeVersions = readdirSync(nvmVersionsDir, { withFileTypes: true });
          const versionDirs = nodeVersions
            .filter((entry) => entry.isDirectory() && entry.name.startsWith('v'))
            .sort((a, b) => {
              const vA = a.name.slice(1).split('.').map(Number);
              const vB = b.name.slice(1).split('.').map(Number);
              for (let i = 0; i < 3; i++) {
                const diff = (vB[i] ?? 0) - (vA[i] ?? 0);
                if (diff !== 0) return diff;
              }
              return 0;
            });

          for (const entry of versionDirs) {
            const nvmKiroPath = path.join(nvmVersionsDir, entry.name, 'bin', 'kiro');
            if (existsSync(nvmKiroPath)) {
              const validation = this.validateKiro(nvmKiroPath);
              if (validation.valid) {
                return {
                  found: true,
                  path: nvmKiroPath,
                  version: validation.version,
                  source: 'nvm',
                  message: `Using NVM Kiro CLI: ${nvmKiroPath}`,
                };
              }
            }
          }
        }
      } catch {
        // Silently fail if unable to read NVM directory
      }
    }

    for (const kiroPath of platformPaths) {
      if (existsSync(kiroPath)) {
        const validation = this.validateKiro(kiroPath);
        if (validation.valid) {
          return {
            found: true,
            path: kiroPath,
            version: validation.version,
            source: 'system-path',
            message: `Using Kiro CLI: ${kiroPath}`,
          };
        }
      }
    }

    // Not found
    return {
      found: false,
      source: 'fallback',
      message: 'Kiro CLI not found. Install from https://kiro.dev',
    };
  }

  private validateKiro(kiroCmd: string): ToolValidation {
    try {
      const needsShell = process.platform === 'win32' &&
        (kiroCmd.endsWith('.cmd') || kiroCmd.endsWith('.bat'));

      const version = execFileSync(kiroCmd, ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
        shell: needsShell,
      }).trim();

      const match = version.match(/(\d+\.\d+\.\d+)/);
      const versionStr = match ? match[1] : version.split('\n')[0];

      return {
        valid: true,
        version: versionStr,
        message: `Kiro CLI ${versionStr} is available`,
      };
    } catch (error) {
      return {
        valid: false,
        message: `Failed to validate Kiro CLI: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // =====================================================================
  // GIT DETECTION
  // =====================================================================

  private detectGit(): ToolDetectionResult {
    // 1. User configuration
    if (this.userConfig.gitPath && !isWrongPlatformPath(this.userConfig.gitPath)) {
      const validation = this.validateGit(this.userConfig.gitPath);
      if (validation.valid) {
        return {
          found: true,
          path: this.userConfig.gitPath,
          version: validation.version,
          source: 'user-config',
          message: `Using user-configured Git: ${this.userConfig.gitPath}`,
        };
      }
    }

    // 2. System PATH
    const gitPath = findExecutable('git');
    if (gitPath) {
      const validation = this.validateGit(gitPath);
      if (validation.valid) {
        return {
          found: true,
          path: gitPath,
          version: validation.version,
          source: 'system-path',
          message: `Using system Git: ${gitPath}`,
        };
      }
    }

    // 3. Platform-specific locations
    const platformPaths = process.platform === 'win32'
      ? [
          'C:\\Program Files\\Git\\bin\\git.exe',
          'C:\\Program Files (x86)\\Git\\bin\\git.exe',
        ]
      : [
          '/usr/bin/git',
          '/usr/local/bin/git',
          '/opt/homebrew/bin/git',
        ];

    for (const gitPath of platformPaths) {
      if (existsSync(gitPath)) {
        const validation = this.validateGit(gitPath);
        if (validation.valid) {
          return {
            found: true,
            path: gitPath,
            version: validation.version,
            source: 'system-path',
            message: `Using Git: ${gitPath}`,
          };
        }
      }
    }

    return {
      found: false,
      source: 'fallback',
      message: 'Git not found. Install from https://git-scm.com/downloads',
    };
  }

  private validateGit(gitCmd: string): ToolValidation {
    try {
      const version = execFileSync(gitCmd, ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      }).trim();

      const match = version.match(/git version (\d+\.\d+\.\d+)/);
      const versionStr = match ? match[1] : version;

      return {
        valid: true,
        version: versionStr,
        message: `Git ${versionStr} is available`,
      };
    } catch (error) {
      return {
        valid: false,
        message: `Failed to validate Git: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // =====================================================================
  // PYTHON DETECTION
  // =====================================================================

  private detectPython(): ToolDetectionResult {
    // 1. User configuration
    if (this.userConfig.pythonPath && !isWrongPlatformPath(this.userConfig.pythonPath)) {
      const validation = this.validatePython(this.userConfig.pythonPath);
      if (validation.valid) {
        return {
          found: true,
          path: this.userConfig.pythonPath,
          version: validation.version,
          source: 'user-config',
          message: `Using user-configured Python: ${this.userConfig.pythonPath}`,
        };
      }
    }

    // 2. System PATH (python3 first, then python)
    for (const name of ['python3', 'python']) {
      const pythonPath = findExecutable(name);
      if (pythonPath) {
        const validation = this.validatePython(pythonPath);
        if (validation.valid) {
          return {
            found: true,
            path: pythonPath,
            version: validation.version,
            source: 'system-path',
            message: `Using system Python: ${pythonPath}`,
          };
        }
      }
    }

    // 3. Platform-specific locations
    const platformPaths = process.platform === 'win32'
      ? [
          'C:\\Python312\\python.exe',
          'C:\\Python311\\python.exe',
          'C:\\Python310\\python.exe',
        ]
      : [
          '/usr/bin/python3',
          '/usr/local/bin/python3',
          '/opt/homebrew/bin/python3',
        ];

    for (const pythonPath of platformPaths) {
      if (existsSync(pythonPath)) {
        const validation = this.validatePython(pythonPath);
        if (validation.valid) {
          return {
            found: true,
            path: pythonPath,
            version: validation.version,
            source: 'system-path',
            message: `Using Python: ${pythonPath}`,
          };
        }
      }
    }

    return {
      found: false,
      source: 'fallback',
      message: 'Python 3.10+ not found',
    };
  }

  private validatePython(pythonCmd: string): ToolValidation {
    const MINIMUM_VERSION = '3.10.0';

    try {
      const version = execFileSync(pythonCmd, ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      }).trim();

      const match = version.match(/Python (\d+\.\d+\.\d+)/);
      if (!match) {
        return { valid: false, message: 'Unable to detect Python version' };
      }

      const versionStr = match[1];
      const [major, minor] = versionStr.split('.').map(Number);
      const [reqMajor, reqMinor] = MINIMUM_VERSION.split('.').map(Number);

      if (major < reqMajor || (major === reqMajor && minor < reqMinor)) {
        return {
          valid: false,
          version: versionStr,
          message: `Python ${versionStr} is below minimum ${MINIMUM_VERSION}`,
        };
      }

      return {
        valid: true,
        version: versionStr,
        message: `Python ${versionStr} is available`,
      };
    } catch (error) {
      return {
        valid: false,
        message: `Failed to validate Python: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// Singleton instance
const cliToolManager = new CLIToolManager();

// Export convenience functions
export function getToolPath(tool: CLITool): string {
  return cliToolManager.getToolPath(tool);
}

export function detectTool(tool: CLITool): ToolDetectionResult {
  return cliToolManager.detectTool(tool);
}

export function configureTools(config: ToolConfig): void {
  cliToolManager.configure(config);
}

export function clearToolCache(): void {
  cliToolManager.clearCache();
}

export { cliToolManager };
