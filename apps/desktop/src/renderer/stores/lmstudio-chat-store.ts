/**
 * @deprecated Planned migration to unified-chat-store.ts with Electron IPC persistence.
 * For now, this store continues to be used by KuroryuuDesktopAssistantPanel.
 *
 * LM Studio Chat Store
 *
 * State management for the AI chat panel in the Code Editor.
 * Connects to any model running in LM Studio via Gateway API.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useDomainConfigStore } from './domain-config-store';
import { useSettingsStore } from './settings-store';
import type { LLMProvider } from '../types/domain-config';
import { inferSourceFromId } from '../services/model-registry';
import { filterTerminalOutput, hasTerminalArtifacts, stripInputEcho } from '../utils/filter-terminal-output';
import type {
  RichCard,
  RAGResultsData,
  RAGMatch,
  FileTreeData,
  FileTreeEntry,
  SymbolMapData,
  SymbolEntry,
  SymbolKind,
  TerminalData,
  TerminalSession,
  CheckpointData,
  CheckpointEntry,
  SessionData,
  InboxData,
  InboxMessage,
  MemoryData,
  WorkingMemoryState,
  CollectiveData,
  CollectivePattern,
  BashData,
  ProcessData,
  ProcessSession,
  CaptureData,
  CaptureMonitor,
  ThinkerData,
  ThinkerMessage,
  HooksData,
  HookEntry,
  PCControlData,
  PCWindow,
  PCElement,
  ToolSearchData,
  ToolSearchMatch,
  HelpData,
  HelpToolEntry,
  GraphitiData,
  AskUserQuestionData,
  AskUserQuestionItem,
  AskUserQuestionOption,
} from '../types/insights';

// Gateway endpoints
const GATEWAY_URL = 'http://127.0.0.1:8200';
const LMSTUDIO_URL = 'http://127.0.0.1:1234';
const CLIPROXYAPI_URL = 'http://127.0.0.1:8317';

// Map provider to backend name for Gateway API
const PROVIDER_TO_BACKEND: Record<LLMProvider, string> = {
  'lmstudio': 'lmstudio',
  'cliproxyapi': 'cliproxyapi',
  'claude': 'claude',
  'claude-cli': 'claude-cli', // Direct via Claude Code CLI - real Opus 4.5
  'claude-cli-pty': 'claude-cli-pty', // Persistent Claude CLI session via PTY
  'gateway-auto': '', // Empty = use fallback chain
};

// Cache for LM Studio availability (avoid spamming connection refused errors)
let _lmStudioAvailableCache: { available: boolean; timestamp: number } | null = null;
const LMSTUDIO_CACHE_TTL = 60000; // 1 minute TTL for unavailable status

// Tool call types
export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error';

export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
}

// Tool schema from Gateway /v1/tools endpoint
export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ImageAttachment {
  id: string;
  data: string;       // base64 data URI: "data:image/png;base64,..."
  mimeType: string;   // "image/png", "image/jpeg", etc.
  name?: string;      // filename if from file picker
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  contextIncluded?: boolean;
  // Image attachments (for vision-capable models)
  images?: ImageAttachment[];
  // Tool call support
  toolCalls?: ToolCallData[];
  toolCallId?: string; // For tool result messages
  // Rich visualization cards for tool outputs
  richCards?: RichCard[];
  // Model/provider metadata (from Gateway response)
  model?: string;       // e.g., "grok-code-fast-1" (from Gateway)
  provider?: string;    // e.g., "cliproxyapi" (Gateway backend name)
  modelName?: string;   // e.g., "Grok Code Fast 1" (display name from registry)
  source?: string;      // e.g., "github-copilot" (actual model source)
  // Streaming state
  isStreaming?: boolean; // True while message is being progressively built
}

// Conversation (chat session) type
export interface Conversation {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// Max limits for storage
const MAX_MESSAGES_PER_CONVERSATION = 50;
const MAX_CONVERSATIONS = 20;

export interface EditorContext {
  filePath: string;
  content: string;
  language: string;
  lineCount: number;
}

export interface ContextInfo {
  usedTokens: number;
  completionTokens: number;
  totalTokens: number;
  maxTokens: number;
  percentage: number;
}

/**
 * @deprecated Use AssistantViewType from utils/cross-window-lock.ts instead.
 * This type is kept for backwards compatibility.
 */
export type AssistantViewType = 'insights' | 'code-editor' | null;

/**
 * Parse k_rag tool result into RichCard format
 */
function parseRAGResultToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  // Handle string results (may be JSON that needs parsing)
  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Check if this looks like a RAG result
  if (!data.matches || !Array.isArray(data.matches)) return null;

  // Parse matches into RAGMatch format
  const matches: RAGMatch[] = data.matches.slice(0, 10).map((m: Record<string, unknown>) => ({
    path: String(m.path || ''),
    line: typeof m.start_line === 'number' ? m.start_line : undefined,
    score: typeof m.score === 'number' ? m.score : 0,
    snippet: typeof m.snippet === 'string' ? m.snippet.slice(0, 500) : undefined,
  }));

  const ragData: RAGResultsData = {
    query: typeof data.query === 'string' ? data.query : '',
    strategy: typeof data.rag_mode === 'string' ? data.rag_mode : undefined,
    matches,
    totalMatches: matches.length,
    scanTimeMs: (data.stats as Record<string, unknown>)?.elapsed_ms as number | undefined,
    filesScanned: (data.stats as Record<string, unknown>)?.files_scanned as number | undefined,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'rag-results',
    toolCallId,
    data: ragData,
  };
}

/**
 * Parse k_files tool result into RichCard format
 */
function parseFileTreeToRichCard(toolCallId: string, result: unknown): RichCard | null {
  console.log('[RichCard:FileTree] Input:', { resultType: typeof result, result: result });
  if (!result) {
    console.log('[RichCard:FileTree] FAIL: result is falsy');
    return null;
  }

  // Handle string results (may be JSON that needs parsing)
  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) {
        console.log('[RichCard:FileTree] FAIL: parsed string is not object');
        return null;
      }
      data = parsed as Record<string, unknown>;
      console.log('[RichCard:FileTree] Parsed string to object, keys:', Object.keys(data));
    } catch (e) {
      console.log('[RichCard:FileTree] FAIL: JSON.parse failed:', e);
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
    console.log('[RichCard:FileTree] Already object, keys:', Object.keys(data));
  } else {
    console.log('[RichCard:FileTree] FAIL: result is neither string nor object');
    return null;
  }

  // Check for file CONTENT first (k_files read action)
  if (typeof data.content === 'string' && data.content.length > 0) {
    console.log('[RichCard:FileTree] Found content field - returning file-content card');
    // Detect language from file extension
    const filePath = typeof data.path === 'string' ? data.path : '';
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      'ts': 'typescript', 'tsx': 'typescript', 'js': 'javascript', 'jsx': 'javascript',
      'py': 'python', 'rs': 'rust', 'go': 'go', 'java': 'java', 'c': 'c', 'cpp': 'cpp',
      'h': 'c', 'hpp': 'cpp', 'cs': 'csharp', 'rb': 'ruby', 'php': 'php',
      'md': 'markdown', 'json': 'json', 'yaml': 'yaml', 'yml': 'yaml', 'toml': 'toml',
      'html': 'html', 'css': 'css', 'scss': 'scss', 'sql': 'sql', 'sh': 'bash', 'bash': 'bash',
    };
    return {
      id: `rich-${toolCallId}`,
      type: 'file-content' as const,
      toolCallId,
      data: {
        path: filePath,
        content: data.content as string,
        startLine: typeof data.start_line === 'number' ? data.start_line : undefined,
        endLine: typeof data.end_line === 'number' ? data.end_line : undefined,
        totalLines: typeof data.total_lines === 'number' ? data.total_lines : undefined,
        language: langMap[ext] || 'text',
      },
    };
  }

  // Check for file list in various formats (k_files list action)
  const fileList = data.files || data.entries || data.results;
  console.log('[RichCard:FileTree] fileList check:', { hasFiles: !!data.files, hasEntries: !!data.entries, hasResults: !!data.results, fileList: fileList });
  if (!fileList || !Array.isArray(fileList)) {
    console.log('[RichCard:FileTree] FAIL: no files/entries/results/content found');
    return null;
  }

  // Parse files into FileTreeEntry format
  // Handle k_files format where entries are plain strings (e.g., ["file1.py", "dir/", "script.ts"])
  const files: FileTreeEntry[] = fileList.slice(0, 100).map((f) => {
    // If f is a string (k_files format), parse it directly
    if (typeof f === 'string') {
      const isDir = f.endsWith('/');
      const name = isDir ? f.slice(0, -1) : f;
      return {
        path: name,
        type: isDir ? 'directory' as const : 'file' as const,
      };
    }
    // Otherwise it's an object with path/name fields
    const obj = f as Record<string, unknown>;
    return {
      path: String(obj.path || obj.name || ''),
      type: (obj.type === 'directory' || obj.is_dir || obj.isDirectory) ? 'directory' as const : 'file' as const,
      size: typeof obj.size === 'number' ? obj.size : undefined,
    };
  });

  const treeData: FileTreeData = {
    // Use data.path as rootPath (k_files provides this), fall back to data.root
    rootPath: typeof data.path === 'string' ? data.path
            : typeof data.root === 'string' ? data.root
            : '.',
    files,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'file-tree',
    toolCallId,
    data: treeData,
  };
}

/**
 * Parse k_repo_intel tool result into RichCard format
 */
function parseSymbolMapToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  // Handle string results (may be JSON that needs parsing)
  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // k_repo_intel returns various formats - look for symbols in different places
  const symbolList = data.symbols || data.definitions || data.functions || data.classes || data.results;
  if (!symbolList || !Array.isArray(symbolList)) return null;

  // Map various symbol kinds from k_repo_intel to our SymbolKind
  const mapSymbolKind = (kind: string): SymbolKind => {
    const k = String(kind).toLowerCase();
    if (k.includes('function') || k === 'def') return 'function';
    if (k.includes('class')) return 'class';
    if (k.includes('interface')) return 'interface';
    if (k.includes('variable') || k === 'var' || k === 'const' || k === 'let') return 'variable';
    if (k.includes('type') || k === 'typedef') return 'type';
    if (k.includes('method')) return 'method';
    if (k.includes('property') || k === 'prop') return 'property';
    if (k.includes('module') || k === 'import') return 'module';
    return 'unknown';
  };

  // Parse symbols into SymbolEntry format
  const symbols: SymbolEntry[] = symbolList.slice(0, 50).map((s: Record<string, unknown>) => ({
    name: String(s.name || s.symbol || ''),
    kind: mapSymbolKind(String(s.kind || s.type || 'unknown')),
    file: String(s.file || s.path || s.filename || ''),
    line: typeof s.line === 'number' ? s.line : (typeof s.start_line === 'number' ? s.start_line : 0),
    signature: typeof s.signature === 'string' ? s.signature : undefined,
    docstring: typeof s.docstring === 'string' || typeof s.doc === 'string'
      ? String(s.docstring || s.doc).slice(0, 200)
      : undefined,
  }));

  const symbolData: SymbolMapData = {
    query: typeof data.query === 'string' ? data.query : '',
    action: typeof data.action === 'string' ? data.action : 'symbols',
    symbols,
    totalSymbols: symbols.length,
    filesSearched: typeof data.files_searched === 'number' ? data.files_searched : undefined,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'symbol-map',
    toolCallId,
    data: symbolData,
  };
}

/**
 * Parse k_pty tool result into RichCard format
 */
function parseTerminalToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Parse sessions if available
  const sessionList = data.sessions as Array<Record<string, unknown>> | undefined;
  const sessions: TerminalSession[] = sessionList?.slice(0, 20).map((s) => ({
    session_id: String(s.session_id || s.id || ''),
    shell: typeof s.shell === 'string' ? s.shell : undefined,
    cwd: typeof s.cwd === 'string' ? s.cwd : undefined,
    cols: typeof s.cols === 'number' ? s.cols : undefined,
    rows: typeof s.rows === 'number' ? s.rows : undefined,
    source: typeof s.source === 'string' ? s.source : undefined,
    created_at: typeof s.created_at === 'string' ? s.created_at : undefined,
  })) || [];

  const terminalData: TerminalData = {
    sessionId: typeof data.session_id === 'string' ? data.session_id : '',
    sessions: sessions.length > 0 ? sessions : undefined,
    output: typeof data.output === 'string' ? data.output : (typeof data.content === 'string' ? data.content : undefined),
    action: typeof data.action === 'string' ? data.action : 'list',
    count: typeof data.count === 'number' ? data.count : sessions.length,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'terminal',
    toolCallId,
    data: terminalData,
  };
}

/**
 * Parse k_checkpoint tool result into RichCard format
 */
function parseCheckpointToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Parse checkpoints list if available
  const cpList = data.checkpoints as Array<Record<string, unknown>> | undefined;
  const checkpoints: CheckpointEntry[] = cpList?.slice(0, 20).map((c) => ({
    id: String(c.id || ''),
    name: String(c.name || ''),
    saved_at: String(c.saved_at || ''),
    size_bytes: typeof c.size_bytes === 'number' ? c.size_bytes : undefined,
    summary: typeof c.summary === 'string' ? c.summary : undefined,
    tags: Array.isArray(c.tags) ? c.tags.map(String) : undefined,
    path: typeof c.path === 'string' ? c.path : undefined,
  })) || [];

  const checkpointData: CheckpointData = {
    action: typeof data.action === 'string' ? data.action : 'list',
    id: typeof data.id === 'string' ? data.id : undefined,
    name: typeof data.name === 'string' ? data.name : undefined,
    path: typeof data.path === 'string' ? data.path : undefined,
    savedAt: typeof data.saved_at === 'string' ? data.saved_at : undefined,
    checkpoints: checkpoints.length > 0 ? checkpoints : undefined,
    count: typeof data.count === 'number' ? data.count : checkpoints.length,
    checkpoint: typeof data.checkpoint === 'object' ? data.checkpoint as Record<string, unknown> : undefined,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'checkpoint',
    toolCallId,
    data: checkpointData,
  };
}

/**
 * Parse k_session tool result into RichCard format
 */
function parseSessionToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  const sessionData: SessionData = {
    sessionId: String(data.session_id || data.sessionId || ''),
    agentId: typeof data.agent_id === 'string' ? data.agent_id : undefined,
    processId: typeof data.process_id === 'string' ? data.process_id : undefined,
    action: typeof data.action === 'string' ? data.action : 'context',
    startedAt: typeof data.started_at === 'string' ? data.started_at : undefined,
    endedAt: typeof data.ended_at === 'string' ? data.ended_at : undefined,
    context: typeof data.context === 'object' ? data.context as Record<string, unknown> : undefined,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'session',
    toolCallId,
    data: sessionData,
  };
}

/**
 * Parse k_inbox tool result into RichCard format
 */
function parseInboxToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Parse messages list if available
  const msgList = data.messages as Array<Record<string, unknown>> | undefined;
  const messages: InboxMessage[] = msgList?.slice(0, 30).map((m) => ({
    id: String(m.id || m.message_id || ''),
    from: String(m.from || m.sender || ''),
    to: typeof m.to === 'string' ? m.to : undefined,
    subject: typeof m.subject === 'string' ? m.subject : undefined,
    type: typeof m.type === 'string' ? m.type : undefined,
    priority: typeof m.priority === 'string' ? m.priority : undefined,
    status: typeof m.status === 'string' ? m.status : undefined,
    timestamp: typeof m.timestamp === 'string' ? m.timestamp : undefined,
    payload: typeof m.payload === 'object' ? m.payload as Record<string, unknown> : undefined,
  })) || [];

  // Parse single message if available
  const singleMsg = data.message as Record<string, unknown> | undefined;
  const message: InboxMessage | undefined = singleMsg ? {
    id: String(singleMsg.id || singleMsg.message_id || ''),
    from: String(singleMsg.from || singleMsg.sender || ''),
    to: typeof singleMsg.to === 'string' ? singleMsg.to : undefined,
    subject: typeof singleMsg.subject === 'string' ? singleMsg.subject : undefined,
    type: typeof singleMsg.type === 'string' ? singleMsg.type : undefined,
    priority: typeof singleMsg.priority === 'string' ? singleMsg.priority : undefined,
    status: typeof singleMsg.status === 'string' ? singleMsg.status : undefined,
    timestamp: typeof singleMsg.timestamp === 'string' ? singleMsg.timestamp : undefined,
    payload: typeof singleMsg.payload === 'object' ? singleMsg.payload as Record<string, unknown> : undefined,
  } : undefined;

  const inboxData: InboxData = {
    action: typeof data.action === 'string' ? data.action : 'list',
    folder: typeof data.folder === 'string' ? data.folder : undefined,
    messages: messages.length > 0 ? messages : undefined,
    count: typeof data.count === 'number' ? data.count : messages.length,
    message,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'inbox',
    toolCallId,
    data: inboxData,
  };
}

/**
 * Parse k_memory tool result into RichCard format
 */
function parseMemoryToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Parse working memory state
  const wm = data.working_memory as Record<string, unknown> | undefined;
  const workingMemory: WorkingMemoryState | undefined = wm ? {
    active_goal: typeof wm.active_goal === 'string' ? wm.active_goal : undefined,
    blockers: Array.isArray(wm.blockers) ? wm.blockers.map(String) : undefined,
    next_steps: Array.isArray(wm.next_steps) ? wm.next_steps.map(String) : undefined,
    context: typeof wm.context === 'object' ? wm.context as Record<string, unknown> : undefined,
  } : undefined;

  const memoryData: MemoryData = {
    action: typeof data.action === 'string' ? data.action : 'get',
    workingMemory,
    goal: typeof data.goal === 'string' ? data.goal : (workingMemory?.active_goal),
    blockers: Array.isArray(data.all_blockers) ? data.all_blockers.map(String) : (workingMemory?.blockers),
    steps: Array.isArray(data.steps) ? data.steps.map(String) : (workingMemory?.next_steps),
    todoPath: typeof data.todo_path === 'string' ? data.todo_path : undefined,
    todoExists: typeof data.todo_exists === 'boolean' ? data.todo_exists : undefined,
    todoPreview: typeof data.todo_preview === 'string' ? data.todo_preview : undefined,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'memory',
    toolCallId,
    data: memoryData,
  };
}

/**
 * Parse k_collective tool result into RichCard format
 */
function parseCollectiveToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Parse patterns list if available
  const patternList = data.patterns as Array<Record<string, unknown>> | undefined;
  const patterns: CollectivePattern[] = patternList?.slice(0, 30).map((p) => ({
    id: String(p.id || ''),
    task_type: String(p.task_type || ''),
    approach: String(p.approach || ''),
    evidence: typeof p.evidence === 'string' ? p.evidence : undefined,
    success_rate: typeof p.success_rate === 'number' ? p.success_rate : undefined,
    uses: typeof p.uses === 'number' ? p.uses : undefined,
    created_at: typeof p.created_at === 'string' ? p.created_at : undefined,
  })) || [];

  const collectiveData: CollectiveData = {
    action: typeof data.action === 'string' ? data.action : 'query',
    patterns: patterns.length > 0 ? patterns : undefined,
    skillMatrix: typeof data.skill_matrix === 'object' ? data.skill_matrix as Record<string, string[]> : undefined,
    count: typeof data.count === 'number' ? data.count : patterns.length,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'collective',
    toolCallId,
    data: collectiveData,
  };
}

