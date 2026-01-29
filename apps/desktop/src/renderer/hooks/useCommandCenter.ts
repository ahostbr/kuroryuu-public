/**
 * Command Center Composite Hook
 *
 * Connects the Command Center store to the Gateway WebSocket
 * for real-time agent updates.
 */
import { useEffect, useCallback } from 'react';
import { useGatewayWebSocket } from './useGatewayWebSocket';
import type { WebSocketMessage } from '../lib/websocket-client';
import {
  useCommandCenterStore,
  useFilteredAgents,
  useFilteredTools,
} from '../stores/command-center-store';
import type {
  LiveAgent,
  AgentStatus,
  AgentRole,
  ToolSchema,
  ToolExecution,
  ServerHealth,
  TabId,
  ToolCategory,
} from '../types/command-center';

export interface UseCommandCenterReturn {
  // Connection state
  isConnected: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected';

  // Store state (re-exported for convenience)
  agents: LiveAgent[];
  selectedAgentId: string | null;
  agentFilter: 'all' | 'leader' | 'worker' | 'idle' | 'busy';
  tools: ToolSchema[];
  selectedToolName: string | null;
  toolArgs: Record<string, unknown>;
  currentExecution: ToolExecution | null;
  executionHistory: ToolExecution[];
  servers: ServerHealth[];
  activeTab: TabId;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  cleanup: () => void;
  selectAgent: (agentId: string | null) => void;
  setAgentFilter: (filter: 'all' | 'leader' | 'worker' | 'idle' | 'busy') => void;
  refreshAgents: () => Promise<void>;
  selectTool: (toolName: string | null) => void;
  setToolArg: (key: string, value: unknown) => void;
  resetToolArgs: () => void;
  executeTool: () => Promise<void>;
  clearExecutionHistory: () => void;
  loadTools: () => Promise<void>;
  setSelectedCategory: (category: ToolCategory | 'all') => void;
  pingServer: (serverId: string) => Promise<void>;
  pingAllServers: () => Promise<void>;
  restartServer: (serverId: string) => Promise<{ ok: boolean; error?: string }>;
  setActiveTab: (tab: TabId) => void;
  setError: (error: string | null) => void;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
}

/**
 * Main hook for the Command Center component.
 * Handles WebSocket connection and syncs events to the store.
 *
 * @param autoConnect - Whether to automatically connect WebSocket on mount (default: true)
 */
export function useCommandCenter(autoConnect = true): UseCommandCenterReturn {
  // Get WebSocket connection
  const {
    isConnected,
    connectionState,
    subscribe,
    connect: wsConnect,
    disconnect: wsDisconnect,
  } = useGatewayWebSocket(autoConnect);

  // Get store state and actions
  const store = useCommandCenterStore();
  const filteredAgents = useFilteredAgents();
  const filteredTools = useFilteredTools();

  // Sync WebSocket connection state to store
  useEffect(() => {
    store.setWsConnectionState(connectionState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState]); // store actions are stable, don't include in deps

  // Subscribe to agent events from WebSocket
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Agent registered
    unsubscribers.push(
      subscribe('agent_registered', (data: WebSocketMessage) => {
        if (data.agent) {
          const agent = data.agent as {
            id?: string;
            agent_id?: string;
            role?: string;
            status?: string;
            registered_at?: string;
            last_heartbeat?: string;
          };
          store.handleAgentRegistered({
            id: agent.id || agent.agent_id || 'unknown',
            role: (agent.role || 'worker') as AgentRole,
            status: (agent.status || 'idle') as AgentStatus,
            registeredAt: agent.registered_at || new Date().toISOString(),
            lastHeartbeat: agent.last_heartbeat || new Date().toISOString(),
          });
        }
      })
    );

    // Agent heartbeat
    unsubscribers.push(
      subscribe('agent_heartbeat', (data: WebSocketMessage) => {
        if (data.agent_id) {
          store.handleAgentHeartbeat(
            data.agent_id as string,
            (data.timestamp as string) || new Date().toISOString()
          );
        }
      })
    );

    // Agent status change
    unsubscribers.push(
      subscribe('agent_status_change', (data: WebSocketMessage) => {
        if (data.agent_id) {
          store.handleAgentStatusChange(
            data.agent_id as string,
            (data.old_status as string) || 'idle',
            (data.new_status as string) || 'idle'
          );
        }
      })
    );

    // Agent deregistered
    unsubscribers.push(
      subscribe('agent_deregistered', (data: WebSocketMessage) => {
        if (data.agent_id) {
          store.handleAgentDeregistered(data.agent_id as string);
        }
      })
    );

    // Stats update
    unsubscribers.push(
      subscribe('stats_update', (data: WebSocketMessage) => {
        if (data.stats) {
          store.handleStatsUpdate(data.stats as Record<string, unknown>);
        }
      })
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe]); // store actions are stable, don't include in deps

  // Initialize on mount
  useEffect(() => {
    if (!store.isInitialized) {
      store.initialize();
    }

    return () => {
      // Don't cleanup on unmount to preserve state across tab switches
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount, store actions are stable

  // Memoized action wrappers
  const connectWebSocket = useCallback(() => {
    wsConnect();
  }, [wsConnect]);

  const disconnectWebSocket = useCallback(() => {
    wsDisconnect();
  }, [wsDisconnect]);

  return {
    // Connection state
    isConnected,
    connectionState,

    // Store state
    agents: filteredAgents,
    selectedAgentId: store.selectedAgentId,
    agentFilter: store.agentFilter,
    tools: filteredTools,
    selectedToolName: store.selectedToolName,
    toolArgs: store.toolArgs,
    currentExecution: store.currentExecution,
    executionHistory: store.executionHistory,
    servers: store.servers,
    activeTab: store.activeTab,
    isInitialized: store.isInitialized,
    error: store.error,

    // Actions
    initialize: store.initialize,
    cleanup: store.cleanup,
    selectAgent: store.selectAgent,
    setAgentFilter: store.setAgentFilter,
    refreshAgents: store.refreshAgents,
    selectTool: store.selectTool,
    setToolArg: store.setToolArg,
    resetToolArgs: store.resetToolArgs,
    executeTool: store.executeTool,
    clearExecutionHistory: store.clearExecutionHistory,
    loadTools: store.loadTools,
    setSelectedCategory: store.setSelectedCategory,
    pingServer: store.pingServer,
    pingAllServers: store.pingAllServers,
    restartServer: store.restartServer,
    setActiveTab: store.setActiveTab,
    setError: store.setError,
    connectWebSocket,
    disconnectWebSocket,
  };
}

/**
 * Hook for tool execution only.
 * Lighter weight hook for components that only need tool execution.
 */
export function useToolExecution() {
  const store = useCommandCenterStore();
  const filteredTools = useFilteredTools();

  return {
    tools: filteredTools,
    selectedToolName: store.selectedToolName,
    toolArgs: store.toolArgs,
    currentExecution: store.currentExecution,
    executionHistory: store.executionHistory,
    isLoading: store.toolsLoading,
    selectedCategory: store.selectedCategory,

    selectTool: store.selectTool,
    setToolArg: store.setToolArg,
    resetToolArgs: store.resetToolArgs,
    executeTool: store.executeTool,
    clearExecutionHistory: store.clearExecutionHistory,
    loadTools: store.loadTools,
    setSelectedCategory: store.setSelectedCategory,
  };
}

export default useCommandCenter;
