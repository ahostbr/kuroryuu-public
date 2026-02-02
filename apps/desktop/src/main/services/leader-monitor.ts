/**
 * Leader Monitor Service
 *
 * Monitors the leader terminal (Ralph) for inactivity and nudges
 * to continue working. Desktop watches leader → nudges on silence.
 *
 * Key responsibilities:
 * - Track leader terminal activity (last output timestamp)
 * - Detect inactivity (configurable timeout)
 * - Inject nudge messages to leader PTY on inactivity
 * - Provide status via IPC for renderer/UI
 * - Emit events for monitoring modal
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface LeaderMonitorConfig {
  /** Inactivity timeout before nudging (ms). Default 5 minutes. */
  inactivityTimeoutMs?: number;
  /** How often to check activity (ms). Default 10 seconds. */
  checkIntervalMs?: number;
  /** Max nudges before alerting human. Default 3. */
  maxNudgesBeforeAlert?: number;
  /** MCP Core URL for optional reporting. */
  mcpCoreUrl?: string;
  /** Desktop secret for authenticated requests. */
  desktopSecret?: string;
  /** Enable verbose logging. */
  enableLogging?: boolean;
}

export interface LeaderMonitorStatus {
  /** Whether monitoring is active. */
  isMonitoring: boolean;
  /** Leader terminal ID if set. */
  leaderTerminalId: string | null;
  /** Current status: 'active' | 'idle' | 'nudged' | 'not_monitoring'. */
  status: 'active' | 'idle' | 'nudged' | 'not_monitoring';
  /** Timestamp of last leader output. */
  lastActivityMs: number | null;
  /** Time since last activity (ms). */
  idleDurationMs: number | null;
  /** Timestamp of last nudge sent. */
  lastNudgeMs: number | null;
  /** Total nudges this session. */
  nudgeCount: number;
}

export interface NudgeEvent {
  /** Timestamp when nudge was sent. */
  timestamp: number;
  /** Nudge message sent to leader. */
  message: string;
  /** Idle duration that triggered the nudge. */
  idleDurationMs: number;
}

// -----------------------------------------------------------------------------
// LeaderMonitor Class
// -----------------------------------------------------------------------------

export class LeaderMonitor extends EventEmitter {
  private config: Required<LeaderMonitorConfig>;
  private leaderTerminalId: string | null = null;
  private lastActivityMs: number | null = null;
  private lastNudgeMs: number | null = null;
  private nudgeCount = 0;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private isMonitoring = false;

  // Callback for writing to leader PTY (can be sync or async)
  private writeToLeader: ((data: string) => boolean | Promise<unknown>) | null = null;

  // Reference to main window for IPC sends
  private mainWindow: BrowserWindow | null = null;

  constructor(config: LeaderMonitorConfig = {}) {
    super();
    this.config = {
      inactivityTimeoutMs: config.inactivityTimeoutMs ?? 300000, // 5 minutes
      checkIntervalMs: config.checkIntervalMs ?? 10000, // 10 seconds
      maxNudgesBeforeAlert: config.maxNudgesBeforeAlert ?? 3,
      mcpCoreUrl: config.mcpCoreUrl ?? 'http://127.0.0.1:8100',
      desktopSecret: config.desktopSecret ?? '',
      enableLogging: config.enableLogging ?? true,
    };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  setWriteCallback(callback: (data: string) => boolean | Promise<unknown>): void {
    this.writeToLeader = callback;
  }

  updateConfig(config: Partial<LeaderMonitorConfig>): void {
    Object.assign(this.config, config);
    this.log('Config updated:', this.config);
  }

  // ---------------------------------------------------------------------------
  // Leader Terminal Tracking
  // ---------------------------------------------------------------------------

  setLeaderTerminalId(id: string | null): void {
    this.leaderTerminalId = id;
    if (id) {
      this.lastActivityMs = Date.now();
      this.nudgeCount = 0;
      this.lastNudgeMs = null;
      this.log(`Leader terminal set: ${id}`);
    } else {
      this.log('Leader terminal cleared');
    }
    this.emitStatusUpdate();
  }

  getLeaderTerminalId(): string | null {
    return this.leaderTerminalId;
  }

  // ---------------------------------------------------------------------------
  // Activity Tracking
  // ---------------------------------------------------------------------------

  /**
   * Call this when leader terminal produces output.
   * Resets the inactivity timer.
   */
  recordActivity(): void {
    this.lastActivityMs = Date.now();
    this.emitStatusUpdate();
  }

  /**
   * Get current idle duration in milliseconds.
   */
  getIdleDurationMs(): number {
    if (!this.lastActivityMs) return 0;
    return Date.now() - this.lastActivityMs;
  }

  // ---------------------------------------------------------------------------
  // Monitoring Control
  // ---------------------------------------------------------------------------

  startMonitoring(): void {
    if (this.isMonitoring) {
      this.log('Already monitoring');
      return;
    }

    if (!this.leaderTerminalId) {
      this.log('Cannot start monitoring: no leader terminal set');
      return;
    }

    this.isMonitoring = true;
    this.lastActivityMs = Date.now();
    this.nudgeCount = 0;

    this.checkInterval = setInterval(() => {
      this.checkActivity();
    }, this.config.checkIntervalMs);

    this.log('Monitoring started');
    this.emitStatusUpdate();
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) {
      this.log('Not monitoring');
      return;
    }

    this.isMonitoring = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.log('Monitoring stopped');
    this.emitStatusUpdate();
  }

  // ---------------------------------------------------------------------------
  // Activity Check & Nudging
  // ---------------------------------------------------------------------------