/**
 * Parse k_bash tool result into RichCard format
 */
function parseBashToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  const bashData: BashData = {
    action: typeof data.action === 'string' ? data.action : 'run',
    command: typeof data.command === 'string' ? data.command : undefined,
    output: typeof data.output === 'string' ? data.output : (typeof data.stdout === 'string' ? data.stdout : undefined),
    exitCode: typeof data.exit_code === 'number' ? data.exit_code : (typeof data.exitCode === 'number' ? data.exitCode : undefined),
    sessionId: typeof data.session_id === 'string' ? data.session_id : (typeof data.sessionId === 'string' ? data.sessionId : undefined),
    isBackground: typeof data.background === 'boolean' ? data.background : (typeof data.is_background === 'boolean' ? data.is_background : undefined),
    durationMs: typeof data.duration_ms === 'number' ? data.duration_ms : undefined,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'bash',
    toolCallId,
    data: bashData,
  };
}

/**
 * Parse k_process tool result into RichCard format
 */
function parseProcessToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Parse sessions list if available
  const sessionList = data.sessions as Array<Record<string, unknown>> | undefined;
  const sessions: ProcessSession[] = sessionList?.slice(0, 20).map((s) => ({
    id: String(s.id || s.session_id || ''),
    command: String(s.command || ''),
    running: typeof s.running === 'boolean' ? s.running : false,
    exit_code: typeof s.exit_code === 'number' ? s.exit_code : undefined,
    pid: typeof s.pid === 'number' ? s.pid : undefined,
    created_at: typeof s.created_at === 'string' ? s.created_at : undefined,
  })) || [];

  const processData: ProcessData = {
    action: typeof data.action === 'string' ? data.action : 'list',
    sessions: sessions.length > 0 ? sessions : undefined,
    count: typeof data.count === 'number' ? data.count : sessions.length,
    sessionId: typeof data.session_id === 'string' ? data.session_id : undefined,
    output: typeof data.output === 'string' ? data.output : undefined,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'process',
    toolCallId,
    data: processData,
  };
}

/**
 * Parse k_capture tool result into RichCard format
 */
function parseCaptureToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Debug: log what we received
  console.log('[CaptureCard] Raw data:', JSON.stringify(data, null, 2).slice(0, 500));

  // k_capture returns {"ok": true, "data": {...actual data...}, "error": null, "meta": {}}
  // Unwrap the nested data if present
  const innerData = (typeof data.data === 'object' && data.data !== null)
    ? data.data as Record<string, unknown>
    : data;

  console.log('[CaptureCard] Inner data keys:', Object.keys(innerData));
  console.log('[CaptureCard] Has monitors?', 'monitors' in innerData, Array.isArray(innerData.monitors));

  // Parse monitors list if available (from innerData or data.monitors for list action)
  // k_capture list_monitors returns: {index, device, left, top, right, bottom, width, height}
  const monitorList = (innerData.monitors || data.monitors) as Array<Record<string, unknown>> | undefined;
  const monitors: CaptureMonitor[] = monitorList?.map((m) => ({
    id: typeof m.index === 'number' ? m.index : (typeof m.id === 'number' ? m.id : 0),
    name: String(m.device || m.name || `Monitor ${m.index ?? m.id ?? 0}`),
    width: typeof m.width === 'number' ? m.width : 0,
    height: typeof m.height === 'number' ? m.height : 0,
    primary: typeof m.primary === 'boolean' ? m.primary : (m.index === 0 || m.id === 0),
    // Additional fields from list_monitors
    left: typeof m.left === 'number' ? m.left : undefined,
    top: typeof m.top === 'number' ? m.top : undefined,
  })) || [];

  // Parse dimensions from innerData or monitor info
  const dims = innerData.dimensions as Record<string, unknown> | undefined;
  const monitorInfo = innerData.monitor as Record<string, unknown> | undefined;
  const dimensions = dims ? {
    width: typeof dims.width === 'number' ? dims.width : 0,
    height: typeof dims.height === 'number' ? dims.height : 0,
  } : monitorInfo ? {
    width: typeof monitorInfo.width === 'number' ? monitorInfo.width : 0,
    height: typeof monitorInfo.height === 'number' ? monitorInfo.height : 0,
  } : undefined;

  // Get path from innerData (screenshot action returns path and size_bytes)
  const imagePath = typeof innerData.path === 'string' ? innerData.path
    : typeof innerData.image_path === 'string' ? innerData.image_path
    : typeof data.path === 'string' ? data.path
    : undefined;

  // Get file size
  const sizeBytes = typeof innerData.size_bytes === 'number' ? innerData.size_bytes : undefined;

  // Log monitors found
  console.log('[CaptureCard] Monitor list:', monitorList?.length ?? 0, 'monitors found');
  console.log('[CaptureCard] Parsed monitors:', monitors.length);

  // Get action from meta or detect from content
  const metaAction = (data.meta as Record<string, unknown>)?.action as string | undefined;
  const detectedAction = metaAction
    || (typeof data.action === 'string' ? data.action : undefined)
    || (imagePath ? 'screenshot' : (monitors.length > 0 ? 'list_monitors' : 'unknown'));

  const captureData: CaptureData = {
    action: detectedAction,
    imagePath,
    timestamp: typeof data.timestamp === 'string' ? data.timestamp : new Date().toISOString(),
    dimensions,
    monitors: monitors.length > 0 ? monitors : undefined,
    status: data.ok === true ? 'ok' : (data.ok === false ? 'error' : (typeof data.status === 'string' ? data.status : undefined)),
    sizeBytes,
    error: typeof data.error === 'string' ? data.error : undefined,
  };

  // Log error if present
  if (data.ok === false && data.error) {
    console.warn('[CaptureCard] k_capture error:', data.error);
  }

  console.log('[CaptureCard] Final captureData:', captureData);

  return {
    id: `rich-${toolCallId}`,
    type: 'capture',
    toolCallId,
    data: captureData,
  };
}

/**
 * Parse k_thinker_channel tool result into RichCard format
 */
function parseThinkerToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Parse messages list if available
  const msgList = data.messages as Array<Record<string, unknown>> | undefined;
  const messages: ThinkerMessage[] = msgList?.slice(0, 50).map((m) => ({
    from: String(m.from || m.sender || ''),
    content: String(m.content || m.data || ''),
    timestamp: typeof m.timestamp === 'string' ? m.timestamp : undefined,
  })) || [];

  const thinkerData: ThinkerData = {
    action: typeof data.action === 'string' ? data.action : 'read',
    targetAgentId: typeof data.target_agent_id === 'string' ? data.target_agent_id : undefined,
    messages: messages.length > 0 ? messages : undefined,
    output: typeof data.output === 'string' ? data.output : (typeof data.content === 'string' ? data.content : undefined),
    sent: typeof data.sent === 'boolean' ? data.sent : (typeof data.ok === 'boolean' ? data.ok : undefined),
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'thinker',
    toolCallId,
    data: thinkerData,
  };
}

/**
 * Parse k_session (hooks) tool result into RichCard format
 */
function parseHooksToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Parse hooks list if available
  const hookList = data.hooks as Array<Record<string, unknown>> | undefined;
  const hooks: HookEntry[] = hookList?.map((h) => ({
    name: String(h.name || ''),
    type: String(h.type || ''),
    enabled: typeof h.enabled === 'boolean' ? h.enabled : true,
    path: typeof h.path === 'string' ? h.path : undefined,
  })) || [];

  const hooksData: HooksData = {
    action: typeof data.action === 'string' ? data.action : 'context',
    sessionId: typeof data.session_id === 'string' ? data.session_id : undefined,
    agentId: typeof data.agent_id === 'string' ? data.agent_id : undefined,
    cliType: typeof data.cli_type === 'string' ? data.cli_type : undefined,
    context: typeof data.context === 'object' ? data.context as Record<string, unknown> : undefined,
    hooks: hooks.length > 0 ? hooks : undefined,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'hooks',
    toolCallId,
    data: hooksData,
  };
}

/**
 * Parse k_pccontrol tool result into RichCard format
 */
function parsePCControlToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Parse windows list if available
  const windowList = data.windows as Array<Record<string, unknown>> | undefined;
  const windows: PCWindow[] = windowList?.slice(0, 20).map((w) => ({
    title: String(w.title || ''),
    handle: typeof w.handle === 'string' ? w.handle : undefined,
    className: typeof w.class_name === 'string' ? w.class_name : undefined,
    rect: typeof w.rect === 'object' ? w.rect as { x: number; y: number; width: number; height: number } : undefined,
  })) || [];

  // Parse element if available
  const el = data.element as Record<string, unknown> | undefined;
  const element: PCElement | undefined = el ? {
    name: typeof el.name === 'string' ? el.name : undefined,
    type: typeof el.type === 'string' ? el.type : undefined,
    bounds: typeof el.bounds === 'object' ? el.bounds as { x: number; y: number; width: number; height: number } : undefined,
  } : undefined;

  // Parse position if available
  const pos = data.position as Record<string, unknown> | undefined;
  const position = pos ? {
    x: typeof pos.x === 'number' ? pos.x : 0,
    y: typeof pos.y === 'number' ? pos.y : 0,
  } : undefined;

  const pcControlData: PCControlData = {
    action: typeof data.action === 'string' ? data.action : 'status',
    armed: typeof data.armed === 'boolean' ? data.armed : undefined,
    status: typeof data.status === 'string' ? data.status : undefined,
    screenshot: typeof data.screenshot === 'string' ? data.screenshot : (typeof data.path === 'string' ? data.path : undefined),
    position,
    windows: windows.length > 0 ? windows : undefined,
    element,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'pccontrol',
    toolCallId,
    data: pcControlData,
  };
}

