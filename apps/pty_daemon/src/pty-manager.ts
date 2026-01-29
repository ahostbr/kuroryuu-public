/**
 * PTY Manager - Spawns and manages pseudo-terminal processes
 */

import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as crypto from 'crypto';
import type { CreateParams, TerminalInfo, RunResult } from './protocol';

// ============================================================================
// Constants
// ============================================================================

/** Sentinel marker prefix for command completion detection */
const SENTINEL_PREFIX = '__KURORYUU_DONE_';

/** Default command timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 30000;

/** Line ending for Windows PowerShell */
const CRLF = '\r\n';

// ============================================================================
// Types
// ============================================================================

interface ManagedTerminal {
  id: string;
  pty: pty.IPty;
  name: string;
  cmd: string;
  cwd: string;
  cols: number;
  rows: number;
  alive: boolean;
  createdAt: Date;
  buffer: string;  // Ring buffer for late subscribers (last 100KB)
  bufferMaxSize: number;  // Max buffer size in bytes
}

export interface PTYManagerEvents {
  data: (termId: string, data: string) => void;
  exit: (termId: string, exitCode: number, signal?: string) => void;
}

// ============================================================================
// PTY Manager
// ============================================================================

export class PTYManager extends EventEmitter {
  private terminals: Map<string, ManagedTerminal> = new Map();

  constructor() {
    super();
  }

