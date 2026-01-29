/**
 * PTY Client - Connects to PTY Daemon for real shell access
 * 
 * Used by the Desktop app to communicate with the PTY daemon.
 */

import * as net from 'net';
import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface PTYClientOptions {
  host?: string;
  port?: number;
  reconnect?: boolean;
  reconnectInterval?: number;
}

export interface CreateTerminalOptions {
  cmd?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  name?: string;
}

export interface TerminalInfo {
  termId: string;
  pid: number;
  name: string;
  cmd: string;
  cwd: string;
  cols: number;
  rows: number;
  alive: boolean;
  createdAt: string;
}

// ============================================================================
// PTY Client
// ============================================================================

export class PTYClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = '';
  private requestId = 0;
  private pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();
  private connected = false;
  private reconnecting = false;

  private host: string;
  private port: number;
  private reconnect: boolean;
  private reconnectInterval: number;

  constructor(options: PTYClientOptions = {}) {
    super();
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 7072;
    this.reconnect = options.reconnect ?? true;
    this.reconnectInterval = options.reconnectInterval || 3000;
  }

  /**
   * Connect to the PTY daemon
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }

      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        this.connected = true;
        this.reconnecting = false;
        this.emit('connected');
        resolve();
      });

      this.socket.on('data', (chunk) => {
        this.handleData(chunk.toString());
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.emit('disconnected');

        // Reject all pending requests
        for (const [id, { reject }] of this.pending) {
          reject(new Error('Connection closed'));
        }
        this.pending.clear();

        // Attempt reconnection
        if (this.reconnect && !this.reconnecting) {
          this.reconnecting = true;
          setTimeout(() => this.attemptReconnect(), this.reconnectInterval);
        }
      });

      this.socket.on('error', (err) => {
        if (!this.connected) {
          reject(err);
        }
        this.emit('error', err);
      });

      this.socket.connect(this.port, this.host);
    });
  }

  private attemptReconnect(): void {
    if (!this.reconnect || this.connected) return;

    this.connect().catch(() => {
      // Retry on failure
      if (this.reconnect) {
        setTimeout(() => this.attemptReconnect(), this.reconnectInterval);
      }
    });
  }

  /**
   * Disconnect from the PTY daemon
   */
  disconnect(): void {
    this.reconnect = false;
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
  }

  /**
   * Handle incoming data (line-delimited JSON)
   */
  private handleData(data: string): void {
    this.buffer += data;

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (!line) continue;

      try {
        const message = JSON.parse(line);

        // Check if it's a response (has id) or notification (has method)
        if ('id' in message && message.id !== null) {
          // Response to a request
          const pending = this.pending.get(message.id);
          if (pending) {
            this.pending.delete(message.id);
            if (message.error) {
              pending.reject(new Error(message.error.message));
            } else {
              pending.resolve(message.result);
            }
          }
        } else if ('method' in message) {
          // Notification
          this.handleNotification(message);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  /**
   * Handle notifications from the daemon
   */
  private handleNotification(notification: { method: string; params: unknown }): void {
    const { method, params } = notification;

    switch (method) {
      case 'terminal.data':
        const dataParams = params as { termId: string; data: string };
        this.emit('terminal:data', dataParams.termId, dataParams.data);
        break;

      case 'terminal.exit':
        const exitParams = params as { termId: string; exitCode: number; signal?: string };
        this.emit('terminal:exit', exitParams.termId, exitParams.exitCode, exitParams.signal);
        break;
    }
  }

  /**
   * Send a JSON-RPC request
   */
  private async request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to PTY daemon');
    }

    const id = ++this.requestId;
    const request = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.socket!.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Create a new terminal
   */
  async create(options: CreateTerminalOptions = {}): Promise<{ termId: string; pid: number }> {
    return this.request('create', options);
  }

  /**
   * Write data to a terminal
   */
  async write(termId: string, data: string): Promise<{ ok: true }> {
    return this.request('write', { termId, data });
  }

  /**
   * Resize a terminal
   */
  async resize(termId: string, cols: number, rows: number): Promise<{ ok: true }> {
    return this.request('resize', { termId, cols, rows });
  }

  /**
   * Kill a terminal
   */
  async kill(termId: string, signal?: string): Promise<{ ok: true }> {
    return this.request('kill', { termId, signal });
  }

  /**
   * List all terminals
   */
  async list(): Promise<{ terminals: TerminalInfo[] }> {
    return this.request('list');
  }

  /**
   * Get a specific terminal
   */
  async get(termId: string): Promise<{ terminal: TerminalInfo }> {
    return this.request('get', { termId });
  }

  /**
   * Get buffered data for a terminal (last 100KB)
   */
  async getBufferedData(termId: string): Promise<{ data: string }> {
    return this.request('getBufferedData', { termId });
  }

  /**
   * Subscribe to terminal events
   */
  async subscribe(termId: string): Promise<{ ok: true }> {
    return this.request('subscribe', { termId });
  }

  /**
   * Unsubscribe from terminal events
   */
  async unsubscribe(termId: string): Promise<{ ok: true }> {
    return this.request('unsubscribe', { termId });
  }

  /**
   * Run a command and wait for completion using sentinel markers.
   * LEADER-ONLY: Only leader agents should call this method.
   * 
   * @param termId - Terminal ID
   * @param command - Command to execute
   * @param options - Optional settings
   * @param options.timeout - Timeout in milliseconds (default: 30000)
   * @param options.role - Caller role (must be 'leader')
   */
  async run(
    termId: string,
    command: string,
    options: { timeout?: number; role?: 'leader' | 'worker' } = {}
  ): Promise<{ ok: boolean; output: string; durationMs: number; timedOut: boolean }> {
    return this.request('run', {
      termId,
      command,
      timeout: options.timeout ?? 30000,
      role: options.role ?? 'leader',
    });
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.connected;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let clientInstance: PTYClient | null = null;

export function getPTYClient(): PTYClient {
  if (!clientInstance) {
    clientInstance = new PTYClient();
  }
  return clientInstance;
}

export function createPTYClient(options?: PTYClientOptions): PTYClient {
  return new PTYClient(options);
}
