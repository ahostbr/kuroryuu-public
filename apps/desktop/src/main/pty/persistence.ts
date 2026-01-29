/**
 * PTY Session Persistence for Desktop App
 *
 * Handles saving and loading terminal session state to disk.
 * Follows same pattern as Auto-Claude reference implementation.
 *
 * Storage location: KURORYUU_PROJECT_ROOT/ai/checkpoints/pty/renderer/
 *
 * Features:
 * - Session metadata persistence (terminals.json)
 * - xterm buffer persistence (buffers/ directory)
 * - Debounced saves (1s) with immediate save on quit
 * - TTL-based stale session cleanup (7 days)
 * - Atomic JSON writes for crash safety
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

// Session age limit: 7 days
const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Debounce delay: 1 second
const SAVE_DEBOUNCE_MS = 1000;

/**
 * Sanitize a terminal ID to prevent path traversal attacks.
 * Only allows alphanumeric characters, hyphens, and underscores.
 */
function sanitizeTerminalId(terminalId: string): string {
  // Remove any path traversal characters and keep only safe chars
  return terminalId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Get project root (Kuroryuu root directory)
const getProjectRoot = (): string => {
  // __dirname is apps/desktop/src/main/pty in dev, apps/desktop/out/main in prod
  // Either way, 4 levels up gets to project root
  return process.env.KURORYUU_ROOT || process.env.KURORYUU_PROJECT_ROOT || path.join(__dirname, '../../../..');
};

const getPtyPersistenceRoot = (): string => {
  return path.join(getProjectRoot(), 'ai', 'checkpoints', 'pty');
};

const getRendererPersistenceRoot = (): string => {
  return path.join(getPtyPersistenceRoot(), 'renderer');
};

// File paths
const getSessionsFilePath = (): string => {
  return path.join(getRendererPersistenceRoot(), 'terminals.json');
};

const getBuffersDir = (): string => {
  return path.join(getRendererPersistenceRoot(), 'buffers');
};

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  status: 'pending' | 'streaming' | 'complete' | 'error';
}

export interface TerminalSessionState {
  // Identity
  id: string;
  title: string;

  // PTY references
  ptyId?: string;
  sessionId?: string;

  // Claude mode
  claudeMode?: boolean;
  linkedAgentId?: string;

  // View state
  viewMode: 'pending' | 'terminal' | 'chat';

  // Buffer reference
  bufferFile?: string;

  // Chat history
  chatMessages: ChatMessage[];

  // Timing
  createdAt: number;
  lastActiveAt: number;
}

interface TerminalSessionsFile {
  version: number;
  savedAt: number;
  terminals: TerminalSessionState[];
}

interface RecoveryInfo {
  totalSessions: number;
  recovered: number;
  staleRemoved: number;
}

// ============================================================================
// Desktop PTY Persistence Class
// ============================================================================

class DesktopPtyPersistence {
  private sessions: Map<string, TerminalSessionState> = new Map();
  // Index for O(1) lookup: ptyId -> term-* sessionId (for duplicate detection)
  private ptyIdToTermSessionIndex: Map<string, string> = new Map();
  private saveTimeout: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor() {
    // Ensure directories exist on construction
    this.ensureDirectories();
  }

  /**
   * Ensure persistence directories exist
   */
  private ensureDirectories(): void {
    try {
      const persistenceRoot = getPtyPersistenceRoot();
      if (!fs.existsSync(persistenceRoot)) {
        fs.mkdirSync(persistenceRoot, { recursive: true });
      }

      const rendererRoot = getRendererPersistenceRoot();
      if (!fs.existsSync(rendererRoot)) {
        fs.mkdirSync(rendererRoot, { recursive: true });
      }

      const buffersDir = getBuffersDir();
      if (!fs.existsSync(buffersDir)) {
        fs.mkdirSync(buffersDir, { recursive: true });
      }
    } catch (error) {
      console.error('[PtyPersistence] Failed to create directories:', error);
    }
  }

  /**
   * Initialize persistence and load existing sessions
   */
  initialize(): RecoveryInfo {
    if (this.isInitialized) {
      return {
        totalSessions: this.sessions.size,
        recovered: 0,
        staleRemoved: 0,
      };
    }

    this.ensureDirectories();

    const result = this.loadSessions();
    this.isInitialized = true;

    console.log(
      `[PtyPersistence] Initialized: ${result.recovered} sessions recovered, ${result.staleRemoved} stale removed`
    );

    return result;
  }

