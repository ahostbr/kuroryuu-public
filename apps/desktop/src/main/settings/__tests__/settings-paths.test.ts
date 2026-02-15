/**
 * Unit Tests for Settings Service - Path Consistency
 *
 * Tests:
 * - get() and set() use same path resolution
 * - Settings round-trip integrity
 * - Default value fallback
 * - Schema validation against actual usage
 *
 * Requirements: HIGH PRIORITY - ensures settings paths are consistent
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsService } from '../settings-service';
import { DEFAULT_USER_SETTINGS, DEFAULT_PROJECT_SETTINGS } from '../schemas';

// ═══════════════════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  app: {
    getPath: vi.fn(() => '/mock/home'),
  },
}));

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data: any = {};
      public path = '/mock/store/path/settings.json';

      constructor(options?: any) {
        if (options?.defaults) {
          this.data = { ...options.defaults };
        }
      }

      get store() {
        return this.data;
      }

      set store(value: any) {
        this.data = { ...value };
      }
    },
  };
});

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  mkdirSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => '{}'),
  writeFile: vi.fn(),
  readdir: vi.fn(async () => []),
  copyFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
  stat: vi.fn(async () => ({ size: 1024, mtimeMs: Date.now() })),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('SettingsService - Path Consistency', () => {
  let service: SettingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SettingsService();
    service.setProjectPath('/mock/project');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Path Consistency Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Path Resolution Consistency', () => {
    it('should use same path for get() and set() on ui.checkUpdatesOnStartup', () => {
      // This is the critical path used by updater.ts
      service.set('ui.checkUpdatesOnStartup', false);
      const value = service.get('ui.checkUpdatesOnStartup');

      expect(value).toBe(false);
    });

    it('should use same path for get() and set() on ui.devMode', () => {
      service.set('ui.devMode', true);
      const value = service.get('ui.devMode');

      expect(value).toBe(true);
    });

    it('should use same path for get() and set() on audio.tts.enabled', () => {
      service.set('audio.tts.enabled', true);
      const value = service.get('audio.tts.enabled');

      expect(value).toBe(true);
    });

    it('should use same path for get() and set() on terminal.fontSize', () => {
      service.set('terminal.fontSize', 16);
      const value = service.get('terminal.fontSize');

      expect(value).toBe(16);
    });

    it('should use same path for nested layout settings', () => {
      service.set('ui.layout.gridLayout', '3x3');
      const value = service.get('ui.layout.gridLayout');

      expect(value).toBe('3x3');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Round-Trip Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Settings Round-Trip', () => {
    it('should round-trip boolean values correctly', () => {
      const testCases = [
        'ui.enableAnimations',
        'ui.showWelcomeOnStartup',
        'audio.mic.silenceThreshold',
        'graphiti.enabled',
      ];

      for (const path of testCases) {
        service.set(path, true);
        expect(service.get(path)).toBe(true);

        service.set(path, false);
        expect(service.get(path)).toBe(false);
      }
    });

    it('should round-trip number values correctly', () => {
      const testCases: [string, number][] = [
        ['ui.uiScale', 1.5],
        ['terminal.fontSize', 18],
        ['audio.mic.silenceTimeoutMs', 2000],
        ['audio.tts.rate', 1.2],
      ];

      for (const [path, value] of testCases) {
        service.set(path, value);
        expect(service.get(path)).toBe(value);
      }
    });

    it('should round-trip string values correctly', () => {
      const testCases: [string, string][] = [
        ['ui.theme', 'oscura-midnight'],
        ['ui.language', 'ja'],
        ['terminal.font', 'fira-code'],
        ['audio.tts.voice', 'en-US-Standard-A'],
        ['audio.mic.sttEngine', 'google'],
      ];

      for (const [path, value] of testCases) {
        service.set(path, value);
        expect(service.get(path)).toBe(value);
      }
    });

    it('should round-trip object values correctly', () => {
      const layoutConfig = {
        gridLayout: '2x2',
        layoutMode: 'splitter',
      };

      service.set('ui.layout', layoutConfig);
      const retrieved = service.get('ui.layout');

      expect(retrieved).toEqual(layoutConfig);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Default Value Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Default Values', () => {
    it('should return defaults for unset user-scoped keys', () => {
      // Don't set anything, just get defaults
      expect(service.get('ui.theme')).toBe(DEFAULT_USER_SETTINGS.ui.theme);
      expect(service.get('ui.uiScale')).toBe(DEFAULT_USER_SETTINGS.ui.uiScale);
      expect(service.get('ui.checkUpdatesOnStartup')).toBe(
        DEFAULT_USER_SETTINGS.ui.checkUpdatesOnStartup
      );
      expect(service.get('terminal.fontSize')).toBe(DEFAULT_USER_SETTINGS.terminal.fontSize);
    });

    it('should return defaults for unset project-scoped keys', () => {
      expect(service.get('audio.mic.silenceThreshold')).toBe(
        DEFAULT_PROJECT_SETTINGS.audio.mic.silenceThreshold
      );
      expect(service.get('audio.tts.enabled')).toBe(DEFAULT_PROJECT_SETTINGS.audio.tts.enabled);
      expect(service.get('graphiti.enabled')).toBe(DEFAULT_PROJECT_SETTINGS.graphiti.enabled);
      expect(service.get('audio.mic.sttEngine')).toBe(
        DEFAULT_PROJECT_SETTINGS.audio.mic.sttEngine
      );
    });

    it('should return undefined for non-existent keys', () => {
      const result = service.get('nonexistent.key.path');
      expect(result).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Schema Validation Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Schema Validation', () => {
    it('should validate all ui.* keys match schema', () => {
      const uiKeys = [
        'ui.theme',
        'ui.uiScale',
        'ui.language',
        'ui.enableAnimations',
        'ui.matrixRainOpacity',
        'ui.showWelcomeOnStartup',
        'ui.checkUpdatesOnStartup',
        'ui.enableRichToolVisualizations',
        'ui.devMode',
        'ui.layout.gridLayout',
        'ui.layout.layoutMode',
      ];

      for (const key of uiKeys) {
        const value = service.get(key);
        expect(value).toBeDefined();
      }
    });

    it('should validate all audio.* keys match schema', () => {
      const audioKeys = [
        'audio.mic.silenceThreshold',
        'audio.mic.voiceThreshold',
        'audio.mic.silenceTimeoutMs',
        'audio.mic.sttEngine',
        'audio.tts.enabled',
        'audio.tts.voice',
        'audio.tts.rate',
        'audio.tts.volume',
        'audio.tts.backend',
      ];

      for (const key of audioKeys) {
        const value = service.get(key);
        expect(value).toBeDefined();
      }
    });

    it('should validate all terminal.* keys match schema', () => {
      const terminalKeys = ['terminal.font', 'terminal.fontSize'];

      for (const key of terminalKeys) {
        const value = service.get(key);
        expect(value).toBeDefined();
      }
    });

    it('should validate all graphiti.* keys match schema', () => {
      const graphitiKeys = ['graphiti.enabled', 'graphiti.serverUrl', 'graphiti.autoSync'];

      for (const key of graphitiKeys) {
        const value = service.get(key);
        expect(value).toBeDefined();
      }
    });

    it('should validate scope resolution matches usage', () => {
      // User-scoped (should resolve to userStore)
      const userKeys = ['ui.theme', 'ui.devMode', 'terminal.fontSize'];
      for (const key of userKeys) {
        service.set(key, 'test-value');
        const value = service.get(key);
        expect(value).toBe('test-value');
      }

      // Project-scoped (should resolve to projectStore)
      const projectKeys = ['audio.tts.enabled', 'graphiti.enabled'];
      for (const key of projectKeys) {
        service.set(key, true);
        const value = service.get(key);
        expect(value).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Update Method Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Update Method', () => {
    it('should merge partial updates correctly', () => {
      // Set initial layout
      service.set('ui.layout', {
        gridLayout: '2x2',
        layoutMode: 'grid',
      });

      // Update just gridLayout
      service.update('ui.layout', {
        gridLayout: '3x3',
      });

      const layout = service.get('ui.layout') as any;
      expect(layout.gridLayout).toBe('3x3');
      expect(layout.layoutMode).toBe('grid'); // Should preserve
    });

    it('should handle nested object updates', () => {
      service.set('audio.mic', {
        silenceThreshold: 0.1,
        voiceThreshold: 0.2,
        silenceTimeoutMs: 1000,
        sttEngine: 'whisper',
      });

      service.update('audio.mic', {
        silenceThreshold: 0.15,
      });

      const mic = service.get('audio.mic') as any;
      expect(mic.silenceThreshold).toBe(0.15);
      expect(mic.voiceThreshold).toBe(0.2); // Preserved
      expect(mic.sttEngine).toBe('whisper'); // Preserved
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Reset Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Reset Functionality', () => {
    it('should reset individual keys to defaults', () => {
      service.set('ui.theme', 'custom-theme');
      expect(service.get('ui.theme')).toBe('custom-theme');

      service.reset('ui.theme');
      expect(service.get('ui.theme')).toBe(DEFAULT_USER_SETTINGS.ui.theme);
    });

    it('should reset all user settings to defaults', () => {
      service.set('ui.theme', 'custom');
      service.set('ui.uiScale', 2.0);
      service.set('terminal.fontSize', 20);

      service.resetAll('user');

      expect(service.get('ui.theme')).toBe(DEFAULT_USER_SETTINGS.ui.theme);
      expect(service.get('ui.uiScale')).toBe(DEFAULT_USER_SETTINGS.ui.uiScale);
      expect(service.get('terminal.fontSize')).toBe(DEFAULT_USER_SETTINGS.terminal.fontSize);
    });

    it('should reset all project settings to defaults', () => {
      service.set('audio.tts.enabled', true);
      service.set('graphiti.enabled', true);

      service.resetAll('project');

      expect(service.get('audio.tts.enabled')).toBe(DEFAULT_PROJECT_SETTINGS.audio.tts.enabled);
      expect(service.get('graphiti.enabled')).toBe(DEFAULT_PROJECT_SETTINGS.graphiti.enabled);
    });
  });
});
