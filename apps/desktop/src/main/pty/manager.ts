import type { IPty } from 'node-pty';
import { spawn } from 'node-pty';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { PtyProcess, CreatePtyOptions, PtyCreateEvent } from './types';
import { desktopPtyPersistence } from './persistence';

// Kuroryuu hook environment variables
const KURORYUU_MCP_URL = process.env.KURORYUU_MCP_URL || 'http://127.0.0.1:8100';

// ============================================================================
// Dangerous command blocking (Agent Safety)
// Same patterns as MCP Core for consistency
// ============================================================================

const BLOCKED_COMMAND_PATTERNS = [
  // Destructive file operations
  /rm\s+(-[rf]+\s+)*[\/~]/i,        // rm -rf / or ~
  /del\s+\/[sqf]/i,                 // Windows del with dangerous flags
  /rmdir\s+\/[sq]/i,                // Windows rmdir recursive
  /rd\s+\/[sq]/i,                   // Windows rd alias

  // Disk/partition operations
  /format\s+[a-z]:/i,               // Format drives
  /diskpart/i,                      // Disk partitioning
  /mkfs\./i,                        // Linux format
  /dd\s+if=.+of=\/dev/i,            // Disk write
  /fdisk/i,                         // Partition editor

  // System damage
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,  // Fork bomb (bash)
  /%0\|%0/,                         // Fork bomb (Windows)
  /shutdown\s+[\/\-]/i,             // Shutdown commands
  /\bhalt\b/i,                      // System halt
  /init\s+0/i,                      // Linux halt

  // Credential/key access
  /cat.+\.ssh\//i,                  // SSH keys (Linux)
  /type.+\\\.ssh\\/i,               // SSH keys (Windows)
  /cat.+\.aws\//i,                  // AWS credentials
  /cat.+\.config\/gcloud/i,         // GCloud credentials
  /reg\s+query.+SAM/i,              // Windows SAM database
  /mimikatz/i,                      // Credential dumper
  /sekurlsa/i,                      // Mimikatz module

  // Download and execute
  /curl.+\|\s*(ba)?sh/i,            // curl | bash
  /wget.+-O-?\s*\|\s*(ba)?sh/i,     // wget | sh
  /Invoke-WebRequest.+\|\s*iex/i,   // PowerShell download exec
  /IEX\s*\(.+DownloadString/i,      // PowerShell IEX variant

  // Reverse shells
  /nc\s+.+-e\s+\/bin\//i,           // Netcat reverse shell
  /bash\s+-i\s+>&\s+\/dev\/tcp/i,   // Bash reverse shell
  /ncat.+--exec/i,                  // Ncat exec

  // Registry/system config attacks
  /reg\s+(delete|add)\s+HK(LM|CU)/i, // Registry modification
  /bcdedit/i,                       // Boot config edit
  /vssadmin\s+delete/i,             // Delete shadow copies
  /wbadmin\s+delete/i,              // Delete backups
];

function isBlockedCommand(cmd: string): { blocked: boolean; pattern?: string } {
  for (const pattern of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(cmd)) {
      return { blocked: true, pattern: pattern.toString() };
    }
  }
  return { blocked: false };
}

/**
 * Sanitize a command name for safe use in shell commands.
 * Prevents command injection by removing shell metacharacters.
 */
function sanitizeCommandName(cmd: string): string {
  // Only allow alphanumeric, dots, hyphens, underscores, and path separators
  return cmd.replace(/[^a-zA-Z0-9._\-\\/]/g, '');
}

// Escape a string for safe use in PowerShell single-quoted strings
function escapeForPowerShell(arg: string): string {
  // In PowerShell single-quoted strings, only single quotes need escaping (by doubling)
  // This handles system prompts with quotes, newlines, and special characters
  return `'${arg.replace(/'/g, "''")}'`;
}

