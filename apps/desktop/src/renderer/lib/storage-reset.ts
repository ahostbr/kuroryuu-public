/**
 * Storage Reset Utilities
 *
 * Functions to clear localStorage and IndexedDB during full app reset.
 * Only clears Kuroryuu-specific data, not browser/system data.
 */

// localStorage keys used by Kuroryuu (Zustand persist stores and other app data)
export const KURORYUU_LOCALSTORAGE_KEYS = [
  // Core stores
  'kuroryuu-subagent-configs',    // Sub-agent configurations
  'kuroryuu-conversations',       // Chat threads and messages
  'kuroryuu-projects',            // Project list and active project
  'kuroryuu-domain-config',       // Per-domain LLM provider/model settings
  'kuroryuu-prd-store',           // PRD documents and workflow state
  'kuroryuu-welcome-store',       // Welcome video mute, completed sections

  // UI state
  'kuroryuu-sidebar-collapsed',   // Sidebar collapsed state
  'kuroryuu-sidebar-expanded',    // Expanded sidebar groups
  'kuroryuu-command-center-history', // Tool execution history

  // Cross-window locks
  'kuroryuu-chat-activeView',     // Chat panel cross-window lock
  'kuroryuu-chat-lockTimestamp',  // Lock heartbeat timestamp

  // Legacy/misc
  'gateway_worker_id',            // Worker ID for terminal grid
  'kuroryuu-agent-config',        // Legacy agent config (migrated)
  'kuroryuu-theme',               // Legacy theme (migrated to electron-store)
] as const;

// IndexedDB databases used by Kuroryuu
export const KURORYUU_INDEXEDDB_NAMES = [
  'kuroryuu-traffic',    // HTTP traffic event archives
  'kuroryuu-graphiti',   // Graphiti event archives
] as const;

/**
 * Export all Kuroryuu localStorage data as JSON
 * Use before reset to backup user data
 */
export function exportLocalStorageBackup(): string {
  const backup: Record<string, string | null> = {};

  for (const key of KURORYUU_LOCALSTORAGE_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      backup[key] = value;
    }
  }

  return JSON.stringify(backup, null, 2);
}

/**
 * Clear all Kuroryuu localStorage keys
 * Called after main process signals reset
 */
export function clearAllLocalStorage(): void {
  for (const key of KURORYUU_LOCALSTORAGE_KEYS) {
    localStorage.removeItem(key);
  }
  console.log('[storage-reset] Cleared localStorage keys:', KURORYUU_LOCALSTORAGE_KEYS.length);
}

/**
 * Delete all Kuroryuu IndexedDB databases
 * Called after main process signals reset
 */
export async function clearAllIndexedDB(): Promise<void> {
  const results: Array<{ name: string; success: boolean; error?: string }> = [];

  for (const dbName of KURORYUU_INDEXEDDB_NAMES) {
    try {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => {
          results.push({ name: dbName, success: true });
          resolve();
        };
        request.onerror = () => {
          results.push({ name: dbName, success: false, error: request.error?.message });
          reject(request.error);
        };
        request.onblocked = () => {
          // Database is in use, but deletion will proceed when connections close
          results.push({ name: dbName, success: true });
          resolve();
        };
      });
    } catch (err) {
      console.warn(`[storage-reset] Failed to delete IndexedDB ${dbName}:`, err);
      // Continue with other databases
    }
  }

  console.log('[storage-reset] IndexedDB clear results:', results);
}

/**
 * Restore localStorage from a backup JSON string
 * Use to recover after accidental reset
 */
export function restoreLocalStorageFromBackup(backupJson: string): { restored: string[]; errors: string[] } {
  const restored: string[] = [];
  const errors: string[] = [];

  try {
    const backup = JSON.parse(backupJson);

    if (typeof backup !== 'object' || backup === null) {
      throw new Error('Invalid backup format: expected object');
    }

    for (const [key, value] of Object.entries(backup)) {
      try {
        if (typeof value === 'string') {
          localStorage.setItem(key, value);
          restored.push(key);
        }
      } catch (err) {
        errors.push(`${key}: ${err}`);
      }
    }
  } catch (err) {
    errors.push(`Parse error: ${err}`);
  }

  console.log('[storage-reset] Restore results:', { restored: restored.length, errors: errors.length });
  return { restored, errors };
}

/**
 * Get info about current localStorage usage
 * Useful for showing preview before reset
 */
export function getLocalStorageInfo(): { key: string; size: number; exists: boolean }[] {
  return KURORYUU_LOCALSTORAGE_KEYS.map(key => {
    const value = localStorage.getItem(key);
    return {
      key,
      size: value ? new Blob([value]).size : 0,
      exists: value !== null,
    };
  });
}

/**
 * Check if any IndexedDB databases exist
 */
export async function getIndexedDBInfo(): Promise<{ name: string; exists: boolean }[]> {
  // indexedDB.databases() is not available in all browsers
  // We'll try to open each database to check if it exists
  const results: { name: string; exists: boolean }[] = [];

  for (const dbName of KURORYUU_INDEXEDDB_NAMES) {
    try {
      const exists = await new Promise<boolean>((resolve) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const hasData = db.objectStoreNames.length > 0;
          db.close();
          resolve(hasData);
        };
        request.onerror = () => {
          resolve(false);
        };
      });
      results.push({ name: dbName, exists });
    } catch {
      results.push({ name: dbName, exists: false });
    }
  }

  return results;
}
