/**
 * CLI Execution Service
 *
 * Manages Claude CLI process spawning with --output-format stream-json,
 * JSONL parsing, and session lifecycle. Emits on the same IPC channels
 * as ClaudeSDKService so the renderer is backend-agnostic.
 *
 * Runs in the Electron MAIN PROCESS only.
 */

import { BrowserWindow, app } from 'electron';
import { spawn, exec, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import type {
  SDKAgentSession,
  SDKAgentSessionSummary,
  SerializedSDKMessage,
  SDKSessionStatus,
} from '../../renderer/types/sdk-agent';
import type { PtyManager } from '../pty/manager';
import type { PtyProcess } from '../pty/types';

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const MAX_MESSAGES_IN_MEMORY = 5000;
const CLI_SESSION_PREFIX = 'cli-';

// -------------------------------------------------------------------
// Claude CLI resolution (PTY mode needs full path on Windows)
// -------------------------------------------------------------------

function resolveClaudePath(): string {
  if (process.platform !== 'win32') return 'claude';

  // Try `where` first (uses the actual process PATH)
  try {
    const result = execSync('where claude', { windowsHide: true, encoding: 'utf-8' }).trim();
    const firstLine = result.split(/\r?\n/)[0].trim();
    if (firstLine && existsSync(firstLine)) {
      console.log(`[CliExec] resolveClaudePath: found via 'where': ${firstLine}`);
      return firstLine;
    }
  } catch { /* not in PATH */ }

  // Known installation paths
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const knownPaths = [
    join(homeDir, '.claude', 'node_modules', '.bin', 'claude.cmd'),
    join(process.env.APPDATA || '', 'npm', 'claude.cmd'),
    join(homeDir, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
  ];
  for (const p of knownPaths) {
    if (existsSync(p)) {
      console.log(`[CliExec] resolveClaudePath: found at known path: ${p}`);
      return p;
    }
  }

  console.warn(`[CliExec] resolveClaudePath: claude not found! Tried: ${knownPaths.join(', ')}`);
  return 'claude';
}

// -------------------------------------------------------------------
// Internal session state
// -------------------------------------------------------------------

interface CliInternalSession {
  session: SDKAgentSession;
  process: ChildProcess | null;
  messages: SerializedSDKMessage[];
  timeoutTimer: NodeJS.Timeout | null;
  stderr: string;
  /** PTY ID when running in terminal mode */
  ptyId?: string;
  /** Temp file path for long prompts (cleaned up on exit) */
  _promptTmpFile?: string;
}

// -------------------------------------------------------------------
// Config for starting an agent via CLI
// -------------------------------------------------------------------

export interface CliAgentConfig {
  prompt: string;
  model?: string;
  cwd?: string;
  maxTurns?: number;
  timeoutMinutes?: number;
  dangerouslySkipPermissions?: boolean;
  permissionMode?: string;
}

// -------------------------------------------------------------------
// Service
// -------------------------------------------------------------------

let instance: CliExecutionService | null = null;

export function getCliExecutionService(): CliExecutionService {
  if (!instance) {
    instance = new CliExecutionService();
  }
  return instance;
}

export class CliExecutionService {
  private sessions = new Map<string, CliInternalSession>();
  private mainWindow: BrowserWindow | null = null;
  private maxConcurrent = 1;
  private ptyManager: PtyManager | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  setMaxConcurrent(n: number): void {
    this.maxConcurrent = Math.max(1, n);
  }

  setPtyManager(manager: PtyManager): void {
    this.ptyManager = manager;
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  async startAgent(config: CliAgentConfig): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
    // Check concurrent limit
    const activeSessions = this.getActiveSessions();
    if (activeSessions.length >= this.maxConcurrent) {
      return {
        ok: false,
        error: `CLI concurrent limit reached (${this.maxConcurrent}). Stop an existing CLI session first.`,
      };
    }

    const sessionId = CLI_SESSION_PREFIX + randomUUID().slice(0, 12);
    const cwd = config.cwd || process.cwd();
    const now = Date.now();

    // Build session object
    const session: SDKAgentSession = {
      id: sessionId,
      backend: 'cli',
      status: 'starting',
      prompt: config.prompt,
      model: config.model || 'claude-sonnet-4-5-20250929',
      cwd,
      startedAt: now,
      totalCostUsd: 0,
      numTurns: 0,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      toolCalls: [],
      subagentCount: 0,
    };

    const internal: CliInternalSession = {
      session,
      process: null,
      messages: [],
      timeoutTimer: null,
      stderr: '',
    };

    this.sessions.set(sessionId, internal);
    this.emitStatusChange(sessionId, 'starting');

    // For long prompts, pipe via stdin to avoid Windows command line length limit.
    // `-p` without an argument reads from stdin.
    const useStdin = config.prompt.length > 2000;

    // Build CLI args (--verbose required for stream-json with -p)
    const args: string[] = useStdin
      ? ['-p', '--output-format', 'stream-json', '--verbose']
      : ['-p', config.prompt, '--output-format', 'stream-json', '--verbose'];

    if (config.model) {
      args.push('--model', config.model);
    }
    if (config.maxTurns && config.maxTurns > 0) {
      args.push('--max-turns', String(config.maxTurns));
    }

    // Permission handling
    const skipPerms = config.dangerouslySkipPermissions !== false; // default true
    if (skipPerms) {
      args.push('--dangerously-skip-permissions');
    }

    // Spawn process
    const isWindows = process.platform === 'win32';
    try {
      const child = spawn('claude', args, {
        shell: isWindows,
        windowsHide: true,
        stdio: [useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        cwd,
      });

      internal.process = child;

      // Pipe prompt via stdin for long prompts
      if (useStdin && child.stdin) {
        child.stdin.write(config.prompt);
        child.stdin.end();
      }

      // Start consuming stdout (JSONL stream)
      this.consumeStdout(sessionId, child);

      // Capture stderr
      child.stderr?.on('data', (chunk: Buffer) => {
        internal.stderr += chunk.toString();
      });

      // Process lifecycle
      child.on('error', (err) => {
        console.error(`[CliExec] Process error for ${sessionId}:`, err);
        this.markSessionDone(sessionId, 'error', String(err));
      });

      child.on('close', (code) => {
        console.log(`[CliExec] Process closed for ${sessionId}, code=${code}`);
        const sess = this.sessions.get(sessionId);
        if (sess && (sess.session.status === 'starting' || sess.session.status === 'running')) {
          if (code === 0) {
            this.markSessionDone(sessionId, 'completed');
          } else {
            const errMsg = sess.stderr.slice(0, 500) || `CLI exited with code ${code}`;
            this.markSessionDone(sessionId, 'error', errMsg);
          }
        }
      });

      // Set timeout
      const timeoutMinutes = config.timeoutMinutes ?? 60;
      if (timeoutMinutes > 0) {
        internal.timeoutTimer = setTimeout(() => {
          console.log(`[CliExec] Session ${sessionId} timed out after ${timeoutMinutes}m`);
          this.killProcess(sessionId);
          this.markSessionDone(sessionId, 'error', `CLI agent timed out after ${timeoutMinutes} minute(s)`);
        }, timeoutMinutes * 60 * 1000);
      }

      // Mark running
      internal.session.status = 'running';
      this.emitStatusChange(sessionId, 'running');

      console.log(`[CliExec] Started CLI session ${sessionId}: claude ${args.join(' ')}`);
      return { ok: true, sessionId };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[CliExec] Failed to spawn CLI for ${sessionId}:`, errMsg);
      this.markSessionDone(sessionId, 'error', errMsg);
      return { ok: false, error: errMsg };
    }
  }

  // ---------------------------------------------------------------------------
  // Start (PTY terminal mode)
  // ---------------------------------------------------------------------------

  async startAgentPty(config: CliAgentConfig): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
    if (!this.ptyManager) {
      return { ok: false, error: 'PTY manager not available' };
    }

    // Check concurrent limit
    const activeSessions = this.getActiveSessions();
    if (activeSessions.length >= this.maxConcurrent) {
      return {
        ok: false,
        error: `CLI concurrent limit reached (${this.maxConcurrent}). Stop an existing CLI session first.`,
      };
    }

    const sessionId = CLI_SESSION_PREFIX + randomUUID().slice(0, 12);
    const cwd = config.cwd || process.cwd();
    const now = Date.now();

    // Build session object
    const session: SDKAgentSession = {
      id: sessionId,
      backend: 'cli',
      status: 'starting',
      prompt: config.prompt,
      model: config.model || 'claude-sonnet-4-5-20250929',
      cwd,
      startedAt: now,
      totalCostUsd: 0,
      numTurns: 0,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      toolCalls: [],
      subagentCount: 0,
    };

    const internal: CliInternalSession = {
      session,
      process: null,
      messages: [],
      timeoutTimer: null,
      stderr: '',
    };

    this.sessions.set(sessionId, internal);
    this.emitStatusChange(sessionId, 'starting');

    // Build claude args (NO --output-format, NO --verbose — real terminal output)
    const claudeArgs: string[] = [];

    // Handle long prompts via temp file (@file syntax)
    if (config.prompt.length > 2000) {
      const promptDir = join(app.getPath('temp'), 'kuroryuu-cli-prompts');
      mkdirSync(promptDir, { recursive: true });
      const tmpFile = join(promptDir, `${sessionId}.md`);
      writeFileSync(tmpFile, config.prompt, 'utf-8');
      claudeArgs.push(`@${tmpFile}`);
      internal._promptTmpFile = tmpFile;
    } else {
      claudeArgs.push('-p', config.prompt);
    }

    if (config.model) {
      claudeArgs.push('--model', config.model);
    }
    if (config.maxTurns && config.maxTurns > 0) {
      claudeArgs.push('--max-turns', String(config.maxTurns));
    }

    // Permission handling
    const skipPerms = config.dangerouslySkipPermissions !== false;
    if (skipPerms) {
      claudeArgs.push('--dangerously-skip-permissions');
    }

    // Resolve claude to full path (node-pty can't use shell:true like child_process)
    const claudeCmd = resolveClaudePath();
    console.log(`[CliExec] Resolved claude path for PTY: ${claudeCmd}`);

    // On Windows, bypass PtyManager's cmd wrapper — construct the final command ourselves.
    // PtyManager wraps npmGlobalCommands in `cmd /c`, but that can fail when claude isn't
    // in the embedded PTY's PATH. By passing `cmd.exe` directly (not in npmGlobalCommands),
    // PtyManager spawns it without re-wrapping.
    const isWindows = process.platform === 'win32';
    let ptyCmd: string;
    let ptyArgs: string[];

    if (isWindows) {
      const quotedClaudeArgs = claudeArgs.map(arg => {
        if (arg.includes('@') || arg.includes(' ') || arg.includes('"')) {
          return `"${arg.replace(/"/g, '""')}"`;
        }
        return arg;
      });
      // Pass cmd.exe directly — PtyManager won't try to re-wrap it
      ptyCmd = 'cmd.exe';
      ptyArgs = ['/c', claudeCmd, ...quotedClaudeArgs];
      console.log(`[CliExec] PTY spawn: cmd.exe /c ${claudeCmd} ${quotedClaudeArgs.join(' ')}`);
    } else {
      ptyCmd = claudeCmd;
      ptyArgs = claudeArgs;
    }

    try {
      const ptyProcess: PtyProcess = this.ptyManager.create({
        cmd: ptyCmd,
        args: ptyArgs,
        cwd,
        env: {
          KURORYUU_AGENT_ID: sessionId,
          KURORYUU_AGENT_SESSION: sessionId,
        },
        ownerSessionId: sessionId,
        label: `Agent: ${config.prompt.slice(0, 40)}`,
      });

      internal.ptyId = ptyProcess.id;
      session.ptyId = ptyProcess.id;

      // Listen for PTY exit to detect completion
      const exitHandler = ({ id, exitCode }: { id: string; exitCode: number }) => {
        if (id !== ptyProcess.id) return;
        // Remove listener after this PTY exits
        this.ptyManager?.removeListener('exit', exitHandler);

        const sess = this.sessions.get(sessionId);
        if (sess && (sess.session.status === 'starting' || sess.session.status === 'running')) {
          if (exitCode === 0) {
            this.markSessionDone(sessionId, 'completed');
          } else {
            this.markSessionDone(sessionId, 'error', `PTY exited with code ${exitCode}`);
          }
        }

        // Clean up temp prompt file
        if (internal._promptTmpFile) {
          try { unlinkSync(internal._promptTmpFile); } catch { /* ignore */ }
          internal._promptTmpFile = undefined;
        }
      };
      this.ptyManager.on('exit', exitHandler);

      // Set timeout
      const timeoutMinutes = config.timeoutMinutes ?? 60;
      if (timeoutMinutes > 0) {
        internal.timeoutTimer = setTimeout(() => {
          console.log(`[CliExec] PTY session ${sessionId} timed out after ${timeoutMinutes}m`);
          this.killProcess(sessionId);
          this.markSessionDone(sessionId, 'error', `PTY agent timed out after ${timeoutMinutes} minute(s)`);
        }, timeoutMinutes * 60 * 1000);
      }

      // Mark running
      internal.session.status = 'running';
      this.emitStatusChange(sessionId, 'running');

      console.log(`[CliExec] Started PTY session ${sessionId}: ${ptyCmd} ${ptyArgs.join(' ')}`);
      return { ok: true, sessionId };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[CliExec] Failed to spawn PTY for ${sessionId}:`, errMsg, { ptyCmd, ptyArgs, cwd });
      this.markSessionDone(sessionId, 'error', errMsg);
      return { ok: false, error: errMsg };
    }
  }

  // ---------------------------------------------------------------------------
  // JSONL stdout parser
  // ---------------------------------------------------------------------------

  private consumeStdout(sessionId: string, child: ChildProcess): void {
    let buffer = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop()!; // keep incomplete last line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          this.handleCliEvent(sessionId, event);
        } catch {
          // Skip malformed JSON lines
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // CLI JSONL → SerializedSDKMessage mapping
  // ---------------------------------------------------------------------------

  private handleCliEvent(sessionId: string, event: Record<string, unknown>): void {
    const internal = this.sessions.get(sessionId);
    if (!internal) return;

    const type = event.type as string;

    switch (type) {
      case 'system': {
        // Init event
        const msg = this.createMessage(sessionId, 'system', 'init');
        msg.init = {
          tools: (event.tools as string[]) || [],
          model: (event.model as string) || internal.session.model,
          mcpServers: (event.mcp_servers as { name: string; status: string }[]) || [],
          permissionMode: 'bypassPermissions',
          claudeCodeVersion: (event.claude_code_version as string) || '',
        };
        if (event.session_id) {
          internal.session.sdkSessionId = event.session_id as string;
        }
        if (msg.init.tools) {
          internal.session.tools = msg.init.tools;
        }
        this.storeAndEmit(sessionId, msg);
        break;
      }

      case 'assistant': {
        // Assistant message with content blocks
        const content = (event.message as Record<string, unknown>)?.content || event.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              const msg = this.createMessage(sessionId, 'assistant');
              msg.text = block.text as string;
              this.storeAndEmit(sessionId, msg);
            } else if (block.type === 'tool_use') {
              const msg = this.createMessage(sessionId, 'assistant');
              msg.toolUse = {
                id: block.id as string,
                name: block.name as string,
                input: block.input,
              };
              internal.session.currentTool = block.name as string;
              internal.session.toolCalls.push({
                toolName: block.name as string,
                toolUseId: block.id as string,
                input: block.input,
                timestamp: Date.now(),
                parentToolUseId: null,
              });
              this.storeAndEmit(sessionId, msg);
            }
          }
        }
        internal.session.numTurns++;
        break;
      }

      case 'user': {
        // Tool result
        const content = (event.message as Record<string, unknown>)?.content || event.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result') {
              const msg = this.createMessage(sessionId, 'user');
              msg.toolResult = {
                toolUseId: block.tool_use_id as string,
                output: block.content,
                isError: block.is_error as boolean | undefined,
              };
              internal.session.currentTool = undefined;
              this.storeAndEmit(sessionId, msg);
            }
          }
        }
        break;
      }

      case 'content_block_delta': {
        // Streaming text delta
        const delta = event.delta;
        if (delta && (delta as Record<string, unknown>).type === 'text_delta') {
          const msg = this.createMessage(sessionId, 'stream_event');
          msg.textDelta = (delta as Record<string, unknown>).text as string;
          this.storeAndEmit(sessionId, msg);
        }
        break;
      }

      case 'result': {
        // Final result
        const msg = this.createMessage(sessionId, 'result');
        msg.result = {
          subtype: ((event.subtype as string) || 'success') as import('../../renderer/types/sdk-agent').SDKResultSubtype,
          isError: event.is_error as boolean || false,
          result: event.result as string | undefined,
          errors: event.errors as string[] | undefined,
          totalCostUsd: (event.total_cost_usd as number) || (event.cost_usd as number) || 0,
          numTurns: (event.num_turns as number) || internal.session.numTurns,
          durationMs: (event.duration_ms as number) || 0,
          durationApiMs: (event.duration_api_ms as number) || 0,
          stopReason: (event.stop_reason as string) || null,
          usage: {
            inputTokens: (event.usage as Record<string, number>)?.input_tokens || 0,
            outputTokens: (event.usage as Record<string, number>)?.output_tokens || 0,
            cacheReadInputTokens: (event.usage as Record<string, number>)?.cache_read_input_tokens || 0,
            cacheCreationInputTokens: (event.usage as Record<string, number>)?.cache_creation_input_tokens || 0,
          },
        };

        // Update session from result
        if (msg.result) {
          internal.session.totalCostUsd = msg.result.totalCostUsd;
          internal.session.numTurns = msg.result.numTurns;
          internal.session.usage = msg.result.usage;
          internal.session.result = msg.result.result;
          if (msg.result.errors?.length) {
            internal.session.errors = msg.result.errors;
          }
          internal.session.stopReason = msg.result.stopReason;
        }

        this.storeAndEmit(sessionId, msg);
        break;
      }

      default:
        // Unknown event type — skip silently
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private createMessage(sessionId: string, type: string, subtype?: string): SerializedSDKMessage {
    return {
      type: type as SerializedSDKMessage['type'],
      subtype,
      uuid: randomUUID(),
      sessionId,
      timestamp: Date.now(),
      parentToolUseId: null,
    };
  }

  private storeAndEmit(sessionId: string, msg: SerializedSDKMessage): void {
    const internal = this.sessions.get(sessionId);
    if (!internal) return;

    internal.messages.push(msg);

    // Cap messages
    if (internal.messages.length > MAX_MESSAGES_IN_MEMORY) {
      internal.messages = internal.messages.slice(-MAX_MESSAGES_IN_MEMORY);
    }

    // Emit to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('sdk-agent:message', sessionId, msg);
    }
  }

  private emitStatusChange(sessionId: string, status: SDKSessionStatus): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('sdk-agent:status-change', sessionId, status);
    }
  }

  private markSessionDone(sessionId: string, status: 'completed' | 'error' | 'cancelled', error?: string): void {
    const internal = this.sessions.get(sessionId);
    if (!internal) return;

    internal.session.status = status;
    internal.session.completedAt = Date.now();
    internal.session.currentTool = undefined;

    if (error) {
      internal.session.errors = [error];
    }

    // Clear timeout
    if (internal.timeoutTimer) {
      clearTimeout(internal.timeoutTimer);
      internal.timeoutTimer = null;
    }

    this.emitStatusChange(sessionId, status);

    // Emit completion
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('sdk-agent:completed', sessionId, {
        status,
        error,
        totalCostUsd: internal.session.totalCostUsd,
        numTurns: internal.session.numTurns,
      });
    }
  }

  private killProcess(sessionId: string): void {
    const internal = this.sessions.get(sessionId);
    if (!internal) return;

    // PTY mode: kill via PtyManager
    if (internal.ptyId && this.ptyManager) {
      this.ptyManager.kill(internal.ptyId);
      internal.ptyId = undefined;
      return;
    }

    // JSONL mode: kill child process
    if (!internal.process) return;

    const child = internal.process;
    internal.process = null;

    if (process.platform === 'win32') {
      // Windows: tree kill the process
      try {
        exec(`taskkill /pid ${child.pid} /T /F`, (err) => {
          if (err) console.warn(`[CliExec] taskkill failed for ${sessionId}:`, err.message);
        });
      } catch {
        child.kill();
      }
    } else {
      child.kill('SIGTERM');
    }
  }

  // ---------------------------------------------------------------------------
  // Stop
  // ---------------------------------------------------------------------------

  async stopAgent(sessionId: string): Promise<{ ok: boolean; error?: string }> {
    const internal = this.sessions.get(sessionId);
    if (!internal) {
      return { ok: false, error: 'Session not found' };
    }

    this.killProcess(sessionId);
    this.markSessionDone(sessionId, 'cancelled', 'Stopped by user');
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Query methods (match SDK service interface)
  // ---------------------------------------------------------------------------

  listSessions(): SDKAgentSessionSummary[] {
    const summaries: SDKAgentSessionSummary[] = [];
    for (const [, internal] of this.sessions) {
      const s = internal.session;
      const lastMsg = internal.messages.length > 0
        ? internal.messages[internal.messages.length - 1]
        : undefined;

      summaries.push({
        id: s.id,
        sdkSessionId: s.sdkSessionId,
        role: s.role,
        backend: 'cli',
        status: s.status,
        prompt: s.prompt,
        model: s.model,
        cwd: s.cwd,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        totalCostUsd: s.totalCostUsd,
        numTurns: s.numTurns,
        currentTool: s.currentTool,
        subagentCount: s.subagentCount,
        toolCallCount: s.toolCalls.length,
        lastMessage: lastMsg?.text || lastMsg?.toolUse?.name,
        ptyId: internal.ptyId,
      });
    }
    return summaries;
  }

  getSession(sessionId: string): SDKAgentSession | null {
    return this.sessions.get(sessionId)?.session ?? null;
  }

  getMessages(sessionId: string, offset = 0, limit = 100): SerializedSDKMessage[] {
    const internal = this.sessions.get(sessionId);
    if (!internal) return [];
    return internal.messages.slice(offset, offset + limit);
  }

  getMessageCount(sessionId: string): number {
    return this.sessions.get(sessionId)?.messages.length ?? 0;
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  hasActiveSessions(): boolean {
    return this.getActiveSessions().length > 0;
  }

  getActiveSessions(): CliInternalSession[] {
    const active: CliInternalSession[] = [];
    for (const [, internal] of this.sessions) {
      if (internal.session.status === 'starting' || internal.session.status === 'running') {
        active.push(internal);
      }
    }
    return active;
  }

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    for (const [sessionId] of this.sessions) {
      this.killProcess(sessionId);
    }
    // Clear all timers
    for (const [, internal] of this.sessions) {
      if (internal.timeoutTimer) {
        clearTimeout(internal.timeoutTimer);
        internal.timeoutTimer = null;
      }
    }
    this.sessions.clear();
    console.log('[CliExec] Shutdown complete');
  }
}
