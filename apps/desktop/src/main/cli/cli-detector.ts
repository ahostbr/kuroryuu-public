/**
 * CLI Provider Detector for Direct CLI Launch
 *
 * Extends cli-tool-manager.ts with provider-specific detection for:
 * - Kiro CLI
 * - Kuroryuu CLI
 * - Shell (fallback)
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { cliToolManager } from './cli-tool-manager';

/**
 * CLI Provider types for the wizard
 */
export type CliProvider = 'claude' | 'kiro' | 'kuroryuu' | 'shell';

/**
 * Extended detection result with install info
 */
export interface CliDetectionResult {
  available: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
  installCmd: string | null;
  installUrl: string | null;
}

/**
 * Provider metadata
 */
interface ProviderMeta {
  installCmd: string | null;
  installUrl: string | null;
  searchPaths: string[];
  versionFlag: string;
}

const PROVIDER_META: Record<CliProvider, ProviderMeta> = {
  claude: {
    installCmd: 'npm install -g @anthropic-ai/claude-code',
    installUrl: 'https://claude.ai/code',
    searchPaths: [], // Uses cli-tool-manager
    versionFlag: '--version',
  },
  kiro: {
    installCmd: 'npm install -g @anthropic-ai/kiro',
    installUrl: 'https://kiro.dev',
    searchPaths: [], // Uses cli-tool-manager
    versionFlag: '--version',
  },
  kuroryuu: {
    installCmd: 'pip install kuroryuu-cli',
    installUrl: null, // Bundled
    searchPaths: process.platform === 'win32'
      ? [
          'kuroryuu-cli',
          path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Scripts', 'kuroryuu-cli.exe'),
          path.join(os.homedir(), '.local', 'bin', 'kuroryuu-cli.exe'),
        ]
      : [
          'kuroryuu-cli',
          path.join(os.homedir(), '.local', 'bin', 'kuroryuu-cli'),
          '/usr/local/bin/kuroryuu-cli',
        ],
    versionFlag: '--version',
  },
  shell: {
    installCmd: null,
    installUrl: null,
    searchPaths: process.platform === 'win32'
      ? ['powershell.exe', 'cmd.exe']
      : ['bash', 'zsh', 'sh'],
    versionFlag: '--version',
  },
};

/**
 * Find executable in PATH or search paths
 */
function findExecutable(name: string, additionalPaths: string[] = []): string | null {
  const isWindows = process.platform === 'win32';
  const pathSeparator = isWindows ? ';' : ':';
  const extensions = isWindows ? ['.exe', '.cmd', '.bat', ''] : [''];

  // If it's an absolute path, check directly
  if (path.isAbsolute(name)) {
    if (existsSync(name)) return name;
    return null;
  }

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

  // Try direct execution (for commands in PATH)
  try {
    const which = isWindows ? 'where' : 'which';
    const result = execFileSync(which, [name], {
      encoding: 'utf-8',
      timeout: 3000,
      windowsHide: true,
    }).trim().split('\n')[0];
    if (result && existsSync(result)) {
      return result;
    }
  } catch {
    // Command not found
  }

  return null;
}

/**
 * Get version from CLI
 */
function getVersion(cmdPath: string, versionFlag: string): string | null {
  try {
    const isWindows = process.platform === 'win32';
    const needsShell = isWindows && (cmdPath.endsWith('.cmd') || cmdPath.endsWith('.bat'));

    const output = execFileSync(cmdPath, [versionFlag], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
      shell: needsShell,
    }).trim();

    // Extract version number
    const match = output.match(/(\d+\.\d+(?:\.\d+)?)/);
    return match ? match[1] : output.split('\n')[0].substring(0, 50);
  } catch {
    return null;
  }
}

/**
 * Detect a specific CLI provider
 */
export async function detectCli(provider: CliProvider): Promise<CliDetectionResult> {
  const meta = PROVIDER_META[provider];

  // Claude uses the existing cli-tool-manager
  if (provider === 'claude') {
    const result = cliToolManager.detectTool('claude');
    return {
      available: result.found,
      path: result.path || null,
      version: result.version || null,
      error: result.found ? null : result.message,
      installCmd: meta.installCmd,
      installUrl: meta.installUrl,
    };
  }

  // Kiro uses the existing cli-tool-manager
  if (provider === 'kiro') {
    const result = cliToolManager.detectTool('kiro');
    return {
      available: result.found,
      path: result.path || null,
      version: result.version || null,
      error: result.found ? null : result.message,
      installCmd: meta.installCmd,
      installUrl: meta.installUrl,
    };
  }

  // Shell is always available
  if (provider === 'shell') {
    const shellCmd = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    return {
      available: true,
      path: shellCmd,
      version: null,
      error: null,
      installCmd: null,
      installUrl: null,
    };
  }

  // Search for kiro/kuroryuu
  for (const searchPath of meta.searchPaths) {
    const foundPath = findExecutable(searchPath);
    if (foundPath) {
      const version = getVersion(foundPath, meta.versionFlag);
      return {
        available: true,
        path: foundPath,
        version,
        error: null,
        installCmd: meta.installCmd,
        installUrl: meta.installUrl,
      };
    }
  }

  return {
    available: false,
    path: null,
    version: null,
    error: `${provider} CLI not found`,
    installCmd: meta.installCmd,
    installUrl: meta.installUrl,
  };
}

/**
 * Detect all CLI providers at once
 */
export async function detectAllClis(): Promise<Record<CliProvider, CliDetectionResult>> {
  const providers: CliProvider[] = ['claude', 'kiro', 'kuroryuu', 'shell'];
  const results = {} as Record<CliProvider, CliDetectionResult>;

  await Promise.all(
    providers.map(async (provider) => {
      results[provider] = await detectCli(provider);
    })
  );

  return results;
}

/**
 * Get provider display info
 */
export function getProviderInfo(provider: CliProvider): {
  name: string;
  supportsSystemPrompt: boolean;
  supportsAtFiles: boolean;
  installCmd: string | null;
  installUrl: string | null;
} {
  const meta = PROVIDER_META[provider];

  const info: Record<CliProvider, { name: string; supportsSystemPrompt: boolean; supportsAtFiles: boolean }> = {
    claude: { name: 'Claude Code', supportsSystemPrompt: true, supportsAtFiles: true },
    kiro: { name: 'Kiro CLI', supportsSystemPrompt: true, supportsAtFiles: true },
    kuroryuu: { name: 'Kuroryuu CLI', supportsSystemPrompt: false, supportsAtFiles: false },
    shell: { name: 'Plain Shell', supportsSystemPrompt: false, supportsAtFiles: false },
  };

  return {
    ...info[provider],
    installCmd: meta.installCmd,
    installUrl: meta.installUrl,
  };
}
