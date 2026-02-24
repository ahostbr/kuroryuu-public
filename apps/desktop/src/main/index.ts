import { app, BrowserWindow, screen, ipcMain, shell, protocol, dialog, Tray, Menu, nativeImage, net } from 'electron';
import { join, dirname, extname } from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { spawn, execSync } from 'child_process';
import { readFile, writeFile, readdir } from 'fs/promises';
import { randomBytes } from 'crypto';
import { PtyManager } from './pty/manager';
import { PtyBridge } from './pty/bridge';
import { desktopPtyPersistence, type TerminalSessionState } from './pty/persistence';
import { ensureDaemonRunning, checkDaemonHealth } from './pty/daemon-spawner';
import { PtyDaemonClient } from './pty/daemon-client';
import { fileWatcher } from './watcher';
import { getSettingsWriter } from './services/settings-writer';
import type { CreatePtyOptions } from './pty/types';
import { detectTool, configureTools, type ToolConfig, type CLITool } from './cli/cli-tool-manager';
import {
  isEncryptionAvailable,
  getAllProviderStatuses,
  disconnectProvider,
  saveApiKey as tokenSaveApiKey,
  getApiKey as tokenGetApiKey,
  deleteApiKey as tokenDeleteApiKey,
  saveOAuthAppCredentials,
  getOAuthAppCredentials,
  deleteOAuthAppCredentials,
  hasOAuthAppCredentials,
  type OAuthProvider
} from './integrations/token-store';
import { AnthropicService } from './integrations/providers/anthropic';
import { OpenAIService } from './integrations/providers/openai';
import { GitHubOAuthService } from './integrations/providers/github';
import { setupGraphitiIpc, configureGraphiti, cleanupGraphiti } from './integrations/graphiti-service';
import { setupLinearIpc } from './integrations/linear-service';
import { setupWorktreeIpc, configureWorktrees } from './worktree-manager';
import { setupGitIpc, configureGitService } from './git-service';
import { setupAgentIpc } from './agent-orchestrator';
import { setupClaudeTeamsIpc } from './claude-teams-ipc';
import { setupSecurityIpc } from './security-scanner';
import { setupOrchestrationIpc } from './orchestration-client';
import { mainLogger } from './utils/file-logger';
import { hooksUseBash, toGitBashPath } from './utils/hook-paths';
import { restartService, getServiceHealth, checkPtyDaemonHealth, stopService } from './service-manager';
import { registerBootstrapHandlers, launchTrayCompanion } from './ipc/bootstrap-handlers';
import { registerSdkAgentHandlers } from './ipc/sdk-agent-handlers';
import { getClaudeSDKService } from './services/claude-sdk-service';
import { getLeaderMonitor, configureLeaderMonitor, setupLeaderMonitorIpc } from './services/leader-monitor';
import { registerTTSHandlers } from './ipc/tts-handlers';
import { registerSpeechHandlers } from './ipc/speech-handlers';
import { registerCLIProxyHandlers } from './ipc/cliproxy-handlers';
import { getCLIProxyNativeManager } from './services/cliproxy-native';
import { registerTaskHandlers } from './ipc/task-handlers';
import { setupSchedulerIpc, cleanupSchedulerIpc } from './ipc/scheduler-handlers';
import { setupIdentityIpc, cleanupIdentityIpc } from './ipc/identity-handlers';
import { registerBackupHandlers } from './ipc/backup-handlers';
import { registerMarketingHandlers, killStudioServer } from './ipc/marketing-handlers';
import { registerExcalidrawHandlers } from './ipc/excalidraw-handlers';
import { registerLLMAppsHandlers } from './ipc/llm-apps-handlers';
import { getTaskService } from './services/task-service';
import { pluginSyncService } from './services/plugin-sync-service';
import { registerPCControlHandlers, cleanup as cleanupPCControl, setMainWindow as setPCControlMainWindow, initializeState as initPCControlState } from './integrations/pccontrol-service';
import { registerPythonHandlers, setMainWindow as setPythonMainWindow } from './integrations/python-service';
import { transcribeAudio, voiceChat, type STTEngine } from './audio-service';
import { TTSModule } from './features/tts/module';
import { FeatureEventBus } from './features/event-bus';
import { ConfigManager } from './features/config-manager';
import { getSettingsService, initSettingsService, migrateFromLocalStorage, needsMigration, getMigrationKeys, type BackupInfo } from './settings';
import { initAutoUpdater } from './updater';

// Use environment check instead of @electron-toolkit/utils 'is' (which accesses app.isPackaged at import time)
const isDev = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_RENDERER_URL;

const WINDOW_WIDTH = 1400;
const WINDOW_HEIGHT = 900;

/** Get version from git tags with build number, fallback to package.json */
function getGitVersion(): string {
  try {
    const desc = execSync('git describe --tags', { encoding: 'utf-8', timeout: 3000 }).trim();
    // Format: "v0.2.0" (on tag) or "v0.2.0-53-ge0dced8" (53 commits past tag)
    const match = desc.match(/^v?(\d+\.\d+\.\d+)(?:-(\d+)-g[a-f0-9]+)?$/);
    if (match) {
      const base = match[1];
      const commits = match[2];
      return commits ? `${base}.${commits}` : base;
    }
    return desc.replace(/^v/, '');
  } catch {
    return app.getVersion();
  }
}

/** Get latest commit short hash and date */
function getCommitInfo(): { shortHash: string; date: string } | null {
  try {
    const log = execSync('git log -1 --format="%h|%as"', { encoding: 'utf-8', timeout: 3000 }).trim();
    const [shortHash, date] = log.split('|');
    return { shortHash, date };
  } catch {
    return null;
  }
}

let mainWindow: BrowserWindow | null = null;
let codeEditorWindow: BrowserWindow | null = null;
let playgroundWindow: BrowserWindow | null = null;
let ptyManager: PtyManager | null = null;
let ptyBridge: PtyBridge | null = null;
let ttsModule: TTSModule | null = null;
let ptyDaemonClient: PtyDaemonClient | null = null;
let appTray: Tray | null = null;

// PTY Bridge port for MCP registration
const PTY_BRIDGE_PORT = parseInt(process.env.KURORYUU_PTY_BRIDGE_PORT || '8201', 10);

// Gateway URL for PTY registration
const MCP_CORE_URL_DAEMON = process.env.MCP_CORE_URL || 'http://127.0.0.1:8100';

// Flag to use daemon vs embedded PTY manager
// Set to true to use detached daemon (survives app restarts)
const USE_PTY_DAEMON = process.env.KURORYUU_USE_PTY_DAEMON !== 'false';

// Desktop session secret for role management authentication
// This prevents agents from self-promoting via curl/Bash
const DESKTOP_SECRET = randomBytes(32).toString('hex');
const GATEWAY_URL_AUTH = process.env.KURORYUU_GATEWAY_URL || 'http://127.0.0.1:8200';
const MCP_CORE_URL_AUTH = process.env.KURORYUU_MCP_CORE_URL || 'http://127.0.0.1:8100';

// Leader terminal tracking - first terminal spawned = leader
// If leader terminal dies, alert human and require app restart
let leaderTerminalId: string | null = null;
let leaderAgentId: string | null = null;

// MCP Core secret registration tracking - used for 403 retry logic
let mcpCoreSecretValid = false;

// Shutdown flag to prevent multiple shutdown attempts
let isShuttingDown = false;

/**
 * Wait for daemon client to be connected with timeout.
 * Used to handle reconnection races after PTY reset.
 */
async function waitForDaemonConnection(timeoutMs: number = 5000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (ptyDaemonClient?.isConnected) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

/**
 * Register the Desktop secret with Gateway and MCP Core.
 * This allows the Desktop app to promote/demote agents securely.
 */
async function registerDesktopSecret(): Promise<void> {
  // Register with Gateway
  try {
    const response = await fetch(`${GATEWAY_URL_AUTH}/v1/agents/_x9k_desktop_auth`, {
      method: 'POST',
      headers: {
        'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
      },
    });
    if (response.ok) {
      console.log('[Desktop] Registered session secret with Gateway');
    } else {
      console.error('[Desktop] Failed to register secret with Gateway:', response.status);
    }
  } catch (error) {
    console.log('[Desktop] Gateway not available for secret registration');
  }

  // Register with MCP Core
  try {
    const response = await fetch(`${MCP_CORE_URL_AUTH}/_x9k_desktop_auth`, {
      method: 'POST',
      headers: {
        'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
      },
    });
    if (response.ok) {
      mcpCoreSecretValid = true;
      console.log('[Desktop] Registered session secret with MCP Core');
    } else {
      console.error('[Desktop] Failed to register secret with MCP Core:', response.status);
    }
  } catch (error) {
    console.log('[Desktop] MCP Core not available for secret registration');
  }
}

/**
 * Ensure Desktop secret is registered with MCP Core.
 * Called before protected operations to handle MCP Core restarts.
 * @returns true if secret is valid/registered, false if registration failed
 */
async function ensureDesktopSecretRegistered(): Promise<boolean> {
  if (mcpCoreSecretValid) {
    return true;
  }

  try {
    const response = await fetch(`${MCP_CORE_URL_AUTH}/_x9k_desktop_auth`, {
      method: 'POST',
      headers: {
        'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
      },
    });
    if (response.ok) {
      mcpCoreSecretValid = true;
      console.log('[Desktop] Desktop secret (re-)registered with MCP Core');
      return true;
    }
    console.error('[Desktop] Failed to register secret with MCP Core:', response.status);
    return false;
  } catch (error) {
    console.log('[Desktop] MCP Core not available for secret registration');
    return false;
  }
}

/**
 * Register an agent as leader with MCP Core.
 * Called when spawning a leader terminal or promoting an agent.
 */
async function registerLeaderWithMcpCore(agentId: string): Promise<void> {
  try {
    const response = await fetch(`${MCP_CORE_URL_AUTH}/_x9k_register_leader?agent_id=${encodeURIComponent(agentId)}`, {
      method: 'POST',
      headers: {
        'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
      },
    });
    if (response.ok) {
      console.log(`[Desktop] Registered leader with MCP Core: ${agentId}`);
    } else {
      console.error(`[Desktop] Failed to register leader with MCP Core: ${response.status}`);
    }
  } catch (error) {
    console.log('[Desktop] MCP Core not available for leader registration');
  }
}

/**
 * Deregister an agent as leader from MCP Core.
 * Called when demoting an agent or killing a leader terminal.
 */
async function deregisterLeaderFromMcpCore(agentId: string): Promise<void> {
  try {
    const response = await fetch(`${MCP_CORE_URL_AUTH}/_x9k_deregister_leader?agent_id=${encodeURIComponent(agentId)}`, {
      method: 'POST',
      headers: {
        'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
      },
    });
    if (response.ok) {
      console.log(`[Desktop] Deregistered leader from MCP Core: ${agentId}`);
    }
  } catch (error) {
    // Silent fail - MCP Core may not be running
  }
}

/**
 * Register PTY session with MCP Core, handling 403 by re-registering secret.
 * Includes retry logic for MCP Core restarts.
 * @param payload PTY registration payload
 * @returns true if registration succeeded
 */
async function registerPtyWithMcpCore(payload: Record<string, unknown>): Promise<boolean> {
  const maxRetries = 2;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${MCP_CORE_URL_DAEMON}/v1/pty/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        return true;
      }

      if (response.status === 403 && attempt < maxRetries) {
        // Secret likely invalid - MCP Core may have restarted
        console.log('[Desktop] PTY registration got 403, re-registering secret...');
        mcpCoreSecretValid = false;
        const reregistered = await ensureDesktopSecretRegistered();
        if (!reregistered) {
          console.error('[Desktop] Failed to re-register secret, giving up');
          return false;
        }
        // Also re-register leader if we have one
        if (leaderAgentId) {
          await registerLeaderWithMcpCore(leaderAgentId);
        }
        // Resync any orphaned sessions from before the restart
        await resyncAllPtySessions();
        continue; // Retry registration
      }

      console.warn('[Desktop] PTY registration failed:', response.status);
      return false;
    } catch (error) {
      console.error('[Desktop] PTY registration error:', error);
      return false;
    }
  }

  return false;
}

/**
 * Re-register all existing PTY sessions with MCP Core.
 * Called after secret re-registration to recover orphaned sessions.
 * Uses daemon's live session list + persistence data for owner info.
 */
async function resyncAllPtySessions(): Promise<void> {
  if (!ptyDaemonClient?.isConnected) {
    console.log('[Desktop] Cannot resync - daemon not connected');
    return;
  }

  // Ensure Desktop secret is registered before attempting PTY registration
  const secretOk = await ensureDesktopSecretRegistered();
  if (!secretOk) {
    console.log('[Desktop] Cannot resync - failed to register Desktop secret');
    return;
  }

  try {
    // Get live sessions from daemon
    const { terminals } = await ptyDaemonClient.list();
    if (terminals.length === 0) return;

    console.log(`[Desktop] Re-syncing ${terminals.length} PTY sessions with MCP Core...`);
    const bridgeUrl = ptyBridge?.getBridgeUrl() || `http://127.0.0.1:${PTY_BRIDGE_PORT}`;

    // Get persistence data for owner info
    const persistedSessions = desktopPtyPersistence.getAllSessions();
    const persistedMap = new Map(persistedSessions.map(s => [s.id, s]));

    for (const term of terminals) {
      const persisted = persistedMap.get(term.termId);

      const payload: Record<string, unknown> = {
        session_id: term.termId,
        source: 'desktop',  // Must be 'local' or 'desktop' per MCP Core validation
        desktop_url: bridgeUrl,
        cli_type: persisted?.claudeMode ? 'kiro' : 'shell',
        pid: term.pid,
      };

      // Add owner info from persistence
      if (persisted?.linkedAgentId) payload.owner_agent_id = persisted.linkedAgentId;
      if (term.termId === leaderTerminalId) {
        payload.owner_role = 'leader';
      } else {
        payload.owner_role = 'worker';
      }
      if (persisted?.title) payload.label = persisted.title;

      // Direct registration (no retry to avoid infinite loop)
      try {
        const response = await fetch(`${MCP_CORE_URL_DAEMON}/v1/pty/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
          },
          body: JSON.stringify(payload)
        });
        if (response.ok) {
          console.log(`[Desktop] Re-synced PTY session: ${term.termId}`);
        } else {
          console.warn(`[Desktop] Failed to re-sync PTY session: ${term.termId}, status: ${response.status}`);
        }
      } catch (err) {
        console.error(`[Desktop] Failed to re-sync PTY session ${term.termId}:`, err);
      }
    }
  } catch (err) {
    console.error('[Desktop] Failed to resync PTY sessions:', err);
  }
}

async function setupPtyIpc(): Promise<void> {
  // ========================================================================
  // Daemon Mode: Use external PTY daemon (survives app restarts)
  // ========================================================================
  if (USE_PTY_DAEMON) {
    console.log('[PTY] Attempting to use daemon mode...');
    const daemonStarted = await ensureDaemonRunning();

    if (daemonStarted) {
      console.log('[PTY] Daemon mode enabled - terminals will survive app restarts');
      ptyDaemonClient = new PtyDaemonClient();

      try {
        await ptyDaemonClient.connect();

        // Forward daemon events to renderer
        ptyDaemonClient.on('data', ({ id, data }: { id: string; data: string }) => {
          try {
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
              mainWindow.webContents.send('pty:data', id, data);
            }
            // Track leader activity for inactivity monitoring
            if (id === leaderTerminalId) {
              getLeaderMonitor().recordActivity();
            }
          } catch {
            console.log('[PTY] Ignoring data emit - window destroyed');
          }
        });

        ptyDaemonClient.on('exit', async ({ id, exitCode }: { id: string; exitCode: number }) => {
          // Unregister from MCP Core on exit (with retry + 403 handling)
          let unregisterOk = false;
          for (let attempt = 0; attempt < 3 && !unregisterOk; attempt++) {
            try {
              const res = await fetch(`${MCP_CORE_URL_DAEMON}/v1/pty/unregister/${id}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
                },
              });

              // Handle 403 - re-register secret and retry
              if (res.status === 403 && attempt < 2) {
                mainLogger.warn('PTY', 'Unregister got 403, re-registering secret...', { termId: id });
                await ensureDesktopSecretRegistered();
                continue;
              }

              const body = await res.json().catch(() => ({ ok: false }));
              unregisterOk = body.ok === true || body.error === 'Session not found';
              if (unregisterOk) {
                mainLogger.log('PTY', 'Unregistered exited terminal from MCP Core', { termId: id, exitCode });
              }
            } catch (e) {
              mainLogger.warn('PTY', `Unregister attempt ${attempt + 1} failed for exited PTY`, { termId: id, error: String(e) });
            }
          }
          if (!unregisterOk) {
            mainLogger.error('PTY', 'Failed to deregister exited PTY from MCP Core after 3 attempts', { termId: id, exitCode });
          }

          try {
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
              mainWindow.webContents.send('pty:exit', id, exitCode);

              // LEADER DEATH DETECTION: If leader terminal died, alert human
              if (id === leaderTerminalId) {
                console.log('[PTY] LEADER TERMINAL DIED - alerting user');
                mainWindow.webContents.send('leader-died');
              }
            }
          } catch {
            console.log('[PTY] Ignoring exit emit - window destroyed');
          }
        });

        // Initialize persistence early to sync with daemon
        desktopPtyPersistence.initialize();

        // Cleanup orphaned daemon PTYs and subscribe to persisted ones
        try {
          const { terminals: daemonTerminals } = await ptyDaemonClient.list();

          // Get persisted ptyIds
          const persistedSessions = desktopPtyPersistence.getAllSessions();
          const persistedPtyIds = new Set<string>();
          for (const session of persistedSessions) {
            if (session.ptyId) {
              persistedPtyIds.add(session.ptyId);
            }
          }

          mainLogger.log('PTY-Sync', 'Syncing daemon with persistence', {
            daemonCount: daemonTerminals.length,
            persistedCount: persistedPtyIds.size
          });

          for (const term of daemonTerminals) {
            if (persistedPtyIds.has(term.termId)) {
              if (term.alive) {
                await ptyDaemonClient.subscribe(term.termId);
                mainLogger.log('PTY-Sync', 'Resubscribed to persisted terminal', { termId: term.termId });
              }
            } else {
              mainLogger.log('PTY-Sync', 'Killing orphaned daemon PTY', { termId: term.termId });
              try {
                await ptyDaemonClient.kill(term.termId);
              } catch (killErr) {
                mainLogger.warn('PTY-Sync', 'Failed to kill orphaned PTY', { termId: term.termId, error: String(killErr) });
              }
            }
          }

          // NOTE: resyncAllPtySessions() moved to after registerDesktopSecret()
          // to ensure MCP Core secret is registered before PTY registration

        } catch (err) {
          mainLogger.warn('PTY-Sync', 'Failed to sync daemon with persistence', { error: String(err) });
        }

        // Register IPC handlers for daemon mode
        setupPtyIpcHandlersDaemon();

        // FIX 4: Start heartbeat interval to keep terminals alive in gateway
        const GATEWAY_HEARTBEAT_MS = 5000;
        setInterval(async () => {
          const sessions = desktopPtyPersistence.getAllSessions();
          if (sessions.length === 0) return;

          for (const session of sessions) {
            try {
              await fetch(`${MCP_CORE_URL_DAEMON}/v1/pty/heartbeat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: session.id })
              });
            } catch {
              // Silent fail - gateway may be down
            }
          }
        }, GATEWAY_HEARTBEAT_MS);
        mainLogger.log('PTY', 'Heartbeat interval started', { intervalMs: GATEWAY_HEARTBEAT_MS });

        return;
      } catch (err) {
        console.error('[PTY] Failed to connect to daemon:', err);
        console.log('[PTY] Falling back to embedded mode...');
        ptyDaemonClient = null;
      }
    } else {
      console.log('[PTY] Daemon not available, falling back to embedded mode...');
    }
  }

  // ========================================================================
  // Embedded Mode: Use PtyManager in Electron main process (legacy)
  // ========================================================================
  console.log('[PTY] Using embedded mode - terminals will NOT survive app restarts');
  ptyManager = new PtyManager();

  ptyManager.on('data', ({ id, data }: { id: string; data: string }) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('pty:data', id, data);
      }
      // Track leader activity for inactivity monitoring
      if (id === leaderTerminalId) {
        getLeaderMonitor().recordActivity();
      }
    } catch {
      console.log('[PTY] Ignoring data emit - window destroyed');
    }
  });

  ptyManager.on('exit', async ({ id, exitCode }: { id: string; exitCode: number }) => {
    // Unregister from MCP Core on exit (with retry + 403 handling) - embedded mode
    let unregisterOk = false;
    for (let attempt = 0; attempt < 3 && !unregisterOk; attempt++) {
      try {
        const res = await fetch(`${MCP_CORE_URL_DAEMON}/v1/pty/unregister/${id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
          },
        });

        // Handle 403 - re-register secret and retry
        if (res.status === 403 && attempt < 2) {
          console.warn(`[PTY] Unregister got 403, re-registering secret... (embedded)`);
          await ensureDesktopSecretRegistered();
          continue;
        }

        const body = await res.json().catch(() => ({ ok: false }));
        unregisterOk = body.ok === true || body.error === 'Session not found';
        if (unregisterOk) {
          console.log(`[PTY] Unregistered exited terminal ${id} from MCP Core (embedded)`);
        }
      } catch (e) {
        console.warn(`[PTY] Unregister attempt ${attempt + 1} failed for exited PTY (embedded):`, e);
      }
    }
    if (!unregisterOk) {
      console.error(`[PTY] Failed to deregister exited PTY ${id} from MCP Core after 3 attempts (embedded)`);
    }

    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('pty:exit', id, exitCode);

        // LEADER DEATH DETECTION: If leader terminal died, alert human
        if (id === leaderTerminalId) {
          console.log('[PTY] LEADER TERMINAL DIED - alerting user');
          mainWindow.webContents.send('leader-died');
        }
      }
    } catch {
      console.log('[PTY] Ignoring exit emit - window destroyed');
    }
  });

  setupPtyIpcHandlersEmbedded();
}

