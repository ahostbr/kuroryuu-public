/**
 * Kuroryuu Agents Store - Manages SDK-based coding agent sessions
 *
 * Replaced k_process polling with Claude Agent SDK IPC event subscriptions.
 * Archives completed sessions to IndexedDB for persistence across restarts.
 */
import { create } from 'zustand';
import {
  archiveSession,
  loadArchivedSessions,
  deleteArchivedSession,
  pruneOldSessions,
  type ArchivedSession,
  type ArchivedSessionData,
} from './kuroryuu-agents-persistence';
import type {
  SDKAgentConfig,
  SDKAgentSessionSummary,
  SDKAgentSession,
  SerializedSDKMessage,
  SDKSessionStatus,
} from '../types/sdk-agent';

// Re-export legacy type name for components that still import it
export type { SDKAgentSessionSummary as KuroryuuAgentSession };

interface KuroryuuAgentsState {
  sessions: SDKAgentSessionSummary[];
  archivedSessions: ArchivedSession[];
  selectedSessionId: string | null;
  isLoading: boolean;
  error: string | null;
  subscribed: boolean;

  // Actions
  loadSessions: () => Promise<void>;
  loadArchivedSessions: () => Promise<void>;
  selectSession: (id: string | null) => void;
  startAgent: (config: SDKAgentConfig) => Promise<string | null>;
  stopAgent: (sessionId: string) => Promise<boolean>;
  resumeAgent: (sessionId: string, prompt: string) => Promise<string | null>;
  getSession: (sessionId: string) => Promise<SDKAgentSession | null>;
  getMessages: (sessionId: string, offset?: number, limit?: number) => Promise<SerializedSDKMessage[]>;
  getMessageCount: (sessionId: string) => Promise<number>;
  getRoles: () => Promise<Record<string, unknown>>;
  deleteArchived: (id: string) => Promise<void>;
  subscribe: () => void;
  unsubscribe: () => void;
}

// Store cleanup functions for IPC event subscriptions
let cleanupFns: Array<() => void> = [];

