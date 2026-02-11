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
 *   claude-teams:exec-cli        - Spawn a valid claude CLI command (with error capture)
 *   claude-teams:create-team     - Create team via prompt (spawns claude -p)
 *   claude-teams:message-teammate - Write message to agent inbox file
 *   claude-teams:shutdown-teammate - Write shutdown_request to agent inbox file
 *   claude-teams:archive-session - Archive team state before cleanup
 *   claude-teams:list-archives   - List all archived sessions
 *   claude-teams:load-archive    - Load a specific archived session
 *   claude-teams:delete-archive  - Delete an archived session
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { spawn, execSync } from 'child_process';
import { readFile, access, mkdir, writeFile as writeFileAsync } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { claudeTeamsWatcher } from './claude-teams-watcher';
import {
  archiveTeamSession,
  listArchivedSessions,
  loadArchivedSession,
  deleteArchivedSession,
} from './claude-teams-archive';
import {
  listTemplates,
  saveTemplate,
  deleteTemplate,
  toggleTemplateFavorite,
} from './claude-teams-templates';
import { getSettingsWriter } from './services/settings-writer';

// -----------------------------------------------------------------------
// UV Binary Resolution (cached)
// -----------------------------------------------------------------------

let _cachedUvPath: string | null = null;

/**
 * Find the UV binary dynamically using which/where + common fallback paths.
 * Returns the path with forward slashes escaped for JSON embedding, or null.
 */
function findUvBinary(): string | null {
  if (_cachedUvPath) return _cachedUvPath;

  // 1. Try which/where (finds UV if it's in PATH)
  try {
    const cmd = process.platform === 'win32' ? 'where.exe uv' : 'which uv';
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    // where.exe may return multiple lines - take the first
    const firstLine = result.split(/\r?\n/)[0].trim();
    if (firstLine && existsSync(firstLine)) {
      _cachedUvPath = firstLine;
      console.log('[GlobalHooks] Found UV via PATH:', _cachedUvPath);
      return _cachedUvPath;
    }
  } catch {
    // Not in PATH, try fallbacks
  }

  // 2. Fallback: common install locations
  const home = os.homedir();
  const candidates = process.platform === 'win32'
    ? [
        path.join(home, '.local', 'bin', 'uv.exe'),
        path.join(home, '.cargo', 'bin', 'uv.exe'),
        path.join(home, 'AppData', 'Local', 'uv', 'uv.exe'),
      ]
    : [
        path.join(home, '.local', 'bin', 'uv'),
        path.join(home, '.cargo', 'bin', 'uv'),
        '/usr/local/bin/uv',
        '/usr/bin/uv',
      ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      _cachedUvPath = candidate;
      console.log('[GlobalHooks] Found UV at fallback path:', _cachedUvPath);
      return _cachedUvPath;
    }
  }

  console.warn('[GlobalHooks] UV binary not found');
  return null;
}

/** Resolve project root from __dirname (main process is in apps/desktop/out/main/) */
function getProjectRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

/** Get absolute path to smart_tts.py */
function getSmartTtsPath(): string {
  return path.join(getProjectRoot(), '.claude', 'plugins', 'kuro', 'hooks', 'smart_tts.py');
}

/** Escape backslashes for embedding in hook command strings (bash-safe) */
function escapePath(p: string): string {
  return p.replace(/\\/g, '\\\\');
}

interface ValidationResult {
  valid: boolean;
  uvFound: boolean;
  uvPath: string | null;
  scriptFound: boolean;
  scriptPath: string | null;
  errors: string[];
}

