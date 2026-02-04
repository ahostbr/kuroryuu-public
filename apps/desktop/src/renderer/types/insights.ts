/**
 * @deprecated Use KuroryuuDesktopAssistantPanel with mode="fullscreen" instead.
 * This file is kept for backwards compatibility but will be removed.
 *
 * Insights Chat Screen (DEPRECATED)
 *
 * AI chat interface with:
 * - Session history sidebar
 * - Message bubbles with markdown rendering
 * - Tool call badges
 * - Model selector dropdown
 * - Streaming responses
 * - Direct Mode toggle (M1: bypasses harness/inbox)
 * - TTS controls (speak/stop via IPC to main process)
 * - Connection health indicator
 * - Stop generation / Retry support
 */

import { getModelDisplayName } from './domain-config';

// Changed from literal union to string for dynamic model support
// Domain config can have any model ID from CLIProxyAPI (28+ models)
export type InsightsModel = string;

export interface InsightsMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: InsightsModel;
  toolCalls?: ToolCall[];
  richCards?: RichCard[];  // Rich visualization cards for tool outputs
  status?: 'pending' | 'streaming' | 'complete' | 'error';
  error?: string;
  isStreaming?: boolean;  // True while message is being progressively built
  // Response metadata
  metadata?: {
    actualModel?: string;      // Model ID from response
    finishReason?: string;     // stop, length, tool_use, etc.
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    latencyMs?: number;        // Time to complete
    backend?: string;          // lmstudio, cliproxyapi, claude
  };
}

export interface ToolCall {
  id: string;
  name: string;
  status: 'running' | 'success' | 'error';
  duration?: number;
  result?: string;
}

// Rich visualization card types
export type RichCardType =
  | 'rag-results'
  | 'file-tree'
  | 'symbol-map'
  | 'terminal'
  | 'checkpoint'
  | 'session'
  | 'inbox'
  | 'memory'
  | 'collective'
  | 'bash'
  | 'process'
  | 'capture'
  | 'thinker'
  | 'hooks'
  | 'pccontrol'
  | 'tool-search'
  | 'help'
  | 'graphiti'
  | 'file-content'
  | 'session-state'  // Legacy alias
  | 'tool-output'
  | 'askuserquestion';  // Interactive user input (k_askuserquestion)

export interface RichCard {
  id: string;
  type: RichCardType;
  toolCallId: string;  // Links to parent ToolCall
  data: RAGResultsData | FileTreeData | FileContentData | SymbolMapData | TerminalData | CheckpointData | SessionData | InboxData | MemoryData | CollectiveData | BashData | ProcessData | CaptureData | ThinkerData | HooksData | PCControlData | ToolSearchData | HelpData | GraphitiData | ToolOutputData | AskUserQuestionData;
}

export interface RAGResultsData {
  query: string;
  strategy?: string;
  matches: RAGMatch[];
  totalMatches: number;
  scanTimeMs?: number;
  filesScanned?: number;
}

export interface RAGMatch {
  path: string;
  line?: number;
  score: number;
  snippet?: string;
}

export interface FileTreeData {
  rootPath: string;
  files: FileTreeEntry[];
}

export interface FileTreeEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeEntry[];
}

export interface FileContentData {
  path: string;
  content: string;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
  language?: string;
}

export interface ToolOutputData {
  toolName: string;
  output: string;
  isJson?: boolean;
}

// Terminal output for k_pty results
export interface TerminalData {
  sessionId: string;
  sessions?: TerminalSession[];
  output?: string;
  action: string;
  count?: number;
}

export interface TerminalSession {
  session_id: string;
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  source?: string;
  created_at?: string;
}

// Checkpoint data for k_checkpoint results
export interface CheckpointData {
  action: string;
  id?: string;
  name?: string;
  path?: string;
  savedAt?: string;
  checkpoints?: CheckpointEntry[];
  count?: number;
  checkpoint?: Record<string, unknown>;
}

export interface CheckpointEntry {
  id: string;
  name: string;
  saved_at: string;
  size_bytes?: number;
  summary?: string;
  tags?: string[];
  path?: string;
}

// Session data for k_session results
export interface SessionData {
  sessionId: string;
  agentId?: string;
  processId?: string;
  action: string;
  startedAt?: string;
  endedAt?: string;
  context?: Record<string, unknown>;
}

// Inbox data for k_inbox results
export interface InboxData {
  action: string;
  folder?: string;
  messages?: InboxMessage[];
  count?: number;
  message?: InboxMessage;
}

