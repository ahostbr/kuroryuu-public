/**
 * PTY Daemon - JSON-RPC Server over TCP
 * 
 * Provides real shell access for Kuroryuu agents via:
 * - TCP port 7072 (configurable via PTY_DAEMON_PORT)
 * - JSON-RPC 2.0 protocol
 * - Line-delimited JSON messages
 * 
 * Usage:
 *   npm start              # Production
 *   npm run dev            # Development with ts-node
 *   PTY_DAEMON_PORT=8000 npm start  # Custom port
 */

import * as net from 'net';
import { PTYManager } from './pty-manager';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  ErrorCodes,
  CreateParams,
  WriteParams,
  ResizeParams,
  KillParams,
  GetParams,
  SubscribeParams,
  UnsubscribeParams,
  RunParams,
  RunResult,
  GetBufferedDataParams,
  GetBufferedDataResult,
} from './protocol';

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.PTY_DAEMON_PORT || '7072', 10);
const HOST = process.env.PTY_DAEMON_HOST || '127.0.0.1';

// ============================================================================
// JSON-RPC Handler
// ============================================================================

class JsonRpcHandler {
  private ptyManager: PTYManager;
  private subscriptions: Map<net.Socket, Set<string>> = new Map();

  constructor() {
    this.ptyManager = new PTYManager();

    // Forward PTY events to subscribed clients
    this.ptyManager.on('data', (termId: string, data: string) => {
      this.broadcastToSubscribers(termId, {
        jsonrpc: '2.0',
        method: 'terminal.data',
        params: { termId, data },
      });
    });

    this.ptyManager.on('exit', (termId: string, exitCode: number, signal?: string) => {
      this.broadcastToSubscribers(termId, {
        jsonrpc: '2.0',
        method: 'terminal.exit',
        params: { termId, exitCode, signal },
      });
    });
  }

  /**
   * Subscribe a socket to terminal events
   */
  subscribe(socket: net.Socket, termId: string): void {
    if (!this.subscriptions.has(socket)) {
      this.subscriptions.set(socket, new Set());
    }
    this.subscriptions.get(socket)!.add(termId);
  }

  /**
   * Unsubscribe a socket from terminal events
   */
  unsubscribe(socket: net.Socket, termId: string): void {
    this.subscriptions.get(socket)?.delete(termId);
  }

  /**
   * Remove all subscriptions for a socket
   */
  removeSocket(socket: net.Socket): void {
    this.subscriptions.delete(socket);
  }

  /**
   * Broadcast notification to all sockets subscribed to a terminal
   */
  private broadcastToSubscribers(termId: string, notification: object): void {
    const message = JSON.stringify(notification) + '\n';
    for (const [socket, terminals] of this.subscriptions) {
      if (terminals.has(termId)) {
        try {
          socket.write(message);
        } catch {
          // Socket may have disconnected
          this.subscriptions.delete(socket);
        }
      }
    }
  }

  /**
   * Handle a JSON-RPC request
   */
  async handle(socket: net.Socket, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    try {
      let result: unknown;

      switch (method) {
        case 'create':
          result = this.handleCreate(params as CreateParams);
          break;

        case 'write':
          result = this.handleWrite(params as WriteParams);
          break;

        case 'resize':
          result = this.handleResize(params as ResizeParams);
          break;

        case 'kill':
          result = this.handleKill(params as KillParams);
          break;

        case 'list':
          result = this.handleList();
          break;

        case 'get':
          result = this.handleGet(params as GetParams);
          break;

        case 'getBufferedData':
          result = this.handleGetBufferedData(params as GetBufferedDataParams);
          break;

        case 'subscribe':
          result = this.handleSubscribe(socket, params as SubscribeParams);
          break;

        case 'unsubscribe':
          result = this.handleUnsubscribe(socket, params as UnsubscribeParams);
          break;

        case 'run':
          result = await this.handleRun(params as RunParams);
          break;

        default:
          return this.errorResponse(id, ErrorCodes.METHOD_NOT_FOUND, `Unknown method: ${method}`);
      }

      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.errorResponse(id, ErrorCodes.INTERNAL_ERROR, message);
    }
  }

