/**
 * CLI Proxy IPC Handlers
 *
 * Main process handlers for CLI Proxy (CLIProxyAPIPlus) management.
 * Native mode only - downloads and runs CLIProxyAPIPlus.exe directly.
 *
 * CLIProxyAPIPlus adds support for:
 * - GitHub Copilot (--github-copilot-login)
 * - Kiro/CodeWhisperer (--kiro-aws-authcode)
 */

import { ipcMain } from 'electron';
import { getCLIProxyNativeManager } from '../services/cliproxy-native';

/**
 * Register CLI Proxy IPC handlers
 */
export function registerCLIProxyHandlers(): void {
  // ─────────────────────────────────────────────────────────────────────────────
  // OAuth Status (works for both modes - just checks API)
  // ─────────────────────────────────────────────────────────────────────────────

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

  ipcMain.handle('cliproxy:native:config', async () => {
    try {
      const manager = getCLIProxyNativeManager();
      return { success: true, config: manager.getConfig() };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  console.log('[CLIProxy] IPC handlers registered (native mode)');
}
