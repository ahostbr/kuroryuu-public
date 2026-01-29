/**
 * PTY Daemon Spawner
 *
 * Spawns the PTY daemon as a detached process that survives Electron restarts.
 * Uses TCP health check to determine if daemon is already running.
 */

import { spawn } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import { app } from 'electron';

const DAEMON_PORT = parseInt(process.env.PTY_DAEMON_PORT || '7072', 10);
const DAEMON_HOST = process.env.PTY_DAEMON_HOST || '127.0.0.1';
const STARTUP_TIMEOUT_MS = 5000;
const HEALTH_CHECK_INTERVAL_MS = 100;

// Guard against concurrent spawn attempts
let spawnInProgress: Promise<boolean> | null = null;

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if daemon is running by attempting TCP connection
 */
export async function checkDaemonHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(DAEMON_PORT, DAEMON_HOST);
  });
}

/**
 * Get the path to the daemon entry point
 */
function getDaemonPath(): string {
  // In development: use ts-node with source
  // In production: use compiled dist/
  const isDev = !app.isPackaged;

  if (isDev) {
    // Development: run with ts-node
    // __dirname is apps/desktop/out/main, so ../../../ goes to apps/
    return path.join(__dirname, '../../../pty_daemon/src/index.ts');
  } else {
    // Production: use compiled JS
    return path.join(__dirname, '../../../pty_daemon/dist/index.js');
  }
}

/**
 * Ensure the PTY daemon is running, spawning it if needed.
 * Guards against concurrent spawn attempts.
 */
export async function ensureDaemonRunning(): Promise<boolean> {
  // 1. Check if daemon is already running
  const isRunning = await checkDaemonHealth();
  if (isRunning) {
    console.log('[PTY Daemon] Already running on port', DAEMON_PORT);
    return true;
  }

  // 2. If spawn is already in progress, wait for it
  if (spawnInProgress) {
    console.log('[PTY Daemon] Spawn already in progress, waiting...');
    return spawnInProgress;
  }

  console.log('[PTY Daemon] Not running, spawning...');

  // 3. Set the spawn guard and perform spawn
  spawnInProgress = (async () => {
    try {
      return await doSpawnDaemon();
    } finally {
      spawnInProgress = null;
    }
  })();

  return spawnInProgress;
}

/**
 * Internal function to actually spawn the daemon
 */
async function doSpawnDaemon(): Promise<boolean> {

  // 2. Determine how to spawn based on environment
  const isDev = !app.isPackaged;
  const daemonPath = getDaemonPath();

  console.log('[PTY Daemon] isDev:', isDev);
  console.log('[PTY Daemon] daemonPath:', daemonPath);
  console.log('[PTY Daemon] __dirname:', __dirname);

  let child;

  if (isDev) {
    // Development: use npx ts-node
    // __dirname is apps/desktop/out/main, so ../../../ goes to apps/
    const ptyDaemonDir = path.join(__dirname, '../../../pty_daemon');
    console.log('[PTY Daemon] cwd:', ptyDaemonDir);

    if (process.platform === 'win32') {
      // Windows: Use PowerShell explicitly to avoid shell picking up Git Bash/WSL
      // where npm/npx might not be in PATH
      child = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `cd '${ptyDaemonDir}'; npx ts-node '${daemonPath}'`
      ], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          PTY_DAEMON_PORT: String(DAEMON_PORT),
          PTY_DAEMON_HOST: DAEMON_HOST,
        },
      });
    } else {
      // Unix: use npx directly without shell
      child = spawn('npx', ['ts-node', daemonPath], {
        detached: true,
        stdio: 'ignore',
        cwd: ptyDaemonDir,
        env: {
          ...process.env,
          PTY_DAEMON_PORT: String(DAEMON_PORT),
          PTY_DAEMON_HOST: DAEMON_HOST,
        },
      });
    }
  } else {
    // Production: run compiled JS directly
    child = spawn(
      process.execPath,
      [daemonPath],
      {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          PTY_DAEMON_PORT: String(DAEMON_PORT),
          PTY_DAEMON_HOST: DAEMON_HOST,
        },
      }
    );
  }

  // Log spawn errors
  child.on('error', (err) => {
    console.error('[PTY Daemon] Spawn error:', err);
  });

  // Unref so parent can exit independently
  child.unref();

  // 3. Wait for daemon to become ready
  const maxAttempts = STARTUP_TIMEOUT_MS / HEALTH_CHECK_INTERVAL_MS;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(HEALTH_CHECK_INTERVAL_MS);

    if (await checkDaemonHealth()) {
      console.log('[PTY Daemon] Spawned and ready on port', DAEMON_PORT);
      return true;
    }
  }

  console.error('[PTY Daemon] Failed to start within', STARTUP_TIMEOUT_MS, 'ms');
  return false;
}

/**
 * Get daemon connection info
 */
export function getDaemonConfig(): { host: string; port: number } {
  return {
    host: DAEMON_HOST,
    port: DAEMON_PORT,
  };
}
