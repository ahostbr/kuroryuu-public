/**
 * Command Center Types
 *
 * Type definitions for the Full Stack Command Center component.
 */

// ================== AGENT TYPES ==================

export type AgentRole = 'leader' | 'worker';
export type AgentStatus = 'idle' | 'busy' | 'dead' | 'error';

export interface LiveAgent {
  id: string;
  role: AgentRole;
  status: AgentStatus;
  lastHeartbeat: string;
  registeredAt: string;
  model?: string;
  label?: string;
  capabilities?: string[];
  currentTaskId?: string;
  currentTask?: string;
  ptySessionId?: string;
  metadata?: Record<string, unknown>;
}

export type AgentFilter = 'all' | 'leader' | 'worker' | 'idle' | 'busy';

// ================== TOOL TYPES ==================

export type ToolCategory =
  | 'session'
  | 'memory'
  | 'checkpoint'
  | 'inbox'
  | 'rag'
  | 'repo_intel'
  | 'files'
  | 'canvas'
  | 'capture'
  | 'pty'
  | 'interact'
  | 'collective'
  | 'thinker'
  | 'help'
  | 'shell'
  | 'pccontrol'
  | 'process'
  | 'graphiti'
  | 'toolsearch'
  | 'backup'
  | 'other';

export interface ParameterSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
  required?: string[];
}

export interface ToolSchema {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: {
    type: 'object';
    properties: Record<string, ParameterSchema>;
    required?: string[];
  };
  leaderOnly?: boolean;
}

export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error';

export interface ToolExecution {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

// ================== SERVER TYPES ==================

export type ServerStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface ServerHealth {
  id: string;
  name: string;
  url: string;
  status: ServerStatus;
  lastPing?: string;
  responseTimeMs?: number;
  toolCount?: number;           // Keep for MCP Core backwards compat
  metricValue?: number;         // Server-specific metric value
  metricLabel?: string;         // e.g., "Tools", "Models", "Sessions", "Agents"
  error?: string;
}

// ================== STORE TYPES ==================

export type TabId = 'tools' | 'servers' | 'graphiti';

export interface CommandCenterState {
  // Connection
  wsConnected: boolean;
  wsConnectionState: 'disconnected' | 'connecting' | 'connected';

  // Agents (real-time from WebSocket)
  agents: Map<string, LiveAgent>;
  selectedAgentId: string | null;
  agentFilter: AgentFilter;

  // Tools
  tools: ToolSchema[];
  toolsLoading: boolean;
  selectedToolName: string | null;
  toolArgs: Record<string, unknown>;
  executionHistory: ToolExecution[];
  currentExecution: ToolExecution | null;
  selectedCategory: ToolCategory | 'all';

  // Servers
  servers: ServerHealth[];
  selectedServerId: string | null;

  // UI State
  activeTab: TabId;
  isInitialized: boolean;
  error: string | null;
}

export interface CommandCenterActions {
  // Initialization
  initialize: () => Promise<void>;
  cleanup: () => void;

  // WebSocket events (called by hook)
  handleAgentRegistered: (agent: LiveAgent) => void;
  handleAgentHeartbeat: (agentId: string, timestamp: string) => void;
  handleAgentStatusChange: (agentId: string, oldStatus: string, newStatus: string) => void;
  handleAgentDeregistered: (agentId: string) => void;
  handleStatsUpdate: (stats: Record<string, unknown>) => void;
  setWsConnectionState: (state: 'disconnected' | 'connecting' | 'connected') => void;

  // Agent actions
  selectAgent: (agentId: string | null) => void;
  setAgentFilter: (filter: AgentFilter) => void;
  refreshAgents: () => Promise<void>;

  // Tool actions
  selectTool: (toolName: string | null) => void;
  setToolArg: (key: string, value: unknown) => void;
  resetToolArgs: () => void;
  executeTool: () => Promise<void>;
  clearExecutionHistory: () => void;
  loadTools: () => Promise<void>;
  setSelectedCategory: (category: ToolCategory | 'all') => void;

  // Server actions
  selectServer: (serverId: string | null) => void;
  pingServer: (serverId: string) => Promise<void>;
  pingAllServers: () => Promise<void>;
  restartServer: (serverId: string) => Promise<{ ok: boolean; error?: string }>;

  // UI actions
  setActiveTab: (tab: TabId) => void;
  setError: (error: string | null) => void;
}

export type CommandCenterStore = CommandCenterState & CommandCenterActions;

// ================== CATEGORY HELPERS ==================

export const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
  k_session: 'session',
  k_memory: 'memory',
  k_checkpoint: 'checkpoint',
  k_inbox: 'inbox',
  k_rag: 'rag',
  k_repo_intel: 'repo_intel',
  k_files: 'files',
  k_capture: 'capture',
  k_pty: 'pty',
  k_interact: 'interact',
  k_collective: 'collective',
  k_thinker_channel: 'thinker',
  k_help: 'help',
  k_bash: 'shell',
  k_pccontrol: 'pccontrol',
  k_process: 'process',
  k_graphiti_migrate: 'graphiti',
  k_MCPTOOLSEARCH: 'toolsearch',
  k_backup: 'backup',
  k_askuserquestion: 'interact',
};

export const LEADER_ONLY_TOOLS = new Set(['k_pty', 'k_interact']);

export function getToolCategory(toolName: string): ToolCategory {
  return TOOL_CATEGORY_MAP[toolName] || 'other';
}

export function isLeaderOnlyTool(toolName: string): boolean {
  return LEADER_ONLY_TOOLS.has(toolName);
}

// ================== DEFAULT VALUES ==================

export const DEFAULT_SERVERS: ServerHealth[] = [
  {
    id: 'mcp-core',
    name: 'MCP Core',
    url: 'http://127.0.0.1:8100',
    status: 'disconnected',
    metricLabel: 'Tools',
  },
  {
    id: 'gateway',
    name: 'Gateway',
    url: 'http://127.0.0.1:8200',
    status: 'disconnected',
    metricLabel: 'Agents',
  },
  {
    id: 'pty-daemon',
    name: 'PTY Daemon',
    url: 'tcp://127.0.0.1:7072',
    status: 'disconnected',
    metricLabel: 'Sessions',
  },
  {
    id: 'cliproxy',
    name: 'CLIProxyAPI',
    url: 'http://127.0.0.1:8317',
    status: 'disconnected',
    metricLabel: 'Models',
  },
];

export const CATEGORY_LABELS: Record<ToolCategory | 'all', string> = {
  all: 'All Tools',
  session: 'Session',
  memory: 'Memory',
  checkpoint: 'Checkpoint',
  inbox: 'Inbox',
  rag: 'RAG',
  repo_intel: 'Repo Intel',
  files: 'Files',
  canvas: 'Canvas',
  capture: 'Capture',
  pty: 'PTY',
  interact: 'Interact',
  collective: 'Collective',
  thinker: 'Thinker',
  help: 'Help',
  shell: 'Shell',
  pccontrol: 'PC Control',
  process: 'Process',
  graphiti: 'Graphiti',
  toolsearch: 'Tool Search',
  backup: 'Backup',
  other: 'Other',
};