/**
 * Parse k_MCPTOOLSEARCH tool result into RichCard format
 */
function parseToolSearchToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Parse matches list if available
  const matchList = data.matches as Array<Record<string, unknown>> | undefined;
  const matches: ToolSearchMatch[] = matchList?.slice(0, 10).map((m) => ({
    tool: String(m.tool || m.name || ''),
    score: typeof m.score === 'number' ? m.score : 0,
    description: typeof m.description === 'string' ? m.description : undefined,
    actions: Array.isArray(m.actions) ? m.actions.map(String) : undefined,
  })) || [];

  const toolSearchData: ToolSearchData = {
    action: typeof data.action === 'string' ? data.action : 'search',
    query: typeof data.query === 'string' ? data.query : undefined,
    mode: typeof data.mode === 'string' ? data.mode : undefined,
    matches: matches.length > 0 ? matches : undefined,
    toolUsed: typeof data.tool_used === 'string' ? data.tool_used : undefined,
    result: data.result,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'tool-search',
    toolCallId,
    data: toolSearchData,
  };
}

/**
 * Parse k_help tool result into RichCard format
 */
function parseHelpToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // k_help returns three formats:
  // 1. Overview: {ok, tools_count, categories: {cat: [{tool, description, actions}]}, usage, tip}
  // 2. Specific from metadata: {ok, tool, description, actions: [...], keywords, examples, category}
  // 3. Specific from tool help action: {ok, tool, help: {...actual help data...}}

  // Unwrap nested help field if present (format 3)
  const helpContent = (typeof data.help === 'object' && data.help !== null)
    ? data.help as Record<string, unknown>
    : null;

  // Parse categories dict (overview mode)
  const categories = data.categories as Record<string, Array<Record<string, unknown>>> | undefined;
  const allTools: HelpToolEntry[] = [];
  if (categories && typeof categories === 'object') {
    for (const [_cat, tools] of Object.entries(categories)) {
      if (Array.isArray(tools)) {
        for (const t of tools) {
          allTools.push({
            name: String(t.tool || t.name || ''),
            description: String(t.description || ''),
            actions: Array.isArray(t.actions) ? t.actions.map(String) : undefined,
          });
        }
      }
    }
  }

  // Use helpContent (nested help field) if available, otherwise use data directly
  const src = helpContent || data;

  // Parse actions array into dict (specific tool mode)
  // k_help specific tool returns actions as array, not dict
  let actionsDict: Record<string, string> | undefined;
  const actionsSource = src.actions;
  if (Array.isArray(actionsSource)) {
    actionsDict = {};
    for (const action of actionsSource) {
      actionsDict[String(action)] = '';
    }
  } else if (typeof actionsSource === 'object' && actionsSource !== null) {
    actionsDict = actionsSource as Record<string, string>;
  }

  const helpData: HelpData = {
    tool: typeof data.tool === 'string' ? data.tool : undefined, // tool name is always at top level
    description: typeof src.description === 'string' ? src.description : undefined,
    actions: actionsDict,
    examples: Array.isArray(src.examples) ? src.examples.map(String) : undefined,
    keywords: Array.isArray(src.keywords) ? src.keywords.map(String) : undefined,
    allTools: allTools.length > 0 ? allTools : undefined,
    toolsCount: typeof data.tools_count === 'number' ? data.tools_count : undefined,
    usage: typeof src.usage === 'string' ? src.usage : undefined,
    tip: typeof src.tip === 'string' ? src.tip : undefined,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'help',
    toolCallId,
    data: helpData,
  };
}

/**
 * Parse k_graphiti_migrate tool result into RichCard format
 */
function parseGraphitiToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  const graphitiData: GraphitiData = {
    action: typeof data.action === 'string' ? data.action : 'status',
    status: typeof data.status === 'string' ? data.status : undefined,
    server: typeof data.server === 'string' ? data.server : undefined,
    dryRun: typeof data.dry_run === 'boolean' ? data.dry_run : undefined,
    checkpointCount: typeof data.checkpoint_count === 'number' ? data.checkpoint_count : undefined,
    worklogCount: typeof data.worklog_count === 'number' ? data.worklog_count : undefined,
    migrated: typeof data.migrated === 'number' ? data.migrated : undefined,
    failed: typeof data.failed === 'number' ? data.failed : undefined,
    error: typeof data.error === 'string' ? data.error : undefined,
  };

  return {
    id: `rich-${toolCallId}`,
    type: 'graphiti',
    toolCallId,
    data: graphitiData,
  };
}

/**
 * Parse k_askuserquestion tool result into RichCard format
 *
 * k_askuserquestion returns:
 * - On creation: {ok: true, data: {question_id, ...}} - shows interactive card
 * - On completion: {ok: true, data: {answers: {...}}} - shows answered state
 */
function parseAskUserQuestionToRichCard(toolCallId: string, result: unknown): RichCard | null {
  if (!result) return null;

  let data: Record<string, unknown>;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null) return null;
      data = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof result === 'object') {
    data = result as Record<string, unknown>;
  } else {
    return null;
  }

  // Unwrap nested data field if present
  const innerData = (typeof data.data === 'object' && data.data !== null)
    ? data.data as Record<string, unknown>
    : data;

  // Get question_id
  const questionId = typeof innerData.question_id === 'string'
    ? innerData.question_id
    : typeof data.question_id === 'string'
      ? data.question_id
      : '';

  if (!questionId) {
    console.log('[AskUserQuestion] No question_id found in result');
    return null;
  }

  // Parse questions array
  const questionsRaw = innerData.questions as Array<Record<string, unknown>> | undefined;
  const questions = questionsRaw?.map((q) => ({
    question: String(q.question || ''),
    header: String(q.header || 'Question'),
    multiSelect: typeof q.multiSelect === 'boolean' ? q.multiSelect : false,
    options: (q.options as Array<Record<string, unknown>> || []).map((opt) => ({
      label: String(opt.label || ''),
      description: typeof opt.description === 'string' ? opt.description : undefined,
    })),
  })) || [];

  // Get answers if already submitted
  const answers = innerData.answers as Record<string, string | string[]> | undefined;
  const submitted = answers !== undefined && Object.keys(answers).length > 0;

  console.log('[AskUserQuestion] Parsed card:', { questionId, questionsCount: questions.length, submitted });

  return {
    id: `rich-${toolCallId}`,
    type: 'askuserquestion',
    toolCallId,
    data: {
      questionId,
      questions,
      answers,
      submitted,
    },
  };
}

interface LMStudioChatState {
  // Panel state
  isPanelOpen: boolean;
  panelWidth: number;
  showConversationList: boolean;

  /**
   * @deprecated Use chatLock.getActiveView() from utils/cross-window-lock.ts instead.
   * This store-based state only works within a single window context.
   */
  activeView: AssistantViewType;

  // Connection state
  isConnected: boolean;
  connectionStatus: string;
  availableModels: string[];
  selectedModel: string;

  // Chat state
  messages: ChatMessage[];
  isSending: boolean;

  // Conversation management
  conversations: Conversation[];
  currentConversationId: string | null;

  // Streaming state
  isStreaming: boolean;
  streamingContent: string;
  abortController: AbortController | null;

  // Context state
  editorContext: EditorContext | null;
  includeContext: boolean;
  contextInfo: ContextInfo;

  // Tool support state
  availableTools: ToolSchema[];
  toolsLoading: boolean;
  toolsError: string | null;

  // PTY session state (for claude-cli-pty backend)
  ptySessionId: string | null;
  ptyPollingActive: boolean;

  // Actions
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  setPanelWidth: (width: number) => void;
  toggleConversationList: () => void;
  testConnection: () => Promise<boolean>;
  loadModels: () => Promise<void>;
  loadTools: () => Promise<void>;
  setModel: (model: string) => void;
  sendMessage: (content: string, images?: ImageAttachment[]) => Promise<void>;
  cancelStreaming: () => void;
  clearHistory: () => void;
  setEditorContext: (context: EditorContext | null) => void;
  setIncludeContext: (include: boolean) => void;

  // Conversation actions
  createNewConversation: (name?: string) => void;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, name: string) => void;
  exportConversationAsMarkdown: (id?: string) => string;

  // Mutual exclusion actions
  setActiveView: (view: AssistantViewType) => boolean;
  releaseActiveView: (view: AssistantViewType) => void;

  // PTY session actions
  setPtySessionId: (id: string | null) => void;
  sendMessageViaPty: (content: string) => Promise<void>;
}

const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateConversationId = () => `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Create a new conversation object
const createConversation = (name?: string): Conversation => ({
  id: generateConversationId(),
  name: name || `Chat ${new Date().toLocaleString()}`,
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const DEFAULT_CONTEXT_INFO: ContextInfo = {
  usedTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  maxTokens: 128000, // Match typical model context window
  percentage: 0,
};

// System prompt for code editor context
const CODE_EDITOR_SYSTEM_PROMPT = `You are a helpful AI coding assistant in the Kuroryuu Code Editor.

When the user shares code context:
- Reference specific line numbers when discussing code
- Suggest minimal, targeted changes
- Explain the reasoning behind suggestions

