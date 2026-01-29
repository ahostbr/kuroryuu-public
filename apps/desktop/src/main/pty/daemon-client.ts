/**
 * PTY Daemon Client for Desktop App
 *
 * JSON-RPC 2.0 client that connects to the PTY daemon over TCP.
 * Based on apps/pty_daemon/src/client.ts but simplified for desktop use.
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import { getDaemonConfig } from './daemon-spawner';

// ============================================================================
// Constants
// ============================================================================

// Max buffer size to prevent unbounded memory growth (1MB)
const MAX_BUFFER_SIZE = 1024 * 1024;

// ============================================================================
// Types
// ============================================================================

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
// PTY Daemon Client
// ============================================================================

export class PtyDaemonClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = '';
  private requestId = 0;
  private pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();
  private connected = false;
  private reconnectEnabled = true;
  private reconnecting = false;
  private reconnectInterval = 3000;
  private connectPromise: Promise<void> | null = null; // Prevents double-connection race

  private host: string;
  private port: number;

  constructor() {
    super();
    const config = getDaemonConfig();
    this.host = config.host;
    this.port = config.port;
  }

  /**
   * Connect to the PTY daemon
   */
  connect(): Promise<void> {
    // Already connected
    if (this.connected) {
      return Promise.resolve();
    }

    // Connection in progress - reuse existing promise to prevent race
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        this.connected = true;
        this.reconnecting = false;
        this.connectPromise = null; // Clear pending promise
        console.log('[PTY Client] Connected to daemon on port', this.port);
        this.emit('connected');
        resolve();
      });

      this.socket.on('data', (chunk) => {
        this.handleData(chunk.toString());
      });

      this.socket.on('close', () => {
        const wasConnected = this.connected;
        this.connected = false;

        if (wasConnected) {
          console.log('[PTY Client] Disconnected from daemon');
          this.emit('disconnected');
        }

        // Reject all pending requests
        for (const [id, { reject }] of this.pending) {
          reject(new Error('Connection closed'));
        }
        this.pending.clear();

        // Attempt reconnection
        if (this.reconnectEnabled && !this.reconnecting) {
          this.reconnecting = true;
          setTimeout(() => this.attemptReconnect(), this.reconnectInterval);
        }
      });

      this.socket.on('error', (err) => {
        if (!this.connected) {
          this.connectPromise = null; // Clear pending promise on error
          reject(err);
        }
        this.emit('error', err);
      });

      this.socket.connect(this.port, this.host);
    });

    return this.connectPromise;
  }

  private attemptReconnect(): void {
    if (!this.reconnectEnabled || this.connected) {
      this.reconnecting = false;
      return;
    }

    console.log('[PTY Client] Attempting reconnect...');
    this.connect().catch(() => {
      if (this.reconnectEnabled) {
        setTimeout(() => this.attemptReconnect(), this.reconnectInterval);
      }
    });
  }

  /**
   * Disconnect from the PTY daemon
   */
  disconnect(): void {
    this.reconnectEnabled = false;
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
  }

  /**
   * Handle incoming data (line-delimited JSON)
   */
  private handleData(data: string): void {
    // Prevent unbounded buffer growth
    if (this.buffer.length + data.length > MAX_BUFFER_SIZE) {
      console.error('[PTY Client] Buffer overflow - clearing buffer');
      this.buffer = '';
      return;
    }
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
          // Notification from daemon
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
      case 'terminal.data': {
        const { termId, data } = params as { termId: string; data: string };
        this.emit('data', { id: termId, data });
        break;
      }

      case 'terminal.exit': {
        const { termId, exitCode, signal } = params as { termId: string; exitCode: number; signal?: string };
        this.emit('exit', { id: termId, exitCode, signal });
        break;
      }
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
  // Public API - Matches embedded PtyManager interface
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
   * Get buffered data for a terminal from daemon
   */
  async getBufferedData(termId: string): Promise<string> {
    try {
      const result = await this.request<{ data: string }>('getBufferedData', { termId });
      return result?.data ?? '';
    } catch {
      // Return empty on error (terminal may not exist)
      return '';
    }
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.connected;
  }
}
