/**
 * Service Manager - Centralized service restart/control for Kuroryuu
 *
 * Manages MCP Core, Gateway, and PTY Daemon services.
 */

import { spawn, ChildProcess, exec } from 'child_process';
import * as net from 'net';
import * as path from 'path';

// Service configuration
// __dirname is apps/desktop/out/main, go up 4 levels to reach project root
const PROJECT_ROOT = process.env.KURORYUU_PROJECT_ROOT || path.resolve(__dirname, '../../../..');

interface ServiceConfig {
  name: string;
  port: number;
  startScript: string;
  healthCheck: () => Promise<boolean>;
  startArgs?: string[];
}

const SERVICES: Record<string, ServiceConfig> = {
  mcp: {
    name: 'MCP Core',
    port: 8100,
    startScript: path.join(PROJECT_ROOT, 'apps', 'mcp_core', 'run.ps1'),
    healthCheck: async () => {
      try {
        const res = await fetch('http://127.0.0.1:8100/health');
        return res.ok;
      } catch {
        return false;
      }
    },
  },
  gateway: {
    name: 'Gateway',
    port: 8200,
    startScript: path.join(PROJECT_ROOT, 'apps', 'gateway', 'run.ps1'),
    healthCheck: async () => {
      try {
        const res = await fetch('http://127.0.0.1:8200/v1/health');
        return res.ok;
      } catch {
        return false;
      }
    },
  },
  'pty-daemon': {
    name: 'PTY Daemon',
    port: 7072,
    startScript: path.join(PROJECT_ROOT, 'apps', 'pty_daemon'),
    healthCheck: async () => {
      return checkTcpPort(7072);
    },
  },
};

/**
 * Check if a TCP port is listening
 */
function checkTcpPort(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);

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

    socket.connect(port, host);
  });
}

/**
 * Kill process by port (Windows)
 */
function killByPort(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use netstat to find PID, then taskkill
    const cmd = `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`;

    exec(cmd, (error) => {
      // Ignore errors - process may already be stopped
      resolve();
    });
  });
}

/**
 * Wait for health check to pass
 */
async function waitForHealth(
  check: () => Promise<boolean>,
  timeoutMs = 30000,
  intervalMs = 500
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await check()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

/**
 * Start a service using Start-Process for proper process independence
 */
function startService(serviceId: string): Promise<boolean> {
  const config = SERVICES[serviceId];
  if (!config) return Promise.resolve(false);

  console.log(`[ServiceManager] PROJECT_ROOT: ${PROJECT_ROOT}`);
  console.log(`[ServiceManager] Start script: ${config.startScript}`);

  return new Promise((resolve) => {
    let cmd: string;

    if (serviceId === 'pty-daemon') {
      // PTY Daemon uses npm start in its directory
      cmd = `Start-Process -FilePath 'cmd.exe' -ArgumentList '/c cd /d "${config.startScript}" && npm start' -WindowStyle Hidden`;
    } else {
      // MCP and Gateway use PowerShell scripts
      // Use Start-Process to spawn a completely independent hidden process
      cmd = `Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${config.startScript}"' -WindowStyle Hidden`;
    }

    console.log(`[ServiceManager] Executing: ${cmd}`);

    exec(`powershell -NoProfile -Command "${cmd}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`[ServiceManager] Failed to start ${config.name}:`, error);
        console.error(`[ServiceManager] stderr:`, stderr);
        resolve(false);
      } else {
        console.log(`[ServiceManager] Started ${config.name} process`);
        resolve(true);
      }
    });
  });
}

/**
 * Restart a service
 */
export async function restartService(serviceId: string): Promise<{ ok: boolean; error?: string }> {
  const config = SERVICES[serviceId];
  if (!config) {
    return { ok: false, error: `Unknown service: ${serviceId}` };
  }

  try {
    console.log(`[ServiceManager] Restarting ${config.name}...`);

    // 1. Kill existing process
    console.log(`[ServiceManager] Killing process on port ${config.port}...`);
    await killByPort(config.port);

    // Give it a moment to fully stop
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 2. Start new process
    console.log(`[ServiceManager] Starting ${config.name}...`);
    const started = await startService(serviceId);
    if (!started) {
      return { ok: false, error: 'Failed to start process' };
    }

    // 3. Wait for health check (give more time for Python to start)
    console.log(`[ServiceManager] Waiting for ${config.name} to be healthy...`);
    const healthy = await waitForHealth(config.healthCheck, 45000, 1000);

    if (healthy) {
      console.log(`[ServiceManager] ${config.name} restarted successfully`);
      return { ok: true };
    } else {
      return { ok: false, error: 'Service failed to become healthy within timeout' };
    }
  } catch (error) {
    console.error(`[ServiceManager] Error restarting ${config.name}:`, error);
    return { ok: false, error: String(error) };
  }
}

/**
 * Get service health status
 */
export async function getServiceHealth(serviceId: string): Promise<{
  ok: boolean;
  status: 'connected' | 'disconnected' | 'error';
  port: number;
  name: string;
}> {
  const config = SERVICES[serviceId];
  if (!config) {
    return { ok: false, status: 'error', port: 0, name: 'Unknown' };
  }

  try {
    const healthy = await config.healthCheck();
    return {
      ok: healthy,
      status: healthy ? 'connected' : 'disconnected',
      port: config.port,
      name: config.name,
    };
  } catch {
    return {
      ok: false,
      status: 'error',
      port: config.port,
      name: config.name,
    };
  }
}

/**
 * Check PTY Daemon health specifically (TCP port check)
 */
export async function checkPtyDaemonHealth(): Promise<{
  ok: boolean;
  status: 'connected' | 'disconnected';
  port: number;
}> {
  const listening = await checkTcpPort(7072);
  return {
    ok: listening,
    status: listening ? 'connected' : 'disconnected',
    port: 7072,
  };
}
