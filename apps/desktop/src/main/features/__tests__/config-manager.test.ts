/**
 * Unit Tests for Config Manager
 * 
 * Tests:
 * - JSON loading and saving
 * - Platform-specific paths
 * - Validation and defaults
 * - Round-trip persistence
 * 
 * Requirements: 5.1, 5.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ConfigManager,
  FeatureConfig,
  CaptureConfig,
  VoiceInputConfig,
  TTSConfig,
  resetConfigManager,
} from '../config-manager';
import { FeatureErrorCode } from '../base';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Utilities
// ═══════════════════════════════════════════════════════════════════════════════

const TEST_CONFIG_DIR = path.join(os.tmpdir(), 'kuroryuu-config-test');
const TEST_CONFIG_PATH = path.join(TEST_CONFIG_DIR, 'config.json');

function cleanupTestDir() {
  if (fs.existsSync(TEST_CONFIG_DIR)) {
    fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  }
}

function writeTestConfig(config: Partial<FeatureConfig>) {
  if (!fs.existsSync(TEST_CONFIG_DIR)) {
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigManager', () => {
  let manager: ConfigManager;
  
  beforeEach(() => {
    cleanupTestDir();
    resetConfigManager();
    manager = new ConfigManager(TEST_CONFIG_PATH);
  });
  
  afterEach(() => {
    cleanupTestDir();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Load Tests (Req 5.1)
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Load Configuration', () => {
    it('should create default config if file does not exist', async () => {
      const result = await manager.load();
      
      expect(result.ok).toBe(true);
      expect(fs.existsSync(TEST_CONFIG_PATH)).toBe(true);
      
      const config = manager.getConfig();
      expect(config.version).toBe(1);
      expect(config.capture).toBeDefined();
      expect(config.voiceInput).toBeDefined();
      expect(config.tts).toBeDefined();
    });
    
    it('should load existing config file', async () => {
      const testConfig: Partial<FeatureConfig> = {
        version: 1,
        capture: {
          enabled: true,
          defaultPreset: 'p1',
          outputDir: '/custom/path',
          screenshotFormat: 'jpg',
          presets: [],
        },
        voiceInput: {
          enabled: false,
          timeout: 5,
          maxPhraseLength: 10,
          energyThreshold: 3000,
          pauseThreshold: 0.5,
        },
        tts: {
          enabled: true,
          defaultBackend: 'edge_tts',
          defaultVoice: 'custom',
          rate: 1.5,
          volume: 0.8,
          backends: [],
        },
      };
      
      writeTestConfig(testConfig);
      
      const result = await manager.load();
      
      expect(result.ok).toBe(true);
      
      const config = manager.getConfig();
      expect(config.capture.defaultPreset).toBe('p1');
      expect(config.capture.outputDir).toBe('/custom/path');
      expect(config.voiceInput.timeout).toBe(5);
      expect(config.tts.defaultBackend).toBe('edge_tts');
    });
    
    it('should merge loaded config with defaults for missing fields', async () => {
      // Partial config missing some fields
      writeTestConfig({
        version: 1,
        capture: {
          enabled: true,
          defaultPreset: 'custom',
          // Missing other fields
        } as any,
      });
      
      const result = await manager.load();
      
      expect(result.ok).toBe(true);
      
      const config = manager.getConfig();
      // Should have merged with defaults
      expect(config.capture.screenshotFormat).toBe('png'); // Default
      expect(config.voiceInput.timeout).toBe(10); // Default
      expect(config.tts.rate).toBe(1.0); // Default
    });
    
    it('should return error for invalid JSON', async () => {
      fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
      fs.writeFileSync(TEST_CONFIG_PATH, 'not valid json {{{');
      
      const result = await manager.load();
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.CONFIG_LOAD_FAILED);
      }
      
      // Should use defaults
      const config = manager.getConfig();
      expect(config.version).toBe(1);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Save Tests (Req 5.2)
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Save Configuration', () => {
    it('should save config to file', async () => {
      await manager.load();
      
      const result = await manager.save();
      
      expect(result.ok).toBe(true);
      expect(fs.existsSync(TEST_CONFIG_PATH)).toBe(true);
      
      // Verify content
      const content = fs.readFileSync(TEST_CONFIG_PATH, 'utf-8');
      const saved = JSON.parse(content);
      expect(saved.version).toBe(1);
    });
    
    it('should create directory if it does not exist', async () => {
      // Use a nested path
      const nestedPath = path.join(TEST_CONFIG_DIR, 'nested', 'dir', 'config.json');
      manager = new ConfigManager(nestedPath);
      
      await manager.load();
      const result = await manager.save();
      
      expect(result.ok).toBe(true);
      expect(fs.existsSync(nestedPath)).toBe(true);
    });
    
    it('should persist changes after updateConfig', async () => {
      await manager.load();
      
      await manager.updateConfig('voiceInput', { timeout: 8 });
      
      // Create new manager to verify persistence
      const newManager = new ConfigManager(TEST_CONFIG_PATH);
      await newManager.load();
      
      expect(newManager.getVoiceInputConfig().timeout).toBe(8);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Validation Tests (Req 5.7)
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Configuration Validation', () => {
    it('should reject invalid voice input timeout', async () => {
      writeTestConfig({
        version: 1,
        voiceInput: {
          timeout: 100, // Invalid: max is 15
        } as any,
      });
      
      const result = await manager.load();
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.CONFIG_INVALID);
      }
    });
    
    it('should reject invalid TTS rate', async () => {
      writeTestConfig({
        version: 1,
        tts: {
          rate: 10.0, // Invalid: max is 3.0
        } as any,
      });
      
      const result = await manager.load();
      
      expect(result.ok).toBe(false);
    });
    
    it('should reject invalid TTS volume', async () => {
      writeTestConfig({
        version: 1,
        tts: {
          volume: 2.0, // Invalid: max is 1.0
        } as any,
      });
      
      const result = await manager.load();
      
      expect(result.ok).toBe(false);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Getter Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Configuration Getters', () => {
    beforeEach(async () => {
      await manager.load();
    });
    
    it('should return capture config', () => {
      const capture = manager.getCaptureConfig();
      
      expect(capture).toBeDefined();
      expect(capture.enabled).toBe(true);
      expect(capture.presets).toBeDefined();
      expect(capture.presets.length).toBeGreaterThan(0);
    });
    
    it('should return voice input config', () => {
      const voice = manager.getVoiceInputConfig();
      
      expect(voice).toBeDefined();
      expect(voice.timeout).toBe(10);
      expect(voice.energyThreshold).toBe(4000);
    });
    
    it('should return TTS config', () => {
      const tts = manager.getTTSConfig();
      
      expect(tts).toBeDefined();
      expect(tts.defaultBackend).toBe('windows_sapi');
      expect(tts.backends.length).toBeGreaterThan(0);
    });
    
    it('should get capture preset by key', () => {
      const preset = manager.getCapturePreset('p1');
      
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('OPTIMAL_BALANCED_444');
      expect(preset?.overrides.pix_fmt).toBe('yuv444p');
    });
    
    it('should return undefined for unknown preset', () => {
      const preset = manager.getCapturePreset('unknown');
      expect(preset).toBeUndefined();
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Round-Trip Tests (Property 5)
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Configuration Round-Trip', () => {
    it('should preserve all config fields through save/load cycle', async () => {
      // Load defaults
      await manager.load();
      
      // Modify config
      await manager.updateConfig('capture', { defaultPreset: 'p2' });
      await manager.updateConfig('voiceInput', { timeout: 12 });
      await manager.updateConfig('tts', { rate: 1.2 });
      
      // Create new manager and load
      const newManager = new ConfigManager(TEST_CONFIG_PATH);
      await newManager.load();
      
      // Verify all changes persisted
      expect(newManager.getCaptureConfig().defaultPreset).toBe('p2');
      expect(newManager.getVoiceInputConfig().timeout).toBe(12);
      expect(newManager.getTTSConfig().rate).toBe(1.2);
    });
    
    it('should preserve preset arrays through round-trip', async () => {
      await manager.load();
      
      const originalPresets = manager.getCaptureConfig().presets;
      
      // Save and reload
      await manager.save();
      const newManager = new ConfigManager(TEST_CONFIG_PATH);
      await newManager.load();
      
      const loadedPresets = newManager.getCaptureConfig().presets;
      
      expect(loadedPresets.length).toBe(originalPresets.length);
      expect(loadedPresets[0].key).toBe(originalPresets[0].key);
      expect(loadedPresets[0].overrides).toEqual(originalPresets[0].overrides);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Default Presets Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Default Presets', () => {
    beforeEach(async () => {
      await manager.load();
    });
    
    it('should include all 5 default capture presets', () => {
      const presets = manager.getCaptureConfig().presets;
      
      expect(presets.length).toBe(5);
      expect(presets.map(p => p.key)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    });
    
    it('should have valid preset configurations', () => {
      const presets = manager.getCaptureConfig().presets;
      
      for (const preset of presets) {
        expect(preset.key).toBeDefined();
        expect(preset.name).toBeDefined();
        expect(preset.overrides).toBeDefined();
        expect(preset.overrides.mode).toMatch(/^(desktop|primary|window|region)$/);
        expect(preset.overrides.fps).toBeGreaterThan(0);
        expect(preset.overrides.crf).toBeGreaterThanOrEqual(0);
      }
    });
    
    it('should include OPTIMAL_BALANCED_444 preset with yuv444p', () => {
      const preset = manager.getCapturePreset('p1');
      
      expect(preset?.name).toBe('OPTIMAL_BALANCED_444');
      expect(preset?.overrides.pix_fmt).toBe('yuv444p');
    });
    
    it('should include TINY_1080P preset with resolution override', () => {
      const preset = manager.getCapturePreset('p4');
      
      expect(preset?.name).toBe('TINY_1080P');
      expect(preset?.overrides.resolution).toBeDefined();
      expect(preset?.overrides.resolution?.width).toBe(1920);
      expect(preset?.overrides.resolution?.height).toBe(1080);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Dirty State Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Dirty State Tracking', () => {
    it('should track unsaved changes', async () => {
      await manager.load();
      
      expect(manager.hasUnsavedChanges()).toBe(false);
      
      // Modify without saving
      (manager as any).config.voiceInput.timeout = 99;
      (manager as any).isDirty = true;
      
      expect(manager.hasUnsavedChanges()).toBe(true);
    });
    
    it('should clear dirty flag after save', async () => {
      await manager.load();
      
      await manager.updateConfig('voiceInput', { timeout: 8 });
      
      expect(manager.hasUnsavedChanges()).toBe(false); // updateConfig saves
    });
  });
});
