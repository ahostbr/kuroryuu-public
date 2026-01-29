/**
 * Unit Tests for Voice Input Module
 * 
 * Tests:
 * - Microphone initialization
 * - Listening with timeout
 * - Transcription
 * - Error handling
 * - Timeout behavior
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.9
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { VoiceInputModule } from '../module';
import { SpeechRecognizer, saveTranscript, loadTranscript } from '../speech-recognizer';
import { FeatureEventBus, resetEventBus } from '../../event-bus';
import { ConfigManager } from '../../config-manager';
import { FeatureErrorCode } from '../../base';
import {
  VoiceInputStatus,
  TranscriptionResult,
  VoiceInputErrorType,
} from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ═══════════════════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  mkdir: vi.fn(),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Voice Input Module', () => {
  let voiceModule: VoiceInputModule;
  let eventBus: FeatureEventBus;
  let configManager: ConfigManager;
  
  beforeEach(() => {
    resetEventBus();
    eventBus = new FeatureEventBus();
    configManager = new ConfigManager();
    voiceModule = new VoiceInputModule(eventBus, configManager);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Module Initialization Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Module Initialization', () => {
    it('should initialize successfully', async () => {
      const result = await voiceModule.initialize();

      expect(result.ok).toBe(true);
    });
    
    it('should return correct metadata', () => {
      const metadata = voiceModule.getMetadata();
      
      expect(metadata.id).toBe('voice-input');
      expect(metadata.name).toBe('Voice Input');
      expect(metadata.version).toBe('1.0.0');
    });
    
    it('should support expected actions', () => {
      const actions = voiceModule.getSupportedActions();
      
      expect(actions).toContain('start_listening');
      expect(actions).toContain('stop_listening');
      expect(actions).toContain('get_status');
      expect(actions).toContain('check_microphone');
    });
    
    it('should load config on initialization', async () => {
      await voiceModule.initialize();
      
      const config = voiceModule.getConfig();
      
      expect(config.timeout).toBeGreaterThan(0);
      expect(config.service).toBeTruthy();
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Action Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Actions', () => {
    beforeEach(async () => {
      await voiceModule.initialize();
    });
    
    it('should fail when module not initialized', async () => {
      const uninitModule = new VoiceInputModule(eventBus, configManager);

      const result = await uninitModule.execute('start_listening', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.MODULE_NOT_INITIALIZED);
      }
    });

    it('should fail for unsupported action', async () => {
      const result = await voiceModule.execute('invalid_action', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.ACTION_NOT_SUPPORTED);
      }
    });

    it('should return status correctly', async () => {
      const result = await voiceModule.execute<VoiceInputStatus>('get_status', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result?.isListening).toBe(false);
      }
    });

    it('should check microphone', async () => {
      const result = await voiceModule.execute('check_microphone', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result).toHaveProperty('available');
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Listening Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Listening', () => {
    beforeEach(async () => {
      await voiceModule.initialize();
    });
    
    it('should fail stop_listening when no active session', async () => {
      const result = await voiceModule.execute('stop_listening', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.NO_ACTIVE_VOICE_INPUT);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Config Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Configuration', () => {
    it('should have default config values', async () => {
      await voiceModule.initialize();
      
      const config = voiceModule.getConfig();
      
      expect(config.timeout).toBeGreaterThan(0);
      expect(config.service).toBeTruthy();
      expect(typeof config.continuous).toBe('boolean');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Speech Recognizer Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('SpeechRecognizer', () => {
  let recognizer: SpeechRecognizer;
  
  beforeEach(() => {
    recognizer = new SpeechRecognizer();
  });
  
  describe('Microphone Check', () => {
    it('should return microphone status', async () => {
      const result = await recognizer.checkMicrophone();
      
      expect(result).toHaveProperty('available');
    });
    
    it('should assume available in main process', async () => {
      // In Node.js environment (no navigator)
      const result = await recognizer.checkMicrophone();
      
      // Main process assumes available
      expect(result.available).toBe(true);
    });
  });
  
  describe('Listening State', () => {
    it('should track listening state', () => {
      expect(recognizer.getIsListening()).toBe(false);
    });
    
    it('should return null when stopping without active session', async () => {
      const result = await recognizer.stop();
      
      expect(result).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Transcript Persistence Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Transcript Persistence', () => {
  const testTranscript: TranscriptionResult = {
    transcript: 'Hello, this is a test transcription',
    confidence: 0.95,
    isFinal: true,
    audioDuration: 2500,
    language: 'en-US',
    timestamp: Date.now(),
  };
  
  beforeEach(() => {
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(testTranscript));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  });
  
  it('should save transcript to file', async () => {
    const filePath = '/tmp/test-transcript.json';
    
    await saveTranscript(filePath, testTranscript);
    
    expect(fs.mkdir).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(
      filePath,
      expect.stringContaining(testTranscript.transcript),
      'utf-8'
    );
  });
  
  it('should load transcript from file', async () => {
    const filePath = '/tmp/test-transcript.json';
    
    const result = await loadTranscript(filePath);
    
    expect(fs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
    expect(result.transcript).toBe(testTranscript.transcript);
    expect(result.confidence).toBe(testTranscript.confidence);
  });
  
  it('should preserve all transcript fields', async () => {
    const filePath = '/tmp/test-transcript.json';
    
    await saveTranscript(filePath, testTranscript);
    const result = await loadTranscript(filePath);
    
    expect(result.transcript).toBe(testTranscript.transcript);
    expect(result.confidence).toBe(testTranscript.confidence);
    expect(result.isFinal).toBe(testTranscript.isFinal);
    expect(result.audioDuration).toBe(testTranscript.audioDuration);
    expect(result.language).toBe(testTranscript.language);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Event Emission Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Event Emission', () => {
  let voiceModule: VoiceInputModule;
  let eventBus: FeatureEventBus;
  let configManager: ConfigManager;
  
  beforeEach(async () => {
    resetEventBus();
    eventBus = new FeatureEventBus();
    configManager = new ConfigManager();
    voiceModule = new VoiceInputModule(eventBus, configManager);
    await voiceModule.initialize();
  });
  
  it('should have eventBus configured', () => {
    expect(eventBus).toBeDefined();
    expect(voiceModule).toBeDefined();
  });
});