  /**
   * Get the default shell for the current platform
   */
  private getDefaultShell(): string {
    if (os.platform() === 'win32') {
      // Use PowerShell on Windows (same as embedded PtyManager)
      return 'powershell.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * Generate a unique terminal ID
   */
  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Create a new PTY terminal
   */
  create(params: CreateParams = {}): { termId: string; pid: number } {
    const termId = this.generateId();
    const shell = params.cmd || this.getDefaultShell();
    const args = params.args || [];
    const cwd = params.cwd || process.cwd();
    const cols = params.cols || 80;
    const rows = params.rows || 24;
    const name = params.name || `Terminal ${this.terminals.size + 1}`;

    console.log('[PTYManager] Creating PTY:', {
      termId,
      shell,
      args,
      cwd,
      cols,
      rows,
      name,
      env: params.env
    });

    // Merge environment
    const env = {
      ...process.env,
      ...params.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    // Spawn PTY
    console.log('[PTYManager] Spawning:', shell, args);
    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: env as Record<string, string>,
    });

    console.log('[PTYManager] PTY spawned with PID:', ptyProcess.pid);

    const terminal: ManagedTerminal = {
      id: termId,
      pty: ptyProcess,
      name,
      cmd: shell,
      cwd,
      cols,
      rows,
      alive: true,
      createdAt: new Date(),
      buffer: '',  // Ring buffer for late subscribers
      bufferMaxSize: 100 * 1024,  // 100KB max buffer
    };

    this.terminals.set(termId, terminal);

    // Handle data from PTY
    ptyProcess.onData((data: string) => {
      // Append to ring buffer (FIFO eviction if over limit)
      terminal.buffer += data;
      if (terminal.buffer.length > terminal.bufferMaxSize) {
        // Keep last 100KB
        terminal.buffer = terminal.buffer.slice(-terminal.bufferMaxSize);
      }

      // Emit to subscribers
      this.emit('data', termId, data);
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      terminal.alive = false;
      this.emit('exit', termId, exitCode, signal?.toString());
    });

    return { termId, pid: ptyProcess.pid };
  }

  /**
   * Write data to a terminal
   */
  write(termId: string, data: string): boolean {
    const terminal = this.terminals.get(termId);
    if (!terminal || !terminal.alive) {
      return false;
    }
    terminal.pty.write(data);
    return true;
  }

  /**
   * Run a command and wait for completion using sentinel markers.
   * LEADER-ONLY: This method should only be called by leader agents.
   * 
   * Wraps command with sentinel marker:
   *   <command>; echo __KURORYUU_DONE_<id>__
   * 
   * Collects output until sentinel is detected, then returns.
   */
  run(termId: string, command: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<RunResult> {
    return new Promise((resolve) => {
      const terminal = this.terminals.get(termId);
      if (!terminal || !terminal.alive) {
        resolve({
          ok: false,
          output: '',
          durationMs: 0,
          timedOut: false,
        });
        return;
      }

      const startTime = Date.now();
      const sentinelId = crypto.randomBytes(4).toString('hex');
      const sentinel = `${SENTINEL_PREFIX}${sentinelId}__`;
      
      // Build wrapped command with sentinel
      // PowerShell: command; echo SENTINEL
      // Bash: command; echo SENTINEL
      const wrappedCommand = `${command}; echo ${sentinel}${CRLF}`;
      
      let outputBuffer = '';
      let completed = false;

      // Data handler to collect output
      const dataHandler = (tid: string, data: string) => {
        if (tid !== termId || completed) return;
        
        outputBuffer += data;
        
        // Check for sentinel in output
        const sentinelIndex = outputBuffer.indexOf(sentinel);
        if (sentinelIndex !== -1) {
          completed = true;
          
          // Extract output before sentinel
          let output = outputBuffer.substring(0, sentinelIndex);
          
          // Clean up: remove the command echo and trailing newlines
          // PowerShell echoes the command, so we skip first line if it matches
          const lines = output.split(/\r?\n/);
          if (lines.length > 0 && lines[0].includes(command.substring(0, 30))) {
            lines.shift();
          }
          output = lines.join('\n').trim();
          
          // Remove listener
          this.off('data', dataHandler);
          clearTimeout(timeoutHandle);
          
          resolve({
            ok: true,
            output,
            durationMs: Date.now() - startTime,
            timedOut: false,
          });
        }
      };

      // Timeout handler
      const timeoutHandle = setTimeout(() => {
        if (completed) return;
        completed = true;
        
        this.off('data', dataHandler);
        
        resolve({
          ok: false,
          output: outputBuffer.trim(),
          durationMs: Date.now() - startTime,
          timedOut: true,
        });
      }, timeoutMs);

      // Subscribe to data events
      this.on('data', dataHandler);
      
      // Send the wrapped command
      terminal.pty.write(wrappedCommand);
    });
  }

  /**
   * Resize a terminal
   */
  resize(termId: string, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(termId);
    if (!terminal || !terminal.alive) {
      return false;
    }
    terminal.pty.resize(cols, rows);
    terminal.cols = cols;
    terminal.rows = rows;
    return true;
  }

  /**
   * Kill a terminal
   */
  kill(termId: string, signal?: string): boolean {
    const terminal = this.terminals.get(termId);
    if (!terminal) {
      return false;
    }

    if (terminal.alive) {
      // node-pty kill accepts a signal string on Unix, ignored on Windows
      terminal.pty.kill(signal);
      terminal.alive = false;
    }

    return true;
  }

  /**
   * Remove a terminal from the manager (cleanup)
   */
  remove(termId: string): boolean {
    const terminal = this.terminals.get(termId);
    if (!terminal) {
      return false;
    }

    if (terminal.alive) {
      terminal.pty.kill();
    }

    this.terminals.delete(termId);
    return true;
  }

  /**
   * Get terminal info
   */
  get(termId: string): TerminalInfo | null {
    const terminal = this.terminals.get(termId);
    if (!terminal) {
      return null;
    }

    return {
      termId: terminal.id,
      pid: terminal.pty.pid,
      name: terminal.name,
      cmd: terminal.cmd,
      cwd: terminal.cwd,
      cols: terminal.cols,
      rows: terminal.rows,
      alive: terminal.alive,
      createdAt: terminal.createdAt.toISOString(),
    };
  }

  /**
   * List all terminals
   */
  list(): TerminalInfo[] {
    return Array.from(this.terminals.values()).map((terminal) => ({
      termId: terminal.id,
      pid: terminal.pty.pid,
      name: terminal.name,
      cmd: terminal.cmd,
      cwd: terminal.cwd,
      cols: terminal.cols,
      rows: terminal.rows,
      alive: terminal.alive,
      createdAt: terminal.createdAt.toISOString(),
    }));
  }

  /**
   * Get buffered data for a terminal (last 100KB)
   * Returns empty string if terminal not found
   */
  getBufferedData(termId: string): string {
    const terminal = this.terminals.get(termId);
    if (!terminal) {
      return '';
    }
    return terminal.buffer;
  }

  /**
   * Check if terminal exists
   */
  has(termId: string): boolean {
    return this.terminals.has(termId);
  }

  /**
   * Check if terminal is alive
   */
  isAlive(termId: string): boolean {
    const terminal = this.terminals.get(termId);
    return terminal?.alive ?? false;
  }

  /**
   * Cleanup all terminals
   */
  cleanup(): void {
    for (const [termId] of this.terminals) {
      this.remove(termId);
    }
  }

  /**
   * Get terminal count
   */
  get count(): number {
    return this.terminals.size;
  }

  /**
   * Get alive terminal count
   */
  get aliveCount(): number {
    return Array.from(this.terminals.values()).filter((t) => t.alive).length;
  }
}
