import { watch, FSWatcher } from 'chokidar';
import { BrowserWindow } from 'electron';

/**
 * File watcher service for monitoring file changes.
 * Notifies renderer process when watched files change.
 */
class FileWatcherService {
  private watchers = new Map<string, FSWatcher>();
  private mainWindow: BrowserWindow | null = null;
  
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }
  
  watch(path: string): void {
    if (this.watchers.has(path)) return;
    
    console.log('[FileWatcher] Watching:', path);
    
    const watcher = watch(path, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });
    
    watcher.on('change', () => {
      console.log('[FileWatcher] File changed:', path);
      try {
        if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents && !this.mainWindow.webContents.isDestroyed()) {
          this.mainWindow.webContents.send('file:changed', path);
        }
      } catch (err) {
        // Window was destroyed
      }
    });
    
    watcher.on('error', (err) => {
      console.error('[FileWatcher] Error:', err);
    });
    
    this.watchers.set(path, watcher);
  }
  
  unwatch(path: string): void {
    const watcher = this.watchers.get(path);
    if (watcher) {
      console.log('[FileWatcher] Unwatching:', path);
      watcher.close();
      this.watchers.delete(path);
    }
  }
  
  dispose(): void {
    for (const [path] of this.watchers) {
      this.unwatch(path);
    }
  }
}

export const fileWatcher = new FileWatcherService();
