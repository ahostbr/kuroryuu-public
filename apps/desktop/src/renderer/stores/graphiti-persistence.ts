/**
 * Graphiti Event Persistence - IndexedDB storage for event archival
 * Supports configurable retention periods: 1h, 24h, 7d, 30d, 90d, unlimited
 */
import type { GraphitiEvent, GraphitiRetentionPeriod } from '../types/graphiti-event';

const DB_NAME = 'kuroryuu-graphiti';
const DB_VERSION = 1;
const EVENTS_STORE = 'event_batches';
const METRICS_STORE = 'metrics_snapshots';
const SNAPSHOTS_STORE = 'user_snapshots';

let dbInstance: IDBDatabase | null = null;

// Retention period in milliseconds
const RETENTION_MS: Record<GraphitiRetentionPeriod, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  'unlimited': Infinity,
};

/**
 * Initialize IndexedDB connection
 */
async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[graphiti-persistence] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Event batches store
      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        const eventsStore = db.createObjectStore(EVENTS_STORE, {
          keyPath: 'batchId',
          autoIncrement: true,
        });
        eventsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Metrics snapshots store
      if (!db.objectStoreNames.contains(METRICS_STORE)) {
        const metricsStore = db.createObjectStore(METRICS_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        metricsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // User-saved snapshots store
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        const snapshotsStore = db.createObjectStore(SNAPSHOTS_STORE, {
          keyPath: 'id',
        });
        snapshotsStore.createIndex('timestamp', 'timestamp', { unique: false });
        snapshotsStore.createIndex('name', 'name', { unique: false });
      }
    };
  });
}

// ============================================================================
// Event Archival
// ============================================================================

export interface ArchivedBatch {
  batchId?: number;
  events: GraphitiEvent[];
  timestamp: number;
  eventCount: number;
}

/**
 * Archive a batch of events to IndexedDB
 */
export async function archiveGraphitiEvents(events: GraphitiEvent[]): Promise<number> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(EVENTS_STORE, 'readwrite');
      const store = transaction.objectStore(EVENTS_STORE);

      const batch: ArchivedBatch = {
        events,
        timestamp: Date.now(),
        eventCount: events.length,
      };

      const request = store.add(batch);

      request.onsuccess = () => {
        console.log(`[graphiti-persistence] Archived ${events.length} events, batch ID: ${request.result}`);
        resolve(request.result as number);
      };

      request.onerror = () => {
        console.error('[graphiti-persistence] Failed to archive events:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[graphiti-persistence] Archive error:', error);
    throw error;
  }
}

/**
 * Load archived events from a specific batch
 */
export async function loadArchivedGraphitiBatch(
  batchId: number
): Promise<ArchivedBatch | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(EVENTS_STORE, 'readonly');
      const store = transaction.objectStore(EVENTS_STORE);
      const request = store.get(batchId);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result as ArchivedBatch);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[graphiti-persistence] Load error:', error);
    return null;
  }
}

/**
 * List all archived batches (metadata only)
 */
export async function listArchivedGraphitiBatches(): Promise<
  Array<{ batchId: number; timestamp: number; eventCount: number }>
> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(EVENTS_STORE, 'readonly');
      const store = transaction.objectStore(EVENTS_STORE);
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
    console.error('[graphiti-persistence] List error:', error);
    return [];
  }
}

/**
 * Get count of archived batches
 */
export async function getArchivedGraphitiBatchCount(): Promise<number> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(EVENTS_STORE, 'readonly');
      const store = transaction.objectStore(EVENTS_STORE);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[graphiti-persistence] Count error:', error);
    return 0;
  }
}

/**
 * Clear all archived events
 */
export async function clearGraphitiArchive(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(EVENTS_STORE, 'readwrite');
      const store = transaction.objectStore(EVENTS_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[graphiti-persistence] Archive cleared');
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[graphiti-persistence] Clear error:', error);
  }
}

/**
 * Prune batches older than retention period
 */
