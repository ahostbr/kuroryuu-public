/**
 * SDK Agent IPC Handlers
 *
 * Registers ipcMain.handle() channels for the Claude Agent SDK service.
 * Push events (message, completed, status-change) are sent via
 * webContents.send() from claude-sdk-service.ts directly.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { getClaudeSDKService } from '../services/claude-sdk-service';
import { AGENT_ROLES } from '../agent-orchestrator';
import type { SDKAgentConfig } from '../../renderer/types/sdk-agent';

export function registerSdkAgentHandlers(mainWindow: BrowserWindow): void {
  const sdk = getClaudeSDKService();
  sdk.setMainWindow(mainWindow);

  // ── Start a new agent session ──────────────────────────────────────────
  ipcMain.handle('sdk-agent:start', async (_event, config: SDKAgentConfig) => {
    try {
      const sessionId = await sdk.startAgent(config);
      return { ok: true, sessionId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Stop / cancel an agent ─────────────────────────────────────────────
  ipcMain.handle('sdk-agent:stop', async (_event, sessionId: string) => {
    try {
      await sdk.stopAgent(sessionId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Resume a previous session ──────────────────────────────────────────
  ipcMain.handle('sdk-agent:resume', async (_event, sessionId: string, prompt: string) => {
    try {
      const newSessionId = await sdk.resumeAgent(sessionId, prompt);
      return { ok: true, sessionId: newSessionId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── List all sessions (summary view) ───────────────────────────────────
  ipcMain.handle('sdk-agent:list', async () => {
    return sdk.listSessions();
  });

  // ── Get full session details ───────────────────────────────────────────
  ipcMain.handle('sdk-agent:get', async (_event, sessionId: string) => {
    return sdk.getSession(sessionId);
  });

  // ── Get messages with pagination ───────────────────────────────────────
  ipcMain.handle(
    'sdk-agent:messages',
    async (_event, sessionId: string, offset?: number, limit?: number) => {
      return sdk.getMessages(sessionId, offset ?? 0, limit ?? 100);
    },
  );

  // ── Get message count ──────────────────────────────────────────────────
  ipcMain.handle('sdk-agent:messageCount', async (_event, sessionId: string) => {
    return sdk.getMessageCount(sessionId);
  });

  // ── Get available agent roles ──────────────────────────────────────────
  ipcMain.handle('sdk-agent:roles', async () => {
    return AGENT_ROLES;
  });

  console.log('[Main] SDK Agent IPC handlers registered');
}