  private handleCreate(params: CreateParams = {}): { termId: string; pid: number } {
    try {
      return this.ptyManager.create(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new RpcError(ErrorCodes.TERMINAL_CREATION_FAILED, `Failed to create terminal: ${message}`);
    }
  }

  private handleWrite(params: WriteParams): { ok: true } {
    if (!params?.termId) {
      throw new RpcError(ErrorCodes.INVALID_PARAMS, 'Missing termId');
    }
    if (typeof params.data !== 'string') {
      throw new RpcError(ErrorCodes.INVALID_PARAMS, 'Missing or invalid data');
    }

    if (!this.ptyManager.has(params.termId)) {
      throw new RpcError(ErrorCodes.TERMINAL_NOT_FOUND, `Terminal not found: ${params.termId}`);
    }

    const success = this.ptyManager.write(params.termId, params.data);
    if (!success) {
      throw new RpcError(ErrorCodes.TERMINAL_WRITE_FAILED, 'Failed to write to terminal');
    }

    return { ok: true };
  }

  private handleResize(params: ResizeParams): { ok: true } {
    if (!params?.termId) {
      throw new RpcError(ErrorCodes.INVALID_PARAMS, 'Missing termId');
    }
    if (typeof params.cols !== 'number' || typeof params.rows !== 'number') {
      throw new RpcError(ErrorCodes.INVALID_PARAMS, 'Missing or invalid cols/rows');
    }

    if (!this.ptyManager.has(params.termId)) {
      throw new RpcError(ErrorCodes.TERMINAL_NOT_FOUND, `Terminal not found: ${params.termId}`);
    }

    this.ptyManager.resize(params.termId, params.cols, params.rows);
    return { ok: true };
  }

  private handleKill(params: KillParams): { ok: true } {
    if (!params?.termId) {
      throw new RpcError(ErrorCodes.INVALID_PARAMS, 'Missing termId');
    }

    if (!this.ptyManager.has(params.termId)) {
      throw new RpcError(ErrorCodes.TERMINAL_NOT_FOUND, `Terminal not found: ${params.termId}`);
    }

    this.ptyManager.kill(params.termId, params.signal);
    return { ok: true };
  }

  private handleList(): { terminals: ReturnType<PTYManager['list']> } {
    return { terminals: this.ptyManager.list() };
  }

  private handleGet(params: GetParams): { terminal: ReturnType<PTYManager['get']> } {
    if (!params?.termId) {
      throw new RpcError(ErrorCodes.INVALID_PARAMS, 'Missing termId');
    }

    const terminal = this.ptyManager.get(params.termId);
    if (!terminal) {
      throw new RpcError(ErrorCodes.TERMINAL_NOT_FOUND, `Terminal not found: ${params.termId}`);
    }

    return { terminal };
  }

  private handleGetBufferedData(params: GetBufferedDataParams): GetBufferedDataResult {
    if (!params?.termId) {
      throw new RpcError(ErrorCodes.INVALID_PARAMS, 'Missing termId');
    }

    const data = this.ptyManager.getBufferedData(params.termId);
    return { data };
  }

  private handleSubscribe(socket: net.Socket, params: SubscribeParams): { ok: true } {
    if (!params?.termId) {
      throw new RpcError(ErrorCodes.INVALID_PARAMS, 'Missing termId');
    }

    if (!this.ptyManager.has(params.termId)) {
      throw new RpcError(ErrorCodes.TERMINAL_NOT_FOUND, `Terminal not found: ${params.termId}`);
    }

    this.subscribe(socket, params.termId);
    return { ok: true };
  }

  private handleUnsubscribe(socket: net.Socket, params: UnsubscribeParams): { ok: true } {
    if (!params?.termId) {
      throw new RpcError(ErrorCodes.INVALID_PARAMS, 'Missing termId');
    }

    this.unsubscribe(socket, params.termId);
    return { ok: true };
  }

  /**
   * Run a command with sentinel-based completion detection.
   * LEADER-ONLY: Only leader agents can use this method.
   */
  private async handleRun(params: RunParams): Promise<RunResult> {
    if (!params?.termId) {
      throw new RpcError(ErrorCodes.INVALID_PARAMS, 'Missing termId');
    }
    if (!params?.command) {
      throw new RpcError(ErrorCodes.INVALID_PARAMS, 'Missing command');
    }

    // LEADER-ONLY GATE
    if (params.role && params.role !== 'leader') {
      throw new RpcError(
        ErrorCodes.LEADER_ONLY,
        'The "run" method is leader-only. Workers must use "write" for raw terminal access.'
      );
    }

    if (!this.ptyManager.has(params.termId)) {
      throw new RpcError(ErrorCodes.TERMINAL_NOT_FOUND, `Terminal not found: ${params.termId}`);
    }

    const timeout = params.timeout ?? 30000;
    const result = await this.ptyManager.run(params.termId, params.command, timeout);

    if (result.timedOut) {
      throw new RpcError(
        ErrorCodes.COMMAND_TIMEOUT,
        `Command timed out after ${timeout}ms`,
        { output: result.output, durationMs: result.durationMs }
      );
    }

    return result;
  }

  private errorResponse(id: number | string, code: number, message: string, data?: unknown): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
  }