export async function pruneByRetention(retention: GraphitiRetentionPeriod): Promise<number> {
  if (retention === 'unlimited') return 0;

  const cutoffTime = Date.now() - RETENTION_MS[retention];

  try {
    const batches = await listArchivedGraphitiBatches();
    const toDelete = batches.filter(b => b.timestamp < cutoffTime);

    if (toDelete.length === 0) return 0;

    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(EVENTS_STORE, 'readwrite');
      const store = transaction.objectStore(EVENTS_STORE);
      let deleted = 0;

      toDelete.forEach((batch) => {
        const request = store.delete(batch.batchId);
        request.onsuccess = () => deleted++;
      });

      transaction.oncomplete = () => {
        console.log(`[graphiti-persistence] Pruned ${deleted} batches older than ${retention}`);
        resolve(deleted);
      };

      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('[graphiti-persistence] Retention prune error:', error);
    return 0;
  }
}

/**
 * Prune old batches by count (fallback for unlimited retention)
 */
export async function pruneOldGraphitiBatches(keepCount: number = 100): Promise<number> {
  try {
    const batches = await listArchivedGraphitiBatches();
    if (batches.length <= keepCount) return 0;

    // Sort by timestamp ascending (oldest first)
    batches.sort((a, b) => a.timestamp - b.timestamp);

    const toDelete = batches.slice(0, batches.length - keepCount);
    const db = await getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(EVENTS_STORE, 'readwrite');
      const store = transaction.objectStore(EVENTS_STORE);
      let deleted = 0;

      toDelete.forEach((batch) => {
        const request = store.delete(batch.batchId);
        request.onsuccess = () => deleted++;
      });

      transaction.oncomplete = () => {
        console.log(`[graphiti-persistence] Pruned ${deleted} old batches`);
        resolve(deleted);
      };

      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('[graphiti-persistence] Prune error:', error);
    return 0;
  }
}

// ============================================================================
// User Snapshots
// ============================================================================

export interface GraphitiSnapshot {
  id: string;
  name: string;
  description?: string;
  timestamp: number;
  events: GraphitiEvent[];
  filters: Record<string, unknown>;
  viewState: Record<string, unknown>;
}

/**
 * Save a user snapshot
 */
export async function saveGraphitiSnapshot(snapshot: GraphitiSnapshot): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SNAPSHOTS_STORE, 'readwrite');
      const store = transaction.objectStore(SNAPSHOTS_STORE);
      const request = store.put(snapshot);

      request.onsuccess = () => {
        console.log(`[graphiti-persistence] Saved snapshot: ${snapshot.name}`);
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[graphiti-persistence] Save snapshot error:', error);
    throw error;
  }
}

/**
 * Load a user snapshot
 */
export async function loadGraphitiSnapshot(id: string): Promise<GraphitiSnapshot | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SNAPSHOTS_STORE, 'readonly');
      const store = transaction.objectStore(SNAPSHOTS_STORE);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[graphiti-persistence] Load snapshot error:', error);
    return null;
  }
}

/**
 * List all user snapshots (metadata only)
 */
export async function listGraphitiSnapshots(): Promise<
  Array<{ id: string; name: string; timestamp: number; description?: string }>
> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SNAPSHOTS_STORE, 'readonly');
      const store = transaction.objectStore(SNAPSHOTS_STORE);
      const request = store.openCursor();
      const snapshots: Array<{ id: string; name: string; timestamp: number; description?: string }> = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          snapshots.push({
            id: cursor.value.id,
            name: cursor.value.name,
            timestamp: cursor.value.timestamp,
            description: cursor.value.description,
          });
          cursor.continue();
        } else {
          resolve(snapshots);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[graphiti-persistence] List snapshots error:', error);
    return [];
  }
}

/**
 * Delete a user snapshot
 */
export async function deleteGraphitiSnapshot(id: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SNAPSHOTS_STORE, 'readwrite');
      const store = transaction.objectStore(SNAPSHOTS_STORE);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`[graphiti-persistence] Deleted snapshot: ${id}`);
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[graphiti-persistence] Delete snapshot error:', error);
  }
}
