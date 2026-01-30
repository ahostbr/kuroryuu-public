/**
 * Types for MCP Overview View
 * Displays agents, MCP servers, and available tools
 */

// ============================================================================
// Agent Types
// ============================================================================

export type AgentCategory = 'spec-creation' | 'build' | 'utility';

export type AgentRole =
  | 'spec-gatherer'
  | 'spec-writer'
  | 'spec-discovery'
  | 'spec-researcher'
  | 'spec-critic'
  | 'spec-validation'
  | 'spec-context'
  | 'planner'
  | 'coder'
  | 'reviewer'
  | 'tester';

export interface AgentInfo {
  id: string;
  role: AgentRole;
  name: string;
  description: string;
  category: AgentCategory;
  model: string;
  costTier: 'low' | 'medium' | 'high';
  mcpToolCount: number;
  status: 'ready' | 'busy' | 'offline' | 'error';
  color: string;
}

// ============================================================================
// MCP Tool Types
// ============================================================================

export type ToolCategory = 'rag' | 'inbox' | 'checkpoint' | 'repo' | 'file' | 'git' | 'other';

export interface MCPTool {
  name: string;
  description: string;
  category: ToolCategory;
  parameters?: ToolParameter[];
  enabled: boolean;
}

export interface ToolParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

// ============================================================================
// MCP Server Types
// ============================================================================

export type ServerStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  status: ServerStatus;
  toolCount: number;
  enabled: boolean;
  lastPing?: number;
  error?: string;
}

// ============================================================================
// MCP Overview State
// ============================================================================

export interface MCPOverviewState {
  agents: AgentInfo[];
  servers: MCPServer[];
  tools: MCPTool[];
  selectedAgent: string | null;
  selectedServer: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// Default Data
// ============================================================================

export const DEFAULT_AGENTS: AgentInfo[] = [
  // Spec Creation Agents
  {
    id: 'agent-spec-gatherer',
    role: 'spec-gatherer',
    name: 'Spec Gatherer',
    description: 'Collects requirements and user stories from various sources.',
    category: 'spec-creation',
    model: 'Sonnet 4.5',
    costTier: 'medium',
    mcpToolCount: 0,
    status: 'ready',
    color: '#9333ea', // purple
  },
  {
    id: 'agent-spec-writer',
    role: 'spec-writer',
    name: 'Spec Writer',
    description: 'Transforms requirements into structured technical specifications.',
    category: 'spec-creation',
    model: 'Sonnet 4.5',
    costTier: 'medium',
    mcpToolCount: 0,
    status: 'ready',
    color: '#8b5cf6', // violet
  },
  {
    id: 'agent-spec-discovery',
    role: 'spec-discovery',
    name: 'Discovery',
    description: 'Explores codebase to understand existing patterns and architecture.',
    category: 'spec-creation',
    model: 'Sonnet 4.5',
    costTier: 'medium',
    mcpToolCount: 2,
    status: 'ready',
    color: '#a855f7', // fuchsia
  },
  {
    id: 'agent-spec-researcher',
    role: 'spec-researcher',
    name: 'Researcher',
    description: 'Researches best practices and external documentation.',
    category: 'spec-creation',
    model: 'Sonnet 4.5',
    costTier: 'medium',
    mcpToolCount: 0,
    status: 'ready',
    color: '#c084fc', // purple-light
  },
  {
    id: 'agent-spec-critic',
    role: 'spec-critic',
    name: 'Critic',
    description: 'Reviews specifications for completeness and potential issues.',
    category: 'spec-creation',
    model: 'Sonnet 4.5',
    costTier: 'medium',
    mcpToolCount: 0,
    status: 'ready',
    color: '#d946ef', // fuchsia
  },
  {
    id: 'agent-spec-validation',
    role: 'spec-validation',
    name: 'Validation',
    description: 'Validates specifications against project constraints.',
    category: 'spec-creation',
    model: 'Sonnet 4.5',
    costTier: 'medium',
    mcpToolCount: 0,
    status: 'ready',
    color: '#e879f9', // pink
  },
  {
    id: 'agent-spec-context',
    role: 'spec-context',
    name: 'Context',
    description: 'Maintains context and memory across specification sessions.',
    category: 'spec-creation',
    model: 'Sonnet 4.5',
    costTier: 'medium',
    mcpToolCount: 0,
    status: 'ready',
    color: '#f0abfc', // pink-light
  },
  // Build Agents
  {
    id: 'agent-planner',
    role: 'planner',
    name: 'Planner',
    description: 'Creates detailed implementation plans and task breakdowns.',
    category: 'build',
    model: 'Opus 4.5',
    costTier: 'high',
    mcpToolCount: 4,
    status: 'ready',
    color: '#3b82f6', // blue
  },
  {
    id: 'agent-coder',
    role: 'coder',
    name: 'Coder',
    description: 'Implements code changes according to plans and specifications.',
    category: 'build',
    model: 'Sonnet 4.5',
    costTier: 'medium',
    mcpToolCount: 4,
    status: 'ready',
    color: '#06b6d4', // cyan
  },
];

export const DEFAULT_SERVERS: MCPServer[] = [
  {
    id: 'mcp-core',
    name: 'MCP Core',
    url: 'http://localhost:8100',
    status: 'connected',
    toolCount: 12,
    enabled: true,
  },
  {
    id: 'mcp-gateway',
    name: 'Gateway',
    url: 'http://localhost:8200',
    status: 'connected',
    toolCount: 5,
    enabled: true,
  },
];

// NOTE: Using routed tool pattern with action parameter (2026-01-09)
// Each k_* tool supports multiple actions via the action parameter
export const DEFAULT_TOOLS: MCPTool[] = [
  // Routed tools (k_* prefix)
  { name: 'k_rag', description: 'RAG operations: query, index, status', category: 'rag', enabled: true },
  { name: 'k_inbox', description: 'Inbox operations: send, list, read, claim, complete', category: 'inbox', enabled: true },
  { name: 'k_checkpoint', description: 'Checkpoint operations: save, load, list', category: 'checkpoint', enabled: true },
  { name: 'k_session', description: 'Session operations: start, end, pre_tool, post_tool, log, context', category: 'other', enabled: true },
  { name: 'k_files', description: 'File operations: read, write, list', category: 'file', enabled: true },
  { name: 'k_memory', description: 'Working memory: get, set_goal, add_blocker, clear_blockers, set_steps, reset', category: 'other', enabled: true },
  { name: 'k_interact', description: 'Human-in-the-loop: ask, approve, plan (LEADER-ONLY)', category: 'other', enabled: true },
  { name: 'k_capture', description: 'Visual capture: screenshot, start, stop, poll, get_latest', category: 'other', enabled: true },
];
