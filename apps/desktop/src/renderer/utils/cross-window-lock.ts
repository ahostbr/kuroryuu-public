/**
 * Cross-Window Lock Utility
 *
 * Uses BroadcastChannel + localStorage to synchronize a lock across
 * multiple Electron BrowserWindows (e.g., main window and Code Editor window).
 *
 * This solves the mutual exclusion problem where both Insights and Code Editor
 * could open the chat simultaneously because they run in separate windows
 * with separate Zustand store instances.
 */

export type AssistantViewType = 'insights' | 'code-editor' | null;

const CHANNEL_NAME = 'kuroryuu-chat-lock';
const STORAGE_KEY = 'kuroryuu-chat-activeView';
const TIMESTAMP_KEY = 'kuroryuu-chat-lockTimestamp';
const STALE_THRESHOLD_MS = 30000; // Lock is considered stale after 30 seconds without heartbeat

class CrossWindowLock {
  private channel: BroadcastChannel;
  private listeners: Set<(view: AssistantViewType) => void> = new Set();
  private ownedView: AssistantViewType = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (e) => {
      const activeView = e.data?.activeView as AssistantViewType;
      this.notifyListeners(activeView);
    };

    // Also listen for storage events (cross-tab fallback)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY || e.key === TIMESTAMP_KEY) {
          const activeView = this.getActiveView();
          this.notifyListeners(activeView);
        }
      });

      // Clean up on window close/refresh to prevent stale locks
      window.addEventListener('beforeunload', () => {
        this.stopHeartbeat();
        if (this.ownedView) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(TIMESTAMP_KEY);
        }
      });
    }
  }

  private notifyListeners(view: AssistantViewType): void {
    this.listeners.forEach((fn) => fn(view));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    // Update timestamp every 10 seconds to keep lock alive
    this.heartbeatInterval = setInterval(() => {
      if (this.ownedView) {
        localStorage.setItem(TIMESTAMP_KEY, Date.now().toString());
      }
    }, 10000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private isLockStale(): boolean {
    const timestamp = localStorage.getItem(TIMESTAMP_KEY);
    if (!timestamp) return true; // No timestamp = stale
    const age = Date.now() - parseInt(timestamp, 10);
    return age > STALE_THRESHOLD_MS;
  }

  /**
   * Get the current active view holding the lock
   */
  getActiveView(): AssistantViewType {
    if (typeof localStorage === 'undefined') return null;
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'insights' || value === 'code-editor') {
      return value;
    }
    return null;
  }

  /**
   * Attempt to acquire the lock for a view.
   * Returns true if acquired, false if another view has it.
   */
  acquire(view: AssistantViewType): boolean {
    const current = this.getActiveView();

    // We already own this lock
    if (current === view && this.ownedView === view) {
      // Refresh the heartbeat timestamp
      localStorage.setItem(TIMESTAMP_KEY, Date.now().toString());
      return true;
    }

    // Another view/window has the lock - but check if it's stale
    if (current && current !== view) {
      if (this.isLockStale()) {
        // Lock is stale (window closed without cleanup), clear it
        console.log('[chatLock] Clearing stale lock:', current);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TIMESTAMP_KEY);
        // Fall through to acquire
      } else {
        // Lock is fresh, another window has it
        return false;
      }
    }

    // Acquire the lock
    if (view) {
      localStorage.setItem(STORAGE_KEY, view);
      localStorage.setItem(TIMESTAMP_KEY, Date.now().toString());
      this.ownedView = view;
      this.startHeartbeat();
      this.channel.postMessage({ activeView: view });
    }

    return true;
  }

  /**
   * Release the lock if this window owns it
   */
  release(view: AssistantViewType): void {
    const current = this.getActiveView();

    // Only release if this window owns the lock for this view
    if (current === view && this.ownedView === view) {
      this.stopHeartbeat();
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TIMESTAMP_KEY);
      this.ownedView = null;
      this.channel.postMessage({ activeView: null });
    }
  }

  /**
   * Check if this window owns the lock for a specific view
   */
  ownsLock(view: AssistantViewType): boolean {
    return this.ownedView === view && this.getActiveView() === view;
  }

  /**
   * Subscribe to lock changes from other windows
   */
  subscribe(fn: (view: AssistantViewType) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /**
   * Force clear the lock (use sparingly - for debugging/recovery)
   */
  forceClear(): void {
    this.stopHeartbeat();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TIMESTAMP_KEY);
    this.ownedView = null;
    this.channel.postMessage({ activeView: null });
  }
}

// Singleton instance
export const chatLock = new CrossWindowLock();

// ONE-TIME CLEANUP: Clear any stale locks from previous sessions
// This runs on module load to ensure a fresh start
// TODO: Remove this after confirming the fix works
if (typeof localStorage !== 'undefined') {
  const existingLock = localStorage.getItem(STORAGE_KEY);
  const existingTimestamp = localStorage.getItem(TIMESTAMP_KEY);
  if (existingLock || existingTimestamp) {
    console.log('[chatLock] Clearing stale locks on startup:', { existingLock, existingTimestamp });
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TIMESTAMP_KEY);
  }
}