/**
 * Register IPC handlers for daemon mode
 */
function setupPtyIpcHandlersDaemon(): void {
  ipcMain.handle('pty:create', async (_, options: CreatePtyOptions) => {
    mainLogger.log('PTY-IPC', 'Creating PTY', { cmd: options.cmd, args: options.args, cwd: options.cwd });

    // Resolve 'claude' to full path - daemon can't find it by name alone
    if (options.cmd === 'claude' && process.platform === 'win32') {
      const homeDir = process.env.USERPROFILE || process.env.HOME || '';
      const knownPaths = [
        join(homeDir, '.claude', 'node_modules', '.bin', 'claude.cmd'),
        join(process.env.APPDATA || '', 'npm', 'claude.cmd'),
        join(homeDir, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
      ];
      for (const claudePath of knownPaths) {
        if (fs.existsSync(claudePath)) {
          mainLogger.log('PTY-IPC', 'Resolved claude to', { path: claudePath });
          options.cmd = claudePath;
          break;
        }
      }
    }

    // === Pre-spawn leader detection ===
    // Extract agent identity from env vars (renderer passes these)
    const agentId = options.ownerAgentId || options.env?.KURORYUU_AGENT_ID;
    const agentRole = options.env?.KURORYUU_AGENT_ROLE;

    // First terminal is ALWAYS leader - inject env var BEFORE spawn
    const isFirstTerminal = !leaderTerminalId;
    if (isFirstTerminal) {
      options.env = {
        ...options.env,
        KURORYUU_IS_LEADER: '1',
        KURORYUU_AGENT_ROLE: 'leader',  // Force leader role for first terminal
        KURORYUU_SESSION_ID: agentId || `pty_leader_${Date.now()}`,
      };
      mainLogger.log('PTY-IPC', 'Injecting leader env vars for first terminal');
    } else if (agentId) {
      // Worker: inject KURORYUU_SESSION_ID so statusline shows Kuroryuu identity
      // (without this, statusline falls back to Claude Code's internal session UUID)
      options.env = {
        ...options.env,
        KURORYUU_SESSION_ID: agentId,
      };
    }

    // Also set ownerAgentId if extracted from env
    if (agentId && !options.ownerAgentId) {
      options.ownerAgentId = agentId;
    }
    // === End pre-spawn leader detection ===

    // Ensure daemon is connected before creating (handles reconnection race after reset)
    if (ptyDaemonClient && !ptyDaemonClient.isConnected) {
      mainLogger.log('PTY-IPC', 'Daemon disconnected, waiting for reconnection...');
      const connected = await waitForDaemonConnection(3000);
      if (!connected) {
        mainLogger.error('PTY-IPC', 'Daemon reconnection timeout');
        return null;
      }
      mainLogger.log('PTY-IPC', 'Daemon reconnected, proceeding with create');
    }

    const result = await ptyDaemonClient?.create(options);
    // Map daemon response format to expected format
    if (result) {
      mainLogger.log('PTY-IPC', 'PTY created successfully', { termId: result.termId, pid: result.pid });

      // FIX 1: IMMEDIATELY save session to persistence BEFORE subscribing
      // This prevents "Cannot save buffer - session not found" race condition
      desktopPtyPersistence.saveSession({
        id: result.termId,
        title: options.title || 'Terminal',
        ptyId: result.termId,
        sessionId: result.termId,
        claudeMode: false,
        linkedAgentId: options.ownerAgentId,
        viewMode: 'terminal',
        chatMessages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now()
      });
      mainLogger.log('PTY-IPC', 'Session saved to persistence', { termId: result.termId });

      // FIX 2: Register with gateway (MCP Core) - same as embedded mode
      // Include desktop_url so k_pty can proxy commands through the bridge
      try {
        const bridgeUrl = ptyBridge?.getBridgeUrl() || `http://127.0.0.1:${PTY_BRIDGE_PORT}`;
        // Get k_session ID from env if available (set by Claude bootstrap)
        const ownerKSessionId = options.env?.['KURORYUU_SESSION_ID'] || null;

        const registrationPayload: Record<string, unknown> = {
          session_id: result.termId,
          source: 'desktop',  // Must be 'local' or 'desktop' per MCP Core validation
          desktop_url: bridgeUrl,  // CRITICAL: k_pty needs this to proxy commands
          cli_type: options.cliType || 'shell',
          pid: result.pid,
          owner_session_id: ownerKSessionId,  // NEW: Link k_session to PTY
        };
        if (options.ownerAgentId) registrationPayload.owner_agent_id = options.ownerAgentId;
        if (options.title) registrationPayload.label = options.title;

        // Mark leader/worker session with owner_role (BEFORE we check if it's leader)
        // This allows MCP Core to identify and protect leader sessions
        // Use the role passed from renderer via environment, fall back to isFirstTerminal logic
        const passedRole = options.env?.KURORYUU_AGENT_ROLE;
        if (passedRole === 'leader' || passedRole === 'worker') {
          registrationPayload.owner_role = passedRole;
        } else if (isFirstTerminal) {
          registrationPayload.owner_role = 'leader';
        } else {
          registrationPayload.owner_role = 'worker';
        }

        const registered = await registerPtyWithMcpCore(registrationPayload);
        if (registered) {
          mainLogger.log('PTY-IPC', `Registered PTY: termId=${result.termId}, agent=${options.ownerAgentId}, k_session=${ownerKSessionId}`);
        } else {
          mainLogger.warn('PTY-IPC', 'PTY registration with MCP Core failed (non-fatal)', { termId: result.termId });
        }
      } catch (err) {
        mainLogger.warn('PTY-IPC', 'PTY registration error (non-fatal)', { error: String(err) });
      }

      // LEADER TRACKING: First terminal spawned = leader (regardless of agent assignment)
      if (!leaderTerminalId) {
        leaderTerminalId = result.termId;
        leaderAgentId = agentId || options.ownerAgentId || null;
        console.log(`[PTY] First terminal is LEADER: ${result.termId} (agent: ${leaderAgentId || 'none'})`);

        // Tell PtyBridge about the leader so MCP Core can query /pty/is-leader
        ptyBridge?.setLeaderTerminalId(result.termId);

        // Register leader with MCP Core for k_pty access
        const leaderId = leaderAgentId || `leader_pty_${result.termId}`;
        try {
          await registerLeaderWithMcpCore(leaderId);
          mainLogger.log('PTY-IPC', `Registered leader: agent=${leaderId}, pty=${result.termId}`);
        } catch (error) {
          mainLogger.error('PTY-IPC', `Failed to register leader: ${error}`);
        }

        // Configure leader monitor for inactivity nudging (does NOT auto-start)
        const leaderMonitor = getLeaderMonitor();
        leaderMonitor.setLeaderTerminalId(result.termId);
        leaderMonitor.setMainWindow(mainWindow);
        leaderMonitor.setWriteCallback((data: string) => {
          return ptyDaemonClient?.write(result.termId, data) ?? false;
        });
        // NOTE: Monitoring is NOT started automatically - user must start via UI
        console.log(`[PTY] Leader monitor configured for terminal: ${result.termId} (not started)`);
      }

      // NOW subscribe - data can arrive and buffer saves will find the session
      await ptyDaemonClient?.subscribe(result.termId);
      mainLogger.log('PTY-IPC', 'Auto-subscribed to terminal', { termId: result.termId });
      console.log(`[PTY] Auto-subscribed to terminal: ${result.termId}`);
      return { id: result.termId, sessionId: result.termId, pid: result.pid };
    }
    mainLogger.error('PTY-IPC', 'PTY creation returned null');
    return null;
  });

  ipcMain.handle('pty:getBufferedData', async (_, id: string) => {
    mainLogger.log('PTY-IPC', 'Fetching buffered data', { termId: id });
    // Check embedded PtyManager first (agent PTYs), then daemon
    if (ptyManager?.hasProcess(id)) {
      const embeddedResult = ptyManager.getBufferedData(id);
      mainLogger.log('PTY-IPC', 'Buffered data from embedded PtyManager', { termId: id, dataLength: embeddedResult.length });
      return embeddedResult;
    }
    const result = await ptyDaemonClient?.getBufferedData(id);
    const dataLength = result?.length ?? 0;
    mainLogger.log('PTY-IPC', 'Buffered data fetched', { termId: id, dataLength });
    return result ?? '';
  });

  ipcMain.handle('pty:write', async (_, id: string, data: string) => {
    // Check embedded PtyManager first (agent PTYs), then daemon
    if (ptyManager?.hasProcess(id)) {
      return ptyManager.write(id, data);
    }
    return ptyDaemonClient?.write(id, data);
  });

  ipcMain.handle('pty:resize', async (_, id: string, cols: number, rows: number) => {
    // Check embedded PtyManager first (agent PTYs), then daemon
    if (ptyManager?.hasProcess(id)) {
      return ptyManager.resize(id, cols, rows);
    }
    return ptyDaemonClient?.resize(id, cols, rows);
  });

  ipcMain.handle('pty:kill', async (_, id: string) => {
    // SECURITY: Block killing the leader terminal - only human can close it
    if (id === leaderTerminalId) {
      mainLogger.warn('PTY-IPC', 'BLOCKED: Attempt to kill leader terminal', { termId: id });
      console.log('[PTY] SECURITY: Blocked attempt to kill leader terminal');
      return { error: 'LEADER_PROTECTED', message: 'Leader terminal cannot be killed programmatically' };
    }

    // Kill the PTY first
    const killResult = await ptyDaemonClient?.kill(id);
    mainLogger.log('PTY-IPC', 'PTY killed', { termId: id, result: killResult });

    // Then unregister from MCP Core (with retry + 403 handling)
    let unregisterOk = false;
    for (let attempt = 0; attempt < 3 && !unregisterOk; attempt++) {
      try {
        const res = await fetch(`${MCP_CORE_URL_DAEMON}/v1/pty/unregister/${id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
          },
        });

        // Handle 403 - re-register secret and retry
        if (res.status === 403 && attempt < 2) {
          mainLogger.warn('PTY-IPC', 'Unregister got 403, re-registering secret...', { termId: id });
          await ensureDesktopSecretRegistered();
          continue;
        }

        const body = await res.json().catch(() => ({ ok: false }));
        unregisterOk = body.ok === true || body.error === 'Session not found';
        if (unregisterOk) {
          mainLogger.log('PTY-IPC', 'Unregistered from MCP Core', { termId: id });
        }
      } catch (e) {
        mainLogger.warn('PTY-IPC', `Unregister attempt ${attempt + 1} failed`, { termId: id, error: String(e) });
      }
    }

    if (!unregisterOk) {
      mainLogger.error('PTY-IPC', 'Failed to deregister PTY from MCP Core after 3 attempts', { termId: id });
    }

    return killResult;
  });

  ipcMain.handle('pty:list', async () => {
    const result = await ptyDaemonClient?.list();
    // Map daemon response format to expected format
    return result?.terminals?.map(t => ({
      id: t.termId,
      sessionId: t.termId,
      pid: t.pid,
      name: t.name,
      alive: t.alive,
    })) ?? [];
  });

  // Set Claude Mode - store in local persistence (daemon doesn't track this)
  ipcMain.handle('pty:setClaudeMode', async (_, sessionId: string, enabled: boolean) => {
    // Store Claude mode flag in local persistence
    desktopPtyPersistence.setClaudeMode(sessionId, enabled);
    return { ok: true };
  });

  // Subscribe to terminal events
  ipcMain.handle('pty:subscribe', async (_, termId: string) => {
    // Agent PTYs live in embedded PtyManager — subscribe is a no-op (data events already forwarded)
    if (ptyManager?.hasProcess(termId)) {
      return;
    }
    return ptyDaemonClient?.subscribe(termId);
  });

  console.log('[PTY] Daemon mode IPC handlers registered');
}

/**
 * Register IPC handlers for embedded mode (legacy)
 */
function setupPtyIpcHandlersEmbedded(): void {
  ipcMain.handle('pty:create', async (_, options: CreatePtyOptions) => {
    // Resolve 'claude' to full path - daemon can't find it by name alone
    if (options.cmd === 'claude' && process.platform === 'win32') {
      const homeDir = process.env.USERPROFILE || process.env.HOME || '';
      const knownPaths = [
        join(homeDir, '.claude', 'node_modules', '.bin', 'claude.cmd'),
        join(process.env.APPDATA || '', 'npm', 'claude.cmd'),
        join(homeDir, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
      ];
      for (const claudePath of knownPaths) {
        if (fs.existsSync(claudePath)) {
          console.log(`[PTY] Resolved claude to: ${claudePath}`);
          options.cmd = claudePath;
          break;
        }
      }
    }

    // === Pre-spawn leader detection ===
    // Extract agent identity from env vars (renderer passes these)
    const agentId = options.ownerAgentId || options.env?.KURORYUU_AGENT_ID;

    // First terminal is ALWAYS leader - inject env var BEFORE spawn
    const isFirstTerminal = !leaderTerminalId;
    if (isFirstTerminal) {
      options.env = {
        ...options.env,
        KURORYUU_IS_LEADER: '1',
        KURORYUU_AGENT_ROLE: 'leader',  // Force leader role for first terminal
        KURORYUU_SESSION_ID: agentId || `pty_leader_${Date.now()}`,
      };
      console.log('[PTY] Injecting leader env vars for first terminal (embedded)');
    } else if (agentId) {
      // Worker: inject KURORYUU_SESSION_ID so statusline shows Kuroryuu identity
      // (without this, statusline falls back to Claude Code's internal session UUID)
      options.env = {
        ...options.env,
        KURORYUU_SESSION_ID: agentId,
      };
    }

    // Also set ownerAgentId if extracted from env
    if (agentId && !options.ownerAgentId) {
      options.ownerAgentId = agentId;
    }

    // Set ownerRole for leader/worker terminal (embedded mode registers via 'create' event)
    // Use the role passed from renderer via environment, fall back to isFirstTerminal logic
    const passedRoleEmbedded = options.env?.KURORYUU_AGENT_ROLE;
    if (passedRoleEmbedded === 'leader' || passedRoleEmbedded === 'worker') {
      (options as any).ownerRole = passedRoleEmbedded;
    } else if (isFirstTerminal) {
      (options as any).ownerRole = 'leader';
    } else {
      (options as any).ownerRole = 'worker';
    }
    // === End pre-spawn leader detection ===

    const result = ptyManager?.create(options);

    // LEADER TRACKING: First terminal spawned = leader (regardless of agent assignment)
    if (result && !leaderTerminalId) {
      leaderTerminalId = result.id;
      leaderAgentId = agentId || options.ownerAgentId || null;
      console.log(`[PTY] First terminal is LEADER: ${result.id} (agent: ${leaderAgentId || 'none'})`);

      // Tell PtyBridge about the leader so MCP Core can query /pty/is-leader
      ptyBridge?.setLeaderTerminalId(result.id);

      // Register leader with MCP Core for k_pty access
      const leaderId = agentId || options.ownerAgentId;
      if (leaderId) {
        await registerLeaderWithMcpCore(leaderId);
      } else {
        console.log('[PTY] Leader terminal has no agent ID, skipping MCP registration');
      }

      // Configure leader monitor for inactivity nudging (embedded mode, does NOT auto-start)
      const leaderMonitor = getLeaderMonitor();
      leaderMonitor.setLeaderTerminalId(result.id);
      leaderMonitor.setMainWindow(mainWindow);
      leaderMonitor.setWriteCallback((data: string) => {
        return ptyManager?.write(result.id, data) ?? false;
      });
      // NOTE: Monitoring is NOT started automatically - user must start via UI
      console.log(`[PTY] Leader monitor configured for terminal: ${result.id} (embedded, not started)`);
    }

    return result;
  });

  ipcMain.handle('pty:getBufferedData', (_, id: string) => {
    return ptyManager?.getBufferedData(id) ?? '';
  });

  ipcMain.handle('pty:write', (_, id: string, data: string) => {
    return ptyManager?.write(id, data);
  });

  ipcMain.handle('pty:resize', (_, id: string, cols: number, rows: number) => {
    return ptyManager?.resize(id, cols, rows);
  });

  ipcMain.handle('pty:kill', async (_, id: string) => {
    // SECURITY: Block killing the leader terminal - only human can close it
    if (id === leaderTerminalId) {
      console.log('[PTY] SECURITY: Blocked attempt to kill leader terminal (embedded)');
      return { error: 'LEADER_PROTECTED', message: 'Leader terminal cannot be killed programmatically' };
    }

    // Kill the PTY first
    const killResult = ptyManager?.kill(id);

    // Then unregister from MCP Core (with retry + 403 handling)
    let unregisterOk = false;
    for (let attempt = 0; attempt < 3 && !unregisterOk; attempt++) {
      try {
        const res = await fetch(`${MCP_CORE_URL_DAEMON}/v1/pty/unregister/${id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
          },
        });

        // Handle 403 - re-register secret and retry
        if (res.status === 403 && attempt < 2) {
          console.warn(`[PTY] Unregister got 403, re-registering secret... (embedded)`);
          await ensureDesktopSecretRegistered();
          continue;
        }

        const body = await res.json().catch(() => ({ ok: false }));
        unregisterOk = body.ok === true || body.error === 'Session not found';
        if (unregisterOk) {
          console.log(`[PTY] Unregistered ${id} from MCP Core (embedded)`);
        }
      } catch (e) {
        console.warn(`[PTY] Unregister attempt ${attempt + 1} failed (embedded):`, e);
      }
    }

    if (!unregisterOk) {
      console.error(`[PTY] Failed to deregister ${id} from MCP Core after 3 attempts (embedded)`);
    }

    return killResult;
  });

  ipcMain.handle('pty:list', () => {
    // Add 'alive: true' for all PTYs - if they're in the manager, they exist
    // This makes embedded mode consistent with daemon mode which returns alive status
    return ptyManager?.list().map(p => ({ ...p, alive: true })) ?? [];
  });

  // Set Claude Mode flag file for a PTY session
  ipcMain.handle('pty:setClaudeMode', async (_, sessionId: string, enabled: boolean) => {
    await ptyManager?.setClaudeMode(sessionId, enabled);
    return { ok: true };
  });

  console.log('[PTY] Embedded mode IPC handlers registered');
}

/**
 * Setup common PTY persistence and bridge handlers (works for both modes)
 */
