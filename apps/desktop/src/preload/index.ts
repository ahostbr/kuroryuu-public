import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron';

export interface PtyProcess {
  id: string;
  pid: number;
  cols: number;
  rows: number;
  cwd: string;
  sessionId?: string; // Kuroryuu session ID (e.g., "claude_abc123")
}

export interface CreatePtyOptions {
  cmd?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  // Ownership metadata for targeted routing
  ownerAgentId?: string;
  ownerSessionId?: string;
  ownerRole?: 'leader' | 'worker';
  label?: string;
  title?: string;      // Human-friendly terminal title
  cliType?: string;    // CLI type: 'shell', 'claude', 'kiro', etc.
}

export interface McpToolResult {
  ok?: boolean;
  error?: string;
  result?: unknown;
}

export interface GatewayHealthResult {
  ok: boolean;
  status: number;
  tools_count?: number;  // MCP health returns tool count
}

export interface GatewayChatResult {
  ok: boolean;
  chunks?: string[];
  response?: string;  // Assembled response text
  error?: string;
}

export type TaskStatus = 'backlog' | 'active' | 'delayed' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee?: string;
  tags?: string[];
  notes?: string;
  // Sidecar metadata (from ai/task-meta.json)
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  category?: 'feature' | 'bug_fix' | 'refactoring' | 'documentation' | 'security' | 'performance' | 'ui_ux' | 'infrastructure' | 'testing';
  complexity?: 'sm' | 'md' | 'lg';
  worklog?: string;
  checkpoint?: string;
  createdAt?: string;
  updatedAt?: string;
  contextFiles?: string[];
}

export interface TaskMeta {
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  category?: 'feature' | 'bug_fix' | 'refactoring' | 'documentation' | 'security' | 'performance' | 'ui_ux' | 'infrastructure' | 'testing';
  complexity?: 'sm' | 'md' | 'lg';
  worklog?: string;
  checkpoint?: string;
  createdAt?: string;
  updatedAt?: string;
  contextFiles?: string[];
}

export interface ClaudeTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  worklog?: string;
  createdAt?: Date;
  completedAt?: Date;
}

