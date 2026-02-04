/**
 * Coding Agents Persistence - IndexedDB storage for session archival
 * Archives completed sessions so they survive app restart
 */
import type { CodingAgentSession } from './coding-agents-store';

const DB_NAME = 'kuroryuu-coding-agents';
const DB_VERSION = 1;
const SESSIONS_STORE = 'sessions';

let dbInstance: IDBDatabase | null = null;

export interface ArchivedSession {
  id: string;
  session: CodingAgentSession;
  logs: string;
  archived_at: string;
}

/**
 * Initialize IndexedDB connection
 */
async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    if (dbInstance.objectStoreNames.contains(SESSIONS_STORE)) {
      return dbInstance;
    }
    dbInstance.close();
    dbInstance = null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[coding-agents-persistence] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        console.warn('[coding-agents-persistence] Object store missing, deleting and recreating database');
        db.close();
        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
        deleteRequest.onsuccess = () => {
          getDB().then(resolve).catch(reject);
        };
        deleteRequest.onerror = () => reject(deleteRequest.error);
        return;
      }
      dbInstance = db;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = db.createObjectStore(SESSIONS_STORE, {
          keyPath: 'id',
        });
        store.createIndex('archived_at', 'archived_at', { unique: false });
        console.log('[coding-agents-persistence] Created object store:', SESSIONS_STORE);
      }
    };
  });
}

/**
 * Archive a completed session with its logs
 */
export async function archiveSession(
  session: CodingAgentSession,
  logs: string
): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SESSIONS_STORE, 'readwrite');
      const store = transaction.objectStore(SESSIONS_STORE);

      const archived: ArchivedSession = {
        id: session.id,
        session,
        logs,
        archived_at: new Date().toISOString(),
      };

      const request = store.put(archived);

      request.onsuccess = () => {
        console.log(`[coding-agents-persistence] Archived session: ${session.id}`);
        resolve();
      };

      request.onerror = () => {
        console.error('[coding-agents-persistence] Failed to archive session:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[coding-agents-persistence] Archive error:', error);
    throw error;
  }
}

/**
 * Load all archived sessions
 */
export async function loadArchivedSessions(): Promise<ArchivedSession[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SESSIONS_STORE, 'readonly');
      const store = transaction.objectStore(SESSIONS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const sessions = request.result || [];
        console.log(`[coding-agents-persistence] Loaded ${sessions.length} archived sessions`);
        resolve(sessions);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[coding-agents-persistence] Load error:', error);
    return [];
  }
}

/**
 * Get a single archived session by ID
 */
export async function getArchivedSession(id: string): Promise<ArchivedSession | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SESSIONS_STORE, 'readonly');
      const store = transaction.objectStore(SESSIONS_STORE);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[coding-agents-persistence] Get error:', error);
    return null;
  }
}

/**
 * Delete an archived session
 */
export async function deleteArchivedSession(id: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SESSIONS_STORE, 'readwrite');
      const store = transaction.objectStore(SESSIONS_STORE);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`[coding-agents-persistence] Deleted session: ${id}`);
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[coding-agents-persistence] Delete error:', error);
  }
}

/**
 * Prune old sessions, keeping only the most recent N
 * @param keepCount - Number of sessions to keep (default 100)
 */
export async function pruneOldSessions(keepCount: number = 100): Promise<number> {
  try {
    const sessions = await loadArchivedSessions();
    if (sessions.length <= keepCount) return 0;

    // Sort by archived_at ascending (oldest first)
    sessions.sort((a, b) =>
      new Date(a.archived_at).getTime() - new Date(b.archived_at).getTime()
    );

    const toDelete = sessions.slice(0, sessions.length - keepCount);
    const db = await getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SESSIONS_STORE, 'readwrite');
      const store = transaction.objectStore(SESSIONS_STORE);
      let deleted = 0;

      toDelete.forEach((session) => {
        const request = store.delete(session.id);
        request.onsuccess = () => deleted++;
      });

      transaction.oncomplete = () => {
        console.log(`[coding-agents-persistence] Pruned ${deleted} old sessions`);
        resolve(deleted);
      };

      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('[coding-agents-persistence] Prune error:', error);
    return 0;
  }
}

/**
 * Clear all archived sessions
 */
export async function clearArchive(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SESSIONS_STORE, 'readwrite');
      const store = transaction.objectStore(SESSIONS_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[coding-agents-persistence] Archive cleared');
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[coding-agents-persistence] Clear error:', error);
  }
}

/**
 * Get count of archived sessions
 */
export async function getArchivedCount(): Promise<number> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SESSIONS_STORE, 'readonly');
      const store = transaction.objectStore(SESSIONS_STORE);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[coding-agents-persistence] Count error:', error);
    return 0;
  }
}