function setupPtyPersistenceAndBridge(): void {
  // ========================================================================
  // PTY Persistence IPC Handlers (UI state, not PTY process state)
  // ========================================================================

  // Initialize persistence on startup
  ipcMain.handle('pty:initPersistence', () => {
    if (ptyManager) {
      return ptyManager.initializePersistence();
    }
    // Daemon mode: persistence is handled separately
    return { ok: true, mode: 'daemon' };
  });

  // Save terminal state (from renderer)
  ipcMain.handle('pty:saveTerminalState', (_, terminals: unknown[]) => {
    // Forward to persistence module
    for (const term of terminals as Array<TerminalSessionState>) {
      desktopPtyPersistence.saveSession(term);
    }
    return { ok: true, count: terminals.length };
  });

  // Load terminal state (for renderer recovery)
  ipcMain.handle('pty:loadTerminalState', () => {
    const sessions = desktopPtyPersistence.getAllSessions();
    return { terminals: sessions };
  });

  // Save terminal buffer
  ipcMain.handle('pty:saveBuffer', (_, termId: string, content: string) => {
    desktopPtyPersistence.saveBuffer(termId, content);
    return { ok: true };
  });

  // Load terminal buffer
  ipcMain.handle('pty:loadBuffer', (_, termId: string) => {
    const content = desktopPtyPersistence.loadBuffer(termId);
    return { content: content || '' };
  });

  // Get persisted sessions for recovery
  ipcMain.handle('pty:getPersistedSessions', () => {
    const sessions = desktopPtyPersistence.getAllSessions();
    return { sessions };
  });

  // Remove a specific terminal session from persistence
  ipcMain.handle('pty:removeSession', (_, termId: string) => {
    desktopPtyPersistence.removeSession(termId);
    return { ok: true };
  });

  // Send native keyboard event via Chromium input system
  // This creates actual keyboard events (not PTY text) that apps like Claude Code can detect
  ipcMain.handle('input:sendKeyEvent', (_, key: string, modifiers: { shift?: boolean; alt?: boolean; ctrl?: boolean }) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) {
      mainLogger.warn('sendKeyEvent', 'No focused window');
      return { ok: false, error: 'No focused window' };
    }

    const mods: ('shift' | 'control' | 'alt')[] = [];
    if (modifiers.shift) mods.push('shift');
    if (modifiers.alt) mods.push('alt');
    if (modifiers.ctrl) mods.push('control');

    mainLogger.log('sendKeyEvent', `Sending ${key} with modifiers: ${mods.join(', ')}`);

    // Send keyDown
    win.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: key,
      modifiers: mods
    });

    // Send keyUp
    win.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode: key,
      modifiers: mods
    });

    return { ok: true };
  });

  // Full reset - kill all daemon PTYs and clear persistence
  ipcMain.handle('pty:resetAll', async () => {
    mainLogger.log('PTY-Reset', 'Starting full PTY reset');

    let killedCount = 0;

    // 1. Kill all daemon PTYs
    if (ptyDaemonClient && ptyDaemonClient.isConnected) {
      try {
        const { terminals } = await ptyDaemonClient.list();
        for (const term of terminals) {
          await ptyDaemonClient.kill(term.termId);
          killedCount++;
        }
        mainLogger.log('PTY-Reset', 'Killed all daemon PTYs', { count: killedCount });
      } catch (error) {
        mainLogger.log('PTY-Reset', 'Error killing daemon PTYs', { error: String(error) });
      }
    }

    // 2. Kill embedded PTYs if present
    if (ptyManager) {
      ptyManager.dispose();
      mainLogger.log('PTY-Reset', 'Disposed embedded PTY manager');
    }

    // 2.5. Reset leader tracking (so next terminal becomes leader)
    leaderTerminalId = null;
    leaderAgentId = null;
    ptyBridge?.setLeaderTerminalId(null);
    getLeaderMonitor().stopMonitoring();
    getLeaderMonitor().setLeaderTerminalId(null);
    mainLogger.log('PTY-Reset', 'Reset leader tracking and stopped leader monitor');

    // 2.75. Clear MCP Core PTY registry (with retry)
    // Use MCP_CORE_URL_DAEMON (port 8100) - NOT PTY Bridge port 8201
    let mcpResetSuccess = false;
    const maxRetries = 10;
    const retryDelayMs = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${MCP_CORE_URL_DAEMON}/v1/pty/reset`, {
          method: 'DELETE',
          headers: {
            'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
          },
        });
        if (response.ok) {
          const data = await response.json();
          mainLogger.log('PTY-Reset', 'Cleared MCP Core PTY registry', {
            clearedCount: data.cleared_count,
            attempt
          });
          mcpResetSuccess = true;
          break;
        } else {
          mainLogger.log('PTY-Reset', `MCP reset attempt ${attempt}/${maxRetries} failed`, {
            status: response.status
          });
          // Handle 403 by re-registering secret
          if (response.status === 403) {
            mcpCoreSecretValid = false;
            await ensureDesktopSecretRegistered();
          }
        }
      } catch (error) {
        mainLogger.log('PTY-Reset', `MCP reset attempt ${attempt}/${maxRetries} error`, {
          error: String(error)
        });
      }

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }

    if (!mcpResetSuccess) {
      dialog.showMessageBox({
        type: 'warning',
        title: 'MCP Core Unreachable',
        message: 'Could not clear MCP Core PTY registry after 10 attempts. Some stale sessions may remain.',
        buttons: ['OK']
      });
    }

    // 3. Clear persistence
    desktopPtyPersistence.clearAll();

    mainLogger.log('PTY-Reset', 'Full PTY reset complete', { killedPtys: killedCount, mcpResetSuccess });
    return { success: true, killedPtys: killedCount, mcpResetSuccess };
  });

  // Terminal buffer reading (for k_term_read MCP action)
  // Routes request to renderer, which reads xterm.js buffer directly
  ipcMain.handle('pty:getTerminalBuffer', async (
    _,
    termId: string,
    mode: 'tail' | 'viewport' | 'delta',
    options?: { maxLines?: number; mergeWrapped?: boolean; markerId?: number }
  ) => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ ok: false, error: 'Buffer read timeout (5s)' });
      }, 5000);

      // Listen for response from renderer
      const responseHandler = (_event: unknown, responseTermId: string, snapshot: unknown) => {
        if (responseTermId === termId) {
          clearTimeout(timeout);
          ipcMain.removeListener('pty:bufferResponse', responseHandler);
          if ((snapshot as { error?: string })?.error) {
            resolve({ ok: false, error: (snapshot as { error: string }).error });
          } else {
            resolve({ ok: true, ...snapshot as object });
          }
        }
      };

      ipcMain.on('pty:bufferResponse', responseHandler);

      // Request buffer from renderer
      const windows = BrowserWindow.getAllWindows();
      const win = windows.find(w => !w.isDestroyed());
      if (win) {
        win.webContents.send('pty:requestBuffer', {
          termId,
          mode,
          options: options || {},
        });
      } else {
        clearTimeout(timeout);
        ipcMain.removeListener('pty:bufferResponse', responseHandler);
        resolve({ ok: false, error: 'No browser window available' });
      }
    });
  });

  // ========================================================================
  // PTY Bridge (for MCP k_pty commands) - works in BOTH embedded and daemon mode
  // ========================================================================
  if (ptyDaemonClient) {
    // Daemon mode: bridge proxies to daemon client
    ptyBridge = new PtyBridge(null, ptyDaemonClient);
    ptyBridge.start().then(() => {
      console.log(`[PTY Bridge] Started on port ${PTY_BRIDGE_PORT} (daemon mode)`);
    }).catch((err) => {
      console.error('[PTY Bridge] Failed to start:', err);
    });
  } else if (ptyManager) {
    // Embedded mode: bridge uses ptyManager directly
    ptyBridge = new PtyBridge(ptyManager, null);
    ptyBridge.start().then(() => {
      console.log(`[PTY Bridge] Started on port ${PTY_BRIDGE_PORT} (embedded mode)`);
    }).catch((err) => {
      console.error('[PTY Bridge] Failed to start:', err);
    });

    // Register sessions with MCP on create (embedded mode only - daemon mode registers in setupPtyIpcHandlersDaemon)
    ptyManager.on('create', async ({
      id, sessionId, pid, cliType,
      ownerAgentId, ownerSessionId, ownerRole, label
    }: {
      id: string; sessionId: string; pid: number; cliType: string;
      ownerAgentId?: string; ownerSessionId?: string; ownerRole?: string; label?: string;
    }) => {
      // Register with bridge's local map
      ptyBridge?.registerSession(sessionId, id);

      // Register with MCP Core (including owner metadata if present)
      try {
        const bridgeUrl = ptyBridge?.getBridgeUrl() || `http://127.0.0.1:${PTY_BRIDGE_PORT}`;
        const registrationPayload: Record<string, unknown> = {
          session_id: sessionId,
          source: 'desktop',
          desktop_url: bridgeUrl,
          cli_type: cliType,
          pid: pid,
        };
        if (ownerAgentId) registrationPayload.owner_agent_id = ownerAgentId;
        if (ownerSessionId) registrationPayload.owner_session_id = ownerSessionId;
        if (ownerRole) registrationPayload.owner_role = ownerRole;
        if (label) registrationPayload.label = label;

        const registered = await registerPtyWithMcpCore(registrationPayload);
        if (registered) {
          console.log(`[PTY] Registered session ${sessionId} with MCP (owner=${ownerAgentId || 'none'})`);
        } else {
          console.warn(`[PTY] Failed to register ${sessionId} with MCP Core (non-fatal)`);
        }
      } catch (err) {
        console.error(`[PTY] PTY registration error for ${sessionId}:`, err);
      }
    });

    // Unregister sessions from MCP on exit
    ptyManager.on('exit', async ({ id, sessionId, exitCode }: { id: string; sessionId: string; exitCode: number }) => {
      if (sessionId) {
        ptyBridge?.unregisterSession(sessionId);
      }

      if (sessionId) {
        try {
          await fetch(`${MCP_CORE_URL}/v1/pty/unregister/${sessionId}`, {
            method: 'DELETE'
          });
          console.log(`[PTY] Unregistered session ${sessionId} from MCP`);
        } catch (err) {
          console.error(`[PTY] Failed to unregister ${sessionId} from MCP:`, err);
        }
      }
    });
  }

  console.log('[PTY] Persistence handlers registered');
}

function setupFsIpc(): void {
  const { resolve, isAbsolute } = require('path');
  // Resolve project root: env var > dirname-based > cwd
  const PROJECT_ROOT = process.env.KURORYUU_PROJECT_ROOT ||
    process.env.KURORYUU_ROOT ||
    resolve(__dirname, '../../../..');

  console.log('[FS-IPC] __dirname:', __dirname);
  console.log('[FS-IPC] PROJECT_ROOT:', PROJECT_ROOT);

  const resolvePath = (p: string): string =>
    isAbsolute(p) ? p : join(PROJECT_ROOT, p);

  ipcMain.handle('fs:readFile', async (_, path: string) => {
    const fullPath = resolvePath(path);
    console.log('[FS-IPC] readFile:', path, '->', fullPath);
    return readFile(fullPath, 'utf-8');
  });

  ipcMain.handle('fs:writeFile', async (_, path: string, content: string) => {
    await writeFile(resolvePath(path), content, 'utf-8');
  });

  ipcMain.handle('fs:appendFile', async (_, path: string, content: string) => {
    const { appendFile } = await import('fs/promises');
    await appendFile(resolvePath(path), content, 'utf-8');
  });

  ipcMain.handle('fs:readDir', async (_, path: string) => {
    try {
      const entries = await readdir(resolvePath(path), { withFileTypes: true });
      return entries.map(e => e.name + (e.isDirectory() ? '/' : ''));
    } catch {
      return [];
    }
  });

  ipcMain.handle('fs:exists', async (_, path: string) => {
    try {
      const { access } = await import('fs/promises');
      await access(resolvePath(path));
      return true;
    } catch {
      return false;
    }
  });

  // Read image file as base64 (for CaptureCard inline display)
  ipcMain.handle('fs:readImageAsBase64', async (_, path: string) => {
    // Build list of paths to try (handles relative paths from MCP server)
    const pathsToTry: string[] = [];
    const filename = path.includes('/') || path.includes('\\') ? undefined : path;

    // 1. Try as-is (may be absolute)
    pathsToTry.push(resolvePath(path));

    // 2. If relative filename, try common MCP/capture locations
    if (filename) {
      pathsToTry.push(join(PROJECT_ROOT, 'apps', 'mcp_core', filename));
      pathsToTry.push(join(PROJECT_ROOT, 'ai', 'capture', 'output', 'screenshots', filename));
    }

    for (const fullPath of pathsToTry) {
      try {
        const buffer = await fs.promises.readFile(fullPath);
        const base64 = buffer.toString('base64');
        // Determine mime type from extension
        const ext = fullPath.toLowerCase().split('.').pop() || 'png';
        const mimeTypes: Record<string, string> = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'bmp': 'image/bmp',
        };
        const mimeType = mimeTypes[ext] || 'image/png';
        console.log(`[FS-IPC] readImageAsBase64: ${path} -> ${fullPath} (${buffer.length} bytes)`);
        return { ok: true, base64, mimeType };
      } catch {
        // Try next path
        continue;
      }
    }

    console.error(`[FS-IPC] readImageAsBase64: file not found in any location: ${path}`);
    return { ok: false, error: `File not found: ${path} (tried ${pathsToTry.length} locations)` };
  });

  // Recursive directory tree for file explorer
  ipcMain.handle('fs:readTree', async (_, rootPath: string, maxDepth = 3) => {
    const IGNORED = new Set([
      'node_modules', '.git', '__pycache__', '.venv', 'venv',
      'dist', 'build', '.next', '.nuxt', 'coverage', '.cache',
      'DerivedDataCache', 'Intermediate', 'Binaries', '.vs'
    ]);

    interface TreeNode {
      name: string;
      path: string;
      type: 'file' | 'directory';
      children?: TreeNode[];
    }

    async function buildTree(dirPath: string, depth: number): Promise<TreeNode[]> {
      if (depth > maxDepth) return [];

      try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        const nodes: TreeNode[] = [];

        // Sort: directories first, then files, alphabetically
        const sorted = entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

        for (const entry of sorted) {
          if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue;

          const fullPath = join(dirPath, entry.name);
          const relativePath = fullPath.replace(rootPath, '').replace(/\\/g, '/');

          if (entry.isDirectory()) {
            const children = await buildTree(fullPath, depth + 1);
            nodes.push({
              name: entry.name,
              path: relativePath || '/',
              type: 'directory',
              children
            });
          } else {
            nodes.push({
              name: entry.name,
              path: relativePath,
              type: 'file'
            });
          }
        }
        return nodes;
      } catch {
        return [];
      }
    }

    return buildTree(rootPath, 0);
  });

  ipcMain.handle('fs:watch', (_, path: string) => {
    fileWatcher.watch(path);
  });

  ipcMain.handle('fs:unwatch', (_, path: string) => {
    fileWatcher.unwatch(path);
  });

  // Dialog: Open folder/file picker
  ipcMain.handle('dialog:showOpenDialog', async (_, options: Electron.OpenDialogOptions) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (!win) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(win, options);
  });

  ipcMain.handle('shell:openPath', async (_, path: string) => {
    return shell.openPath(path);
  });

  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    return shell.openExternal(url);
  });

  ipcMain.handle('app:getVersion', () => getGitVersion());
  ipcMain.handle('app:getCommitInfo', () => getCommitInfo());

  // Changelog: Save to file
  ipcMain.handle('changelog:saveToFile', async (_, content: string, version: string) => {
    try {
      const result = await dialog.showSaveDialog({
        title: 'Save Changelog',
        defaultPath: `CHANGELOG-${version}.md`,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true };
      }

      await writeFile(result.filePath, content, 'utf-8');
      return { ok: true, path: result.filePath };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });
}

/**
 * Setup IPC handlers for Claude Code auto memory files
 * Reads/writes ~/.claude/projects/{hash}/memory/ directory
 */