  /**
   * Load sessions from disk
   */
  private loadSessions(): RecoveryInfo {
    const sessionsFile = getSessionsFilePath();

    if (!fs.existsSync(sessionsFile)) {
      return { totalSessions: 0, recovered: 0, staleRemoved: 0 };
    }

    try {
      const content = fs.readFileSync(sessionsFile, 'utf8');
      const data: TerminalSessionsFile = JSON.parse(content);

      // Check version compatibility
      if (data.version !== 1) {
        console.warn(
          `[PtyPersistence] Incompatible version ${data.version}, starting fresh`
        );
        return { totalSessions: 0, recovered: 0, staleRemoved: 0 };
      }

      // Filter out stale sessions
      const now = Date.now();
      const validSessions: TerminalSessionState[] = [];
      const staleSessions: TerminalSessionState[] = [];

      for (const session of data.terminals) {
        if (now - session.lastActiveAt < MAX_SESSION_AGE_MS) {
          validSessions.push(session);
        } else {
          staleSessions.push(session);
        }
      }

      // Cleanup stale session buffers
      for (const session of staleSessions) {
        if (session.bufferFile) {
          this.deleteBufferFile(session.bufferFile);
        }
      }

      // Populate in-memory map and index
      for (const session of validSessions) {
        this.sessions.set(session.id, session);
        // Build ptyId index for term-* sessions
        if (session.id.startsWith('term-') && session.ptyId) {
          this.ptyIdToTermSessionIndex.set(session.ptyId, session.id);
        }
      }

      console.log(
        `[PtyPersistence] Loaded ${validSessions.length} sessions (${staleSessions.length} stale removed)`
      );

      return {
        totalSessions: data.terminals.length,
        recovered: validSessions.length,
        staleRemoved: staleSessions.length,
      };
    } catch (error) {
      console.error('[PtyPersistence] Failed to load sessions:', error);
      return { totalSessions: 0, recovered: 0, staleRemoved: 0 };
    }
  }

