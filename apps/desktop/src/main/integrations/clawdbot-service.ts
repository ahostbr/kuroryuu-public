/**
 * Clawdbot Integration Service
 *
 * Manages the Clawdbot Docker container as an autonomous AI worker.
 * OPT-IN only - disabled by default.
 *
 * Features:
 * - Toggle enable/disable (sets KURORYUU_CLAWD_ENABLED env var)
 * - Container status monitoring
 * - Start/stop container
 * - Task delegation interface
 */

import { ipcMain } from 'electron';
import { execSync, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { getApiKey } from './token-store';

// Type definitions for provider config
interface ClawdbotModelConfig {
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
}

interface ClawdbotProviderConfig {
  lmstudio?: {
    enabled: boolean;
    baseUrl: string;
    models: ClawdbotModelConfig[];
    primaryModel?: string;
  };
  ollama?: {
    enabled: boolean;
    baseUrl: string;
    models: ClawdbotModelConfig[];
    primaryModel?: string;
  };
  anthropic?: {
    enabled: boolean;
    apiKey: string;
  };
  openai?: {
    enabled: boolean;
    apiKey: string;
  };
}

// Docker executable - find it dynamically on Windows
function findDockerPath(): string {
  if (process.platform !== 'win32') return 'docker';

  // Common Docker Desktop locations on Windows
  const paths = [
    'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
    'C:\\Program Files (x86)\\Docker\\Docker\\resources\\bin\\docker.exe',
    process.env.LOCALAPPDATA + '\\Docker\\resources\\bin\\docker.exe',
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }

  // Fallback to PATH
  return 'docker';
}

const DOCKER_PATH = findDockerPath();

// Configuration
let clawdbotEnabled = false;
let clawdbotUrl = 'http://localhost:18790';
let clawdbotWsUrl = 'ws://localhost:18789';
let containerName = 'clawdbot-gateway';
let containerImage = 'clawdbot:local';
// Gateway token for authentication (use consistent token for easy access)
// Using a deterministic token so URL is predictable
let gatewayToken = 'kuroryuu-clawd-2026';

export interface ClawdbotConfig {
  enabled?: boolean;
  url?: string;
  wsUrl?: string;
  containerName?: string;
  containerImage?: string;
  gatewayToken?: string;
}

/**
 * Get gateway token (using consistent token for predictable access)
 */
function getOrCreateGatewayToken(): string {
  // Return the consistent token set at module level
  return gatewayToken;
}

/**
 * Configure Clawdbot service
 */
export function configureClawdbot(config: ClawdbotConfig): void {
  if (config.enabled !== undefined) {
    clawdbotEnabled = config.enabled;
    // Set environment variable for MCP tool
    if (config.enabled) {
      process.env.KURORYUU_CLAWD_ENABLED = '1';
    } else {
      delete process.env.KURORYUU_CLAWD_ENABLED;
    }
  }
  if (config.url) clawdbotUrl = config.url;
  if (config.wsUrl) clawdbotWsUrl = config.wsUrl;
  if (config.containerName) containerName = config.containerName;
  if (config.containerImage) containerImage = config.containerImage;
}

/**
 * Check if Docker is available
 */
function isDockerAvailable(): boolean {
  try {
    execFileSync(DOCKER_PATH, ['--version'], { stdio: 'pipe' });
    return true;
  } catch (e) {
    console.error('[Clawdbot] Docker not available:', e);
    return false;
  }
}

/**
 * Check if container exists
 */
function containerExists(): boolean {
  try {
    const result = execFileSync(DOCKER_PATH, ['inspect', containerName], { stdio: 'pipe' });
    return result.toString().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if container is running
 */
function containerRunning(): boolean {
  try {
    const result = execFileSync(DOCKER_PATH, ['inspect', '-f', '{{.State.Running}}', containerName], { stdio: 'pipe' });
    return result.toString().trim().toLowerCase() === 'true';
  } catch {
    return false;
  }
}

/**
 * Get container status
 */
export async function getStatus(): Promise<{
  ok: boolean;
  enabled: boolean;
  dockerAvailable: boolean;
  containerExists: boolean;
  containerRunning: boolean;
  endpoints: { http: string; websocket: string };
  gatewayToken?: string;
  controlUiUrl?: string;
  error?: string;
}> {
  const dockerOk = isDockerAvailable();
  const running = dockerOk && containerRunning();
  const token = running ? getOrCreateGatewayToken() : undefined;

  return {
    ok: true,
    enabled: clawdbotEnabled,
    dockerAvailable: dockerOk,
    containerExists: dockerOk && containerExists(),
    containerRunning: running,
    endpoints: {
      http: clawdbotUrl,
      websocket: clawdbotWsUrl,
    },
    gatewayToken: token,
    controlUiUrl: token ? `http://localhost:18789?token=${token}` : undefined,
  };
}

/**
 * Start the Clawdbot container
 */
export async function startContainer(): Promise<{ ok: boolean; error?: string }> {
  if (!isDockerAvailable()) {
    return { ok: false, error: 'Docker is not available' };
  }

  // If container exists, just start it
  if (containerExists()) {
    try {
      execFileSync(DOCKER_PATH, ['start', containerName], { stdio: 'pipe' });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Failed to start container: ${err}` };
    }
  }

  // Create new container with gateway token
  try {
    const token = getOrCreateGatewayToken();
    const args = [
      'run', '-d',
      '--name', containerName,
      '-p', '18789:18789',
      '-p', '18790:18790',
      '--add-host=host.docker.internal:host-gateway',
      '-v', 'clawdbot-state:/home/node/.clawdbot',
      '-e', 'HOME=/home/node',
      '-e', 'CLAWDBOT_SKIP_CHANNELS=1',
      '-e', 'CLAWDBOT_GATEWAY_BIND=lan',
      '-e', `CLAWDBOT_GATEWAY_TOKEN=${token}`,
      containerImage,
      // Gateway command with allow-unconfigured for local use
      'node', 'dist/index.js', 'gateway',
      '--bind', 'lan',
      '--port', '18789',
      '--allow-unconfigured',
    ];

    execFileSync(DOCKER_PATH, args, { stdio: 'pipe' });
    console.log(`[Clawdbot] Container started with gateway token (use at localhost:18789?token=${token})`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Failed to create container: ${err}` };
  }
}

/**
 * Stop the Clawdbot container
 */
export async function stopContainer(): Promise<{ ok: boolean; error?: string }> {
  if (!containerExists()) {
    return { ok: true }; // Already stopped/doesn't exist
  }

  try {
    execFileSync(DOCKER_PATH, ['stop', containerName], { stdio: 'pipe', timeout: 30000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Failed to stop container: ${err}` };
  }
}

/**
 * Check if gateway is reachable
 */
export async function checkHealth(): Promise<{ ok: boolean; error?: string }> {
  if (!clawdbotEnabled) {
    return { ok: false, error: 'Clawdbot is not enabled' };
  }

  if (!containerRunning()) {
    return { ok: false, error: 'Container is not running' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${clawdbotUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return { ok: res.ok };
  } catch (error) {
    return { ok: false, error: `Cannot reach Clawdbot at ${clawdbotUrl}` };
  }
}

/**
 * Set up IPC handlers for Clawdbot integration
 */
export function setupClawdbotIpc(): void {
  // Get current configuration
  ipcMain.handle('clawdbot:getConfig', async () => {
    return {
      enabled: clawdbotEnabled,
      url: clawdbotUrl,
      wsUrl: clawdbotWsUrl,
      containerName,
      containerImage,
      gatewayToken: gatewayToken || undefined,
    };
  });

  // Configure (enable/disable)
  ipcMain.handle('clawdbot:configure', async (_, config: ClawdbotConfig) => {
    configureClawdbot(config);
    return { ok: true };
  });

  // Get status
  ipcMain.handle('clawdbot:status', async () => {
    return getStatus();
  });

  // Start container
  ipcMain.handle('clawdbot:start', async () => {
    return startContainer();
  });

  // Stop container
  ipcMain.handle('clawdbot:stop', async () => {
    return stopContainer();
  });

  // Health check
  ipcMain.handle('clawdbot:health', async () => {
    return checkHealth();
  });

  // Execute task (via docker exec to clawdbot agent)
  ipcMain.handle('clawdbot:task', async (_, prompt: string) => {
    if (!clawdbotEnabled) {
      return { ok: false, error: 'Clawdbot is not enabled' };
    }

    if (!containerRunning()) {
      return { ok: false, error: 'Container is not running' };
    }

    try {
      const result = execFileSync(
        DOCKER_PATH,
        ['exec', containerName, 'node', 'dist/index.js', 'agent', '--message', prompt],
        { stdio: 'pipe', timeout: 120000 }
      );
      return { ok: true, result: result.toString() };
    } catch (err: any) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  // Get provider configuration from Docker volume
  ipcMain.handle('clawdbot:getProviderConfig', async () => {
    return getProviderConfig();
  });

  // Set provider configuration (writes to Docker volume)
  ipcMain.handle('clawdbot:setProviderConfig', async (_, config: ClawdbotProviderConfig) => {
    return setProviderConfig(config);
  });

  // Test provider connection
  ipcMain.handle('clawdbot:testProvider', async (_, provider: string, config: { baseUrl?: string; apiKey?: string }) => {
    return testProviderConnection(provider, config);
  });

  // Get recent task results
  ipcMain.handle('clawdbot:getRecentTasks', async (_, limit: number = 5) => {
    return getRecentTasks(limit);
  });
}

/**
 * Read provider configuration from Docker volume
 */
async function getProviderConfig(): Promise<{ ok: boolean; config?: ClawdbotProviderConfig; error?: string }> {
  if (!containerExists()) {
    return { ok: false, error: 'Container does not exist' };
  }

  try {
    // Read config from Docker volume via docker exec
    const result = execFileSync(
      DOCKER_PATH,
      ['exec', containerName, 'cat', '/home/node/.clawdbot/clawdbot.json'],
      { stdio: 'pipe' }
    );

    const fullConfig = JSON.parse(result.toString());
    const providers = fullConfig.models?.providers || {};

    // Convert to ClawdbotProviderConfig format
    const config: ClawdbotProviderConfig = {
      lmstudio: providers.lmstudio ? {
        enabled: true,
        baseUrl: providers.lmstudio.baseUrl || 'http://host.docker.internal:1234/v1',
        models: providers.lmstudio.models || [],
        primaryModel: fullConfig.agents?.defaults?.model?.primary?.replace('lmstudio/', ''),
      } : {
        enabled: false,
        baseUrl: 'http://host.docker.internal:1234/v1',
        models: [],
      },
      ollama: providers.ollama ? {
        enabled: true,
        baseUrl: providers.ollama.baseUrl || 'http://host.docker.internal:11434/v1',
        models: providers.ollama.models || [],
        primaryModel: undefined,
      } : {
        enabled: false,
        baseUrl: 'http://host.docker.internal:11434/v1',
        models: [],
      },
      anthropic: providers.anthropic ? {
        enabled: true,
        apiKey: providers.anthropic.apiKey ? '••••••••' : '', // Mask API key
      } : {
        enabled: false,
        apiKey: '',
      },
      openai: providers.openai ? {
        enabled: true,
        apiKey: providers.openai.apiKey ? '••••••••' : '', // Mask API key
      } : {
        enabled: false,
        apiKey: '',
      },
    };

    return { ok: true, config };
  } catch (err: any) {
    // Config file doesn't exist yet - return defaults
    if (err.message?.includes('No such file')) {
      return {
        ok: true,
        config: {
          lmstudio: { enabled: false, baseUrl: 'http://host.docker.internal:1234/v1', models: [] },
          ollama: { enabled: false, baseUrl: 'http://host.docker.internal:11434/v1', models: [] },
          anthropic: { enabled: false, apiKey: '' },
          openai: { enabled: false, apiKey: '' },
        }
      };
    }
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Write provider configuration to Docker volume
 */
async function setProviderConfig(config: ClawdbotProviderConfig): Promise<{ ok: boolean; error?: string }> {
  if (!containerExists()) {
    return { ok: false, error: 'Container does not exist. Please start the container first.' };
  }

  try {
    // Build the full clawdbot.json config
    const fullConfig: Record<string, unknown> = {
      gateway: {
        mode: 'local',
        auth: { mode: 'token', token: gatewayToken },
        controlUi: { allowInsecureAuth: true },
      },
      agents: {
        defaults: {
          model: {},
        },
      },
      models: {
        mode: 'merge',
        providers: {},
      },
    };

    const providers: Record<string, unknown> = {};

    // LM Studio
    if (config.lmstudio?.enabled && config.lmstudio.models.length > 0) {
      providers.lmstudio = {
        baseUrl: config.lmstudio.baseUrl,
        apiKey: 'lmstudio',
        api: 'openai-responses',
        models: config.lmstudio.models,
      };
      if (config.lmstudio.primaryModel) {
        (fullConfig.agents as any).defaults.model.primary = `lmstudio/${config.lmstudio.primaryModel}`;
      }
    }

    // Ollama
    if (config.ollama?.enabled && config.ollama.models.length > 0) {
      providers.ollama = {
        baseUrl: config.ollama.baseUrl,
        apiKey: 'ollama',
        api: 'openai-responses',
        models: config.ollama.models,
      };
      if (!config.lmstudio?.primaryModel && config.ollama.primaryModel) {
        (fullConfig.agents as any).defaults.model.primary = `ollama/${config.ollama.primaryModel}`;
      }
    }

    // Anthropic - pull from main integrations token-store if not provided
    if (config.anthropic?.enabled) {
      // Use provided key, or fall back to main integrations
      let anthropicKey = config.anthropic.apiKey;
      if (!anthropicKey || anthropicKey.includes('••')) {
        anthropicKey = getApiKey('anthropic') || '';
      }
      if (anthropicKey) {
        providers.anthropic = {
          apiKey: anthropicKey,
          api: 'anthropic',
        };
      }
    }

    // OpenAI - pull from main integrations token-store if not provided
    if (config.openai?.enabled) {
      // Use provided key, or fall back to main integrations
      let openaiKey = config.openai.apiKey;
      if (!openaiKey || openaiKey.includes('••')) {
        openaiKey = getApiKey('openai') || '';
      }
      if (openaiKey) {
        providers.openai = {
          apiKey: openaiKey,
          api: 'openai-responses',
        };
      }
    }

    (fullConfig.models as any).providers = providers;

    // Write config to Docker volume
    const configJson = JSON.stringify(fullConfig, null, 2);
    const escapedJson = configJson.replace(/'/g, "'\\''");

    // Stop container briefly to write config (if running)
    const wasRunning = containerRunning();
    if (wasRunning) {
      execFileSync(DOCKER_PATH, ['stop', containerName], { stdio: 'pipe', timeout: 30000 });
    }

    // Write via temporary container that mounts the same volume
    const writeArgs = [
      'run', '--rm',
      '-v', 'clawdbot-state:/data',
      'alpine',
      '/bin/sh', '-c',
      `mkdir -p /data && echo '${escapedJson}' > /data/clawdbot.json`,
    ];
    execFileSync(DOCKER_PATH, writeArgs, { stdio: 'pipe' });

    // Restart container if it was running
    if (wasRunning) {
      execFileSync(DOCKER_PATH, ['start', containerName], { stdio: 'pipe' });
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Test provider connection
 */
async function testProviderConnection(
  provider: string,
  config: { baseUrl?: string; apiKey?: string }
): Promise<{ ok: boolean; error?: string; models?: ClawdbotModelConfig[] }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ ok: false, error: 'Connection timeout' });
    }, 10000);

    try {
      switch (provider) {
        case 'lmstudio': {
          // LM Studio: GET /v1/models
          const url = new URL('/v1/models', config.baseUrl || 'http://localhost:1234');
          const client = url.protocol === 'https:' ? https : http;

          const req = client.get(url.href, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
              clearTimeout(timeout);
              try {
                const json = JSON.parse(data);
                const models = (json.data || []).map((m: any) => ({
                  id: m.id,
                  name: m.id,
                  contextWindow: m.context_length || 32768,
                  maxTokens: 4096,
                }));
                resolve({ ok: true, models });
              } catch {
                resolve({ ok: false, error: 'Invalid response from LM Studio' });
              }
            });
          });
          req.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ ok: false, error: `LM Studio connection failed: ${err.message}` });
          });
          break;
        }

        case 'ollama': {
          // Ollama: GET /api/tags
          const url = new URL('/api/tags', config.baseUrl || 'http://localhost:11434');
          const client = url.protocol === 'https:' ? https : http;

          const req = client.get(url.href, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
              clearTimeout(timeout);
              try {
                const json = JSON.parse(data);
                const models = (json.models || []).map((m: any) => ({
                  id: m.name,
                  name: m.name,
                }));
                resolve({ ok: true, models });
              } catch {
                resolve({ ok: false, error: 'Invalid response from Ollama' });
              }
            });
          });
          req.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ ok: false, error: `Ollama connection failed: ${err.message}` });
          });
          break;
        }

        case 'anthropic': {
          // Anthropic: POST /v1/messages with minimal payload
          // Use provided key, or fall back to main integrations
          const anthropicKey = config.apiKey || getApiKey('anthropic');
          if (!anthropicKey) {
            clearTimeout(timeout);
            resolve({ ok: false, error: 'API key not configured in Integrations' });
            return;
          }

          const postData = JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          });

          const req = https.request({
            hostname: 'api.anthropic.com',
            port: 443,
            path: '/v1/messages',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01',
              'Content-Length': Buffer.byteLength(postData),
            },
          }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
              clearTimeout(timeout);
              if (res.statusCode === 200 || res.statusCode === 201) {
                resolve({ ok: true });
              } else if (res.statusCode === 401) {
                resolve({ ok: false, error: 'Invalid API key' });
              } else {
                resolve({ ok: false, error: `Anthropic API error: ${res.statusCode}` });
              }
            });
          });
          req.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ ok: false, error: `Anthropic connection failed: ${err.message}` });
          });
          req.write(postData);
          req.end();
          break;
        }

        case 'openai': {
          // OpenAI: GET /v1/models
          // Use provided key, or fall back to main integrations
          const openaiKey = config.apiKey || getApiKey('openai');
          if (!openaiKey) {
            clearTimeout(timeout);
            resolve({ ok: false, error: 'API key not configured in Integrations' });
            return;
          }

          const req = https.request({
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/models',
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${openaiKey}`,
            },
          }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
              clearTimeout(timeout);
              if (res.statusCode === 200) {
                resolve({ ok: true });
              } else if (res.statusCode === 401) {
                resolve({ ok: false, error: 'Invalid API key' });
              } else {
                resolve({ ok: false, error: `OpenAI API error: ${res.statusCode}` });
              }
            });
          });
          req.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ ok: false, error: `OpenAI connection failed: ${err.message}` });
          });
          req.end();
          break;
        }

        default:
          clearTimeout(timeout);
          resolve({ ok: false, error: `Unknown provider: ${provider}` });
      }
    } catch (err: any) {
      clearTimeout(timeout);
      resolve({ ok: false, error: err.message || String(err) });
    }
  });
}

