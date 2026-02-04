# Coding Agents Zustand Stores Review

**Date:** 2026-02-04
**Reviewer:** Claude Agent
**Files Reviewed:**
- `apps/desktop/src/renderer/stores/coding-agents-store.ts` (262 lines)
- `apps/desktop/src/renderer/stores/coding-agents-persistence.ts` (261 lines)
- `apps/desktop/src/renderer/stores/agent-flow-store.ts` (276 lines)

---

## Executive Summary

The coding agents stores provide session management for background coding agents, with IndexedDB persistence for completed sessions and a ReactFlow-based visualization layer. Overall, the code is well-structured but contains several issues ranging from **critical race conditions** to **medium-severity memory leaks** and code quality concerns.

**Risk Rating:** Medium-High (requires fixes before production)

| Category | Issues Found | Severity |
|----------|--------------|----------|
| Race Conditions | 3 | High |
| Memory Leaks | 2 | Medium |
| Error Handling | 4 | Medium |
| Code Quality | 6 | Low |

---

## 1. coding-agents-store.ts

### 1.1 Critical Issues

#### 1.1.1 Race Condition in `loadSessions` (HIGH SEVERITY)

**Location:** Lines 82-144

**Problem:** The `loadSessions` function performs multiple async operations without proper atomicity. Between reading `previousSessionIds` and updating it, another poll could execute.

```typescript
// Line 96 - reads state
const { previousSessionIds, archivedSessions } = get();

// Lines 106-122 - async operations (archiving)
for (const session of completedSessions) {
  try {
    const logResult = await mcpCall('k_process', { ... });
    await archiveSession(session, logs);  // Another loadSessions could fire here
  }
}

// Line 137 - updates state
set({ sessions: liveSessions, previousSessionIds: runningIds });
```

**Impact:**
- Double archiving of the same session
- Lost state updates if two polls overlap
- Inconsistent `previousSessionIds` tracking

**Fix:** Use a mutex/lock or queue pattern:
```typescript
let isLoadingLock = false;
loadSessions: async () => {
  if (isLoadingLock) return;
  isLoadingLock = true;
  try { /* ... */ } finally { isLoadingLock = false; }
}
```

#### 1.1.2 Memory Leak: Polling Interval Not Cleaned on Component Unmount (MEDIUM SEVERITY)

**Location:** Lines 235-260

**Problem:** The `pollingInterval` is stored in state but there's no guarantee consumers will call `stopPolling()` when unmounting. If a component unmounts without stopping, the interval continues indefinitely.

```typescript
startPolling: (intervalMs = 5000) => {
  // ...
  const interval = setInterval(() => {
    loadSessions();  // Keeps running even if component unmounted
  }, intervalMs);
  set({ pollingInterval: interval });
}
```

**Impact:**
- Leaked intervals accumulate
- Continued fetch calls to Gateway after UI is gone
- Memory growth over time

**Fix:** Components should use React effect cleanup, but the store should also provide safety:
```typescript
// Add to store initialization
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => get().stopPolling());
}
```

#### 1.1.3 Sequential Archiving in Loop (PERFORMANCE)

**Location:** Lines 106-122

**Problem:** Completed sessions are archived sequentially with `await` inside a `for` loop. If 10 sessions complete simultaneously, archiving takes 10x longer than necessary.

```typescript
for (const session of completedSessions) {
  try {
    const logResult = await mcpCall('k_process', { ... });
    await archiveSession(session, logs);
  }
}
```

**Fix:** Use `Promise.all` with concurrent archiving:
```typescript
await Promise.all(completedSessions.map(async (session) => {
  const logResult = await mcpCall('k_process', { ... });
  await archiveSession(session, logResult.ok ? logResult.output || '' : '');
}));
```

### 1.2 Medium Issues

#### 1.2.1 Error Handling Swallows Archive Failures

**Location:** Lines 118-122

**Problem:** Archive failures are logged but not surfaced to the user. A failed archive means data loss.

```typescript
} catch (archiveErr) {
  console.error('[CodingAgentsStore] Failed to archive session:', archiveErr);
  // Session data is lost silently
}
```

