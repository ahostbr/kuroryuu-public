/**
 * File Logger - Main Process
 * Logs stored in: ai/logs/main.log
 */

import * as fs from 'fs';
import * as path from 'path';

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

    // Flush buffer every 1 second
    this.flushInterval = setInterval(() => this.flush(), 1000);
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

  private flush() {
    if (this.buffer.length === 0) return;

    const logs = this.buffer.join('\n') + '\n';
    this.buffer = [];

    try {
      fs.appendFileSync(this.logPath, logs);
    } catch (err) {
      console.error('[MainFileLogger] Failed to write logs:', err);
    }
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
