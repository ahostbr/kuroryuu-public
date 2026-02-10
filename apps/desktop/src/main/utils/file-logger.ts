/**
 * File Logger - Main Process
 * Logs stored in: ai/logs/main.log
 * Rotation: renames to .log.old at 5MB
 */

import * as fs from 'fs';
import * as path from 'path';

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

class MainFileLogger {
  private logPath: string;
  private buffer: string[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    const projectRoot = process.env.KURORYUU_ROOT || process.env.KURORYUU_PROJECT_ROOT || process.cwd();
    const logsDir = path.join(projectRoot, 'ai', 'logs');

    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    this.logPath = path.join(logsDir, 'main.log');

    // Flush buffer every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  private formatMessage(level: string, component: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] [${component}] ${message}${dataStr}`;
  }

  log(component: string, message: string, data?: any) {
    const formatted = this.formatMessage('INFO', component, message, data);
    console.log(formatted);
    this.buffer.push(formatted);
  }

  error(component: string, message: string, error?: any) {
    const formatted = this.formatMessage('ERROR', component, message, error);
    console.error(formatted);
    this.buffer.push(formatted);
  }

  warn(component: string, message: string, data?: any) {
    const formatted = this.formatMessage('WARN', component, message, data);
    console.warn(formatted);
    this.buffer.push(formatted);
  }

  private rotate() {
    try {
      const stats = fs.statSync(this.logPath);
      if (stats.size >= MAX_LOG_SIZE) {
        const oldPath = this.logPath + '.old';
        // Remove previous .old if exists, then rename current
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        fs.renameSync(this.logPath, oldPath);
      }
    } catch {
      // File doesn't exist yet or can't stat — nothing to rotate
    }
  }

  private flush() {
    if (this.buffer.length === 0) return;

    const logs = this.buffer.join('\n') + '\n';
    this.buffer = [];

    this.rotate();

    fs.appendFile(this.logPath, logs, (err) => {
      if (err) {
        console.error('[MainFileLogger] Failed to write logs:', err);
      }
    });
  }

  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}

export const mainLogger = new MainFileLogger();
