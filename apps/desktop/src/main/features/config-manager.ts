/**
 * Config Manager
 * 
 * Handles configuration loading, saving, and validation for feature modules.
 * 
 * Requirements:
 * - 5.1: Load configuration from JSON file on startup
 * - 5.2: Persist changes to configuration file
 * - 5.3: Support capture presets with codec, resolution, fps, ffmpeg options
 * - 5.4: Support TTS backend selection and voice preferences
 * - 5.6: Create config with defaults if missing
 * - 5.7: Return error and use defaults if invalid
 * - 5.8: Platform-specific config location
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { FeatureResponse, FeatureErrorCode } from './base';

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Capture preset configuration
 */
export interface CapturePreset {
  key: string;
  name: string;
  description?: string;
  overrides: {
    mode: 'desktop' | 'primary' | 'window' | 'region';
    fps: number;
    pix_fmt: string;
    crf: number;
    x264_preset: string;
    resolution?: { width: number; height: number };
  };
}

/**
 * Capture feature configuration
 */
export interface CaptureConfig {
  enabled: boolean;
  defaultPreset: string;
  outputDir: string;
  screenshotFormat: 'png' | 'jpg';
  presets: CapturePreset[];
}

/**
 * Voice input configuration
 */
export interface VoiceInputConfig {
  enabled: boolean;
  timeout: number;
  maxPhraseLength: number;
  energyThreshold: number;
  pauseThreshold: number;
}

/**
 * TTS backend configuration
 */
export interface TTSBackendConfig {
  id: string;
  enabled: boolean;
  priority: number;
  options: Record<string, unknown>;
}

/**
 * TTS feature configuration
 */
export interface TTSConfig {
  enabled: boolean;
  defaultBackend: string;
  defaultVoice: string;
  rate: number;
  volume: number;
  backends: TTSBackendConfig[];
}

/**
 * Full feature configuration
 */