  private checkActivity(): void {
    if (!this.isMonitoring || !this.leaderTerminalId) return;

    const idleDurationMs = this.getIdleDurationMs();

    if (idleDurationMs >= this.config.inactivityTimeoutMs) {
      this.log(`Leader idle for ${Math.round(idleDurationMs / 1000)}s, sending nudge`);
      this.sendNudge(idleDurationMs);
    }
  }

  private sendNudge(idleDurationMs: number): void {
    if (!this.writeToLeader) {
      this.log('Cannot nudge: no write callback set');
      return;
    }

    this.nudgeCount++;
    this.lastNudgeMs = Date.now();

    const idleSec = Math.round(idleDurationMs / 1000);
    // NOTE: \r at end is required to press Enter and submit the message to Claude
    const nudgeMessage = `NUDGE: Leader inactive for ${idleSec}s - continue monitoring worker\r`;

    const success = this.writeToLeader(nudgeMessage);

    const nudgeEvent: NudgeEvent = {
      timestamp: this.lastNudgeMs,
      message: nudgeMessage.trim(),
      idleDurationMs,
    };

    this.emit('nudge', nudgeEvent);
    this.log(`Nudge #${this.nudgeCount} sent (success: ${success})`);

    // Send to renderer for UI update
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('leader-monitor:nudge', nudgeEvent);
    }

    // Check if we've exceeded max nudges
    if (this.nudgeCount >= this.config.maxNudgesBeforeAlert) {
      this.alertHuman();
    }

    // Reset activity timer after nudge (give leader time to respond)
    this.lastActivityMs = Date.now();
    this.emitStatusUpdate();
  }

  private alertHuman(): void {
    this.log(`Max nudges (${this.config.maxNudgesBeforeAlert}) exceeded, alerting human`);

    this.emit('alert', {
      type: 'max_nudges_exceeded',
      nudgeCount: this.nudgeCount,
      message: 'Leader unresponsive after multiple nudges',
    });

    // Send to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('leader-monitor:alert', {
        type: 'max_nudges_exceeded',
        nudgeCount: this.nudgeCount,
        message: 'Leader unresponsive after multiple nudges. Please check the terminal.',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  getStatus(): LeaderMonitorStatus {
    let status: LeaderMonitorStatus['status'] = 'not_monitoring';

    if (this.isMonitoring && this.leaderTerminalId) {
      const idleDurationMs = this.getIdleDurationMs();
      if (this.lastNudgeMs && Date.now() - this.lastNudgeMs < 60000) {
        status = 'nudged';
      } else if (idleDurationMs > this.config.inactivityTimeoutMs * 0.8) {
        status = 'idle';
      } else {
        status = 'active';
      }
    }

    return {
      isMonitoring: this.isMonitoring,
      leaderTerminalId: this.leaderTerminalId,
      status,
      lastActivityMs: this.lastActivityMs,
      idleDurationMs: this.lastActivityMs ? Date.now() - this.lastActivityMs : null,
      lastNudgeMs: this.lastNudgeMs,
      nudgeCount: this.nudgeCount,
    };
  }

  private emitStatusUpdate(): void {
    const status = this.getStatus();
    this.emit('status', status);

    // Send to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('leader-monitor:status', status);
    }
  }

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  private log(...args: unknown[]): void {
    if (this.config.enableLogging) {
      console.log('[LeaderMonitor]', ...args);
    }
  }
}

// -----------------------------------------------------------------------------
// Singleton Instance
// -----------------------------------------------------------------------------

let leaderMonitorInstance: LeaderMonitor | null = null;

export function getLeaderMonitor(): LeaderMonitor {
  if (!leaderMonitorInstance) {
    leaderMonitorInstance = new LeaderMonitor();
  }
  return leaderMonitorInstance;
}

// -----------------------------------------------------------------------------
// Configuration Function
// -----------------------------------------------------------------------------

export function configureLeaderMonitor(config: LeaderMonitorConfig): void {
  const monitor = getLeaderMonitor();
  monitor.updateConfig(config);
}

// -----------------------------------------------------------------------------
// IPC Setup
// -----------------------------------------------------------------------------

export function setupLeaderMonitorIpc(): void {
  const monitor = getLeaderMonitor();

  // Get current status
  ipcMain.handle(
    'leader-monitor:getStatus',
    async (_event: IpcMainInvokeEvent): Promise<{ ok: true; data: LeaderMonitorStatus }> => {
      const status = monitor.getStatus();
      return { ok: true, data: status };
    }
  );

  // Start monitoring
  ipcMain.handle(
    'leader-monitor:start',
    async (_event: IpcMainInvokeEvent): Promise<{ ok: boolean; error?: string }> => {
      try {
        monitor.startMonitoring();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  );

  // Stop monitoring
  ipcMain.handle(
    'leader-monitor:stop',
    async (_event: IpcMainInvokeEvent): Promise<{ ok: boolean; error?: string }> => {
      try {
        monitor.stopMonitoring();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  );

  // Update config
  ipcMain.handle(
    'leader-monitor:updateConfig',
    async (
      _event: IpcMainInvokeEvent,
      config: Partial<LeaderMonitorConfig>
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        monitor.updateConfig(config);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  );

  // Record activity (called when leader terminal outputs)
  ipcMain.handle(
    'leader-monitor:recordActivity',
    async (_event: IpcMainInvokeEvent): Promise<{ ok: true }> => {
      monitor.recordActivity();
      return { ok: true };
    }
  );

  // Reset nudge count
  ipcMain.handle(
    'leader-monitor:resetNudgeCount',
    async (_event: IpcMainInvokeEvent): Promise<{ ok: true }> => {
      // Access private property via any for reset
      (monitor as unknown as { nudgeCount: number }).nudgeCount = 0;
      return { ok: true };
    }
  );

  console.log('[LeaderMonitor] IPC handlers registered');
}

// Types are already exported above with their interface declarations
