/**
 * ClaudeSettingsWriter — Centralized settings.json write service
 *
 * Single entry point for ALL writes to .claude/settings.json (project or global).
 * Provides:
 * - Per-file async mutex (promise chain) to serialize concurrent writes
 * - Auto-backup before every mutation (to .claude/kuro_configs/auto_backup_*.json)
 * - Protected field validation (env, plugins, etc. never dropped)
 * - Atomic writes (.tmp → fs.rename)
 */

import { readFile, writeFile, rename, readdir, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

// Fields that must survive every mutation — restored if dropped
const PROTECTED_FIELDS = ['env', 'plugins', 'enabledPlugins', 'plansDirectory', 'sandbox', 'statusLine'];

// Max auto-backups to keep per backup directory
const MAX_AUTO_BACKUPS = 20;

interface WriteOptions {
  label: string;
  mutate: (settings: Record<string, unknown>) => void;
}

interface WriteResult {
  ok: boolean;
  error?: string;
}

export class ClaudeSettingsWriter {
  private static instance: ClaudeSettingsWriter;
  private locks: Map<string, Promise<unknown>> = new Map();

  static getInstance(): ClaudeSettingsWriter {
    if (!ClaudeSettingsWriter.instance) {
      ClaudeSettingsWriter.instance = new ClaudeSettingsWriter();
    }
    return ClaudeSettingsWriter.instance;
  }

  /**
   * The only write API — mutator pattern.
   *
   * 1. Acquire per-file lock
   * 2. Read current file
   * 3. Auto-backup before mutation
   * 4. Call mutate(settings) — caller modifies in-place
   * 5. Validate protected fields survived
   * 6. Atomic write (.tmp → rename)
   * 7. Release lock
   */
  async write(filePath: string, opts: WriteOptions): Promise<WriteResult> {
    const normalized = path.resolve(filePath);

    // Chain onto per-file lock
    const prev = this.locks.get(normalized) || Promise.resolve();
    const current = prev.then(() => this._doWrite(normalized, opts)).catch((err) => {
      console.error(`[SettingsWriter] ${opts.label} failed:`, err);
      return { ok: false, error: String(err) } as WriteResult;
    });
    this.locks.set(normalized, current);

    return current;
  }

  private async _doWrite(filePath: string, opts: WriteOptions): Promise<WriteResult> {
    try {
      // 1. Read current file
      let settings: Record<string, unknown> = {};
      try {
        const content = await readFile(filePath, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        // File doesn't exist or invalid JSON, start fresh
      }

      // 2. Snapshot protected fields before mutation
      const protectedSnapshot: Record<string, unknown> = {};
      for (const key of PROTECTED_FIELDS) {
        if (key in settings) {
          protectedSnapshot[key] = structuredClone(settings[key]);
        }
      }

      // 3. Auto-backup (only for project-level .claude/settings.json)
      await this._autoBackup(filePath, settings);

      // 4. Apply mutation
      opts.mutate(settings);

      // 5. Validate protected fields survived
      for (const key of PROTECTED_FIELDS) {
        if (key in protectedSnapshot && !(key in settings)) {
          console.warn(`[SettingsWriter] ${opts.label} dropped protected field "${key}" — restoring`);
          settings[key] = protectedSnapshot[key];
        }
      }

      // 6. Atomic write
      const tmpPath = filePath + '.tmp';
      const jsonContent = JSON.stringify(settings, null, 2);
      await writeFile(tmpPath, jsonContent, 'utf-8');
      await rename(tmpPath, filePath);

      console.log(`[SettingsWriter] ${opts.label} wrote ${filePath}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  private async _autoBackup(filePath: string, settings: Record<string, unknown>): Promise<void> {
    try {
      // Determine backup directory relative to the settings file
      const settingsDir = path.dirname(filePath);
      const backupsDir = path.join(settingsDir, 'kuro_configs');

      // Ensure backup directory exists
      if (!existsSync(backupsDir)) {
        await mkdir(backupsDir, { recursive: true });
      }

      // Generate timestamped filename
      const now = new Date();
      const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
      const filename = `auto_backup_${ts}.json`;
      const backupPath = path.join(backupsDir, filename);

      // Don't backup if this exact timestamp already exists (rapid writes)
      if (existsSync(backupPath)) return;

      // Write backup
      await writeFile(backupPath, JSON.stringify(settings, null, 2), 'utf-8');

      // Rotate — keep only MAX_AUTO_BACKUPS
      await this._rotateBackups(backupsDir);
    } catch (err) {
      // Backup failure should not block the write
      console.warn('[SettingsWriter] Auto-backup failed:', err);
    }
  }

  private async _rotateBackups(backupsDir: string): Promise<void> {
    try {
      const files = await readdir(backupsDir);
      const autoBackups = files
        .filter((f) => f.startsWith('auto_backup_') && f.endsWith('.json'))
        .sort(); // Lexicographic = chronological due to timestamp format

      if (autoBackups.length <= MAX_AUTO_BACKUPS) return;

      // Delete oldest
      const toDelete = autoBackups.slice(0, autoBackups.length - MAX_AUTO_BACKUPS);
      for (const f of toDelete) {
        await unlink(path.join(backupsDir, f));
      }
    } catch {
      // Rotation failure is non-fatal
    }
  }
}

/** Singleton accessor */
export function getSettingsWriter(): ClaudeSettingsWriter {
  return ClaudeSettingsWriter.getInstance();
}
