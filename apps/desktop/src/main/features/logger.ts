/**
 * Feature Logger
 * 
 * Structured logging for feature modules with:
 * - Console output in development
 * - File logging in production
 * - Log rotation
 * - Error context preservation
 * 
 * Requirements: 7.3, 7.4, 7.5, 7.7
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  error?: {
    code?: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  /** Minimum log level to output */
  minLevel: LogLevel;
  /** Enable console output */
  console: boolean;
  /** Enable file output */
  file: boolean;
  /** Log file directory */
  logDir: string;
  /** Max log file size in bytes (default: 10MB) */
  maxFileSize: number;
  /** Max number of rotated files to keep */
  maxFiles: number;
  /** Format: 'json' or 'text' */
  format: 'json' | 'text';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'info',
  console: true,
  file: false,
  logDir: './logs',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  format: 'json',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Logger Class
// ═══════════════════════════════════════════════════════════════════════════════

export class FeatureLogger {
  private config: LoggerConfig;
  private module: string;
  private currentLogFile: string | null = null;
  private writeStream: fs.WriteStream | null = null;
  
  constructor(module: string, config: Partial<LoggerConfig> = {}) {
    this.module = module;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.file) {
      this.initFileLogging();
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Logging Methods
  // ─────────────────────────────────────────────────────────────────────────────
  
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }
  
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }
  
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }
  
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorInfo = this.extractErrorInfo(error);
    this.log('error', message, { ...data, ...errorInfo });
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Core Logging
  // ─────────────────────────────────────────────────────────────────────────────
  
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    // Check level threshold
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.minLevel]) {
      return;
    }
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      message,
      data,
    };
    
    // Console output
    if (this.config.console) {
      this.writeToConsole(entry);
    }
    
    // File output
    if (this.config.file && this.writeStream) {
      this.writeToFile(entry);
    }
  }
  
  private writeToConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}]`;
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    const fullMessage = `${prefix} ${entry.message}${dataStr}`;
    
    switch (entry.level) {
      case 'debug':
        console.debug(fullMessage);
        break;
      case 'info':
        console.info(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'error':
        console.error(fullMessage);
        break;
    }
  }
  
  private writeToFile(entry: LogEntry): void {
    if (!this.writeStream) return;
    
    const line = this.config.format === 'json'
      ? JSON.stringify(entry) + '\n'
      : this.formatTextEntry(entry) + '\n';
    
    this.writeStream.write(line);
    
    // Check rotation
    this.checkRotation();
  }
  
  private formatTextEntry(entry: LogEntry): string {
    let line = `${entry.timestamp} [${entry.level.toUpperCase().padEnd(5)}] [${entry.module}] ${entry.message}`;
    if (entry.data) {
      line += ` | ${JSON.stringify(entry.data)}`;
    }
    return line;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // File Management
  // ─────────────────────────────────────────────────────────────────────────────
  
  private initFileLogging(): void {
    try {
      // Ensure log directory exists
      if (!fs.existsSync(this.config.logDir)) {
        fs.mkdirSync(this.config.logDir, { recursive: true });
      }
      
      // Create log file name
      const date = new Date().toISOString().split('T')[0];
      this.currentLogFile = path.join(this.config.logDir, `features-${date}.log`);
      
      // Open write stream
      this.writeStream = fs.createWriteStream(this.currentLogFile, { flags: 'a' });
      
      this.writeStream.on('error', (err) => {
        console.error(`[FeatureLogger] File write error: ${err.message}`);
        this.writeStream = null;
      });
    } catch (error) {
      console.error(`[FeatureLogger] Failed to init file logging: ${error}`);
    }
  }
  
  private checkRotation(): void {
    if (!this.currentLogFile) return;
    
    try {
      const stats = fs.statSync(this.currentLogFile);
      if (stats.size >= this.config.maxFileSize) {
        this.rotateLog();
      }
    } catch {
      // File doesn't exist or can't be read
    }
  }
  
  private rotateLog(): void {
    if (!this.currentLogFile) return;
    
    // Close current stream
    this.writeStream?.end();
    
    // Rename current file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedPath = this.currentLogFile.replace('.log', `-${timestamp}.log`);
    
    try {
      fs.renameSync(this.currentLogFile, rotatedPath);
    } catch (error) {
      console.error(`[FeatureLogger] Failed to rotate log: ${error}`);
    }
    
    // Clean up old files
    this.cleanupOldLogs();
    
    // Reinitialize
    this.initFileLogging();
  }
  
  private cleanupOldLogs(): void {
    try {
      const files = fs.readdirSync(this.config.logDir)
        .filter(f => f.startsWith('features-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.config.logDir, f),
          mtime: fs.statSync(path.join(this.config.logDir, f)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      
      // Remove excess files
      while (files.length > this.config.maxFiles) {
        const oldest = files.pop();
        if (oldest) {
          fs.unlinkSync(oldest.path);
        }
      }
    } catch (error) {
      console.error(`[FeatureLogger] Failed to cleanup logs: ${error}`);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Error Extraction
  // ─────────────────────────────────────────────────────────────────────────────
  
  private extractErrorInfo(error: unknown): { error?: LogEntry['error'] } {
    if (!error) return {};
    
    if (error instanceof Error) {
      return {
        error: {
          message: error.message,
          stack: error.stack,
        },
      };
    }
    
    if (typeof error === 'object' && 'code' in error && 'message' in error) {
      const e = error as { code?: string; message: string; stack?: string };
      return {
        error: {
          code: e.code,
          message: e.message,
          stack: e.stack,
        },
      };
    }
    
    return {
      error: {
        message: String(error),
      },
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────────
  
  close(): void {
    this.writeStream?.end();
    this.writeStream = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Logger Factory
// ═══════════════════════════════════════════════════════════════════════════════

const loggers = new Map<string, FeatureLogger>();

/**
 * Get or create a logger for a module
 */
export function getLogger(module: string, config?: Partial<LoggerConfig>): FeatureLogger {
  const key = `${module}:${JSON.stringify(config || {})}`;
  
  if (!loggers.has(key)) {
    loggers.set(key, new FeatureLogger(module, config));
  }
  
  return loggers.get(key)!;
}

/**
 * Close all loggers (for graceful shutdown)
 */
export function closeAllLoggers(): void {
  for (const logger of loggers.values()) {
    logger.close();
  }
  loggers.clear();
}

export default {
  FeatureLogger,
  getLogger,
  closeAllLoggers,
};
