/**
 * File Logger - Writes logs to disk via IPC
 * Logs stored in: ai/logs/renderer.log
 */

class FileLogger {
  private buffer: string[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Flush buffer every 1 second
    this.flushInterval = setInterval(() => this.flush(), 1000);

    // Flush on page unload
    window.addEventListener('beforeunload', () => this.flush());
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

    // Write to disk via IPC
    if (window.electronAPI?.fs?.appendFile) {
      window.electronAPI.fs.appendFile('ai/logs/renderer.log', logs).catch((err: Error) => {
        console.error('[FileLogger] Failed to write logs:', err);
      });
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

export const fileLogger = new FileLogger();
