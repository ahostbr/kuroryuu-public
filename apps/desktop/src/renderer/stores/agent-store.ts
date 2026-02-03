/**
 * Agent Store - Zustand store for Multi-Agent Message Bus (M5)
 *
 * Manages:
 * - Agent registry state
 * - Inbox messages (via k_inbox)
 * - Polling for live updates
 *
 * NOTE: Orchestration task polling has been REMOVED.
 * Tasks are now managed via ai/todo.md (see task-store.ts for Kanban).
 */
import { create } from 'zustand';
import type {
  Agent,
  AgentRegistryStats,
  InboxMessage,
  InboxStats,
} from '../types/agents';

const GATEWAY_URL = 'http://127.0.0.1:8200';
const POLL_INTERVAL = 5000; // 5 seconds

interface AgentState {
  // Agent Registry
  agents: Agent[];
  agentStats: AgentRegistryStats | null;

  // Inbox
  inboxMessages: InboxMessage[];
  inboxStats: InboxStats | null;

  // UI State
  isLoading: boolean;
  error: string | null;
  pollInterval: ReturnType<typeof setInterval> | null;

  // Actions
  fetchAgents: () => Promise<void>;
  fetchInbox: () => Promise<void>;
  fetchAll: () => Promise<void>;

  killAgent: (agentId: string) => Promise<void>;

  startPolling: () => void;
  stopPolling: () => void;

  clearError: () => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  // Initial state
  agents: [],
  agentStats: null,
  inboxMessages: [],
  inboxStats: null,
  isLoading: false,
  error: null,
  pollInterval: null,
  
  // Fetch agents from registry
  fetchAgents: async () => {
    try {
      const [agentsRes, statsRes] = await Promise.all([
        fetch(`${GATEWAY_URL}/v1/agents/list?include_dead=true`),
        fetch(`${GATEWAY_URL}/v1/agents/stats`),
      ]);

      if (!agentsRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch agents');
      }

      const agentsData = await agentsRes.json();
      const statsData = await statsRes.json();

      // DEBUG: Log fetched agents
      console.log(`[AgentStore] Fetched ${agentsData.agents?.length || 0} agents:`, agentsData.agents?.map((a: { agent_id: string }) => a.agent_id));

      set({
        agents: agentsData.agents || [],
        agentStats: statsData,
      });
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      // Don't set error for polling failures - just log
    }
  },
  
  // Fetch inbox messages
  fetchInbox: async () => {
    try {
      const [inboxRes, statsRes] = await Promise.all([
        fetch(`${GATEWAY_URL}/v1/inbox/list?limit=50`),
        fetch(`${GATEWAY_URL}/v1/inbox/stats`),
      ]);

      if (!inboxRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch inbox');
      }

      const inboxData = await inboxRes.json();
      const statsData = await statsRes.json();

      set({
        inboxMessages: inboxData.messages || [],
        inboxStats: statsData,
      });
    } catch (err) {
      console.error('Failed to fetch inbox:', err);
    }
  },

  // NOTE: fetchTasks() REMOVED - tasks are managed via ai/todo.md
  // Use task-store.ts for Kanban board task management

  // Fetch all data (agents + inbox only)
  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      await Promise.all([get().fetchAgents(), get().fetchInbox()]);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      set({ isLoading: false });
    }
  },
  
  // Kill (deregister) an agent (silent on 404 - agent already gone)
  killAgent: async (agentId: string) => {
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/agents/${agentId}`, {
        method: 'DELETE',
      });

      // 404 means already deleted - that's fine, just refresh the list
      if (!res.ok && res.status !== 404) {
        throw new Error('Failed to kill agent');
      }

      // Refresh agents list
      await get().fetchAgents();
    } catch {
      // Network error or actual failure - fail silently, just refresh
      await get().fetchAgents();
    }
  },
  
  // Start polling for live updates
  startPolling: () => {
    const { pollInterval } = get();
    if (pollInterval) return; // Already polling
    
    // Initial fetch
    get().fetchAll();
    
    // Start interval
    const interval = setInterval(() => {
      get().fetchAll();
    }, POLL_INTERVAL);
    
    set({ pollInterval: interval });
  },
  
  // Stop polling
  stopPolling: () => {
    const { pollInterval } = get();
    if (pollInterval) {
      clearInterval(pollInterval);
      set({ pollInterval: null });
    }
  },
  
  // Clear error
  clearError: () => set({ error: null }),
}));