  /**
   * Cleanup all terminals on shutdown
   */
  cleanup(): void {
    this.ptyManager.cleanup();
    this.subscriptions.clear();
  }
}

// ============================================================================
// RPC Error
// ============================================================================

class RpcError extends Error {
  constructor(public code: number, message: string, public data?: unknown) {
    super(message);
    this.name = 'RpcError';
  }
}

// ============================================================================
// TCP Server
// ============================================================================

function startServer(): void {
  const handler = new JsonRpcHandler();
  const server = net.createServer((socket) => {
    console.log(`[PTY] Client connected: ${socket.remoteAddress}:${socket.remotePort}`);

    let buffer = '';

    socket.on('data', async (chunk) => {
      buffer += chunk.toString();

      // Process complete lines (line-delimited JSON)
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (!line) continue;

        try {
          const request = JSON.parse(line) as JsonRpcRequest;

          // Validate JSON-RPC format
          if (request.jsonrpc !== '2.0' || !request.method || request.id === undefined) {
            const errorResponse: JsonRpcResponse = {
              jsonrpc: '2.0',
              id: request.id ?? null as unknown as number,
              error: { code: ErrorCodes.INVALID_REQUEST, message: 'Invalid JSON-RPC request' },
            };
            socket.write(JSON.stringify(errorResponse) + '\n');
            continue;
          }

          const response = await handler.handle(socket, request);
          socket.write(JSON.stringify(response) + '\n');
        } catch (error) {
          // JSON parse error
          const errorResponse: JsonRpcResponse = {
            jsonrpc: '2.0',
            id: null as unknown as number,
            error: { code: ErrorCodes.PARSE_ERROR, message: 'Failed to parse JSON' },
          };
          socket.write(JSON.stringify(errorResponse) + '\n');
        }
      }
    });

    socket.on('close', () => {
      console.log(`[PTY] Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
      handler.removeSocket(socket);
    });

    socket.on('error', (err) => {
      console.error(`[PTY] Socket error: ${err.message}`);
      handler.removeSocket(socket);
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`[PTY] Daemon listening on ${HOST}:${PORT}`);
    console.log(`[PTY] Protocol: JSON-RPC 2.0 over TCP (line-delimited)`);
    console.log(`[PTY] Methods: create, write, resize, kill, list, get, subscribe, unsubscribe, run`);
    console.log(`[PTY] Leader-only: run (sentinel-based command execution)`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[PTY] Shutting down...');
    handler.cleanup();
    server.close(() => {
      console.log('[PTY] Server closed.');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('[PTY] Received SIGTERM, shutting down...');
    handler.cleanup();
    server.close(() => {
      process.exit(0);
    });
  });
}

// ============================================================================
// Entry Point
// ============================================================================

startServer();