/**
 * Get recent task results from Clawdbot
 */
async function getRecentTasks(limit: number = 5): Promise<{ ok: boolean; tasks?: unknown[]; error?: string }> {
  if (!containerRunning()) {
    return { ok: false, error: 'Container is not running' };
  }

  try {
    // Query the gateway for recent tasks
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${clawdbotUrl}/api/tasks?limit=${limit}`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return { ok: true, tasks: data.tasks || [] };
    } else {
      return { ok: true, tasks: [] }; // No tasks API available yet
    }
  } catch {
    return { ok: true, tasks: [] }; // Return empty if API not available
  }
}

/**
 * Auto-start Clawdbot container if enabled
 * Called during app initialization
 */
export async function autoStartClawdbot(): Promise<void> {
  // Check if auto-start is enabled via environment
  if (process.env.KURORYUU_CLAWD_ENABLED !== '1') {
    return;
  }

  if (!isDockerAvailable()) {
    console.log('[Clawdbot] Auto-start skipped: Docker not available');
    return;
  }

  if (containerRunning()) {
    console.log('[Clawdbot] Auto-start skipped: Container already running');
    return;
  }

  console.log('[Clawdbot] Auto-starting container...');
  clawdbotEnabled = true;
  const result = await startContainer();
  if (result.ok) {
    console.log('[Clawdbot] Auto-start successful');
  } else {
    console.error('[Clawdbot] Auto-start failed:', result.error);
  }
}

/**
 * Cleanup on app quit
 */
export function cleanupClawdbot(): void {
  // Optionally stop container on app quit
  // For now, leave it running as it's an autonomous worker
  console.log('[Clawdbot] App cleanup - container left running for autonomous operation');
}
