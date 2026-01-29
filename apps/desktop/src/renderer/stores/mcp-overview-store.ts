/**
 * MCP Overview Store
 * Manages agents, MCP servers, and tools state
 * Connects to Kuroryuu's MCP_CORE (port 8100) and Gateway (port 8200)
 */
import { create } from 'zustand';
import {
  MCPOverviewState,
  AgentInfo,
  MCPServer,
  MCPTool,
  DEFAULT_AGENTS,
  DEFAULT_SERVERS,
  DEFAULT_TOOLS,
} from '../types/mcp-overview';

interface MCPOverviewActions {
  // Initialization
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;

  // Agent actions
  selectAgent: (agentId: string | null) => void;
  updateAgentStatus: (agentId: string, status: AgentInfo['status']) => void;

  // Server actions
  selectServer: (serverId: string | null) => void;
  toggleServer: (serverId: string) => void;
  updateServerStatus: (serverId: string, status: MCPServer['status'], error?: string) => void;
  pingServer: (serverId: string) => Promise<void>;
  pingAllServers: () => Promise<void>;

  // Tool actions
  toggleTool: (toolName: string) => void;
  getToolsForAgent: (agentId: string) => MCPTool[];
  loadToolsFromMCP: () => Promise<void>;

  // State
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

type MCPOverviewStore = MCPOverviewState & MCPOverviewActions;

export const useMCPOverviewStore = create<MCPOverviewStore>((set, get) => ({
  // Initial state
  agents: DEFAULT_AGENTS,
  servers: DEFAULT_SERVERS,
  tools: DEFAULT_TOOLS,
  selectedAgent: null,
  selectedServer: null,
  isInitialized: false,
  isLoading: false,
  error: null,

  // Initialization
  initialize: async () => {
    const { isInitialized, isLoading, pingAllServers, loadToolsFromMCP } = get();
    if (isInitialized || isLoading) return;

    set({ isLoading: true, error: null });
    
    try {
      // Ping servers to check their status
      await pingAllServers();
      
      // Load tools from MCP_CORE if available
      await loadToolsFromMCP();
      
      set({
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize MCP',
        isLoading: false,
      });
    }
  },

  refresh: async () => {
    const { pingAllServers, loadToolsFromMCP } = get();
    set({ isLoading: true, error: null });
    
    try {
      await pingAllServers();
      await loadToolsFromMCP();
      
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to refresh MCP',
        isLoading: false,
      });
    }
  },

  // Ping all servers to check their status
  pingAllServers: async () => {
    const { servers } = get();
    
    // Ping each server
    const updatedServers = await Promise.all(
      servers.map(async (server) => {
        try {
          let isHealthy = false;
          
          if (server.id === 'mcp-core') {
            // Check MCP_CORE health
            const result = await window.electronAPI.mcp.health();
            isHealthy = result.ok;
          } else if (server.id === 'mcp-gateway') {
            // Check Gateway health
            const result = await window.electronAPI.gateway.health();
            isHealthy = result.ok;
          }
          
          return {
            ...server,
            status: isHealthy ? 'connected' as const : 'disconnected' as const,
            lastPing: Date.now(),
            error: undefined,
          };
        } catch (error) {
          return {
            ...server,
            status: 'error' as const,
            lastPing: Date.now(),
            error: error instanceof Error ? error.message : 'Ping failed',
          };
        }
      })
    );
    
    set({ servers: updatedServers });
  },

  // Load tools from MCP_CORE
  loadToolsFromMCP: async () => {
    try {
      const result = await window.electronAPI.mcp.tools();
      
      if (result.tools && Array.isArray(result.tools)) {
        // Map MCP tools to our format
        const mcpTools: MCPTool[] = (result.tools as Array<{ name?: string; description?: string }>).map((tool) => {
          const name = tool.name || 'unknown';
          const category = name.split('.')[0] as MCPTool['category'];
          
          return {
            name,
            description: tool.description || '',
            category: ['inbox', 'checkpoint', 'rag'].includes(category) ? category : 'other',
            enabled: true,
            server: 'mcp-core',
          };
        });
        
        // Merge with existing tools (keep defaults for categories not in MCP)
        const { tools: existingTools } = get();
        const mcpToolNames = new Set(mcpTools.map(t => t.name));
        const nonMcpTools = existingTools.filter(t => !mcpToolNames.has(t.name));
        
        set({ tools: [...mcpTools, ...nonMcpTools] });
      }
    } catch {
      // Keep default tools if MCP is unavailable
    }
  },

  // Agent actions
  selectAgent: (agentId) => set({ selectedAgent: agentId }),

  updateAgentStatus: (agentId, status) => {
    const { agents } = get();
    set({
      agents: agents.map((agent) =>
        agent.id === agentId ? { ...agent, status } : agent
      ),
    });
  },

  // Server actions
  selectServer: (serverId) => set({ selectedServer: serverId }),

  toggleServer: (serverId) => {
    const { servers } = get();
    set({
      servers: servers.map((server) =>
        server.id === serverId ? { ...server, enabled: !server.enabled } : server
      ),
    });
  },

  updateServerStatus: (serverId, status, error) => {
    const { servers } = get();
    set({
      servers: servers.map((server) =>
        server.id === serverId ? { ...server, status, error } : server
      ),
    });
  },

  pingServer: async (serverId) => {
    const { updateServerStatus } = get();
    
    updateServerStatus(serverId, 'connecting');
    
    try {
      let isHealthy = false;
      
      if (serverId === 'mcp-core') {
        const result = await window.electronAPI.mcp.health();
        isHealthy = result.ok;
      } else if (serverId === 'mcp-gateway') {
        const result = await window.electronAPI.gateway.health();
        isHealthy = result.ok;
      } else {
        // Simulate for other servers
        await new Promise((resolve) => setTimeout(resolve, 300));
        isHealthy = true;
      }
      
      updateServerStatus(serverId, isHealthy ? 'connected' : 'disconnected');
    } catch (error) {
      updateServerStatus(
        serverId,
        'error',
        error instanceof Error ? error.message : 'Ping failed'
      );
    }
  },

  // Tool actions
  toggleTool: (toolName) => {
    const { tools } = get();
    set({
      tools: tools.map((tool) =>
        tool.name === toolName ? { ...tool, enabled: !tool.enabled } : tool
      ),
    });
  },

  getToolsForAgent: (agentId) => {
    const { agents, tools } = get();
    const agent = agents.find((a) => a.id === agentId);
    
    if (!agent) return [];
    
    // Return tools based on agent category
    if (agent.category === 'build') {
      return tools.filter((t) => ['rag', 'file', 'git', 'checkpoint'].includes(t.category));
    } else if (agent.category === 'spec-creation') {
      return tools.filter((t) => ['rag', 'repo'].includes(t.category));
    }
    
    return tools;
  },

  // State
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}));

// Selector hooks
export const useMCPAgents = () => useMCPOverviewStore((s) => s.agents);
export const useMCPServers = () => useMCPOverviewStore((s) => s.servers);
export const useMCPTools = () => useMCPOverviewStore((s) => s.tools);
export const useSelectedAgent = () => useMCPOverviewStore((s) => s.selectedAgent);
export const useSelectedServer = () => useMCPOverviewStore((s) => s.selectedServer);
