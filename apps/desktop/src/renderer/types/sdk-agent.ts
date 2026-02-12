/**
 * Shared type definitions for Claude Agent SDK integration.
 * Used by both main process (claude-sdk-service) and renderer (stores, components).
 *
 * NOTE: These are serializable types for IPC transport.
 * The actual SDK types (SDKMessage, Query, etc.) live in @anthropic-ai/claude-agent-sdk
 * and are only used in the main process.
 */

// Re-export SDK message type name for renderer-side discrimination
export type SDKMessageType =
  | 'assistant'
  | 'user'
  | 'result'
  | 'stream_event'
  | 'system'
  | 'tool_progress'
  | 'auth_status'
  | 'tool_use_summary';

export type SDKResultSubtype =
  | 'success'
  | 'error_during_execution'
  | 'error_max_turns'
  | 'error_max_budget_usd'
  | 'error_max_structured_output_retries';

export type SDKSystemSubtype =
  | 'init'
  | 'compact_boundary'
  | 'status'
  | 'hook_started'
  | 'hook_progress'
  | 'hook_response'
  | 'files_persisted'
  | 'task_notification';

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'delegate' | 'dontAsk';

export type AgentModel = 'sonnet' | 'opus' | 'haiku' | 'inherit';

// -------------------------------------------------------------------
// Agent configuration (renderer → main via IPC)
// -------------------------------------------------------------------

export interface SDKSubagentDef {
  description: string;
  tools?: string[];
  disallowedTools?: string[];
  prompt: string;
  model?: AgentModel;
  maxTurns?: number;
}

export interface SDKAgentConfig {
  /** The prompt/task for the agent */
  prompt: string;
  /** Agent role from AGENT_ROLES (optional) */
  role?: string;
  /** Model identifier (e.g. 'claude-sonnet-4-5-20250929') */
  model?: string;
  /** Working directory */
  cwd?: string;
  /** Permission mode */
  permissionMode?: PermissionMode;
  /** Tools to auto-allow without prompting */
  allowedTools?: string[];
  /** Tools to disallow entirely */
  disallowedTools?: string[];
  /** Max conversation turns */
  maxTurns?: number;
  /** Max budget in USD */
  maxBudgetUsd?: number;
  /** Custom system prompt (overrides role default) */
  systemPrompt?: string;
  /** Append to default system prompt instead of replacing */
  appendSystemPrompt?: string;
  /** Use Claude Code preset system prompt */
  useClaudeCodePreset?: boolean;
  /** Include partial/streaming messages */
  includePartialMessages?: boolean;
  /** Enable file checkpointing */
  enableFileCheckpointing?: boolean;
  /** Subagent definitions for orchestration */
  agents?: Record<string, SDKSubagentDef>;
  /** Main agent name (must match key in agents) */
  agent?: string;
  /** MCP servers to connect (name → config) */
  mcpServers?: Record<string, { type: string; url: string; headers?: Record<string, string> }>;
  /** Load settings from filesystem */
  settingSources?: Array<'user' | 'project' | 'local'>;
  /** Session ID to resume */
  resumeSessionId?: string;
  /** Persist session to disk */
  persistSession?: boolean;
}

// -------------------------------------------------------------------
// Tool call record (extracted from SDK assistant messages)
// -------------------------------------------------------------------

export interface ToolCallRecord {
  toolName: string;
  toolUseId: string;
  input: unknown;
  output?: unknown;
  timestamp: number;
  /** null = main agent, string = subagent's parent tool_use_id */
  parentToolUseId: string | null;
}

// -------------------------------------------------------------------
// Session model (main ↔ renderer via IPC)
// -------------------------------------------------------------------

export type SDKSessionStatus = 'starting' | 'running' | 'completed' | 'error' | 'cancelled';

export interface SDKAgentSession {
  id: string;
  /** SDK's internal session_id (from init message) */
  sdkSessionId?: string;
  /** Agent role (from AGENT_ROLES) */
  role?: string;
  status: SDKSessionStatus;
  prompt: string;
  model: string;
  cwd: string;
  startedAt: number;
  completedAt?: number;

  // Cost & usage
  totalCostUsd: number;
  numTurns: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };

  // Tool tracking
  toolCalls: ToolCallRecord[];
  currentTool?: string;

  // Result
  result?: string;
  errors?: string[];
  stopReason?: string | null;

  // SDK features
  tools?: string[];
  mcpServers?: { name: string; status: string }[];
  permissionMode?: PermissionMode;

  // Subagent tracking
  subagentCount: number;
}

/** Lightweight summary for list views */
export interface SDKAgentSessionSummary {
  id: string;
  sdkSessionId?: string;
  role?: string;
  status: SDKSessionStatus;
  prompt: string;
  model: string;
  cwd: string;
  startedAt: number;
  completedAt?: number;
  totalCostUsd: number;
  numTurns: number;
  currentTool?: string;
  subagentCount: number;
  toolCallCount: number;
  lastMessage?: string;
}

// -------------------------------------------------------------------
// Serialized SDK message (for IPC transport to renderer)
// -------------------------------------------------------------------

/** Simplified message for renderer display — avoids sending full BetaMessage objects */
export interface SerializedSDKMessage {
  type: SDKMessageType;
  subtype?: string;
  uuid: string;
  sessionId: string;
  timestamp: number;
  /** Text content (from assistant text blocks) */
  text?: string;
  /** Tool use info (from assistant tool_use blocks) */
  toolUse?: {
    id: string;
    name: string;
    input: unknown;
  };
  /** Tool result (from user tool_result blocks) */
  toolResult?: {
    toolUseId: string;
    output: unknown;
    isError?: boolean;
  };
  /** Result data (from result messages) */
  result?: {
    subtype: SDKResultSubtype;
    isError: boolean;
    result?: string;
    errors?: string[];
    totalCostUsd: number;
    numTurns: number;
    durationMs: number;
    durationApiMs: number;
    stopReason: string | null;
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
    };
  };
  /** System init data */
  init?: {
    tools: string[];
    model: string;
    mcpServers: { name: string; status: string }[];
    permissionMode: PermissionMode;
    claudeCodeVersion: string;
  };
  /** Tool progress data */
  toolProgress?: {
    toolUseId: string;
    toolName: string;
    elapsedSeconds: number;
  };
  /** Streaming text delta (when includePartialMessages=true) */
  textDelta?: string;
  /** Parent tool_use_id (null = main agent) */
  parentToolUseId: string | null;
}

// -------------------------------------------------------------------
// IPC event payloads
// -------------------------------------------------------------------

export interface SDKAgentStartResult {
  sessionId: string;
}

export interface SDKAgentError {
  sessionId: string;
  error: string;
}
