/**
 * CLI Proxy IPC Handlers
 *
 * Main process handlers for CLI Proxy (CLIProxyAPIPlus) management.
 * Supports both Docker mode and Native mode.
 *
 * CLIProxyAPIPlus adds support for:
 * - GitHub Copilot (--github-copilot-login)
 * - Kiro/CodeWhisperer (--kiro-aws-authcode)
 */

import { ipcMain } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getCLIProxyNativeManager } from '../services/cliproxy-native';

const execAsync = promisify(exec);

// Docker container path - user-configurable via CLIProxyAPI Wizard
// Set CLIPROXYAPI_DOCKER_PATH env var or configure in settings
const DEFAULT_CONTAINER_PATH = process.env.CLIPROXYAPI_DOCKER_PATH || '';

/**
 * Register CLI Proxy IPC handlers
 */
export function registerCLIProxyHandlers(): void {
  // ─────────────────────────────────────────────────────────────────────────────
  // Docker Status
  // ─────────────────────────────────────────────────────────────────────────────

  ipcMain.handle('cliproxy:docker:check', async () => {
    try {
      // Check Docker version
      await execAsync('docker --version');

      // Check Docker daemon is running
      await execAsync('docker info', { timeout: 10000 });

      return { installed: true, running: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);

      // Distinguish between not installed and not running
      if (error.includes('not recognized') || error.includes('not found')) {
        return { installed: false, running: false, error: 'Docker not installed' };
      }
      if (error.includes('daemon') || error.includes('Cannot connect')) {
        return { installed: true, running: false, error: 'Docker daemon not running' };
      }

      return { installed: false, running: false, error };
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Container Management
  // ─────────────────────────────────────────────────────────────────────────────

  ipcMain.handle('cliproxy:container:status', async () => {
    try {
      const { stdout } = await execAsync(
        'docker ps --filter name=cli-proxy-api --format "{{.Status}}"',
        { timeout: 10000 }
      );

      const status = stdout.trim();
      const running = status.toLowerCase().includes('up');

      return { running, status: status || 'Not found' };
    } catch (e) {
      return { running: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('cliproxy:container:start', async (_event, containerPath?: string) => {
    const path = containerPath || DEFAULT_CONTAINER_PATH;

    try {
      // Run docker compose up in the container directory
      await execAsync(`cd /d "${path}" && docker compose up -d`, {
        timeout: 60000,
        shell: 'cmd.exe',
      });

      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('cliproxy:container:stop', async () => {
    try {
      await execAsync(
        `cd /d "${DEFAULT_CONTAINER_PATH}" && docker compose down`,
        { timeout: 30000, shell: 'cmd.exe' }
      );
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // OAuth Management
  // ─────────────────────────────────────────────────────────────────────────────

  ipcMain.handle('cliproxy:oauth:start', async (_event, provider: string) => {
    // Map provider names to CLI flags (CLIProxyAPIPlus)
    const flags: Record<string, string> = {
      gemini: '-login',
      claude: '-claude-login',
      codex: '-codex-login',
      copilot: '-github-copilot-login',
      kiro: '-kiro-aws-authcode',
    };

    const flag = flags[provider];
    if (!flag) {
      return { error: `Unknown provider: ${provider}` };
    }

    try {
      // Start OAuth flow in container with no-browser flag
      // This will output the URL for manual authentication
      const { stdout, stderr } = await execAsync(
        `docker exec cli-proxy-api /CLIProxyAPIPlus/CLIProxyAPIPlus ${flag} -no-browser -config /CLIProxyAPIPlus/config.yaml`,
        { timeout: 15000 }
      );

      const output = stdout + stderr;

      // Parse URL from output
      // Look for patterns like "https://accounts.google.com/..." or "https://claude.ai/..." or "https://auth.openai.com/..."
      const urlMatch = output.match(/https:\/\/[^\s\n]+/);

      if (urlMatch) {
        return { url: urlMatch[0], output };
      }

      // Check if already authenticated
      if (output.includes('already authenticated') || output.includes('token valid')) {
        return { authenticated: true, output };
      }

      return { error: 'Could not parse OAuth URL from output', output };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);

      // OAuth commands may "timeout" while waiting for callback - this is expected
      if (error.includes('timeout') || error.includes('ETIMEDOUT')) {
        return { waiting: true, error: 'OAuth waiting for browser callback' };
      }

      return { error };
    }
  });

  ipcMain.handle('cliproxy:oauth:status', async () => {
    try {
      // Fetch models to determine which providers are authenticated
      const response = await fetch('http://127.0.0.1:8317/v1/models', {
        headers: { 'Authorization': 'Bearer kuroryuu-local' },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { gemini: 0, claude: 0, openai: 0, copilot: 0, kiro: 0, total: 0, error: 'API not responding' };
      }

      const data = await response.json();
      const models = data.data || [];

      // Group by provider
      const gemini = models.filter((m: { id: string }) =>
        m.id.toLowerCase().includes('gemini')
      ).length;

      const claude = models.filter((m: { id: string }) =>
        m.id.toLowerCase().includes('claude')
      ).length;

      const openai = models.filter((m: { id: string }) =>
        /gpt|o1|codex/i.test(m.id)
      ).length;

      const copilot = models.filter((m: { id: string }) =>
        m.id.toLowerCase().includes('copilot')
      ).length;

      const kiro = models.filter((m: { id: string }) =>
        /kiro|codewhisperer|amazon-q/i.test(m.id)
      ).length;

      return {
        gemini,
        claude,
        openai,
        copilot,
        kiro,
        total: models.length,
      };
    } catch (e) {
      return {
        gemini: 0,
        claude: 0,
        openai: 0,
        copilot: 0,
        kiro: 0,
        total: 0,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Native Mode Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  ipcMain.handle('cliproxy:native:provision', async () => {
    try {
      const manager = getCLIProxyNativeManager();
      return await manager.provision();
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('cliproxy:native:start', async () => {
    try {
      const manager = getCLIProxyNativeManager();
      return await manager.start();
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('cliproxy:native:stop', async () => {
    try {
      const manager = getCLIProxyNativeManager();
      return await manager.stop();
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('cliproxy:native:restart', async () => {
    try {
      const manager = getCLIProxyNativeManager();
      return await manager.restart();
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('cliproxy:native:status', async () => {
    try {
      const manager = getCLIProxyNativeManager();
      return await manager.status();
    } catch (e) {
      return {
        running: false,
        provisioned: false,
        healthy: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle('cliproxy:native:oauth', async (_event, provider: string) => {
    try {
      const manager = getCLIProxyNativeManager();
      const providerMap: Record<string, 'gemini' | 'antigravity' | 'claude' | 'codex' | 'copilot' | 'kiro'> = {
        gemini: 'gemini',
        antigravity: 'antigravity',
        claude: 'claude',
        openai: 'codex',
        codex: 'codex',
        copilot: 'copilot',
        kiro: 'kiro',
      };
      const mappedProvider = providerMap[provider];
      if (!mappedProvider) {
        return { error: `Unknown provider: ${provider}` };
      }
      return await manager.startOAuth(mappedProvider);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Update Check Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  ipcMain.handle('cliproxy:native:check-update', async () => {
    try {
      const manager = getCLIProxyNativeManager();
      return await manager.checkForUpdate();
    } catch (e) {
      return {
        updateAvailable: false,
        currentVersion: null,
        latestVersion: 'unknown',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle('cliproxy:native:pending-update', () => {
    return (global as Record<string, unknown>).cliproxyUpdatePending || null;
  });

  ipcMain.handle('cliproxy:update-response', async (_event, choice: 'auto' | 'manual') => {
    (global as Record<string, unknown>).cliproxyUpdatePending = null;

    if (choice === 'auto') {
      try {
        const manager = getCLIProxyNativeManager();
        await manager.forceKillAll();
        const provision = await manager.provision();
        if (provision.success) {
          const start = await manager.start();
          return { success: start.success, version: provision.version };
        }
        return { success: false, error: provision.error };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    // Manual — user will handle it
    return { success: true, skipped: true };
  });

  ipcMain.handle('cliproxy:native:config', async () => {
    try {
      const manager = getCLIProxyNativeManager();
      return { success: true, config: manager.getConfig() };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  console.log('[CLIProxy] IPC handlers registered');
}