export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const api = {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron
  },
  /**
   * Environment flags for renderer
   */
  env: {
    /** True when running Playwright E2E tests */
    isE2ETest: process.env.E2E_TEST_MODE === 'true',
    /** True when in development mode */
    isDev: process.env.NODE_ENV === 'development',
  },
  pty: {
    create: (options?: CreatePtyOptions): Promise<PtyProcess> =>
      ipcRenderer.invoke('pty:create', options),
    getBufferedData: (id: string): Promise<string> =>
      ipcRenderer.invoke('pty:getBufferedData', id),
    write: (id: string, data: string): Promise<boolean> =>
      ipcRenderer.invoke('pty:write', id, data),
    resize: (id: string, cols: number, rows: number): Promise<boolean> =>
      ipcRenderer.invoke('pty:resize', id, cols, rows),
    kill: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('pty:kill', id),
    list: (): Promise<PtyProcess[]> =>
      ipcRenderer.invoke('pty:list'),
    subscribe: (termId: string): Promise<void> =>
      ipcRenderer.invoke('pty:subscribe', termId),
    onData: (callback: (id: string, data: string) => void) => {
      const handler = (_: unknown, id: string, data: string) => callback(id, data);
      ipcRenderer.on('pty:data', handler);
      return () => ipcRenderer.removeListener('pty:data', handler);
    },
    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_: unknown, id: string, exitCode: number) => callback(id, exitCode);
      ipcRenderer.on('pty:exit', handler);
      return () => ipcRenderer.removeListener('pty:exit', handler);
    },
    onFlushPersistence: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('pty:flush-persistence', handler);
      return () => ipcRenderer.removeListener('pty:flush-persistence', handler);
    },
    setClaudeMode: (sessionId: string, enabled: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('pty:setClaudeMode', sessionId, enabled),
    // Persistence methods
    initPersistence: (): Promise<{ totalSessions: number; recovered: number; staleRemoved: number }> =>
      ipcRenderer.invoke('pty:initPersistence'),
    saveTerminalState: (terminals: unknown[]): Promise<{ ok: boolean; count: number }> =>
      ipcRenderer.invoke('pty:saveTerminalState', terminals),
    loadTerminalState: (): Promise<{ terminals: unknown[] }> =>
      ipcRenderer.invoke('pty:loadTerminalState'),
    saveBuffer: (termId: string, content: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('pty:saveBuffer', termId, content),
    loadBuffer: (termId: string): Promise<{ content: string }> =>
      ipcRenderer.invoke('pty:loadBuffer', termId),
    getPersistedSessions: (): Promise<{ sessions: unknown[] }> =>
      ipcRenderer.invoke('pty:getPersistedSessions'),
    removeSession: (termId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('pty:removeSession', termId),
    resetAll: (): Promise<{ success: boolean; killedPtys: number }> =>
      ipcRenderer.invoke('pty:resetAll'),
    // Terminal buffer reading (for k_term_read MCP action)
    getTerminalBuffer: (
      termId: string,
      mode: 'tail' | 'viewport' | 'delta',
      options?: {
        maxLines?: number;
        mergeWrapped?: boolean;
        markerId?: number;
      }
    ): Promise<{
      ok: boolean;
      text?: string;
      lines?: string[];
      cursorLine?: number;
      viewportY?: number;
      rows?: number;
      cols?: number;
      bufferType?: 'normal' | 'alternate';
      markerId?: number;
      markerLine?: number;
      markerDisposed?: boolean;
      error?: string;
    }> => ipcRenderer.invoke('pty:getTerminalBuffer', termId, mode, options),
    sendBufferResponse: (termId: string, snapshot: unknown): void =>
      ipcRenderer.send('pty:bufferResponse', termId, snapshot),
    onBufferRequest: (callback: (data: { termId: string; mode: string; options: unknown }) => void) => {
      const handler = (_: unknown, data: { termId: string; mode: string; options: unknown }) => callback(data);
      ipcRenderer.on('pty:requestBuffer', handler);
      return () => ipcRenderer.removeListener('pty:requestBuffer', handler);
    },
  },
  fs: {
    readFile: (path: string): Promise<string> =>
      ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:writeFile', path, content),
    appendFile: (path: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:appendFile', path, content),
    watch: (path: string, callback: () => void): (() => void) => {
      ipcRenderer.invoke('fs:watch', path);
      // Normalize path for comparison (handle Windows backslash/forward slash and case)
      const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase();
      const normalizedWatchPath = normalizePath(path);
      const handler = (_: unknown, changedPath: string) => {
        if (normalizePath(changedPath) === normalizedWatchPath) callback();
      };
      ipcRenderer.on('file:changed', handler);
      return () => {
        ipcRenderer.removeListener('file:changed', handler);
        ipcRenderer.invoke('fs:unwatch', path);
      };
    },
    readDir: (path: string): Promise<string[]> =>
      ipcRenderer.invoke('fs:readDir', path),
    exists: (path: string): Promise<boolean> =>
      ipcRenderer.invoke('fs:exists', path),
    readTree: (path: string, maxDepth?: number): Promise<Array<{
      name: string;
      path: string;
      type: 'file' | 'directory';
      children?: Array<unknown>;
    }>> => ipcRenderer.invoke('fs:readTree', path, maxDepth),
    /** Read image file as base64 (for inline display) */
    readImageAsBase64: (path: string): Promise<{
      ok: boolean;
      base64?: string;
      mimeType?: string;
      error?: string;
    }> => ipcRenderer.invoke('fs:readImageAsBase64', path),
  },
  /**
   * Task Management API
   * Centralized todo.md operations
   */
  tasks: {
    /** List all Kanban tasks */
    list: (): Promise<Task[]> =>
      ipcRenderer.invoke('tasks:list'),

    /** Get a specific task by ID */
    get: (taskId: string): Promise<Task | null> =>
      ipcRenderer.invoke('tasks:get', taskId),

    /** Create a new task */
    create: (task: Omit<Task, 'id'>): Promise<OperationResult<Task>> =>
      ipcRenderer.invoke('tasks:create', task),

    /** Update an existing task */
    update: (taskId: string, updates: Partial<Task>): Promise<OperationResult<Task>> =>
      ipcRenderer.invoke('tasks:update', taskId, updates),

    /** Delete a task */
    delete: (taskId: string): Promise<OperationResult<void>> =>
      ipcRenderer.invoke('tasks:delete', taskId),

    /** Update task status (for drag-and-drop) */
    setStatus: (taskId: string, status: TaskStatus): Promise<OperationResult<Task>> =>
      ipcRenderer.invoke('tasks:setStatus', taskId, status),

    /** Assign task to an agent */
    assign: (taskId: string, assignee: string | undefined): Promise<OperationResult<Task>> =>
      ipcRenderer.invoke('tasks:assign', taskId, assignee),

    /** List Claude tasks with timestamps */
    claudeList: (): Promise<ClaudeTask[]> =>
      ipcRenderer.invoke('tasks:claudeList'),

    /** Get task metadata from sidecar */
    getMeta: (taskId: string): Promise<TaskMeta | null> =>
      ipcRenderer.invoke('tasks:getMeta', taskId),

    /** Update task metadata in sidecar */
    updateMeta: (taskId: string, updates: Partial<TaskMeta>): Promise<OperationResult<TaskMeta>> =>
      ipcRenderer.invoke('tasks:updateMeta', taskId, updates),

    /** Link worklog to task in sidecar */
    linkWorklog: (taskId: string, path: string): Promise<OperationResult<TaskMeta>> =>
      ipcRenderer.invoke('tasks:linkWorklog', taskId, path),

    /** Subscribe to task changes */
    watch: (callback: (tasks: Task[]) => void): void => {
      ipcRenderer.invoke('tasks:watch');
      ipcRenderer.on('tasks:changed', (_event, tasks) => callback(tasks));
    },

    /** Unsubscribe from task changes */
    unwatch: (): void => {
      ipcRenderer.invoke('tasks:unwatch');
      ipcRenderer.removeAllListeners('tasks:changed');
    },

    /** Create task via gateway - single integration point */
    createViaGateway: (data: {
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      tags?: string[];
      from_session_id?: string;
    }): Promise<{ ok: boolean; task_id?: string; error?: string }> =>
      ipcRenderer.invoke('gateway:task:create', data),
  },
  shell: {
    openPath: (path: string): Promise<string> =>
      ipcRenderer.invoke('shell:openPath', path),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('shell:openExternal', url)
  },
  /**
   * Native keyboard input via Chromium
   * Sends actual keyboard events (not PTY text) for apps that need real key events
   */
  input: {
    sendKeyEvent: (key: string, modifiers?: { shift?: boolean; alt?: boolean; ctrl?: boolean }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('input:sendKeyEvent', key, modifiers || {})
  },
  /**
   * MCP_CORE API (port 8100)
   * Tools: inbox.*, checkpoint.*, rag.*
   */
  mcp: {
    /** Call an MCP tool by name */
    call: (tool: string, args: Record<string, unknown>): Promise<McpToolResult> =>
      ipcRenderer.invoke('mcp:call', tool, args),
    /** Check MCP_CORE health */
    health: (): Promise<GatewayHealthResult> =>
      ipcRenderer.invoke('mcp:health'),
    /** List available MCP tools */
    tools: (): Promise<{ tools?: unknown[]; error?: string }> =>
      ipcRenderer.invoke('mcp:tools'),

    // Convenience methods for common tools
    inbox: {
      send: (to: string, subject: string, body: string) =>
        ipcRenderer.invoke('mcp:call', 'inbox.send', { to, subject, body }),
      list: (box = 'new', limit = 20) =>
        ipcRenderer.invoke('mcp:call', 'inbox.list', { box, limit }),
      claim: (messageId: string, agent: string) =>
        ipcRenderer.invoke('mcp:call', 'inbox.claim', { message_id: messageId, agent }),
      complete: (messageId: string, status = 'done', note = '') =>
        ipcRenderer.invoke('mcp:call', 'inbox.complete', { message_id: messageId, status, note }),
    },
    checkpoint: {
      list: (limit = 100) =>
        ipcRenderer.invoke('mcp:call', 'k_checkpoint', { action: 'list', limit }),
      load: (id: string) =>
        ipcRenderer.invoke('mcp:call', 'k_checkpoint', { action: 'load', id }),
      save: (name: string, data: unknown, summary?: string, tags?: string[]) =>
        ipcRenderer.invoke('mcp:call', 'k_checkpoint', { action: 'save', name, data, summary, tags }),
    },
    rag: {
      query: (query: string, topK = 10) =>
        ipcRenderer.invoke('mcp:call', 'rag.query', { query, top_k: topK }),
      index: (path: string) =>
        ipcRenderer.invoke('mcp:call', 'rag.index', { path }),
      status: () =>
        ipcRenderer.invoke('mcp:call', 'rag.status', {}),
    },
  },
  /**
   * Gateway API (port 8200)
   * SSE streaming, harness, hooks, LLM backends
   */
  gateway: {
    /** Check Gateway health */
    health: (): Promise<GatewayHealthResult> =>
      ipcRenderer.invoke('gateway:health'),
    /** List available LLM backends */
    backends: (): Promise<{ backends?: unknown[]; error?: string }> =>
      ipcRenderer.invoke('gateway:backends'),
    /** Call MCP tool via gateway */
    mcp: (tool: string, args: Record<string, unknown>): Promise<McpToolResult> =>
      ipcRenderer.invoke('gateway:mcp', tool, args),
    /**
     * Send chat messages (SSE streaming collected into chunks)
     * @param messages - Chat messages array
     * @param model - Model to use
     * @param options - Optional settings including backend selection and generation params
     *                  direct=true bypasses harness/inbox for pure LLM testing
     *                  backend: 'lmstudio' | 'cliproxyapi' | 'claude' to route to specific backend
     */
    chat: (
      messages: unknown[],
      model: string,
      options?: {
        harness?: string;
        direct?: boolean;
        backend?: string;
        temperature?: number;
        max_tokens?: number;
      }
    ): Promise<GatewayChatResult> =>
      ipcRenderer.invoke('gateway:chat', messages, model, options),
    /** Invoke a harness prompt */
    harness: (promptName: string, context: Record<string, unknown>): Promise<McpToolResult> =>
      ipcRenderer.invoke('gateway:harness', promptName, context),
  },
  /**
   * Authentication API
   * OAuth and API key management for LLM/SCM providers
   */
  auth: {
    /** Check if OS-level encryption is available */
    encryptionAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke('auth:encryptionAvailable'),

    /** Get status of all providers */
    getAllStatuses: (): Promise<Record<string, {
      connected: boolean;
      provider: string;
      authType: 'oauth' | 'apikey' | 'none';
      expiresAt?: number;
      scope?: string;
    }>> => ipcRenderer.invoke('auth:getAllStatuses'),

    /** Disconnect a provider */
    disconnect: (provider: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('auth:disconnect', provider),

    /** Anthropic API Key */
    anthropic: {
      setKey: (apiKey: string): Promise<{ ok: boolean }> =>
        ipcRenderer.invoke('auth:anthropic:setKey', apiKey),
      verify: (apiKey?: string): Promise<{ valid: boolean; error?: string }> =>
        ipcRenderer.invoke('auth:anthropic:verify', apiKey),
      getModels: (): Promise<Array<{ id: string; name: string; maxTokens: number }>> =>
        ipcRenderer.invoke('auth:anthropic:getModels'),
      isConnected: (): Promise<boolean> =>
        ipcRenderer.invoke('auth:anthropic:isConnected'),
    },

    /** OpenAI API Key */
    openai: {
      setKey: (apiKey: string): Promise<{ ok: boolean }> =>
        ipcRenderer.invoke('auth:openai:setKey', apiKey),
      verify: (apiKey?: string): Promise<{ valid: boolean; error?: string }> =>
        ipcRenderer.invoke('auth:openai:verify', apiKey),
      getModels: (): Promise<Array<{ id: string; name: string; created: number }>> =>
        ipcRenderer.invoke('auth:openai:getModels'),
      isConnected: (): Promise<boolean> =>
        ipcRenderer.invoke('auth:openai:isConnected'),
    },

    /** ElevenLabs API Key (unified TTS key) */
    elevenlabs: {
      setKey: (apiKey: string): Promise<{ ok: boolean }> =>
        ipcRenderer.invoke('auth:elevenlabs:setKey', apiKey),
      verify: (apiKey?: string): Promise<{ valid: boolean; error?: string }> =>
        ipcRenderer.invoke('auth:elevenlabs:verify', apiKey),
      hasKey: (): Promise<boolean> =>
        ipcRenderer.invoke('auth:elevenlabs:hasKey'),
      removeKey: (): Promise<{ ok: boolean }> =>
        ipcRenderer.invoke('auth:elevenlabs:removeKey'),
    },

    /** GitHub OAuth */
    github: {
      configure: (clientId: string, clientSecret?: string): Promise<{ ok: boolean }> =>
        ipcRenderer.invoke('auth:github:configure', clientId, clientSecret),
      startAuth: (): Promise<{ ok: boolean; error?: string }> =>
        ipcRenderer.invoke('auth:github:startAuth'),
      getUser: (): Promise<{
        login: string;
        id: number;
        avatar_url: string;
        name: string | null;
        email: string | null;
      } | null> => ipcRenderer.invoke('auth:github:getUser'),
      listRepos: (params?: { visibility?: string; sort?: string; per_page?: number }): Promise<Array<{
        id: number;
        name: string;
        full_name: string;
        private: boolean;
        html_url: string;
        clone_url: string;
      }>> => ipcRenderer.invoke('auth:github:listRepos', params),
      isConnected: (): Promise<boolean> =>
        ipcRenderer.invoke('auth:github:isConnected'),
      /** Get raw access token for passing to Gateway */
      getToken: (): Promise<string | null> =>
        ipcRenderer.invoke('auth:github:getToken'),
      /** Load GitHub service from securely stored credentials */
      loadFromStore: (): Promise<{ ok: boolean; clientId?: string; error?: string }> =>
        ipcRenderer.invoke('auth:github:loadFromStore'),
    },

    /** OAuth App Credentials (secure storage for client ID/secret) */
    oauthApp: {
      /** Save OAuth App credentials securely */
      save: (provider: string, clientId: string, clientSecret?: string): Promise<{ ok: boolean }> =>
        ipcRenderer.invoke('auth:oauthApp:save', provider, clientId, clientSecret),
      /** Get OAuth App credentials (clientId only, secret is masked) */
      get: (provider: string): Promise<{ clientId: string; hasSecret: boolean; createdAt: number } | null> =>
        ipcRenderer.invoke('auth:oauthApp:get', provider),
      /** Delete OAuth App credentials */
      delete: (provider: string): Promise<{ ok: boolean }> =>
        ipcRenderer.invoke('auth:oauthApp:delete', provider),
      /** Check if OAuth App is configured */
      has: (provider: string): Promise<boolean> =>
        ipcRenderer.invoke('auth:oauthApp:has', provider),
    },
  },
  /**
   * CLI Tool Detection API
   * Detects Claude CLI, Git, Python on the system
   */
  cli: {
    /** Detect a specific CLI tool */
    detect: (tool: 'claude' | 'git' | 'python'): Promise<{
      found: boolean;
      path?: string;
      version?: string;
      source: string;
      message: string;
    }> => ipcRenderer.invoke('cli:detect', tool),

    /** Detect all CLI tools at once (legacy: kiro, git, python) */
    detectAll: (): Promise<{
      claude: { found: boolean; path?: string; version?: string; source: string; message: string };
      git: { found: boolean; path?: string; version?: string; source: string; message: string };
      python: { found: boolean; path?: string; version?: string; source: string; message: string };
    }> => ipcRenderer.invoke('cli:detectAll'),

    /** Detect all CLI providers for WorkerSetupWizard (claude, kiro, kuroryuu, shell) */
    detectAllProviders: (): Promise<Record<string, {
      available: boolean;
      path: string | null;
      version: string | null;
      error: string | null;
      installCmd: string | null;
      installUrl: string | null;
    }>> => ipcRenderer.invoke('cli:detectAllProviders'),

    /** Configure CLI tool paths (from user settings) */
    configure: (config: {
      claudePath?: string;
      gitPath?: string;
      pythonPath?: string;
    }): Promise<{ ok: boolean }> => ipcRenderer.invoke('cli:configure', config),
  },
  /**
   * Graphiti Memory API (OPT-IN)
   */
  graphiti: {
    configure: (config: { url?: string; enabled?: boolean }): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('graphiti:configure', config),
    health: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('graphiti:health'),
    status: (): Promise<{ enabled: boolean; url: string }> =>
      ipcRenderer.invoke('graphiti:status'),
    query: (params: { query: string; projectId?: string; limit?: number }) =>
      ipcRenderer.invoke('graphiti:query', params),
    add: (params: { content: string; type: string; projectId?: string; metadata?: Record<string, unknown> }) =>
      ipcRenderer.invoke('graphiti:add', params),
    search: (params: { query: string; projectId?: string; topK?: number; threshold?: number }) =>
      ipcRenderer.invoke('graphiti:search', params),
    episodes: (params: { projectId?: string; limit?: number; since?: string }) =>
      ipcRenderer.invoke('graphiti:episodes', params),
    clear: (params: { projectId: string; confirm?: boolean }) =>
      ipcRenderer.invoke('graphiti:clear', params),
    /** Get entity nodes directly from Neo4j */
    entities: (params: { projectId?: string; limit?: number }): Promise<{
      nodes: Array<{ id: string; type: string; content: string; createdAt: string; metadata?: Record<string, unknown> }>;
      edges: unknown[];
      error?: string;
    }> => ipcRenderer.invoke('graphiti:entities', params),
    /** Launch Graphiti server subprocess */
    launchServer: (): Promise<{ success: boolean; error?: string; pid?: number }> =>
      ipcRenderer.invoke('graphiti:launchServer'),
    /** Stop Graphiti server subprocess */
    stopServer: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('graphiti:stopServer'),
    /** Check if server process is running */
    isServerRunning: (): Promise<{ running: boolean }> =>
      ipcRenderer.invoke('graphiti:isServerRunning'),
  },
  /**
   * PC Control API (Full Desktop Access - OPT-IN, SESSION-ONLY)
   * DANGER: Gives Claude FULL control of Windows desktop
   * Uses pure PowerShell/Win32 APIs - no WinAppDriver required
   */
  pccontrol: {
    /** Get current armed status */
    status: (): Promise<{ armed: boolean }> =>
      ipcRenderer.invoke('pccontrol:status'),

    /** Arm Full Desktop Access for this session */
    arm: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('pccontrol:arm'),

    /** Disarm Full Desktop Access */
    disarm: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('pccontrol:disarm'),

    /** Listen for status changes */
    onStatusChanged: (callback: (status: { armed: boolean }) => void) => {
      const handler = (_: unknown, status: { armed: boolean }) => callback(status);
      ipcRenderer.on('pccontrol:statusChanged', handler);
      return () => ipcRenderer.removeListener('pccontrol:statusChanged', handler);
    },
  },

  // Legacy alias for backward compatibility (deprecated - use pccontrol)
  winappdriver: {
    status: (): Promise<{
      installed: boolean;
      installPath: string | null;
      running: boolean;
      armed: boolean;
      port: number;
    }> => ipcRenderer.invoke('pccontrol:status').then((s: { armed: boolean }) => ({
      installed: true, // Always true - PowerShell is built-in
      installPath: null,
      running: s.armed,
      armed: s.armed,
      port: 0, // No port needed
    })),
    detect: (): Promise<{ installed: boolean; path: string | null }> =>
      Promise.resolve({ installed: true, path: null }), // Always available
    download: (): Promise<{ success: boolean; error?: string }> =>
      Promise.resolve({ success: true }), // Not needed
    downloadWithProgress: (): Promise<{ success: boolean; error?: string }> =>
      Promise.resolve({ success: true }), // Not needed
    installMsi: (): Promise<{ success: boolean; error?: string }> =>
      Promise.resolve({ success: true }), // Not needed
    onDownloadProgress: () => () => { }, // No-op
    start: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('pccontrol:arm'),
    stop: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('pccontrol:disarm').then(() => ({ success: true })),
    health: (): Promise<{ healthy: boolean; error?: string }> =>
      Promise.resolve({ healthy: true }), // Always healthy - PowerShell is built-in
    checkDeveloperMode: (): Promise<{ enabled: boolean; error?: string }> =>
      Promise.resolve({ enabled: true }), // Not needed for PowerShell
    openDeveloperSettings: (): Promise<{ success: boolean }> =>
      Promise.resolve({ success: true }), // Not needed
    openFolder: (): Promise<{ success: boolean }> =>
      Promise.resolve({ success: true }), // Not needed
  },
  /**
   * Python/Pip Integration API (for Full Desktop Access setup)
   */
  python: {
    /** Detect Python environment (.venv_mcp312 or system) */
    detectEnv: (): Promise<{
      found: boolean;
      type: 'venv_mcp312' | 'system' | 'none';
      pythonPath: string | null;
      pipPath: string | null;
      version: string | null;
    }> => ipcRenderer.invoke('python:detectEnv'),

    /** Install Appium-Python-Client package */
    installAppium: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('python:installAppium'),

    /** Verify Appium can be imported */
    verifyAppium: (): Promise<boolean> =>
      ipcRenderer.invoke('python:verifyAppium'),

    /** Check if Appium-Python-Client is already installed */
    checkAppiumInstalled: (): Promise<boolean> =>
      ipcRenderer.invoke('python:checkAppiumInstalled'),

    /** Listen for pip output during installation */
    onPipOutput: (callback: (line: string) => void) => {
      const handler = (_: unknown, line: string) => callback(line);
      ipcRenderer.on('python:pipOutput', handler);
      return () => ipcRenderer.removeListener('python:pipOutput', handler);
    },
  },
  /**
   * Linear Integration API (OPT-IN)
   */
  linear: {
    configure: (config: { enabled?: boolean; teamId?: string }): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('linear:configure', config),
    setApiKey: (apiKey: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('linear:setApiKey', apiKey),
    verify: (apiKey: string): Promise<{ valid: boolean; user?: unknown; error?: string }> =>
      ipcRenderer.invoke('linear:verify', apiKey),
    status: (): Promise<{ enabled: boolean; connected: boolean; teamId: string | null }> =>
      ipcRenderer.invoke('linear:status'),
    disconnect: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('linear:disconnect'),
    teams: (): Promise<{ teams: Array<{ id: string; name: string; key: string }>; error?: string }> =>
      ipcRenderer.invoke('linear:teams'),
    issues: (params?: { teamId?: string; limit?: number; state?: string }) =>
      ipcRenderer.invoke('linear:issues', params),
    createIssue: (params: { title: string; description?: string; teamId?: string; priority?: number }) =>
      ipcRenderer.invoke('linear:createIssue', params),
    updateState: (params: { issueId: string; stateId: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('linear:updateState', params),
    states: (teamId?: string) =>
      ipcRenderer.invoke('linear:states', teamId),
  },
  /**
   * Worktree Management API (OPT-IN)
   */
  worktree: {
    configure: (config: { enabled?: boolean; basePath?: string; repoPath?: string }): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('worktree:configure', config),
    status: (): Promise<{ enabled: boolean; basePath: string; repoPath: string }> =>
      ipcRenderer.invoke('worktree:status'),
    list: (): Promise<{ worktrees: Array<{ path: string; branch?: string; name: string; isMain: boolean }>; error?: string }> =>
      ipcRenderer.invoke('worktree:list'),
    create: (params: { taskId: string; branchName?: string; baseBranch?: string }) =>
      ipcRenderer.invoke('worktree:create', params),
    delete: (params: { path: string; force?: boolean; deleteBranch?: boolean }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('worktree:delete', params),
    merge: (params: { path: string; targetBranch?: string; deleteAfter?: boolean }) =>
      ipcRenderer.invoke('worktree:merge', params),
    getStatus: (path: string): Promise<{ changes: Array<{ status: string; file: string }>; ahead: number; behind: number; clean: boolean }> =>
      ipcRenderer.invoke('worktree:getStatus', path),
    /** List branches for worktree creation dropdown */
    listBranches: (limit?: number): Promise<{ branches: Array<{ name: string; isDefault: boolean; isRemote: boolean; isCurrent: boolean }>; error?: string }> =>
      ipcRenderer.invoke('worktree:listBranches', limit),
    /** Open terminal at worktree path */
    openTerminal: (path: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('worktree:openTerminal', path),
    /** Listen for open terminal requests from IPC */
    onOpenTerminalRequest: (callback: (data: { path: string }) => void) => {
      const handler = (_: unknown, data: { path: string }) => callback(data);
      ipcRenderer.on('worktree:openTerminalRequest', handler);
      return () => ipcRenderer.removeListener('worktree:openTerminalRequest', handler);
    },
  },
  /**
   * Agent Orchestration API (OPT-IN)
   */
  agents: {
    configure: (config: { enabled?: boolean; gatewayUrl?: string }): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('agents:configure', config),
    status: (): Promise<{ enabled: boolean; gatewayUrl: string }> =>
      ipcRenderer.invoke('agents:status'),
    roles: () => ipcRenderer.invoke('agents:roles'),
    createSwarm: (params: { name: string; roles: string[] }) =>
      ipcRenderer.invoke('agents:createSwarm', params),
    addTasks: (swarmId: string, tasks: Array<{ id: string; type: string; description: string; dependencies?: string[] }>) =>
      ipcRenderer.invoke('agents:addTasks', swarmId, tasks),
    startSwarm: (swarmId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('agents:startSwarm', swarmId),
    pauseSwarm: (swarmId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('agents:pauseSwarm', swarmId),
    resumeSwarm: (swarmId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('agents:resumeSwarm', swarmId),
    getSwarm: (swarmId: string) => ipcRenderer.invoke('agents:getSwarm', swarmId),
    listSwarms: () => ipcRenderer.invoke('agents:listSwarms'),
    deleteSwarm: (swarmId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('agents:deleteSwarm', swarmId),
  },
  /**
   * Scheduler API
   * Schedule Claude CLI sessions with timers, cron patterns, and prompts
   */
  scheduler: {
    /** List all scheduled jobs */
    list: (): Promise<Array<{
      id: string;
      name: string;
      description?: string;
      enabled: boolean;
      schedule: { type: 'cron' | 'interval' | 'once'; expression?: string; every?: number; unit?: string; at?: number };
      action: {
        type: 'prompt' | 'team' | 'script';
        prompt?: string;
        executionMode?: 'background' | 'interactive';
        teamId?: string;
        scriptPath?: string;
        timeoutMinutes?: number;
      };
      status: 'idle' | 'running' | 'paused';
      lastRun?: number;
      nextRun?: number;
      createdAt: number;
    }>> => ipcRenderer.invoke('scheduler:list'),

    /** Get a specific job */
    get: (id: string): Promise<unknown | null> =>
      ipcRenderer.invoke('scheduler:get', id),

    /** Create a new scheduled job */
    create: (params: {
      name: string;
      description?: string;
      schedule: { type: 'cron' | 'interval' | 'once'; expression?: string; every?: number; unit?: string; at?: number };
      action: {
        type: 'prompt' | 'team' | 'script';
        prompt?: string;
        executionMode?: 'background' | 'interactive';
        teamId?: string;
        scriptPath?: string;
        timeoutMinutes?: number;
      };
      enabled?: boolean;
      notifyOnStart?: boolean;
      notifyOnComplete?: boolean;
      notifyOnError?: boolean;
    }): Promise<{ ok: boolean; job?: unknown; error?: string }> =>
      ipcRenderer.invoke('scheduler:create', params),

    /** Update an existing job */
    update: (params: {
      id: string;
      name?: string;
      description?: string;
      schedule?: { type: 'cron' | 'interval' | 'once'; expression?: string; every?: number; unit?: string; at?: number };
      action?: {
        type: 'prompt' | 'team' | 'script';
        prompt?: string;
        executionMode?: 'background' | 'interactive';
        teamId?: string;
        scriptPath?: string;
        timeoutMinutes?: number;
      };
      enabled?: boolean;
    }): Promise<{ ok: boolean; job?: unknown; error?: string }> =>
      ipcRenderer.invoke('scheduler:update', params),

    /** Delete a job */
    delete: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('scheduler:delete', id),

    /** List calendar events */
    listEvents: (): Promise<Array<{
      id: string;
      title: string;
      description?: string;
      enabled: boolean;
      schedule: { type: 'cron' | 'interval' | 'once'; expression?: string; every?: number; unit?: string; at?: number };
      nextRun?: number;
      lastRun?: number;
      location?: string;
      allDay?: boolean;
      tags?: string[];
      notify?: boolean;
      color?: string;
      createdAt: number;
      updatedAt: number;
    }>> => ipcRenderer.invoke('scheduler:listEvents'),

    /** Get a specific event */
    getEvent: (id: string): Promise<unknown | null> =>
      ipcRenderer.invoke('scheduler:getEvent', id),

    /** Create a calendar event */
    createEvent: (params: {
      title: string;
      description?: string;
      schedule: { type: 'cron' | 'interval' | 'once'; expression?: string; every?: number; unit?: string; at?: number };
      enabled?: boolean;
      location?: string;
      allDay?: boolean;
      tags?: string[];
      notify?: boolean;
      color?: string;
    }): Promise<{ ok: boolean; event?: unknown; error?: string }> =>
      ipcRenderer.invoke('scheduler:createEvent', params),

    /** Update a calendar event */
    updateEvent: (params: {
      id: string;
      title?: string;
      description?: string;
      schedule?: { type: 'cron' | 'interval' | 'once'; expression?: string; every?: number; unit?: string; at?: number };
      enabled?: boolean;
      location?: string;
      allDay?: boolean;
      tags?: string[];
      notify?: boolean;
      color?: string;
    }): Promise<{ ok: boolean; event?: unknown; error?: string }> =>
      ipcRenderer.invoke('scheduler:updateEvent', params),

    /** Delete a calendar event */
    deleteEvent: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('scheduler:deleteEvent', id),

    /** Cancel a running job (stops SDK session) */
    cancelJob: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('scheduler:cancelJob', id),

    /** Run a job immediately */
    runNow: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('scheduler:runNow', id),

    /** Pause a job */
    pause: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('scheduler:pause', id),

    /** Resume a paused job */
    resume: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('scheduler:resume', id),

    /** Get job execution history */
    history: (query?: { jobId?: string; status?: string; since?: number; limit?: number }): Promise<Array<{
      id: string;
      startedAt: number;
      completedAt?: number;
      status: 'running' | 'completed' | 'failed' | 'cancelled';
      error?: string;
    }>> => ipcRenderer.invoke('scheduler:history', query ?? {}),

    /** Get scheduler settings */
    getSettings: (): Promise<{
      enabled: boolean;
      maxConcurrentJobs: number;
      historyRetentionDays: number;
      defaultNotifyOnError: boolean;
    } | null> => ipcRenderer.invoke('scheduler:getSettings'),

    /** Update scheduler settings */
    updateSettings: (updates: {
      enabled?: boolean;
      maxConcurrentJobs?: number;
      historyRetentionDays?: number;
      defaultNotifyOnError?: boolean;
    }): Promise<{ ok: boolean; settings?: unknown; error?: string }> =>
      ipcRenderer.invoke('scheduler:updateSettings', updates),
  },
  /**
   * Gateway Orchestration API (via Gateway /v1/orchestration/*)
   *
   * NOTE: Deprecated methods REMOVED:
   * - createTask, breakdownTask, listTasks, getTask
   * - poll, claim, start, result, release
   * - stats
   * Tasks managed via ai/todo.md; workers coordinate via k_inbox.
   */
  orchestration: {
    /** Cancel a task */
    cancel: (taskId: string): Promise<{
      ok: boolean;
      error?: string;
    }> => ipcRenderer.invoke('orchestration:cancel', taskId),

    /** Finalize a completed task */
    finalize: (taskId: string): Promise<{
      ok: boolean;
      summary?: string;
      error?: string;
    }> => ipcRenderer.invoke('orchestration:finalize', taskId),

    /**
     * SingleAgentMode API
     * For context-limited models that need disk-based state between reboots.
     */
    singleAgent: {
      /** Get status of a single agent executor */
      status: (agentId: string, projectRoot?: string): Promise<{
        ok: boolean;
        agent_id?: string;
        current_task_id?: string;
        subtask_index?: number;
        total_subtasks?: number;
        completed_count?: number;
        failed_count?: number;
        reboot_count?: number;
        last_checkpoint?: string;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:singleAgent:status', agentId, projectRoot),

      /** Assign a task to a single agent */
      assign: (agentId: string, taskId: string, projectRoot?: string, resetProgress?: boolean): Promise<{
        ok: boolean;
        message?: string;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:singleAgent:assign', agentId, taskId, projectRoot, resetProgress),

      /** Execute one subtask (returns context prompt + subtask details) */
      execute: (agentId: string, projectRoot?: string): Promise<{
        ok: boolean;
        status?: string;
        task_id?: string;
        subtask_id?: string;
        context_prompt?: string;
        remaining?: number;
        reboot_count?: number;
        message?: string;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:singleAgent:execute', agentId, projectRoot),

      /** Reset a single agent's state */
      reset: (agentId: string, projectRoot?: string): Promise<{
        ok: boolean;
        message?: string;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:singleAgent:reset', agentId, projectRoot),

      /** Get a single agent's context summary */
      context: (agentId: string, projectRoot?: string): Promise<{
        ok: boolean;
        agent_id?: string;
        context_summary?: string;
        next_action?: string;
        files_touched?: string[];
        completed_subtasks?: string[];
        error?: string;
      }> => ipcRenderer.invoke('orchestration:singleAgent:context', agentId, projectRoot),
    },

    /**
     * RecoveryManager API
     * For PAUSE/RESUME, checkpoints, and rollback.
     */
    recovery: {
      /** Pause a task */
      pause: (taskId: string, reason?: string, message?: string, pausedBy?: string): Promise<{
        ok: boolean;
        message?: string;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:pause', taskId, reason, message, pausedBy),

      /** Resume a paused task */
      resume: (taskId: string, resumedBy?: string): Promise<{
        ok: boolean;
        message?: string;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:resume', taskId, resumedBy),

      /** List all paused tasks */
      listPaused: (): Promise<{
        ok: boolean;
        paused_tasks?: Array<{
          task_id: string;
          paused_at: string;
          paused_by: string;
          reason: string;
          message: string;
          affected_subtasks: string[];
        }>;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:listPaused'),

      /** Check if a task is paused */
      isPaused: (taskId: string): Promise<{
        ok: boolean;
        task_id?: string;
        is_paused?: boolean;
        pause_info?: {
          paused_at: string;
          reason: string;
          message: string;
        } | null;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:isPaused', taskId),

      /** Pause all active tasks */
      pauseAll: (reason?: string, message?: string): Promise<{
        ok: boolean;
        paused_count?: number;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:pauseAll', reason, message),

      /** Resume all paused tasks */
      resumeAll: (): Promise<{
        ok: boolean;
        resumed_count?: number;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:resumeAll'),

      /** Create a checkpoint */
      createCheckpoint: (taskId: string, reason?: string, createdBy?: string, includeAgentStates?: boolean): Promise<{
        ok: boolean;
        message?: string;
        checkpoint_id?: string;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:createCheckpoint', taskId, reason, createdBy, includeAgentStates),

      /** List checkpoints for a task */
      listCheckpoints: (taskId: string): Promise<{
        ok: boolean;
        task_id?: string;
        checkpoints?: Array<{
          checkpoint_id: string;
          created_at: string;
          created_by: string;
          reason: string;
          has_agent_states: boolean;
        }>;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:listCheckpoints', taskId),

      /** Restore from checkpoint */
      restore: (taskId: string, checkpointId: string, restoreAgentStates?: boolean): Promise<{
        ok: boolean;
        message?: string;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:restore', taskId, checkpointId, restoreAgentStates),

      /** Delete a checkpoint */
      deleteCheckpoint: (taskId: string, checkpointId: string): Promise<{
        ok: boolean;
        message?: string;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:deleteCheckpoint', taskId, checkpointId),

      /** Rollback a subtask to pending state */
      rollback: (taskId: string, subtaskId: string, reason?: string): Promise<{
        ok: boolean;
        message?: string;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:rollback', taskId, subtaskId, reason),

      /** Get retry info for a subtask */
      retryInfo: (subtaskId: string): Promise<{
        ok: boolean;
        subtask_id?: string;
        retry_count?: number;
        should_retry?: boolean;
        max_retries?: number;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:retryInfo', subtaskId),

      /** Prepare for graceful shutdown */
      shutdown: (): Promise<{
        ok: boolean;
        paused_count?: number;
        checkpoint_count?: number;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:shutdown'),

      /** Recover from shutdown */
      startup: (): Promise<{
        ok: boolean;
        loaded_pauses?: number;
        recovered?: number;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:startup'),

      /** Get recovery statistics */
      stats: (): Promise<{
        ok: boolean;
        paused_tasks?: number;
        total_checkpoints?: number;
        tracked_retries?: number;
        error?: string;
      }> => ipcRenderer.invoke('orchestration:recovery:stats'),
    },
  },
  /**
   * Security Scanner API (OPT-IN)
   */
  security: {
    configure: (config: { enabled?: boolean }): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('security:configure', config),
    status: (): Promise<{ enabled: boolean }> =>
      ipcRenderer.invoke('security:status'),
    scan: (params: { path: string; scanSecrets?: boolean; scanDeps?: boolean }): Promise<{
      secrets: Array<{ type: string; severity: string; file: string; line: number; preview: string }>;
      vulnerabilities: Array<{ package: string; version: string; vulnerability: string; severity: string; fixedIn?: string }>;
      scannedFiles: number;
      scanTime: number;
      error?: string;
    }> => ipcRenderer.invoke('security:scan', params),
    scanFile: (filePath: string): Promise<Array<{ type: string; severity: string; file: string; line: number; preview: string }>> =>
      ipcRenderer.invoke('security:scanFile', filePath),
    patterns: (): Promise<Array<{ name: string; severity: string }>> =>
      ipcRenderer.invoke('security:patterns'),
  },
  /**
   * TTS (Text-to-Speech) API
   * Uses the Desktop main process TTS module
   */
  tts: {
    /** Speak text using the configured TTS engine */
    speak: (params: { text: string; voice?: string; rate?: number }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('tts:speak', params),
    /** Stop any active speech */
    stop: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('tts:stop'),
    /** Pause speech */
    pause: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('tts:pause'),
    /** Resume speech */
    resume: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('tts:resume'),
    /** Get TTS status */
    status: (): Promise<{ speaking: boolean; paused: boolean; voiceId: string; rate: number }> =>
      ipcRenderer.invoke('tts:status'),
    /** List available voices */
    listVoices: (): Promise<Array<{ id: string; name: string; lang: string }>> =>
      ipcRenderer.invoke('tts:listVoices'),
    /** Set voice */
    setVoice: (voiceId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('tts:setVoice', voiceId),
  },
  /**
   * Kuro Plugin Configuration API
   * Manages TTS, validators, hooks settings in .claude/settings.json
   */
  kuroConfig: {
    /** Load config from .claude/settings.json */
    load: (): Promise<{
      ok: boolean;
      config?: {
        tts: {
          provider: string;
          voice: string;
          smartSummaries: boolean;
          summaryProvider: string;
          summaryModel: string;
          userName: string;
          messages: { stop: string; subagentStop: string; notification: string };
          elevenlabsApiKey: string;
          elevenlabsModelId: string;
          elevenlabsStability: number;
          elevenlabsSimilarity: number;
        };
        validators: { ruff: boolean; ty: boolean; timeout: number };
        hooks: {
          ttsOnStop: boolean;
          ttsOnSubagentStop: boolean;
          ttsOnNotification: boolean;
          taskSync: boolean;
          transcriptExport: boolean;
        };
        features: {
          ragInteractive: boolean;
          questionMode: boolean;
          smartSessionStart: boolean;
          autoCheckpointOnEnd: boolean;
          previouslySection: boolean;
        };
      };
      error?: string;
    }> => ipcRenderer.invoke('kuro-config:load'),

    /** Save config to .claude/settings.json */
    save: (config: {
      tts: {
        provider: string;
        voice: string;
        smartSummaries: boolean;
        summaryProvider: string;
        summaryModel: string;
        userName: string;
        messages: { stop: string; subagentStop: string; notification: string };
        elevenlabsApiKey: string;
        elevenlabsModelId: string;
        elevenlabsStability: number;
        elevenlabsSimilarity: number;
      };
      validators: { ruff: boolean; ty: boolean; timeout: number };
      hooks: {
        ttsOnStop: boolean;
        ttsOnSubagentStop: boolean;
        ttsOnNotification: boolean;
        taskSync: boolean;
        transcriptExport: boolean;
      };
      features: {
        ragInteractive: boolean;
        questionMode: boolean;
        smartSessionStart: boolean;
        autoCheckpointOnEnd: boolean;
        previouslySection: boolean;
      };
    }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('kuro-config:save', config),

    /** Toggle team TTS override — only modifies TTS hook entries, not user preference flags */
    setTeamTtsOverride: (active: boolean): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('kuro-config:setTeamTtsOverride', active),

    /** Test TTS with current settings */
    testTTS: (ttsConfig: {
      provider: string;
      voice: string;
      messages: { stop: string };
    }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('kuro-config:test-tts', ttsConfig),

    /** Get available Edge TTS voices (English only) */
    getVoices: (): Promise<{
      ok: boolean;
      voices: Array<{ value: string; label: string; gender: string; locale: string }>;
    }> => ipcRenderer.invoke('kuro-config:get-voices'),

    /** Preview a voice with sample text */
    previewVoice: (voiceName: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('kuro-config:preview-voice', voiceName),

    /** Fetch available ElevenLabs voices using stored API key */
    getElevenlabsVoices: (): Promise<{
      ok: boolean;
      voices?: Array<{ voice_id: string; name: string; category?: string }>;
      error?: string;
    }> => ipcRenderer.invoke('kuro-config:elevenlabs-voices'),

    /** Preview an ElevenLabs voice */
    previewElevenlabsVoice: (voiceId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('kuro-config:preview-elevenlabs-voice', voiceId),

    /** List all available config backups */
    listBackups: (): Promise<{
      ok: boolean;
      backups?: Array<{
        id: string;
        timestamp: string;
        name?: string;
        size: number;
      }>;
      error?: string;
    }> => ipcRenderer.invoke('kuro-config:list-backups'),

    /** Create a new config backup */
    createBackup: (name?: string): Promise<{
      ok: boolean;
      backup?: {
        id: string;
        timestamp: string;
        name?: string;
        size: number;
      };
      error?: string;
    }> => ipcRenderer.invoke('kuro-config:create-backup', name),

    /** Restore a config from backup */
    restoreBackup: (backupId: string): Promise<{
      ok: boolean;
      config?: {
        tts: {
          provider: string;
          voice: string;
          smartSummaries: boolean;
          summaryProvider: string;
          summaryModel: string;
          userName: string;
          messages: { stop: string; subagentStop: string; notification: string };
          elevenlabsApiKey: string;
          elevenlabsModelId: string;
          elevenlabsStability: number;
          elevenlabsSimilarity: number;
        };
        validators: { ruff: boolean; ty: boolean; timeout: number };
        hooks: {
          ttsOnStop: boolean;
          ttsOnSubagentStop: boolean;
          ttsOnNotification: boolean;
          taskSync: boolean;
          transcriptExport: boolean;
        };
        features: { ragInteractive: boolean; questionMode: boolean };
      };
      error?: string;
    }> => ipcRenderer.invoke('kuro-config:restore-backup', backupId),

    /** Delete a config backup */
    deleteBackup: (backupId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('kuro-config:delete-backup', backupId),
  },
  /**
   * Event listeners for OAuth callbacks and other events
   */
  on: {
    oauthCallback: (callback: (data: { provider: string; success: boolean; error?: string }) => void) => {
      const handler = (_: unknown, data: { provider: string; success: boolean; error?: string }) => callback(data);
      ipcRenderer.on('oauth:callback', handler);
      return () => ipcRenderer.removeListener('oauth:callback', handler);
    },
  },
  /**
   * CLI Bootstrap API
   * Install bootstrap redirect files for external CLI agents
   */
  bootstrap: {
    install: (cliId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('bootstrap:install', cliId),
    installAll: (): Promise<{ ok: boolean; results: Record<string, boolean> }> =>
      ipcRenderer.invoke('bootstrap:installAll'),
    check: (cliId: string): Promise<{ installed: boolean }> =>
      ipcRenderer.invoke('bootstrap:check', cliId),
  },
  /**
   * App-level API
   * Get app configuration and paths
   */
  app: {
    /** Get app version (from git tags with build number, fallback to package.json) */
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke('app:getVersion'),
    /** Get latest git commit info (short hash + date) */
    getCommitInfo: (): Promise<{ shortHash: string; date: string } | null> =>
      ipcRenderer.invoke('app:getCommitInfo'),
    /** Get project root path (from KURORYUU_ROOT env or resolved) */
    getProjectRoot: (): Promise<string> =>
      ipcRenderer.invoke('app:getProjectRoot'),
    /** Read a project asset as a base64 data URL */
    getAssetDataUrl: (relativePath: string): Promise<string | null> =>
      ipcRenderer.invoke('app:getAssetDataUrl', relativePath),
    /** Launch the Tray Companion app (pass { debug: true } to show terminal) */
    launchTrayCompanion: (options?: { debug?: boolean }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('app:launchTrayCompanion', options),
    /** Get Desktop session secret for secure role management */
    getDesktopSecret: (): Promise<string> =>
      ipcRenderer.invoke('get-desktop-secret'),
    /** Register an agent as leader with MCP Core */
    registerLeaderMcp: (agentId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('register-leader-mcp', agentId),
    /** Deregister an agent as leader from MCP Core */
    deregisterLeaderMcp: (agentId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('deregister-leader-mcp', agentId),
    /** Restart the app (spawns Start Kuroryuu.bat, then quits) */
    restartApp: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('restart-app'),
    /** Get terminal buffer access mode (off, leader_only, all) */
    getBufferAccessMode: (): Promise<string> =>
      ipcRenderer.invoke('app:getBufferAccessMode'),
    /** Set terminal buffer access mode */
    setBufferAccessMode: (mode: string): Promise<{ ok: boolean; mode?: string; error?: string }> =>
      ipcRenderer.invoke('app:setBufferAccessMode', mode),
    /** Listen for leader terminal death event */
    onLeaderDied: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('leader-died', handler);
      return () => ipcRenderer.removeListener('leader-died', handler);
    },
    /** Listen for quit confirmation request from main process */
    onQuitConfirmRequest: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('quit:show-confirm', handler);
      return () => ipcRenderer.removeListener('quit:show-confirm', handler);
    },
    /** Send quit confirmation response to main process */
    sendQuitConfirmResponse: (confirmed: boolean): void => {
      ipcRenderer.send('quit:confirm-response', confirmed);
    },
  },
  /**
   * Video Assets API
   * For copying video files to assets folder for git commit
   */
  video: {
    /** Get the file system path for a dropped File (Electron 29+ requires this) */
    getFilePath: (file: File): string => webUtils.getPathForFile(file),
    /** Copy a video file to assets/videos/ for git tracking */
    copyToAssets: (sourcePath: string, videoId: string): Promise<{ ok: boolean; relativePath?: string; error?: string }> =>
      ipcRenderer.invoke('video:copy-to-assets', sourcePath, videoId),
    /** Load a video from assets/videos/ (for restart persistence) */
    loadFromAssets: (videoId: string): Promise<{ ok: boolean; base64?: string; mimeType?: string; error?: string }> =>
      ipcRenderer.invoke('video:load-from-assets', videoId),
  },
  /**
   * Thinker Wizard API
   * For discovering and launching thinker debate personas
   */
  thinker: {
    /** List available thinker personas from prompt pack index */
    listPersonas: (): Promise<{
      ok: boolean;
      packs?: Array<{
        id: string;
        name: string;
        file: string;
        category: string;
        description: string;
        style: string;
        icon: string;
        color: string;
        compatible_with: string[];
        tags: string[];
      }>;
      error?: string;
    }> => ipcRenderer.invoke('thinker:list-personas'),

    /** Get absolute paths for base and persona prompt files */
    getPromptPaths: (personaId: string): Promise<{
      ok: boolean;
      basePath?: string;
      personaPath?: string;
      error?: string;
    }> => ipcRenderer.invoke('thinker:get-prompt-paths', personaId),
  },
  /**
   * Specialist Wizard API
   * For discovering and launching specialist agents (security, performance, docs, tests)
   */
  specialist: {
    /** List available specialists from prompt pack index */
    listVariants: (): Promise<{
      ok: boolean;
      specialists?: Array<{
        id: string;
        name: string;
        file: string;
        category: string;
        description: string;
        tool_profile: string;
        icon: string;
        color: string;
        tags: string[];
      }>;
      error?: string;
    }> => ipcRenderer.invoke('specialist:list-variants'),

    /** Get absolute path for specialist prompt file */
    getPromptPath: (specialistId: string): Promise<{
      ok: boolean;
      promptPath?: string;
      error?: string;
    }> => ipcRenderer.invoke('specialist:get-prompt-path', specialistId),
  },
  /**
   * Quizmaster API
   * For launching requirements extraction specialist
   */
  quizmaster: {
    /** Get absolute path for quizmaster prompt file */
    getPromptPath: (): Promise<{
      ok: boolean;
      promptPath?: string;
      error?: string;
    }> => ipcRenderer.invoke('quizmaster:get-prompt-path'),
  },
  /**
   * Workflow Specialist API
   * For discovering and launching PRD workflow stage specialists
   */
  workflowSpecialist: {
    /** List available workflow specialists from prompt pack index */
    listVariants: (): Promise<{
      ok: boolean;
      specialists?: Array<{
        id: string;
        name: string;
        file: string;
        workflow: string;
        category: string;
        description: string;
        tool_profile: string;
        icon: string;
        color: string;
        tags: string[];
      }>;
      error?: string;
    }> => ipcRenderer.invoke('workflow-specialist:list-variants'),

    /** Get absolute path for workflow specialist prompt file */
    getPromptPath: (specialistId: string): Promise<{
      ok: boolean;
      promptPath?: string;
      error?: string;
    }> => ipcRenderer.invoke('workflow-specialist:get-prompt-path', specialistId),
  },
  /**
   * Speech Recognition API
   * Uses Python SpeechRecognition library via main process
   */
  speech: {
    /** Start listening for speech */
    start: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('speech:start'),
    /** Stop listening */
    stop: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('speech:stop'),
    /** Check if currently listening */
    isListening: (): Promise<boolean> =>
      ipcRenderer.invoke('speech:isListening'),
    /** Listen for transcript events */
    onTranscript: (callback: (text: string) => void) => {
      const handler = (_: unknown, text: string) => callback(text);
      ipcRenderer.on('speech:transcript', handler);
      return () => ipcRenderer.removeListener('speech:transcript', handler);
    },
    /** Listen for interim text */
    onInterim: (callback: (text: string) => void) => {
      const handler = (_: unknown, text: string) => callback(text);
      ipcRenderer.on('speech:interim', handler);
      return () => ipcRenderer.removeListener('speech:interim', handler);
    },
    /** Listen for audio level */
    onLevel: (callback: (level: number) => void) => {
      const handler = (_: unknown, level: number) => callback(level);
      ipcRenderer.on('speech:level', handler);
      return () => ipcRenderer.removeListener('speech:level', handler);
    },
    /** Listen for status changes */
    onStatus: (callback: (status: string) => void) => {
      const handler = (_: unknown, status: string) => callback(status);
      ipcRenderer.on('speech:status', handler);
      return () => ipcRenderer.removeListener('speech:status', handler);
    },
    /** Listen for errors */
    onError: (callback: (error: string) => void) => {
      const handler = (_: unknown, error: string) => callback(error);
      ipcRenderer.on('speech:error', handler);
      return () => ipcRenderer.removeListener('speech:error', handler);
    },
  },
  /**
   * Audio Transcription API (T073 + Whisper + LMStudio)
   * Sends recorded audio blobs to main process for speech-to-text
   * Supports local Whisper (default) and Google Speech fallback
   */
  audio: {
    /** Transcribe audio blob to text (Whisper default, Google fallback) */
    transcribe: (audioData: number[], mimeType: string, engine: 'whisper' | 'google' = 'whisper'): Promise<{
      success: boolean;
      transcription?: string;
      confidence?: number;
      error?: string;
    }> => ipcRenderer.invoke('audio:transcribe', audioData, mimeType, engine),

    /** Full voice chat flow: Transcribe -> LMStudio -> TTS */
    voiceChat: (
      audioData: number[],
      mimeType: string,
      engine: 'whisper' | 'google' = 'whisper',
      terminalId?: string,
      speakResponse: boolean = true
    ): Promise<{
      success: boolean;
      transcription?: string;
      response?: string;
      error?: string;
    }> => ipcRenderer.invoke('audio:voiceChat', audioData, mimeType, engine, terminalId, speakResponse),
  },
  /**
   * Voice Input API (stub - planned feature)
   * For continuous voice input recording
   */
  voiceInput: {
    /** Start voice input recording */
    start: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('voiceInput:start'),
    /** Stop recording and get transcript */
    stop: (): Promise<{ success: boolean; data?: { transcript: string }; error?: string }> =>
      ipcRenderer.invoke('voiceInput:stop'),
    /** Check microphone availability */
    checkMicrophone: (): Promise<{ available: boolean; error?: string }> =>
      ipcRenderer.invoke('voiceInput:checkMicrophone'),
  },
  /** Listen for voice input completion */
  onVoiceInputComplete: (callback: (event: unknown, data: { transcript: string }) => void) => {
    ipcRenderer.on('voiceInput:complete', callback);
  },
  /** Listen for voice input errors */
  onVoiceInputError: (callback: (event: unknown, data: { error: string }) => void) => {
    ipcRenderer.on('voiceInput:error', callback);
  },
  /** Remove voice input listeners */
  removeVoiceInputListeners: () => {
    ipcRenderer.removeAllListeners('voiceInput:complete');
    ipcRenderer.removeAllListeners('voiceInput:error');
  },
  /**
   * Changelog API
   * Save generated changelogs to file
   */
  changelog: {
    /** Save changelog content to file via native dialog */
    saveToFile: (content: string, version: string): Promise<{
      ok: boolean;
      path?: string;
      cancelled?: boolean;
      error?: string;
    }> => ipcRenderer.invoke('changelog:saveToFile', content, version),
  },
  /**
   * Unified Settings API
   * Persistent settings storage using electron-store
   * User-scoped: %APPDATA%/Kuroryuu/settings.json
   * Project-scoped: {project}/ai/settings/app-settings.json
   */
  settings: {
    /** Get a setting value by namespace (dot notation, e.g., 'audio.mic.silenceThreshold') */
    get: (namespace: string, scope?: 'user' | 'project'): Promise<unknown> =>
      ipcRenderer.invoke('settings:get', namespace, scope),

    /** Set a setting value */
    set: (namespace: string, value: unknown, scope?: 'user' | 'project'): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('settings:set', namespace, value, scope),

    /** Update a setting by merging partial data */
    update: (namespace: string, partial: Record<string, unknown>, scope?: 'user' | 'project'): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('settings:update', namespace, partial, scope),

    /** Get all settings for a scope */
    getAll: (scope: 'user' | 'project'): Promise<unknown> =>
      ipcRenderer.invoke('settings:getAll', scope),

    /** Reset a namespace to defaults */
    reset: (namespace: string, scope?: 'user' | 'project'): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('settings:reset', namespace, scope),

    /** Reset all settings for a scope */
    resetAll: (scope: 'user' | 'project'): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('settings:resetAll', scope),

    /** Check if migration from localStorage is needed */
    needsMigration: (): Promise<boolean> =>
      ipcRenderer.invoke('settings:needsMigration'),

    /** Get list of localStorage keys to migrate */
    getMigrationKeys: (): Promise<string[]> =>
      ipcRenderer.invoke('settings:getMigrationKeys'),

    /** Run migration with localStorage data */
    migrate: (localStorageData: Record<string, string>): Promise<{
      success: boolean;
      migrated: string[];
      errors: string[];
      skipped: string[];
    }> => ipcRenderer.invoke('settings:migrate', localStorageData),

    /** Get store file paths (for debugging) */
    getPaths: (): Promise<{ user: string; project: string | null }> =>
      ipcRenderer.invoke('settings:getPaths'),

    /** Listen for settings changes from main process */
    onChanged: (callback: (event: { namespace: string; value: unknown; scope: 'user' | 'project'; timestamp: number }) => void) => {
      const handler = (_: unknown, event: { namespace: string; value: unknown; scope: 'user' | 'project'; timestamp: number }) => callback(event);
      ipcRenderer.on('settings:changed', handler);
      return () => ipcRenderer.removeListener('settings:changed', handler);
    },

    // ========================================================================
    // FULL RESET & BACKUP MANAGEMENT
    // ========================================================================

    /** Perform full app reset with optional backup */
    fullReset: (options: {
      createBackup: boolean;
      resetUserSettings: boolean;
      resetProjectSettings: boolean;
      clearPTY: boolean;
      clearLocalStorage: boolean;
      clearIndexedDB: boolean;
    }): Promise<{ ok: boolean; backupPaths?: string[]; error?: string }> =>
      ipcRenderer.invoke('settings:fullReset', options),

    /** Create a timestamped backup of settings */
    createBackup: (scope: 'user' | 'project'): Promise<{
      path: string;
      timestamp: number;
      scope: 'user' | 'project';
      size: number;
      filename: string;
    }> => ipcRenderer.invoke('settings:createBackup', scope),

    /** List available backups for a scope */
    listBackups: (scope: 'user' | 'project'): Promise<Array<{
      path: string;
      timestamp: number;
      scope: 'user' | 'project';
      size: number;
      filename: string;
    }>> => ipcRenderer.invoke('settings:listBackups', scope),

    /** Restore settings from a backup file */
    restoreBackup: (backupPath: string, scope: 'user' | 'project'): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('settings:restoreBackup', backupPath, scope),

    /** Delete a backup file */
    deleteBackup: (backupPath: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('settings:deleteBackup', backupPath),

    /** Export localStorage data to a file (for backup before reset) */
    exportLocalStorage: (data: string, filename: string): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('settings:exportLocalStorage', data, filename),

    /** Listen for browser storage clear signal from main process (triggered during full reset) */
    onClearBrowserStorage: (callback: (options: { clearLocalStorage: boolean; clearIndexedDB: boolean }) => void) => {
      const handler = (_: unknown, options: { clearLocalStorage: boolean; clearIndexedDB: boolean }) => callback(options);
      ipcRenderer.on('settings:clearBrowserStorage', handler);
      return () => ipcRenderer.removeListener('settings:clearBrowserStorage', handler);
    },
  },
  /**
   * Domain Config API
   * Export domain configs to shared file for Tray Companion sync
   */
  domainConfig: {
    /** Export domain configs to shared JSON file */
    export: (data: { version: number; lastUpdated: string; configs: Record<string, unknown> }): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('domain-config:export', data),
    /** Import domain configs from shared JSON file */
    import: (): Promise<{ success: boolean; data?: { version: number; lastUpdated: string; configs: Record<string, unknown> }; error?: string }> =>
      ipcRenderer.invoke('domain-config:import'),
  },
  /**
   * Auto-Updater API
   * Automatic updates from GitHub Releases
   */
  updater: {
    /** Check for updates manually */
    check: (): Promise<{ ok: boolean; updateInfo?: unknown; error?: string }> =>
      ipcRenderer.invoke('updater:check'),
    /** Quit and install downloaded update */
    install: (): Promise<void> =>
      ipcRenderer.invoke('updater:install'),
    /** Get current app version */
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke('updater:getVersion'),
    /** Listen for update status changes */
    onStatus: (callback: (status: {
      status: 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error';
      version?: string;
      percent?: number;
      error?: string;
    }) => void) => {
      const handler = (_: unknown, status: {
        status: 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error';
        version?: string;
        percent?: number;
        error?: string;
      }) => callback(status);
      ipcRenderer.on('update-status', handler);
      return () => ipcRenderer.removeListener('update-status', handler);
    },
  },
  /**
   * Service Manager API
   * Restart and health check for backend services (MCP Core, Gateway, PTY Daemon)
   */
  services: {
    /** Restart MCP Core service */
    restartMcp: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('service:restart:mcp'),
    /** Restart Gateway service */
    restartGateway: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('service:restart:gateway'),
    /** Restart PTY Daemon service */
    restartPtyDaemon: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('service:restart:pty-daemon'),
    /** Get PTY Daemon health status */
    getPtyDaemonHealth: (): Promise<{ ok: boolean; status: 'connected' | 'disconnected'; port: number }> =>
      ipcRenderer.invoke('service:health:pty-daemon'),
    /** Get health status for any service by ID */
    getHealth: (serviceId: string): Promise<{ ok: boolean; status: 'connected' | 'disconnected' | 'error'; port: number; name: string }> =>
      ipcRenderer.invoke('service:health', serviceId),
  },

  /**
   * Clawdbot API (OPT-IN, Docker-based)
   * Local chatbot container management
   */
  clawdbot: {
    /** Get current status */
    status: (): Promise<{
      enabled: boolean;
      dockerAvailable: boolean;
      containerExists: boolean;
      containerRunning: boolean;
    }> => ipcRenderer.invoke('clawdbot:status'),
    /** Start the container */
    start: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('clawdbot:start'),
    /** Stop the container */
    stop: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('clawdbot:stop'),
  },

  /**
   * CodeEditor Window API
   * Opens a separate code editor window for side-by-side editing
   */
  codeEditor: {
    /** Open the CodeEditor window (creates or focuses existing) */
    open: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('code-editor:open'),
  },

  /**
   * Playground Window API
   * Opens a separate Claude Playground window for dashboard generation
   */
  playground: {
    /** Open the Playground window (creates or focuses existing) */
    open: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('playground:open'),
    /** List available playground HTML files */
    list: (): Promise<Array<{ name: string; path: string; size: number; mtime: string }>> =>
      ipcRenderer.invoke('playground:list'),
    /** Read playground HTML content (path must be under playgrounds/) */
    read: (filePath: string): Promise<string> =>
      ipcRenderer.invoke('playground:read', filePath),
  },

  /**
   * Git API
   * Git operations for the code editor
   */
  git: {
    /** Get repository name */
    getRepoName: (): Promise<string> =>
      ipcRenderer.invoke('git:getRepoName'),

    /** Get repository path */
    getRepoPath: (): Promise<string> =>
      ipcRenderer.invoke('git:getRepoPath'),

    /** Get current branch with ahead/behind info */
    getCurrentBranch: (): Promise<{
      branch: string;
      ahead: number;
      behind: number;
      error?: string;
    }> => ipcRenderer.invoke('git:getCurrentBranch'),

    /** Fetch from origin */
    fetch: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:fetch'),

    /** Get git status (porcelain format for GitHub Desktop clone) */
    status: (): Promise<{
      ok: boolean;
      output?: string;
      format?: string;
      files?: Array<{ path: string; status: string; staged: boolean }>;
      error?: string;
    }> => ipcRenderer.invoke('git:status'),

    /** Get current branch name */
    branch: (): Promise<{ ok: boolean; branch: string; error?: string }> =>
      ipcRenderer.invoke('git:branch'),

    /** Get diff for a specific file */
    diff: (filePath: string): Promise<{ ok: boolean; diff: string; error?: string }> =>
      ipcRenderer.invoke('git:diff', filePath),

    /** Get diff for a specific file in a commit */
    diffCommit: (hash: string, filePath: string): Promise<{ diff?: string; error?: string }> =>
      ipcRenderer.invoke('git:diffCommit', hash, filePath),

    /** Stage a file */
    stage: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:stage', filePath),

    /** Unstage a file */
    unstage: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:unstage', filePath),

    /** Commit staged changes */
    commit: (message: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:commit', message),

    /** Commit with amend (replace last commit) */
    commitAmend: (message: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:commitAmend', message),

    /** Stage all changes */
    stageAll: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:stageAll'),

    /** Unstage all changes */
    unstageAll: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:unstageAll'),

    /** Discard changes for a specific file */
    discardChanges: (filePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:discardChanges', filePath),

    /** Get recent commits */
    log: (limit?: number): Promise<{
      commits: Array<{
        hash: string;
        shortHash: string;
        summary: string;
        authorName: string;
        authorEmail: string;
        date: string;
        timestamp: number;
        parents: string[];
      }>;
      error?: string;
    }> => ipcRenderer.invoke('git:log', limit),

    /** Get commit details */
    show: (commitHash?: string): Promise<{
      commit?: {
        hash: string;
        shortHash: string;
        summary: string;
        message: string;
        body: string;
        author: { name: string; email: string; date: string };
        timestamp: number;
        parents: string[];
        files: Array<{ status: string; path: string; additions: number; deletions: number }>;
        filesChanged: number;
        additions: number;
        deletions: number;
      };
      error?: string;
    }> => ipcRenderer.invoke('git:show', commitHash),

    /** Stash changes (T411) */
    stash: (message?: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:stash', message),

    /** Pop latest stash (T411) */
    stashPop: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:stashPop'),

    /** List stashes (T411) */
    stashList: (): Promise<{
      ok: boolean;
      stashes: Array<{ index: number; ref: string; message: string }>;
      error?: string;
    }> => ipcRenderer.invoke('git:stashList'),

    /** Checkout branch (T411) */
    checkout: (branchName: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:checkout', branchName),

    /** Create new branch (T411) */
    createBranch: (branchName: string, checkout?: boolean): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:createBranch', branchName, checkout),

    /** List branches with tracking info (T411) */
    listBranches: (): Promise<{
      ok: boolean;
      branches: Array<{
        name: string;
        isCurrent: boolean;
        upstream: string | null;
        ahead: number;
        behind: number;
        hasRemote: boolean;
      }>;
      error?: string;
    }> => ipcRenderer.invoke('git:listBranches'),

    /** Pull from remote (T411) */
    pull: (): Promise<{ ok: boolean; output?: string; error?: string }> =>
      ipcRenderer.invoke('git:pull'),

    /** Push to remote (T411) */
    push: (setUpstream?: boolean): Promise<{ ok: boolean; output?: string; error?: string }> =>
      ipcRenderer.invoke('git:push', setUpstream),

    /** Delete branch (T411) */
    deleteBranch: (branchName: string, force?: boolean): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:deleteBranch', branchName, force),

    /** Rename a branch */
    renameBranch: (oldName: string, newName: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:renameBranch', oldName, newName),

    /** Delete a remote branch */
    deleteRemoteBranch: (branchName: string, remote?: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('git:deleteRemoteBranch', branchName, remote),

    /** Get file content at specific revision (for diff view) */
    getFileAtRevision: (filePath: string, revision?: string): Promise<{
      ok: boolean;
      content: string;
      error?: string;
    }> => ipcRenderer.invoke('git:getFileAtRevision', filePath, revision || 'HEAD'),
  },

  // Dialog APIs
  dialog: {
    showOpenDialog: (options: {
      title?: string;
      defaultPath?: string;
      properties?: ('openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles')[];
      filters?: { name: string; extensions: string[] }[];
    }): Promise<{ canceled: boolean; filePaths: string[] }> =>
      ipcRenderer.invoke('dialog:showOpenDialog', options),
  },

  // Shutdown APIs
  shutdown: {
    onStart: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shutdown:start', handler);
      return () => ipcRenderer.removeListener('shutdown:start', handler);
    },
    onProgressUpdate: (callback: (data: { step: string; progress: number }) => void) => {
      const handler = (_event: IpcRendererEvent, data: { step: string; progress: number }) => callback(data);
      ipcRenderer.on('shutdown:progress', handler);
      return () => ipcRenderer.removeListener('shutdown:progress', handler);
    },
    onCountdownUpdate: (callback: (count: number) => void) => {
      const handler = (_event: IpcRendererEvent, count: number) => callback(count);
      ipcRenderer.on('shutdown:countdown', handler);
      return () => ipcRenderer.removeListener('shutdown:countdown', handler);
    },
  },

  // CLI Proxy APIs (Docker + Native + OAuth for CLIProxyAPI)
  cliproxy: {
    docker: {
      check: (): Promise<{ installed: boolean; running: boolean; error?: string }> =>
        ipcRenderer.invoke('cliproxy:docker:check'),
    },
    container: {
      status: (): Promise<{ running: boolean; status?: string; error?: string }> =>
        ipcRenderer.invoke('cliproxy:container:status'),
      start: (containerPath?: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('cliproxy:container:start', containerPath),
      stop: (): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('cliproxy:container:stop'),
    },
    oauth: {
      start: (provider: string): Promise<{ url?: string; error?: string; authenticated?: boolean; waiting?: boolean; output?: string }> =>
        ipcRenderer.invoke('cliproxy:oauth:start', provider),
      status: (): Promise<{ gemini: number; claude: number; openai: number; total: number; error?: string }> =>
        ipcRenderer.invoke('cliproxy:oauth:status'),
    },
    // Native mode APIs (no Docker required)
    native: {
      /** Check if main process CLIProxy startup cleanup is complete */
      startupReady: (): Promise<boolean> =>
        ipcRenderer.invoke('cliproxy:startup-ready'),
      /** Download and provision the CLIProxyAPI binary */
      provision: (): Promise<{ success: boolean; version?: string; error?: string }> =>
        ipcRenderer.invoke('cliproxy:native:provision'),
      /** Start the native CLIProxyAPI process */
      start: (): Promise<{ success: boolean; pid?: number; error?: string }> =>
        ipcRenderer.invoke('cliproxy:native:start'),
      /** Stop the native CLIProxyAPI process */
      stop: (): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('cliproxy:native:stop'),
      /** Restart the native CLIProxyAPI process (force kill + start) */
      restart: (): Promise<{ success: boolean; pid?: number; error?: string }> =>
        ipcRenderer.invoke('cliproxy:native:restart'),
      /** Get status of native CLIProxyAPI */
      status: (): Promise<{
        running: boolean;
        pid?: number;
        version?: string;
        provisioned: boolean;
        healthy: boolean;
        error?: string;
      }> => ipcRenderer.invoke('cliproxy:native:status'),
      /** Start OAuth flow via native binary */
      oauth: (provider: string): Promise<{ url?: string; error?: string; authenticated?: boolean; waiting?: boolean }> =>
        ipcRenderer.invoke('cliproxy:native:oauth', provider),
      /** Get native manager config */
      config: (): Promise<{
        success: boolean;
        config?: { binaryPath: string; configPath: string; port: number; dataDir: string };
        error?: string;
      }> => ipcRenderer.invoke('cliproxy:native:config'),
      /** Check for updates against GitHub releases */
      checkUpdate: (): Promise<{
        updateAvailable: boolean;
        currentVersion: string | null;
        latestVersion: string;
        error?: string;
      }> => ipcRenderer.invoke('cliproxy:native:check-update'),
      /** Get pending update from auto-start check (null if none) */
      pendingUpdate: (): Promise<{
        updateAvailable: boolean;
        currentVersion: string | null;
        latestVersion: string;
      } | null> => ipcRenderer.invoke('cliproxy:native:pending-update'),
      /** Respond to update prompt: 'auto' downloads+restarts, 'manual' skips */
      updateResponse: (choice: 'auto' | 'manual'): Promise<{
        success: boolean;
        version?: string;
        skipped?: boolean;
        error?: string;
      }> => ipcRenderer.invoke('cliproxy:update-response', choice),
    },
  },

  // Leader Monitor API - for Ralph inactivity monitoring
  leaderMonitor: {
    getStatus: (): Promise<{
      ok: boolean;
      data?: {
        isMonitoring: boolean;
        leaderTerminalId: string | null;
        status: 'active' | 'idle' | 'nudged' | 'not_monitoring';
        lastActivityMs: number | null;
        idleDurationMs: number | null;
        lastNudgeMs: number | null;
        nudgeCount: number;
      };
      error?: string;
    }> => ipcRenderer.invoke('leader-monitor:getStatus'),
    start: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('leader-monitor:start'),
    stop: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('leader-monitor:stop'),
    updateConfig: (config: {
      inactivityTimeoutMs?: number;
      checkIntervalMs?: number;
      maxNudgesBeforeAlert?: number;
    }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('leader-monitor:updateConfig', config),
  },

  // Leader Monitor event listeners
  onLeaderMonitorStatus: (callback: (status: {
    isMonitoring: boolean;
    leaderTerminalId: string | null;
    status: 'active' | 'idle' | 'nudged' | 'not_monitoring';
    lastActivityMs: number | null;
    idleDurationMs: number | null;
    lastNudgeMs: number | null;
    nudgeCount: number;
  }) => void) => {
    const handler = (_event: IpcRendererEvent, status: unknown) => callback(status as Parameters<typeof callback>[0]);
    ipcRenderer.on('leader-monitor:status', handler);
    return () => ipcRenderer.removeListener('leader-monitor:status', handler);
  },
  onLeaderMonitorNudge: (callback: (event: {
    timestamp: number;
    message: string;
    idleDurationMs: number;
  }) => void) => {
    const handler = (_event: IpcRendererEvent, data: unknown) => callback(data as Parameters<typeof callback>[0]);
    ipcRenderer.on('leader-monitor:nudge', handler);
    return () => ipcRenderer.removeListener('leader-monitor:nudge', handler);
  },
  onLeaderMonitorAlert: (callback: (alert: {
    type: string;
    nudgeCount: number;
    message: string;
  }) => void) => {
    const handler = (_event: IpcRendererEvent, data: unknown) => callback(data as Parameters<typeof callback>[0]);
    ipcRenderer.on('leader-monitor:alert', handler);
    return () => ipcRenderer.removeListener('leader-monitor:alert', handler);
  },

  /**
   * Claude Teams API (Agent Teams file watcher + CLI bridge)
   * Monitors ~/.claude/teams/ and ~/.claude/tasks/ for real-time team state.
   */
  claudeTeams: {
    /** Start watching teams/tasks directories, returns initial snapshot */
    startWatching: (): Promise<{ ok: boolean; snapshot?: unknown; error?: string }> =>
      ipcRenderer.invoke('claude-teams:start-watching'),
    /** Stop watching */
    stopWatching: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('claude-teams:stop-watching'),
    /** Restart watching (recovers from directory deletion) */
    restartWatching: (): Promise<{ ok: boolean; snapshot?: unknown; error?: string }> =>
      ipcRenderer.invoke('claude-teams:restart-watching'),
    /** Get all teams from disk */
    getTeams: (): Promise<{ ok: boolean; teams?: unknown[]; error?: string }> =>
      ipcRenderer.invoke('claude-teams:get-teams'),
    /** Get tasks for a specific team */
    getTasks: (teamName: string): Promise<{ ok: boolean; tasks?: unknown[]; error?: string }> =>
      ipcRenderer.invoke('claude-teams:get-tasks', teamName),
    /** Get inbox messages for a specific team + agent */
    getMessages: (teamName: string, agentName: string): Promise<{ ok: boolean; messages?: unknown[]; error?: string }> =>
      ipcRenderer.invoke('claude-teams:get-messages', teamName, agentName),
    /** General-purpose CLI bridge (with error capture) */
    execCli: (args: string[]): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('claude-teams:exec-cli', args),
    /** Create a team via direct IPC (with error capture) */
    createTeam: (params: { name: string; description: string; teammates?: unknown[] }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('claude-teams:create-team', { name: params.name, description: params.description }),
    /** Send message to a teammate via direct inbox file write */
    messageTeammate: (params: { teamName: string; recipient: string; content: string; summary?: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('claude-teams:message-teammate', {
        teamName: params.teamName,
        recipient: params.recipient,
        content: params.content,
        summary: params.summary,
      }),
    /** Request teammate shutdown via inbox shutdown_request message */
    shutdownTeammate: (params: { teamName: string; recipient: string; content?: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('claude-teams:shutdown-teammate', {
        teamName: params.teamName,
        recipient: params.recipient,
        content: params.content,
      }),
    /** Cleanup a team (convenience wrapper) */
    cleanupTeam: (params: { teamName: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('claude-teams:cleanup-team', params.teamName),
    /** Refresh data for a specific team */
    refreshTeam: (teamName: string): Promise<void> =>
      ipcRenderer.invoke('claude-teams:get-teams').then(() => { }),
    /** Mark all inbox messages as read for a specific agent */
    markInboxRead: (params: { teamName: string; agentName: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('claude-teams:mark-inbox-read', params),
    /** Listen for state update events from file watcher */
    onStateUpdate: (callback: (event: unknown) => void) => {
      const handlers = [
        (_: unknown, data: unknown) => callback({ type: 'team-config-changed', ...(data as Record<string, unknown>) }),
        (_: unknown, data: unknown) => callback({ type: 'tasks-changed', ...(data as Record<string, unknown>) }),
        (_: unknown, data: unknown) => callback({ type: 'inbox-changed', ...(data as Record<string, unknown>) }),
        (_: unknown, data: unknown) => callback({ type: 'team-deleted', ...(data as Record<string, unknown>) }),
        (_: unknown, data: unknown) => callback({ type: 'watcher-error', ...(data as Record<string, unknown>) }),
        (_: unknown, data: unknown) => callback({ type: 'team-stale', ...(data as Record<string, unknown>) }),
      ];
      ipcRenderer.on('claude-teams:config-updated', handlers[0]);
      ipcRenderer.on('claude-teams:tasks-updated', handlers[1]);
      ipcRenderer.on('claude-teams:messages-updated', handlers[2]);
      ipcRenderer.on('claude-teams:team-deleted', handlers[3]);
      ipcRenderer.on('claude-teams:watcher-error', handlers[4]);
      ipcRenderer.on('claude-teams:team-stale', handlers[5]);
      return () => {
        ipcRenderer.removeListener('claude-teams:config-updated', handlers[0]);
        ipcRenderer.removeListener('claude-teams:tasks-updated', handlers[1]);
        ipcRenderer.removeListener('claude-teams:messages-updated', handlers[2]);
        ipcRenderer.removeListener('claude-teams:team-deleted', handlers[3]);
        ipcRenderer.removeListener('claude-teams:watcher-error', handlers[4]);
        ipcRenderer.removeListener('claude-teams:team-stale', handlers[5]);
      };
    },
  },

  /**
   * Claude Code Auto Memory API
   * Reads/writes ~/.claude/projects/{hash}/memory/ files
   */
  claudeMemory: {
    list: (): Promise<{ ok: boolean; files?: { name: string; size: number }[]; error?: string }> =>
      ipcRenderer.invoke('claude-memory:list'),
    read: (filename: string): Promise<{ ok: boolean; content?: string; error?: string }> =>
      ipcRenderer.invoke('claude-memory:read', filename),
    write: (filename: string, content: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('claude-memory:write', filename, content),
  },

  // Team History API - Session archival and replay
  teamHistory: {
    /** Archive a team session before cleanup */
    archiveSession: (data: {
      teamName: string;
      config: unknown;
      tasks: unknown[];
      inboxes: Record<string, unknown[]>;
    }): Promise<{ ok: boolean; id?: string; error?: string }> =>
      ipcRenderer.invoke('claude-teams:archive-session', data),
    /** List all archived sessions (lightweight, no full data) */
    listArchives: (): Promise<{
      ok: boolean;
      entries: {
        id: string;
        teamName: string;
        archivedAt: string;
        createdAt: number;
        duration: number;
        stats: {
          memberCount: number;
          taskCount: number;
          completedTasks: number;
          pendingTasks: number;
          inProgressTasks: number;
          messageCount: number;
        };
        filePath: string;
      }[];
      error?: string;
    }> => ipcRenderer.invoke('claude-teams:list-archives'),
    /** Load a full archived session by ID */
    loadArchive: (archiveId: string): Promise<{ ok: boolean; archive?: unknown; error?: string }> =>
      ipcRenderer.invoke('claude-teams:load-archive', archiveId),
    /** Delete an archived session */
    deleteArchive: (archiveId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('claude-teams:delete-archive', archiveId),
  },

  // Team Templates API - Save/load team configuration templates
  teamTemplates: {
    /** List all saved templates */
    list: (): Promise<{
      ok: boolean;
      templates: Array<{
        id: string;
        name: string;
        description: string;
        createdAt: string;
        isFavorite: boolean;
        config: {
          teammates: Array<{
            name: string;
            prompt: string;
            model?: string;
            color?: string;
            planModeRequired?: boolean;
          }>;
        };
      }>;
      error?: string;
    }> => ipcRenderer.invoke('claude-teams:list-templates'),
    /** Save a new template */
    save: (template: {
      name: string;
      description: string;
      isFavorite: boolean;
      config: {
        teammates: Array<{
          name: string;
          prompt: string;
          model?: string;
          color?: string;
          planModeRequired?: boolean;
        }>;
      };
    }): Promise<{ ok: boolean; template?: unknown; error?: string }> =>
      ipcRenderer.invoke('claude-teams:save-template', template),
    /** Delete a template by ID */
    delete: (templateId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('claude-teams:delete-template', templateId),
    /** Toggle favorite status on a template */
    toggleFavorite: (templateId: string): Promise<{ ok: boolean; isFavorite?: boolean; error?: string }> =>
      ipcRenderer.invoke('claude-teams:toggle-template-favorite', templateId),
  },

  // Global Hooks API - Manage TTS hooks in ~/.claude/settings.json for Agent Teams
  globalHooks: {
    /** Install TTS hooks in global settings for Agent Teams teammates */
    installTts: (config: {
      voice: string;
      smartSummaries: boolean;
      messages: { stop: string; subagentStop: string; notification: string };
      summaryProvider?: string;
      summaryModel?: string;
      userName?: string;
    }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('global-hooks:install-tts', config),
    /** Remove TTS hooks from global settings */
    removeTts: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('global-hooks:remove-tts'),
    /** Check if global TTS hooks are installed */
    status: (): Promise<{ installed: boolean }> =>
      ipcRenderer.invoke('global-hooks:status'),
    /** Validate prerequisites for global TTS hooks */
    validate: (): Promise<{
      valid: boolean;
      uvFound: boolean;
      uvPath: string | null;
      scriptFound: boolean;
      scriptPath: string | null;
      errors: string[];
    }> => ipcRenderer.invoke('global-hooks:validate'),
    /** Test global TTS by playing a test announcement */
    test: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('global-hooks:test'),
  },

  // Backup API - Restic backup management
  backup: {
    // Configuration
    getConfig: (): Promise<{
      ok: boolean;
      data?: {
        schema_version: string;
        repository: { path: string; type: string; initialized: boolean };
        backup: { source_path: string; exclusions: string[] };
        retention: { keep_last: number; keep_daily: number; keep_weekly: number; keep_monthly: number };
        schedule: { enabled: boolean; interval_hours: number; last_run?: string };
      };
      paths?: { settingsDir: string; binDir: string; defaultRepoPath: string };
      error?: string;
    }> => ipcRenderer.invoke('backup:get-config'),
    saveConfig: (config: unknown): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('backup:save-config', config),
    createDefaultConfig: (sourcePath: string): Promise<{ ok: boolean; data?: unknown; error?: string }> =>
      ipcRenderer.invoke('backup:create-default-config', sourcePath),

    // Status
    getStatus: (): Promise<{
      ok: boolean;
      data?: {
        is_configured: boolean;
        repository_exists: boolean;
        repository_accessible: boolean;
        restic_installed: boolean;
        restic_version: string | null;
        config_path: string;
        binary_path: string;
        snapshot_count: number;
        last_backup_time: string | null;
      };
      error?: string;
    }> => ipcRenderer.invoke('backup:get-status'),
    ensureRestic: (): Promise<{
      ok: boolean;
      data?: { installed: boolean; path: string | null; version: string | null; downloaded: boolean };
      error?: string;
    }> => ipcRenderer.invoke('backup:ensure-restic'),

    // Repository
    initRepo: (password: string): Promise<{ ok: boolean; message: string; error?: string }> =>
      ipcRenderer.invoke('backup:init-repo', password),
    resetRepo: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('backup:reset'),
    verifyPassword: (password: string): Promise<{ ok: boolean; data?: { valid: boolean }; error?: string }> =>
      ipcRenderer.invoke('backup:verify-password', password),

    // Backup operations
    create: (params: { message?: string; tags?: string[] }): Promise<{
      ok: boolean;
      session_id: string;
      snapshot_id?: string;
      error?: string;
    }> => ipcRenderer.invoke('backup:create', params),
    list: (limit?: number): Promise<{
      ok: boolean;
      snapshots: Array<{
        id: string;
        short_id: string;
        parent: string | null;
        time: string;
        time_ago: string;
        hostname: string;
        username: string;
        tags: string[];
        paths: string[];
        message: string;
        stats: {
          files_new: number;
          files_changed: number;
          files_unmodified: number;
          data_added: number;
          total_files_processed: number;
          total_bytes_processed: number;
        };
        formatted: {
          time_ago: string;
          data_added: string;
          total_size: string;
          files_summary: string;
        };
      }>;
      total_count: number;
    }> => ipcRenderer.invoke('backup:list', limit),
    diff: (params: { snapshotId: string; compareTo?: string }): Promise<{
      ok: boolean;
      data?: {
        snapshot_id: string;
        compare_to: string;
        added: Array<{ path: string; status: string }>;
        removed: Array<{ path: string; status: string }>;
        modified: Array<{ path: string; status: string }>;
      };
      error?: string;
    }> => ipcRenderer.invoke('backup:diff', params),
    restore: (params: { snapshotId: string; targetPath: string; includePaths?: string[] }): Promise<{
      ok: boolean;
      restored_files: number;
      target_path: string;
      error?: string;
    }> => ipcRenderer.invoke('backup:restore', params),

    // Maintenance
    forget: (params: { snapshotId: string; prune?: boolean }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('backup:forget', params),
    prune: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('backup:prune'),
    check: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('backup:check'),

    // Dialogs
    selectSourceDir: (): Promise<{ ok: boolean; canceled?: boolean; data?: { path: string } }> =>
      ipcRenderer.invoke('backup:select-source-dir'),
    selectRestoreTarget: (): Promise<{ ok: boolean; canceled?: boolean; data?: { path: string } }> =>
      ipcRenderer.invoke('backup:select-restore-target'),
  },
  /**
   * Marketing API
   * Tool installation and setup for marketing workspace
   */
  marketing: {
    ensureUv: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('marketing:ensureUv'),
    cloneRepo: (repoUrl: string, targetDir: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('marketing:cloneRepo', repoUrl, targetDir),
    installDeps: (toolDir: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('marketing:installDeps', toolDir),
    getToolStatus: (): Promise<{ tools: Array<{ id: string; name: string; description: string; installed: boolean; depsInstalled: boolean; path: string | null; version: string | null; repoUrl: string; optional: boolean }> }> =>
      ipcRenderer.invoke('marketing:getToolStatus'),
    getSetupState: (): Promise<{ complete: boolean; tools: unknown[] }> =>
      ipcRenderer.invoke('marketing:getSetupState'),
    saveSetup: (state: unknown): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('marketing:saveSetup', state),
    injectKeys: (): Promise<{ ok: boolean; injected?: string[]; error?: string }> =>
      ipcRenderer.invoke('marketing:injectKeys'),
    resetSetup: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('marketing:resetSetup'),
    studioServer: (action: 'start' | 'stop' | 'status', template?: string): Promise<{ ok: boolean; running?: boolean; port?: number; template?: string; error?: string }> =>
      ipcRenderer.invoke('marketing:studioServer', action, template),
  },
  /**
   * LLM Apps API
   * Catalog browsing and setup for awesome-llm-apps collection
   */
  llmApps: {
    cloneRepo: (): Promise<{ ok: boolean; error?: string; alreadyExists?: boolean }> =>
      ipcRenderer.invoke('llm-apps:cloneRepo'),
    buildCatalog: (): Promise<{ ok: boolean; catalog?: unknown; error?: string }> =>
      ipcRenderer.invoke('llm-apps:buildCatalog'),
    getCatalog: (): Promise<{ ok: boolean; catalog?: unknown; error?: string }> =>
      ipcRenderer.invoke('llm-apps:getCatalog'),
    getAppReadme: (appPath: string): Promise<{ ok: boolean; content?: string; error?: string }> =>
      ipcRenderer.invoke('llm-apps:getAppReadme', appPath),
    runApp: (appPath: string, runCmd: string | null, hasReqs: boolean): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('llm-apps:runApp', appPath, runCmd, hasReqs),
    getSetupState: (): Promise<{ complete: boolean }> =>
      ipcRenderer.invoke('llm-apps:getSetupState'),
    saveSetup: (state: unknown): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('llm-apps:saveSetup', state),
    pullUpdates: (): Promise<{ ok: boolean; catalog?: unknown; newApps?: number; totalApps?: number; error?: string }> =>
      ipcRenderer.invoke('llm-apps:pullUpdates'),
  },

  /**
   * SDK Agent API
   * Claude Agent SDK integration — spawn, stream, stop agents programmatically
   */
  sdkAgent: {
    /** Start a new agent session */
    start: (config: {
      prompt: string;
      role?: string;
      model?: string;
      cwd?: string;
      permissionMode?: string;
      allowedTools?: string[];
      disallowedTools?: string[];
      maxTurns?: number;
      maxBudgetUsd?: number;
      systemPrompt?: string;
      appendSystemPrompt?: string;
      useClaudeCodePreset?: boolean;
      agents?: Record<string, unknown>;
      agent?: string;
      mcpServers?: Record<string, unknown>;
      resumeSessionId?: string;
    }): Promise<{ ok: boolean; sessionId?: string; error?: string }> =>
      ipcRenderer.invoke('sdk-agent:start', config),

    /** Stop / cancel a running agent */
    stop: (sessionId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('sdk-agent:stop', sessionId),

    /** Resume a previous session with a new prompt */
    resume: (sessionId: string, prompt: string): Promise<{ ok: boolean; sessionId?: string; error?: string }> =>
      ipcRenderer.invoke('sdk-agent:resume', sessionId, prompt),

    /** List all sessions (summary view) */
    list: (): Promise<Array<{
      id: string;
      sdkSessionId?: string;
      role?: string;
      status: string;
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
    }>> => ipcRenderer.invoke('sdk-agent:list'),

    /** Get full session details */
    get: (sessionId: string): Promise<unknown | null> =>
      ipcRenderer.invoke('sdk-agent:get', sessionId),

    /** Get messages with pagination */
    getMessages: (sessionId: string, offset?: number, limit?: number): Promise<unknown[]> =>
      ipcRenderer.invoke('sdk-agent:messages', sessionId, offset, limit),

    /** Get message count for a session */
    getMessageCount: (sessionId: string): Promise<number> =>
      ipcRenderer.invoke('sdk-agent:messageCount', sessionId),

    /** Get available agent roles */
    getRoles: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('sdk-agent:roles'),

    /** Subscribe to real-time SDK messages */
    onMessage: (callback: (sessionId: string, message: unknown) => void): (() => void) => {
      const handler = (_event: unknown, sid: string, msg: unknown) => callback(sid, msg);
      ipcRenderer.on('sdk-agent:message', handler as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener('sdk-agent:message', handler as (...args: unknown[]) => void);
    },

    /** Subscribe to session completion events */
    onCompleted: (callback: (sessionId: string, result: unknown) => void): (() => void) => {
      const handler = (_event: unknown, sid: string, result: unknown) => callback(sid, result);
      ipcRenderer.on('sdk-agent:completed', handler as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener('sdk-agent:completed', handler as (...args: unknown[]) => void);
    },

    /** Subscribe to status change events */
    onStatusChange: (callback: (sessionId: string, status: string) => void): (() => void) => {
      const handler = (_event: unknown, sid: string, status: string) => callback(sid, status);
      ipcRenderer.on('sdk-agent:status-change', handler as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener('sdk-agent:status-change', handler as (...args: unknown[]) => void);
    },

    /** Subscribe to CLI session spawn events (for auto-navigation) */
    onCliSessionSpawned: (callback: (sessionId: string) => void): (() => void) => {
      const handler = (_event: unknown, sid: string) => callback(sid);
      ipcRenderer.on('cli:session-spawned', handler as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener('cli:session-spawned', handler as (...args: unknown[]) => void);
    },
  },

  /**
   * Identity / Personal Assistant API
   * Manages identity files, mutations, actions, heartbeat, and activity timeline
   */
  identity: {
    /** Get all 4 identity files as a profile */
    getProfile: (): Promise<unknown> =>
      ipcRenderer.invoke('identity:getProfile'),

    /** Get a single identity file */
    getFile: (key: string): Promise<unknown> =>
      ipcRenderer.invoke('identity:getFile', key),

    /** Update a single identity file */
    updateFile: (key: string, content: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('identity:updateFile', key, content),

    /** Get mutation log entries */
    getMutations: (limit?: number, since?: number): Promise<unknown[]> =>
      ipcRenderer.invoke('identity:getMutations', limit, since),

    /** Get action records */
    getActions: (limit?: number, since?: number): Promise<unknown[]> =>
      ipcRenderer.invoke('identity:getActions', limit, since),

    /** Get unified activity timeline */
    getActivity: (since?: number, until?: number): Promise<unknown[]> =>
      ipcRenderer.invoke('identity:getActivity', since, until),

    /** Get heartbeat run history */
    getHeartbeatHistory: (limit?: number): Promise<unknown[]> =>
      ipcRenderer.invoke('identity:getHeartbeatHistory', limit),

    /** Initialize identity files (create seeds if missing) */
    initialize: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('identity:initialize'),

    /** Heartbeat controls */
    heartbeat: {
      /** Get current heartbeat status */
      status: (): Promise<unknown> =>
        ipcRenderer.invoke('identity:heartbeat:status'),

      /** Update heartbeat configuration */
      configure: (config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> =>
        ipcRenderer.invoke('identity:heartbeat:configure', config),

      /** Get the rendered heartbeat prompt (for preview) */
      getPrompt: (): Promise<{ ok: boolean; prompt?: string; error?: string }> =>
        ipcRenderer.invoke('identity:heartbeat:getPrompt'),

      /** Trigger immediate heartbeat run */
      runNow: (): Promise<{ ok: boolean; error?: string }> =>
        ipcRenderer.invoke('identity:heartbeat:runNow'),

      /** Sync heartbeat job with scheduler */
      syncJob: (): Promise<{ ok: boolean; error?: string }> =>
        ipcRenderer.invoke('identity:heartbeat:syncJob'),
    },

    /** Subscribe to heartbeat completion events */
    onHeartbeatCompleted: (callback: (data: { actionsCount: number; status: string }) => void): (() => void) => {
      const handler = (_event: unknown, data: { actionsCount: number; status: string }) => callback(data);
      ipcRenderer.on('identity:heartbeat:completed', handler as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener('identity:heartbeat:completed', handler as (...args: unknown[]) => void);
    },

    /** Subscribe to heartbeat TTS events (fires when notificationMode='tts') */
    onHeartbeatTts: (callback: (text: string) => void): (() => void) => {
      const handler = (_event: unknown, text: string) => callback(text);
      ipcRenderer.on('identity:heartbeat:tts', handler as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener('identity:heartbeat:tts', handler as (...args: unknown[]) => void);
    },

    // Daily Memory
    /** Get daily memory content (today or specified date) */
    getDailyMemory: (date?: string): Promise<unknown> =>
      ipcRenderer.invoke('identity:getDailyMemory', date),

    /** Append entry to a section of today's daily memory */
    appendDailyMemory: (entry: string, section: string, date?: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('identity:appendDailyMemory', entry, section, date),

    /** List available daily memory dates */
    listDailyMemories: (limit?: number): Promise<string[]> =>
      ipcRenderer.invoke('identity:listDailyMemories', limit),

    /** Promote content from daily memory to durable memory.md */
    promoteToMemory: (content: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('identity:promoteToMemory', content),

    // Bootstrap
    /** Check if identity bootstrap has been completed */
    isBootstrapped: (): Promise<{ bootstrapped: boolean; skipped?: boolean; completedAt?: string }> =>
      ipcRenderer.invoke('identity:isBootstrapped'),

    /** Launch interactive terminal for First Book bootstrap conversation */
    runBootstrap: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('identity:runBootstrap'),

    /** Skip bootstrap and use seed content */
    skipBootstrap: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('identity:skipBootstrap'),

    /** Reset bootstrap — restore seed content and clear completion flag */
    resetBootstrap: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('identity:resetBootstrap'),

    /** Listen for bootstrap completion (file watcher detects .bootstrap_complete) */
    onBootstrapCompleted: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on('identity:bootstrap:completed', handler as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener('identity:bootstrap:completed', handler as (...args: unknown[]) => void);
    },

    /** Listen for identity file changes */
    onFilesChanged: (callback: (filename: string) => void): (() => void) => {
      const handler = (_event: unknown, filename: string) => callback(filename);
      ipcRenderer.on('identity:filesChanged', handler as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener('identity:filesChanged', handler as (...args: unknown[]) => void);
    },

    // Claude Memory Sync
    /** Trigger manual sync from Claude's MEMORY.md */
    syncClaudeMemory: (): Promise<{ ok: boolean; error?: string; sectionsImported?: number }> =>
      ipcRenderer.invoke('identity:syncClaudeMemory'),

    /** Get last sync status */
    getMemorySyncStatus: (): Promise<unknown> =>
      ipcRenderer.invoke('identity:getMemorySyncStatus'),
  },
};

export type ElectronAPI = typeof api;

contextBridge.exposeInMainWorld('electronAPI', api);
