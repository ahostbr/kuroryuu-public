/**
 * Terminal Buffer Utilities
 *
 * Viewport-constrained buffer reading for xterm.js terminals.
 * Provides three window strategies: tail, viewport, delta.
 *
 * Used by k_term_read() MCP action for opt-in buffer-first monitoring.
 */

import type { Terminal } from '@xterm/xterm';
import type { IMarker } from '@xterm/xterm';

// ============================================
// Type Definitions
// ============================================

export interface TerminalBufferSnapshot {
  text: string;
  lines: string[];
  cursorLine?: number;
  viewportY?: number;
  rows: number;
  cols: number;
  bufferType: 'normal' | 'alternate';
}

export interface TerminalBufferSnapshotWithMarker extends TerminalBufferSnapshot {
  markerId?: number;
  markerLine?: number;
  markerDisposed?: boolean;
}

export interface BufferReadOptions {
  maxLines?: number;
  mergeWrapped?: boolean;
  markerId?: number;
}

// ============================================
// Marker Registry (module-scoped)
// ============================================

const markerRegistry = new Map<number, IMarker>();
const CLEANUP_THRESHOLD = 50; // Run cleanup when registry grows past this size

/**
 * Get marker by ID from registry
 */
export function getMarker(markerId: number): IMarker | undefined {
  return markerRegistry.get(markerId);
}

/**
 * Clear disposed markers from registry
 */
export function cleanupMarkers(): void {
  for (const [id, marker] of markerRegistry.entries()) {
    if (marker.isDisposed) {
      markerRegistry.delete(id);
    }
  }
}

/**
 * Remove a specific marker by ID (for explicit cleanup)
 */
export function removeMarker(markerId: number): void {
  const marker = markerRegistry.get(markerId);
  if (marker) {
    if (!marker.isDisposed) {
      marker.dispose();
    }
    markerRegistry.delete(markerId);
  }
}

/**
 * Clear all markers from registry (for full reset)
 */
export function clearAllMarkers(): void {
  for (const marker of markerRegistry.values()) {
    if (!marker.isDisposed) {
      try {
        marker.dispose();
      } catch {
        // Ignore disposal errors
      }
    }
  }
  markerRegistry.clear();
}

/**
 * Get current marker count (for debugging/monitoring)
 */
export function getMarkerCount(): number {
  return markerRegistry.size;
}

// ============================================
// Tail Mode (Recommended Default)
// ============================================

/**
 * Read last N lines from cursor position.
 * Best for "what just happened" queries.
 *
 * @param terminal - xterm.js Terminal instance
 * @param maxLines - Maximum lines to return (default: 40)
 * @param mergeWrapped - Merge wrapped lines for readability (default: true)
 */
export function readTailBuffer(
  terminal: Terminal,
  maxLines: number = 40,
  mergeWrapped: boolean = true
): TerminalBufferSnapshot {
  const buffer = terminal.buffer.active;
  const cursor = buffer.baseY + buffer.cursorY;
  const start = Math.max(0, cursor - maxLines);
  const cols = terminal.cols;
  const segments: string[] = [];

  for (let i = start; i <= cursor; i++) {
    const line = buffer.getLine(i);
    if (line) {
      // trimRight=false while merging to preserve wrap boundaries
      const text = line.translateToString(false, 0, cols);

      if (mergeWrapped && line.isWrapped && segments.length > 0) {
        segments[segments.length - 1] += text;
      } else {
        segments.push(text);
      }
    }
  }

  // trimRight=true only on final assembled lines
  const lines = segments.map(s => s.trimEnd());

  return {
    text: lines.join('\n'),
    lines,
    cursorLine: cursor,
    rows: terminal.rows,
    cols: terminal.cols,
    bufferType: buffer.type === 'alternate' ? 'alternate' : 'normal',
  };
}

// ============================================
// Viewport Mode
// ============================================

/**
 * Read visible terminal window (matches screenshot semantics).
 * Returns exactly what's visible on screen.
 *
 * @param terminal - xterm.js Terminal instance
 * @param mergeWrapped - Merge wrapped lines for readability (default: true)
 */
export function readViewportBuffer(
  terminal: Terminal,
  mergeWrapped: boolean = true
): TerminalBufferSnapshot {
  const buffer = terminal.buffer.active;
  const viewportY = buffer.viewportY;
  const rows = terminal.rows;
  const cols = terminal.cols;
  const segments: string[] = [];

  for (let i = viewportY; i < viewportY + rows; i++) {
    const line = buffer.getLine(i);
    if (line) {
      // trimRight=false while merging to preserve wrap boundaries
      const text = line.translateToString(false, 0, cols);

      if (mergeWrapped && line.isWrapped && i > viewportY) {
        // Can merge with previous (it's in viewport)
        segments[segments.length - 1] += text;
      } else if (mergeWrapped && line.isWrapped && i === viewportY) {
        // First line is wrapped but previous is invisible - prefix with ellipsis
        segments.push('...' + text);
      } else {
        segments.push(text);
      }
    }
  }

  // trimRight=true only on final assembled lines
  const lines = segments.map(s => s.trimEnd());

  return {
    text: lines.join('\n'),
    lines,
    viewportY,
    rows,
    cols,
    bufferType: buffer.type === 'alternate' ? 'alternate' : 'normal',
  };
}