export interface InboxMessage {
  id: string;
  from: string;
  to?: string;
  subject?: string;
  type?: string;
  priority?: string;
  status?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

// Working memory data for k_memory results
export interface MemoryData {
  action: string;
  workingMemory?: WorkingMemoryState;
  goal?: string;
  blockers?: string[];
  steps?: string[];
  todoPath?: string;
  todoExists?: boolean;
  todoPreview?: string;
}

export interface WorkingMemoryState {
  active_goal?: string;
  blockers?: string[];
  next_steps?: string[];
  context?: Record<string, unknown>;
}

// Collective intelligence data for k_collective results
export interface CollectiveData {
  action: string;
  patterns?: CollectivePattern[];
  skillMatrix?: Record<string, string[]>;
  count?: number;
}

export interface CollectivePattern {
  id: string;
  task_type: string;
  approach: string;
  evidence?: string;
  success_rate?: number;
  uses?: number;
  created_at?: string;
}

// Bash execution data for k_bash results
export interface BashData {
  action: string;
  command?: string;
  output?: string;
  exitCode?: number;
  sessionId?: string;
  isBackground?: boolean;
  durationMs?: number;
}

// Process management data for k_process results
export interface ProcessData {
  action: string;
  sessions?: ProcessSession[];
  count?: number;
  sessionId?: string;
  output?: string;
}

export interface ProcessSession {
  id: string;
  command: string;
  running: boolean;
  exit_code?: number;
  pid?: number;
  created_at?: string;
}

// Screen capture data for k_capture results
export interface CaptureData {
  action: string;
  imagePath?: string;
  timestamp?: string;
  dimensions?: { width: number; height: number };
  monitors?: CaptureMonitor[];
  status?: string;
  sizeBytes?: number;
  error?: string;  // Error message if status is 'error'
  base64?: string;  // Base64-encoded image data for inline preview
  mimeType?: string;  // MIME type (e.g., "image/png", "image/jpeg")
}

export interface CaptureMonitor {
  id: number;
  name: string;
  width: number;
  height: number;
  primary?: boolean;
  left?: number;
  top?: number;
}

// Thinker channel data for k_thinker_channel results
export interface ThinkerData {
  action: string;
  targetAgentId?: string;
  messages?: ThinkerMessage[];
  output?: string;
  sent?: boolean;
}

export interface ThinkerMessage {
  from: string;
  content: string;
  timestamp?: string;
}

// Hooks/session data for k_session (hooks) results
export interface HooksData {
  action: string;
  sessionId?: string;
  agentId?: string;
  cliType?: string;
  context?: Record<string, unknown>;
  hooks?: HookEntry[];
}

export interface HookEntry {
  name: string;
  type: string;
  enabled: boolean;
  path?: string;
}

// PC Control data for k_pccontrol results
export interface PCControlData {
  action: string;
  armed?: boolean;
  status?: string;
  screenshot?: string;
  position?: { x: number; y: number };
  windows?: PCWindow[];
  element?: PCElement;
}

export interface PCWindow {
  title: string;
  handle?: string;
  className?: string;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface PCElement {
  name?: string;
  type?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

// Tool search data for k_MCPTOOLSEARCH results
export interface ToolSearchData {
  action: string;
  query?: string;
  mode?: string;
  matches?: ToolSearchMatch[];
  toolUsed?: string;
  result?: unknown;
}

export interface ToolSearchMatch {
  tool: string;
  score: number;
  description?: string;
  actions?: string[];
}

// Help data for k_help results
export interface HelpData {
  tool?: string;
  description?: string;
  actions?: Record<string, string>;
  examples?: string[];
  keywords?: string[];
  allTools?: HelpToolEntry[];
  toolsCount?: number;
  usage?: string;
  tip?: string;
}

export interface HelpToolEntry {
  name: string;
  description: string;
  actions?: string[];
}

// Graphiti migration data for k_graphiti_migrate results
export interface GraphitiData {
  action: string;
  status?: string;
  server?: string;
  dryRun?: boolean;
  checkpointCount?: number;
  worklogCount?: number;
  migrated?: number;
  failed?: number;
  error?: string;
}

// Symbol map for k_repo_intel results
export type SymbolKind = 'function' | 'class' | 'interface' | 'variable' | 'type' | 'method' | 'property' | 'module' | 'unknown';

export interface SymbolEntry {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  signature?: string;
  docstring?: string;
}

export interface SymbolMapData {
  query: string;
  action: string;  // The k_repo_intel action that generated this
  symbols: SymbolEntry[];
  totalSymbols: number;
  filesSearched?: number;
}

// AskUserQuestion data for k_askuserquestion results
// Mirrors Claude Code CLI's AskUserQuestion format
export interface AskUserQuestionOption {
  label: string;
  description?: string;
}

export interface AskUserQuestionItem {
  question: string;           // Full question text
  header: string;             // Short label/chip (max 12 chars)
  multiSelect: boolean;       // true=checkboxes, false=radio
  options: AskUserQuestionOption[];  // 2-4 options
}

export interface AskUserQuestionData {
  questionId: string;
  questions: AskUserQuestionItem[];  // 1-4 questions
  // UI state (managed by card)
  answers?: Record<string, string | string[]>;  // question_0 -> answer(s)
  submitted?: boolean;
}

export interface InsightsSession {
  id: string;
  title: string;
  messages: InsightsMessage[];
  model: InsightsModel;
  createdAt: number;
  updatedAt: number;
}

export interface InsightsSettings {
  defaultModel: InsightsModel;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

// Legacy display names - kept for backwards compatibility
// New code should use getInsightsModelName() which falls back to domain-config
const LEGACY_MODEL_NAMES: Record<string, string> = {
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
  'claude-3-opus-20240229': 'Claude 3 Opus',
  'gpt-4o': 'GPT-4o',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'o1-preview': 'o1-preview',
  'local-lmstudio': 'LM Studio (Local)',
};

/**
 * Get display name for a model ID
 * Falls back to domain-config's comprehensive model name mapping
 */
export function getInsightsModelName(modelId: string): string {
  return LEGACY_MODEL_NAMES[modelId] || getModelDisplayName(modelId);
}

// Re-export for backwards compatibility (components using MODEL_DISPLAY_NAMES directly)
export const MODEL_DISPLAY_NAMES: Record<string, string> = new Proxy(LEGACY_MODEL_NAMES, {
  get(target, prop: string) {
    return target[prop] || getModelDisplayName(prop);
  }
});