**Fix:** Track failed archives and expose them in state:
```typescript
interface CodingAgentsState {
  // ...
  archiveErrors: { sessionId: string; error: string }[];
}
```

#### 1.2.2 `previousSessionIds` Uses Wrong Type

**Location:** Line 80

**Problem:** `Set<string>` does not serialize properly in React DevTools or when logging state. Zustand recommends using plain objects for state.

```typescript
previousSessionIds: new Set<string>(),  // Sets don't serialize well
```

**Fix:** Use a plain object:
```typescript
previousSessionIds: {} as Record<string, boolean>,
```

#### 1.2.3 No Debouncing on `loadSessions`

**Location:** Lines 235-252

**Problem:** Rapid polling or manual refresh calls can trigger multiple concurrent `loadSessions`. Combined with the race condition above, this amplifies issues.

### 1.3 Code Quality Issues

#### 1.3.1 Magic Numbers

- Line 113: `limit: 5000` - arbitrary log limit
- Line 131: `100` in `pruneOldSessions(100)` - hardcoded keep count
- Line 235: `5000` - default polling interval

**Fix:** Extract to constants:
```typescript
const LOG_FETCH_LIMIT = 5000;
const ARCHIVE_PRUNE_KEEP_COUNT = 100;
const DEFAULT_POLL_INTERVAL_MS = 5000;
```

#### 1.3.2 Missing TypeScript Strictness

**Location:** Line 85

```typescript
const result = await mcpCall('k_process', { action: 'list' }) as {
  ok: boolean;
  sessions: CodingAgentSession[];
  error?: string;
};
```

**Issue:** Type assertion instead of proper type guard. If the Gateway returns unexpected data, TypeScript won't help.

**Fix:** Add runtime validation:
```typescript
function isMcpListResult(data: unknown): data is McpListResult {
  return typeof data === 'object' && data !== null && 'ok' in data;
}
```

---

## 2. coding-agents-persistence.ts

### 2.1 Critical Issues

#### 2.1.1 IndexedDB Connection Leak (MEDIUM SEVERITY)

**Location:** Lines 23-68

**Problem:** The `getDB()` function caches `dbInstance` but never closes it. In long-running sessions, this can lead to connection pool exhaustion.

```typescript
let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    // ...returns cached instance
  }
  // Creates new connection, never closes
}
```

**Impact:**
- Connection pool exhaustion in long sessions
- Database locked for other tabs

**Fix:** Add connection management:
```typescript
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
```

#### 2.1.2 Race Condition in Database Recreation (HIGH SEVERITY)

**Location:** Lines 42-50

**Problem:** If `onsuccess` fires but the object store is missing, the code deletes the database and recursively calls `getDB()`. If another operation is in progress, this causes corruption.

```typescript
request.onsuccess = () => {
  const db = request.result;
  if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
    db.close();
    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);  // DANGEROUS
    deleteRequest.onsuccess = () => {
      getDB().then(resolve).catch(reject);  // Recursive call during delete
    };
  }
};
```

**Impact:**
- Database corruption
- Lost data
- Infinite recursion if recreation fails

**Fix:** Use a lock and proper state machine for DB initialization.

### 2.2 Medium Issues

#### 2.2.1 `pruneOldSessions` Double-Reads All Sessions

**Location:** Lines 183-216

**Problem:** `loadArchivedSessions()` reads all sessions, then another transaction is opened to delete. This is inefficient and creates a TOCTOU window.

```typescript
export async function pruneOldSessions(keepCount: number = 100): Promise<number> {
  const sessions = await loadArchivedSessions();  // Read all
  // ...sort and determine deletions...
  const db = await getDB();
  const transaction = db.transaction(SESSIONS_STORE, 'readwrite');  // New transaction
}
```

**Fix:** Use cursor-based deletion within a single transaction:
```typescript
const transaction = db.transaction(SESSIONS_STORE, 'readwrite');
const store = transaction.objectStore(SESSIONS_STORE);
const index = store.index('archived_at');
const cursor = index.openCursor();
// Delete oldest directly via cursor
```

#### 2.2.2 Missing Error Propagation in `deleteArchivedSession`

