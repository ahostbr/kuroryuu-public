/**
 * Command Center Store
 *
 * Manages real-time agents, tool execution, and server health.
 * Integrates with Gateway WebSocket for live updates.
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  CommandCenterState,
  CommandCenterActions,
  CommandCenterStore,
  LiveAgent,
  ToolSchema,
  ToolExecution,
  ServerHealth,
  AgentFilter,
  TabId,
  ToolCategory,
  DEFAULT_SERVERS,
  getToolCategory,
  isLeaderOnlyTool,
} from '../types/command-center';

// Maximum execution history entries
const MAX_EXECUTION_HISTORY = 50;

// Local storage key for execution history persistence
const HISTORY_STORAGE_KEY = 'command-center-execution-history';

// Generate unique execution ID
function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// Load execution history from localStorage
function loadExecutionHistory(): ToolExecution[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parsing errors
  }
  return [];
}

// Save execution history to localStorage
function saveExecutionHistory(history: ToolExecution[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, MAX_EXECUTION_HISTORY)));
  } catch {
    // Ignore storage errors
  }
}

export const useCommandCenterStore = create<CommandCenterStore>()(
  subscribeWithSelector((set, get) => ({
    // ================== INITIAL STATE ==================

    // Connection
    wsConnected: false,
    wsConnectionState: 'disconnected',

    // Agents
    agents: new Map<string, LiveAgent>(),
    selectedAgentId: null,
    agentFilter: 'all',

    // Tools
    tools: [],
    toolsLoading: false,
    selectedToolName: null,
    toolArgs: {},
    executionHistory: loadExecutionHistory(),
    currentExecution: null,
    selectedCategory: 'all',

    // Servers
    servers: DEFAULT_SERVERS,
    selectedServerId: null,

    // UI State
    activeTab: 'agents',
    isInitialized: false,
    error: null,

    // ================== INITIALIZATION ==================

    initialize: async () => {
      const { isInitialized, pingAllServers, loadTools } = get();
      if (isInitialized) return;

      set({ error: null });

      try {
        // Ping servers in parallel
        await pingAllServers();

        // Load tools from MCP
        await loadTools();

        set({ isInitialized: true });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to initialize Command Center',
        });
      }
    },

    cleanup: () => {
      set({
        isInitialized: false,
        wsConnected: false,
        wsConnectionState: 'disconnected',
        agents: new Map(),
        selectedAgentId: null,
        currentExecution: null,
      });
    },

    // ================== WEBSOCKET EVENT HANDLERS ==================

    handleAgentRegistered: (agent: LiveAgent) => {
      const { agents } = get();
      const newAgents = new Map(agents);
      newAgents.set(agent.id, agent);
      set({ agents: newAgents });
    },

    handleAgentHeartbeat: (agentId: string, timestamp: string) => {
      const { agents } = get();
      const agent = agents.get(agentId);
      if (agent) {
        const newAgents = new Map(agents);
        newAgents.set(agentId, { ...agent, lastHeartbeat: timestamp });
        set({ agents: newAgents });
      }
    },

    handleAgentStatusChange: (agentId: string, _oldStatus: string, newStatus: string) => {
      const { agents } = get();
      const agent = agents.get(agentId);
      if (agent) {
        const newAgents = new Map(agents);
        newAgents.set(agentId, {
          ...agent,
          status: newStatus as LiveAgent['status'],
        });
        set({ agents: newAgents });
      }
    },

    handleAgentDeregistered: (agentId: string) => {
      const { agents, selectedAgentId } = get();
      const newAgents = new Map(agents);
      newAgents.delete(agentId);

      set({
        agents: newAgents,
        // Clear selection if the deregistered agent was selected
        selectedAgentId: selectedAgentId === agentId ? null : selectedAgentId,
      });
    },

    handleStatsUpdate: (_stats: Record<string, unknown>) => {
      // Stats can be used for dashboard metrics in the future
    },

    setWsConnectionState: (state: 'disconnected' | 'connecting' | 'connected') => {
      set({
        wsConnectionState: state,
        wsConnected: state === 'connected',
      });
    },

    // ================== AGENT ACTIONS ==================

    selectAgent: (agentId: string | null) => {
      set({ selectedAgentId: agentId });
    },

    setAgentFilter: (filter: AgentFilter) => {
      set({ agentFilter: filter });
    },

    refreshAgents: async () => {
      // Agents are refreshed via WebSocket in real-time
      // This function is a no-op since we don't have a REST endpoint for listing agents
      // The WebSocket connection will provide agent updates automatically
      // If we need to refresh, the WebSocket reconnection will re-sync state
    },

    // ================== TOOL ACTIONS ==================

    selectTool: (toolName: string | null) => {
      set({
        selectedToolName: toolName,
        toolArgs: {}, // Reset args when selecting a new tool
      });
    },

    setToolArg: (key: string, value: unknown) => {
      const { toolArgs } = get();
      set({
        toolArgs: { ...toolArgs, [key]: value },
      });
    },

    resetToolArgs: () => {
      set({ toolArgs: {} });
    },

    executeTool: async () => {
      const { selectedToolName, toolArgs, executionHistory } = get();
      if (!selectedToolName) return;

      const executionId = generateExecutionId();
      const execution: ToolExecution = {
        id: executionId,
        toolName: selectedToolName,
        args: { ...toolArgs },
        status: 'running',
        startTime: new Date().toISOString(),
      };

      set({ currentExecution: execution });

      try {
        // Execute tool via MCP IPC
        const result = await window.electronAPI.mcp.call(selectedToolName, toolArgs);

        const completedExecution: ToolExecution = {
          ...execution,
          status: result.error ? 'error' : 'success',
          endTime: new Date().toISOString(),
          result: result.error ? undefined : result,
          error: result.error,
          durationMs: Date.now() - new Date(execution.startTime).getTime(),
        };

        const newHistory = [completedExecution, ...executionHistory].slice(0, MAX_EXECUTION_HISTORY);
        saveExecutionHistory(newHistory);

        set({
          currentExecution: completedExecution,
          executionHistory: newHistory,
        });
      } catch (error) {
        const failedExecution: ToolExecution = {
          ...execution,
          status: 'error',
          endTime: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Execution failed',
          durationMs: Date.now() - new Date(execution.startTime).getTime(),
        };

        const newHistory = [failedExecution, ...executionHistory].slice(0, MAX_EXECUTION_HISTORY);
        saveExecutionHistory(newHistory);

        set({
          currentExecution: failedExecution,
          executionHistory: newHistory,
        });
      }
    },

    clearExecutionHistory: () => {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
      set({ executionHistory: [] });
    },

    loadTools: async () => {
      set({ toolsLoading: true });

      try {
        const result = await window.electronAPI.mcp.tools();

        if (result.tools && Array.isArray(result.tools)) {
          type RawTool = { name: string; description?: string; inputSchema?: ToolSchema['inputSchema'] };
          const tools: ToolSchema[] = (result.tools as RawTool[]).map((tool) => ({
            name: tool.name,
            description: tool.description || '',
            category: getToolCategory(tool.name),
            inputSchema: tool.inputSchema || { type: 'object' as const, properties: {} },
            leaderOnly: isLeaderOnlyTool(tool.name),
          }));

          set({ tools, toolsLoading: false });
        } else {
          set({ toolsLoading: false });
        }
      } catch (error) {
        set({
          toolsLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load tools',
        });
      }
    },

    setSelectedCategory: (category: ToolCategory | 'all') => {
      set({ selectedCategory: category });
    },

    // ================== SERVER ACTIONS ==================

    selectServer: (serverId: string | null) => {
      set({ selectedServerId: serverId });
    },

    pingServer: async (serverId: string) => {
      const { servers } = get();
      const serverIndex = servers.findIndex((s) => s.id === serverId);
      if (serverIndex === -1) return;

      // Set connecting status
      const connectingServers = [...servers];
      connectingServers[serverIndex] = {
        ...connectingServers[serverIndex],
        status: 'connecting',
      };
      set({ servers: connectingServers });

      const startTime = Date.now();

      try {
        let isHealthy = false;
        let toolCount: number | undefined;
        let metricValue: number | undefined;

        if (serverId === 'mcp-core') {
          const result = await window.electronAPI.mcp.health();
          isHealthy = result.ok;
          toolCount = result.tools_count;
          metricValue = result.tools_count;
        } else if (serverId === 'gateway') {
          const result = await window.electronAPI.gateway.health();
          isHealthy = result.ok;
          // Fetch agent count from system stats
          if (isHealthy) {
            try {
              const statsRes = await fetch('http://127.0.0.1:8200/v1/system/stats', {
                signal: AbortSignal.timeout(2000),
              });
              if (statsRes.ok) {
                const stats = await statsRes.json();
                metricValue = stats.agents?.total ?? stats.agents?.alive ?? 0;
              }
            } catch { /* Stats fetch failed, ignore */ }
          }
        } else if (serverId === 'pty-daemon') {
          const result = await window.electronAPI.services.getPtyDaemonHealth();
          isHealthy = result.ok;
          // Fetch session count from pty:list
          if (isHealthy) {
            try {
              const sessions = await window.electronAPI.pty.list();
              metricValue = Array.isArray(sessions) ? sessions.length : 0;
            } catch { /* List fetch failed, ignore */ }
          }
        } else if (serverId === 'cliproxy') {
          // CLIProxyAPI: Direct HTTP health check (no IPC needed)
          try {
            const response = await fetch('http://127.0.0.1:8317/v1/models', {
              headers: { 'Authorization': 'Bearer kuroryuu-local-key' },
              signal: AbortSignal.timeout(3000),
            });
            if (response.ok) {
              const data = await response.json();
              const models = data.data || [];
              isHealthy = true;
              metricValue = models.length; // Number of models available
            } else {
              isHealthy = false;
            }
          } catch {
            // API not responding - container likely not running
            const updatedServers = [...get().servers];
            updatedServers[serverIndex] = {
              ...updatedServers[serverIndex],
              status: 'disconnected',
              lastPing: new Date().toISOString(),
              responseTimeMs: Date.now() - startTime,
              error: 'Container not responding',
            };
            set({ servers: updatedServers });
            return;
          }
        } else if (serverId === 'clawdbot') {
          // Clawdbot: Direct HTTP health check first, then fall back to IPC status
          try {
            const response = await fetch('http://localhost:18790/health', {
              signal: AbortSignal.timeout(3000),
            });
            if (response.ok) {
              isHealthy = true;
            } else {
              isHealthy = false;
            }
          } catch {
            // API not responding - check IPC status for more info
            try {
              const status = await window.electronAPI.clawdbot.status();
              const updatedServers = [...get().servers];
              let errorMsg = 'Not responding';
              if (!status.enabled) errorMsg = 'Disabled (opt-in)';
              else if (!status.dockerAvailable) errorMsg = 'Docker not available';
              else if (!status.containerRunning) errorMsg = status.containerExists ? 'Container stopped' : 'Container not created';

              updatedServers[serverIndex] = {
                ...updatedServers[serverIndex],
                status: 'disconnected',
                lastPing: new Date().toISOString(),
                responseTimeMs: Date.now() - startTime,
                error: errorMsg,
              };
              set({ servers: updatedServers });
            } catch {
              const updatedServers = [...get().servers];
              updatedServers[serverIndex] = {
                ...updatedServers[serverIndex],
                status: 'disconnected',
                lastPing: new Date().toISOString(),
                responseTimeMs: Date.now() - startTime,
                error: 'Not responding',
              };
              set({ servers: updatedServers });
            }
            return;
          }
        }

        const responseTimeMs = Date.now() - startTime;

        const updatedServers = [...get().servers];
        updatedServers[serverIndex] = {
          ...updatedServers[serverIndex],
          status: isHealthy ? 'connected' : 'disconnected',
          lastPing: new Date().toISOString(),
          responseTimeMs,
          toolCount,
          metricValue,
          error: undefined,
        };
        set({ servers: updatedServers });
      } catch (error) {
        const updatedServers = [...get().servers];
        updatedServers[serverIndex] = {
          ...updatedServers[serverIndex],
          status: 'error',
          lastPing: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Ping failed',
        };
        set({ servers: updatedServers });
      }
    },

    pingAllServers: async () => {
      const { servers, pingServer } = get();
      await Promise.all(servers.map((server) => pingServer(server.id)));
    },

    restartServer: async (serverId: string) => {
      const { servers, pingServer } = get();
      const serverIndex = servers.findIndex((s) => s.id === serverId);
      if (serverIndex === -1) return { ok: false, error: 'Unknown server' };

      // Set restarting status (using connecting since there's no specific status for restart)
      const restartingServers = [...servers];
      restartingServers[serverIndex] = {
        ...restartingServers[serverIndex],
        status: 'connecting',
        error: undefined,
      };
      set({ servers: restartingServers });

      try {
        let result: { ok: boolean; error?: string };

        if (serverId === 'mcp-core') {
          result = await window.electronAPI.services.restartMcp();
        } else if (serverId === 'gateway') {
          result = await window.electronAPI.services.restartGateway();
        } else if (serverId === 'pty-daemon') {
          result = await window.electronAPI.services.restartPtyDaemon();
        } else if (serverId === 'cliproxy') {
          // CLIProxyAPI: Stop then start via docker compose
          await window.electronAPI.cliproxy.container.stop();
          await new Promise((r) => setTimeout(r, 1000));
          const startResult = await window.electronAPI.cliproxy.container.start();
          result = { ok: startResult.success, error: startResult.error };
        } else if (serverId === 'clawdbot') {
          // Clawdbot: Stop then start container
          await window.electronAPI.clawdbot.stop();
          await new Promise((r) => setTimeout(r, 1000));
          result = await window.electronAPI.clawdbot.start();
        } else {
          return { ok: false, error: 'Unknown server' };
        }

        if (result.ok) {
          // Ping to update status after restart
          await pingServer(serverId);
          return { ok: true };
        } else {
          const updatedServers = [...get().servers];
          updatedServers[serverIndex] = {
            ...updatedServers[serverIndex],
            status: 'error',
            error: result.error || 'Restart failed',
          };
          set({ servers: updatedServers });
          return result;
        }
      } catch (error) {
        const updatedServers = [...get().servers];
        updatedServers[serverIndex] = {
          ...updatedServers[serverIndex],
          status: 'error',
          error: error instanceof Error ? error.message : 'Restart failed',
        };
        set({ servers: updatedServers });
        return { ok: false, error: error instanceof Error ? error.message : 'Restart failed' };
      }
    },

    // ================== UI ACTIONS ==================

    setActiveTab: (tab: TabId) => {
      set({ activeTab: tab });
    },

    setError: (error: string | null) => {
      set({ error });
    },
  }))
);

