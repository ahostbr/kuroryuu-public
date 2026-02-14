/**
 * PluginSyncService — Keeps ~/.claude/plugins/kuro-global/ in sync with project plugin
 *
 * Polls every 60s, compares source plugin mtime vs last sync timestamp,
 * and re-syncs via sync-global-plugin.ps1 if changes detected.
 *
 * Startup: pluginSyncService.start() in main/index.ts after app ready
 * Shutdown: pluginSyncService.stop() on app quit
 */

import { execFile } from 'child_process';
import { join } from 'path';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import * as os from 'os';

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const SYNC_TIMEOUT_MS = 30_000; // 30 second timeout for sync script

interface PluginSyncStatus {
  synced: boolean;
  lastSync: string | null;
  lastCheck: string;
  error?: string;
}

function getProjectRoot(): string {
  return process.env.KURORYUU_PROJECT_ROOT || process.env.KURORYUU_ROOT || join(__dirname, '..', '..', '..', '..');
}

class PluginSyncService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private status: PluginSyncStatus = {
    synced: false,
    lastSync: null,
    lastCheck: new Date().toISOString(),
  };
  private running = false;

  /**
   * Start the sync service. Runs initial sync, then polls every 60s.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log('[PluginSync] Starting global plugin sync service');

    // Initial sync on startup
    try {
      await this.syncIfNeeded(true);
    } catch (err) {
      console.error('[PluginSync] Initial sync failed:', err);
    }

    // Set up polling interval
    this.timer = setInterval(async () => {
      try {
        await this.syncIfNeeded(false);
      } catch (err) {
        console.error('[PluginSync] Poll sync failed:', err);
        this.status.error = String(err);
      }
    }, POLL_INTERVAL_MS);

    console.log('[PluginSync] Polling every 60s');
  }

  /**
   * Stop the sync service.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log('[PluginSync] Stopped');
  }

  /**
   * Get current sync status.
   */
  getStatus(): PluginSyncStatus {
    return { ...this.status };
  }

  /**
   * Force a sync regardless of timestamp.
   */
  async forceSync(): Promise<PluginSyncStatus> {
    await this.runSyncScript(true);
    return this.getStatus();
  }

  /**
   * Check if sync is needed by comparing source mtime vs target timestamp.
   */
  private async syncIfNeeded(force: boolean): Promise<void> {
    this.status.lastCheck = new Date().toISOString();

    const projectRoot = getProjectRoot();
    const sourceDir = join(projectRoot, '.claude', 'plugins', 'kuro');
    const targetTimestampFile = join(os.homedir(), '.claude', 'plugins', 'kuro-global', '.sync_timestamp');

    // Check source exists
    if (!existsSync(sourceDir)) {
      this.status.error = 'Source plugin not found';
      return;
    }

    // Force sync if target doesn't exist
    if (!existsSync(targetTimestampFile)) {
      console.log('[PluginSync] Target not found, forcing initial sync');
      await this.runSyncScript(true);
      return;
    }

    if (force) {
      await this.runSyncScript(true);
      return;
    }

    // Quick mtime check: compare newest source file vs sync timestamp
    try {
      const timestampContent = await readFile(targetTimestampFile, 'utf-8');
      const timestampData = JSON.parse(timestampContent);
      const lastSyncDate = new Date(timestampData.syncedAt);

      // Check if any source file is newer than last sync
      const sourceManifest = join(sourceDir, '.claude-plugin', 'plugin.json');
      if (existsSync(sourceManifest)) {
        const manifestStat = await stat(sourceManifest);
        if (manifestStat.mtimeMs > lastSyncDate.getTime()) {
          console.log('[PluginSync] Plugin manifest changed, syncing');
          await this.runSyncScript(false);
          return;
        }
      }

      // Check hooks and scripts dirs for changes
      const dirsToCheck = ['hooks', 'scripts', 'commands'];
      for (const dir of dirsToCheck) {
        const dirPath = join(sourceDir, dir);
        if (existsSync(dirPath)) {
          const dirStat = await stat(dirPath);
          if (dirStat.mtimeMs > lastSyncDate.getTime()) {
            console.log(`[PluginSync] ${dir}/ changed, syncing`);
            await this.runSyncScript(false);
            return;
          }
        }
      }
    } catch (err) {
      // If timestamp file is corrupt, force sync
      console.log('[PluginSync] Timestamp check failed, forcing sync:', err);
      await this.runSyncScript(true);
    }
  }

  /**
   * Execute the sync PowerShell script.
   */
  private runSyncScript(force: boolean): Promise<void> {
    return new Promise((resolve) => {
      const projectRoot = getProjectRoot();
      const scriptPath = join(projectRoot, 'scripts', 'sync-global-plugin.ps1');

      if (!existsSync(scriptPath)) {
        this.status.error = 'Sync script not found';
        console.error('[PluginSync] Script not found:', scriptPath);
        resolve();
        return;
      }

      const args = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-ProjectRoot', projectRoot,
      ];
      if (force) {
        args.push('-Force');
      }

      execFile('powershell.exe', args, { timeout: SYNC_TIMEOUT_MS }, (error, stdout, stderr) => {
        if (error) {
          // Exit code 2 = already up-to-date (not an error)
          const exitCode = (error as Error & { code?: string | number }).code;
          if (exitCode === 2 || exitCode === '2' ||
              (error.message && error.message.includes('exit code 2'))) {
            this.status.synced = true;
            this.status.error = undefined;
          } else {
            this.status.error = stderr || error.message;
            console.error('[PluginSync] Sync script error:', stderr || error.message);
          }
        } else {
          this.status.synced = true;
          this.status.lastSync = new Date().toISOString();
          this.status.error = undefined;
          if (stdout.trim()) {
            console.log('[PluginSync]', stdout.trim());
          }
        }
        resolve();
      });
    });
  }
}

export const pluginSyncService = new PluginSyncService();
