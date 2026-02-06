/**
 * Coding Agents Store - Manages background coding agent sessions
 *
 * Polls k_process(action="list") to get session state from MCP server.
 * Archives completed sessions to IndexedDB for persistence across restarts.
 */
import { create } from 'zustand';
import {
  archiveSession,
  loadArchivedSessions,
  deleteArchivedSession,
  pruneOldSessions,
  type ArchivedSession,
} from './coding-agents-persistence';

export interface CodingAgentSession {
  id: string;
  command: string;
  workdir: string;
  pty: boolean;
  running: boolean;
  started_at: string;
  exit_code: number | null;
  output_lines: number;
  // Wave metadata for /max-subagents-parallel grouping
  wave_id?: string;
  dependency_ids?: string[];
}

interface CodingAgentsState {
  sessions: CodingAgentSession[];
  archivedSessions: ArchivedSession[];
  selectedSessionId: string | null;
  isLoading: boolean;
  error: string | null;
  pollingInterval: NodeJS.Timeout | null;
  previousSessionIds: Set<string>; // Track running sessions to detect completion

  // Actions
  loadSessions: () => Promise<void>;
  loadArchivedSessions: () => Promise<void>;
  selectSession: (id: string | null) => void;
  killSession: (id: string) => Promise<boolean>;
  sendInput: (id: string, data: string) => Promise<boolean>;
  getSessionLog: (id: string, offset?: number, limit?: number) => Promise<string>;
  getArchivedLog: (id: string) => string | null;
  deleteArchived: (id: string) => Promise<void>;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
}

// Gateway proxy endpoint for MCP calls
const GATEWAY_MCP_URL = 'http://127.0.0.1:8200/v1/mcp/call';

async function mcpCall(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(GATEWAY_MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: toolName,
      arguments: args,
    }),
  });

  if (!response.ok) {
    throw new Error(`Gateway error: ${response.status}`);
  }

  const data = await response.json();

  // Gateway returns { result: "..." } where result is JSON string
  const result = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  return result;
}

export const useCodingAgentsStore = create<CodingAgentsState>((set, get) => ({
  sessions: [],
  archivedSessions: [],
  selectedSessionId: null,
  isLoading: false,
  error: null,
  pollingInterval: null,
  previousSessionIds: new Set<string>(),

  loadSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await mcpCall('k_process', { action: 'list' }) as {
        ok: boolean;
        sessions: CodingAgentSession[];
        error?: string;
      };

      if (!result.ok) {
        throw new Error(result.error || 'Failed to load sessions');
      }

      const liveSessions = result.sessions || [];
      const { previousSessionIds, archivedSessions } = get();

      // Detect sessions that just completed (were running, now stopped)
      const currentIds = new Set(liveSessions.map(s => s.id));
      const completedSessions = liveSessions.filter(s =>
        !s.running && previousSessionIds.has(s.id) &&
        !archivedSessions.some(a => a.id === s.id)
      );

      // Archive newly completed sessions
      for (const session of completedSessions) {
        try {
          // Fetch final logs before archiving
          const logResult = await mcpCall('k_process', {
            action: 'log',
            sessionId: session.id,
            offset: 0,
            limit: 5000,
          }) as { ok: boolean; output?: string };

          const logs = logResult.ok ? (logResult.output || '') : '';
          await archiveSession(session, logs);
          console.log(`[CodingAgentsStore] Auto-archived session: ${session.id}`);
        } catch (archiveErr) {
          console.error('[CodingAgentsStore] Failed to archive session:', archiveErr);
        }
      }

      // Update previous IDs for next comparison (only running sessions)
      const runningIds = new Set(liveSessions.filter(s => s.running).map(s => s.id));

      // Reload archived sessions if we archived anything
      if (completedSessions.length > 0) {
        await get().loadArchivedSessions();
        // Prune old sessions
        await pruneOldSessions(100);
      }

      set({
        sessions: liveSessions,
        isLoading: false,
        previousSessionIds: runningIds,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ error: message, isLoading: false });
      console.error('[CodingAgentsStore] loadSessions error:', err);
    }
  },

  loadArchivedSessions: async () => {
    try {
      const archived = await loadArchivedSessions();
      set({ archivedSessions: archived });
    } catch (err) {
      console.error('[CodingAgentsStore] loadArchivedSessions error:', err);
    }
  },

  selectSession: (id) => {
    set({ selectedSessionId: id });
  },

  killSession: async (id) => {
    try {
      const result = await mcpCall('k_process', { action: 'kill', sessionId: id }) as {
        ok: boolean;
        error?: string;
      };

      if (!result.ok) {
        console.error('[CodingAgentsStore] killSession error:', result.error);
        return false;
      }

      // Refresh sessions list
      await get().loadSessions();
      return true;
    } catch (err) {
      console.error('[CodingAgentsStore] killSession error:', err);
      return false;
    }
  },

  sendInput: async (id, data) => {
    try {
      const result = await mcpCall('k_process', {
        action: 'submit',
        sessionId: id,
        data
      }) as { ok: boolean; error?: string };

      if (!result.ok) {
        console.error('[CodingAgentsStore] sendInput error:', result.error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[CodingAgentsStore] sendInput error:', err);
      return false;
    }
  },

  getSessionLog: async (id, offset = 0, limit = 500) => {
    try {
      const result = await mcpCall('k_process', {
        action: 'log',
        sessionId: id,
        offset,
        limit,
      }) as { ok: boolean; output?: string; error?: string };

      if (!result.ok) {
        console.error('[CodingAgentsStore] getSessionLog error:', result.error);
        return '';
      }
      return result.output || '';
    } catch (err) {
      console.error('[CodingAgentsStore] getSessionLog error:', err);
      return '';
    }
  },

  getArchivedLog: (id) => {
    const { archivedSessions } = get();
    const archived = archivedSessions.find(a => a.id === id);
    return archived?.logs || null;
  },

  deleteArchived: async (id) => {
    try {
      await deleteArchivedSession(id);
      const { archivedSessions } = get();
      set({ archivedSessions: archivedSessions.filter(a => a.id !== id) });
    } catch (err) {
      console.error('[CodingAgentsStore] deleteArchived error:', err);
    }
  },

  startPolling: (intervalMs = 5000) => {
    const { pollingInterval, loadSessions, loadArchivedSessions } = get();

    // Clear existing interval if any
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    // Initial load - archived first, then live
    loadArchivedSessions().then(() => loadSessions());

    // Start polling
    const interval = setInterval(() => {
      loadSessions();
    }, intervalMs);

    set({ pollingInterval: interval });
  },

  stopPolling: () => {
    const { pollingInterval } = get();
    if (pollingInterval) {
      clearInterval(pollingInterval);
      set({ pollingInterval: null });
    }
  },
}));
