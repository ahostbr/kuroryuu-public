/**
 * SDK Agent IPC Handlers
 *
 * Registers ipcMain.handle() channels for both CLI and SDK agent services.
 * Routes requests to the appropriate backend based on session ID prefix
 * or explicit config. Push events (message, completed, status-change) are
 * sent via webContents.send() from both services directly.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { getClaudeSDKService } from '../services/claude-sdk-service';
import { getCliExecutionService } from '../services/cli-execution-service';
import { AGENT_ROLES } from '../agent-orchestrator';
import type { SDKAgentConfig } from '../../renderer/types/sdk-agent';
import type { PtyManager } from '../pty/manager';

export function registerSdkAgentHandlers(mainWindow: BrowserWindow, ptyManager?: PtyManager | null): void {
  const sdk = getClaudeSDKService();
  const cli = getCliExecutionService();

  sdk.setMainWindow(mainWindow);
  cli.setMainWindow(mainWindow);

  // Inject PtyManager for PTY-mode execution
  if (ptyManager) {
    cli.setPtyManager(ptyManager);
  }

  // ── Start a new agent session ──────────────────────────────────────────
  ipcMain.handle('sdk-agent:start', async (_event, config: SDKAgentConfig & { executionBackend?: string; executionMode?: string }) => {
    try {
      // Route by backend
      if (config.executionBackend === 'cli') {
        const cliConfig = {
          prompt: config.prompt,
          model: config.model,
          cwd: config.cwd,
          maxTurns: config.maxTurns,
          timeoutMinutes: undefined as number | undefined,
          dangerouslySkipPermissions: config.permissionMode === 'bypassPermissions' || !config.permissionMode,
          permissionMode: config.permissionMode,
        };

        // Route to PTY or JSONL based on executionMode
        if (config.executionMode === 'pty') {
          return cli.startAgentPty(cliConfig);
        }
        return cli.startAgent(cliConfig);
      }
      const sessionId = await sdk.startAgent(config);
      return { ok: true, sessionId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Stop / cancel an agent ─────────────────────────────────────────────
  ipcMain.handle('sdk-agent:stop', async (_event, sessionId: string) => {
    try {
      if (cli.hasSession(sessionId)) {
        return cli.stopAgent(sessionId);
      }
      await sdk.stopAgent(sessionId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Resume a previous session ──────────────────────────────────────────
  ipcMain.handle('sdk-agent:resume', async (_event, sessionId: string, prompt: string) => {
    try {
      // CLI sessions can't be resumed — only SDK sessions
      const newSessionId = await sdk.resumeAgent(sessionId, prompt);
      return { ok: true, sessionId: newSessionId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── List all sessions (summary view) ───────────────────────────────────
  ipcMain.handle('sdk-agent:list', async () => {
    const sdkSessions = sdk.listSessions();
    const cliSessions = cli.listSessions();
    return [...cliSessions, ...sdkSessions]; // CLI first (active work)
  });

  // ── Get full session details ───────────────────────────────────────────
  ipcMain.handle('sdk-agent:get', async (_event, sessionId: string) => {
    if (cli.hasSession(sessionId)) {
      return cli.getSession(sessionId);
    }
    return sdk.getSession(sessionId);
  });

  // ── Get messages with pagination ───────────────────────────────────────
  ipcMain.handle(
    'sdk-agent:messages',
    async (_event, sessionId: string, offset?: number, limit?: number) => {
      if (cli.hasSession(sessionId)) {
        return cli.getMessages(sessionId, offset ?? 0, limit ?? 100);
      }
      return sdk.getMessages(sessionId, offset ?? 0, limit ?? 100);
    },
  );

  // ── Get message count ──────────────────────────────────────────────────
  ipcMain.handle('sdk-agent:messageCount', async (_event, sessionId: string) => {
    if (cli.hasSession(sessionId)) {
      return cli.getMessageCount(sessionId);
    }
    return sdk.getMessageCount(sessionId);
  });

  // ── Get available agent roles ──────────────────────────────────────────
  ipcMain.handle('sdk-agent:roles', async () => {
    return AGENT_ROLES;
  });

  console.log('[Main] SDK Agent + CLI IPC handlers registered');
}