Keep responses concise and actionable. Use markdown for code blocks.`;

export const useLMStudioChatStore = create<LMStudioChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      isPanelOpen: false,
      panelWidth: 360,
      showConversationList: false,
      activeView: null,
      isConnected: false,
      connectionStatus: 'Not connected',
      availableModels: [],
      selectedModel: '',
      messages: [],
      isSending: false,
      conversations: [],
      currentConversationId: null,
      isStreaming: false,
      streamingContent: '',
      abortController: null,
      editorContext: null,
      includeContext: true,
      contextInfo: DEFAULT_CONTEXT_INFO,

      // Tool support
      availableTools: [],
      toolsLoading: false,
      toolsError: null,

      // PTY session state
      ptySessionId: null,
      ptyPollingActive: false,

      // Panel actions
      togglePanel: () => {
        const state = get();
        if (!state.isPanelOpen) {
          // When opening, sync model from domain config if not already set
          const domainConfig = useDomainConfigStore.getState().getConfigForDomain('code-editor');
          const currentModel = state.selectedModel;
          if (!currentModel && domainConfig.modelId) {
            set({ isPanelOpen: true, selectedModel: domainConfig.modelId });
            return;
          }
        }
        set({ isPanelOpen: !state.isPanelOpen });
      },

      setPanelOpen: (open: boolean) => {
        if (open) {
          // When opening, sync model from domain config if not already set
          const domainConfig = useDomainConfigStore.getState().getConfigForDomain('code-editor');
          const currentModel = get().selectedModel;
          if (!currentModel && domainConfig.modelId) {
            set({ isPanelOpen: true, selectedModel: domainConfig.modelId });
            return;
          }
        }
        set({ isPanelOpen: open });
      },

      setPanelWidth: (width: number) => set({ panelWidth: Math.max(280, Math.min(600, width)) }),

      toggleConversationList: () => set((state) => ({ showConversationList: !state.showConversationList })),

      // Connection actions
      testConnection: async () => {
        try {
          // Test Gateway health first (handles fallback chain)
          const gatewayRes = await fetch(`${GATEWAY_URL}/v1/health`);
          const gatewayOk = gatewayRes.ok;

          // Try to get active backend from Gateway API
          let activeBackendName = '';
          if (gatewayOk) {
            try {
              const backendRes = await fetch(`${GATEWAY_URL}/api/backends/current`, { signal: AbortSignal.timeout(2000) });
              if (backendRes.ok) {
                const data = await backendRes.json();
                if (data.ok && data.backend?.name) {
                  activeBackendName = data.backend.name;
                }
              }
            } catch { /* continue */ }
          }

          // Test LM Studio directly (with caching to avoid connection refused spam)
          let lmOk = false;
          if (_lmStudioAvailableCache && Date.now() - _lmStudioAvailableCache.timestamp < LMSTUDIO_CACHE_TTL) {
            lmOk = _lmStudioAvailableCache.available;
          } else {
            try {
              const lmRes = await fetch(`${LMSTUDIO_URL}/v1/models`, { signal: AbortSignal.timeout(2000) });
              lmOk = lmRes.ok;
              _lmStudioAvailableCache = { available: lmOk, timestamp: Date.now() };
            } catch {
              lmOk = false;
              _lmStudioAvailableCache = { available: false, timestamp: Date.now() };
            }
          }

          // Test CLIProxyAPI as fallback
          let cliproxyOk = false;
          try {
            const cliproxyRes = await fetch(`${CLIPROXYAPI_URL}/v1/models`, {
              headers: { 'Authorization': 'Bearer kuroryuu-local-key' },
              signal: AbortSignal.timeout(2000),
            });
            cliproxyOk = cliproxyRes.ok;
          } catch { cliproxyOk = false; }

          // Determine status message with backend indicator
          if (gatewayOk && lmOk) {
            const status = activeBackendName === 'lmstudio'
              ? '🟢 LMStudio (local)'
              : activeBackendName === 'cliproxyapi'
                ? '🔵 CLIProxy (Claude)'
                : '🟢 LMStudio';
            set({ isConnected: true, connectionStatus: status });
            await get().loadModels();
            return true;
          } else if (gatewayOk && cliproxyOk) {
            set({ isConnected: true, connectionStatus: '🔵 CLIProxy (Claude)' });
            await get().loadModels();
            return true;
          } else if (lmOk) {
            set({ isConnected: true, connectionStatus: '🟡 LMStudio (no Gateway)' });
            await get().loadModels();
            return true;
          } else if (cliproxyOk) {
            set({ isConnected: true, connectionStatus: '🟡 CLIProxy (no Gateway)' });
            return true;
          } else {
            set({ isConnected: false, connectionStatus: '🔴 No LLM backends' });
            return false;
          }
        } catch (error) {
          set({ isConnected: false, connectionStatus: '🔴 Connection failed' });
          return false;
        }
      },

      loadModels: async () => {
        // Check cache - if LM Studio was recently unavailable, don't retry
        if (_lmStudioAvailableCache &&
            !_lmStudioAvailableCache.available &&
            Date.now() - _lmStudioAvailableCache.timestamp < LMSTUDIO_CACHE_TTL) {
          return; // Skip - LM Studio is known to be unavailable
        }

        try {
          // Try to get loaded models first (LM Studio v0 API)
          const loadedRes = await fetch(`${LMSTUDIO_URL}/api/v0/models`, { signal: AbortSignal.timeout(3000) });
          if (loadedRes.ok) {
            _lmStudioAvailableCache = { available: true, timestamp: Date.now() };
            const data = await loadedRes.json();
            const models = (data.data || [])
              .filter((m: any) => {
                const id = String(m?.id ?? '');
                if (!id) return false;
                // Filter out embedding and flux models
                if (id.includes('embedding') || id.includes('flux')) return false;
                // Check if loaded
                const loadedContext = Number(m?.loaded_context_length);
                return Number.isFinite(loadedContext) && loadedContext > 0;
              })
              .map((m: any) => String(m.id));

            if (models.length > 0) {
              const currentModel = get().selectedModel;
              const validModel = models.includes(currentModel) ? currentModel : models[0];
              set({ availableModels: models, selectedModel: validModel });
              return;
            }
          }

          // Fallback to v1 models endpoint
          const res = await fetch(`${LMSTUDIO_URL}/v1/models`, { signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            _lmStudioAvailableCache = { available: true, timestamp: Date.now() };
            const data = await res.json();
            const models = (data.data || [])
              .map((m: { id: string }) => m.id)
              .filter((id: string) => !id.includes('embedding') && !id.includes('flux'));

            const currentModel = get().selectedModel;
            const validModel = models.includes(currentModel) ? currentModel : (models[0] || '');
            set({ availableModels: models, selectedModel: validModel });
          }
        } catch {
          // Cache the failure to avoid repeated connection refused spam
          _lmStudioAvailableCache = { available: false, timestamp: Date.now() };
        }
      },

      loadTools: async () => {
        set({ toolsLoading: true, toolsError: null });
        try {
          const response = await fetch(`${GATEWAY_URL}/v1/tools`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) {
            throw new Error(`Failed to load tools: ${response.status}`);
          }
          const data = await response.json();
          set({
            availableTools: data.tools || [],
            toolsLoading: false,
          });
          console.log(`[LMStudioChat] Loaded ${data.tools?.length || 0} MCP tools`);
        } catch (error) {
          console.error('[LMStudioChat] Failed to load tools:', error);
          set({
            toolsError: error instanceof Error ? error.message : 'Failed to load tools',
            toolsLoading: false,
            availableTools: [], // Clear tools on error
          });
        }
      },

      setModel: (model: string) => set({ selectedModel: model }),

      // Chat actions
      sendMessage: async (content: string, images?: ImageAttachment[]) => {
        const state = get();
        if ((!content.trim() && (!images || images.length === 0)) || state.isSending || state.isStreaming || !state.isConnected) return;

        // Create AbortController for cancellation
        const abortController = new AbortController();
        set({ isSending: true, isStreaming: true, streamingContent: '', abortController });

        // Build user message content with optional context
        let userContent = content;
        if (state.includeContext && state.editorContext) {
          const ctx = state.editorContext;
          userContent = `## Current File Context
- **Path**: ${ctx.filePath}
- **Language**: ${ctx.language}
- **Lines**: ${ctx.lineCount}

