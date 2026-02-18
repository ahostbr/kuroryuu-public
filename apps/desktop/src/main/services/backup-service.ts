/**
 * Backup Service
 *
 * Business logic for Restic backup management.
 * Communicates with MCP Core's k_backup tool via HTTP.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { app } from 'electron';
import type {
  BackupConfig,
  BackupStatus,
  BackupSnapshot,
  SnapshotDiff,
  ResticBinaryStatus,
  ListSnapshotsResponse,
  CreateBackupResponse,
  RestoreResponse,
  InitRepoResponse,
  BackupApiResponse,
} from '../../renderer/types/backup';

// ============================================================================
// Configuration
// ============================================================================

const MCP_CORE_URL = process.env.KURORYUU_MCP_URL || 'http://127.0.0.1:8100';
const GATEWAY_URL = process.env.KURORYUU_GATEWAY_URL || 'http://127.0.0.1:8200';

/**
 * Get the Kuroryuu config directory (~/.kuroryuu/)
 */
function getKuroryuuConfigDir(): string {
  const homeDir = app.getPath('home');
  return path.join(homeDir, '.kuroryuu');
}

/**
 * Get the backup settings directory (~/.kuroryuu/restic-local-settings/)
 */
export function getBackupSettingsDir(): string {
  return path.join(getKuroryuuConfigDir(), 'restic-local-settings');
}

/**
 * Get the restic binary directory (~/.kuroryuu/bin/)
 */
export function getResticBinDir(): string {
  return path.join(getKuroryuuConfigDir(), 'bin');
}

/**
 * Get the restic repository directory (~/.kuroryuu/restic-repo/)
 */
export function getDefaultRepoPath(): string {
  return path.join(getKuroryuuConfigDir(), 'restic-repo');
}

/**
 * Get the config file path
 */
export function getConfigFilePath(): string {
  return path.join(getBackupSettingsDir(), 'backup_config.json');
}

// ============================================================================
// MCP Core Communication
// ============================================================================

interface MCPRequest {
  jsonrpc: '2.0';
  id: string;
  method: 'tools/call';
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string;
  result?: {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Call k_backup tool via MCP Core
 */
async function callBackupTool(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const requestId = `backup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const request: MCPRequest = {
    jsonrpc: '2.0',
    id: requestId,
    method: 'tools/call',
    params: {
      name: 'k_backup',
      arguments: {
        action,
        ...params,
      },
    },
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${MCP_CORE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`MCP request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as MCPResponse;

    if (data.error) {
      throw new Error(data.error.message);
    }

    if (!data.result?.content?.[0]?.text) {
      throw new Error('Invalid MCP response format');
    }

    // Parse the JSON result from text content
    const resultText = data.result.content[0].text;
    try {
      return JSON.parse(resultText);
    } catch {
      // If not JSON, return as-is
      return resultText;
    }
  } catch (error) {
    console.error(`[BackupService] MCP call failed: ${action}`, error);
    throw error;
  }
}

// ============================================================================
// Service Class
// ============================================================================

export class BackupService {
  private config: BackupConfig | null = null;

  /**
   * Initialize the backup service
   */
  async initialize(): Promise<void> {
    // Ensure directories exist
    const settingsDir = getBackupSettingsDir();
    const binDir = getResticBinDir();

    await fs.mkdir(settingsDir, { recursive: true });
    await fs.mkdir(binDir, { recursive: true });

    // Load config if exists
    await this.loadConfig();

    console.log('[BackupService] Initialized');
  }

  /**
   * Load configuration from disk
   */
  async loadConfig(): Promise<BackupConfig | null> {
    const configPath = getConfigFilePath();

    if (!existsSync(configPath)) {
      this.config = null;
      return null;
    }

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      this.config = JSON.parse(content) as BackupConfig;
      return this.config;
    } catch (error) {
      console.error('[BackupService] Failed to load config:', error);
      this.config = null;
      return null;
    }
  }

