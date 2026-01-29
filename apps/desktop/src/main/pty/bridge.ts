/**
 * PTY Bridge - HTTP server for MCP k_pty commands
 *
 * Allows MCP Server to interact with Desktop-spawned PTY sessions via HTTP.
 * Supports both embedded mode (ptyManager) and daemon mode (daemonClient).
 *
 * Endpoints:
 *   POST /pty/talk      - Execute command with sentinel (inter-agent communication)
 *   POST /pty/write     - Write raw data to PTY (no auto \r, for nudging)
 *   POST /pty/read      - Read from PTY buffer
 *   POST /pty/buffer    - Read xterm.js buffer (viewport-constrained text)
 *   GET  /pty/list      - List active sessions
 *   GET  /pty/is-leader - Check if session is the leader (for MCP Core k_pty access)
 *   GET  /health        - Health check
 *
 * Security Note: /pty/resize, /pty/kill removed for security hardening.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { ipcMain, BrowserWindow } from 'electron';
import type { PtyManager } from './manager';
import type { PtyDaemonClient } from './daemon-client';
import { runWithSentinel, type IPtyWithEvents } from './sentinel';
import type { IPty } from 'node-pty';

const PTY_BRIDGE_PORT = parseInt(process.env.KURORYUU_PTY_BRIDGE_PORT || '8201', 10);
const MCP_URL = process.env.KURORYUU_MCP_URL || 'http://127.0.0.1:8100';

interface JsonBody {
  session_id?: string;
  command?: string;
  sentinel?: string;
  timeout_ms?: number;
  data?: string;
  cols?: number;
  rows?: number;
  // Buffer reading options
  mode?: 'tail' | 'viewport' | 'delta';
  max_lines?: number;
  merge_wrapped?: boolean;
  marker_id?: number;
}

export class PtyBridge {
  private server: ReturnType<typeof createServer> | null = null;
  private ptyManager: PtyManager | null;
  private daemonClient: PtyDaemonClient | null;
  private mcpUrl: string;
  private port: number;

  // Map sessionId -> internal PTY id (since manager uses internal UUIDs)
  private sessionIdMap = new Map<string, string>();

  // Leader terminal tracking - set by main process when leader is assigned
  private leaderTerminalId: string | null = null;

  /**
   * Create a PTY Bridge
   * @param ptyManager - Embedded PTY manager (null if daemon mode)
   * @param daemonClient - Daemon client (null if embedded mode)
   * @param mcpUrl - MCP Core URL for registration
   * @param port - HTTP port to listen on
   */
  constructor(
    ptyManager: PtyManager | null,
    daemonClient: PtyDaemonClient | null = null,
    mcpUrl = MCP_URL,
    port = PTY_BRIDGE_PORT
  ) {
    this.ptyManager = ptyManager;
    this.daemonClient = daemonClient;
    this.mcpUrl = mcpUrl;
    this.port = port;
  }

  /**
   * Set the leader terminal ID (called from main when leader is assigned)
   * MCP Core queries this to verify leader status
   */
  setLeaderTerminalId(id: string | null): void {
    this.leaderTerminalId = id;
    console.log(`[PTY Bridge] Leader terminal set: ${id}`);
  }

  /**
   * Normalize session ID for comparison
   * Handles both short (9ccd99b1bdd8710e) and long (9ccd99b1-bdd8-710e-...) formats
   */
  private normalizeSessionId(sessionId: string): string {
    // Remove hyphens and take first 16 chars
    return sessionId.replace(/-/g, '').substring(0, 16);
  }

  /**
   * Check if running in daemon mode
   */
  private get isDaemonMode(): boolean {
    return this.daemonClient !== null && this.ptyManager === null;
  }

  /**
   * Parse JSON body from request
   */
  private parseBody(req: IncomingMessage): Promise<JsonBody> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  private sendJson(res: ServerResponse, status: number, data: object): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Get internal PTY ID from session ID
   * In daemon mode, sessionId IS the termId (no mapping needed)
   */
  private getInternalId(sessionId: string): string | undefined {
    if (this.isDaemonMode) {
      // In daemon mode, sessionId is the termId directly
      return this.sessionIdMap.get(sessionId) || sessionId;
    }
    return this.sessionIdMap.get(sessionId) || this.ptyManager?.getInternalId(sessionId);
  }

  /**
   * Get IPty instance by session ID (embedded mode only)
   * Returns undefined in daemon mode - use daemon client methods instead
   */
  private getPty(sessionId: string): IPty | undefined {
    if (this.isDaemonMode) {
      // Daemon mode doesn't expose IPty instances
      return undefined;
    }
    // Try bridge's session map first, then fall back to manager's
    const internalId = this.sessionIdMap.get(sessionId);
    if (internalId) {
      return (this.ptyManager as any)?.ptys?.get(internalId);
    }
    // Use manager's session lookup
    return this.ptyManager?.getBySessionId(sessionId);
  }

  /**
   * Check if a session exists (works in both modes)
   */
  private async sessionExists(sessionId: string): Promise<boolean> {
    if (this.isDaemonMode) {
      try {
        const { terminals } = await this.daemonClient!.list();
        return terminals.some(t => t.termId === sessionId);
      } catch {
        return false;
      }
    }
    return this.getPty(sessionId) !== undefined;
  }

  /**
   * Handle POST /pty/talk - Execute command with sentinel (inter-agent communication)
   * In daemon mode, uses write+delay+read pattern (no sentinel support)
   */
  private async handleTalk(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.parseBody(req);
      const { session_id, command, sentinel, timeout_ms = 30000 } = body;

      if (!session_id) {
        this.sendJson(res, 400, { ok: false, error: 'session_id is required' });
        return;
      }

      if (!command) {
        this.sendJson(res, 400, { ok: false, error: 'command is required' });
        return;
      }

      if (this.isDaemonMode) {
        // Daemon mode: write command, wait, read output
        const exists = await this.sessionExists(session_id);
        if (!exists) {
          this.sendJson(res, 404, { ok: false, error: `Session not found: ${session_id}` });
          return;
        }

        try {
          // Write command + Enter
          await this.daemonClient!.write(session_id, command + '\r');

          // Wait for output
          await new Promise(resolve => setTimeout(resolve, Math.min(timeout_ms, 5000)));

          // Read buffered output
          const output = await this.daemonClient!.getBufferedData(session_id);

          this.sendJson(res, 200, {
            ok: true,
            output: output || '',
            sentinel_found: false, // Daemon mode doesn't support sentinel
            mode: 'daemon'
          });
        } catch (err) {
          this.sendJson(res, 500, { ok: false, error: String(err) });
        }
        return;
      }

      // Embedded mode: use proper sentinel-based execution
      const pty = this.getPty(session_id);
      if (!pty) {
        this.sendJson(res, 404, { ok: false, error: `Session not found: ${session_id}` });
        return;
      }

      const result = await runWithSentinel(pty as IPtyWithEvents, command, sentinel || '', timeout_ms);
      this.sendJson(res, 200, result);
    } catch (error) {
      this.sendJson(res, 500, { ok: false, error: String(error) });
    }
  }

  /**
   * Handle POST /pty/write - Write raw data to PTY
   * Unlike /pty/talk, this does NOT add \r automatically - caller controls exact bytes sent.
   * Use this for nudging agents (sending text without execution) or precise control.
   */
  private async handleWrite(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.parseBody(req);
      const { session_id, data } = body;

      if (!session_id) {
        this.sendJson(res, 400, { ok: false, error: 'session_id is required' });
        return;
      }

      if (!data) {
        this.sendJson(res, 400, { ok: false, error: 'data is required' });
        return;
      }

      if (this.isDaemonMode) {
        // Daemon mode: use daemon client directly
        try {
          await this.daemonClient!.write(session_id, data);
          this.sendJson(res, 200, { ok: true, bytes_written: data.length, mode: 'daemon' });
        } catch (err) {
          this.sendJson(res, 500, { ok: false, error: String(err) });
        }
        return;
      }

      // Embedded mode
      const internalId = this.getInternalId(session_id);
      if (!internalId) {
        this.sendJson(res, 404, { ok: false, error: `Session not found: ${session_id}` });
        return;
      }

      const success = this.ptyManager?.write(internalId, data);
      if (success) {
        this.sendJson(res, 200, { ok: true, bytes_written: data.length });
      } else {
        this.sendJson(res, 500, { ok: false, error: 'Write failed' });
      }
    } catch (error) {
      this.sendJson(res, 500, { ok: false, error: String(error) });
    }
  }

  /**
   * Handle POST /pty/read - Read from PTY (accumulate recent data)
   */
  private async handleRead(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.parseBody(req);
      const { session_id, timeout_ms = 5000 } = body;

      if (!session_id) {
        this.sendJson(res, 400, { ok: false, error: 'session_id is required' });
        return;
      }

      if (this.isDaemonMode) {
        // Daemon mode: get buffered data from daemon
        try {
          const output = await this.daemonClient!.getBufferedData(session_id);
          this.sendJson(res, 200, {
            ok: true,
            output: output || '',
            bytes_read: (output || '').length,
            mode: 'daemon'
          });
        } catch (err) {
          this.sendJson(res, 500, { ok: false, error: String(err) });
        }
        return;
      }

      // Embedded mode: collect live data
      const pty = this.getPty(session_id);
      if (!pty) {
        this.sendJson(res, 404, { ok: false, error: `Session not found: ${session_id}` });
        return;
      }

      // Collect data for a short period
      let buffer = '';
      const dataHandler = (data: string) => {
        buffer += data;
      };

      (pty as IPtyWithEvents).on('data', dataHandler);

      // Wait for timeout or data
      await new Promise(resolve => setTimeout(resolve, Math.min(timeout_ms, 5000)));

      (pty as IPtyWithEvents).off('data', dataHandler);

      this.sendJson(res, 200, {
        ok: true,
        output: buffer,
        bytes_read: buffer.length
      });
    } catch (error) {
      this.sendJson(res, 500, { ok: false, error: String(error) });
    }
  }

  /**
   * Handle GET /pty/list - List active sessions
   */
  private async handleList(res: ServerResponse): Promise<void> {
    if (this.isDaemonMode) {
      // Daemon mode: get list from daemon
      try {
        const { terminals } = await this.daemonClient!.list();
        const sessions = terminals.map(t => ({
          session_id: t.termId,
          internal_id: t.termId,
          pid: t.pid,
          cols: t.cols,
          rows: t.rows,
          cwd: t.cwd,
          alive: t.alive
        }));
        this.sendJson(res, 200, {
          ok: true,
          sessions,
          count: sessions.length,
          mode: 'daemon'
        });
      } catch (err) {
        this.sendJson(res, 500, { ok: false, error: String(err) });
      }
      return;
    }

    // Embedded mode
    const sessions = this.ptyManager?.list().map(pty => ({
      session_id: [...this.sessionIdMap.entries()].find(([, id]) => id === pty.id)?.[0] || pty.sessionId,
      internal_id: pty.id,
      pid: pty.pid,
      cols: pty.cols,
      rows: pty.rows,
      cwd: pty.cwd
    })) || [];

    this.sendJson(res, 200, {
      ok: true,
      sessions,
      count: sessions.length
    });
  }

  /**
   * Request terminal buffer from renderer via IPC
   * This is the internal helper for handleBuffer
   */
  private async requestTerminalBuffer(
    termId: string,
    mode: 'tail' | 'viewport' | 'delta',
    options: { maxLines?: number; mergeWrapped?: boolean; markerId?: number }
  ): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ ok: false, error: 'Buffer read timeout (5s)' });
      }, 5000);

      // Listen for response from renderer
      const responseHandler = (_event: unknown, responseTermId: string, snapshot: unknown) => {
        if (responseTermId === termId) {
          clearTimeout(timeout);
          ipcMain.removeListener('pty:bufferResponse', responseHandler);
          const snap = snapshot as { error?: string; [key: string]: unknown };
          if (snap?.error) {
            resolve({ ok: false, error: snap.error });
          } else {
            resolve({ ok: true, ...snap });
          }
        }
      };

      ipcMain.on('pty:bufferResponse', responseHandler);

      // Request buffer from renderer
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0]?.webContents.send('pty:requestBuffer', {
          termId,
          mode,
          options,
        });
      } else {
        clearTimeout(timeout);
        ipcMain.removeListener('pty:bufferResponse', responseHandler);
        resolve({ ok: false, error: 'No browser window available' });
      }
    });
  }

  /**
   * Handle POST /pty/buffer - Read terminal buffer (xterm.js)
   * This endpoint reads from the renderer's xterm.js buffer, not the PTY output buffer.
   * Only works for desktop sessions with xterm.js frontend.
   */
  private async handleBuffer(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Check buffer access mode (set via Desktop UI dropdown)
      // Two modes: 'off' (disabled) or 'on' (enabled for all agents, default)
      const accessMode = process.env.KURORYUU_TERM_BUFFER_ACCESS || 'on';
      if (accessMode === 'off') {
        this.sendJson(res, 403, {
          ok: false,
          error: 'Terminal buffer access is disabled. Enable via Desktop UI (shield icon).',
          error_code: 'TERM_READ_DISABLED',
          access_mode: accessMode
        });
        return;
      }

      const body = await this.parseBody(req);
      const {
        session_id,
        mode = 'tail',
        max_lines = 40,
        merge_wrapped = true,
        marker_id
      } = body;

      if (!session_id) {
        this.sendJson(res, 400, { ok: false, error: 'session_id is required' });
        return;
      }

      // Validate mode
      if (!['tail', 'viewport', 'delta'].includes(mode)) {
        this.sendJson(res, 400, { ok: false, error: `Invalid mode: ${mode}. Must be tail, viewport, or delta` });
        return;
      }

      // Get internal termId from sessionId
      const termId = this.getInternalId(session_id);
      if (!termId) {
        this.sendJson(res, 404, { ok: false, error: `Session not found: ${session_id}` });
        return;
      }

      // Request buffer from renderer
      const result = await this.requestTerminalBuffer(termId, mode, {
        maxLines: max_lines,
        mergeWrapped: merge_wrapped,
        markerId: marker_id,
      });

      if (result.ok) {
        this.sendJson(res, 200, { ...result, access_mode: accessMode });
      } else {
        this.sendJson(res, 500, result);
      }
    } catch (error) {
      this.sendJson(res, 500, { ok: false, error: String(error) });
    }
  }

  /**
   * Handle GET /health - Health check
   */
  private handleHealth(res: ServerResponse): void {
    this.sendJson(res, 200, {
      ok: true,
      service: 'pty-bridge',
      port: this.port,
      sessions: this.sessionIdMap.size,
      mode: this.isDaemonMode ? 'daemon' : 'embedded',
      daemonConnected: this.daemonClient?.isConnected ?? false
    });
  }

  /**
   * Handle GET /pty/is-leader?session_id=xxx - Check if session is leader
   * MCP Core queries this endpoint to verify leader status before granting k_pty access
   */
  private handleIsLeader(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) {
      this.sendJson(res, 400, { ok: false, error: 'session_id query param required' });
      return;
    }

    // Normalize both session IDs for comparison (handles format variations)
    const normalizedSessionId = this.normalizeSessionId(sessionId);
    const normalizedLeaderId = this.leaderTerminalId
      ? this.normalizeSessionId(this.leaderTerminalId)
      : null;
    const isLeader = normalizedLeaderId && normalizedSessionId === normalizedLeaderId;

    console.log(`[PTY Bridge] Leader check: session=${sessionId}, normalized=${normalizedSessionId}, leader=${this.leaderTerminalId}, normalized_leader=${normalizedLeaderId}, result=${isLeader}`);

    this.sendJson(res, 200, {
      ok: true,
      session_id: sessionId,
      is_leader: isLeader,
      leader_terminal_id: this.leaderTerminalId || null
    });
  }

  /**
   * Route incoming requests
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || '/';
    const method = req.method || 'GET';

    console.log(`[PTY Bridge] ${method} ${url} (mode: ${this.isDaemonMode ? 'daemon' : 'embedded'})`);

    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route requests (all handlers are async-safe)
    // NOTE: /pty/resize, /pty/kill removed for security hardening
    // /pty/write restored for PTY nudging (raw writes without auto \r)
    if (method === 'POST' && url === '/pty/talk') {
      this.handleTalk(req, res);
    } else if (method === 'POST' && url === '/pty/write') {
      this.handleWrite(req, res);
    } else if (method === 'POST' && url === '/pty/read') {
      this.handleRead(req, res);
    } else if (method === 'POST' && url === '/pty/buffer') {
      this.handleBuffer(req, res);
    } else if (method === 'GET' && url === '/pty/list') {
      this.handleList(res);
    } else if (method === 'GET' && url.startsWith('/pty/is-leader')) {
      this.handleIsLeader(req, res);
    } else if (method === 'GET' && (url === '/health' || url === '/')) {
      this.handleHealth(res);
    } else {
      this.sendJson(res, 404, { ok: false, error: 'Not found' });
    }
  }

  /**
   * Register a session ID mapping (called by PtyManager)
   */
  registerSession(sessionId: string, internalId: string): void {
    this.sessionIdMap.set(sessionId, internalId);
    console.log(`[PTY Bridge] Registered session: ${sessionId} -> ${internalId}`);
  }

  /**
   * Unregister a session ID mapping (called on PTY exit)
   */
  unregisterSession(sessionId: string): void {
    this.sessionIdMap.delete(sessionId);
    console.log(`[PTY Bridge] Unregistered session: ${sessionId}`);
  }

  /**
   * Get the bridge URL for MCP registration
   */
  getBridgeUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /**
   * Start the HTTP server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[PTY Bridge] Port ${this.port} in use, trying ${this.port + 1}`);
          this.port++;
          this.server?.close();
          this.start().then(resolve).catch(reject);
        } else {
          console.error('[PTY Bridge] Server error:', err);
          reject(err);
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`[PTY Bridge] Server started on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('[PTY Bridge] Server stopped');
    }
  }
}