// ================== SELECTOR HOOKS ==================

export const useAgents = () => useCommandCenterStore((s) => s.agents);
export const useSelectedAgent = () => {
  const agents = useCommandCenterStore((s) => s.agents);
  const selectedAgentId = useCommandCenterStore((s) => s.selectedAgentId);
  return selectedAgentId ? agents.get(selectedAgentId) : null;
};
export const useAgentFilter = () => useCommandCenterStore((s) => s.agentFilter);

export const useTools = () => useCommandCenterStore((s) => s.tools);
export const useSelectedTool = () => {
  const tools = useCommandCenterStore((s) => s.tools);
  const selectedToolName = useCommandCenterStore((s) => s.selectedToolName);
  return tools.find((t) => t.name === selectedToolName);
};
export const useToolArgs = () => useCommandCenterStore((s) => s.toolArgs);
export const useCurrentExecution = () => useCommandCenterStore((s) => s.currentExecution);
export const useExecutionHistory = () => useCommandCenterStore((s) => s.executionHistory);

export const useServers = () => useCommandCenterStore((s) => s.servers);
export const useWsConnected = () => useCommandCenterStore((s) => s.wsConnected);
export const useWsConnectionState = () => useCommandCenterStore((s) => s.wsConnectionState);
export const useActiveTab = () => useCommandCenterStore((s) => s.activeTab);

// Filtered agents selector
export const useFilteredAgents = () => {
  const agents = useCommandCenterStore((s) => s.agents);
  const filter = useCommandCenterStore((s) => s.agentFilter);

  const agentList = Array.from(agents.values());

  switch (filter) {
    case 'leader':
      return agentList.filter((a) => a.role === 'leader');
    case 'worker':
      return agentList.filter((a) => a.role === 'worker');
    case 'idle':
      return agentList.filter((a) => a.status === 'idle');
    case 'busy':
      return agentList.filter((a) => a.status === 'busy');
    default:
      return agentList;
  }
};

// Filtered tools selector
export const useFilteredTools = () => {
  const tools = useCommandCenterStore((s) => s.tools);
  const category = useCommandCenterStore((s) => s.selectedCategory);

  if (category === 'all') {
    return tools;
  }

  return tools.filter((t) => t.category === category);
};