  /**
   * Save or update a session
   *
   * Deduplication logic:
   * - Main process saves with id = ptyId (e.g., "9fc5449d97dc9a8a")
   * - Renderer saves with id = "term-..." and ptyId = "9fc5449d97dc9a8a"
   * - If a term-* entry already exists for this ptyId, skip saving the bare ptyId entry
   *
   * Uses ptyIdToTermSessionIndex for O(1) duplicate detection instead of O(n) iteration.
   */
  saveSession(session: TerminalSessionState): void {
    const ptyId = session.ptyId || session.id;

    // Check for duplicate using O(1) index lookup:
    // If this session's id is a bare ptyId (not term-*), check if a term-* entry already exists
    if (!session.id.startsWith('term-') && ptyId) {
      const existingTermSessionId = this.ptyIdToTermSessionIndex.get(ptyId);
      if (existingTermSessionId) {
        // A renderer-created entry already exists for this ptyId
        console.log(`[PtyPersistence] Skipping duplicate save for ptyId ${ptyId} - term-* entry exists: ${existingTermSessionId}`);
        return;
      }
    }

    // Also check reverse: if saving a term-* entry, remove any bare ptyId entry
    if (session.id.startsWith('term-') && ptyId && this.sessions.has(ptyId)) {
      console.log(`[PtyPersistence] Removing bare ptyId entry ${ptyId} in favor of term-* entry ${session.id}`);
      this.sessions.delete(ptyId);
    }

    // Update the ptyId index for term-* sessions
    if (session.id.startsWith('term-') && ptyId) {
      this.ptyIdToTermSessionIndex.set(ptyId, session.id);
    }

    session.lastActiveAt = Date.now();
    this.sessions.set(session.id, session);
    this.scheduleSave();
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): TerminalSessionState | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): TerminalSessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Remove a session
   */
  removeSession(id: string): void {
    const session = this.sessions.get(id);
    if (session?.bufferFile) {
      this.deleteBufferFile(session.bufferFile);
    }
    // Update ptyId index if this was a term-* session
    if (session && id.startsWith('term-') && session.ptyId) {
      this.ptyIdToTermSessionIndex.delete(session.ptyId);
    }
    this.sessions.delete(id);
    // Use immediate save to ensure removal persists before app close
    this.saveNow();
  }

  /**
   * Update session metadata (partial update)
   */
  updateSessionMetadata(
    id: string,
    updates: Partial<
      Pick<
        TerminalSessionState,
        'title' | 'claudeMode' | 'linkedAgentId' | 'viewMode' | 'chatMessages'
      >
    >
  ): void {
    const session = this.sessions.get(id);
    if (!session) {
      console.warn(`[PtyPersistence] Cannot update - session ${id} not found`);
      return;
    }

    Object.assign(session, updates);
    session.lastActiveAt = Date.now();
    this.scheduleSave();
  }

  /**
   * Set Claude mode for a session
   */
  setClaudeMode(sessionId: string, enabled: boolean): void {
    this.updateSessionMetadata(sessionId, { claudeMode: enabled });
  }

  /**
   * Save terminal buffer content
   */
  saveBuffer(terminalId: string, serializedBuffer: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      console.warn(
        `[PtyPersistence] Cannot save buffer - session ${terminalId} not found`
      );
      return;
    }

    // Sanitize terminalId to prevent path traversal attacks
    const safeTerminalId = sanitizeTerminalId(terminalId);
    const bufferFile = `buffer-${safeTerminalId}.txt`;
    const bufferPath = path.join(getBuffersDir(), bufferFile);

    try {
      this.ensureDirectories();
      fs.writeFileSync(bufferPath, serializedBuffer, 'utf8');
      session.bufferFile = bufferFile;
      session.lastActiveAt = Date.now();
      this.scheduleSave();
      console.log(`[PtyPersistence] Saved buffer for session ${terminalId}`);
    } catch (error) {
      console.error(
        `[PtyPersistence] Failed to save buffer for ${terminalId}:`,
        error
      );
    }
  }

  /**
   * Load terminal buffer content
   */
  loadBuffer(terminalId: string): string | null {
    const session = this.sessions.get(terminalId);
    if (!session?.bufferFile) return null;

    const bufferPath = path.join(getBuffersDir(), session.bufferFile);
    if (!fs.existsSync(bufferPath)) {
      return null;
    }

    try {
      return fs.readFileSync(bufferPath, 'utf8');
    } catch (error) {
      console.error(
        `[PtyPersistence] Failed to load buffer for ${terminalId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Delete a buffer file
   */
  private deleteBufferFile(bufferFile: string): void {
    // Validate bufferFile doesn't contain path traversal
    if (bufferFile.includes('..') || bufferFile.includes('/') || bufferFile.includes('\\')) {
      console.error(`[PtyPersistence] Invalid buffer file path rejected: ${bufferFile}`);
      return;
    }
    const bufferPath = path.join(getBuffersDir(), bufferFile);
    if (fs.existsSync(bufferPath)) {
      try {
        fs.unlinkSync(bufferPath);
      } catch (error) {
        console.error(
          `[PtyPersistence] Failed to delete buffer file ${bufferFile}:`,
          error
        );
      }
    }
  }

  /**
   * Schedule a debounced save
   */
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveToDisk();
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Save immediately (for app quit)
   */
  saveNow(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.saveToDisk();
  }

  /**
   * Save sessions to disk
   */
  private saveToDisk(): void {
    const data: TerminalSessionsFile = {
      version: 1,
      savedAt: Date.now(),
      terminals: Array.from(this.sessions.values()),
    };

    try {
      this.ensureDirectories();
      const sessionsFile = getSessionsFilePath();

      // Atomic write: write to temp file first, then rename
      const tempFile = sessionsFile + '.tmp';
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempFile, sessionsFile);

      console.log(
        `[PtyPersistence] Saved ${data.terminals.length} sessions to disk`
      );
    } catch (error) {
      console.error('[PtyPersistence] Failed to save sessions:', error);
    }
  }

  /**
   * Cleanup orphaned buffer files
   */
  cleanupOrphanedBuffers(): number {
    let cleaned = 0;

    try {
      const buffersDir = getBuffersDir();
      if (!fs.existsSync(buffersDir)) return 0;

      const files = fs.readdirSync(buffersDir);
      const validBufferFiles = new Set<string>();

      // Collect valid buffer file names from sessions
      for (const session of this.sessions.values()) {
        if (session.bufferFile) {
          validBufferFiles.add(session.bufferFile);
        }
      }

      // Delete orphaned files
      for (const file of files) {
        if (!validBufferFiles.has(file)) {
          try {
            fs.unlinkSync(path.join(buffersDir, file));
            cleaned++;
          } catch (error) {
            console.warn(`[PtyPersistence] Failed to delete orphaned buffer file ${file}:`, error);
          }
        }
      }

      if (cleaned > 0) {
        console.log(`[PtyPersistence] Cleaned ${cleaned} orphaned buffer files`);
      }
    } catch (error) {
      console.error('[PtyPersistence] Failed to cleanup orphaned buffers:', error);
    }

    return cleaned;
  }

  /**
   * Get persistence status
   */
  getStatus(): {
    initialized: boolean;
    sessionCount: number;
    root: string;
  } {
    return {
      initialized: this.isInitialized,
      sessionCount: this.sessions.size,
      root: getRendererPersistenceRoot(),
    };
  }

  /**
   * Clear all sessions and buffer files (for full reset)
   */
  clearAll(): void {
    const sessionCount = this.sessions.size;

    // Delete all buffer files
    for (const session of this.sessions.values()) {
      if (session.bufferFile) {
        this.deleteBufferFile(session.bufferFile);
      }
    }

    // Clear in-memory sessions and index
    this.sessions.clear();
    this.ptyIdToTermSessionIndex.clear();

    // Save empty state immediately
    this.saveNow();

    console.log(`[PtyPersistence] Cleared all ${sessionCount} sessions and buffers`);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const desktopPtyPersistence = new DesktopPtyPersistence();

// ============================================================================
// Electron Lifecycle Hooks
// ============================================================================

// Save on app quit
app.on('before-quit', () => {
  console.log('[PtyPersistence] App quitting, saving sessions...');
  desktopPtyPersistence.saveNow();
});

app.on('will-quit', () => {
  desktopPtyPersistence.saveNow();
});

// Cleanup orphaned buffers after app is ready
app.whenReady().then(() => {
  // Delay cleanup to not block startup
  setTimeout(() => {
    desktopPtyPersistence.cleanupOrphanedBuffers();
  }, 5000);
});
