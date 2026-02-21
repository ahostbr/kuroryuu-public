/**
 * Unit Tests for TTS Module
 * 
 * Tests:
 * - Initialization
 * - Speech synthesis
 * - Control operations (stop, pause, resume)
 * - Voice management
 * - Status reporting
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TTSModule } from '../module';
import { TTSEngine } from '../tts-engine';
import { FeatureEventBus, resetEventBus } from '../../event-bus';
import { ConfigManager } from '../../config-manager';
import { FeatureErrorCode } from '../../base';
import { TTSStatus, VoiceInfo } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('TTS Module', () => {
  let eventBus: FeatureEventBus;
  let configManager: ConfigManager;
  
  beforeEach(() => {
    resetEventBus();
    eventBus = new FeatureEventBus();
    configManager = new ConfigManager();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Module Initialization Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Module Initialization', () => {
    it('should initialize successfully', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      const result = await ttsModule.initialize();
      
      expect(result.ok).toBe(true);
    });
    
    it('should return correct metadata', () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      const metadata = ttsModule.getMetadata();
      
      expect(metadata.id).toBe('tts');
      expect(metadata.name).toBe('Text-to-Speech');
      expect(metadata.version).toBe('1.0.0');
    });
    
    it('should support expected actions', () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      const actions = ttsModule.getSupportedActions();
      
      expect(actions).toContain('speak');
      expect(actions).toContain('stop');
      expect(actions).toContain('pause');
      expect(actions).toContain('resume');
      expect(actions).toContain('get_status');
      expect(actions).toContain('list_voices');
      expect(actions).toContain('set_voice');
    });
    
    it('should load config on initialization', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      await ttsModule.initialize();
      
      const config = ttsModule.getConfig();
      
      expect(config.rate).toBeGreaterThan(0);
      expect(config.volume).toBeGreaterThan(0);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Action Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Actions', () => {
    it('should fail when module not initialized', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      
      const result = await ttsModule.execute('speak', { text: 'Hello' });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.MODULE_NOT_INITIALIZED);
      }
    });

    it('should fail for unsupported action', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      await ttsModule.initialize();

      const result = await ttsModule.execute('invalid_action', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.ACTION_NOT_SUPPORTED);
      }
    });
    
    it('should return status correctly', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      await ttsModule.initialize();
      
      const result = await ttsModule.execute<TTSStatus>('get_status', {});
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result).toHaveProperty('isSpeaking');
        expect(result.result).toHaveProperty('isPaused');
        expect(result.result).toHaveProperty('engineAvailable');
      }
    });
    
    it('should list voices', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      await ttsModule.initialize();
      
      const result = await ttsModule.execute<VoiceInfo[]>('list_voices', {});
      
      expect(result.ok).toBe(true);
      if (result.ok && result.result) {
        expect(Array.isArray(result.result)).toBe(true);
        expect(result.result.length).toBeGreaterThan(0);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Speech Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Speech', () => {
    it('should fail speak with empty text', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      await ttsModule.initialize();
      
      const result = await ttsModule.execute('speak', { text: '' });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.INVALID_PARAMS);
      }
    });
    
    it('should fail speak with text too long', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      await ttsModule.initialize();
      
      const longText = 'a'.repeat(6000);
      const result = await ttsModule.execute('speak', { text: longText });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.INVALID_PARAMS);
      }
    });
    
    it('should fail stop when no active speech', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      await ttsModule.initialize();
      
      const result = await ttsModule.execute('stop', {});
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.TTS_NO_ACTIVE_SPEECH);
      }
    });
    
    it('should fail pause when no active speech', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      await ttsModule.initialize();
      
      const result = await ttsModule.execute('pause', {});
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.TTS_NO_ACTIVE_SPEECH);
      }
    });
    
    it('should fail resume when not paused', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      await ttsModule.initialize();
      
      const result = await ttsModule.execute('resume', {});
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.INVALID_ACTION);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Voice Management Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Voice Management', () => {
    it('should fail set_voice with empty voice', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      await ttsModule.initialize();
      
      const result = await ttsModule.execute('set_voice', { voice: '' });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.INVALID_PARAMS);
      }
    });
    
    it('should fail set_voice with unknown voice', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      await ttsModule.initialize();
      
      const result = await ttsModule.execute('set_voice', { voice: 'unknown-voice-xyz' });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.INVALID_PARAMS);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Config Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Configuration', () => {
    it('should have default config values', async () => {
      const ttsModule = new TTSModule(eventBus, configManager);
      await ttsModule.initialize();
      
      const config = ttsModule.getConfig();
      
      expect(config.service).toBe('native');
      expect(config.rate).toBe(1.0);
      expect(config.pitch).toBe(1.0);
      expect(config.volume).toBe(1.0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TTS Engine Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('TTSEngine', () => {
  let engine: TTSEngine;
  
  beforeEach(() => {
    engine = new TTSEngine();
  });
  
  describe('Availability', () => {
    it('should report availability', () => {
      const available = engine.isAvailable();
      
      // In Node.js, should use simulated mode
      expect(available).toBe(true);
    });
  });
  
  describe('Voices', () => {
    it('should return voices', () => {
      const voices = engine.getVoices();
      
      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
    });
    
    it('should have voice properties', () => {
      const voices = engine.getVoices();
      const voice = voices[0];
      
      expect(voice).toHaveProperty('id');
      expect(voice).toHaveProperty('name');
      expect(voice).toHaveProperty('language');
      expect(voice).toHaveProperty('isLocal');
    });
  });
  
  describe('State', () => {
    it('should track speaking state', () => {
      expect(engine.getIsSpeaking()).toBe(false);
    });
    
    it('should track paused state', () => {
      expect(engine.getIsPaused()).toBe(false);
    });
  });
  
  describe('Stop', () => {
    it('should stop successfully', () => {
      const result = engine.stop();
      
      expect(result).toBe(true);
    });
  });
});