**Location:** Lines 158-177

**Problem:** Errors are caught and logged but function returns void, not an error indicator.

```typescript
} catch (error) {
  console.error('[coding-agents-persistence] Delete error:', error);
  // No throw or return value - caller doesn't know it failed
}
```

#### 2.2.3 Promise Constructor Anti-Pattern

**Location:** Multiple locations (e.g., Lines 79-101)

**Problem:** The code wraps IndexedDB callbacks in `new Promise()` manually. This is verbose and error-prone.

**Fix:** Consider using `idb` library or creating a generic wrapper:
```typescript
function wrapRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
```

### 2.3 Code Quality Issues

#### 2.3.1 Inconsistent Return Types

- `deleteArchivedSession`: Returns `Promise<void>` but catches errors silently
- `clearArchive`: Same issue
- `pruneOldSessions`: Returns `0` on error instead of throwing

#### 2.3.2 No Versioning Strategy for Stored Data

**Location:** Line 8

```typescript
const DB_VERSION = 1;
```

**Issue:** If `ArchivedSession` interface changes, old data won't migrate. The `onupgradeneeded` handler doesn't handle version migrations.

---

## 3. agent-flow-store.ts

### 3.1 Critical Issues

#### 3.1.1 Module-Level Timer Leak (MEDIUM SEVERITY)

**Location:** Lines 107-109

**Problem:** `graphRebuildTimer` is a module-level variable, not part of store state. It persists across hot reloads in development and can't be cleared properly.

```typescript
let graphRebuildTimer: ReturnType<typeof setTimeout> | null = null;
```

**Impact:**
- Multiple timers accumulate during hot reload
- Memory leak
- Unexpected graph rebuilds

**Fix:** Move into store state or use a ref pattern:
```typescript
interface AgentFlowState {
  _rebuildTimer: ReturnType<typeof setTimeout> | null;
  // ...
}
```

#### 3.1.2 Theme Change Doesn't Rebuild Graph

**Location:** Lines 245-249

**Problem:** `setTheme` updates the theme but doesn't rebuild the graph. Edges keep old colors until next data refresh.

```typescript
setTheme: (theme: AgentFlowTheme) => {
  set({ theme });
  // Rebuild graph with new theme colors would require sessions
  // This will be triggered by the parent component  <-- HOPE-BASED PROGRAMMING
}
```

**Impact:** Visual inconsistency after theme change.

**Fix:** Store sessions in state and rebuild on theme change:
```typescript
setTheme: (theme: AgentFlowTheme) => {
  set({ theme });
  const { _lastSessions } = get();
  if (_lastSessions) {
    const { nodes, edges } = buildGraph(_lastSessions, theme);
    set({ nodes, edges });
  }
}
```

### 3.2 Medium Issues

#### 3.2.1 `calculateDuration` Performance

**Location:** Lines 114-123

**Problem:** Called for every session on every graph rebuild. Creates new `Date` objects repeatedly.

```typescript
function calculateDuration(startedAt: string): string {
  const start = new Date(startedAt).getTime();  // Expensive
  // ...
}
```

**Fix:** Memoize or calculate only for running sessions:
```typescript
const durationCache = new Map<string, { start: number; formatted: string }>();
```

#### 3.2.2 Division by Zero Risk

**Location:** Line 162

```typescript
const angleStep = (2 * Math.PI) / sessions.length;
```

**Issue:** If `sessions.length === 0`, this would be `Infinity`. However, the early return at line 156 prevents this. Still, defensive coding would be better.

#### 3.2.3 Magic Numbers in Layout

**Location:** Lines 161, 147, 167

```typescript
const radius = 280;
// ...
position: { x: 400, y: 300 },  // Hardcoded center
// ...
const x = 400 + radius * Math.cos(angle);
const y = 300 + radius * Math.sin(angle);
```

**Fix:** Extract to configuration:
```typescript
const LAYOUT = {
  CENTER: { x: 400, y: 300 },
  RADIUS: 280,
} as const;
```

### 3.3 Code Quality Issues

#### 3.3.1 `clearGraph` Duplicates Initial State

**Location:** Lines 255-271

