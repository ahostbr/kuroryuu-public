/**
 * Settings Service - Unified settings backend using electron-store
 *
 * Provides:
 * - User-scoped store: %APPDATA%/Kuroryuu/settings.json
 * - Project-scoped store: {project}/ai/settings/app-settings.json
 * - IPC bridge for renderer access
 * - Change notifications
 */

import Store from 'electron-store';
import { BrowserWindow } from 'electron';
import { join, dirname, basename } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { copyFile, readFile, readdir, unlink, stat } from 'fs/promises';
import {
  UserSettings,
  ProjectSettings,
  DEFAULT_USER_SETTINGS,
  DEFAULT_PROJECT_SETTINGS,
  SettingsScope,
  SettingsChangeEvent,
} from './schemas';

// Backup metadata interface
export interface BackupInfo {
  path: string;
  timestamp: number;
  scope: SettingsScope;
  size: number;
  filename: string;
}

// Deep get utility
function deepGet(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let result: unknown = obj;
  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = (result as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return result;
}

// Deep set utility
function deepSet(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

// Deep merge utility
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        (result[key] as Record<string, unknown>) || {},
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export class SettingsService {
  private userStore: Store<UserSettings>;
  private projectStore: Store<ProjectSettings> | null = null;
  private projectPath: string | null = null;
  private mainWindow: BrowserWindow | null = null;
  private listeners: Map<string, Set<(value: unknown) => void>> = new Map();

  constructor() {
    // Initialize user-scoped store (global settings)
    this.userStore = new Store<UserSettings>({
      name: 'settings',
      defaults: DEFAULT_USER_SETTINGS,
      clearInvalidConfig: true,
    });

    console.log('[SettingsService] User store initialized at:', this.userStore.path);
  }

  /**
   * Set the main window for IPC notifications
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Set the current project path and initialize project store
   */
  setProjectPath(projectPath: string): void {
    if (this.projectPath === projectPath && this.projectStore) {
      return; // Already initialized for this project
    }

    this.projectPath = projectPath;
    const settingsDir = join(projectPath, 'ai', 'settings');

    // Ensure directory exists
    if (!existsSync(settingsDir)) {
      mkdirSync(settingsDir, { recursive: true });
    }

    // Initialize project-scoped store
    this.projectStore = new Store<ProjectSettings>({
      name: 'app-settings',
      cwd: settingsDir,
      defaults: DEFAULT_PROJECT_SETTINGS,
      clearInvalidConfig: true,
    });

    console.log('[SettingsService] Project store initialized at:', this.projectStore.path);
  }

  /**
   * Get the current project path
   */
  getProjectPath(): string | null {
    return this.projectPath;
  }

  // ============================================================================
  // Core API
  // ============================================================================

  /**
   * Get a setting value by namespace
   * @param namespace Dot-notation path (e.g., 'audio.mic.silenceThreshold')
   * @param scope Optional scope override (defaults based on namespace)
   */
  get(namespace: string, scope?: SettingsScope): unknown {
    const resolvedScope = scope || this.resolveScope(namespace);
    const store = this.getStore(resolvedScope);

    if (!store) {
      console.warn(`[SettingsService] No store available for scope: ${resolvedScope}`);
      return this.getDefault(namespace, resolvedScope);
    }

    const value = deepGet(store.store as unknown as Record<string, unknown>, namespace);
    return value !== undefined ? value : this.getDefault(namespace, resolvedScope);
  }

  /**
   * Set a setting value by namespace
   */
  set(namespace: string, value: unknown, scope?: SettingsScope): void {
    const resolvedScope = scope || this.resolveScope(namespace);
    const store = this.getStore(resolvedScope);

    if (!store) {
      console.warn(`[SettingsService] No store available for scope: ${resolvedScope}`);
      return;
    }

    // Get current store data
    const data = { ...store.store } as Record<string, unknown>;
    deepSet(data, namespace, value);

    // Write back entire store (electron-store handles atomic writes)
    // Using double cast because we're dynamically modifying a typed store
    store.store = data as unknown as UserSettings & ProjectSettings;

    // Notify listeners
    this.notifyChange(namespace, value, resolvedScope);
  }

  /**
   * Update a setting by merging partial data
   */
  update(namespace: string, partial: Record<string, unknown>, scope?: SettingsScope): void {
    const resolvedScope = scope || this.resolveScope(namespace);
    const current = this.get(namespace, resolvedScope) as Record<string, unknown> || {};
    const merged = deepMerge(current, partial);
    this.set(namespace, merged, resolvedScope);
  }

  /**
   * Get all settings for a scope
   */
  getAll(scope: SettingsScope): UserSettings | ProjectSettings | null {
    const store = this.getStore(scope);
    return store ? store.store : null;
  }

  /**
   * Reset a namespace to defaults
   */
  reset(namespace: string, scope?: SettingsScope): void {
    const resolvedScope = scope || this.resolveScope(namespace);
    const defaultValue = this.getDefault(namespace, resolvedScope);
    this.set(namespace, defaultValue, resolvedScope);
  }

  /**
   * Reset all settings for a scope
   */
  resetAll(scope: SettingsScope): void {
    const store = this.getStore(scope);
    if (!store) return;

    if (scope === 'user') {
      store.store = { ...DEFAULT_USER_SETTINGS } as UserSettings & ProjectSettings;
    } else {
      store.store = { ...DEFAULT_PROJECT_SETTINGS } as UserSettings & ProjectSettings;
    }

    this.notifyChange('*', store.store, scope);
  }

  // ============================================================================
  // Subscription API
  // ============================================================================

  /**
   * Subscribe to changes in a namespace
   * Returns unsubscribe function
   */
  subscribe(namespace: string, callback: (value: unknown) => void): () => void {
    if (!this.listeners.has(namespace)) {
      this.listeners.set(namespace, new Set());
    }
    this.listeners.get(namespace)!.add(callback);

    return () => {
      const set = this.listeners.get(namespace);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(namespace);
        }
      }
    };
  }

  /**
   * Notify listeners of a change
   */
  private notifyChange(namespace: string, value: unknown, scope: SettingsScope): void {
    const event: SettingsChangeEvent = {
      namespace,
      value,
      scope,
      timestamp: Date.now(),
    };

    // Notify direct listeners
    const listeners = this.listeners.get(namespace);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(value);
        } catch (err) {
          console.error('[SettingsService] Listener error:', err);
        }
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const callback of wildcardListeners) {
        try {
          callback(event);
        } catch (err) {
          console.error('[SettingsService] Wildcard listener error:', err);
        }
      }
    }

    // Notify parent namespace listeners (e.g., 'audio' when 'audio.mic' changes)
    const parts = namespace.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const parentNs = parts.slice(0, i).join('.');
      const parentListeners = this.listeners.get(parentNs);
      if (parentListeners) {
        const parentValue = this.get(parentNs, scope);
        for (const callback of parentListeners) {
          try {
            callback(parentValue);
          } catch (err) {
            console.error('[SettingsService] Parent listener error:', err);
          }
        }
      }
    }

    // Notify renderer via IPC
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('settings:changed', event);
      } catch (err) {
        // Window may be destroyed during event
      }
    }

    console.log(`[SettingsService] Changed ${scope}:${namespace}`);
  }

  // ============================================================================
  // Internal Helpers
  // ============================================================================

  /**
   * Resolve scope based on namespace
   * User-scoped: ui.*, terminal.*, integrations.*
   * Project-scoped: audio.*, agents.*, graphiti.*
   */
  private resolveScope(namespace: string): SettingsScope {
    const topLevel = namespace.split('.')[0];
    switch (topLevel) {
      case 'ui':
      case 'terminal':
      case 'integrations':
        return 'user';
      case 'audio':
      case 'agents':
      case 'graphiti':
        return 'project';
      default:
        // Default to project for unknown namespaces
        return 'project';
    }
  }

  /**
   * Get the appropriate store for a scope
   */
  private getStore(scope: SettingsScope): Store<UserSettings> | Store<ProjectSettings> | null {
    if (scope === 'user') {
      return this.userStore;
    }
    return this.projectStore;
  }

  /**
   * Get default value for a namespace
   */
  private getDefault(namespace: string, scope: SettingsScope): unknown {
    const defaults = scope === 'user' ? DEFAULT_USER_SETTINGS : DEFAULT_PROJECT_SETTINGS;
    return deepGet(defaults as unknown as Record<string, unknown>, namespace);
  }

  // ============================================================================
  // Store Paths (for debugging/migration)
  // ============================================================================

  getUserStorePath(): string {
    return this.userStore.path;
  }

  getProjectStorePath(): string | null {
    return this.projectStore?.path || null;
  }

  // ============================================================================
  // Backup & Restore API
  // ============================================================================

  /**
   * Create a timestamped backup of settings for a scope
   * @returns BackupInfo with path and metadata
   */
  async createBackup(scope: SettingsScope): Promise<BackupInfo> {
    const store = this.getStore(scope);
    if (!store) {
      throw new Error(`No store available for scope: ${scope}`);
    }

    const sourcePath = store.path;
    const dir = dirname(sourcePath);
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').slice(0, 15);
    const prefix = scope === 'user' ? 'settings' : 'app-settings';
    const backupFilename = `${prefix}_${timestamp}.bak`;
    const backupPath = join(dir, backupFilename);

    await copyFile(sourcePath, backupPath);
    const stats = await stat(backupPath);

    console.log(`[SettingsService] Created backup: ${backupPath}`);

    return {
      path: backupPath,
      timestamp: Date.now(),
      scope,
      size: stats.size,
      filename: backupFilename,
    };
  }

  /**
   * List available backups for a scope
   * @returns Array of BackupInfo sorted by timestamp (newest first)
   */
  async listBackups(scope: SettingsScope): Promise<BackupInfo[]> {
    const store = this.getStore(scope);
    if (!store) {
      return [];
    }

    const dir = dirname(store.path);
    const prefix = scope === 'user' ? 'settings_' : 'app-settings_';

    try {
      const files = await readdir(dir);
      const backupFiles = files.filter(f => f.startsWith(prefix) && f.endsWith('.bak'));

      const backups = await Promise.all(
        backupFiles.map(async (filename): Promise<BackupInfo> => {
          const fullPath = join(dir, filename);
          const stats = await stat(fullPath);
          return {
            path: fullPath,
            timestamp: stats.mtimeMs,
            scope,
            size: stats.size,
            filename,
          };
        })
      );

      // Sort by timestamp, newest first
      return backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch (err) {
      console.error('[SettingsService] Failed to list backups:', err);
      return [];
    }
  }

  /**
   * Restore settings from a backup file
   * @param backupPath Full path to the backup file
   * @param scope The scope to restore to
   */
  async restoreFromBackup(backupPath: string, scope: SettingsScope): Promise<void> {
    const store = this.getStore(scope);
    if (!store) {
      throw new Error(`No store available for scope: ${scope}`);
    }

    const content = await readFile(backupPath, 'utf-8');
    const data = JSON.parse(content);

    // Validate it's an object
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid backup file: not a valid settings object');
    }

    // Restore by replacing store contents
    store.store = data as UserSettings & ProjectSettings;

    // Notify all listeners of the restore
    this.notifyChange('*', store.store, scope);

    console.log(`[SettingsService] Restored from backup: ${backupPath}`);
  }

  /**
   * Delete a backup file
   * @param backupPath Full path to the backup file
   */
  async deleteBackup(backupPath: string): Promise<void> {
    // Safety check: only allow deleting .bak files
    if (!backupPath.endsWith('.bak')) {
      throw new Error('Can only delete .bak files');
    }

    const filename = basename(backupPath);
    if (!filename.startsWith('settings_') && !filename.startsWith('app-settings_')) {
      throw new Error('Invalid backup filename');
    }

    await unlink(backupPath);
    console.log(`[SettingsService] Deleted backup: ${backupPath}`);
  }
}

// Singleton instance
let instance: SettingsService | null = null;

export function getSettingsService(): SettingsService {
  if (!instance) {
    instance = new SettingsService();
  }
  return instance;
}

export function initSettingsService(projectPath?: string): SettingsService {
  const service = getSettingsService();
  if (projectPath) {
    service.setProjectPath(projectPath);
  }
  return service;
}