/** Validate all prerequisites for global TTS hooks */
async function validateGlobalHooksPrereqs(): Promise<ValidationResult> {
  const errors: string[] = [];

  // Check UV
  const uvPath = findUvBinary();
  const uvFound = uvPath !== null;
  if (!uvFound) {
    errors.push(
      process.platform === 'win32'
        ? 'UV not found. Install: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"'
        : 'UV not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh',
    );
  }

  // Check smart_tts.py
  const scriptPath = getSmartTtsPath();
  let scriptFound = false;
  try {
    await access(scriptPath);
    scriptFound = true;
  } catch {
    errors.push(`smart_tts.py not found at: ${scriptPath}`);
  }

  // Check ~/.claude/ exists or can be created
  const claudeDir = path.join(os.homedir(), '.claude');
  if (!existsSync(claudeDir)) {
    try {
      await mkdir(claudeDir, { recursive: true });
    } catch {
      errors.push(`Cannot create ~/.claude/ directory: ${claudeDir}`);
    }
  }

  return {
    valid: uvFound && scriptFound && errors.length === 0,
    uvFound,
    uvPath,
    scriptFound,
    scriptPath: scriptFound ? scriptPath : null,
    errors,
  };
}

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

  ipcMain.handle('claude-teams:restart-watching', async () => {
    try {
      const snapshot = await claudeTeamsWatcher.restart();
      return { ok: true, snapshot };
    } catch (err) {
      console.error('[ClaudeTeamsIPC] Failed to restart watching:', err);
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
  // CLI helper (for spawning valid claude commands with error capture)
  // -----------------------------------------------------------------------

  /**
   * Helper: spawn claude CLI and capture stdout/stderr, returning { ok, error? }
   */
  const execClaudeCmd = (args: string[]): Promise<{ ok: boolean; error?: string }> => {
    return new Promise((resolve) => {
      let resolved = false;
      const done = (result: { ok: boolean; error?: string }) => {
        if (!resolved) { resolved = true; resolve(result); }
      };

      try {
        // shell: true required on Windows to resolve .cmd shims (e.g. claude.cmd)
        // Args are still passed as array, so shell injection risk is minimal
        const isWindows = process.platform === 'win32';
        const child = spawn('claude', args, {
          shell: isWindows,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
          env: { ...process.env, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
        });

        let stderr = '';
        child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        child.on('error', (err) => {
          console.error('[ClaudeTeamsIPC] CLI spawn error:', err);
          done({ ok: false, error: String(err) });
        });
        child.on('close', (code) => {
          if (code === 0) {
            console.log('[ClaudeTeamsIPC] CLI success:', 'claude', args.join(' '));
            done({ ok: true });
          } else {
            console.error('[ClaudeTeamsIPC] CLI failed (code', code, '):', stderr.trim());
            done({ ok: false, error: stderr.trim() || `Exit code ${code}` });
          }
        });

        // Timeout after 30s
        const timer = setTimeout(() => {
          try { child.kill(); } catch { /* ignore */ }
          done({ ok: false, error: 'Command timed out after 30s' });
        }, 30_000);

        // Clear timeout if process exits naturally
        child.on('close', () => clearTimeout(timer));
      } catch (err) {
        console.error('[ClaudeTeamsIPC] CLI exec failed:', err);
        done({ ok: false, error: String(err) });
      }
    });
  };

  // General-purpose CLI bridge (now with error capture instead of fire-and-forget)
  ipcMain.handle(
    'claude-teams:exec-cli',
    async (_event, args: string[]) => {
      return execClaudeCmd(args);
    },
  );

  // -----------------------------------------------------------------------
  // Direct inbox file operations (writes to ~/.claude/teams/{name}/inboxes/)
  // Claude Code agents poll these files — this is the correct messaging path.
  // -----------------------------------------------------------------------

  const TEAMS_DIR = path.join(os.homedir(), '.claude', 'teams');

  /**
   * Append a message to an agent's inbox JSON file.
   * Creates the file/directory if it doesn't exist.
   */
  const appendToInbox = async (
    teamName: string,
    recipient: string,
    message: { from: string; text: string; timestamp: string; read: boolean; summary?: string },
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const inboxDir = path.join(TEAMS_DIR, teamName, 'inboxes');
      const inboxPath = path.join(inboxDir, `${recipient}.json`);

      // Ensure the inboxes directory exists
      await mkdir(inboxDir, { recursive: true });

      // Read existing messages (or start fresh)
      let messages: unknown[] = [];
      try {
        const raw = await readFile(inboxPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) messages = parsed;
      } catch {
        // File doesn't exist yet — start with empty array
      }

      messages.push(message);
      await writeFileAsync(inboxPath, JSON.stringify(messages, null, 2), 'utf-8');
      console.log(`[ClaudeTeamsIPC] Message written to inbox: ${teamName}/${recipient}`);
      return { ok: true };
    } catch (err) {
      console.error('[ClaudeTeamsIPC] Failed to write inbox:', err);
      return { ok: false, error: String(err) };
    }
  };

  ipcMain.handle(
    'claude-teams:create-team',
    async (_event, params: { name: string; description?: string; prompt?: string }) => {
      // Team creation requires a running Claude session (no CLI command exists).
      // Spawn claude with a prompt to create the team via /k-spawnteam or similar.
      const prompt = params.prompt || `/k-spawnteam ${params.name}`;
      return execClaudeCmd(['-p', '--print', prompt]);
    },
  );

  ipcMain.handle(
    'claude-teams:message-teammate',
    async (_event, params: { teamName: string; recipient: string; content: string; summary?: string }) => {
      if (!params.teamName || !params.recipient) {
        return { ok: false, error: 'teamName and recipient are required' };
      }
      return appendToInbox(params.teamName, params.recipient, {
        from: 'human',
        text: params.content,
        timestamp: new Date().toISOString(),
        read: false,
        summary: params.summary || params.content.slice(0, 60),
      });
    },
  );

  ipcMain.handle(
    'claude-teams:shutdown-teammate',
    async (_event, params: { teamName: string; recipient: string; content?: string }) => {
      if (!params.teamName || !params.recipient) {
        return { ok: false, error: 'teamName and recipient are required' };
      }
      // Write a shutdown_request system message to the agent's inbox
      const shutdownMsg = JSON.stringify({
        type: 'shutdown_request',
        requestId: `shutdown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from: 'human',
        content: params.content || 'Shutdown requested from Kuroryuu Desktop',
      });
      return appendToInbox(params.teamName, params.recipient, {
        from: 'human',
        text: shutdownMsg,
        timestamp: new Date().toISOString(),
        read: false,
        summary: 'Shutdown request',
      });
    },
  );

  // -----------------------------------------------------------------------
  // Direct team cleanup (reliable, replaces fire-and-forget CLI)
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'claude-teams:cleanup-team',
    async (_event, teamName: string) => {
      try {
        return await claudeTeamsWatcher.cleanupTeamDirectories(teamName);
      } catch (err) {
        console.error('[ClaudeTeamsIPC] Cleanup failed:', err);
        return { ok: false, error: String(err) };
      }
    },
  );

  // -----------------------------------------------------------------------
  // Team Session Archives (persistence)
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'claude-teams:archive-session',
    async (_event, data: {
      teamName: string;
      config: unknown;
      tasks: unknown[];
      inboxes: Record<string, unknown[]>;
    }) => {
      return archiveTeamSession(data);
    },
  );

  ipcMain.handle('claude-teams:list-archives', async () => {
    try {
      const entries = await listArchivedSessions();
      return { ok: true, entries };
    } catch (err) {
      return { ok: false, error: String(err), entries: [] };
    }
  });

  ipcMain.handle(
    'claude-teams:load-archive',
    async (_event, archiveId: string) => {
      try {
        const archive = await loadArchivedSession(archiveId);
        if (!archive) {
          return { ok: false, error: `Archive not found: ${archiveId}` };
        }
        return { ok: true, archive };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'claude-teams:delete-archive',
    async (_event, archiveId: string) => {
      return deleteArchivedSession(archiveId);
    },
  );

  // -----------------------------------------------------------------------
  // Team Templates (config persistence)
  // -----------------------------------------------------------------------

  ipcMain.handle('claude-teams:list-templates', async () => {
    try {
      const templates = await listTemplates();
      return { ok: true, templates };
    } catch (err) {
      return { ok: false, error: String(err), templates: [] };
    }
  });

  ipcMain.handle(
    'claude-teams:save-template',
    async (_event, template: {
      name: string;
      description: string;
      isFavorite: boolean;
      config: {
        teammates: Array<{
          name: string;
          prompt: string;
          model?: string;
          color?: string;
          planModeRequired?: boolean;
        }>;
      };
    }) => {
      return saveTemplate(template);
    },
  );

  ipcMain.handle(
    'claude-teams:delete-template',
    async (_event, templateId: string) => {
      return deleteTemplate(templateId);
    },
  );

  ipcMain.handle(
    'claude-teams:toggle-template-favorite',
    async (_event, templateId: string) => {
      return toggleTemplateFavorite(templateId);
    },
  );

  // -----------------------------------------------------------------------
  // Mark inbox messages as read
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'claude-teams:mark-inbox-read',
    async (_event, params: { teamName: string; agentName: string }) => {
      try {
        const inboxPath = path.join(TEAMS_DIR, params.teamName, 'inboxes', `${params.agentName}.json`);
        const raw = await readFile(inboxPath, 'utf-8');
        const messages = JSON.parse(raw);
        if (Array.isArray(messages)) {
          const updated = messages.map((m: Record<string, unknown>) => ({ ...m, read: true }));
          await writeFileAsync(inboxPath, JSON.stringify(updated, null, 2), 'utf-8');
        }
        return { ok: true };
      } catch (err) {
        console.error('[ClaudeTeamsIPC] mark-inbox-read failed:', err);
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
      // Validate prerequisites first
      const validation = await validateGlobalHooksPrereqs();
      if (!validation.valid) {
        console.error('[GlobalHooks] Validation failed:', validation.errors);
        return { ok: false, error: `Prerequisites not met: ${validation.errors.join('; ')}` };
      }

      const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');

      // Use dynamically resolved paths
      const uvPath = escapePath(validation.uvPath!);
      const smartTtsAbsolute = escapePath(validation.scriptPath!);
      const voice = ttsConfig.voice || 'en-GB-SoniaNeural';

      // Use --source global CLI arg for double-fire prevention (works on all platforms)
      const sourceArg = '--source global';

      const writer = getSettingsWriter();
      return writer.write(globalSettingsPath, {
        label: 'global-hooks:install-tts',
        mutate: (settings) => {
          if (!settings.hooks) settings.hooks = {};
          const hooks = settings.hooks as Record<string, unknown>;

          // Install Stop hook
          hooks.Stop = [{
            hooks: [
              {
                type: 'command',
                command: `${uvPath} run ${smartTtsAbsolute} "${ttsConfig.messages.stop}" --type stop --voice "${voice}" ${sourceArg}`,
                timeout: 90,
              },
            ],
          }];

          // Install SubagentStop hook
          hooks.SubagentStop = [{
            hooks: [
              {
                type: 'command',
                command: `${uvPath} run ${smartTtsAbsolute} "${ttsConfig.messages.subagentStop}" --type subagent --task "$CLAUDE_TASK_DESCRIPTION" --voice "${voice}" ${sourceArg}`,
                timeout: 90,
              },
            ],
          }];

          // Install Notification hook
          hooks.Notification = [{
            hooks: [
              {
                type: 'command',
                command: `${uvPath} run ${smartTtsAbsolute} "${ttsConfig.messages.notification}" --type notification --voice "${voice}" ${sourceArg}`,
                timeout: 90,
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
        },
      });
    } catch (err) {
      console.error('[GlobalHooks] Failed to install TTS hooks:', err);
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('global-hooks:remove-tts', async () => {
    try {
      const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');

      const writer = getSettingsWriter();
      return writer.write(globalSettingsPath, {
        label: 'global-hooks:remove-tts',
        mutate: (settings) => {
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
        },
      });
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
  // -----------------------------------------------------------------------
  // Global TTS Hooks - Validation & Testing
  // -----------------------------------------------------------------------

  ipcMain.handle('global-hooks:validate', async () => {
    try {
      // Clear cached UV path to force re-detection
      _cachedUvPath = null;
      return await validateGlobalHooksPrereqs();
    } catch (err) {
      return {
        valid: false,
        uvFound: false,
        uvPath: null,
        scriptFound: false,
        scriptPath: null,
        errors: [String(err)],
      };
    }
  });

  ipcMain.handle('global-hooks:test', async () => {
    try {
      const validation = await validateGlobalHooksPrereqs();
      if (!validation.valid) {
        return { ok: false, error: `Prerequisites not met: ${validation.errors.join('; ')}` };
      }

      // Run smart_tts.py with a test message using the resolved UV path
      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const child = spawn(validation.uvPath!, [
          'run', validation.scriptPath!, 'Global TTS test successful', '--type', 'stop', '--voice', 'en-GB-SoniaNeural',
        ], {
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 15000,
        });

        let stderr = '';
        child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

        child.on('close', (code) => {
          if (code === 0) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: stderr || `Process exited with code ${code}` });
          }
        });

        child.on('error', (err) => {
          resolve({ ok: false, error: String(err) });
        });
      });
    } catch (err) {
      return { ok: false, error: String(err) };
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
    'claude-teams:restart-watching',
    'claude-teams:get-teams',
    'claude-teams:get-tasks',
    'claude-teams:get-messages',
    'claude-teams:exec-cli',
    'claude-teams:create-team',
    'claude-teams:message-teammate',
    'claude-teams:shutdown-teammate',
    'claude-teams:cleanup-team',
    'claude-teams:mark-inbox-read',
    'claude-teams:archive-session',
    'claude-teams:list-archives',
    'claude-teams:load-archive',
    'claude-teams:delete-archive',
    'claude-teams:list-templates',
    'claude-teams:save-template',
    'claude-teams:delete-template',
    'claude-teams:toggle-template-favorite',
    'global-hooks:install-tts',
    'global-hooks:remove-tts',
    'global-hooks:status',
    'global-hooks:validate',
    'global-hooks:test',
  ];

  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  claudeTeamsWatcher.stop().catch(() => {
    // Ignore errors during cleanup
  });
}
