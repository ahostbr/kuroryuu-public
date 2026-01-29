/**
 * PTY Daemon Protocol Types
 * 
 * JSON-RPC 2.0 over TCP (port 7072)
 */

// ============================================================================
// JSON-RPC Base Types
// ============================================================================

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard JSON-RPC error codes
export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom error codes
  TERMINAL_NOT_FOUND: -32000,
  TERMINAL_CREATION_FAILED: -32001,
  TERMINAL_WRITE_FAILED: -32002,
  COMMAND_TIMEOUT: -32003,
  LEADER_ONLY: -32004,
} as const;

// ============================================================================
// Method Parameters
// ============================================================================

export interface CreateParams {
  /** Shell command to run (default: system shell) */
  cmd?: string;
  /** Arguments for the command */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Environment variables (merged with process.env) */
  env?: Record<string, string>;
  /** Initial terminal columns (default: 80) */
  cols?: number;
  /** Initial terminal rows (default: 24) */
  rows?: number;
  /** Optional name/label for the terminal */
  name?: string;
}

export interface WriteParams {
  /** Terminal ID */
  termId: string;
  /** Data to write to the terminal */
  data: string;
}

export interface ResizeParams {
  /** Terminal ID */
  termId: string;
  /** New column count */
  cols: number;
  /** New row count */
  rows: number;
}

export interface KillParams {
  /** Terminal ID */
  termId: string;
  /** Signal to send (default: SIGTERM) */
  signal?: string;
}

export interface GetParams {
  /** Terminal ID */
  termId: string;
}

export interface SubscribeParams {
  /** Terminal ID to subscribe to */
  termId: string;
}

export interface UnsubscribeParams {
  /** Terminal ID to unsubscribe from */
  termId: string;
}

export interface RunParams {
  /** Terminal ID */
  termId: string;
  /** Command to execute */
  command: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Role of the caller - must be 'leader' */
  role?: 'leader' | 'worker';
}

export interface GetBufferedDataParams {
  /** Terminal ID */
  termId: string;
}

// ============================================================================
// Method Results
// ============================================================================

export interface CreateResult {
  /** Generated terminal ID */
  termId: string;
  /** PID of the spawned process */
  pid: number;
}

export interface WriteResult {
  ok: true;
}

export interface ResizeResult {
  ok: true;
}

export interface KillResult {
  ok: true;
}

export interface RunResult {
  /** Whether command completed successfully */
  ok: boolean;
  /** Command output (up to sentinel) */
  output: string;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Whether command timed out */
  timedOut: boolean;
}

export interface TerminalInfo {
  /** Terminal ID */
  termId: string;
  /** Process ID */
  pid: number;
  /** Terminal name/label */
  name: string;
  /** Command running */
  cmd: string;
  /** Working directory */
  cwd: string;
  /** Terminal columns */
  cols: number;
  /** Terminal rows */
  rows: number;
  /** Whether terminal is still alive */
  alive: boolean;
  /** Creation timestamp */
  createdAt: string;
}

export interface ListResult {
  terminals: TerminalInfo[];
}

export interface GetResult {
  terminal: TerminalInfo;
}

export interface GetBufferedDataResult {
  /** Buffered data (last 100KB) */
  data: string;
}

// ============================================================================
// Notifications (Server → Client)
// ============================================================================

export interface DataNotification {
  jsonrpc: '2.0';
  method: 'terminal.data';
  params: {
    termId: string;
    data: string;
  };
}

export interface ExitNotification {
  jsonrpc: '2.0';
  method: 'terminal.exit';
  params: {
    termId: string;
    exitCode: number;
    signal?: string;
  };
}

export type Notification = DataNotification | ExitNotification;

// ============================================================================
// Method Map
// ============================================================================

export type Methods = {
  create: { params: CreateParams; result: CreateResult };
  write: { params: WriteParams; result: WriteResult };
  resize: { params: ResizeParams; result: ResizeResult };
  kill: { params: KillParams; result: KillResult };
  list: { params: void; result: ListResult };
  get: { params: GetParams; result: GetResult };
  getBufferedData: { params: GetBufferedDataParams; result: GetBufferedDataResult };
  subscribe: { params: SubscribeParams; result: { ok: true } };
  unsubscribe: { params: UnsubscribeParams; result: { ok: true } };
  run: { params: RunParams; result: RunResult };
};