**Problem:** `clearGraph` manually constructs the session-manager node instead of using a shared constant or function.

```typescript
clearGraph: () => {
  set({
    nodes: [{
      id: 'session-manager',
      type: 'session-manager',
      position: { x: 400, y: 300 },  // Duplicated from buildGraph
      // ...
    }],
    edges: [],
  });
}
```

**Fix:** Extract to shared function:
```typescript
function createEmptyGraph(): { nodes: AgentFlowNode[]; edges: AgentFlowEdge[] } {
  return {
    nodes: [createSessionManagerNode(0, 0, 0, 0)],
    edges: [],
  };
}
```

#### 3.3.2 Unused `isConnected` State

**Location:** Lines 54, 253

```typescript
isConnected: true,
// ...
setConnected: (connected: boolean) => set({ isConnected: connected }),
```

**Issue:** `isConnected` is never consumed by any logic in this store. It's only set but not read.

---

## 4. Cross-Store Interaction Issues

### 4.1 No Subscription Pattern Between Stores

**Problem:** `agent-flow-store` needs session data from `coding-agents-store`, but there's no automatic synchronization. The parent component must manually call `buildGraphFromSessions` when sessions change.

**Impact:** Easy to forget, leads to stale visualizations.

**Fix:** Use Zustand's `subscribe` API:
```typescript
// In agent-flow-store.ts
useCodingAgentsStore.subscribe(
  (state) => state.sessions,
  (sessions) => useAgentFlowStore.getState().buildGraphFromSessions(sessions)
);
```

### 4.2 Inconsistent Error Handling

- `coding-agents-store`: Stores errors in state (`error: string | null`)
- `coding-agents-persistence`: Returns empty arrays on error
- `agent-flow-store`: No error handling

**Fix:** Standardize on a single error handling strategy.

---

## 5. Recommendations Summary

### Critical (Fix Before Production)

| Issue | File | Effort |
|-------|------|--------|
| Race condition in `loadSessions` | coding-agents-store.ts:82-144 | 1h |
| Database recreation race | coding-agents-persistence.ts:42-50 | 2h |
| Module-level timer leak | agent-flow-store.ts:107-109 | 30m |

### High Priority

| Issue | File | Effort |
|-------|------|--------|
| Polling interval cleanup | coding-agents-store.ts:235-260 | 1h |
| IndexedDB connection management | coding-agents-persistence.ts:23-68 | 1h |
| Theme change graph rebuild | agent-flow-store.ts:245-249 | 30m |

### Medium Priority

| Issue | File | Effort |
|-------|------|--------|
| Sequential archiving | coding-agents-store.ts:106-122 | 30m |
| Double-read in pruneOldSessions | coding-agents-persistence.ts:183-216 | 1h |
| Error propagation | All files | 2h |

### Low Priority (Tech Debt)

- Magic numbers extraction
- Consistent return types
- Type guards for Gateway responses
- Store subscription pattern
- Data versioning strategy

---

## 6. Testing Recommendations

### Unit Tests Needed

1. **coding-agents-store**
   - Test concurrent `loadSessions` calls
   - Test archiving behavior when session completes
   - Test polling start/stop lifecycle

2. **coding-agents-persistence**
   - Test database recreation edge cases
   - Test pruning with concurrent writes
   - Test error scenarios (QuotaExceeded, etc.)

3. **agent-flow-store**
   - Test debounce behavior
   - Test theme changes with active sessions
   - Test pause/resume visualization

### Integration Tests Needed

1. Full session lifecycle: spawn → run → complete → archive → retrieve
2. App restart: verify archived sessions restore
3. Concurrent operations: multiple sessions completing simultaneously

---

## 7. Conclusion

The coding agents stores provide solid functionality but have several race conditions and memory leak risks that should be addressed before production deployment. The most critical issues are:

1. **Race condition in `loadSessions`** - Can cause duplicate archiving and state inconsistency
2. **IndexedDB recreation race** - Can corrupt database
3. **Module-level timer** - Memory leak in development and production

With the recommended fixes, these stores would be production-ready. The code quality issues are lower priority but addressing them would improve maintainability.