export class PtyManager extends EventEmitter {
  private ptys = new Map<string, IPty>();
  private shell: string;
  private buffers = new Map<string, string>(); // Buffer initial PTY output
  private bufferTimeout = 5000; // Buffer for 5 seconds after creation
  private maxBufferSize = 512 * 1024; // Max 512KB per PTY buffer to prevent memory issues
  private sessionIdMap = new Map<string, string>(); // sessionId → internal UUID

  constructor() {
    super();
    this.shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  }

  // Check if a PTY process exists by id
  hasProcess(id: string): boolean {
    return this.ptys.has(id);
  }

  // Get and clear buffered data for a PTY
  getBufferedData(id: string): string {
    const buffered = this.buffers.get(id) || '';
    this.buffers.delete(id); // Clear after retrieval
    return buffered;
  }

  // Get IPty instance by sessionId (e.g., "claude_abc123")
  getBySessionId(sessionId: string): IPty | undefined {
    const internalId = this.sessionIdMap.get(sessionId);
    return internalId ? this.ptys.get(internalId) : undefined;
  }

  // Get internal UUID from sessionId
  getInternalId(sessionId: string): string | undefined {
    return this.sessionIdMap.get(sessionId);
  }

  // Get sessionId from internal UUID
  getSessionId(internalId: string): string | undefined {
    for (const [sessId, intId] of this.sessionIdMap) {
      if (intId === internalId) return sessId;
    }
    return undefined;
  }

  private detectCliType(cmd: string, args: string[]): string {
    const cmdLower = cmd.toLowerCase();
    const argsStr = args.join(' ').toLowerCase();
    // Check kuroryuu first (our own CLI)
    if (cmdLower.includes('kuroryuu') || argsStr.includes('kuroryuu')) return 'kuroryuu';
    if (cmdLower.includes('kiro') || argsStr.includes('kiro')) return 'kiro';
    if (cmdLower.includes('claude') || argsStr.includes('claude')) return 'claude';
    if (cmdLower.includes('copilot') || argsStr.includes('copilot')) return 'copilot';
    if (cmdLower.includes('codex') || argsStr.includes('codex')) return 'codex';
    return 'shell';
  }

  create(options: CreatePtyOptions = {}): PtyProcess {
    const id = randomUUID();
    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;
    const cwd = options.cwd ?? process.cwd();
    let cmd = options.cmd ?? this.shell;
    let args = options.args ?? [];

    // Check for dangerous commands in create (Agent Safety)
    const fullCommand = `${cmd} ${args.join(' ')}`;
    const blocked = isBlockedCommand(fullCommand);
    if (blocked.blocked) {
      console.warn(`[PTY] BLOCKED dangerous command in create: ${fullCommand.slice(0, 100)}`);
      throw new Error(`Command blocked by safety filter: ${blocked.pattern}`);
    }

    // npm-global CLI commands need to be wrapped through shell on Windows
    // because node-pty's ConPTY cannot properly handle stdin for .cmd shim files
    const npmGlobalCommands = ['kiro', 'kuroryuu', 'copilot', 'claude'];
    const needsShellWrapper = options.cmd &&
      npmGlobalCommands.some(c => options.cmd!.toLowerCase().includes(c));

    // For npm-global commands on Windows, wrap in cmd.exe for proper ConPTY stdin handling
    // Direct .cmd spawn causes stdin to be non-functional (output works, input doesn't)
    if (needsShellWrapper && process.platform === 'win32') {
      const originalCmd = cmd;
      const originalArgs = [...args];

      // Convert absolute paths to relative paths (simpler for cmd.exe to handle)
      // If arg starts with @ and contains cwd, strip the cwd prefix
      const cwdNormalized = cwd.replace(/\\/g, '/').toLowerCase();
      const simplifiedArgs = originalArgs.map(arg => {
        if (arg.startsWith('@')) {
          const pathPart = arg.slice(1); // Remove @
          const pathNormalized = pathPart.replace(/\\/g, '/').toLowerCase();
          if (pathNormalized.startsWith(cwdNormalized)) {
            // Convert to relative path
            let relativePath = pathPart.slice(cwd.length);
            // Remove leading slash/backslash
            if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
              relativePath = relativePath.slice(1);
            }
            // Use forward slashes for consistency
            relativePath = relativePath.replace(/\\/g, '/');
            return `@${relativePath}`;
          }
        }
        return arg;
      });

      // Quote arguments containing special cmd.exe characters (@, spaces, quotes)
      // The @ symbol has special meaning in cmd.exe (echo suppression) and causes
      // STATUS_CONTROL_C_EXIT (-1073741510) if not quoted
      const quotedArgs = simplifiedArgs.map(arg => {
        if (arg.includes('@') || arg.includes(' ') || arg.includes('"')) {
          // Escape internal quotes (doubled in cmd.exe) and wrap in quotes
          return `"${arg.replace(/"/g, '""')}"`;
        }
        return arg;
      });

      // Wrap in cmd /c to ensure proper stdin/stdout through shell
      cmd = 'cmd';
      args = ['/c', originalCmd, ...quotedArgs];
      console.log('[PTY] Wrapped npm CLI for Windows ConPTY:', { originalCmd, originalArgs, simplified: simplifiedArgs, wrapped: { cmd, args } });
    }