  /**
   * Save configuration to disk
   */
  async saveConfig(config: BackupConfig): Promise<void> {
    const configPath = getConfigFilePath();
    const settingsDir = getBackupSettingsDir();

    await fs.mkdir(settingsDir, { recursive: true });

    // Preserve Python-managed fields (password, password_hash) that the
    // TypeScript BackupConfig type doesn't include. Without this, every
    // saveConfig call wipes the password persisted by MCP Core's init.
    try {
      const existing = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      if (existing.repository) {
        const repo = config.repository as Record<string, unknown>;
        if (existing.repository.password && !repo.password) {
          repo.password = existing.repository.password;
        }
        if (existing.repository.password_hash && !repo.password_hash) {
          repo.password_hash = existing.repository.password_hash;
        }
      }
    } catch {
      // File doesn't exist yet or isn't valid JSON — continue with fresh save
    }

    // Write to temp file first, then rename (atomic write)
    const tempPath = `${configPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(config, null, 2), 'utf-8');
    await fs.rename(tempPath, configPath);

    this.config = config;
    console.log('[BackupService] Config saved');
  }

  /**
   * Get current configuration
   */
  getConfig(): BackupConfig | null {
    return this.config;
  }

  /**
   * Create default configuration
   */
  createDefaultConfig(sourcePath: string): BackupConfig {
    return {
      schema_version: '1.0',
      repository: {
        path: getDefaultRepoPath(),
        type: 'local',
        initialized: false,
      },
      backup: {
        source_path: sourcePath,
        exclusions: [
          '**/node_modules/',
          '**/.git/',
          '**/dist/',
          '**/out/',
          '**/build/',
          '**/__pycache__/',
          '**/*.pyc',
          '**/*.tmp',
          '**/*.temp',
          '.DS_Store',
          'Thumbs.db',
          '.kuroryuu/restic-repo/',
        ],
      },
      retention: {
        keep_last: 30,
        keep_daily: 7,
        keep_weekly: 4,
        keep_monthly: 6,
      },
      schedule: {
        enabled: false,
        interval_hours: 24,
      },
    };
  }

  // ==========================================================================
  // Status Operations
  // ==========================================================================

  /**
   * Get comprehensive backup status
   */
  async getStatus(): Promise<BackupStatus> {
    try {
      const result = (await callBackupTool('status')) as Record<string, any>;

      if (result.ok) {
        const restic = result.restic || {};
        const repository = result.repository || {};
        const config = result.config || {};
        return {
          is_configured: config.source_configured || false,
          repository_exists: repository.exists || false,
          repository_accessible: repository.initialized || false,
          restic_installed: restic.installed || false,
          restic_version: restic.version || null,
          config_path: getConfigFilePath(),
          binary_path: restic.path || path.join(getResticBinDir(), process.platform === 'win32' ? 'restic.exe' : 'restic'),
          snapshot_count: 0,
          last_backup_time: null,
        };
      }

      // MCP tool returned an error response
      throw new Error(result.error || 'Backup status check failed');
    } catch (error) {
      console.error('[BackupService] getStatus failed:', error);
      throw error;
    }
  }

  /**
   * Check/download restic binary
   */
  async ensureRestic(): Promise<ResticBinaryStatus> {
    try {
      // Python returns {ok, restic: {...}} at top level (not under data)
      const result = (await callBackupTool('ensure')) as Record<string, unknown>;

      const restic = result.restic as ResticBinaryStatus | undefined;
      if (result.ok && restic) {
        return restic;
      }

      return {
        installed: false,
        path: null,
        version: null,
        downloaded: false,
      };
    } catch (error) {
      console.error('[BackupService] ensureRestic failed:', error);
      return {
        installed: false,
        path: null,
        version: null,
        downloaded: false,
      };
    }
  }

  // ==========================================================================
  // Repository Operations
  // ==========================================================================

  /**
   * Initialize a new repository
   */
  async initRepository(password: string): Promise<InitRepoResponse> {
    try {
      const result = (await callBackupTool('init', { password })) as BackupApiResponse;

      if (result.ok) {
        // Update config to mark as initialized
        if (this.config) {
          this.config.repository.initialized = true;
          // Save to disk so it persists across restarts/reloads
          await this.saveConfig(this.config);
        }
      }

      // Python returns error details in "message" field (not "error"),
      // so check both to avoid swallowing diagnostic info
      const errorDetail = result.error || (typeof result.message === 'string' ? result.message : undefined);

      return {
        ok: result.ok,
        message: result.ok ? 'Repository initialized successfully' : (errorDetail || 'Failed to initialize repository'),
        error: result.ok ? undefined : errorDetail,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        message: 'Failed to initialize repository',
        error: message,
      };
    }
  }

  /**
   * Verify repository password
   */
  async verifyPassword(password: string): Promise<boolean> {
    try {
      const result = (await callBackupTool('check', { password })) as BackupApiResponse;
      return result.ok;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Backup Operations
  // ==========================================================================

  /**
   * Create a new backup
   */
  async createBackup(message?: string, tags?: string[]): Promise<CreateBackupResponse> {
    try {
      const params: Record<string, unknown> = {
        background: true, // Enable streaming
      };
      if (message) params.message = message;
      if (tags?.length) params.tags = tags;

      const result = (await callBackupTool('backup', params)) as Record<string, any>;

      return {
        ok: result.ok,
        session_id: result.session_id || '',
        snapshot_id: result.snapshot_id,
        error: result.error || result.message,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        session_id: '',
        error: msg,
      };
    }
  }

  /**
   * List snapshots
   */
  async listSnapshots(limit = 50): Promise<ListSnapshotsResponse> {
    try {
      const result = (await callBackupTool('list', { limit })) as Record<string, any>;

      return {
        ok: result.ok,
        snapshots: result.snapshots || [],
        total_count: result.total_count || result.count || 0,
      };
    } catch (error) {
      console.error('[BackupService] listSnapshots failed:', error);
      return {
        ok: false,
        snapshots: [],
        total_count: 0,
      };
    }
  }

  /**
   * Get diff between snapshot and current state (or another snapshot)
   */
  async getDiff(snapshotId: string, compareTo?: string): Promise<SnapshotDiff | null> {
    try {
      const params: Record<string, unknown> = { snapshot_id: snapshotId };
      if (compareTo) params.compare_to = compareTo;

      const result = (await callBackupTool('diff', params)) as Record<string, any>;

      if (result.ok) {
        return {
          snapshot_id: result.snapshot_id,
          compare_to: result.compare_to,
          added: result.added || [],
          removed: result.removed || [],
          modified: result.modified || [],
        };
      }

      return null;
    } catch (error) {
      console.error('[BackupService] getDiff failed:', error);
      return null;
    }
  }

  /**
   * Restore files from a snapshot
   */
  async restore(
    snapshotId: string,
    targetPath: string,
    includePaths?: string[]
  ): Promise<RestoreResponse> {
    try {
      const params: Record<string, unknown> = {
        snapshot_id: snapshotId,
        target_path: targetPath,
      };
      if (includePaths?.length) params.include = includePaths;

      const result = (await callBackupTool('restore', params)) as Record<string, any>;

      return {
        ok: result.ok,
        restored_files: result.restored_files || 0,
        target_path: targetPath,
        error: result.error || result.message,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        restored_files: 0,
        target_path: targetPath,
        error: msg,
      };
    }
  }

  // ==========================================================================
  // Maintenance Operations
  // ==========================================================================

  /**
   * Forget a snapshot (remove from repository)
   */
  async forgetSnapshot(snapshotId: string, prune = false): Promise<BackupApiResponse> {
    try {
      const result = (await callBackupTool('forget', {
        snapshot_id: snapshotId,
        prune,
      })) as BackupApiResponse;

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  }

  /**
   * Prune repository to reclaim space
   */
  async prune(): Promise<BackupApiResponse> {
    try {
      const result = (await callBackupTool('prune')) as BackupApiResponse;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  }

  /**
   * Check repository integrity
   */
  async checkIntegrity(): Promise<BackupApiResponse> {
    try {
      const result = (await callBackupTool('check')) as BackupApiResponse;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  }
}

// Singleton instance
let backupService: BackupService | null = null;

/**
 * Get the backup service instance
 */
export function getBackupService(): BackupService {
  if (!backupService) {
    backupService = new BackupService();
  }
  return backupService;
}

/**
 * Initialize the backup service
 */
export async function initializeBackupService(): Promise<BackupService> {
  const service = getBackupService();
  await service.initialize();
  return service;
}