export const useKuroryuuAgentsStore = create<KuroryuuAgentsState>((set, get) => ({
  sessions: [],
  archivedSessions: [],
  selectedSessionId: null,
  isLoading: false,
  error: null,
  subscribed: false,

  loadSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const api = (window as unknown as { electronAPI: { sdkAgent: {
        list: () => Promise<SDKAgentSessionSummary[]>;
      }}}).electronAPI.sdkAgent;

      const sessions = await api.list();
      set({ sessions, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ error: message, isLoading: false });
      console.error('[KuroryuuAgentsStore] loadSessions error:', err);
    }
  },

  loadArchivedSessions: async () => {
    try {
      const archived = await loadArchivedSessions();
      set({ archivedSessions: archived });
    } catch (err) {
      console.error('[KuroryuuAgentsStore] loadArchivedSessions error:', err);
    }
  },

  selectSession: (id) => {
    set({ selectedSessionId: id });
  },

  startAgent: async (config) => {
    try {
      const api = (window as unknown as { electronAPI: { sdkAgent: {
        start: (config: SDKAgentConfig) => Promise<{ ok: boolean; sessionId?: string; error?: string }>;
      }}}).electronAPI.sdkAgent;

      const result = await api.start(config);
      if (!result.ok) {
        set({ error: result.error || 'Failed to start agent' });
        return null;
      }

      // Refresh sessions list
      await get().loadSessions();
      return result.sessionId || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ error: message });
      console.error('[KuroryuuAgentsStore] startAgent error:', err);
      return null;
    }
  },

  stopAgent: async (sessionId) => {
    try {
      const api = (window as unknown as { electronAPI: { sdkAgent: {
        stop: (id: string) => Promise<{ ok: boolean; error?: string }>;
      }}}).electronAPI.sdkAgent;

      const result = await api.stop(sessionId);
      if (!result.ok) {
        console.error('[KuroryuuAgentsStore] stopAgent error:', result.error);
        return false;
      }

      await get().loadSessions();
      return true;
    } catch (err) {
      console.error('[KuroryuuAgentsStore] stopAgent error:', err);
      return false;
    }
  },

  resumeAgent: async (sessionId, prompt) => {
    try {
      const api = (window as unknown as { electronAPI: { sdkAgent: {
        resume: (id: string, prompt: string) => Promise<{ ok: boolean; sessionId?: string; error?: string }>;
      }}}).electronAPI.sdkAgent;

      const result = await api.resume(sessionId, prompt);
      if (!result.ok) {
        set({ error: result.error || 'Failed to resume agent' });
        return null;
      }

      await get().loadSessions();
      return result.sessionId || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ error: message });
      return null;
    }
  },

  getSession: async (sessionId) => {
    try {
      const api = (window as unknown as { electronAPI: { sdkAgent: {
        get: (id: string) => Promise<SDKAgentSession | null>;
      }}}).electronAPI.sdkAgent;

      return await api.get(sessionId);
    } catch (err) {
      console.error('[KuroryuuAgentsStore] getSession error:', err);
      return null;
    }
  },

  getMessages: async (sessionId, offset = 0, limit = 100) => {
    try {
      const api = (window as unknown as { electronAPI: { sdkAgent: {
        getMessages: (id: string, offset?: number, limit?: number) => Promise<SerializedSDKMessage[]>;
      }}}).electronAPI.sdkAgent;

      return await api.getMessages(sessionId, offset, limit) as SerializedSDKMessage[];
    } catch (err) {
      console.error('[KuroryuuAgentsStore] getMessages error:', err);
      return [];
    }
  },

  getMessageCount: async (sessionId) => {
    try {
      const api = (window as unknown as { electronAPI: { sdkAgent: {
        getMessageCount: (id: string) => Promise<number>;
      }}}).electronAPI.sdkAgent;

      return await api.getMessageCount(sessionId);
    } catch (err) {
      console.error('[KuroryuuAgentsStore] getMessageCount error:', err);
      return 0;
    }
  },

  getRoles: async () => {
    try {
      const api = (window as unknown as { electronAPI: { sdkAgent: {
        getRoles: () => Promise<Record<string, unknown>>;
      }}}).electronAPI.sdkAgent;

      return await api.getRoles();
    } catch (err) {
      console.error('[KuroryuuAgentsStore] getRoles error:', err);
      return {};
    }
  },

  deleteArchived: async (id) => {
    try {
      await deleteArchivedSession(id);
      const { archivedSessions } = get();
      set({ archivedSessions: archivedSessions.filter(a => a.id !== id) });
    } catch (err) {
      console.error('[KuroryuuAgentsStore] deleteArchived error:', err);
    }
  },

  subscribe: () => {
    if (get().subscribed) return;

    const sdkAgent = (window as unknown as { electronAPI: { sdkAgent: {
      onStatusChange: (cb: (sid: string, status: string) => void) => () => void;
    }}}).electronAPI.sdkAgent;

    // Load current data when panel opens (catches archives made while panel was hidden)
    get().loadArchivedSessions().then(() => get().loadSessions());

    // Subscribe to status changes for live UI refresh only
    const offStatus = sdkAgent.onStatusChange((_sid: string, _status: string) => {
      get().loadSessions();
    });

    cleanupFns = [offStatus];
    set({ subscribed: true });
  },

  unsubscribe: () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
    set({ subscribed: false });
  },
}));

// ---------------------------------------------------------------------------
// Persistent archival listener (app-lifetime, survives panel navigation)
// ---------------------------------------------------------------------------
let archivalInitialized = false;

export function initArchivalListener(): void {
  if (archivalInitialized) return;
  archivalInitialized = true;

  const sdkAgent = (window as unknown as { electronAPI: { sdkAgent: {
    onCompleted: (cb: (sid: string, result: unknown) => void) => () => void;
  }}}).electronAPI?.sdkAgent;

  if (!sdkAgent) {
    console.warn('[KuroryuuAgentsStore] electronAPI.sdkAgent not available, skipping archival listener');
    return;
  }

  // Load archived sessions from IndexedDB on app startup
  useKuroryuuAgentsStore.getState().loadArchivedSessions();

  sdkAgent.onCompleted(async (sid: string, _result: unknown) => {
    console.log(`[KuroryuuAgentsStore] Persistent archival: session completed: ${sid}`);
    await useKuroryuuAgentsStore.getState().loadSessions();

    const session = useKuroryuuAgentsStore.getState().sessions.find(s => s.id === sid);
    if (session) {
      try {
        const archivedData: ArchivedSessionData = {
          id: session.id,
          command: session.prompt,
          workdir: session.cwd,
          pty: !!session.ptyId,
          running: false,
          started_at: new Date(session.startedAt).toISOString(),
          exit_code: session.status === 'completed' ? 0 : 1,
          output_lines: session.numTurns,
        };
        const logs = session.lastMessage || `Session ${session.status}. Cost: $${session.totalCostUsd.toFixed(4)}, Turns: ${session.numTurns}`;
        await archiveSession(archivedData, logs);
        await useKuroryuuAgentsStore.getState().loadArchivedSessions();
        await pruneOldSessions(100);
      } catch (err) {
        console.error('[KuroryuuAgentsStore] Persistent auto-archive failed:', err);
      }
    }
  });

  console.log('[KuroryuuAgentsStore] Persistent archival listener initialized');
}