    // Detect CLI type and generate session ID
    const cliType = this.detectCliType(options.cmd ?? this.shell, options.args ?? []);
    const sessionId = `${cliType}_${id.slice(0, 8)}`;

    console.log('[PTY] Creating:', { id, cmd, args, cwd, cols, rows, cliType, sessionId });

    // Validate CLI command exists - warn but don't fallback (let spawn fail visibly)
    if (options.cmd && process.platform === 'win32') {
      const cmdToCheck = options.cmd.split(/[\\/]/).pop() || options.cmd;
      const safeCmdToCheck = sanitizeCommandName(cmdToCheck);
      try {
        execSync(`where ${safeCmdToCheck}`, { windowsHide: true, stdio: 'ignore' });
      } catch {
        // Log warning but DON'T fallback - let spawn attempt the command
        // This allows commands that exist but aren't in PATH to still work
        // and shows a clear error if they truly don't exist
        console.warn(`[PTY] Command '${cmdToCheck}' not found in PATH, attempting anyway...`);
      }
    }

    // Inject Kuroryuu hook environment variables
    const hookEnv = {
      KURORYUU_SESSION_ID: sessionId,
      KURORYUU_MCP_URL: KURORYUU_MCP_URL,
      KURORYUU_HOOKS_ENABLED: '1',
      KURORYUU_CLI_TYPE: cliType,
    };

    try {
      const pty = spawn(cmd, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: { ...process.env, ...hookEnv, ...options.env } as Record<string, string>
      });

      console.log('[PTY] Spawned:', { id, pid: pty.pid });

      // Initialize buffer for this PTY
      this.buffers.set(id, '');
      let buffering = true;
      let bufferPersistCounter = 0;
      const BUFFER_PERSIST_INTERVAL = 100; // Persist every 100 data events

      // Stop buffering after timeout
      setTimeout(() => {
        buffering = false;
        console.log('[PTY] Buffering stopped for:', id);
      }, this.bufferTimeout);

      pty.onData((data) => {
        // Buffer data for first few seconds (in case renderer isn't ready)
        if (buffering) {
          const current = this.buffers.get(id) || '';
          // Prevent unbounded buffer growth
          if (current.length + data.length <= this.maxBufferSize) {
            this.buffers.set(id, current + data);
          } else if (current.length < this.maxBufferSize) {
            // Truncate to max size
            this.buffers.set(id, current + data.slice(0, this.maxBufferSize - current.length));
          }
          // else: buffer already at max, discard new data
        }
        this.emit('data', { id, data });

        // Periodic buffer persistence
        bufferPersistCounter++;
        if (bufferPersistCounter >= BUFFER_PERSIST_INTERVAL) {
          bufferPersistCounter = 0;
          const buffered = this.buffers.get(id);
          if (buffered) {
            desktopPtyPersistence.saveBuffer(id, buffered);
          }
        }
      });

