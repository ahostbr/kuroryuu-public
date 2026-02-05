/**
 * Claude Teams IPC Bridge
 *
 * Connects the renderer process to the Claude Teams file watcher service
 * and provides handlers for CLI operations (fire-and-forget).
 *
 * IPC Channels:
 *   claude-teams:start-watching  - Start watcher, returns full snapshot
 *   claude-teams:stop-watching   - Stop watcher
 *   claude-teams:get-teams       - Read all teams from disk
 *   claude-teams:get-tasks       - Read tasks for a given team
 *   claude-teams:get-messages    - Read inbox for team + agent
 *   claude-teams:exec-cli        - Spawn a claude CLI command (fire-and-forget)
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { claudeTeamsWatcher } from './claude-teams-watcher';

/**
 * Register all Claude Teams IPC handlers and configure the watcher.
 */
export function setupClaudeTeamsIpc(mainWindow: BrowserWindow): void {
  // Give the watcher a reference to the main window for push events
  claudeTeamsWatcher.setMainWindow(mainWindow);

  // -----------------------------------------------------------------------
  // Watcher lifecycle
  // -----------------------------------------------------------------------

  ipcMain.handle('claude-teams:start-watching', async () => {
    try {
      const snapshot = await claudeTeamsWatcher.start();
      return { ok: true, snapshot };
    } catch (err) {
      console.error('[ClaudeTeamsIPC] Failed to start watching:', err);
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('claude-teams:stop-watching', async () => {
    try {
      await claudeTeamsWatcher.stop();
      return { ok: true };
    } catch (err) {
      console.error('[ClaudeTeamsIPC] Failed to stop watching:', err);
      return { ok: false, error: String(err) };
    }
  });

  // -----------------------------------------------------------------------
  // Data reads (on-demand, not watcher-driven)
  // -----------------------------------------------------------------------

  ipcMain.handle('claude-teams:get-teams', async () => {
    try {
      const snapshot = await claudeTeamsWatcher.getFullSnapshot();
      return { ok: true, teams: snapshot.teams };
    } catch (err) {
      return { ok: false, error: String(err), teams: [] };
    }
  });

  ipcMain.handle(
    'claude-teams:get-tasks',
    async (_event, teamName: string) => {
      try {
        const tasks = await claudeTeamsWatcher.readAllTasks(teamName);
        return { ok: true, tasks };
      } catch (err) {
        return { ok: false, error: String(err), tasks: [] };
      }
    },
  );

  ipcMain.handle(
    'claude-teams:get-messages',
    async (_event, teamName: string, agentName: string) => {
      try {
        const messages = await claudeTeamsWatcher.readInbox(teamName, agentName);
        return { ok: true, messages: messages ?? [] };
      } catch (err) {
        return { ok: false, error: String(err), messages: [] };
      }
    },
  );

  // -----------------------------------------------------------------------
  // CLI execution (fire-and-forget)
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'claude-teams:exec-cli',
    async (_event, args: string[]) => {
      try {
        // Spawn claude CLI as fire-and-forget
        // Using shell: true for Windows compatibility
        const child = spawn('claude', args, {
          shell: true,
          stdio: 'ignore',
          detached: false,
        });

        // Don't wait for completion - fire and forget
        child.unref();

        console.log('[ClaudeTeamsIPC] Spawned CLI:', 'claude', args.join(' '));
        return { ok: true };
      } catch (err) {
        console.error('[ClaudeTeamsIPC] CLI exec failed:', err);
        return { ok: false, error: String(err) };
      }
    },
  );

  // -----------------------------------------------------------------------
  // Global TTS Hooks (install/remove TTS hooks in ~/.claude/settings.json)
  // -----------------------------------------------------------------------

  ipcMain.handle('global-hooks:install-tts', async (_event, ttsConfig: {
    voice: string;
    smartSummaries: boolean;
    messages: { stop: string; subagentStop: string; notification: string };
    summaryProvider?: string;
    summaryModel?: string;
    userName?: string;
  }) => {
    try {
      const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');

      // Read existing global settings
      let settings: Record<string, unknown> = {};
      try {
        const content = await readFile(globalSettingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        // File may not exist yet
      }

      if (!settings.hooks) settings.hooks = {};
      const hooks = settings.hooks as Record<string, unknown>;

      // Build absolute paths
      const uvPath = process.platform === 'win32'
        ? os.homedir().replace(/\\/g, '\\\\') + '\\\\.local\\\\bin\\\\uv.exe'
        : 'uv';

      // Resolve project root from __dirname (main process is in apps/desktop/out/main/)
      const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
      const smartTtsAbsolute = path.join(projectRoot, '.claude', 'plugins', 'kuro', 'hooks', 'smart_tts.py')
        .replace(/\\/g, '\\\\');

      const voice = ttsConfig.voice || 'en-GB-SoniaNeural';

      // Global hook commands set KURORYUU_TTS_SOURCE=global so smart_tts.py
      // can detect it's running from global hooks (for double-fire prevention).
      // Claude Code runs hooks through bash (even on Windows), so use POSIX syntax.
      const envPrefix = 'KURORYUU_TTS_SOURCE=global';

      // Install Stop hook
      hooks.Stop = [{
        hooks: [
          {
            type: 'command',
            command: `${envPrefix} ${uvPath} run ${smartTtsAbsolute} "${ttsConfig.messages.stop}" --type stop --voice "${voice}"`,
            timeout: 30000,
          },
        ],
      }];

      // Install SubagentStop hook
      hooks.SubagentStop = [{
        hooks: [
          {
            type: 'command',
            command: `${envPrefix} ${uvPath} run ${smartTtsAbsolute} "${ttsConfig.messages.subagentStop}" --type subagent --task "$CLAUDE_TASK_DESCRIPTION" --voice "${voice}"`,
            timeout: 30000,
          },
        ],
      }];

      // Install Notification hook
      hooks.Notification = [{
        hooks: [
          {
            type: 'command',
            command: `${envPrefix} ${uvPath} run ${smartTtsAbsolute} "${ttsConfig.messages.notification}" --type notification --voice "${voice}"`,
            timeout: 30000,
          },
        ],
      }];

      // Mirror kuroPlugin config to global (so smart_tts.py can find settings via global fallback)
      settings.kuroPlugin = {
        tts: {
          provider: 'edge_tts',
          voice: ttsConfig.voice || 'en-GB-SoniaNeural',
          smartSummaries: ttsConfig.smartSummaries || false,
          summaryProvider: ttsConfig.summaryProvider || 'gateway-auto',
          summaryModel: ttsConfig.summaryModel || '',
          userName: ttsConfig.userName || 'Kuroryuu Says',
          messages: ttsConfig.messages,
        },
      };

      // Write back
      const { writeFile: writeFileAsync } = await import('fs/promises');
      await writeFileAsync(globalSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      console.log('[GlobalHooks] Installed TTS hooks in global settings');
      return { ok: true };
    } catch (err) {
      console.error('[GlobalHooks] Failed to install TTS hooks:', err);
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('global-hooks:remove-tts', async () => {
    try {
      const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');

      let settings: Record<string, unknown> = {};
      try {
        const content = await readFile(globalSettingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        return { ok: true }; // Nothing to remove
      }

      // Remove TTS hooks
      if (settings.hooks && typeof settings.hooks === 'object') {
        const hooks = settings.hooks as Record<string, unknown>;
        delete hooks.Stop;
        delete hooks.SubagentStop;
        delete hooks.Notification;
        // Clean up empty hooks object
        if (Object.keys(hooks).length === 0) {
          delete settings.hooks;
        }
      }

      // Remove mirrored kuroPlugin config
      delete settings.kuroPlugin;

      const { writeFile: writeFileAsync } = await import('fs/promises');
      await writeFileAsync(globalSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      console.log('[GlobalHooks] Removed TTS hooks from global settings');
      return { ok: true };
    } catch (err) {
      console.error('[GlobalHooks] Failed to remove TTS hooks:', err);
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('global-hooks:status', async () => {
    try {
      const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');

      let settings: Record<string, unknown> = {};
      try {
        const content = await readFile(globalSettingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        return { installed: false };
      }

      const hooks = settings.hooks as Record<string, unknown> | undefined;
      const installed = !!(hooks?.Stop || hooks?.SubagentStop || hooks?.Notification);
      return { installed };
    } catch {
      return { installed: false };
    }
  });
}

/**
 * Remove all registered IPC handlers. Call on app shutdown.
 */
export function cleanupClaudeTeamsIpc(): void {
  const channels = [
    'claude-teams:start-watching',
    'claude-teams:stop-watching',
    'claude-teams:get-teams',
    'claude-teams:get-tasks',
    'claude-teams:get-messages',
    'claude-teams:exec-cli',
    'global-hooks:install-tts',
    'global-hooks:remove-tts',
    'global-hooks:status',
  ];

  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  claudeTeamsWatcher.stop().catch(() => {
    // Ignore errors during cleanup
  });
}
