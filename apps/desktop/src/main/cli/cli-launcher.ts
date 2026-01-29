/**
 * CLI Launcher - Build CLI commands and arguments
 *
 * Constructs the command and arguments for launching CLI providers
 * with optional system prompts and @ file references.
 */

import { CliProvider } from './cli-detector';
import { cliToolManager } from './cli-tool-manager';

/**
 * CLI configuration from the wizard
 */
export interface CliConfig {
  cliProvider: CliProvider;
  cliPath?: string;           // Optional custom path to CLI
  systemPrompt?: string;      // System prompt text (Claude only)
  atFiles?: string[];         // @ file references (Claude only)
  initialPrompt?: string;     // First message to send after launch
  cwd?: string;               // Working directory
}

/**
 * Result of building CLI arguments
 */
export interface CliLaunchConfig {
  cmd: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Build CLI command and arguments from config
 */
export function buildCliArgs(config: CliConfig): CliLaunchConfig {
  const { cliProvider, cliPath, systemPrompt, atFiles, cwd } = config;

  switch (cliProvider) {
    case 'claude':
      return buildClaudeArgs(cliPath, systemPrompt, atFiles, cwd);

    case 'kuroryuu':
      return buildKuroryuuArgs(cliPath, cwd);

    case 'shell':
    default:
      return buildShellArgs(cwd);
  }
}

/**
 * Build Claude Code CLI arguments
 *
 * Supports:
 * - --append-system-prompt "..." for system prompts
 * - @file references for context files
 */
function buildClaudeArgs(
  customPath?: string,
  systemPrompt?: string,
  atFiles?: string[],
  cwd?: string
): CliLaunchConfig {
  // Get Claude path from manager or use custom
  const cmd = customPath || cliToolManager.getToolPath('claude');
  const args: string[] = [];

  // Add system prompt if provided
  if (systemPrompt?.trim()) {
    args.push('--append-system-prompt', systemPrompt.trim());
  }

  // Add @ file references
  // Files are relative to project root, prepend @ symbol
  if (atFiles?.length) {
    for (const file of atFiles) {
      // Ensure file path starts with @
      const atFile = file.startsWith('@') ? file : `@${file}`;
      args.push(atFile);
    }
  }

  return { cmd, args, cwd };
}

/**
 * Build Kuroryuu CLI arguments
 *
 * Kuroryuu uses environment variables for configuration
 * Role is set to 'worker' when launched from desktop
 */
function buildKuroryuuArgs(customPath?: string, cwd?: string): CliLaunchConfig {
  const cmd = customPath || 'kuroryuu-cli';
  const args = ['--role', 'worker'];

  // Environment variables for Kuroryuu
  const env: Record<string, string> = {
    KURORYUU_ROLE: 'worker',
    KURORYUU_DESKTOP: '1',
  };

  return { cmd, args, env, cwd };
}

/**
 * Build shell arguments (fallback)
 */
function buildShellArgs(cwd?: string): CliLaunchConfig {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    return {
      cmd: 'powershell.exe',
      args: ['-NoLogo'],
      cwd,
    };
  }

  return {
    cmd: process.env.SHELL || 'bash',
    args: [],
    cwd,
  };
}

/**
 * Validate @ file paths
 *
 * Ensures files exist relative to the project root
 */
export function validateAtFiles(atFiles: string[], projectRoot: string): {
  valid: string[];
  invalid: string[];
} {
  const path = require('path');
  const fs = require('fs');

  const valid: string[] = [];
  const invalid: string[] = [];

  for (const file of atFiles) {
    // Remove @ prefix if present
    const cleanPath = file.startsWith('@') ? file.slice(1) : file;
    const fullPath = path.resolve(projectRoot, cleanPath);

    if (fs.existsSync(fullPath)) {
      valid.push(cleanPath);
    } else {
      invalid.push(cleanPath);
    }
  }

  return { valid, invalid };
}

/**
 * Format @ files for display
 */
export function formatAtFilesPreview(atFiles: string[]): string {
  if (!atFiles.length) return '';

  return atFiles
    .map((f) => (f.startsWith('@') ? f : `@${f}`))
    .join(' ');
}

/**
 * Generate full command string for preview
 */
export function generateCommandPreview(config: CliConfig): string {
  const { cmd, args } = buildCliArgs(config);

  // Escape arguments with spaces
  const escapedArgs = args.map((arg) => {
    if (arg.includes(' ') && !arg.startsWith('"')) {
      return `"${arg}"`;
    }
    return arg;
  });

  return [cmd, ...escapedArgs].join(' ');
}