function setupClaudeMemoryIpc(): void {
  const homeDir = os.homedir();
  const projectPath = process.env.KURORYUU_PROJECT_ROOT || join(__dirname, '..', '..', '..', '..');

  // Claude Code hashes project paths: replace \, /, : with dashes, strip leading dash
  const computedHash = projectPath.replace(/[\\/:]/g, '-').replace(/^-/, '');

  // Resolve memory dir: try computed hash first, then scan ~/.claude/projects/ for a match
  const projectsDir = join(homeDir, '.claude', 'projects');
  let memDir = join(projectsDir, computedHash, 'memory');

  // If computed hash doesn't exist, scan for matching directory (handles path variations)
  if (!fs.existsSync(memDir) && fs.existsSync(projectsDir)) {
    try {
      const dirs = fs.readdirSync(projectsDir);
      // Look for a directory whose name ends with the project folder name
      const projectName = require('path').basename(projectPath);
      const match = dirs.find(d => d.endsWith(projectName) && fs.existsSync(join(projectsDir, d, 'memory')));
      if (match) {
        memDir = join(projectsDir, match, 'memory');
      }
    } catch { /* ignore scan errors */ }
  }

  ipcMain.handle('claude-memory:list', async () => {
    try {
      if (!fs.existsSync(memDir)) return { ok: true, files: [] };
      const entries = fs.readdirSync(memDir);
      const files = entries.map(name => {
        const stat = fs.statSync(require('path').join(memDir, name));
        return { name, size: stat.size };
      });
      return { ok: true, files };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('claude-memory:read', async (_, filename: string) => {
    try {
      // Sanitize filename to prevent path traversal
      const safeName = require('path').basename(filename);
      const filePath = require('path').join(memDir, safeName);
      if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found' };
      const content = fs.readFileSync(filePath, 'utf-8');
      return { ok: true, content };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('claude-memory:write', async (_, filename: string, content: string) => {
    try {
      // Sanitize filename to prevent path traversal
      const safeName = require('path').basename(filename);
      const filePath = require('path').join(memDir, safeName);
      // Ensure directory exists
      if (!fs.existsSync(memDir)) {
        fs.mkdirSync(memDir, { recursive: true });
      }
      fs.writeFileSync(filePath, content, 'utf-8');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}

/**
 * Setup IPC handlers for Kuro Plugin Configuration
 * Reads/writes .claude/settings.json for TTS, validators, hooks config
 */
/**
 * Sync ElevenLabs API key from token-store to .claude/settings.json
 * so smart_tts.py can read it (Python hook reads from settings.json)
 */
async function syncElevenlabsKeyToSettings(apiKey: string): Promise<void> {
  const { resolve } = require('path');
  const projectRoot = process.env.KURORYUU_PROJECT_ROOT ||
    process.env.KURORYUU_ROOT ||
    resolve(__dirname, '../../../..');
  const settingsPath = join(projectRoot, '.claude', 'settings.json');

  const writer = getSettingsWriter();
  await writer.write(settingsPath, {
    label: 'syncElevenlabsKey',
    mutate: (settings) => {
      if (!settings.kuroPlugin) settings.kuroPlugin = {};
      const kp = settings.kuroPlugin as Record<string, unknown>;
      if (!kp.tts) kp.tts = {};
      (kp.tts as Record<string, unknown>).elevenlabsApiKey = apiKey;
    },
  });
}

function setupKuroConfigIpc(): void {
  const { resolve, isAbsolute } = require('path');
  const PROJECT_ROOT = process.env.KURORYUU_PROJECT_ROOT ||
    process.env.KURORYUU_ROOT ||
    resolve(__dirname, '../../../..');
  const SETTINGS_PATH = join(PROJECT_ROOT, '.claude', 'settings.json');

  // Load kuro config from settings.json
  ipcMain.handle('kuro-config:load', async () => {
    try {
      const content = await readFile(SETTINGS_PATH, 'utf-8');
      const settings = JSON.parse(content);

      // Extract kuro-relevant config from hooks and kuroPlugin settings
      const hooks = settings.hooks || {};
      const kuroPlugin = settings.kuroPlugin || {};

      // If we have complete persisted state (version >= 1), use it directly
      if (kuroPlugin.version && kuroPlugin.version >= 1) {
        const ttsDefaults = {
          provider: 'edge_tts',
          voice: 'en-GB-SoniaNeural',
          smartSummaries: false,
          summaryProvider: 'gateway-auto',
          summaryModel: '',
          userName: 'Ryan',
          messages: {
            stop: 'Work complete',
            subagentStop: 'Task finished',
            notification: 'Your attention is needed',
          },
          elevenlabsApiKey: '',
          elevenlabsModelId: 'eleven_turbo_v2_5',
          elevenlabsStability: 0.5,
          elevenlabsSimilarity: 0.75,
          ...(kuroPlugin.tts || {}),
        };
        // Never send actual API key to renderer — managed by token-store
        ttsDefaults.elevenlabsApiKey = '';
        const config = {
          tts: ttsDefaults,
          elevenlabsKeyConfigured: tokenGetApiKey('elevenlabs') !== null,
          validators: kuroPlugin.validators || {
            ruff: false,
            ty: false,
            timeout: 30000,
          },
          hooks: kuroPlugin.hooks || {
            ttsOnStop: false,
            ttsOnSubagentStop: false,
            ttsOnNotification: false,
            taskSync: false,
            transcriptExport: false,
            observability: false,
            inboxPolling: false,
          },
          features: {
            ragInteractive: false,
            questionMode: false,
            smartSessionStart: false,
            autoCheckpointOnEnd: false,
            previouslySection: false,
            ...(kuroPlugin.features || {}),
          },
        };
        return { ok: true, config };
      }

      // Legacy: reconstruct from hooks (backwards compatibility)
      const config = {
        tts: {
          provider: 'edge_tts',
          voice: kuroPlugin.voice || 'en-GB-SoniaNeural',
          smartSummaries: kuroPlugin.smartSummaries || false,
          summaryProvider: kuroPlugin.summaryProvider || 'gateway-auto',
          summaryModel: kuroPlugin.summaryModel || '',
          userName: kuroPlugin.userName || 'Ryan',
          messages: {
            stop: 'Work complete',
            subagentStop: 'Task finished',
            notification: 'Your attention is needed',
          },
          elevenlabsApiKey: '',
          elevenlabsModelId: 'eleven_turbo_v2_5' as const,
          elevenlabsStability: 0.5,
          elevenlabsSimilarity: 0.75,
        },
        elevenlabsKeyConfigured: tokenGetApiKey('elevenlabs') !== null,
        validators: {
          ruff: false,
          ty: false,
          timeout: 30000,
        },
        hooks: {
          ttsOnStop: false,
          ttsOnSubagentStop: false,
          ttsOnNotification: false,
          taskSync: false,
          transcriptExport: false,
          observability: false,
          inboxPolling: false,
        },
        features: {
          ragInteractive: false,
          questionMode: false,
          smartSessionStart: false,
          autoCheckpointOnEnd: false,
          previouslySection: false,
        },
      };

      // Helper to parse TTS command: extracts message and voice
      // Supports both edge_tts.py and smart_tts.py formats
      const parseTTSCommand = (command: string) => {
        const voiceMatch = command.match(/--voice\s+"([^"]+)"/);
        const voice = voiceMatch ? voiceMatch[1] : null;
        // Message is the first quoted string after the script name
        const msgMatch = command.match(/(?:edge_tts|smart_tts)\.py\s+"([^"]+)"/);
        const message = msgMatch ? msgMatch[1] : null;
        return { message, voice };
      };

      // Helper to check if command is a TTS hook
      const isTTSCommand = (command: string) =>
        command?.includes('edge_tts.py') || command?.includes('smart_tts.py');

      // Parse TTS settings from Stop hook
      const stopHooks = hooks.Stop?.[0]?.hooks || [];
      for (const hook of stopHooks) {
        if (isTTSCommand(hook.command)) {
          config.tts.provider = 'edge_tts';
          config.hooks.ttsOnStop = true;
          const { message, voice } = parseTTSCommand(hook.command);
          if (message) config.tts.messages.stop = message;
          if (voice) config.tts.voice = voice;
        }
      }

      // Parse SubagentStop hooks
      const subagentHooks = hooks.SubagentStop?.[0]?.hooks || [];
      for (const hook of subagentHooks) {
        if (isTTSCommand(hook.command)) {
          config.hooks.ttsOnSubagentStop = true;
          const { message } = parseTTSCommand(hook.command);
          if (message) config.tts.messages.subagentStop = message;
        }
      }

      // Parse Notification hooks
      const notifHooks = hooks.Notification?.[0]?.hooks || [];
      for (const hook of notifHooks) {
        if (isTTSCommand(hook.command)) {
          config.hooks.ttsOnNotification = true;
          const { message } = parseTTSCommand(hook.command);
          if (message) config.tts.messages.notification = message;
        }
      }

      // Parse PostToolUse hooks for validators and task sync
      const postHooks = hooks.PostToolUse || [];
      for (const hookGroup of postHooks) {
        const matcher = hookGroup.matcher || '';
        const groupHooks = hookGroup.hooks || [];

        if (matcher === 'TaskCreate' || matcher === 'TaskUpdate') {
          config.hooks.taskSync = true;
        }

        for (const hook of groupHooks) {
          if (hook.command?.includes('ruff_validator.py')) {
            config.validators.ruff = true;
            if (hook.timeout) config.validators.timeout = hook.timeout;
          }
          if (hook.command?.includes('ty_validator.py')) {
            config.validators.ty = true;
          }
        }
      }

      // Parse UserPromptSubmit for transcript export and inbox polling
      const promptHooks = hooks.UserPromptSubmit?.[0]?.hooks || [];
      for (const hook of promptHooks) {
        if (hook.command?.includes('export-transcript.ps1')) {
          config.hooks.transcriptExport = true;
        }
        if (hook.command?.includes('check_inbox_hook.py')) {
          config.hooks.inboxPolling = true;
        }
      }

      // Parse PreToolUse for RAG interactive + observability
      const preHooks = hooks.PreToolUse || [];
      for (const hookGroup of preHooks) {
        if (hookGroup.matcher === 'mcp__kuroryuu__k_rag') {
          config.features.ragInteractive = true;
        }
      }

      // Parse for observability hooks (check Stop hooks for observability script)
      for (const hook of stopHooks) {
        if (hook.command?.includes('observability')) {
          config.hooks.observability = true;
        }
      }

      return { ok: true, config };
    } catch (error) {
      console.error('[KuroConfig] Failed to load:', error);
      return { ok: false, error: String(error) };
    }
  });

  // Save kuro config to settings.json
  ipcMain.handle('kuro-config:save', async (_, config: {
    tts: {
      provider: string;
      voice: string;
      smartSummaries: boolean;
      summaryProvider: string;
      summaryModel: string;
      userName: string;
      messages: { stop: string; subagentStop: string; notification: string };
      elevenlabsApiKey: string;
      elevenlabsModelId: string;
      elevenlabsStability: number;
      elevenlabsSimilarity: number;
    };
    validators: { ruff: boolean; ty: boolean; timeout: number };
    hooks: {
      ttsOnStop: boolean;
      ttsOnSubagentStop: boolean;
      ttsOnNotification: boolean;
      taskSync: boolean;
      transcriptExport: boolean;
      observability: boolean;
      inboxPolling: boolean;
    };
    features: {
      ragInteractive: boolean;
      questionMode: boolean;
      smartSessionStart: boolean;
      autoCheckpointOnEnd: boolean;
      previouslySection: boolean;
    };
  }) => {
    const writer = getSettingsWriter();
    return writer.write(SETTINGS_PATH, {
      label: 'kuro-config:save',
      mutate: (settings) => {
        if (!settings.hooks) settings.hooks = {};
        const hooks = settings.hooks as Record<string, unknown[]>;

        // Save complete kuroPlugin state (version 1 format)
        // Inject ElevenLabs API key from token-store (source of truth) for smart_tts.py compat
        const ttsToSave = { ...config.tts };
        const storedElKey = tokenGetApiKey('elevenlabs');
        ttsToSave.elevenlabsApiKey = storedElKey || '';

        // Preserve _teamTtsActive flag (set by setTeamTtsOverride, not by UI save)
        const prevTeamTtsActive = (settings.kuroPlugin as Record<string, unknown>)?._teamTtsActive === true;

        settings.kuroPlugin = {
          version: 1,
          tts: ttsToSave,
          validators: config.validators,
          hooks: config.hooks,
          features: config.features,
          _teamTtsActive: prevTeamTtsActive,
        };

        // Dynamic UV path resolution - check env var first, then use platform-appropriate default
        // CC 2.1.47+ runs hooks via Git Bash — use /c/Users/... format instead of C:\\Users\\...
        const useBash = hooksUseBash();
        const rawUvPath = process.env.UV_PATH
          || (process.platform === 'win32' ? join(os.homedir(), '.local', 'bin', 'uv.exe') : 'uv');
        const uvPath = process.platform === 'win32'
          ? (useBash ? toGitBashPath(rawUvPath) : rawUvPath.replace(/\\/g, '\\\\'))
          : rawUvPath;
        // Windows-native path for inside PowerShell -Command strings (PS doesn't understand /c/... paths)
        const uvPathWindows = rawUvPath;
        // CC 2.1.47+ runs hooks via Git Bash — CWD may not be project root,
        // so prefix uv run commands with cd to $CLAUDE_PROJECT_DIR (set by CC for hooks)
        const cdPrefix = useBash ? 'cd "$CLAUDE_PROJECT_DIR" && ' : '';
        const simpleTtsScript = '.claude/plugins/kuro/hooks/utils/tts/edge_tts.py';
        const smartTtsScript = '.claude/plugins/kuro/hooks/smart_tts.py';
        const voice = config.tts.voice || 'en-GB-SoniaNeural';
        const useSmartTts = config.tts.smartSummaries;
        // ElevenLabs always uses smart_tts.py (it reads provider from config and routes)
        const isElevenLabs = config.tts.provider === 'elevenlabs';
        // Timeout is in milliseconds. Smart summaries need ~90s for AI summary + TTS + playback.
        const ttsTimeout = (useSmartTts || isElevenLabs) ? 90000 : 30000;

        // Always include TTS in project hooks — the double-fire prevention in
        // smart_tts.py's should_skip_global() checks for actual hook commands,
        // and the TTS lock (tts_queue.py) prevents simultaneous playback as a safety net.
        const skipProjectTts = false;

        // Observability: Python script via uv run (PowerShell corrupts Windows console input mode)
        const obsScript = (eventType: string) =>
          `${cdPrefix}${uvPath} run .claude/plugins/kuro/hooks/observability/send_event.py "${eventType}"`;
        const obsTimeout = 5;

        // Update Stop hooks - always keep session log + transcript export, only toggle TTS
        {
          const stopHookEntries: Array<{ type: string; command: string; timeout: number }> = [
            { type: 'command', command: useBash
              ? `powershell -NoProfile -Command 'Add-Content -Path "ai/checkpoints/session_log.txt" -Value "Session completed: $(Get-Date -Format \"yyyy-MM-dd HH:mm:ss\")"'`
              : `powershell -NoProfile -Command "Add-Content -Path 'ai/checkpoints/session_log.txt' -Value \\"Session completed: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')\\""`,
              timeout: 10 },
            { type: 'command', command: `powershell -NoProfile -ExecutionPolicy Bypass -File ".claude/plugins/kuro/scripts/export-transcript.ps1"`, timeout: 10000 },
          ];
          if (config.hooks.ttsOnStop && !skipProjectTts) {
            const ttsCommand = (useSmartTts || isElevenLabs)
              ? `${cdPrefix}${uvPath} run ${smartTtsScript} "${config.tts.messages.stop}" --type stop --voice "${voice}"`
              : `${cdPrefix}${uvPath} run ${simpleTtsScript} "${config.tts.messages.stop}" --voice "${voice}"`;
            stopHookEntries.push({ type: 'command', command: ttsCommand, timeout: ttsTimeout });
          }
          if (config.hooks.observability) {
            stopHookEntries.push({ type: 'command', command: obsScript('Stop'), timeout: obsTimeout });
          }
          hooks.Stop = [{ hooks: stopHookEntries }];
        }

        // Update SubagentStop hooks (TTS + observability built together)
        {
          const subStopHooks: Array<{ type: string; command: string; timeout: number }> = [];
          if (config.hooks.ttsOnSubagentStop && !skipProjectTts) {
            const ttsCommand = (useSmartTts || isElevenLabs)
              ? `${cdPrefix}${uvPath} run ${smartTtsScript} "${config.tts.messages.subagentStop}" --type subagent --task "$CLAUDE_TASK_DESCRIPTION" --voice "${voice}"`
              : `${cdPrefix}${uvPath} run ${simpleTtsScript} "${config.tts.messages.subagentStop}" --voice "${voice}"`;
            subStopHooks.push({ type: 'command', command: ttsCommand, timeout: ttsTimeout });
          }
          if (config.hooks.observability && subStopHooks.length > 0) {
            subStopHooks.push({ type: 'command', command: obsScript('SubagentStop'), timeout: obsTimeout });
          }
          if (subStopHooks.length > 0) {
            hooks.SubagentStop = [{ hooks: subStopHooks }];
          } else if (!config.hooks.ttsOnSubagentStop) {
            delete hooks.SubagentStop;
          }
        }

        // Update Notification hooks (TTS + observability built together)
        {
          const notifHooks: Array<{ type: string; command: string; timeout: number }> = [];
          if (config.hooks.ttsOnNotification && !skipProjectTts) {
            const ttsCommand = (useSmartTts || isElevenLabs)
              ? `${cdPrefix}${uvPath} run ${smartTtsScript} "${config.tts.messages.notification}" --type notification --voice "${voice}"`
              : `${cdPrefix}${uvPath} run ${simpleTtsScript} "${config.tts.messages.notification}" --voice "${voice}"`;
            notifHooks.push({ type: 'command', command: ttsCommand, timeout: ttsTimeout });
          }
          if (config.hooks.observability && notifHooks.length > 0) {
            notifHooks.push({ type: 'command', command: obsScript('Notification'), timeout: obsTimeout });
          }
          if (notifHooks.length > 0) {
            hooks.Notification = [{ hooks: notifHooks }];
          } else if (!config.hooks.ttsOnNotification) {
            delete hooks.Notification;
          }
        }

        // Update PostToolUse hooks (validators and task sync)
        const postHooks: Array<{ matcher: string; hooks: Array<{ type: string; command: string; timeout: number }> }> = [];

        // Write/Edit hooks for logging
        postHooks.push({ matcher: 'Write', hooks: [{ type: 'command', command: 'echo WRITE >> ai/hooks/hook_fired.txt', timeout: 5 }] });
        postHooks.push({ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo EDIT >> ai/hooks/hook_fired.txt', timeout: 5 }] });

        // Task sync hooks
        if (config.hooks.taskSync) {
          const syncCmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".claude/plugins/kuro/scripts/sync-claude-task.ps1"';
          postHooks.push({ matcher: 'TaskCreate', hooks: [{ type: 'command', command: syncCmd, timeout: 5000 }] });
          postHooks.push({ matcher: 'TaskUpdate', hooks: [{ type: 'command', command: syncCmd, timeout: 5000 }] });
        }

        // Validator hooks
        if (config.validators.ruff || config.validators.ty) {
          const validatorHooks: Array<{ type: string; command: string; timeout: number }> = [];
          if (config.validators.ruff) {
            validatorHooks.push({
              type: 'command',
              command: useBash
                ? `powershell.exe -NoProfile -Command '$f=$env:TOOL_INPUT_FILE_PATH; if($f -and $f -match "\\.py$"){${uvPathWindows} run .claude/plugins/kuro/hooks/validators/ruff_validator.py $f}'`
                : `powershell.exe -NoProfile -Command "$f=$env:TOOL_INPUT_FILE_PATH; if($f -and $f -match '\\\\.py$'){${uvPath} run .claude/plugins/kuro/hooks/validators/ruff_validator.py $f}"`,
              timeout: config.validators.timeout,
            });
          }
          if (config.validators.ty) {
            validatorHooks.push({
              type: 'command',
              command: useBash
                ? `powershell.exe -NoProfile -Command '$f=$env:TOOL_INPUT_FILE_PATH; if($f -and $f -match "\\.py$"){${uvPathWindows} run .claude/plugins/kuro/hooks/validators/ty_validator.py $f}'`
                : `powershell.exe -NoProfile -Command "$f=$env:TOOL_INPUT_FILE_PATH; if($f -and $f -match '\\\\.py$'){${uvPath} run .claude/plugins/kuro/hooks/validators/ty_validator.py $f}"`,
              timeout: config.validators.timeout,
            });
          }
          postHooks.push({ matcher: 'Write|Edit', hooks: validatorHooks });
        }

        // Add observability hooks to PostToolUse if enabled
        if (config.hooks.observability) {
          postHooks.push({ matcher: '', hooks: [{ type: 'command', command: obsScript('PostToolUse'), timeout: obsTimeout }] });
        }

        // Add inbox polling to PostToolUse catch-all (piggyback on existing or create new)
        if (config.hooks.inboxPolling) {
          const inboxCmd = { type: 'command', command: `${cdPrefix}${uvPath} run .claude/plugins/kuro/hooks/check_inbox_hook.py`, timeout: 5000 };
          const catchAll = postHooks.find(h => h.matcher === '');
          if (catchAll) {
            catchAll.hooks.push(inboxCmd);
          } else {
            postHooks.push({ matcher: '', hooks: [inboxCmd] });
          }
        }

        hooks.PostToolUse = postHooks;

        // Update UserPromptSubmit hooks
        {
          const upsHooks: Array<{ type: string; command: string; timeout: number }> = [];
          if (config.hooks.transcriptExport) {
            upsHooks.push({ type: 'command', command: 'powershell -NoProfile -ExecutionPolicy Bypass -File ".claude/plugins/kuro/scripts/export-transcript.ps1"', timeout: 5 });
          }
          if (config.hooks.observability && upsHooks.length > 0) {
            // Only add observability if other UPS hooks exist — standalone arrays
            // break Windows terminal input in Claude Code v2.1.37
            upsHooks.push({ type: 'command', command: obsScript('UserPromptSubmit'), timeout: obsTimeout });
          }
          if (config.hooks.inboxPolling && upsHooks.length > 0) {
            upsHooks.push({ type: 'command', command: `${cdPrefix}${uvPath} run .claude/plugins/kuro/hooks/check_inbox_hook.py`, timeout: 5000 });
          }
          if (upsHooks.length > 0) {
            hooks.UserPromptSubmit = [{ hooks: upsHooks }];
          } else {
            delete hooks.UserPromptSubmit;
          }
        }

        // Update PreToolUse hooks (RAG interactive + observability)
        {
          const preToolHooks: Array<{ matcher: string; hooks: Array<{ type: string; command: string; timeout: number }> }> = [];
          if (config.features.ragInteractive) {
            preToolHooks.push({
              matcher: 'mcp__kuroryuu__k_rag',
              hooks: [
                { type: 'command', command: 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".claude/plugins/kuro/scripts/rag-interactive-gate.ps1"', timeout: 5000 },
              ],
            });
          }
          if (config.hooks.observability && preToolHooks.length > 0) {
            // Only add observability if other PreToolUse hooks exist — standalone arrays
            // break Windows terminal input in Claude Code v2.1.37
            preToolHooks.push({
              matcher: '',
              hooks: [{ type: 'command', command: obsScript('PreToolUse'), timeout: obsTimeout }],
            });
          }
          if (preToolHooks.length > 0) {
            hooks.PreToolUse = preToolHooks;
          } else {
            delete hooks.PreToolUse;
          }
        }

        // Observability: SessionStart must be empty (standalone hooks break Windows terminal input)
        // Stop, SubagentStop, Notification, PostToolUse, UserPromptSubmit observability
        // is built inline above (not appended separately, to prevent duplication on re-save)
        if (config.hooks.observability) {
          hooks.SessionStart = [];
        } else {
          delete hooks.SessionStart;
        }
      },
    });
  });

  // Toggle team TTS override — only manipulates TTS hook entries + _teamTtsActive flag
  // Does NOT touch kuroPlugin.hooks flags (user preference) or non-TTS hooks
  ipcMain.handle('kuro-config:setTeamTtsOverride', async (_, active: boolean) => {
    const writer = getSettingsWriter();
    return writer.write(SETTINGS_PATH, {
      label: 'kuro-config:setTeamTtsOverride',
      mutate: (settings) => {
        if (!settings.hooks) settings.hooks = {};
        const hooks = settings.hooks as Record<string, unknown[]>;
        const kuroPlugin = settings.kuroPlugin as Record<string, unknown> || {};

        // Set the override flag
        kuroPlugin._teamTtsActive = active;
        settings.kuroPlugin = kuroPlugin;

        if (active) {
          // Teams active: remove TTS from project hooks (global hooks handle it)
          // Stop: strip TTS entries (keep session log + transcript export)
          const stopArr = hooks.Stop as Array<{ hooks: Array<{ command: string }> }> | undefined;
          if (stopArr?.[0]?.hooks) {
            stopArr[0].hooks = stopArr[0].hooks.filter(
              (h) => !h.command.includes('smart_tts.py') && !h.command.includes('edge_tts.py')
            );
          }
          delete hooks.SubagentStop;
          delete hooks.Notification;
        } else {
          // No teams: rebuild TTS entries from user preference flags
          const ttsHooks = (kuroPlugin.hooks as Record<string, boolean>) || {};
          const tts = (kuroPlugin.tts as Record<string, unknown>) || {};
          const voice = (tts.voice as string) || 'en-GB-SoniaNeural';
          const useSmartTts = tts.smartSummaries as boolean;
          const isElevenLabs = tts.provider === 'elevenlabs';
          const ttsTimeout = isElevenLabs ? 90000 : 30000;
          const messages = (tts.messages as Record<string, string>) || {};

          const useBash2 = hooksUseBash();
          const rawUvPath2 = process.env.UV_PATH
            || (process.platform === 'win32' ? join(os.homedir(), '.local', 'bin', 'uv.exe') : 'uv');
          const uvPath2 = process.platform === 'win32'
            ? (useBash2 ? toGitBashPath(rawUvPath2) : rawUvPath2.replace(/\\/g, '\\\\'))
            : rawUvPath2;
          const cdPrefix2 = useBash2 ? 'cd "$CLAUDE_PROJECT_DIR" && ' : '';
          const simpleTtsScript = '.claude/plugins/kuro/hooks/utils/tts/edge_tts.py';
          const smartTtsScript = '.claude/plugins/kuro/hooks/smart_tts.py';

          const makeTtsCmd = (msg: string, type: string, extraArgs = '') => {
            return (useSmartTts || isElevenLabs)
              ? `${cdPrefix2}${uvPath2} run ${smartTtsScript} "${msg}" --type ${type}${extraArgs} --voice "${voice}"`
              : `${cdPrefix2}${uvPath2} run ${simpleTtsScript} "${msg}" --voice "${voice}"`;
          };

          if (ttsHooks.ttsOnStop) {
            const stopArr = hooks.Stop as Array<{ hooks: Array<{ type: string; command: string; timeout: number }> }> | undefined;
            if (stopArr?.[0]?.hooks) {
              stopArr[0].hooks.push({ type: 'command', command: makeTtsCmd(messages.stop || 'Work complete', 'stop'), timeout: ttsTimeout });
            }
          }
          if (ttsHooks.ttsOnSubagentStop) {
            hooks.SubagentStop = [{
              hooks: [{ type: 'command', command: makeTtsCmd(messages.subagentStop || 'Task finished', 'subagent', ' --task "$CLAUDE_TASK_DESCRIPTION"'), timeout: ttsTimeout }],
            }];
          }
          if (ttsHooks.ttsOnNotification) {
            hooks.Notification = [{
              hooks: [{ type: 'command', command: makeTtsCmd(messages.notification || 'Your attention is needed', 'notification'), timeout: ttsTimeout }],
            }];
          }
        }
      },
    });
  });

  // Test TTS with current settings
  ipcMain.handle('kuro-config:test-tts', async (_, ttsConfig: {
    provider: string;
    voice: string;
    messages: { stop: string };
  }) => {
    try {
      const uvPath = process.env.UV_PATH ||
        (process.platform === 'win32'
          ? join(os.homedir(), '.local', 'bin', 'uv.exe')
          : 'uv');
      const voice = ttsConfig.voice || 'en-GB-SoniaNeural';
      const testMessage = 'Hello, this is a test.';

      console.log(`[KuroConfig] Testing TTS with provider: ${ttsConfig.provider}, voice: ${voice}`);

      const { execSync } = require('child_process');

      if (ttsConfig.provider === 'elevenlabs') {
        // Use smart_tts.py which reads provider + API key from saved config
        const smartTtsScript = join(PROJECT_ROOT, '.claude/plugins/kuro/hooks/smart_tts.py');
        execSync(
          `"${uvPath}" run "${smartTtsScript}" "${testMessage}" --type stop --voice "${voice}"`,
          { encoding: 'utf-8', timeout: 90000, cwd: PROJECT_ROOT }
        );
      } else {
        const ttsScript = join(PROJECT_ROOT, '.claude/plugins/kuro/hooks/utils/tts/edge_tts.py');
        execSync(
          `"${uvPath}" run "${ttsScript}" "${testMessage}" --voice "${voice}"`,
          { encoding: 'utf-8', timeout: 30000, cwd: PROJECT_ROOT }
        );
      }

      return { ok: true };
    } catch (error) {
      console.error('[KuroConfig] TTS test failed:', error);
      return { ok: false, error: String(error) };
    }
  });

  // Legacy handler for compatibility (unused)
  ipcMain.handle('kuro-config:test-tts-legacy', async (_, ttsConfig: {
    provider: string;
    voice: string;
    messages: { stop: string };
  }) => {
    try {
      const uvPath = process.env.UV_PATH ||
        (process.platform === 'win32'
          ? join(os.homedir(), '.local', 'bin', 'uv.exe')
          : 'uv');
      const ttsScript = join(PROJECT_ROOT, '.claude/plugins/kuro/hooks/utils/tts/edge_tts.py');
      const testMessage = ttsConfig.messages.stop || 'Test complete';

      const { spawn: nodeSpawn } = require('child_process');
      return new Promise((resolve) => {
        const proc = nodeSpawn(uvPath, ['run', ttsScript, testMessage], {
          cwd: PROJECT_ROOT,
          stdio: 'pipe',
        });

        let stderr = '';
        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('close', (code: number) => {
          if (code === 0) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: stderr || `Exit code: ${code}` });
          }
        });

        proc.on('error', (err: Error) => {
          resolve({ ok: false, error: err.message });
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          proc.kill();
          resolve({ ok: false, error: 'TTS test timed out' });
        }, 30000);
      });
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  // Get available Edge TTS voices (English only)
  ipcMain.handle('kuro-config:get-voices', async () => {
    try {
      const uvPath = process.env.UV_PATH ||
        (process.platform === 'win32'
          ? join(os.homedir(), '.local', 'bin', 'uv.exe')
          : 'uv');
      const { execSync } = require('child_process');

      // Run edge-tts --list-voices and parse output
      const output = execSync(
        `${uvPath} run --with edge-tts edge-tts --list-voices`,
        { encoding: 'utf-8', timeout: 30000 }
      );

      // Parse table format: "en-US-AriaNeural                   Female    General..."
      const voices: Array<{ value: string; label: string; gender: string; locale: string }> = [];
      const lines = output.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip header and separator lines
        if (!trimmed || trimmed.startsWith('Name') || trimmed.startsWith('-')) continue;

        // Parse table row - columns are separated by multiple spaces
        const parts = trimmed.split(/\s{2,}/);
        if (parts.length >= 2) {
          const voiceName = parts[0].trim();
          const gender = parts[1]?.trim() || 'Unknown';

          // Filter for English voices only (en-*)
          if (voiceName.startsWith('en-')) {
            const locale = voiceName.split('-').slice(0, 2).join('-');
            const namePart = voiceName.replace(/Neural$/, '').split('-').pop() || '';
            voices.push({
              value: voiceName,
              label: `${namePart} (${locale}, ${gender})`,
              gender,
              locale,
            });
          }
        }
      }

      console.log(`[KuroConfig] Found ${voices.length} English voices`);
      return { ok: true, voices };
    } catch (error) {
      console.error('[KuroConfig] Failed to get voices:', error);
      // Return fallback voices on error
      return {
        ok: true,
        voices: [
          { value: 'en-GB-SoniaNeural', label: 'Sonia (en-GB, Female)', gender: 'Female', locale: 'en-GB' },
          { value: 'en-US-JennyNeural', label: 'Jenny (en-US, Female)', gender: 'Female', locale: 'en-US' },
          { value: 'en-US-GuyNeural', label: 'Guy (en-US, Male)', gender: 'Male', locale: 'en-US' },
          { value: 'en-AU-NatashaNeural', label: 'Natasha (en-AU, Female)', gender: 'Female', locale: 'en-AU' },
        ],
      };
    }
  });

  // Preview a voice with sample text
  ipcMain.handle('kuro-config:preview-voice', async (_event, voiceName: string) => {
    try {
      const uvPath = process.env.UV_PATH ||
        (process.platform === 'win32'
          ? join(os.homedir(), '.local', 'bin', 'uv.exe')
          : 'uv');
      const ttsScript = join(PROJECT_ROOT, '.claude/plugins/kuro/hooks/utils/tts/edge_tts.py');

      console.log(`[KuroConfig] Previewing voice: ${voiceName}`);

      const { execSync } = require('child_process');
      execSync(
        `"${uvPath}" run "${ttsScript}" "Hello, this is a voice preview." --voice "${voiceName}"`,
        { encoding: 'utf-8', timeout: 30000, cwd: PROJECT_ROOT }
      );

      return { ok: true };
    } catch (error) {
      console.error('[KuroConfig] Voice preview failed:', error);
      return { ok: false, error: String(error) };
    }
  });

  // Fetch available ElevenLabs voices using token-store API key
  ipcMain.handle('kuro-config:elevenlabs-voices', async () => {
    try {
      // Read API key from encrypted token-store (source of truth)
      const apiKey = tokenGetApiKey('elevenlabs');

      if (!apiKey) {
        return { ok: false, error: 'No ElevenLabs API key configured. Set it in Integrations.', voices: [] };
      }

      console.log('[KuroConfig] Fetching ElevenLabs voices...');

      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': apiKey },
      });

      if (!response.ok) {
        return { ok: false, error: `ElevenLabs API error: ${response.status}`, voices: [] };
      }

      const data = await response.json() as {
        voices?: Array<{
          voice_id: string;
          name: string;
          category?: string;
          labels?: { description?: string; accent?: string; age?: string; gender?: string; use_case?: string };
          preview_url?: string;
        }>
      };
      const voices = (data.voices || []).map((v) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category || '',
        description: v.labels?.description || '',
        accent: v.labels?.accent || '',
        age: v.labels?.age || '',
        gender: v.labels?.gender || '',
        use_case: v.labels?.use_case || '',
        preview_url: v.preview_url || '',
      }));

      console.log(`[KuroConfig] Fetched ${voices.length} ElevenLabs voices`);
      return { ok: true, voices };
    } catch (error) {
      console.error('[KuroConfig] Failed to fetch ElevenLabs voices:', error);
      return { ok: false, error: String(error), voices: [] };
    }
  });

  // Preview an ElevenLabs voice
  ipcMain.handle('kuro-config:preview-elevenlabs-voice', async (_event, voiceId: string) => {
    try {
      // Read API key from encrypted token-store (source of truth)
      const apiKey = tokenGetApiKey('elevenlabs');
      if (!apiKey) {
        return { ok: false, error: 'No ElevenLabs API key configured. Set it in Integrations.' };
      }

      // Read voice settings from saved config (not secrets, just preferences)
      const content = await readFile(SETTINGS_PATH, 'utf-8');
      const settings = JSON.parse(content);
      const ttsConfig = settings.kuroPlugin?.tts || {};

      console.log(`[KuroConfig] Previewing ElevenLabs voice: ${voiceId}`);

      // Call ElevenLabs REST API to generate audio
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: 'Hello, this is a voice preview from Kuroryuu.',
          model_id: ttsConfig.elevenlabsModelId || 'eleven_turbo_v2_5',
          voice_settings: {
            stability: ttsConfig.elevenlabsStability ?? 0.5,
            similarity_boost: ttsConfig.elevenlabsSimilarity ?? 0.75,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { ok: false, error: `ElevenLabs API error: ${response.status} - ${errorText.slice(0, 200)}` };
      }

      // Write audio to temp file
      const arrayBuffer = await response.arrayBuffer();
      const tmpPath = join(os.tmpdir(), `elevenlabs_preview_${Date.now()}.mp3`);
      const { writeFileSync, unlinkSync } = require('fs');
      writeFileSync(tmpPath, Buffer.from(arrayBuffer));

      // Play using PowerShell MediaPlayer
      const { execFileSync } = require('child_process');
      const escapedPath = tmpPath.replace(/\\/g, '\\\\').replace(/'/g, "''");
      const psCmd = `
Add-Type -AssemblyName PresentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([System.Uri]::new('${escapedPath}'))
Start-Sleep -Milliseconds 500
$player.Play()
while ($player.NaturalDuration.HasTimeSpan -eq $false) { Start-Sleep -Milliseconds 100 }
$duration = $player.NaturalDuration.TimeSpan.TotalMilliseconds
Start-Sleep -Milliseconds $duration
$player.Close()
`;
      execFileSync('powershell.exe', ['-NoProfile', '-Command', psCmd], {
        encoding: 'utf-8',
        timeout: 60000,
        windowsHide: true,
      });

      // Cleanup
      try { unlinkSync(tmpPath); } catch { /* ignore */ }

      return { ok: true };
    } catch (error) {
      console.error('[KuroConfig] ElevenLabs voice preview failed:', error);
      return { ok: false, error: String(error) };
    }
  });

  // List available config backups
  ipcMain.handle('kuro-config:list-backups', async () => {
    try {
      const backupsDir = join(join(PROJECT_ROOT, '.claude'), 'kuro_configs');

      // Create backup directory if it doesn't exist
      if (!fs.existsSync(backupsDir)) {
        return { ok: true, backups: [] };
      }

      const files = await readdir(backupsDir);
      const backups: Array<{ id: string; timestamp: string; name?: string; size: number; config?: any; isAuto?: boolean }> = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const isManual = file.startsWith('backup_');
        const isAuto = file.startsWith('auto_backup_');
        if (!isManual && !isAuto) continue;

        try {
          const filepath = join(backupsDir, file);
          const stat = fs.statSync(filepath);
          const content = await readFile(filepath, 'utf-8');
          const data = JSON.parse(content);

          if (isAuto) {
            // Auto-backups store raw settings — extract kuroPlugin as config
            // Parse timestamp from filename: auto_backup_YYYYMMDDHHMMSS.json
            const tsMatch = file.match(/auto_backup_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.json/);
            const timestamp = tsMatch
              ? `${tsMatch[1]}-${tsMatch[2]}-${tsMatch[3]}T${tsMatch[4]}:${tsMatch[5]}:${tsMatch[6]}`
              : stat.mtime.toISOString();
            backups.push({
              id: file,
              timestamp,
              name: 'Auto',
              size: stat.size,
              config: data.kuroPlugin || {},
              isAuto: true,
            });
          } else {
            // Manual backups: {timestamp, name, config}
            backups.push({
              id: file,
              timestamp: data.timestamp || file,
              name: data.name,
              size: stat.size,
              config: data.config,
            });
          }
        } catch (e) {
          console.warn(`[KuroConfig] Failed to read backup ${file}:`, e);
        }
      }

      // Sort by timestamp descending (newest first)
      backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return { ok: true, backups };
    } catch (error) {
      console.error('[KuroConfig] List backups failed:', error);
      return { ok: false, error: String(error) };
    }
  });

  // Create a new config backup
  ipcMain.handle('kuro-config:create-backup', async (_event, name?: string) => {
    try {
      const backupsDir = join(join(PROJECT_ROOT, '.claude'), 'kuro_configs');

      // Ensure backup directory exists
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      // Read current config
      let config = {};
      try {
        const content = await readFile(SETTINGS_PATH, 'utf-8');
        const settings = JSON.parse(content);
        config = settings.kuroPlugin || {};
      } catch {
        // Start with empty config if file doesn't exist
      }

      // Generate timestamped filename
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '').slice(0, -5); // Format: 20260204_120000
      const filename = `backup_${timestamp}.json`;
      const filepath = join(backupsDir, filename);

      // Create backup file
      const backup = {
        timestamp: now.toISOString(),
        name: name || undefined,
        config,
      };
      await writeFile(filepath, JSON.stringify(backup, null, 2), 'utf-8');

      return {
        ok: true,
        backup: {
          id: filename,
          timestamp: backup.timestamp,
          name: backup.name,
          size: JSON.stringify(backup).length,
        },
      };
    } catch (error) {
      console.error('[KuroConfig] Create backup failed:', error);
      return { ok: false, error: String(error) };
    }
  });

  // Restore a config backup
  ipcMain.handle('kuro-config:restore-backup', async (_event, backupId: string) => {
    try {
      const backupsDir = join(join(PROJECT_ROOT, '.claude'), 'kuro_configs');
      const filepath = join(backupsDir, backupId);

      // Security: prevent path traversal
      if (!filepath.startsWith(backupsDir) || !filepath.includes('backup_')) {
        return { ok: false, error: 'Invalid backup ID' };
      }

      // Read backup file — handle both manual ({timestamp,config}) and auto (raw settings) formats
      const content = await readFile(filepath, 'utf-8');
      const backup = JSON.parse(content);
      const isAuto = backupId.startsWith('auto_backup_');
      const restoredConfig = isAuto ? (backup.kuroPlugin || {}) : backup.config;

      const writer = getSettingsWriter();
      const result = await writer.write(SETTINGS_PATH, {
        label: 'kuro-config:restore-backup',
        mutate: (settings) => {
          settings.kuroPlugin = restoredConfig;
        },
      });

      if (result.ok) {
        return { ok: true, config: restoredConfig };
      }
      return { ok: false, error: result.error };
    } catch (error) {
      console.error('[KuroConfig] Restore backup failed:', error);
      return { ok: false, error: String(error) };
    }
  });

  // Delete a config backup
  ipcMain.handle('kuro-config:delete-backup', async (_event, backupId: string) => {
    try {
      const backupsDir = join(join(PROJECT_ROOT, '.claude'), 'kuro_configs');
      const filepath = join(backupsDir, backupId);

      // Security: prevent path traversal
      if (!filepath.startsWith(backupsDir) || !filepath.includes('backup_')) {
        return { ok: false, error: 'Invalid backup ID' };
      }

      // Delete backup file
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }

      return { ok: true };
    } catch (error) {
      console.error('[KuroConfig] Delete backup failed:', error);
      return { ok: false, error: String(error) };
    }
  });

  console.log('[KuroConfig] IPC handlers registered');
}

// MCP_CORE Configuration (port 8100)
const MCP_CORE_URL = 'http://127.0.0.1:8100';

// Gateway Configuration (port 8200)
const GATEWAY_URL = 'http://127.0.0.1:8200';

/**
 * Setup IPC handlers for MCP_CORE tools (inbox, checkpoint, rag)
 */
function setupMcpIpc(): void {
  // Generic MCP tool invocation
  // Unwraps MCP JSON-RPC response to return tool result directly
  ipcMain.handle('mcp:call', async (_, tool: string, args: Record<string, unknown>) => {
    try {
      const res = await fetch(`${MCP_CORE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: tool, arguments: args },
          id: Date.now()
        })
      });
      const mcpResponse = await res.json();

      // Unwrap MCP JSON-RPC response to extract tool result
      // MCP wraps results in: {jsonrpc, result: {content: [{type: "text", text: "JSON_STRING"}]}}
      // We need to parse the JSON string from content[0].text
      if (mcpResponse?.result?.content?.[0]?.text) {
        try {
          const toolResult = JSON.parse(mcpResponse.result.content[0].text);
          return { ok: true, result: toolResult };
        } catch {
          // If parsing fails, return the text as-is
          return { ok: true, result: { text: mcpResponse.result.content[0].text } };
        }
      }

      // Handle MCP error responses
      if (mcpResponse?.error) {
        return { ok: false, error: mcpResponse.error.message || mcpResponse.error };
      }

      // Fallback: return raw response if structure is unexpected
      return { ok: false, error: 'Unexpected MCP response format', raw: mcpResponse };
    } catch (error) {
      return { error: String(error), ok: false };
    }
  });

  // Health check
  ipcMain.handle('mcp:health', async () => {
    try {
      const res = await fetch(`${MCP_CORE_URL}/`, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, status: res.status, tools_count: data.tools_count };
      }
      return { ok: false, status: res.status };
    } catch {
      return { ok: false, status: 0 };
    }
  });

  // List available tools
  ipcMain.handle('mcp:tools', async () => {
    try {
      const res = await fetch(`${MCP_CORE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: Date.now()
        })
      });
      const data = await res.json();
      // Extract tools from JSON-RPC result
      return { tools: data.result?.tools || [] };
    } catch (error) {
      return { error: String(error), tools: [] };
    }
  });
}

/**
 * Setup IPC handlers for Gateway (SSE streaming, harness, hooks)
 */
function setupGatewayIpc(): void {
  // Health check
  ipcMain.handle('gateway:health', async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/health`, { method: 'GET' });
      return { ok: res.ok, status: res.status };
    } catch {
      return { ok: false, status: 0 };
    }
  });

  // List LLM backends
  ipcMain.handle('gateway:backends', async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/backends`, { method: 'GET' });
      return await res.json();
    } catch (error) {
      return { error: String(error), backends: [] };
    }
  });

  // Direct MCP call via gateway
  ipcMain.handle('gateway:mcp', async (_, tool: string, args: Record<string, unknown>) => {
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/mcp/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, args })
      });
      return await res.json();
    } catch (error) {
      return { error: String(error), ok: false };
    }
  });

  // SSE streaming chat (returns stream ID, actual streaming handled via preload)
  // Options: { harness?: string, direct?: boolean, backend?: string, temperature?: number, max_tokens?: number }
  // direct=true bypasses harness/inbox for pure LLM testing
  // backend specifies which LLM backend to use (lmstudio, cliproxyapi, claude, gateway-auto)
  ipcMain.handle('gateway:chat', async (
    _,
    messages: unknown[],
    model: string,
    options?: {
      harness?: string;
      direct?: boolean;
      backend?: string;
      temperature?: number;
      max_tokens?: number;
    }
  ) => {
    try {
      // Build URL with direct mode query param if specified
      const directParam = options?.direct ? '?direct=true' : '';
      const url = `${GATEWAY_URL}/v2/chat/stream${directParam}`;

      // Build request body with all options
      const body: Record<string, unknown> = { messages, model };
      if (options?.harness) body.harness = options.harness;
      if (options?.backend) body.backend = options.backend;
      if (options?.temperature !== undefined) body.temperature = options.temperature;
      if (options?.max_tokens !== undefined) body.max_tokens = options.max_tokens;

      console.log('[Gateway:chat] Request:', { model, backend: options?.backend, direct: options?.direct });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      // For non-streaming response, return directly
      if (!res.body) {
        return await res.json();
      }

      // Collect streamed response (buffered to handle partial reads)
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep last incomplete line in buffer
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            chunks.push(line.slice(6));
          }
        }
      }

      return { ok: true, chunks };
    } catch (error) {
      return { error: String(error), ok: false };
    }
  });

  // Invoke harness prompt
  ipcMain.handle('gateway:harness', async (_, promptName: string, context: Record<string, unknown>) => {
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/harness/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_name: promptName, context })
      });
      return await res.json();
    } catch (error) {
      return { error: String(error), ok: false };
    }
  });

  // Create task via gateway - single integration point
  ipcMain.handle('gateway:task:create', async (_, data: {
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    category?: string;
    tags?: string[];
    from_session_id?: string;
  }) => {
    try {
      const response = await fetch(`${GATEWAY_URL}/v1/tasks/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await response.json();
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });
}

/**
 * Setup IPC handlers for service management (restart, health checks)
 */
function setupServiceManagerIpc(): void {
  // Restart MCP Core
  ipcMain.handle('service:restart:mcp', async () => {
    console.log('[ServiceManager] Restarting MCP Core...');
    return await restartService('mcp');
  });

  // Restart Gateway
  ipcMain.handle('service:restart:gateway', async () => {
    console.log('[ServiceManager] Restarting Gateway...');
    return await restartService('gateway');
  });

  // Restart PTY Daemon
  ipcMain.handle('service:restart:pty-daemon', async () => {
    console.log('[ServiceManager] Restarting PTY Daemon...');
    return await restartService('pty-daemon');
  });

  // Get PTY Daemon health (TCP port check)
  ipcMain.handle('service:health:pty-daemon', async () => {
    return await checkPtyDaemonHealth();
  });

  // Get health status for any service
  ipcMain.handle('service:health', async (_, serviceId: string) => {
    return await getServiceHealth(serviceId);
  });

  console.log('[ServiceManager] IPC handlers registered');
}

/**
 * Setup IPC handlers for unified settings system
 */
function setupSettingsIpc(): void {
  const settingsService = getSettingsService();

  // Get a setting value
  ipcMain.handle('settings:get', (_, namespace: string, scope?: 'user' | 'project') => {
    return settingsService.get(namespace, scope);
  });

  // Set a setting value
  ipcMain.handle('settings:set', (_, namespace: string, value: unknown, scope?: 'user' | 'project') => {
    settingsService.set(namespace, value, scope);
    return { ok: true };
  });

  // Update a setting (merge partial)
  ipcMain.handle('settings:update', (_, namespace: string, partial: Record<string, unknown>, scope?: 'user' | 'project') => {
    settingsService.update(namespace, partial, scope);
    return { ok: true };
  });

  // Get all settings for a scope
  ipcMain.handle('settings:getAll', (_, scope: 'user' | 'project') => {
    return settingsService.getAll(scope);
  });

  // Reset a namespace to defaults
  ipcMain.handle('settings:reset', (_, namespace: string, scope?: 'user' | 'project') => {
    settingsService.reset(namespace, scope);
    return { ok: true };
  });

  // Reset all settings for a scope
  ipcMain.handle('settings:resetAll', (_, scope: 'user' | 'project') => {
    settingsService.resetAll(scope);
    return { ok: true };
  });

  // Migration: check if needed
  ipcMain.handle('settings:needsMigration', () => {
    return needsMigration();
  });

  // Migration: get keys to migrate
  ipcMain.handle('settings:getMigrationKeys', () => {
    return getMigrationKeys();
  });

  // Migration: run migration with localStorage data from renderer
  ipcMain.handle('settings:migrate', (_, localStorageData: Record<string, string>) => {
    return migrateFromLocalStorage(localStorageData);
  });

  // Get store paths (for debugging)
  ipcMain.handle('settings:getPaths', () => {
    return {
      user: settingsService.getUserStorePath(),
      project: settingsService.getProjectStorePath(),
    };
  });

  // ============================================================================
  // DOMAIN CONFIG EXPORT (for Tray Companion sync)
  // ============================================================================

  ipcMain.handle('domain-config:export', async (_, data: { version: number; lastUpdated: string; configs: Record<string, unknown> }) => {
    try {
      const projectRoot = process.env.KURORYUU_ROOT || join(__dirname, '../../../..');
      const configPath = join(projectRoot, 'ai', 'config', 'domain-config.json');
      await fs.promises.mkdir(dirname(configPath), { recursive: true });
      await fs.promises.writeFile(configPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log('[DomainConfig] Exported to:', configPath);
      return { success: true, path: configPath };
    } catch (error) {
      console.error('[DomainConfig] Export failed:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('domain-config:import', async () => {
    try {
      const projectRoot = process.env.KURORYUU_ROOT || join(__dirname, '../../../..');
      const configPath = join(projectRoot, 'ai', 'config', 'domain-config.json');
      const data = await fs.promises.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(data);
      console.log('[DomainConfig] Imported from:', configPath);
      return { success: true, data: parsed };
    } catch (error) {
      console.error('[DomainConfig] Import failed:', error);
      return { success: false, error: String(error) };
    }
  });

  // ============================================================================
  // FULL RESET & BACKUP MANAGEMENT
  // ============================================================================

  interface FullResetOptions {
    createBackup: boolean;
    resetUserSettings: boolean;
    resetProjectSettings: boolean;
    clearPTY: boolean;
    clearLocalStorage: boolean;
    clearIndexedDB: boolean;
  }

  interface FullResetResult {
    ok: boolean;
    backupPaths?: string[];
    error?: string;
  }

  // Full app reset handler
  ipcMain.handle('settings:fullReset', async (_, options: FullResetOptions): Promise<FullResetResult> => {
    const backupPaths: string[] = [];

    try {
      mainLogger.log('Settings', 'Starting full reset', options);

      // 1. Create backups if requested
      if (options.createBackup) {
        if (options.resetUserSettings) {
          try {
            const backup = await settingsService.createBackup('user');
            backupPaths.push(backup.path);
            mainLogger.log('Settings', 'Created user settings backup', backup.path);
          } catch (err) {
            mainLogger.error('Settings', 'Failed to backup user settings', err);
          }
        }
        if (options.resetProjectSettings && settingsService.getProjectStorePath()) {
          try {
            const backup = await settingsService.createBackup('project');
            backupPaths.push(backup.path);
            mainLogger.log('Settings', 'Created project settings backup', backup.path);
          } catch (err) {
            mainLogger.error('Settings', 'Failed to backup project settings', err);
          }
        }
      }

      // 2. Reset electron-store settings
      if (options.resetUserSettings) {
        settingsService.resetAll('user');
        mainLogger.log('Settings', 'Reset user settings to defaults');
      }
      if (options.resetProjectSettings && settingsService.getProjectStorePath()) {
        settingsService.resetAll('project');
        mainLogger.log('Settings', 'Reset project settings to defaults');
      }

      // 3. Kill and clear PTY sessions
      if (options.clearPTY) {
        // Kill daemon PTYs
        if (ptyDaemonClient?.isConnected) {
          try {
            const { terminals } = await ptyDaemonClient.list();
            for (const term of terminals) {
              try {
                await ptyDaemonClient.kill(term.termId);
              } catch (err) {
                mainLogger.warn('Settings', `Failed to kill PTY ${term.termId}`, err);
              }
            }
            mainLogger.log('Settings', `Killed ${terminals.length} PTY sessions`);
          } catch (err) {
            mainLogger.error('Settings', 'Failed to list/kill PTYs', err);
          }
        }

        // Reset leader tracking (so next terminal becomes leader)
        leaderTerminalId = null;
        leaderAgentId = null;
        ptyBridge?.setLeaderTerminalId(null);
        getLeaderMonitor().stopMonitoring();
        getLeaderMonitor().setLeaderTerminalId(null);
        mainLogger.log('Settings', 'Reset leader tracking and stopped leader monitor');

        // Clear persistence
        try {
          desktopPtyPersistence.clearAll();
          mainLogger.log('Settings', 'Cleared PTY persistence');
        } catch (err) {
          mainLogger.error('Settings', 'Failed to clear PTY persistence', err);
        }

        // Clear MCP Core PTY registry (with retry + 403 handling)
        let mcpResetOk = false;
        for (let attempt = 0; attempt < 3 && !mcpResetOk; attempt++) {
          try {
            const res = await fetch(`${MCP_CORE_URL_DAEMON}/v1/pty/reset`, {
              method: 'DELETE',
              headers: {
                'X-Kuroryuu-Desktop-Secret': DESKTOP_SECRET,
              },
            });

            // Handle 403 - re-register secret and retry
            if (res.status === 403 && attempt < 2) {
              mainLogger.warn('Settings', 'MCP reset got 403, re-registering secret...');
              await ensureDesktopSecretRegistered();
              continue;
            }

            const body = await res.json().catch(() => ({ ok: false }));
            mcpResetOk = body.ok === true;
            if (mcpResetOk) {
              mainLogger.log('Settings', 'Cleared MCP Core PTY registry', { cleared: body.cleared_count });
            }
          } catch (e) {
            mainLogger.warn('Settings', `MCP reset attempt ${attempt + 1} failed`, { error: String(e) });
          }
        }
        if (!mcpResetOk) {
          mainLogger.warn('Settings', 'Failed to clear MCP Core PTY registry (non-fatal)');
        }
      }

      // 4. Clear Gateway agent registry
      try {
        await fetch('http://127.0.0.1:8200/v1/agents/clear', { method: 'POST' });
        mainLogger.log('Settings', 'Cleared Gateway agent registry');
      } catch {
        // Gateway may not be running, that's ok
      }

      // 5. Signal renderer to clear localStorage/IndexedDB
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings:clearBrowserStorage', {
          clearLocalStorage: options.clearLocalStorage,
          clearIndexedDB: options.clearIndexedDB,
        });
        mainLogger.log('Settings', 'Sent clearBrowserStorage signal to renderer');
      }

      mainLogger.log('Settings', 'Full reset completed successfully', { backupPaths });
      return { ok: true, backupPaths };
    } catch (error) {
      mainLogger.error('Settings', 'Full reset failed', error);
      return { ok: false, error: String(error) };
    }
  });

  // Create backup
  ipcMain.handle('settings:createBackup', async (_, scope: 'user' | 'project'): Promise<BackupInfo> => {
    return settingsService.createBackup(scope);
  });

  // List backups
  ipcMain.handle('settings:listBackups', async (_, scope: 'user' | 'project'): Promise<BackupInfo[]> => {
    return settingsService.listBackups(scope);
  });

  // Restore from backup
  ipcMain.handle('settings:restoreBackup', async (_, backupPath: string, scope: 'user' | 'project') => {
    await settingsService.restoreFromBackup(backupPath, scope);
    return { ok: true };
  });

  // Delete backup
  ipcMain.handle('settings:deleteBackup', async (_, backupPath: string) => {
    await settingsService.deleteBackup(backupPath);
    return { ok: true };
  });

  // Export localStorage data to file (called from renderer before reset)
  ipcMain.handle('settings:exportLocalStorage', async (_, data: string, filename: string) => {
    try {
      const backupDir = app.getPath('userData');
      const backupPath = join(backupDir, filename);
      await writeFile(backupPath, data, 'utf-8');
      mainLogger.log('Settings', 'Exported localStorage backup', backupPath);
      return { ok: true, path: backupPath };
    } catch (error) {
      mainLogger.error('Settings', 'Failed to export localStorage', error);
      return { ok: false, error: String(error) };
    }
  });

  console.log('[Settings] IPC handlers registered');
}

/**
 * Setup IPC handlers for CLI tool detection (Claude, Git, Python)
 */
function setupCliIpc(): void {
  // Detect a CLI tool (claude, git, python)
  ipcMain.handle('cli:detect', (_, tool: CLITool) => {
    return detectTool(tool);
  });

  // Detect all CLI tools at once (legacy - returns kiro, git, python)
  ipcMain.handle('cli:detectAll', () => {
    return {
      kiro: detectTool('kiro'),
      git: detectTool('git'),
      python: detectTool('python'),
    };
  });

  // Detect all CLI providers for WorkerSetupWizard (claude, kiro, kuroryuu, shell)
  ipcMain.handle('cli:detectAllProviders', async () => {
    const { detectAllClis } = await import('./cli/cli-detector');
    return detectAllClis();
  });

  // Configure CLI tool paths (from user settings)
  ipcMain.handle('cli:configure', (_, config: ToolConfig) => {
    configureTools(config);
    return { ok: true };
  });
}

/**
 * Setup IPC handlers for Thinker Wizard (prompt pack discovery)
 */
function setupThinkerIpc(): void {
  // Get project root (Kuroryuu root directory)
  // __dirname is apps/desktop/out/main, so go up 4 levels to reach Kuroryuu
  const getProjectRoot = (): string => {
    return process.env.KURORYUU_ROOT || join(__dirname, '../../../..');
  };

  // List available thinker personas from index.json
  ipcMain.handle('thinker:list-personas', async () => {
    try {
      const projectRoot = getProjectRoot();
      const indexPath = join(projectRoot, 'ai/prompt_packs/thinkers/index.json');
      const content = await readFile(indexPath, 'utf-8');
      const index = JSON.parse(content);
      return { ok: true, packs: index.packs || [] };
    } catch (error) {
      console.error('[Thinker] Failed to list personas:', error);
      return { ok: false, error: String(error) };
    }
  });

  // Get RELATIVE paths for base and persona prompt files (matching worker pattern)
  ipcMain.handle('thinker:get-prompt-paths', async (_, personaId: string) => {
    try {
      // Return relative paths - PTY spawns with cwd=projectRoot so relative paths work
      const basePath = 'ai/prompt_packs/thinkers/_base_thinker.md';
      const personaPath = `ai/prompt_packs/thinkers/${personaId}.md`;
      return { ok: true, basePath, personaPath };
    } catch (error) {
      console.error('[Thinker] Failed to get prompt paths:', error);
      return { ok: false, error: String(error) };
    }
  });
}

/**
 * Setup IPC handlers for Specialist Wizard (specialist agent discovery)
 */
function setupSpecialistIpc(): void {
  // Get project root (Kuroryuu root directory)
  const getProjectRoot = (): string => {
    return process.env.KURORYUU_ROOT || join(__dirname, '../../../..');
  };

  // List available specialists from index.json
  ipcMain.handle('specialist:list-variants', async () => {
    try {
      const projectRoot = getProjectRoot();
      const indexPath = join(projectRoot, 'ai/prompt_packs/specialists/index.json');
      const content = await readFile(indexPath, 'utf-8');
      const index = JSON.parse(content);
      return { ok: true, specialists: index.packs || [] };
    } catch (error) {
      console.error('[Specialist] Failed to list variants:', error);
      return { ok: false, error: String(error) };
    }
  });

  // Get RELATIVE path for specialist prompt file (matching worker pattern)
  // Supports prompt_path override for specialists that live outside the specialists/ directory
  ipcMain.handle('specialist:get-prompt-path', async (_, specialistId: string) => {
    try {
      const projectRoot = getProjectRoot();
      const indexPath = join(projectRoot, 'ai/prompt_packs/specialists/index.json');
      const content = await readFile(indexPath, 'utf-8');
      const index = JSON.parse(content);
      const pack = (index.packs || []).find((p: { id: string; prompt_path?: string }) => p.id === specialistId);
      const promptPath = pack?.prompt_path || `ai/prompt_packs/specialists/${specialistId}.md`;
      return { ok: true, promptPath };
    } catch (error) {
      console.error('[Specialist] Failed to get prompt path:', error);
      return { ok: false, error: String(error) };
    }
  });
}

/**
 * Setup IPC handlers for Quizmaster (requirements extraction specialist)
 */
function setupQuizmasterIpc(): void {
  // Get project root (Kuroryuu root directory)
  const getProjectRoot = (): string => {
    return process.env.KURORYUU_ROOT || join(__dirname, '../../../..');
  };

  // Get RELATIVE path for quizmaster prompt file (matching worker pattern)
  ipcMain.handle('quizmaster:get-prompt-path', async () => {
    try {
      // Return relative path - PTY spawns with cwd=projectRoot so relative paths work
      const promptPath = 'ai/prompt_packs/quizmasterplanner/ULTIMATE_QUIZZER_PROMPT_small.md';
      return { ok: true, promptPath };
    } catch (error) {
      console.error('[Quizmaster] Failed to get prompt path:', error);
      return { ok: false, error: String(error) };
    }
  });
}

/**
 * Setup IPC handlers for Workflow Specialist Wizard (PRD workflow stage specialists)
 */
function setupWorkflowSpecialistIpc(): void {
  // Get project root (Kuroryuu root directory)
  const getProjectRoot = (): string => {
    return process.env.KURORYUU_ROOT || join(__dirname, '../../../..');
  };

  // List available workflow specialists from index.json
  ipcMain.handle('workflow-specialist:list-variants', async () => {
    try {
      const projectRoot = getProjectRoot();
      const indexPath = join(projectRoot, 'ai/prompt_packs/workflow_specialists/index.json');
      const content = await readFile(indexPath, 'utf-8');
      const index = JSON.parse(content);
      return { ok: true, specialists: index.packs || [] };
    } catch (error) {
      console.error('[WorkflowSpecialist] Failed to list variants:', error);
      return { ok: false, error: String(error) };
    }
  });

  // Get RELATIVE path for workflow specialist prompt file (matching worker pattern)
  ipcMain.handle('workflow-specialist:get-prompt-path', async (_, specialistId: string) => {
    try {
      // Return relative path - PTY spawns with cwd=projectRoot so relative paths work
      const promptPath = `ai/prompt_packs/workflow_specialists/${specialistId}.md`;
      return { ok: true, promptPath };
    } catch (error) {
      console.error('[WorkflowSpecialist] Failed to get prompt path:', error);
      return { ok: false, error: String(error) };
    }
  });
}

/**
 * Setup IPC handlers for Pen Tester prompt packs
 */
function setupPentesterIpc(): void {
  const getProjectRoot = (): string => {
    return process.env.KURORYUU_ROOT || join(__dirname, '../../../..');
  };

  // List available pen testers from index.json
  ipcMain.handle('pentester:list-variants', async () => {
    try {
      const projectRoot = getProjectRoot();
      const indexPath = join(projectRoot, 'ai/prompt_packs/pen_testers/index.json');
      const content = await readFile(indexPath, 'utf-8');
      const index = JSON.parse(content);
      return { ok: true, pentesters: index.packs || [] };
    } catch (error) {
      console.error('[Pentester] Failed to list variants:', error);
      return { ok: false, error: String(error) };
    }
  });

  // Get RELATIVE path for pen tester prompt file (matching worker pattern)
  ipcMain.handle('pentester:get-prompt-path', async (_, pentesterId: string) => {
    try {
      // Return relative path - PTY spawns with cwd=projectRoot so relative paths work
      const promptPath = `ai/prompt_packs/pen_testers/${pentesterId}.md`;
      return { ok: true, promptPath };
    } catch (error) {
      console.error('[Pentester] Failed to get prompt path:', error);
      return { ok: false, error: String(error) };
    }
  });
}

// Provider service instances (lazy initialized)
let anthropicService: AnthropicService | null = null;
let openaiService: OpenAIService | null = null;
let githubService: GitHubOAuthService | null = null;

function getAnthropicService(): AnthropicService {
  if (!anthropicService) anthropicService = new AnthropicService();
  return anthropicService;
}

function getOpenAIService(): OpenAIService {
  if (!openaiService) openaiService = new OpenAIService();
  return openaiService;
}

function getGitHubService(clientId?: string, clientSecret?: string): GitHubOAuthService {
  if (!githubService && clientId) {
    githubService = new GitHubOAuthService(clientId, clientSecret);
  }
  return githubService!;
}

/**
 * Setup IPC handlers for OAuth/API key authentication
 */
function setupAuthIpc(): void {
  // Check if encryption is available
  ipcMain.handle('auth:encryptionAvailable', () => {
    return isEncryptionAvailable();
  });

  // Get status of all providers
  ipcMain.handle('auth:getAllStatuses', () => {
    return getAllProviderStatuses();
  });

  // Disconnect a provider
  ipcMain.handle('auth:disconnect', (_, provider: OAuthProvider) => {
    disconnectProvider(provider);
    return { ok: true };
  });

  // =============================================
  // Anthropic API Key
  // =============================================
  ipcMain.handle('auth:anthropic:setKey', (_, apiKey: string) => {
    getAnthropicService().setApiKey(apiKey);
    return { ok: true };
  });

  ipcMain.handle('auth:anthropic:verify', async (_, apiKey?: string) => {
    return getAnthropicService().verifyApiKey(apiKey);
  });

  ipcMain.handle('auth:anthropic:getModels', async () => {
    return getAnthropicService().listModels();
  });

  ipcMain.handle('auth:anthropic:isConnected', () => {
    return getAnthropicService().isConnected();
  });

  // =============================================
  // OpenAI API Key
  // =============================================
  ipcMain.handle('auth:openai:setKey', (_, apiKey: string) => {
    getOpenAIService().setApiKey(apiKey);
    return { ok: true };
  });

  ipcMain.handle('auth:openai:verify', async (_, apiKey?: string) => {
    return getOpenAIService().verifyApiKey(apiKey);
  });

  ipcMain.handle('auth:openai:getModels', async () => {
    return getOpenAIService().listModels();
  });

  ipcMain.handle('auth:openai:isConnected', () => {
    return getOpenAIService().isConnected();
  });

  // =============================================
  // ElevenLabs API Key (unified across all TTS consumers)
  // =============================================
  ipcMain.handle('auth:elevenlabs:setKey', async (_, apiKey: string) => {
    tokenSaveApiKey('elevenlabs', apiKey);
    // Sync to .claude/settings.json for smart_tts.py hook compatibility
    await syncElevenlabsKeyToSettings(apiKey);
    return { ok: true };
  });

  ipcMain.handle('auth:elevenlabs:verify', async (_, apiKey?: string) => {
    const key = apiKey || tokenGetApiKey('elevenlabs');
    if (!key) return { valid: false, error: 'No API key provided' };
    try {
      const resp = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': key },
      });
      return resp.ok
        ? { valid: true }
        : { valid: false, error: `ElevenLabs API error: ${resp.status}` };
    } catch (error) {
      return { valid: false, error: String(error) };
    }
  });

  ipcMain.handle('auth:elevenlabs:hasKey', () => {
    return tokenGetApiKey('elevenlabs') !== null;
  });

  ipcMain.handle('auth:elevenlabs:removeKey', async () => {
    tokenDeleteApiKey('elevenlabs');
    await syncElevenlabsKeyToSettings('');
    return { ok: true };
  });

  // =============================================
  // GitHub OAuth
  // =============================================
  ipcMain.handle('auth:github:configure', (_, clientId: string, clientSecret?: string) => {
    getGitHubService(clientId, clientSecret);
    return { ok: true };
  });

  ipcMain.handle('auth:github:startAuth', async () => {
    const service = githubService;
    if (!service) {
      return { ok: false, error: 'GitHub not configured. Call auth:github:configure first.' };
    }
    await service.startAuthFlow();
    return { ok: true };
  });

  ipcMain.handle('auth:github:getUser', async () => {
    const service = githubService;
    if (!service) return null;
    return service.getUserInfo();
  });

  ipcMain.handle('auth:github:listRepos', async (_, params?: Record<string, unknown>) => {
    const service = githubService;
    if (!service) return [];
    return service.listRepositories(params as Parameters<typeof service.listRepositories>[0]);
  });

  ipcMain.handle('auth:github:isConnected', () => {
    return githubService?.isConnected() ?? false;
  });

  // Get raw access token for passing to Gateway
  ipcMain.handle('auth:github:getToken', async () => {
    if (!githubService) return null;
    return githubService.getValidAccessToken();
  });

  // =============================================
  // OAuth App Credentials (secure storage for clientId/secret)
  // =============================================
  ipcMain.handle('auth:oauthApp:save', (_, provider: OAuthProvider, clientId: string, clientSecret?: string) => {
    saveOAuthAppCredentials(provider, { clientId, clientSecret });
    return { ok: true };
  });

  ipcMain.handle('auth:oauthApp:get', (_, provider: OAuthProvider) => {
    const creds = getOAuthAppCredentials(provider);
    // Return clientId but mask the secret for security
    return creds ? {
      clientId: creds.clientId,
      hasSecret: !!creds.clientSecret,
      createdAt: creds.createdAt
    } : null;
  });

  ipcMain.handle('auth:oauthApp:delete', (_, provider: OAuthProvider) => {
    deleteOAuthAppCredentials(provider);
    return { ok: true };
  });

  ipcMain.handle('auth:oauthApp:has', (_, provider: OAuthProvider) => {
    return hasOAuthAppCredentials(provider);
  });

  // Load and configure GitHub service from stored credentials
  ipcMain.handle('auth:github:loadFromStore', () => {
    const creds = getOAuthAppCredentials('github');
    if (creds?.clientId) {
      githubService = new GitHubOAuthService(creds.clientId, creds.clientSecret);
      return { ok: true, clientId: creds.clientId };
    }
    return { ok: false, error: 'No stored GitHub credentials' };
  });
}

/**
 * Register custom protocol for OAuth callbacks
 */
function registerOAuthProtocol(): void {
  // Register kuroryuu:// as a standard scheme before app is ready
  if (protocol.registerSchemesAsPrivileged) {
    protocol.registerSchemesAsPrivileged([
      { scheme: 'kuroryuu', privileges: { standard: true, secure: true } },
      { scheme: 'local-video', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
    ]);
  }
}

/**
 * Handle OAuth callback URL
 */
async function handleOAuthCallback(url: string): Promise<void> {
  console.log('[OAuth] Received callback URL:', url);

  // Parse the URL to determine provider
  // Expected format: kuroryuu://oauth/callback/github?code=xxx&state=yyy
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (pathParts[0] === 'oauth' && pathParts[1] === 'callback') {
      const provider = pathParts[2];

      if (provider === 'github' && githubService) {
        await githubService.handleCallback(url);
        // Notify renderer of successful auth
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('oauth:callback', { provider: 'github', success: true });
        }
      } else {
        console.warn('[OAuth] Unknown provider or service not initialized:', provider);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('oauth:callback', { provider, success: false, error: 'Unknown provider' });
        }
      }
    }
  } catch (err) {
    console.error('[OAuth] Failed to handle callback:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('oauth:callback', { success: false, error: String(err) });
    }
  }
}

// Request single instance lock for deep linking
// Skip single instance lock in E2E test mode to allow parallel test runs
const isE2ETest = process.env.E2E_TEST_MODE === 'true';
const gotTheLock = isE2ETest ? true : app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Handle deep links on Windows/Linux (second instance)
  app.on('second-instance', (_event, commandLine) => {
    // Someone tried to run a second instance, focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Look for OAuth callback URL in command line args
    const url = commandLine.find(arg => arg.startsWith('kuroryuu://'));
    if (url) {
      handleOAuthCallback(url);
    }
  });
}

function createWindow(): void {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  // Get icon path based on platform - handle both dev and packaged builds
  let iconPath: string;
  if (process.platform === 'win32') {
    // Try multiple locations for the icon
    const iconCandidates = [
      join(process.resourcesPath || '', 'icon.ico'),           // Packaged (extraResources)
      join(process.resourcesPath || '', 'Kuroryuu_ico.ico'),   // Packaged app (legacy)
      join(__dirname, '../../resources/Kuroryuu_ico.ico'),     // Dev build
      join(__dirname, '../../build/icon.ico'),                 // electron-builder build folder
    ];
    iconPath = iconCandidates.find(p => fs.existsSync(p)) || iconCandidates[2];
  } else {
    const iconCandidates = [
      join(process.resourcesPath || '', 'Kuroryuu_png.png'),
      join(__dirname, '../../resources/Kuroryuu_png.png'),
      join(__dirname, '../../build/icon.png'),
    ];
    iconPath = iconCandidates.find(p => fs.existsSync(p)) || iconCandidates[1];
  }
  console.log('[Main] Using window icon:', iconPath, 'exists:', fs.existsSync(iconPath));

  // Load icon using nativeImage for better Windows compatibility
  const appIcon = nativeImage.createFromPath(iconPath);
  if (appIcon.isEmpty()) {
    console.warn('[Main] Warning: App icon is empty!');
  } else {
    console.log('[Main] App icon loaded, size:', appIcon.getSize());
  }

  mainWindow = new BrowserWindow({
    width: Math.min(WINDOW_WIDTH, screenWidth - 40),
    height: Math.min(WINDOW_HEIGHT, screenHeight - 40),
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: `Kuroryuu v${getGitVersion()} - kuroryuu.com`,
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Remove menu bar completely so Alt keys pass through to terminal
  // (Alt+M is needed for Claude Code plan mode toggle on Windows)
  mainWindow.setMenu(null);

  // Force set icon again after window creation (helps with Windows taskbar in dev mode)
  if (process.platform === 'win32' && !appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon);
  }

  mainWindow.on('ready-to-show', () => {
    // Re-apply title after HTML loads (HTML <title> overrides BrowserWindow title)
    mainWindow?.setTitle(`Kuroryuu v${getGitVersion()} - kuroryuu.com`);
    // Set icon again when window is ready (ensures taskbar icon updates)
    if (process.platform === 'win32' && !appIcon.isEmpty()) {
      mainWindow?.setIcon(appIcon);
    }
    mainWindow?.maximize();
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools();
    }
  });

  // Window close handler with confirmation dialog and progress modal
  // Uses IPC to show themed Kuroryuu dialog instead of native OS dialog
  mainWindow.on('close', async (event) => {
    if (isShuttingDown) {
      // Already shutting down, allow close
      return;
    }

    // Prevent immediate close
    event.preventDefault();

    // Send confirmation request to renderer (Kuroryuu themed dialog)
    mainWindow?.webContents.send('quit:show-confirm');

    // Wait for response from renderer
    const confirmed = await new Promise<boolean>((resolve) => {
      const responseHandler = (_event: Electron.IpcMainEvent, response: boolean) => {
        ipcMain.removeListener('quit:confirm-response', responseHandler);
        resolve(response);
      };
      ipcMain.on('quit:confirm-response', responseHandler);

      // Timeout after 30 seconds (fallback to allow close)
      setTimeout(() => {
        ipcMain.removeListener('quit:confirm-response', responseHandler);
        resolve(false);
      }, 30000);
    });

    if (confirmed) {
      // User clicked "Yes" - proceed with shutdown
      isShuttingDown = true;
      console.log('[Main] User confirmed quit, starting shutdown sequence');

      // Show progress modal in renderer
      mainWindow?.webContents.send('shutdown:start');

      // Run cleanup with progress updates
      await performShutdownSequence(mainWindow!);

      // Actually quit
      console.log('[Main] Shutdown complete, exiting app');
      app.exit(0);
    } else {
      console.log('[Main] User cancelled quit');
    }
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/**
 * Create a separate CodeEditor window that can run side-by-side with main app.
 * Uses hash routing (#/code-editor) to display the code editor UI.
 */
function createCodeEditorWindow(): void {
  // If window exists and not destroyed, focus it
  if (codeEditorWindow && !codeEditorWindow.isDestroyed()) {
    codeEditorWindow.focus();
    return;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const iconPath = process.platform === 'win32'
    ? join(__dirname, '../../resources/Kuroryuu_ico.ico')
    : join(__dirname, '../../resources/Kuroryuu_png.png');

  codeEditorWindow = new BrowserWindow({
    width: Math.min(1200, screenWidth - 100),
    height: Math.min(800, screenHeight - 100),
    minWidth: 600,
    minHeight: 400,
    show: false,
    autoHideMenuBar: true,
    title: 'Kuroryuu CodeEditor',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  codeEditorWindow.setMenu(null);

  codeEditorWindow.on('ready-to-show', () => {
    codeEditorWindow?.show();
    if (isDev) {
      codeEditorWindow?.webContents.openDevTools();
    }
  });

  codeEditorWindow.on('closed', () => {
    codeEditorWindow = null;
  });

  // Load with hash route for code editor view
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    codeEditorWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/code-editor`);
  } else {
    codeEditorWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/code-editor'
    });
  }

  console.log('[Main] CodeEditor window created');
}

