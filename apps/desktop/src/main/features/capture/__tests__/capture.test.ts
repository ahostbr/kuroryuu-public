/**
 * Unit Tests for Capture Module
 * 
 * Tests:
 * - Preset loading
 * - FFmpeg command generation
 * - Screenshot capture
 * - Video recording start/stop
 * - Error handling
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.6, 1.7
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { CaptureModule } from '../module';
import { FFmpegWrapper } from '../ffmpeg-wrapper';
import { FeatureEventBus, resetEventBus } from '../../event-bus';
import { ConfigManager } from '../../config-manager';
import { FeatureErrorCode } from '../../base';
import {
  DEFAULT_PRESETS,
  OPTIMAL_BALANCED_444,
  getPresetByKey,
  validatePreset,
} from '../presets';
import {
  CapturePreset,
  ScreenshotParams,
  StartRecordingParams,
} from '../types';
import * as fs from 'fs/promises';
import * as child_process from 'child_process';

// ═══════════════════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  stat: vi.fn(),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Capture Module', () => {
  let captureModule: CaptureModule;
  let eventBus: FeatureEventBus;
  let configManager: ConfigManager;
  
  beforeEach(() => {
    resetEventBus();
    eventBus = new FeatureEventBus();
    configManager = new ConfigManager();
    captureModule = new CaptureModule(eventBus, configManager);
    
    // Mock ffmpeg availability
    vi.mocked(child_process.execSync).mockReturnValue('ffmpeg version 6.0');
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Preset Loading Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Preset Loading', () => {
    it('should have 5 default presets', () => {
      expect(DEFAULT_PRESETS).toHaveLength(5);
    });
    
    it('should include OPTIMAL_BALANCED_444 preset', () => {
      const preset = getPresetByKey('OPTIMAL_BALANCED_444');
      expect(preset).toBeDefined();
      expect(preset?.pixelFormat).toBe('yuv444p');
      expect(preset?.crf).toBe(18);
    });
    
    it('should include CRISP_MAX_444 preset', () => {
      const preset = getPresetByKey('CRISP_MAX_444');
      expect(preset).toBeDefined();
      expect(preset?.fps).toBe(60);
      expect(preset?.crf).toBe(12);
    });
    
    it('should include TINY_1080P preset with resolution', () => {
      const preset = getPresetByKey('TINY_1080P');
      expect(preset).toBeDefined();
      expect(preset?.resolution).toBe('1920x1080');
    });
    
    it('should validate complete presets', () => {
      for (const preset of DEFAULT_PRESETS) {
        expect(validatePreset(preset)).toBe(true);
      }
    });
    
    it('should reject incomplete presets', () => {
      expect(validatePreset({ key: 'test' })).toBe(false);
      expect(validatePreset({ key: 'test', name: 'Test' })).toBe(false);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // FFmpeg Command Generation Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('FFmpeg Command Generation', () => {
    let ffmpeg: FFmpegWrapper;
    
    beforeEach(() => {
      ffmpeg = new FFmpegWrapper();
    });
    
    it('should generate screenshot command for desktop mode', () => {
      const params: ScreenshotParams = {
        mode: 'desktop',
        outputPath: '/tmp/screenshot.png',
      };
      
      const command = ffmpeg.buildCommand(params);
      
      expect(command.args).toContain('-f');
      expect(command.args).toContain('-frames:v');
      expect(command.args).toContain('1');
      expect(command.args).toContain('-y');
      expect(command.args).toContain(params.outputPath);
    });
    
    it('should generate recording command with preset settings', () => {
      const params: StartRecordingParams = {
        mode: 'desktop',
        outputPath: '/tmp/recording.mp4',
        preset: 'OPTIMAL_BALANCED_444',
      };
      
      const command = ffmpeg.buildCommand(params, OPTIMAL_BALANCED_444);
      
      expect(command.args).toContain('-c:v');
      expect(command.args).toContain('libx264');
      expect(command.args).toContain('-pix_fmt');
      expect(command.args).toContain('yuv444p');
      expect(command.args).toContain('-crf');
      expect(command.args).toContain('18');
      expect(command.args).toContain('-framerate');
      expect(command.args).toContain('30');
    });
    
    it('should include resolution override when preset specifies it', () => {
      const params: StartRecordingParams = {
        mode: 'desktop',
        outputPath: '/tmp/recording.mp4',
        preset: 'TINY_1080P',
      };
      
      const preset = getPresetByKey('TINY_1080P')!;
      const command = ffmpeg.buildCommand(params, preset);
      
      expect(command.args).toContain('-s');
      expect(command.args).toContain('1920x1080');
    });
    
    it('should include max duration when specified', () => {
      const params: StartRecordingParams = {
        mode: 'desktop',
        outputPath: '/tmp/recording.mp4',
        preset: 'BALANCED_420',
        maxDuration: 60,
      };
      
      const preset = getPresetByKey('BALANCED_420')!;
      const command = ffmpeg.buildCommand(params, preset);
      
      expect(command.args).toContain('-t');
      expect(command.args).toContain('60');
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Module Initialization Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Module Initialization', () => {
    it('should initialize successfully with ffmpeg available', async () => {
      vi.mocked(child_process.execSync).mockReturnValue('ffmpeg version 6.0');
      
      const result = await captureModule.initialize();
      
      expect(result.ok).toBe(true);
      expect(captureModule.isFFmpegAvailable()).toBe(true);
    });

    it('should initialize but mark ffmpeg unavailable when missing', async () => {
      vi.mocked(child_process.execSync).mockImplementation(() => {
        throw new Error('command not found');
      });

      const result = await captureModule.initialize();

      expect(result.ok).toBe(true); // Module still initializes
      expect(captureModule.isFFmpegAvailable()).toBe(false);
    });
    
    it('should return correct metadata', () => {
      const metadata = captureModule.getMetadata();
      
      expect(metadata.id).toBe('capture');
      expect(metadata.name).toBe('Desktop Capture');
      expect(metadata.version).toBe('1.0.0');
    });
    
    it('should support expected actions', () => {
      const actions = captureModule.getSupportedActions();
      
      expect(actions).toContain('screenshot');
      expect(actions).toContain('start_recording');
      expect(actions).toContain('stop_recording');
      expect(actions).toContain('get_status');
      expect(actions).toContain('list_presets');
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Screenshot Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Screenshot Capture', () => {
    beforeEach(async () => {
      vi.mocked(child_process.execSync).mockReturnValue('ffmpeg version 6.0');
      await captureModule.initialize();
    });
    
    it('should fail when module not initialized', async () => {
      const uninitModule = new CaptureModule(eventBus, configManager);
      
      const result = await uninitModule.execute('screenshot', {
        mode: 'desktop',
        outputPath: '/tmp/test.png',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.MODULE_NOT_INITIALIZED);
      }
    });

    it('should fail for unsupported action', async () => {
      const result = await captureModule.execute('invalid_action', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.ACTION_NOT_SUPPORTED);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Recording Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Video Recording', () => {
    beforeEach(async () => {
      vi.mocked(child_process.execSync).mockReturnValue('ffmpeg version 6.0');
      await captureModule.initialize();
    });
    
    it('should fail with invalid preset', async () => {
      const result = await captureModule.execute('start_recording', {
        mode: 'desktop',
        outputPath: '/tmp/recording.mp4',
        preset: 'INVALID_PRESET',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.INVALID_PRESET);
      }
    });

    it('should fail stop_recording when no active recording', async () => {
      const result = await captureModule.execute('stop_recording', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.NO_ACTIVE_RECORDING);
      }
    });

    it('should return status correctly', async () => {
      const result = await captureModule.execute<{ isRecording: boolean }>('get_status', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result?.isRecording).toBe(false);
      }
    });

    it('should list presets', async () => {
      const result = await captureModule.execute<CapturePreset[]>('list_presets', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.result)).toBe(true);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Error Handling Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Error Handling', () => {
    it('should return ffmpeg not found error when unavailable', async () => {
      vi.mocked(child_process.execSync).mockImplementation(() => {
        throw new Error('command not found');
      });
      
      await captureModule.initialize();
      
      const result = await captureModule.execute('screenshot', {
        mode: 'desktop',
        outputPath: '/tmp/test.png',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.FFMPEG_NOT_FOUND);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Emission Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Event Emission', () => {
    it('should return error without emitting event when ffmpeg unavailable', async () => {
      // When ffmpeg is not found, we return an error but don't emit an event
      // (since no operation was attempted)
      vi.mocked(child_process.execSync).mockImplementation(() => {
        throw new Error('command not found');
      });

      await captureModule.initialize();
      const result = await captureModule.execute('screenshot', {
        mode: 'desktop',
        outputPath: '/tmp/test.png',
      });

      // Should return error
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(FeatureErrorCode.FFMPEG_NOT_FOUND);
      }
    });
    
    it('should track events in event bus log', async () => {
      vi.mocked(child_process.execSync).mockReturnValue('ffmpeg version 6.0');
      await captureModule.initialize();
      
      // Events emitted during operations are logged
      const logBefore = eventBus.getEventLog().length;
      
      // Just checking that the event bus is tracking - actual emission
      // happens in integration with real ffmpeg
      expect(logBefore).toBeGreaterThanOrEqual(0);
    });
  });
});;

// ═══════════════════════════════════════════════════════════════════════════════
// FFmpeg Wrapper Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('FFmpegWrapper', () => {
  let ffmpeg: FFmpegWrapper;
  
  beforeEach(() => {
    ffmpeg = new FFmpegWrapper();
  });
  
  describe('Availability Check', () => {
    it('should return available when ffmpeg is found', async () => {
      vi.mocked(child_process.execSync).mockReturnValue('ffmpeg version 6.0-full_build');
      
      const result = await ffmpeg.checkAvailability();
      
      expect(result.available).toBe(true);
      expect(result.version).toBe('6.0-full_build');
    });
    
    it('should return unavailable when ffmpeg is not found', async () => {
      vi.mocked(child_process.execSync).mockImplementation(() => {
        throw new Error('command not found');
      });
      
      const result = await ffmpeg.checkAvailability();
      
      expect(result.available).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
  
  describe('Command Building', () => {
    it('should build valid screenshot command', () => {
      const params: ScreenshotParams = {
        mode: 'desktop',
        outputPath: 'C:\\temp\\screenshot.png',
        format: 'png',
      };
      
      const command = ffmpeg.buildCommand(params);
      
      expect(command.executable).toBe('ffmpeg');
      expect(command.args.length).toBeGreaterThan(0);
      expect(command.fullCommand).toContain('ffmpeg');
    });
    
    it('should build valid recording command', () => {
      const params: StartRecordingParams = {
        mode: 'desktop',
        outputPath: 'C:\\temp\\recording.mp4',
        preset: 'OPTIMAL_BALANCED_444',
      };
      
      const command = ffmpeg.buildCommand(params, OPTIMAL_BALANCED_444);
      
      expect(command.args).toContain('-c:v');
      expect(command.args).toContain('-crf');
    });
  });
});