export interface FeatureConfig {
  version: number;
  capture: CaptureConfig;
  voiceInput: VoiceInputConfig;
  tts: TTSConfig;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CAPTURE_PRESETS: CapturePreset[] = [
  {
    key: 'p1',
    name: 'OPTIMAL_BALANCED_444',
    description: 'High quality with YUV444 for text clarity',
    overrides: {
      mode: 'desktop',
      fps: 1.0,
      pix_fmt: 'yuv444p',
      crf: 30,
      x264_preset: 'slow',
    },
  },
  {
    key: 'p2',
    name: 'CRISP_MAX_444',
    description: 'Maximum quality YUV444',
    overrides: {
      mode: 'desktop',
      fps: 1.0,
      pix_fmt: 'yuv444p',
      crf: 18,
      x264_preset: 'veryslow',
    },
  },
  {
    key: 'p3',
    name: 'BALANCED_420',
    description: 'Balanced quality and file size',
    overrides: {
      mode: 'primary',
      fps: 1.0,
      pix_fmt: 'yuv420p',
      crf: 23,
      x264_preset: 'medium',
    },
  },
  {
    key: 'p4',
    name: 'TINY_1080P',
    description: 'Small file size, 1080p max',
    overrides: {
      mode: 'primary',
      fps: 0.5,
      pix_fmt: 'yuv420p',
      crf: 35,
      x264_preset: 'fast',
      resolution: { width: 1920, height: 1080 },
    },
  },
  {
    key: 'p5',
    name: 'PRIMARY_ONLY',
    description: 'Primary display only',
    overrides: {
      mode: 'primary',
      fps: 1.0,
      pix_fmt: 'yuv420p',
      crf: 28,
      x264_preset: 'medium',
    },
  },
];

const DEFAULT_CONFIG: FeatureConfig = {
  version: 1,
  capture: {
    enabled: true,
    defaultPreset: 'p3',
    outputDir: '',  // Will be set to platform-specific default
    screenshotFormat: 'png',
    presets: DEFAULT_CAPTURE_PRESETS,
  },
  voiceInput: {
    enabled: true,
    timeout: 10,
    maxPhraseLength: 15,
    energyThreshold: 4000,
    pauseThreshold: 0.8,
  },
  tts: {
    enabled: true,
    defaultBackend: 'windows_sapi',
    defaultVoice: 'default',
    rate: 1.0,
    volume: 1.0,
    backends: [
      {
        id: 'windows_sapi',
        enabled: true,
        priority: 1,
        options: {},
      },
      {
        id: 'edge_tts',
        enabled: true,
        priority: 2,
        options: {
          voice: 'en-US-GuyNeural',
        },
      },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Config Manager
// ═══════════════════════════════════════════════════════════════════════════════

export class ConfigManager {
  private config: FeatureConfig;
  private configPath: string;
  private isDirty = false;
  
  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath();
    this.config = this.createDefaultConfig();
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Platform-Specific Paths (Req 5.8)
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get platform-specific config directory
   * Windows: %APPDATA%/Kuroryuu
   * Linux: ~/.config/kuroryuu
   * macOS: ~/Library/Application Support/Kuroryuu
   */
  private getDefaultConfigPath(): string {
    let configDir: string;
    
    if (typeof app !== 'undefined' && app.getPath) {
      // Running in Electron
      configDir = path.join(app.getPath('userData'), 'features');
    } else {
      // Running in Node (tests)
      const platform = process.platform;
      const home = process.env.HOME || process.env.USERPROFILE || '';
      
      switch (platform) {
        case 'win32':
          configDir = path.join(process.env.APPDATA || home, 'Kuroryuu', 'features');
          break;
        case 'darwin':
          configDir = path.join(home, 'Library', 'Application Support', 'Kuroryuu', 'features');
          break;
        default:
          configDir = path.join(home, '.config', 'kuroryuu', 'features');
      }
    }
    
    return path.join(configDir, 'config.json');
  }
  
  /**
   * Get platform-specific default output directory
   */
  private getDefaultOutputDir(): string {
    if (typeof app !== 'undefined' && app.getPath) {
      return path.join(app.getPath('documents'), 'Kuroryuu', 'captures');
    }
    
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, 'Kuroryuu', 'captures');
  }
  
  /**
   * Create default config with platform-specific paths
   */
  private createDefaultConfig(): FeatureConfig {
    const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as FeatureConfig;
    config.capture.outputDir = this.getDefaultOutputDir();
    return config;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Load/Save (Req 5.1, 5.2)
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Load configuration from file
   * Requirements: 5.1, 5.6, 5.7
   */
  async load(): Promise<FeatureResponse<FeatureConfig>> {
    try {
      // Check if file exists
      if (!fs.existsSync(this.configPath)) {
        console.log('[ConfigManager] Config file not found, creating defaults');
        this.config = this.createDefaultConfig();
        await this.save();
        return { ok: true, result: this.config };
      }
      
      // Read and parse file
      const content = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(content) as Partial<FeatureConfig>;
      
      // Validate and merge with defaults
      const validation = this.validate(parsed);
      if (!validation.ok) {
        console.warn('[ConfigManager] Invalid config, using defaults:', validation.error);
        this.config = this.createDefaultConfig();
        return {
          ok: false,
          error: validation.error,
          errorCode: FeatureErrorCode.CONFIG_INVALID,
        };
      }
      
      // Merge with defaults (in case new fields were added)
      this.config = this.mergeWithDefaults(parsed);
      console.log('[ConfigManager] Loaded config from', this.configPath);
      
      return { ok: true, result: this.config };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ConfigManager] Load error:', message);
      
      // Use defaults on error
      this.config = this.createDefaultConfig();
      
      return {
        ok: false,
        error: message,
        errorCode: FeatureErrorCode.CONFIG_LOAD_FAILED,
      };
    }
  }
  
  /**
   * Save configuration to file
   * Requirements: 5.2
   */
  async save(): Promise<FeatureResponse<void>> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write file
      const content = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(this.configPath, content, 'utf-8');
      
      this.isDirty = false;
      console.log('[ConfigManager] Saved config to', this.configPath);
      
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ConfigManager] Save error:', message);
      
      return {
        ok: false,
        error: message,
        errorCode: FeatureErrorCode.CONFIG_SAVE_FAILED,
      };
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Validate configuration
   */
  private validate(config: Partial<FeatureConfig>): FeatureResponse<void> {
    // Check version
    if (config.version !== undefined && typeof config.version !== 'number') {
      return { ok: false, error: 'Invalid version', errorCode: FeatureErrorCode.CONFIG_INVALID };
    }
    
    // Validate capture config
    if (config.capture) {
      const captureConfig = config.capture as unknown as Record<string, unknown>;
      if (captureConfig.timeout !== undefined) {
        const timeout = captureConfig.timeout;
        if (typeof timeout !== 'number' || timeout < 1 || timeout > 300) {
          return { ok: false, error: 'Invalid capture timeout', errorCode: FeatureErrorCode.CONFIG_INVALID };
        }
      }
    }
    
    // Validate voice input config
    if (config.voiceInput) {
      const vi = config.voiceInput;
      if (vi.timeout !== undefined && (vi.timeout < 1 || vi.timeout > 15)) {
        return { ok: false, error: 'Voice input timeout must be 1-15 seconds', errorCode: FeatureErrorCode.CONFIG_INVALID };
      }
    }
    
    // Validate TTS config
    if (config.tts) {
      const tts = config.tts;
      if (tts.rate !== undefined && (tts.rate < 0.1 || tts.rate > 3.0)) {
        return { ok: false, error: 'TTS rate must be 0.1-3.0', errorCode: FeatureErrorCode.CONFIG_INVALID };
      }
      if (tts.volume !== undefined && (tts.volume < 0 || tts.volume > 1.0)) {
        return { ok: false, error: 'TTS volume must be 0-1.0', errorCode: FeatureErrorCode.CONFIG_INVALID };
      }
    }
    
    return { ok: true };
  }
  
  /**
   * Merge partial config with defaults
   */
  private mergeWithDefaults(partial: Partial<FeatureConfig>): FeatureConfig {
    const defaults = this.createDefaultConfig();
    
    return {
      version: partial.version ?? defaults.version,
      capture: {
        ...defaults.capture,
        ...partial.capture,
        presets: partial.capture?.presets ?? defaults.capture.presets,
      },
      voiceInput: {
        ...defaults.voiceInput,
        ...partial.voiceInput,
      },
      tts: {
        ...defaults.tts,
        ...partial.tts,
        backends: partial.tts?.backends ?? defaults.tts.backends,
      },
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Getters/Setters
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get full configuration
   */
  getConfig(): FeatureConfig {
    return this.config;
  }
  
  /**
   * Get capture configuration
   */
  getCaptureConfig(): CaptureConfig {
    return this.config.capture;
  }
  
  /**
   * Get voice input configuration
   */
  getVoiceInputConfig(): VoiceInputConfig {
    return this.config.voiceInput;
  }
  
  /**
   * Get TTS configuration
   */
  getTTSConfig(): TTSConfig {
    return this.config.tts;
  }
  
  /**
   * Get capture preset by key
   */
  getCapturePreset(key: string): CapturePreset | undefined {
    return this.config.capture.presets.find(p => p.key === key);
  }
  
  /**
   * Update configuration section
   */
  async updateConfig<K extends keyof FeatureConfig>(
    section: K,
    updates: Partial<FeatureConfig[K]>
  ): Promise<FeatureResponse<void>> {
    (this.config[section] as any) = {
      ...(this.config[section] as any),
      ...updates,
    };
    this.isDirty = true;
    return this.save();
  }
  
  /**
   * Check if config has unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.isDirty;
  }
  
  /**
   * Get config file path
   */
  getConfigPath(): string {
    return this.configPath;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════════

let _instance: ConfigManager | null = null;

/**
 * Get the singleton Config Manager instance
 */
export function getConfigManager(configPath?: string): ConfigManager {
  if (!_instance) {
    _instance = new ConfigManager(configPath);
  }
  return _instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetConfigManager(): void {
  _instance = null;
}
