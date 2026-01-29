import { app, BrowserWindow, screen, ipcMain, shell, protocol, dialog } from 'electron';
import { join, dirname } from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { readFile, writeFile, readdir } from 'fs/promises';
import { randomBytes } from 'crypto';
import { PtyManager } from './pty/manager';
import { PtyBridge } from './pty/bridge';
import { desktopPtyPersistence, type TerminalSessionState } from './pty/persistence';
import { ensureDaemonRunning, checkDaemonHealth } from './pty/daemon-spawner';
import { PtyDaemonClient } from './pty/daemon-client';
import { fileWatcher } from './watcher';
import type { CreatePtyOptions } from './pty/types';
import { detectTool, configureTools, type ToolConfig, type CLITool } from './cli/cli-tool-manager';
import { 
  isEncryptionAvailable, 
  getAllProviderStatuses, 
  disconnectProvider,
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
import { setupClawdbotIpc, configureClawdbot, cleanupClawdbot, autoStartClawdbot } from './integrations/clawdbot-service';
import { setupLinearIpc } from './integrations/linear-service';
import { setupWorktreeIpc, configureWorktrees } from './worktree-manager';
import { setupGitIpc, configureGitService } from './git-service';
import { setupAgentIpc } from './agent-orchestrator';
import { setupSecurityIpc } from './security-scanner';
import { setupOrchestrationIpc } from './orchestration-client';
import { mainLogger } from './utils/file-logger';
import { restartService, getServiceHealth, checkPtyDaemonHealth } from './service-manager';
import { registerBootstrapHandlers, launchTrayCompanion } from './ipc/bootstrap-handlers';
import { getLeaderMonitor, configureLeaderMonitor, setupLeaderMonitorIpc } from './services/leader-monitor';
import { registerTTSHandlers } from './ipc/tts-handlers';
import { registerSpeechHandlers } from './ipc/speech-handlers';
import { registerCLIProxyHandlers } from './ipc/cliproxy-handlers';
import { registerPCControlHandlers, cleanup as cleanupPCControl, setMainWindow as setPCControlMainWindow } from './integrations/pccontrol-service';
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

let mainWindow: BrowserWindow | null = null;
let codeEditorWindow: BrowserWindow | null = null;
let ptyManager: PtyManager | null = null;
let ptyBridge: PtyBridge | null = null;
let ttsModule: TTSModule | null = null;
let ptyDaemonClient: PtyDaemonClient | null = null;

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
        if (isFirstTerminal) {
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
    const result = await ptyDaemonClient?.getBufferedData(id);
    const dataLength = result?.length ?? 0;
    mainLogger.log('PTY-IPC', 'Buffered data fetched', { termId: id, dataLength });
    return result ?? '';
  });

  ipcMain.handle('pty:write', async (_, id: string, data: string) => {
    return ptyDaemonClient?.write(id, data);
  });

  ipcMain.handle('pty:resize', async (_, id: string, cols: number, rows: number) => {
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
    }

    // Also set ownerAgentId if extracted from env
    if (agentId && !options.ownerAgentId) {
      options.ownerAgentId = agentId;
    }

    // Set ownerRole for leader/worker terminal (embedded mode registers via 'create' event)
    if (isFirstTerminal) {
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

      // Collect streamed response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = decoder.decode(value);
        for (const line of text.split('\n')) {
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
  ipcMain.handle('specialist:get-prompt-path', async (_, specialistId: string) => {
    try {
      // Return relative path - PTY spawns with cwd=projectRoot so relative paths work
      const promptPath = `ai/prompt_packs/specialists/${specialistId}.md`;
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
      { scheme: 'kuroryuu', privileges: { standard: true, secure: true } }
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
  
  // Get icon path based on platform
  const iconPath = process.platform === 'win32' 
    ? join(__dirname, '../../resources/Kuroryuu_ico.ico')
    : join(__dirname, '../../resources/Kuroryuu_png.png');
  
  mainWindow = new BrowserWindow({
    width: Math.min(WINDOW_WIDTH, screenWidth - 40),
    height: Math.min(WINDOW_HEIGHT, screenHeight - 40),
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Kuroryuu',
    icon: iconPath,
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

  mainWindow.on('ready-to-show', () => {
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

app.whenReady().then(async () => {
  // Set app user model ID for Windows taskbar (replaces electronApp.setAppUserModelId)
  app.setAppUserModelId('com.kuroryuu.desktop');

  // Register custom protocol for OAuth callbacks (kuroryuu://)
  app.setAsDefaultProtocolClient('kuroryuu');

  // Handle deep links on macOS
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleOAuthCallback(url);
  });

  // Setup PTY IPC (daemon or embedded mode)
  await setupPtyIpc();

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
    const startBat = join(projectRoot, 'Start Kuroryuu.bat');

    console.log('[Main] Restarting app via:', startBat);

    // Spawn the .bat detached so it survives our exit
    spawn('cmd.exe', ['/c', 'start', '', startBat], {
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
  setupMcpIpc();
  setupGatewayIpc();
  setupCliIpc();
  setupAuthIpc();
  setupThinkerIpc();
  setupSpecialistIpc();
  setupQuizmasterIpc();
  setupWorkflowSpecialistIpc();
  setupSettingsIpc();
  setupServiceManagerIpc();
  // V4 OPT-IN features
  setupGraphitiIpc();
  setupClawdbotIpc();
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

  // Load Graphiti configuration from settings (opt-in feature)
  const graphitiSettings = settingsService.get('graphiti') as { enabled?: boolean; serverUrl?: string } | undefined;
  if (graphitiSettings?.enabled) {
    configureGraphiti({
      enabled: true,
      url: graphitiSettings.serverUrl || 'http://localhost:8000',
    });
    console.log('[Main] Graphiti enabled with URL:', graphitiSettings.serverUrl || 'http://localhost:8000');
  }

  // Auto-start Clawdbot if enabled (opt-in via KURORYUU_CLAWD_ENABLED=1)
  autoStartClawdbot().catch(err => {
    console.error('[Main] Clawdbot auto-start error:', err);
  });

  configureWorktrees({
    enabled: true,
    repoPath: projectRoot,
    basePath: join(projectRoot, '.auto-claude', 'worktrees', 'tasks'),
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

  // Auto-launch tray companion if enabled
  const autoLaunchEnabled = settingsService.get('integrations.trayCompanion.launchOnStartup', 'user') as boolean;
  console.log('[Main] Tray companion launchOnStartup setting:', autoLaunchEnabled, '(type:', typeof autoLaunchEnabled, ')');
  if (autoLaunchEnabled) {
    mainLogger.log('Main', 'Auto-launching tray companion (startup setting enabled)');
    launchTrayCompanion().catch(err => {
      mainLogger.error('Main', 'Failed to auto-launch tray companion:', err);
    });
  } else {
    console.log('[Main] Tray companion auto-launch SKIPPED (setting is off)');
  }

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

  createWindow();

  // === CodeEditor Window IPC ===
  ipcMain.handle('code-editor:open', () => {
    createCodeEditorWindow();
    return { ok: true };
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
        console.log('[Main] Step 1/5: Saving terminal sessions');
        win.webContents.send('pty:flush-persistence');
        await new Promise(resolve => setTimeout(resolve, 300));
      },
      progress: 20
    },
    {
      name: 'Stopping Graphiti server...',
      fn: async () => {
        console.log('[Main] Step 2/5: Stopping Graphiti server');
        await cleanupGraphiti();
      },
      progress: 40
    },
    {
      name: 'Closing terminal connections...',
      fn: async () => {
        console.log('[Main] Step 3/5: Closing terminal connections');
        ptyManager?.dispose();
      },
      progress: 60
    },
    {
      name: 'Cleaning up file watchers...',
      fn: async () => {
        console.log('[Main] Step 4/5: Cleaning up file watchers');
        fileWatcher.dispose();
      },
      progress: 80
    },
    {
      name: 'Finalizing cleanup...',
      fn: async () => {
        console.log('[Main] Step 5/5: Finalizing cleanup');
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
    ptyManager?.dispose();
    fileWatcher.dispose();
    await cleanupGraphiti();
    cleanupPCControl();
  }

  app.exit(0);
});