// ============================================
// Delta Mode (Only New Output Since Marker)
// ============================================

/**
 * Read only new output since last marker.
 * Most efficient for polling loops.
 *
 * First call (no markerId): Registers marker, returns empty text + markerId
 * Subsequent calls: Returns text since marker
 *
 * Note: Markers only work on normal buffer. Falls back to tail on alternate buffer.
 *
 * @param terminal - xterm.js Terminal instance
 * @param markerId - ID from previous call (null for first call)
 * @param maxLines - Maximum lines to return (default: 40)
 * @param mergeWrapped - Merge wrapped lines for readability (default: true)
 */
export function readDeltaBuffer(
  terminal: Terminal,
  markerId: number | null = null,
  maxLines: number = 40,
  mergeWrapped: boolean = true
): TerminalBufferSnapshotWithMarker {
  const buffer = terminal.buffer.active;

  // Gate on normal buffer - markers don't work on alternate
  if (buffer.type === 'alternate') {
    return {
      ...readTailBuffer(terminal, maxLines, mergeWrapped),
      bufferType: 'alternate',
    };
  }

  // First call: register new marker
  if (markerId === null) {
    // Periodic cleanup to prevent unbounded growth
    if (markerRegistry.size > CLEANUP_THRESHOLD) {
      cleanupMarkers();
    }

    const marker = terminal.registerMarker(0);
    if (!marker) {
      // Marker registration failed - fallback to tail
      return readTailBuffer(terminal, maxLines, mergeWrapped);
    }

    // Store in registry
    markerRegistry.set(marker.id, marker);

    // Hook disposal for cleanup
    marker.onDispose(() => {
      markerRegistry.delete(marker.id);
    });

    // First call returns empty text + marker ID
    return {
      text: '',
      lines: [],
      markerId: marker.id,
      markerLine: marker.line,
      markerDisposed: false,
      rows: terminal.rows,
      cols: terminal.cols,
      bufferType: 'normal',
    };
  }

  // Subsequent call: retrieve marker
  const oldMarker = markerRegistry.get(markerId);
  if (!oldMarker || oldMarker.isDisposed || oldMarker.line === -1) {
    // Marker gone or invalid - fallback to tail
    return readTailBuffer(terminal, maxLines, mergeWrapped);
  }

  const cursor = buffer.baseY + buffer.cursorY;
  let start = oldMarker.line + 1; // Exclusive - don't repeat marker line

  // If start line is wrapped, back up to find logical line beginning
  while (start > 0 && buffer.getLine(start)?.isWrapped) {
    start--;
  }

  const cols = terminal.cols;
  const segments: string[] = [];

  // Read only new lines since marker
  for (let i = start; i <= cursor; i++) {
    const line = buffer.getLine(i);
    if (line) {
      // trimRight=false while merging to preserve wrap boundaries
      const text = line.translateToString(false, 0, cols);

      if (mergeWrapped && line.isWrapped && segments.length > 0) {
        segments[segments.length - 1] += text;
      } else {
        segments.push(text);
      }
    }
  }

  // trimRight=true only on final assembled lines
  const lines = segments.map(s => s.trimEnd());

  return {
    text: lines.join('\n'),
    lines,
    markerId: oldMarker.id,
    markerLine: oldMarker.line,
    markerDisposed: oldMarker.isDisposed,
    rows: terminal.rows,
    cols: terminal.cols,
    bufferType: 'normal',
  };
}

// ============================================
// Unified Read Function
// ============================================

export type BufferReadMode = 'tail' | 'viewport' | 'delta';

/**
 * Unified buffer read function - routes to appropriate strategy.
 *
 * @param terminal - xterm.js Terminal instance
 * @param mode - Read mode: 'tail' | 'viewport' | 'delta'
 * @param options - Read options
 */
export function readTerminalBuffer(
  terminal: Terminal,
  mode: BufferReadMode = 'tail',
  options: BufferReadOptions = {}
): TerminalBufferSnapshot | TerminalBufferSnapshotWithMarker {
  const { maxLines = 40, mergeWrapped = true, markerId } = options;

  switch (mode) {
    case 'tail':
      return readTailBuffer(terminal, maxLines, mergeWrapped);
    case 'viewport':
      return readViewportBuffer(terminal, mergeWrapped);
    case 'delta':
      return readDeltaBuffer(terminal, markerId ?? null, maxLines, mergeWrapped);
    default:
      return readTailBuffer(terminal, maxLines, mergeWrapped);
  }
}
