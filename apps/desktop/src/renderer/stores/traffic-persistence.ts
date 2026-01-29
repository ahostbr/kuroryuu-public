/**
 * Traffic Event Persistence - IndexedDB storage for event archival
 * Prevents memory leak by offloading old events to disk
 */
import type { TrafficEvent } from '../types/traffic';

const DB_NAME = 'kuroryuu-traffic';
const DB_VERSION = 2; // Bumped to force upgrade and ensure object store exists
const STORE_NAME = 'event_batches';

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize IndexedDB connection
 */
async function getDB(): Promise<IDBDatabase> {
  // Check if cached instance is still valid and has our object store
  if (dbInstance) {
    if (dbInstance.objectStoreNames.contains(STORE_NAME)) {
      return dbInstance;
    }
    // Object store missing, close and recreate
    dbInstance.close();
    dbInstance = null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[traffic-persistence] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const db = request.result;
      // Verify object store exists
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        console.warn('[traffic-persistence] Object store missing, deleting and recreating database');
        db.close();
        // Delete and retry
        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
        deleteRequest.onsuccess = () => {
          // Retry opening after delete
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

      // Create object store for event batches
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'batchId',
          autoIncrement: true,
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('[traffic-persistence] Created object store:', STORE_NAME);
      }
    };
  });
}

/**
 * Archive a batch of events to IndexedDB
 * @param events - Events to archive (typically 100)
 */
export async function archiveEvents(events: TrafficEvent[]): Promise<number> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const batch = {
        events,
        timestamp: Date.now(),
        eventCount: events.length,
      };

      const request = store.add(batch);

      request.onsuccess = () => {
        console.log(`[traffic-persistence] Archived ${events.length} events, batch ID: ${request.result}`);
        resolve(request.result as number);
      };

      request.onerror = () => {
        console.error('[traffic-persistence] Failed to archive events:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[traffic-persistence] Archive error:', error);
    throw error;
  }
}

/**
 * Get count of archived batches
 */
export async function getArchivedBatchCount(): Promise<number> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[traffic-persistence] Count error:', error);
    return 0;
  }
}

/**
 * Load archived events from a specific batch
 * @param batchId - The batch ID to load
 */
export async function loadArchivedBatch(
  batchId: number
): Promise<{ events: TrafficEvent[]; timestamp: number } | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(batchId);

      request.onsuccess = () => {
        if (request.result) {
          resolve({
            events: request.result.events,
            timestamp: request.result.timestamp,
          });
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[traffic-persistence] Load error:', error);
    return null;
  }
}

/**
 * Get all batch metadata (without full event data)
 */
export async function listArchivedBatches(): Promise<
  Array<{ batchId: number; timestamp: number; eventCount: number }>
> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      const batches: Array<{ batchId: number; timestamp: number; eventCount: number }> = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          batches.push({
            batchId: cursor.value.batchId,
            timestamp: cursor.value.timestamp,
            eventCount: cursor.value.eventCount,
          });
          cursor.continue();
        } else {
          resolve(batches);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[traffic-persistence] List error:', error);
    return [];
  }
}

/**
 * Clear all archived events
 */
export async function clearArchive(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[traffic-persistence] Archive cleared');
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[traffic-persistence] Clear error:', error);
  }
}

/**
 * Delete old batches to prevent unbounded growth
 * Keeps only the most recent N batches
 * @param keepCount - Number of recent batches to keep (default 50 = 5000 events)
 */
export async function pruneOldBatches(keepCount: number = 50): Promise<number> {
  try {
    const batches = await listArchivedBatches();
    if (batches.length <= keepCount) return 0;

    // Sort by timestamp ascending (oldest first)
    batches.sort((a, b) => a.timestamp - b.timestamp);

    const toDelete = batches.slice(0, batches.length - keepCount);
    const db = await getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      let deleted = 0;

      toDelete.forEach((batch) => {
        const request = store.delete(batch.batchId);
        request.onsuccess = () => deleted++;
      });

      transaction.oncomplete = () => {
        console.log(`[traffic-persistence] Pruned ${deleted} old batches`);
        resolve(deleted);
      };

      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('[traffic-persistence] Prune error:', error);
    return 0;
  }
}
