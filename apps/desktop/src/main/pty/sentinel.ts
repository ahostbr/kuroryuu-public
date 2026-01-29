/**
 * Sentinel Pattern for node-pty
 *
 * Executes commands with a sentinel marker to reliably detect completion.
 * Pattern: `command; echo __KR_DONE_<uuid>__`
 *
 * Used by PTY Bridge to execute commands from MCP k_pty tool.
 */

import type { IPty } from 'node-pty';

// Extend IPty with EventEmitter methods that node-pty provides but aren't in types
export interface IPtyWithEvents extends IPty {
  on(event: 'data', listener: (data: string) => void): void;
  off(event: 'data', listener: (data: string) => void): void;
}

const SENTINEL_PREFIX = '__KR_DONE_';
const SENTINEL_SUFFIX = '__';

export interface RunResult {
  ok: boolean;
  output: string;
  sentinel?: string;
  error?: string;
  raw_output?: string;
}

/**
 * Generate a unique sentinel marker
 */
export function generateSentinel(): string {
  const id = Math.random().toString(36).substring(2, 10);
  return `${SENTINEL_PREFIX}${id}${SENTINEL_SUFFIX}`;
}

/**
 * Execute a command on a PTY with sentinel-based completion detection.
 *
 * @param pty - node-pty instance
 * @param command - Command to execute
 * @param sentinel - Sentinel string (auto-generated if empty)
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise with command output
 */
export function runWithSentinel(
  pty: IPtyWithEvents,
  command: string,
  sentinel: string = '',
  timeoutMs: number = 30000
): Promise<RunResult> {
  return new Promise((resolve) => {
    // Generate sentinel if not provided
    const sentinelMarker = sentinel || generateSentinel();
    let buffer = '';
    let resolved = false;

    // Build full command with sentinel (Windows PowerShell uses semicolon)
    const fullCmd = `${command}; echo ${sentinelMarker}\r\n`;

    // Timeout handler
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      pty.off('data', dataHandler);
      resolve({
        ok: false,
        output: buffer,
        error: `Timeout after ${timeoutMs}ms`,
        sentinel: sentinelMarker,
        raw_output: buffer
      });
    }, timeoutMs);

    // Data handler
    const dataHandler = (data: string): void => {
      if (resolved) return;

      buffer += data;

      // Check if sentinel is in buffer
      if (buffer.includes(sentinelMarker)) {
        resolved = true;
        clearTimeout(timeout);
        pty.off('data', dataHandler);

        // Extract output before sentinel
        const parts = buffer.split(sentinelMarker);
        let output = parts[0].trim();

        // Remove command echo if present (first line often echoes the command)
        const lines = output.split('\n');
        if (lines.length > 0 && lines[0].includes(command.substring(0, 20))) {
          output = lines.slice(1).join('\n').trim();
        }

        resolve({
          ok: true,
          output,
          sentinel: sentinelMarker,
          raw_output: buffer
        });
      }
    };

    // Listen for data
    pty.on('data', dataHandler);

    // Write the command
    pty.write(fullCmd);
  });
}

/**
 * Read from PTY buffer until a condition is met or timeout.
 *
 * @param pty - node-pty instance
 * @param predicate - Function to check if we should stop reading
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise with accumulated output
 */
export function readUntil(
  pty: IPtyWithEvents,
  predicate: (buffer: string) => boolean,
  timeoutMs: number = 5000
): Promise<{ ok: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    let buffer = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      pty.off('data', dataHandler);
      resolve({ ok: true, output: buffer }); // Not an error, just timeout
    }, timeoutMs);

    const dataHandler = (data: string): void => {
      if (resolved) return;

      buffer += data;

      if (predicate(buffer)) {
        resolved = true;
        clearTimeout(timeout);
        pty.off('data', dataHandler);
        resolve({ ok: true, output: buffer });
      }
    };

    pty.on('data', dataHandler);
  });
}