/**
 * Create a separate Playground window for Claude Playground dashboards.
 * Uses hash routing (#/playground) to display the Playground panel.
 */
function createPlaygroundWindow(): void {
  if (playgroundWindow && !playgroundWindow.isDestroyed()) {
    playgroundWindow.focus();
    return;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const iconPath = process.platform === 'win32'
    ? join(__dirname, '../../resources/Kuroryuu_ico.ico')
    : join(__dirname, '../../resources/Kuroryuu_png.png');

  playgroundWindow = new BrowserWindow({
    width: Math.min(1400, screenWidth - 100),
    height: Math.min(900, screenHeight - 100),
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Claude Playground',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  playgroundWindow.setMenu(null);

  playgroundWindow.on('ready-to-show', () => {
    playgroundWindow?.show();
    if (isDev) {
      playgroundWindow?.webContents.openDevTools();
    }
  });

  playgroundWindow.on('closed', () => {
    playgroundWindow = null;
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    playgroundWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/playground`);
  } else {
    playgroundWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/playground'
    });
  }

  console.log('[Main] Playground window created');
}

/**
 * Get the tray icon path that works in both dev and packaged builds.
 * Uses .ico for Windows system tray.
 */
function getTrayIconPath(): string {
  // Windows uses .ico files for tray icons
  const iconCandidates = [
    join(process.resourcesPath || '', 'icon.ico'),              // Packaged (extraResources)
    join(process.resourcesPath || '', 'Kuroryuu_ico.ico'),      // Packaged (legacy)
    join(__dirname, '../../build/icon.ico'),                     // Dev build folder
    join(__dirname, '../../resources/Kuroryuu_ico.ico'),         // Dev resources folder
  ];

  for (const candidate of iconCandidates) {
    if (fs.existsSync(candidate)) {
      console.log('[Tray] Found icon at:', candidate);
      return candidate;
    }
  }

  // Last resort - return first candidate (will log warning if not found)
  return iconCandidates[2]; // build/icon.ico
}

/**
 * Create the system tray icon for the desktop app.
 */
function createAppTray(): void {
  if (appTray) {
    return; // Already created
  }

  try {
    const iconPath = getTrayIconPath();
    console.log('[Tray] Loading icon from:', iconPath);

    let icon = nativeImage.createFromPath(iconPath);

    if (icon.isEmpty()) {
      console.warn('[Tray] Icon is empty, tray may not display correctly');
    } else {
      console.log('[Tray] Icon loaded, size:', icon.getSize());
      // Resize for tray (16x16 on Windows)
      icon = icon.resize({ width: 16, height: 16 });
    }

    appTray = new Tray(icon);
    appTray.setToolTip('Kuroryuu Desktop');

    // Build context menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Kuroryuu',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Open Code Editor',
        click: () => {
          createCodeEditorWindow();
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);

    appTray.setContextMenu(contextMenu);

    // Click on tray icon shows the main window
    appTray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    console.log('[Tray] System tray icon created successfully');
  } catch (error) {
    console.error('[Tray] Failed to create system tray:', error);
  }
}

app.whenReady().then(async () => {
  // Set app user model ID for Windows taskbar (replaces electronApp.setAppUserModelId)
  app.setAppUserModelId('com.kuroryuu.desktop');

  // Register custom protocol for OAuth callbacks (kuroryuu://)
  app.setAsDefaultProtocolClient('kuroryuu');

  // Register local-video:// protocol for serving local video files
  // Format: local-video://localhost/<encoded-path>
  protocol.handle('local-video', (request) => {
    // Extract file path from URL (remove protocol and localhost prefix, decode)
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname.slice(1)); // Remove leading /
    console.log('[local-video] Serving:', filePath);
    return net.fetch('file:///' + filePath);
  });


  // Handle deep links on macOS
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleOAuthCallback(url);
  });

  // Setup PTY IPC (daemon or embedded mode)
  await setupPtyIpc();

  // In daemon mode, ptyManager is null (daemon handles renderer terminals).
  // Create an embedded PtyManager anyway for agent PTY sessions (CLI execution service).
  // Agent PTYs are ephemeral and don't need daemon persistence.
  if (!ptyManager) {
    console.log('[PTY] Creating embedded PtyManager for agent PTY sessions (daemon mode active)');
    ptyManager = new PtyManager();

    // Forward data/exit events to renderer so Terminal component can display agent PTY output
    ptyManager.on('data', ({ id, data }: { id: string; data: string }) => {
      try {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('pty:data', id, data);
        }
      } catch { /* window destroyed */ }
    });
    ptyManager.on('exit', async ({ id, exitCode }: { id: string; exitCode: number }) => {
      try {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('pty:exit', id, exitCode);
        }
      } catch { /* window destroyed */ }
    });
  }

  // Register Desktop secret with Gateway for secure role management
  await registerDesktopSecret();

  // Now that secret is registered, sync all PTY sessions with MCP Core
  // This must happen AFTER registerDesktopSecret() to avoid 403 errors
  if (USE_PTY_DAEMON && ptyDaemonClient?.isConnected) {
    await resyncAllPtySessions();
    mainLogger.log('PTY-Sync', 'Registered daemon PTYs with MCP Core');
  }

  // IPC handler for renderer to get the Desktop secret (for role changes)
  ipcMain.handle('get-desktop-secret', () => DESKTOP_SECRET);

  // IPC handler for copying video files to assets folder (for git commit)
  ipcMain.handle('video:copy-to-assets', async (_, sourcePath: string, videoId: string) => {
    try {
      const projectRoot = join(__dirname, '..', '..', '..', '..');
      const assetsDir = join(projectRoot, 'assets', 'videos');
      const ext = extname(sourcePath);
      const destPath = join(assetsDir, `${videoId}${ext}`);

      // Create directory if not exists
      await fs.promises.mkdir(assetsDir, { recursive: true });

      // Copy file
      await fs.promises.copyFile(sourcePath, destPath);

      console.log(`[Video] Copied ${sourcePath} -> ${destPath}`);
      return { ok: true, relativePath: `assets/videos/${videoId}${ext}` };
    } catch (error) {
      console.error('[Video] Copy failed:', error);
      return { ok: false, error: String(error) };
    }
  });

  // IPC handler for loading video from assets folder (for restart persistence)
  ipcMain.handle('video:load-from-assets', async (_, videoId: string) => {
    try {
      const projectRoot = join(__dirname, '..', '..', '..', '..');
      const videoPath = join(projectRoot, 'assets', 'videos', `${videoId}.mp4`);

      // Check if file exists
      await fs.promises.access(videoPath);

      // Read file as buffer and convert to base64
      const buffer = await fs.promises.readFile(videoPath);
      const base64 = buffer.toString('base64');

      console.log(`[Video] Loaded ${videoPath} (${buffer.length} bytes)`);
      return { ok: true, base64, mimeType: 'video/mp4' };
    } catch (error) {
      // File doesn't exist or can't be read - this is normal on first run
      return { ok: false, error: String(error) };
    }
  });

  // IPC handlers for leader registration with MCP Core
  ipcMain.handle('register-leader-mcp', async (_, agentId: string) => {
    await registerLeaderWithMcpCore(agentId);
    return { ok: true };
  });

  ipcMain.handle('deregister-leader-mcp', async (_, agentId: string) => {
    await deregisterLeaderFromMcpCore(agentId);
    return { ok: true };
  });

  // IPC handler for professional app restart (leader death scenario)
  // Spawns the startup .bat detached, then quits - user sees seamless restart
  ipcMain.handle('restart-app', async () => {
    const projectRoot = join(__dirname, '..', '..', '..', '..');
    const startBat = join(projectRoot, 'StartKuroryuu.bat');

    console.log('[Main] Restarting app via:', startBat);

    // Spawn the .bat detached so it survives our exit
    // Use quoted path and empty title "" to handle spaces in path
    spawn('cmd.exe', ['/c', 'start', '""', `"${startBat}"`], {
      detached: true,
      stdio: 'ignore',
      cwd: projectRoot,
      shell: true,
    }).unref();

    // Give it a moment to start, then quit
    setTimeout(() => {
      app.quit();
    }, 500);

    return { ok: true };
  });

  // Setup common persistence and bridge handlers (works for both modes)
  setupPtyPersistenceAndBridge();

  // Initialize PTY persistence and recover sessions
  if (ptyManager) {
    // Embedded mode: Initialize persistence
    const recoveryResult = ptyManager.initializePersistence();
    console.log('[Main] PTY persistence initialized (embedded mode):', recoveryResult);

    // Re-register recovered desktop sessions with MCP Core
    const recoveredSessions = ptyManager.getPersistedSessions();
    for (const session of recoveredSessions) {
      if (session.sessionId) {
        // Mark as pending (requires user action to reconnect)
        console.log(`[Main] Recovered PTY session: ${session.sessionId} (requires reconnect)`);
      }
    }
  } else if (ptyDaemonClient) {
    // Daemon mode: Persistence already initialized in setupPtyIpc
    mainLogger.log('Main', 'PTY daemon mode active - terminals survive app restarts');
  }

  setupFsIpc();
  setupClaudeMemoryIpc();
  setupKuroConfigIpc();
  setupMcpIpc();
  setupGatewayIpc();
  setupCliIpc();
  setupAuthIpc();
  // Auto-restore GitHub service from stored credentials
  const ghCreds = getOAuthAppCredentials('github');
  if (ghCreds?.clientId) {
    githubService = new GitHubOAuthService(ghCreds.clientId, ghCreds.clientSecret);
    console.log('[GitHub] Auto-restored service from stored credentials');
  }
  setupThinkerIpc();
  setupSpecialistIpc();
  setupQuizmasterIpc();
  setupWorkflowSpecialistIpc();
  setupPentesterIpc();
  setupSettingsIpc();
  setupServiceManagerIpc();
  // V4 OPT-IN features
  setupGraphitiIpc();
  setupLinearIpc();
  setupWorktreeIpc();
  setupGitIpc();
  setupLeaderMonitorIpc();

  // Configure worktrees with project paths
  // Project root is 2 levels up from desktop app directory
  const projectRoot = join(__dirname, '..', '..', '..', '..');

  // Initialize settings service with project path
  const settingsService = initSettingsService(projectRoot);
  console.log('[Main] Settings service initialized for project:', projectRoot);

  // Keep env flag aligned for subprocesses/debug tooling.
  // HMR flag is resolved in electron.vite.config.ts at dev-server startup.
  const devMode = settingsService.get('ui.devMode') as boolean | undefined;
  if (devMode) {
    process.env.KURORYUU_DEV_MODE = 'true';
    console.log('[Main] Dev mode enabled');
  }

  // Load Graphiti configuration from settings (opt-in feature)
  const graphitiSettings = settingsService.get('graphiti') as { enabled?: boolean; serverUrl?: string } | undefined;
  if (graphitiSettings?.enabled) {
    configureGraphiti({
      enabled: true,
      url: graphitiSettings.serverUrl || 'http://localhost:8000',
    });
    console.log('[Main] Graphiti enabled with URL:', graphitiSettings.serverUrl || 'http://localhost:8000');
  }

  configureWorktrees({
    enabled: true,
    repoPath: projectRoot,
    basePath: join(projectRoot, 'ai', 'worktrees', 'tasks'),
  });

  // Configure git service for GitHub Desktop clone
  configureGitService({
    repoPath: projectRoot,
  });

  // Configure leader monitor for Ralph inactivity detection
  configureLeaderMonitor({
    inactivityTimeoutMs: 300000, // 5 minutes
    checkIntervalMs: 10000, // Check every 10 seconds
    maxNudgesBeforeAlert: 3,
    mcpCoreUrl: MCP_CORE_URL_DAEMON,
    desktopSecret: DESKTOP_SECRET,
    enableLogging: true,
  });

  setupAgentIpc();
  setupSecurityIpc();
  setupOrchestrationIpc();
  registerBootstrapHandlers();
  registerMarketingHandlers();
  registerExcalidrawHandlers();
  registerLLMAppsHandlers();

  // Auto-launch tray companion if enabled (uses project scope via resolveScope)
  const autoLaunchEnabled = settingsService.get('integrations.trayCompanion.launchOnStartup') as boolean;
  console.log('[Main] Tray companion launchOnStartup setting:', autoLaunchEnabled, '(type:', typeof autoLaunchEnabled, ')');
  if (autoLaunchEnabled) {
    mainLogger.log('Main', 'Auto-launching tray companion (startup setting enabled)');
    launchTrayCompanion().catch(err => {
      mainLogger.error('Main', 'Failed to auto-launch tray companion:', err);
    });
  } else {
    console.log('[Main] Tray companion auto-launch SKIPPED (setting is off)');
  }

  // Auto-start CLIProxyAPI if user has enabled it via Integrations wizard
  // This ensures CLIProxyAPI is ready BEFORE renderer loads, so Insights works immediately
  // Also auto-start if binary is provisioned (backwards compat for users who set up before settings flag existed)
  const cliproxyEnabled = settingsService.get('integrations.cliproxyapi.enabled') as boolean;
  const cliproxyAutoStart = settingsService.get('integrations.cliproxyapi.launchOnStartup') as boolean;

  try {
    const cliproxyManager = getCLIProxyNativeManager();

    // Clean up any stale CLIProxyAPI processes from previous sessions first
    await cliproxyManager.forceKillAll();
    console.log('[Main] Cleaned up stale CLIProxyAPI processes');
    const cliproxyStatus = await cliproxyManager.status();

    // Auto-start if: (1) enabled in settings, OR (2) binary is provisioned (backwards compat)
    const shouldAutoStart = (cliproxyEnabled && cliproxyAutoStart !== false) || cliproxyStatus.provisioned;

    if (shouldAutoStart && cliproxyStatus.provisioned && !cliproxyStatus.healthy) {
      // Check for updates BEFORE starting — never run outdated binaries
      try {
        const updateInfo = await cliproxyManager.checkForUpdate();
        if (updateInfo.updateAvailable) {
          console.log(`[Main] CLIProxyAPI update available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion}`);
          // Store for renderer to pick up — do NOT start old binary
          (global as Record<string, unknown>).cliproxyUpdatePending = updateInfo;
        } else {
          console.log('[Main] CLIProxyAPI is up to date, starting...');
          const result = await cliproxyManager.start();
          if (result.success) {
            console.log('[Main] CLIProxyAPI auto-started, PID:', result.pid);
          } else {
            console.log('[Main] CLIProxyAPI auto-start failed:', result.error);
          }
        }
      } catch (updateErr) {
        // GitHub API unreachable — start anyway rather than blocking
        console.log('[Main] CLIProxyAPI update check failed (starting anyway):', updateErr);
        const result = await cliproxyManager.start();
        if (result.success) {
          console.log('[Main] CLIProxyAPI auto-started (update check skipped), PID:', result.pid);
        } else {
          console.log('[Main] CLIProxyAPI auto-start failed:', result.error);
        }
      }
    } else if (cliproxyStatus.healthy) {
      console.log('[Main] CLIProxyAPI already running');
    } else if (!cliproxyStatus.provisioned) {
      console.log('[Main] CLIProxyAPI not provisioned - skipping auto-start');
    }
  } catch (err) {
    console.log('[Main] CLIProxyAPI auto-start error:', err);
  }

  // Signal that CLIProxy auto-start is done - renderer can now safely check status
  // This MUST be set BEFORE createWindow() so renderer knows CLIProxy is ready
  (global as Record<string, unknown>).cliproxyStartupComplete = true;
  console.log('[Main] CLIProxy startup complete, signaling ready');

  // Setup TTS
  const eventBus = new FeatureEventBus();
  const configManager = new ConfigManager();
  ttsModule = new TTSModule(eventBus, configManager);
  ttsModule.initialize().then(() => {
    console.log('[Main] TTS module initialized');
  }).catch(err => {
    console.error('[Main] TTS module init failed:', err);
  });
  registerTTSHandlers({ ttsModule });

  // Register task handlers
  registerTaskHandlers();

  // Initialize scheduler feature module
  setupSchedulerIpc().catch(err => console.error('[Main] Scheduler init failed:', err));

  // Initialize identity/personal assistant
  setupIdentityIpc().catch(err => console.error('[Main] Identity init failed:', err));

  // Initialize task service with project root
  const taskServiceProjectRoot = process.env.KURORYUU_ROOT || join(__dirname, '../../../..');
  const taskService = getTaskService();
  taskService.initialize(taskServiceProjectRoot);
  console.log('[Main] Task service initialized with project root:', taskServiceProjectRoot);

  createWindow();
  setupClaudeTeamsIpc(mainWindow!);
  registerSdkAgentHandlers(mainWindow!, ptyManager);

  // Start global plugin sync service (keeps ~/.claude/plugins/kuro-global/ in sync)
  pluginSyncService.start();

  // === CodeEditor Window IPC ===
  ipcMain.handle('code-editor:open', () => {
    createCodeEditorWindow();
    return { ok: true };
  });

  // === Playground Window IPC ===
  ipcMain.handle('playground:open', () => {
    createPlaygroundWindow();
    return { ok: true };
  });

  ipcMain.handle('playground:list', async () => {
    const { existsSync, readdirSync, statSync } = await import('fs');
    const { join: pjoin } = await import('path');
    const projectRoot = pjoin(__dirname, '..', '..', '..', '..');
    const dir = pjoin(projectRoot, 'playgrounds');
    if (!existsSync(dir)) return [];
    try {
      return readdirSync(dir)
        .filter(f => f.endsWith('.html'))
        .map(f => {
          const full = pjoin(dir, f);
          const stat = statSync(full);
          return { name: f, path: full, size: stat.size, mtime: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime));
    } catch { return []; }
  });

  ipcMain.handle('playground:read', async (_event, filePath: string) => {
    const { readFileSync } = await import('fs');
    const { normalize, join: pjoin } = await import('path');
    const projectRoot = pjoin(__dirname, '..', '..', '..', '..');
    const playgroundsDir = normalize(pjoin(projectRoot, 'playgrounds'));
    const normalized = normalize(filePath);
    if (!normalized.startsWith(playgroundsDir)) {
      throw new Error('Path outside playgrounds directory');
    }
    return readFileSync(normalized, 'utf-8');
  });

  // === Git IPC Handlers ===
  // NOTE: git:status, git:branch, git:diff, git:stage, git:unstage, git:commit,
  // git:stageAll, git:unstageAll, git:log, git:show are registered in git-service.ts
  // Only handlers NOT in git-service.ts are defined below
  const gitProjectRoot = join(__dirname, '..', '..', '..', '..');

  // Helper for git commands (only used by handlers not in git-service.ts)
  const gitExecAsync = async (cmd: string) => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    return execAsync(cmd, { cwd: gitProjectRoot });
  };

  // T411: Git commit with amend option (NOT in git-service.ts)
  ipcMain.handle('git:commitAmend', async (_, message: string) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const escapedMessage = message.replace(/"/g, '\\"');
      await execAsync(`git commit --amend -m "${escapedMessage}"`, { cwd: gitProjectRoot });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // T411: Git stash
  ipcMain.handle('git:stash', async (_, message?: string) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const cmd = message
        ? `git stash push -m "${message.replace(/"/g, '\\"')}"`
        : 'git stash push';
      await execAsync(cmd, { cwd: gitProjectRoot });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // T411: Git stash pop
  ipcMain.handle('git:stashPop', async () => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      await execAsync('git stash pop', { cwd: gitProjectRoot });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // T411: Git stash list
  ipcMain.handle('git:stashList', async () => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync('git stash list', { cwd: gitProjectRoot });
      const stashes = stdout.trim().split('\n').filter(Boolean).map((line, index) => {
        const match = line.match(/^stash@\{(\d+)\}: (.+)$/);
        return {
          index,
          ref: `stash@{${index}}`,
          message: match ? match[2] : line,
        };
      });
      return { ok: true, stashes };
    } catch (err) {
      return { ok: false, error: String(err), stashes: [] };
    }
  });

  // T411: Git checkout branch
  ipcMain.handle('git:checkout', async (_, branchName: string) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      await execAsync(`git checkout "${branchName}"`, { cwd: gitProjectRoot });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // T411: Git create branch
  ipcMain.handle('git:createBranch', async (_, branchName: string, checkout: boolean = true) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const cmd = checkout
        ? `git checkout -b "${branchName}"`
        : `git branch "${branchName}"`;
      await execAsync(cmd, { cwd: gitProjectRoot });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // T411: Git list branches
  ipcMain.handle('git:listBranches', async () => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Get local branches with tracking info
      const { stdout } = await execAsync(
        'git branch -vv --format="%(refname:short)|%(upstream:short)|%(upstream:track)|%(HEAD)"',
        { cwd: gitProjectRoot }
      );

      const branches = stdout.trim().split('\n').filter(Boolean).map(line => {
        const [name, upstream, track, head] = line.split('|');
        const isCurrent = head === '*';

        // Parse ahead/behind from track info like "[ahead 2, behind 3]" or "[ahead 1]"
        let ahead = 0, behind = 0;
        if (track) {
          const aheadMatch = track.match(/ahead (\d+)/);
          const behindMatch = track.match(/behind (\d+)/);
          if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
          if (behindMatch) behind = parseInt(behindMatch[1], 10);
        }

        return {
          name,
          isCurrent,
          upstream: upstream || null,
          ahead,
          behind,
          hasRemote: !!upstream,
        };
      });

      return { ok: true, branches };
    } catch (err) {
      return { ok: false, error: String(err), branches: [] };
    }
  });

  // T411: Git pull
  ipcMain.handle('git:pull', async () => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync('git pull', { cwd: gitProjectRoot });
      return { ok: true, output: stdout };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // T411: Git push
  ipcMain.handle('git:push', async (_, setUpstream: boolean = false) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Get current branch for upstream setting
      let cmd = 'git push';
      if (setUpstream) {
        const { stdout: branchOut } = await execAsync('git branch --show-current', { cwd: gitProjectRoot });
        const branch = branchOut.trim();
        cmd = `git push -u origin "${branch}"`;
      }

      const { stdout } = await execAsync(cmd, { cwd: gitProjectRoot });
      return { ok: true, output: stdout };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // T411: Git delete branch
  ipcMain.handle('git:deleteBranch', async (_, branchName: string, force: boolean = false) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const flag = force ? '-D' : '-d';
      await execAsync(`git branch ${flag} "${branchName}"`, { cwd: gitProjectRoot });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Git rename branch
  ipcMain.handle('git:renameBranch', async (_, oldName: string, newName: string) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      await execAsync(`git branch -m "${oldName}" "${newName}"`, { cwd: gitProjectRoot });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Git delete remote branch
  ipcMain.handle('git:deleteRemoteBranch', async (_, branchName: string, remote: string = 'origin') => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      await execAsync(`git push "${remote}" --delete "${branchName}"`, { cwd: gitProjectRoot });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Get file content at specific revision (for diff view)
  ipcMain.handle('git:getFileAtRevision', async (_, filePath: string, revision: string = 'HEAD') => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Convert absolute path to relative path for git
      let relativePath = filePath;
      if (filePath.startsWith(gitProjectRoot)) {
        relativePath = filePath.substring(gitProjectRoot.length + 1).replace(/\\/g, '/');
      }

      // Use git show to get file content at revision
      const { stdout } = await execAsync(`git show "${revision}:${relativePath}"`, {
        cwd: gitProjectRoot,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large files
      });
      return { ok: true, content: stdout };
    } catch (err) {
      // File might not exist in that revision (new file)
      return { ok: false, error: String(err), content: '' };
    }
  });

  // Initialize auto-updater (production only)
  if (!isDev && mainWindow) {
    initAutoUpdater(mainWindow);
  }

  // Register speech handlers after window is created
  if (mainWindow) {
    registerSpeechHandlers(mainWindow);
  }

  // Register CLI Proxy handlers (Docker + OAuth for CLIProxyAPI)
  console.log('[Main] About to register CLI Proxy handlers...');
  registerCLIProxyHandlers();
  console.log('[Main] CLI Proxy handlers registered.');

  // Register Backup handlers (Restic backup management)
  if (mainWindow) {
    console.log('[Main] Registering backup handlers...');
    registerBackupHandlers(mainWindow);
    console.log('[Main] Backup handlers registered.');
  }

  // NOTE: forceKillAll() was moved to BEFORE auto-start (earlier in this file)
  // The cliproxyStartupComplete flag is now set before createWindow() too
  // Keep IPC handler for renderer to check if CLIProxy startup is done
  ipcMain.handle('cliproxy:startup-ready', () => {
    return (global as Record<string, unknown>).cliproxyStartupComplete === true;
  });

  // Set main window for services BEFORE registering handlers that need it
  console.log('[Main] Setting main window for services...');
  if (mainWindow) {
    fileWatcher.setMainWindow(mainWindow);
    settingsService.setMainWindow(mainWindow);
    // Set main window for PCControl and Python services (for IPC events)
    setPCControlMainWindow(mainWindow);
    setPythonMainWindow(mainWindow);
    console.log('[Main] Main window set for all services.');
  }

  // Register PCControl handlers (Full Desktop Access - opt-in, pure PowerShell)
  // SECURITY: Initialize state first to clear any stale armed flags from crashed sessions
  console.log('[Main] Initializing PCControl state (clearing stale flags)...');
  initPCControlState();
  console.log('[Main] About to register PCControl handlers...');
  registerPCControlHandlers();
  console.log('[Main] PCControl handlers registered.');

  // Register Python/Pip handlers (for Full Desktop Access setup)
  console.log('[Main] About to register Python handlers...');
  registerPythonHandlers();
  console.log('[Main] Python handlers registered.');

  // Register audio transcription handler (T073 + Whisper)
  ipcMain.handle('audio:transcribe', async (_, audioData: number[], mimeType: string, engine: STTEngine = 'whisper') => {
    console.log(`[Main] audio:transcribe called with ${audioData.length} bytes, mimeType: ${mimeType}, engine: ${engine}`);
    const result = await transcribeAudio(audioData, mimeType, engine);
    console.log(`[Main] audio:transcribe result:`, result);
    return result;
  });

  // Register full voice chat handler (Whisper + LMStudio + TTS)
  ipcMain.handle('audio:voiceChat', async (_, audioData: number[], mimeType: string, engine: STTEngine = 'whisper', terminalId?: string, speakResponse: boolean = true) => {
    console.log(`[Main] audio:voiceChat called - engine: ${engine}, terminal: ${terminalId}, speak: ${speakResponse}`);
    const result = await voiceChat(audioData, mimeType, engine, terminalId, speakResponse);
    console.log(`[Main] audio:voiceChat result:`, result);
    return result;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error('[Main] FATAL: app.whenReady() failed:', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * Perform graceful shutdown sequence with progress updates.
 * Sends progress events to renderer to update the shutdown modal.
 */
async function performShutdownSequence(win: BrowserWindow) {
  const steps = [
    {
      name: 'Saving terminal sessions...',
      fn: async () => {
        console.log('[Main] Step 1/8: Saving terminal sessions');
        win.webContents.send('pty:flush-persistence');
        await new Promise(resolve => setTimeout(resolve, 300));
      },
      progress: 20
    },
    {
      name: 'Stopping Graphiti server...',
      fn: async () => {
        console.log('[Main] Step 2/8: Stopping Graphiti server');
        await cleanupGraphiti();
      },
      progress: 40
    },
    {
      name: 'Closing terminal connections...',
      fn: async () => {
        console.log('[Main] Step 3/8: Closing terminal connections');
        ptyManager?.dispose();
      },
      progress: 60
    },
    {
      name: 'Cleaning up file watchers...',
      fn: async () => {
        console.log('[Main] Step 4/8: Cleaning up file watchers');
        killStudioServer();
        pluginSyncService.stop();
        fileWatcher.dispose();
      },
      progress: 70
    },
    {
      name: 'Stopping CLIProxyAPI...',
      fn: async () => {
        console.log('[Main] Step 5/8: Stopping CLIProxyAPI');
        try {
          const manager = getCLIProxyNativeManager();
          await manager.stop();
        } catch (e) {
          console.log('[Main] CLIProxyAPI stop skipped:', e);
        }
      },
      progress: 75
    },
    {
      name: 'Stopping Gateway...',
      fn: async () => {
        console.log('[Main] Step 6/8: Stopping Gateway');
        await stopService('gateway');
      },
      progress: 85
    },
    {
      name: 'Stopping MCP Core...',
      fn: async () => {
        console.log('[Main] Step 7/8: Stopping MCP Core');
        await stopService('mcp');
      },
      progress: 95
    },
    {
      name: 'Finalizing cleanup...',
      fn: async () => {
        console.log('[Main] Step 8/8: Finalizing cleanup');
        try {
          getClaudeSDKService().shutdown();
        } catch (e) {
          console.log('[Main] SDK service shutdown skipped:', e);
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      },
      progress: 100
    },
  ];

  // Run cleanup steps with progress updates
  for (const step of steps) {
    win.webContents.send('shutdown:progress', { step: step.name, progress: step.progress });
    await step.fn();
  }

  // Countdown: 3, 2, 1
  for (let i = 3; i > 0; i--) {
    console.log(`[Main] Countdown: ${i}`);
    win.webContents.send('shutdown:countdown', i);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Final "Done!"
  console.log('[Main] Countdown: 0 (Done!)');
  win.webContents.send('shutdown:countdown', 0);
  await new Promise(resolve => setTimeout(resolve, 500));
}

// Fallback before-quit handler (for Command+Q on macOS or other quit methods)
// Main shutdown sequence is in the window close handler above
app.on('before-quit', async (event) => {
  if (isShuttingDown) {
    // Already shutting down via close handler, allow quit
    return;
  }

  // Triggered by Command+Q or other method, run cleanup
  event.preventDefault();
  isShuttingDown = true;

  const windows = BrowserWindow.getAllWindows();
  const win = windows.find(w => !w.isDestroyed());

  if (win) {
    console.log('[Main] before-quit: Running cleanup sequence');
    win.webContents.send('shutdown:start');
    await performShutdownSequence(win);
  } else {
    // No window available, just do basic cleanup
    console.log('[Main] before-quit: No window, doing basic cleanup');
    killStudioServer();
    pluginSyncService.stop();
    ptyManager?.dispose();
    fileWatcher.dispose();
    await cleanupGraphiti();
    cleanupPCControl();
  }

  app.exit(0);
});
