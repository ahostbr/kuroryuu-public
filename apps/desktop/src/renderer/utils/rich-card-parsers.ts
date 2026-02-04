/**
 * Rich Card Parsers - Shared utility for parsing MCP tool results into RichCard format
 *
 * Used by both Insights.tsx and lmstudio-chat-store.ts
 */

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
} from '../types/insights';

/**
 * Parse k_rag tool result into RichCard format
 */
export function parseRAGResultToRichCard(toolCallId: string, result: unknown): RichCard | null {
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

  if (!data.matches || !Array.isArray(data.matches)) return null;

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
export function parseFileTreeToRichCard(toolCallId: string, result: unknown): RichCard | null {
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

  const fileList = data.files || data.entries || data.results;
  if (!fileList || !Array.isArray(fileList)) return null;

  const files: FileTreeEntry[] = fileList.slice(0, 100).map((f) => {
    if (typeof f === 'string') {
      const isDir = f.endsWith('/');
      const name = isDir ? f.slice(0, -1) : f;
      return {
        path: name,
        type: isDir ? 'directory' as const : 'file' as const,
      };
    }
    const obj = f as Record<string, unknown>;
    return {
      path: String(obj.path || obj.name || ''),
      type: (obj.type === 'directory' || obj.is_dir || obj.isDirectory) ? 'directory' as const : 'file' as const,
      size: typeof obj.size === 'number' ? obj.size : undefined,
    };
  });

  const treeData: FileTreeData = {
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
export function parseSymbolMapToRichCard(toolCallId: string, result: unknown): RichCard | null {
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

  const symbolList = data.symbols || data.definitions || data.functions || data.classes || data.results;
  if (!symbolList || !Array.isArray(symbolList)) return null;

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
export function parseTerminalToRichCard(toolCallId: string, result: unknown): RichCard | null {
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
export function parseCheckpointToRichCard(toolCallId: string, result: unknown): RichCard | null {
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
export function parseSessionToRichCard(toolCallId: string, result: unknown): RichCard | null {
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
export function parseInboxToRichCard(toolCallId: string, result: unknown): RichCard | null {
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
export function parseMemoryToRichCard(toolCallId: string, result: unknown): RichCard | null {
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
export function parseCollectiveToRichCard(toolCallId: string, result: unknown): RichCard | null {
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
export function parseBashToRichCard(toolCallId: string, result: unknown): RichCard | null {
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
export function parseProcessToRichCard(toolCallId: string, result: unknown): RichCard | null {
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
export function parseCaptureToRichCard(toolCallId: string, result: unknown): RichCard | null {
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

  const monitorList = data.monitors as Array<Record<string, unknown>> | undefined;
  const monitors: CaptureMonitor[] = monitorList?.map((m) => ({
    id: typeof m.id === 'number' ? m.id : 0,
    name: String(m.name || ''),
    width: typeof m.width === 'number' ? m.width : 0,
    height: typeof m.height === 'number' ? m.height : 0,
    primary: typeof m.primary === 'boolean' ? m.primary : undefined,
  })) || [];

  const dims = data.dimensions as Record<string, unknown> | undefined;
  const dimensions = dims ? {
    width: typeof dims.width === 'number' ? dims.width : 0,
    height: typeof dims.height === 'number' ? dims.height : 0,
  } : undefined;

  const captureData: CaptureData = {
    action: typeof data.action === 'string' ? data.action : 'screenshot',
    imagePath: typeof data.image_path === 'string' ? data.image_path : (typeof data.path === 'string' ? data.path : undefined),
    timestamp: typeof data.timestamp === 'string' ? data.timestamp : undefined,
    dimensions,
    monitors: monitors.length > 0 ? monitors : undefined,
    status: typeof data.status === 'string' ? data.status : undefined,
    base64: typeof data.base64 === 'string' ? data.base64 : undefined,
    mimeType: typeof data.mime_type === 'string' ? data.mime_type : (typeof data.mimeType === 'string' ? data.mimeType : undefined),
  };

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
export function parseThinkerToRichCard(toolCallId: string, result: unknown): RichCard | null {
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
export function parseHooksToRichCard(toolCallId: string, result: unknown): RichCard | null {
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
export function parsePCControlToRichCard(toolCallId: string, result: unknown): RichCard | null {
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

  const windowList = data.windows as Array<Record<string, unknown>> | undefined;
  const windows: PCWindow[] = windowList?.slice(0, 20).map((w) => ({
    title: String(w.title || ''),
    handle: typeof w.handle === 'string' ? w.handle : undefined,
    className: typeof w.class_name === 'string' ? w.class_name : undefined,
    rect: typeof w.rect === 'object' ? w.rect as { x: number; y: number; width: number; height: number } : undefined,
  })) || [];

  const el = data.element as Record<string, unknown> | undefined;
  const element: PCElement | undefined = el ? {
    name: typeof el.name === 'string' ? el.name : undefined,
    type: typeof el.type === 'string' ? el.type : undefined,
    bounds: typeof el.bounds === 'object' ? el.bounds as { x: number; y: number; width: number; height: number } : undefined,
  } : undefined;

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
export function parseToolSearchToRichCard(toolCallId: string, result: unknown): RichCard | null {
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
export function parseHelpToRichCard(toolCallId: string, result: unknown): RichCard | null {
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

  const toolList = data.all_tools as Array<Record<string, unknown>> | undefined;
  const allTools: HelpToolEntry[] = toolList?.map((t) => ({
    name: String(t.name || ''),
    description: String(t.description || ''),
    actions: Array.isArray(t.actions) ? t.actions.map(String) : undefined,
  })) || [];

  const helpData: HelpData = {
    tool: typeof data.tool === 'string' ? data.tool : undefined,
    description: typeof data.description === 'string' ? data.description : undefined,
    actions: typeof data.actions === 'object' ? data.actions as Record<string, string> : undefined,
    examples: Array.isArray(data.examples) ? data.examples.map(String) : undefined,
    allTools: allTools.length > 0 ? allTools : undefined,
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
export function parseGraphitiToRichCard(toolCallId: string, result: unknown): RichCard | null {
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
 * Router function - parses tool result based on tool name
 * Returns null if the tool is not recognized or parsing fails
 */
export function parseToolResultToRichCard(toolName: string, toolCallId: string, result: unknown): RichCard | null {
  // Normalize tool name for matching
  const normalizedName = toolName.toLowerCase();

  // k_rag
  if (normalizedName === 'k_rag' || normalizedName.includes('k_rag')) {
    return parseRAGResultToRichCard(toolCallId, result);
  }

  // k_files
  if (normalizedName === 'k_files' || normalizedName.includes('k_files')) {
    return parseFileTreeToRichCard(toolCallId, result);
  }

  // k_repo_intel
  if (normalizedName === 'k_repo_intel' || normalizedName.includes('k_repo_intel')) {
    return parseSymbolMapToRichCard(toolCallId, result);
  }

  // k_pty
  if (normalizedName === 'k_pty' || normalizedName.includes('k_pty')) {
    return parseTerminalToRichCard(toolCallId, result);
  }

  // k_checkpoint
  if (normalizedName === 'k_checkpoint' || normalizedName.includes('k_checkpoint')) {
    return parseCheckpointToRichCard(toolCallId, result);
  }

  // k_session (also handles hooks display)
  if (normalizedName === 'k_session' || normalizedName.includes('k_session')) {
    // Try session first, fall back to hooks if it has hooks data
    const sessionCard = parseSessionToRichCard(toolCallId, result);
    if (sessionCard) return sessionCard;
    return parseHooksToRichCard(toolCallId, result);
  }

  // k_inbox
  if (normalizedName === 'k_inbox' || normalizedName.includes('k_inbox')) {
    return parseInboxToRichCard(toolCallId, result);
  }

  // k_memory
  if (normalizedName === 'k_memory' || normalizedName.includes('k_memory')) {
    return parseMemoryToRichCard(toolCallId, result);
  }

  // k_collective
  if (normalizedName === 'k_collective' || normalizedName.includes('k_collective')) {
    return parseCollectiveToRichCard(toolCallId, result);
  }

  // k_bash
  if (normalizedName === 'k_bash' || normalizedName.includes('k_bash')) {
    return parseBashToRichCard(toolCallId, result);
  }

  // k_process
  if (normalizedName === 'k_process' || normalizedName.includes('k_process')) {
    return parseProcessToRichCard(toolCallId, result);
  }

  // k_capture
  if (normalizedName === 'k_capture' || normalizedName.includes('k_capture')) {
    return parseCaptureToRichCard(toolCallId, result);
  }

  // k_thinker_channel
  if (normalizedName === 'k_thinker_channel' || normalizedName.includes('k_thinker')) {
    return parseThinkerToRichCard(toolCallId, result);
  }

  // k_pccontrol
  if (normalizedName === 'k_pccontrol' || normalizedName.includes('k_pccontrol')) {
    return parsePCControlToRichCard(toolCallId, result);
  }

  // k_MCPTOOLSEARCH (case insensitive)
  if (normalizedName === 'k_mcptoolsearch' || normalizedName.includes('mcptoolsearch')) {
    return parseToolSearchToRichCard(toolCallId, result);
  }

  // k_help
  if (normalizedName === 'k_help' || normalizedName.includes('k_help')) {
    return parseHelpToRichCard(toolCallId, result);
  }

  // k_graphiti_migrate
  if (normalizedName === 'k_graphiti_migrate' || normalizedName.includes('k_graphiti')) {
    return parseGraphitiToRichCard(toolCallId, result);
  }

  return null;
}
