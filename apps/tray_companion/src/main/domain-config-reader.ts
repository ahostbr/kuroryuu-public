/**
 * Domain Config Reader
 *
 * Reads domain configuration from shared JSON file exported by Desktop app.
 * Watches for changes and emits events when config updates.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// Types matching Desktop domain-config types
export type LLMProvider = 'lmstudio' | 'claude' | 'cliproxyapi' | 'gateway-auto';

export interface DomainConfig {
  provider: LLMProvider;
  modelId: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  thinkingLevel?: 'none' | 'basic' | 'deep';
}

export interface DomainConfigFile {
  version: number;
  lastUpdated: string;
  configs: Record<string, DomainConfig>;
}

/**
 * Domain Config Reader
 * Reads and watches the shared domain config file for changes.
 */
export class DomainConfigReader extends EventEmitter {
  private configPath: string;
  private watcher: fs.FSWatcher | null = null;
  private currentConfig: DomainConfigFile | null = null;
  private debounceTimeout: NodeJS.Timeout | null = null;

  constructor() {
    super();
    // Get Kuroryuu root using portable detection
    const kuroryuuRoot = this.getKuroryuuRoot();
    this.configPath = path.join(kuroryuuRoot, 'ai', 'config', 'domain-config.json');
    console.log('[DomainConfigReader] Config path:', this.configPath);
  }

  /**
   * Get Kuroryuu project root using portable detection.
   * Priority: env var -> marker file detection -> cwd
   */
  private getKuroryuuRoot(): string {
    // 1. Check environment variables
    if (process.env.KURORYUU_PROJECT_ROOT) {
      return process.env.KURORYUU_PROJECT_ROOT;
    }
    if (process.env.KURORYUU_ROOT) {
      return process.env.KURORYUU_ROOT;
    }

    // 2. Walk up from __dirname looking for marker file
    let current = __dirname;
    for (let i = 0; i < 10; i++) {
      const marker = path.join(current, 'KURORYUU_BOOTSTRAP.md');
      if (fs.existsSync(marker)) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    // 3. Fallback to cwd
    console.warn('[DomainConfigReader] Could not find project root, using cwd');
    return process.cwd();
  }

  /**
   * Load the config file synchronously
   */
  load(): DomainConfigFile | null {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        this.currentConfig = JSON.parse(data);
        console.log('[DomainConfigReader] Loaded config from file, version:', this.currentConfig?.version);
        return this.currentConfig;
      } else {
        console.log('[DomainConfigReader] Config file does not exist:', this.configPath);
      }
    } catch (error) {
      console.warn('[DomainConfigReader] Failed to load config:', error);
    }
    return null;
  }

  /**
   * Start watching the config file for changes
   */
  watch(): void {
    if (this.watcher) {
      console.log('[DomainConfigReader] Already watching');
      return;
    }

    // First ensure the directory exists for watching
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      try {
        fs.mkdirSync(configDir, { recursive: true });
        console.log('[DomainConfigReader] Created config directory:', configDir);
      } catch (error) {
        console.warn('[DomainConfigReader] Could not create config directory:', error);
        return;
      }
    }

    try {
      // Watch the directory instead of the file (handles file creation)
      this.watcher = fs.watch(configDir, (_eventType, filename) => {
        if (filename === 'domain-config.json') {
          // Debounce rapid changes
          if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
          }
          this.debounceTimeout = setTimeout(() => {
            console.log('[DomainConfigReader] Config file changed, reloading...');
            const newConfig = this.load();
            if (newConfig) {
              this.emit('change', newConfig);
            }
          }, 100); // 100ms debounce
        }
      });
      console.log('[DomainConfigReader] Watching directory:', configDir);
    } catch (error) {
      console.warn('[DomainConfigReader] Cannot watch config directory:', error);
    }
  }

  /**
   * Get config for a specific domain
   */
  getConfigForDomain(domain: string): DomainConfig | null {
    return this.currentConfig?.configs[domain] || null;
  }

  /**
   * Get the voice domain config (primary domain for Tray Companion)
   */
  getVoiceConfig(): DomainConfig | null {
    return this.getConfigForDomain('voice');
  }

  /**
   * Get current config
   */
  getConfig(): DomainConfigFile | null {
    return this.currentConfig;
  }

  /**
   * Check if config file exists
   */
  hasConfig(): boolean {
    return this.currentConfig !== null;
  }

  /**
   * Stop watching the config file
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('[DomainConfigReader] Stopped watching');
    }
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
  }
}

// Singleton instance
let instance: DomainConfigReader | null = null;

/**
 * Get the singleton DomainConfigReader instance
 */
export function getDomainConfigReader(): DomainConfigReader {
  if (!instance) {
    instance = new DomainConfigReader();
  }
  return instance;
}