      pty.onExit(({ exitCode }) => {
        console.log('[PTY] Exit:', { id, sessionId, exitCode });
        this.ptys.delete(id);
        this.sessionIdMap.delete(sessionId);
        this.emit('exit', { id, sessionId, exitCode });
      });

      this.ptys.set(id, pty);
      this.sessionIdMap.set(sessionId, id);

      // Emit create event for bridge/MCP registration
      const createEvent: PtyCreateEvent = {
        id,
        sessionId,
        pid: pty.pid,
        cliType,
        // Pass owner metadata if provided
        ownerAgentId: options.ownerAgentId,
        ownerSessionId: options.ownerSessionId,
        ownerRole: options.ownerRole,
        label: options.label,
      };
      this.emit('create', createEvent);

      // Persistence: Save session state
      desktopPtyPersistence.saveSession({
        id,
        title: sessionId,
        ptyId: id,
        sessionId,
        claudeMode: false,
        linkedAgentId: options.ownerAgentId,
        viewMode: 'terminal',
        chatMessages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });

      return { id, pid: pty.pid, cols, rows, cwd, sessionId };
    } catch (err) {
      console.error('[PTY] Spawn error:', err);
      throw err;
    }
  }

  write(id: string, data: string): boolean {
    const pty = this.ptys.get(id);
    if (!pty) return false;

    // Check for dangerous commands (Agent Safety)
    const blocked = isBlockedCommand(data);
    if (blocked.blocked) {
      console.warn(`[PTY] BLOCKED dangerous command: ${data.slice(0, 100)}`);
      throw new Error(`Command blocked by safety filter: ${blocked.pattern}`);
    }

    pty.write(data);
    return true;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const pty = this.ptys.get(id);
    if (!pty) return false;
    pty.resize(cols, rows);
    return true;
  }

  kill(id: string): boolean {
    const pty = this.ptys.get(id);
    if (!pty) return false;

    // Clean up sessionIdMap
    const sessionId = this.getSessionId(id);
    if (sessionId) {
      this.sessionIdMap.delete(sessionId);
    }

    // Persistence: Remove session
    desktopPtyPersistence.removeSession(id);

    pty.kill();
    this.ptys.delete(id);
    return true;
  }

  list(): PtyProcess[] {
    return Array.from(this.ptys.entries()).map(([id, pty]) => ({
      id,
      pid: pty.pid,
      cols: pty.cols,
      rows: pty.rows,
      cwd: process.cwd(),
      sessionId: this.getSessionId(id)
    }));
  }

  dispose(): void {
    for (const [id] of this.ptys) {
      this.kill(id);
    }
  }

  /**
   * Get buffer from persistence (for session recovery)
   */
  getPersistedBuffer(id: string): string | null {
    return desktopPtyPersistence.loadBuffer(id);
  }

  /**
   * Get all persisted sessions (for recovery)
   */
  getPersistedSessions() {
    return desktopPtyPersistence.getAllSessions();
  }

  /**
   * Initialize persistence (call on startup)
   */
  initializePersistence() {
    return desktopPtyPersistence.initialize();
  }

  /**
   * Set Claude Mode for a PTY session
   * Creates/deletes a flag file that the kuro plugin hook checks
   */
  async setClaudeMode(sessionId: string, enabled: boolean): Promise<void> {
    const flagDir = path.join(process.cwd(), 'ai', '.claude_mode');
    const flagPath = path.join(flagDir, sessionId);

    console.log('[PTY] setClaudeMode:', { sessionId, enabled, flagPath });

    if (enabled) {
      await fs.mkdir(flagDir, { recursive: true });
      await fs.writeFile(flagPath, new Date().toISOString());
    } else {
      await fs.unlink(flagPath).catch(() => {}); // Ignore if doesn't exist
    }
  }
}