\`\`\`${ctx.language}
${ctx.content.length > 15000 ? ctx.content.slice(-15000) + '\n// ... (truncated)' : ctx.content}
\`\`\`

---

${content}`;
        }

        // Add user message to history
        const userMessage: ChatMessage = {
          id: generateId(),
          role: 'user',
          content,
          timestamp: Date.now(),
          contextIncluded: state.includeContext && !!state.editorContext,
          images: images && images.length > 0 ? images : undefined,
        };

        set((s) => ({ messages: [...s.messages, userMessage] }));

        // Helper: build API content for a message (multimodal array when images present)
        const buildApiContent = (text: string, imgs?: ImageAttachment[]): string | Array<Record<string, unknown>> => {
          if (!imgs || imgs.length === 0) return text;
          return [
            { type: 'text', text },
            ...imgs.map(img => ({
              type: 'image_url',
              image_url: { url: img.data },
            })),
          ];
        };

        try {
          // Build messages array for API (include images from prior messages too)
          const apiMessages = [
            { role: 'system', content: CODE_EDITOR_SYSTEM_PROMPT },
            ...state.messages.map((m) => ({ role: m.role, content: buildApiContent(m.content, m.images) })),
            { role: 'user', content: buildApiContent(userContent, images) },
          ];

          // Get domain config for code-editor chat - domainConfig is source of truth
          const domainConfig = useDomainConfigStore.getState().getConfigForDomain('code-editor');
          // Use domainConfig.modelId as source of truth (UI-selected), fall back to state.selectedModel only if empty
          const modelToUse = domainConfig.modelId || state.selectedModel;
          const backend = PROVIDER_TO_BACKEND[domainConfig.provider] || 'lmstudio';

          console.log('[LMStudioChat] Model selection:', {
            'domainConfig.modelId': domainConfig.modelId,
            'state.selectedModel': state.selectedModel,
            'modelToUse': modelToUse,
            'backend': backend,
            'provider': domainConfig.provider,
          });

          // Convert tools to OpenAI format for Gateway
          const toolsPayload = state.availableTools.length > 0
            ? state.availableTools.map(t => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
              }))
            : undefined;

          // Call Gateway v2 chat stream with full tool loop support
          const response = await fetch(`${GATEWAY_URL}/v2/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortController.signal,
            body: JSON.stringify({
              messages: apiMessages,
              model: modelToUse,
              stream: true,
              temperature: domainConfig.temperature,
              max_tokens: domainConfig.maxTokens,
              backend: backend || undefined, // Empty = use fallback chain
              tools: toolsPayload,
              // Pass conversation ID for persistent backends (claude-cli-pty)
              extra: {
                conversation_id: state.currentConversationId,
              },
            }),
          });

          if (!response.ok) {
            throw new Error(`Gateway error: ${response.status}`);
          }

          // Check if we got a streaming response
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
            // SSE streaming response
            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let fullContent = '';
            let buffer = '';
            let toolCalls: ToolCallData[] = [];
            const toolCallsInProgress: Map<string, ToolCallData> = new Map();

            // Track the assistant message ID for progressive updates
            let streamingAssistantMessageId: string | null = null;

            // Stream metadata from Gateway (real backend/model info)
            let streamMetadata: { backend?: string; model?: string } = {};

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              // Process complete SSE events from buffer
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);

                  // Skip [DONE] marker
                  if (data === '[DONE]') continue;

                  try {
                    const parsed = JSON.parse(data);

                    // V2 format: {"type": "metadata", "backend": "...", "model": "..."} for stream info
                    if (parsed.type === 'metadata') {
                      streamMetadata = {
                        backend: parsed.backend,
                        model: parsed.model,
                      };
                      console.log('[LMStudioChat] Stream metadata:', streamMetadata);
                      continue;
                    }

                    // V2 format: {"type": "delta", "text": "..."} for text chunks
                    if (parsed.type === 'delta' && parsed.text) {
                      // Apply filtering to incoming PTY chunks if they contain terminal artifacts
                      let cleanText = parsed.text;
                      if (hasTerminalArtifacts(parsed.text)) {
                        const filtered = filterTerminalOutput(parsed.text);
                        // Only use filtered version if it preserved some content
                        if (filtered && filtered.length > 0) {
                          cleanText = filtered;
                        }
                      }
                      fullContent += cleanText;
                      set({ streamingContent: fullContent });

                      // Also update progressive message if it exists (tool calls already shown)
                      if (streamingAssistantMessageId) {
                        const currentMessages = get().messages;
                        set({
                          messages: currentMessages.map(msg =>
                            msg.id === streamingAssistantMessageId
                              ? { ...msg, content: fullContent }
                              : msg
                          ),
                        });
                      }
                      continue;
                    }

                    // V2 format: {"type": "tool_start", "name": "...", "id": "..."} for tool start
                    if (parsed.type === 'tool_start') {
                      const newToolCall: ToolCallData = {
                        id: parsed.id || generateId(),
                        name: parsed.name || '',
                        arguments: parsed.arguments || {},
                        status: 'running',
                        startTime: Date.now(),
                      };
                      toolCallsInProgress.set(newToolCall.id, newToolCall);

                      // Progressive display: Create or update assistant message with tool call
                      const currentMessages = get().messages;

                      if (!streamingAssistantMessageId) {
                        // First tool call - create the assistant message
                        streamingAssistantMessageId = generateId();
                        const partialMessage: ChatMessage = {
                          id: streamingAssistantMessageId,
                          role: 'assistant',
                          content: fullContent,
                          timestamp: Date.now(),
                          toolCalls: [newToolCall],
                          isStreaming: true,
                        };
                        set({ messages: [...currentMessages, partialMessage], streamingContent: fullContent });
                      } else {
                        // Subsequent tool calls - update existing message
                        set({
                          messages: currentMessages.map(msg =>
                            msg.id === streamingAssistantMessageId
                              ? {
                                  ...msg,
                                  content: fullContent,
                                  toolCalls: [...(msg.toolCalls || []), newToolCall],
                                }
                              : msg
                          ),
                          streamingContent: fullContent,
                        });
                      }
                      continue;
                    }

                    // V2 format: {"type": "tool_end", "id": "...", "is_error": bool, "result": ...}
                    if (parsed.type === 'tool_end') {
                      // Debug: Log what we received
                      console.log('[RichCard] tool_end received:', {
                        id: parsed.id,
                        is_error: parsed.is_error,
                        resultType: typeof parsed.result,
                        hasEntries: parsed.result?.entries ? 'yes' : 'no',
                        hasFiles: parsed.result?.files ? 'yes' : 'no',
                        resultKeys: parsed.result && typeof parsed.result === 'object' ? Object.keys(parsed.result) : 'N/A',
                      });
                      const existing = toolCallsInProgress.get(parsed.id);
                      console.log('[RichCard] existing tool lookup:', existing?.name || 'NOT FOUND');
                      if (existing) {
                        existing.status = parsed.is_error ? 'error' : 'success';
                        existing.result = parsed.result;
                        existing.error = parsed.is_error ? parsed.error : undefined;
                        existing.endTime = Date.now();

                        // Update the message with new tool status
                        if (streamingAssistantMessageId) {
                          const currentMessages = get().messages;

                          // Check if rich visualizations are enabled and parse tool result
                          const settingsState = useSettingsStore.getState();
                          const enableRichViz = settingsState.appSettings?.enableRichToolVisualizations ?? false;
                          let newRichCard: RichCard | null = null;

                          console.log('[RichCard] enableRichViz:', enableRichViz, 'is_error:', parsed.is_error);
                          if (enableRichViz && !parsed.is_error) {
                            // Check for MCP tools (exact match or contains for namespaced tools)
                            const toolName = existing.name || '';
                            console.log('[RichCard] Checking tool name:', toolName);
                            const isKRagTool = toolName === 'k_rag' || toolName.includes('k_rag');
                            const isKFilesTool = toolName === 'k_files' || toolName.includes('k_files');
                            const isKRepoIntelTool = toolName === 'k_repo_intel' || toolName.includes('k_repo_intel');
                            const isKPtyTool = toolName === 'k_pty' || toolName.includes('k_pty');
                            const isKCheckpointTool = toolName === 'k_checkpoint' || toolName.includes('k_checkpoint');
                            const isKSessionTool = toolName === 'k_session' || toolName.includes('k_session');
                            const isKInboxTool = toolName === 'k_inbox' || toolName.includes('k_inbox');
                            const isKMemoryTool = toolName === 'k_memory' || toolName.includes('k_memory');
                            const isKCollectiveTool = toolName === 'k_collective' || toolName.includes('k_collective');
                            const isKBashTool = toolName === 'k_bash' || toolName.includes('k_bash');
                            const isKProcessTool = toolName === 'k_process' || toolName.includes('k_process');
                            const isKCaptureTool = toolName === 'k_capture' || toolName.includes('k_capture');
                            const isKThinkerTool = toolName === 'k_thinker_channel' || toolName.includes('k_thinker');
                            // Note: k_hooks doesn't exist - hooks are part of k_session (handled by SessionCard)
                            const isKPCControlTool = toolName === 'k_pccontrol' || toolName.includes('k_pccontrol');
                            const isKMCPToolSearchTool = toolName === 'k_MCPTOOLSEARCH' || toolName.includes('MCPTOOLSEARCH');
                            const isKHelpTool = toolName === 'k_help' && !toolName.includes('k_hooks'); // Avoid false match
                            const isKGraphitiTool = toolName === 'k_graphiti_migrate' || toolName.includes('k_graphiti');
                            const isKAskUserQuestionTool = toolName === 'k_askuserquestion' || toolName.includes('askuserquestion');

                            if (isKRagTool) {
                              newRichCard = parseRAGResultToRichCard(parsed.id, parsed.result);
                            } else if (isKFilesTool) {
                              newRichCard = parseFileTreeToRichCard(parsed.id, parsed.result);
                            } else if (isKRepoIntelTool) {
                              newRichCard = parseSymbolMapToRichCard(parsed.id, parsed.result);
                            } else if (isKPtyTool) {
                              newRichCard = parseTerminalToRichCard(parsed.id, parsed.result);
                            } else if (isKCheckpointTool) {
                              newRichCard = parseCheckpointToRichCard(parsed.id, parsed.result);
                            } else if (isKSessionTool) {
                              newRichCard = parseSessionToRichCard(parsed.id, parsed.result);
                            } else if (isKInboxTool) {
                              newRichCard = parseInboxToRichCard(parsed.id, parsed.result);
                            } else if (isKMemoryTool) {
                              newRichCard = parseMemoryToRichCard(parsed.id, parsed.result);
                            } else if (isKCollectiveTool) {
                              newRichCard = parseCollectiveToRichCard(parsed.id, parsed.result);
                            } else if (isKBashTool) {
                              newRichCard = parseBashToRichCard(parsed.id, parsed.result);
                            } else if (isKProcessTool) {
                              newRichCard = parseProcessToRichCard(parsed.id, parsed.result);
                            } else if (isKCaptureTool) {
                              newRichCard = parseCaptureToRichCard(parsed.id, parsed.result);
                            } else if (isKThinkerTool) {
                              newRichCard = parseThinkerToRichCard(parsed.id, parsed.result);
                            } else if (isKPCControlTool) {
                              newRichCard = parsePCControlToRichCard(parsed.id, parsed.result);
                            } else if (isKMCPToolSearchTool) {
                              newRichCard = parseToolSearchToRichCard(parsed.id, parsed.result);
                            } else if (isKHelpTool) {
                              newRichCard = parseHelpToRichCard(parsed.id, parsed.result);
                            } else if (isKGraphitiTool) {
                              newRichCard = parseGraphitiToRichCard(parsed.id, parsed.result);
                            } else if (isKAskUserQuestionTool) {
                              newRichCard = parseAskUserQuestionToRichCard(parsed.id, parsed.result);
                            }
                            console.log('[RichCard] Parser result:', newRichCard ? `${newRichCard.type} card created` : 'null (parser returned nothing)');
                          }

                          set({
                            messages: currentMessages.map(msg =>
                              msg.id === streamingAssistantMessageId
                                ? {
                                    ...msg,
                                    toolCalls: msg.toolCalls?.map(tc =>
                                      tc.id === parsed.id ? { ...existing } : tc
                                    ),
                                    // Add rich card if parsed successfully
                                    richCards: newRichCard
                                      ? [...(msg.richCards || []), newRichCard]
                                      : msg.richCards,
                                  }
                                : msg
                            ),
                          });
                        }
                      }
                      continue;
                    }

                    // V2 format: {"type": "done", ...} for completion
                    if (parsed.type === 'done') {
                      // Extract usage info if available
                      if (parsed.usage) {
                        const usage = parsed.usage;
                        const usedTokens = usage.prompt_tokens || 0;
                        const completionTokens = usage.completion_tokens || 0;
                        const maxTokens = get().contextInfo.maxTokens;
                        set({
                          contextInfo: {
                            usedTokens,
                            completionTokens,
                            totalTokens: usage.total_tokens || usedTokens + completionTokens,
                            maxTokens,
                            percentage: usedTokens / maxTokens,
                          },
                        });

                        // Extract PTY session ID for claude-cli-pty backend integration
                        if (usage.pty_session_id) {
                          console.log('[LMStudioChat] Got PTY session ID:', usage.pty_session_id);
                          get().setPtySessionId(usage.pty_session_id);
                        }
                      }
                      continue;
                    }

                    // V2 format: {"type": "error", "message": "..."}
                    if (parsed.type === 'error') {
                      console.error('[LMStudioChat] Stream error:', parsed.message);
                      continue;
                    }

                    // V2 format: {"type": "info", ...} - informational events
                    if (parsed.type === 'info') {
                      console.log('[LMStudioChat] Info:', parsed.message);
                      continue;
                    }

                    // Fallback: Handle OpenAI format for backwards compatibility
                    const delta = parsed.choices?.[0]?.delta?.content || parsed.content || '';
                    if (delta) {
                      fullContent += delta;
                      set({ streamingContent: fullContent });
                    }

                    // Parse tool calls from OpenAI format (fallback)
                    const deltaToolCalls = parsed.choices?.[0]?.delta?.tool_calls;
                    if (deltaToolCalls && Array.isArray(deltaToolCalls)) {
                      for (const tc of deltaToolCalls) {
                        const tcId = tc.id || tc.index?.toString() || generateId();
                        if (!toolCallsInProgress.has(tcId)) {
                          const newToolCall: ToolCallData = {
                            id: tcId,
                            name: tc.function?.name || '',
                            arguments: {},
                            status: 'running',
                            startTime: Date.now(),
                          };
                          toolCallsInProgress.set(tcId, newToolCall);
                        }
                        const existing = toolCallsInProgress.get(tcId)!;
                        if (tc.function?.name) {
                          existing.name = tc.function.name;
                        }
                        if (tc.function?.arguments) {
                          const argsStr = (existing as any)._argsBuffer || '';
                          (existing as any)._argsBuffer = argsStr + tc.function.arguments;
                          try {
                            existing.arguments = JSON.parse((existing as any)._argsBuffer);
                          } catch {
                            // Not complete JSON yet
                          }
                        }
                      }
                    }

                    // Check for usage info in OpenAI format
                    if (parsed.usage) {
                      const usage = parsed.usage;
                      const usedTokens = usage.prompt_tokens || 0;
                      const completionTokens = usage.completion_tokens || 0;
                      const maxTokens = get().contextInfo.maxTokens;
                      set({
                        contextInfo: {
                          usedTokens,
                          completionTokens,
                          totalTokens: usage.total_tokens || usedTokens + completionTokens,
                          maxTokens,
                          percentage: usedTokens / maxTokens,
                        },
                      });
                    }
                  } catch {
                    // Non-JSON data, might be plain text delta
                    if (data.trim()) {
                      fullContent += data;
                      set({ streamingContent: fullContent });
                    }
                  }
                }
              }
            }

            // Finalize tool calls from in-progress map
            for (const tc of toolCallsInProgress.values()) {
              if (tc.status === 'running') {
                tc.status = 'pending'; // Mark incomplete ones as pending
              }
              delete (tc as any)._argsBuffer;
              toolCalls.push(tc);
            }

            // Stream complete - add assistant message with model/provider metadata
            // Get model display info from registry if available
            const domainModels = useDomainConfigStore.getState().availableModels;
            const modelInfo = streamMetadata.model
              ? domainModels.find(m => m.id === streamMetadata.model)
              : undefined;

            // Strip user input echo if present (PTY backends echo the input back)
            // Safety: only attempt stripping if we have meaningful content
            let finalContent = fullContent;
            if (finalContent && content && finalContent.length > 10) {
              const stripped = stripInputEcho(finalContent, content);
              // Only use stripped version if it has meaningful content
              if (stripped && stripped.length > 0) {
                finalContent = stripped;
              }
            }

            // Auto-clear at 80% (but only if we have valid usage data)
            const currentInfo = get().contextInfo;
            const hasValidUsage = currentInfo.usedTokens > 0 && currentInfo.maxTokens > 0;

            if (streamingAssistantMessageId) {
              // Progressive message exists - finalize it with metadata
              const finalMessageFields = {
                content: finalContent || (toolCalls.length > 0 ? '' : 'No response received.'),
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                model: streamMetadata.model,
                provider: streamMetadata.backend,
                modelName: modelInfo?.name || streamMetadata.model,
                source: modelInfo?.source || (streamMetadata.model ? inferSourceFromId(streamMetadata.model) : undefined),
                isStreaming: false,
              };

              if (hasValidUsage && currentInfo.percentage >= 0.8) {
                console.log('[LMStudioChat] Context at 80%, clearing history');
                const currentMessages = get().messages;
                const existingMsg = currentMessages.find(m => m.id === streamingAssistantMessageId);
                if (existingMsg) {
                  set({
                    messages: [userMessage, { ...existingMsg, ...finalMessageFields }],
                    contextInfo: DEFAULT_CONTEXT_INFO,
                    isSending: false,
                    isStreaming: false,
                    streamingContent: '',
                    abortController: null,
                  });
                }
              } else {
                set((s) => ({
                  messages: s.messages.map(msg =>
                    msg.id === streamingAssistantMessageId
                      ? { ...msg, ...finalMessageFields }
                      : msg
                  ),
                  isSending: false,
                  isStreaming: false,
                  streamingContent: '',
                  abortController: null,
                }));
              }
            } else {
              // No progressive message - create new assistant message (no tools were called)
              const assistantMessage: ChatMessage = {
                id: generateId(),
                role: 'assistant',
                content: finalContent || 'No response received.',
                timestamp: Date.now(),
                model: streamMetadata.model,
                provider: streamMetadata.backend,
                modelName: modelInfo?.name || streamMetadata.model,
                source: modelInfo?.source || (streamMetadata.model ? inferSourceFromId(streamMetadata.model) : undefined),
              };

              if (hasValidUsage && currentInfo.percentage >= 0.8) {
                console.log('[LMStudioChat] Context at 80%, clearing history');
                set({
                  messages: [userMessage, assistantMessage],
                  contextInfo: DEFAULT_CONTEXT_INFO,
                  isSending: false,
                  isStreaming: false,
                  streamingContent: '',
                  abortController: null,
                });
              } else {
                set((s) => ({
                  messages: [...s.messages, assistantMessage],
                  isSending: false,
                  isStreaming: false,
                  streamingContent: '',
                  abortController: null,
                }));
              }
            }
          } else {
            // Non-streaming JSON response (fallback)
            const data = await response.json();
            const assistantContent = data.content || 'No response received.';

            // Update token usage if available
            if (data.usage) {
              const usage = data.usage;
              const usedTokens = usage.prompt_tokens || 0;
              const completionTokens = usage.completion_tokens || 0;
              const maxTokens = state.contextInfo.maxTokens;
              set({
                contextInfo: {
                  usedTokens,
                  completionTokens,
                  totalTokens: usage.total_tokens || usedTokens + completionTokens,
                  maxTokens,
                  percentage: usedTokens / maxTokens,
                },
              });

              // Auto-clear at 80%
              if (usedTokens / maxTokens >= 0.8) {
                console.log('[LMStudioChat] Context at 80%, clearing history');
                set({ messages: [], contextInfo: DEFAULT_CONTEXT_INFO });
              }
            }

            // Add assistant message with model/provider metadata
            // Non-streaming fallback uses configured values since no metadata event
            const domainConfig = useDomainConfigStore.getState().getConfigForDomain('code-editor');
            const fallbackModel = domainConfig.modelId || state.selectedModel;

            const assistantMessage: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: assistantContent,
              timestamp: Date.now(),
              // Use configured values for non-streaming fallback
              model: fallbackModel,
              provider: backend,
              modelName: domainConfig.modelName || fallbackModel,
              source: fallbackModel ? inferSourceFromId(fallbackModel) : undefined,
            };

            set((s) => ({
              messages: [...s.messages, assistantMessage],
              isSending: false,
              isStreaming: false,
              streamingContent: '',
              abortController: null,
            }));
          }
        } catch (error) {
          // Handle abort specifically
          if (error instanceof Error && error.name === 'AbortError') {
            console.log('[LMStudioChat] Request cancelled');
            const cancelledContent = get().streamingContent;

            // If we have partial content, save it as a cancelled message
            if (cancelledContent.trim()) {
              const partialMessage: ChatMessage = {
                id: generateId(),
                role: 'assistant',
                content: cancelledContent + '\n\n*(Response cancelled)*',
                timestamp: Date.now(),
              };
              set((s) => ({
                messages: [...s.messages, partialMessage],
                isSending: false,
                isStreaming: false,
                streamingContent: '',
                abortController: null,
              }));
            } else {
              set({
                isSending: false,
                isStreaming: false,
                streamingContent: '',
                abortController: null,
              });
            }
            return;
          }

          console.error('[LMStudioChat] Send error:', error);

          // Add error message
          const errorMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
            timestamp: Date.now(),
          };

          set((s) => ({
            messages: [...s.messages, errorMessage],
            isSending: false,
            isStreaming: false,
            streamingContent: '',
            abortController: null,
          }));
        }
      },

      cancelStreaming: () => {
        const { abortController } = get();
        if (abortController) {
          abortController.abort();
        }
      },

      clearHistory: () => {
        const state = get();
        // Save current conversation before clearing
        if (state.currentConversationId && state.messages.length > 0) {
          const conversations = state.conversations.map((c) =>
            c.id === state.currentConversationId
              ? { ...c, messages: [], updatedAt: Date.now() }
              : c
          );
          set({ messages: [], contextInfo: DEFAULT_CONTEXT_INFO, conversations });
        } else {
          set({ messages: [], contextInfo: DEFAULT_CONTEXT_INFO });
        }
      },

      // Context actions
      setEditorContext: (context: EditorContext | null) => set({ editorContext: context }),

      setIncludeContext: (include: boolean) => set({ includeContext: include }),

      // Conversation management actions
      createNewConversation: (name?: string) => {
        const state = get();

        // Save current conversation first
        let conversations = state.conversations;
        if (state.currentConversationId && state.messages.length > 0) {
          conversations = conversations.map((c) =>
            c.id === state.currentConversationId
              ? {
                  ...c,
                  messages: state.messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
                  updatedAt: Date.now(),
                }
              : c
          );
        }

        // Create new conversation
        const newConv = createConversation(name);
        conversations = [newConv, ...conversations].slice(0, MAX_CONVERSATIONS);

        set({
          conversations,
          currentConversationId: newConv.id,
          messages: [],
          contextInfo: DEFAULT_CONTEXT_INFO,
        });
      },

      switchConversation: (id: string) => {
        const state = get();
        const targetConv = state.conversations.find((c) => c.id === id);
        if (!targetConv) return;

        // Save current conversation first
        let conversations = state.conversations;
        if (state.currentConversationId && state.messages.length > 0) {
          conversations = conversations.map((c) =>
            c.id === state.currentConversationId
              ? {
                  ...c,
                  messages: state.messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
                  updatedAt: Date.now(),
                }
              : c
          );
        }

        set({
          conversations,
          currentConversationId: id,
          messages: targetConv.messages,
          contextInfo: DEFAULT_CONTEXT_INFO,
        });
      },

      deleteConversation: (id: string) => {
        const state = get();
        const conversations = state.conversations.filter((c) => c.id !== id);

        // If deleting current conversation, switch to another or clear
        if (state.currentConversationId === id) {
          const nextConv = conversations[0];
          set({
            conversations,
            currentConversationId: nextConv?.id || null,
            messages: nextConv?.messages || [],
            contextInfo: DEFAULT_CONTEXT_INFO,
          });
        } else {
          set({ conversations });
        }
      },

      renameConversation: (id: string, name: string) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, name, updatedAt: Date.now() } : c
          ),
        }));
      },

      exportConversationAsMarkdown: (id?: string) => {
        const state = get();
        const targetId = id || state.currentConversationId;

        let messages: ChatMessage[];
        let convName: string;

        if (targetId) {
          const conv = state.conversations.find((c) => c.id === targetId);
          messages = conv?.messages || state.messages;
          convName = conv?.name || 'Chat Export';
        } else {
          messages = state.messages;
          convName = 'Chat Export';
        }

        // Build markdown
        const lines: string[] = [
          `# ${convName}`,
          '',
          `*Exported on ${new Date().toLocaleString()}*`,
          '',
          '---',
          '',
        ];

        for (const msg of messages) {
          const time = new Date(msg.timestamp).toLocaleTimeString();
          const role = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'AI' : msg.role;

          lines.push(`### ${role} (${time})`);
          lines.push('');
          lines.push(msg.content);
          lines.push('');

          // Add tool calls if present
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            lines.push('**Tool Calls:**');
            for (const tc of msg.toolCalls) {
              lines.push(`- \`${tc.name}\`: ${tc.status}`);
            }
            lines.push('');
          }
        }

        return lines.join('\n');
      },

      /**
       * @deprecated Use chatLock from utils/cross-window-lock.ts instead.
       * This store-based lock only works within a single window context.
       * The cross-window lock uses BroadcastChannel + localStorage to work
       * across multiple Electron BrowserWindows.
       */
      setActiveView: (view: AssistantViewType) => {
        const current = get().activeView;
        // If another view already has the lock, deny
        if (current && current !== view) {
          return false;
        }
        set({ activeView: view });
        return true;
      },

      /**
       * @deprecated Use chatLock from utils/cross-window-lock.ts instead.
       * This store-based lock only works within a single window context.
       */
      releaseActiveView: (view: AssistantViewType) => {
        const current = get().activeView;
        // Only release if this view owns the lock
        if (current === view) {
          set({ activeView: null });
        }
      },

      // PTY session actions
      setPtySessionId: (id: string | null) => {
        set({ ptySessionId: id });
        // Persist to localStorage for session recovery
        if (id) {
          localStorage.setItem('insights-pty-session', id);
        } else {
          localStorage.removeItem('insights-pty-session');
        }
      },

      /**
       * Send a message to the Claude CLI via PTY
       * This is used when the selected model is claude-cli-pty
       */
      sendMessageViaPty: async (content: string) => {
        const state = get();
        if (!content.trim() || state.isSending || state.isStreaming) return;
        if (!state.ptySessionId) {
          console.error('[LMStudioChat] No PTY session available');
          return;
        }

        set({ isSending: true, isStreaming: true, streamingContent: '' });

        // Add user message to history
        const userMessage: ChatMessage = {
          id: generateId(),
          role: 'user',
          content,
          timestamp: Date.now(),
        };

        set((s) => ({ messages: [...s.messages, userMessage] }));

        try {
          // Send message to PTY via IPC
          const ptyId = state.ptySessionId;
          await (window as any).electronAPI?.pty?.write(ptyId, content + '\r');

          // Start polling for response
          set({ ptyPollingActive: true });
          let accumulated = '';
          let lastLength = 0;
          let idleCount = 0;
          const maxIdleCount = 30; // 30 * 200ms = 6 seconds of no new output
          const maxWait = 120000; // 2 minute max
          const startTime = Date.now();

          const pollForOutput = async () => {
            if (Date.now() - startTime > maxWait) {
              // Timeout - finalize with what we have
              finalizeMessage(accumulated);
              return;
            }

            try {
              // Read from PTY via k_pty MCP tool through Gateway
              const result = await fetch(`${GATEWAY_URL}/v1/mcp/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tool: 'k_pty',
                  arguments: {
                    action: 'term_read',
                    session_id: ptyId,
                    mode: 'delta',
                    max_chars: 8192,
                  },
                }),
              });

              if (result.ok) {
                const data = await result.json();
                if (data.result?.content) {
                  accumulated += data.result.content;
                  set({ streamingContent: accumulated });
                }
              }

              // Check for idle (no new output)
              if (accumulated.length === lastLength) {
                idleCount++;
              } else {
                idleCount = 0;
                lastLength = accumulated.length;
              }

              // Finalize when idle for a while (response complete)
              if (idleCount >= maxIdleCount && accumulated.length > 0) {
                finalizeMessage(accumulated);
                return;
              }

              // Continue polling
              if (get().ptyPollingActive) {
                setTimeout(pollForOutput, 200);
              }
            } catch (err) {
              console.error('[LMStudioChat] PTY poll error:', err);
              // Continue polling on transient errors
              if (get().ptyPollingActive) {
                setTimeout(pollForOutput, 500);
              }
            }
          };

          const finalizeMessage = (rawContent: string) => {
            set({ ptyPollingActive: false });

            // Import filter function dynamically to avoid circular deps
            const filterTerminalOutput = (text: string) => {
              // Basic ANSI stripping - full filter imported in component
              return text
                .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
                .replace(/\x1b[^[\]].?/g, '')
                .trim();
            };

            const filteredContent = filterTerminalOutput(rawContent);

            const assistantMessage: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: filteredContent || 'No response received.',
              timestamp: Date.now(),
              model: 'claude-cli-pty',
              provider: 'claude-cli-pty',
              modelName: 'Claude (PTY)',
              source: 'claude',
            };

            set((s) => ({
              messages: [...s.messages, assistantMessage],
              isSending: false,
              isStreaming: false,
              streamingContent: '',
            }));
          };

          // Start polling
          pollForOutput();
        } catch (error) {
          console.error('[LMStudioChat] PTY send error:', error);

          const errorMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: `Error: ${error instanceof Error ? error.message : 'PTY communication failed'}`,
            timestamp: Date.now(),
          };

          set((s) => ({
            messages: [...s.messages, errorMessage],
            isSending: false,
            isStreaming: false,
            streamingContent: '',
            ptyPollingActive: false,
          }));
        }
      },
    }),
    {
      name: 'lmstudio-chat-storage',
      partialize: (state) => ({
        isPanelOpen: state.isPanelOpen,
        panelWidth: state.panelWidth,
        selectedModel: state.selectedModel,
        includeContext: state.includeContext,
        showConversationList: state.showConversationList,
        // Persist conversations with limited messages
        conversations: state.conversations.map((c) => ({
          ...c,
          messages: c.messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
        })).slice(0, MAX_CONVERSATIONS),
        currentConversationId: state.currentConversationId,
        // Persist PTY session ID for recovery
        ptySessionId: state.ptySessionId,
      }),
    }
  )
);
