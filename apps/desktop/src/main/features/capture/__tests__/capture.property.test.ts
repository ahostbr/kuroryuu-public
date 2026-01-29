/**
 * Property Tests for Capture Module
 * 
 * Property-based tests to verify invariants:
 * - Preset application generates correct ffmpeg commands
 * - All preset fields are preserved in command generation
 * 
 * Requirements: 1.6
 */

import { describe, it, expect } from 'vitest';
import { FFmpegWrapper } from '../ffmpeg-wrapper';
import {
  CapturePreset,
  StartRecordingParams,
  VideoCodec,
  PixelFormat,
} from '../types';
import { DEFAULT_PRESETS, validatePreset } from '../presets';

// ═══════════════════════════════════════════════════════════════════════════════
// Property Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property: Capture Preset Application', () => {
  const ffmpeg = new FFmpegWrapper();
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property 1: All preset fields appear in generated command
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property 1: Preset fields appear in ffmpeg command', () => {
    it.each(DEFAULT_PRESETS)(
      'should include all fields from $key preset in command',
      (preset) => {
        const params: StartRecordingParams = {
          mode: 'desktop',
          outputPath: '/tmp/test.mp4',
          preset: preset.key,
        };
        
        const command = ffmpeg.buildCommand(params, preset);
        const argsString = command.args.join(' ');
        
        // Codec must be in command
        expect(argsString).toContain(preset.codec);
        
        // Pixel format must be in command
        expect(argsString).toContain(preset.pixelFormat);
        
        // CRF must be in command
        expect(argsString).toContain(String(preset.crf));
        
        // FPS must be in command
        expect(argsString).toContain(String(preset.fps));
        
        // Resolution if specified
        if (preset.resolution) {
          expect(argsString).toContain(preset.resolution);
        }
      }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property 2: Random preset generation produces valid commands
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property 2: Random presets generate valid commands', () => {
    const codecs: VideoCodec[] = ['libx264', 'libx265', 'h264_nvenc', 'hevc_nvenc'];
    const pixelFormats: PixelFormat[] = ['yuv444p', 'yuv420p', 'nv12'];
    
    // Generate random presets for testing
    const randomPresets: CapturePreset[] = [];
    
    for (let i = 0; i < 10; i++) {
      randomPresets.push({
        key: `RANDOM_${i}`,
        name: `Random Preset ${i}`,
        description: 'Randomly generated preset for testing',
        fps: Math.floor(Math.random() * 60) + 1, // 1-60 fps
        codec: codecs[Math.floor(Math.random() * codecs.length)],
        pixelFormat: pixelFormats[Math.floor(Math.random() * pixelFormats.length)],
        crf: Math.floor(Math.random() * 51), // 0-50 crf
        resolution: Math.random() > 0.5 ? '1920x1080' : undefined,
      });
    }
    
    it.each(randomPresets)(
      'should generate valid command for random preset $key',
      (preset) => {
        const params: StartRecordingParams = {
          mode: 'desktop',
          outputPath: '/tmp/test.mp4',
          preset: preset.key,
        };
        
        const command = ffmpeg.buildCommand(params, preset);
        
        // Command should have executable
        expect(command.executable).toBe('ffmpeg');
        
        // Command should have args array
        expect(Array.isArray(command.args)).toBe(true);
        expect(command.args.length).toBeGreaterThan(5);
        
        // Full command should be non-empty string
        expect(command.fullCommand).toBeTruthy();
        expect(command.fullCommand.length).toBeGreaterThan(10);
        
        // Args should contain output path
        expect(command.args).toContain(params.outputPath);
        
        // Args should contain -y (overwrite)
        expect(command.args).toContain('-y');
      }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property 3: Preset validation is consistent
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property 3: Preset validation consistency', () => {
    it('should validate all default presets', () => {
      for (const preset of DEFAULT_PRESETS) {
        expect(validatePreset(preset)).toBe(true);
      }
    });
    
    it('should reject presets missing any required field', () => {
      const requiredFields = ['key', 'name', 'description', 'fps', 'codec', 'pixelFormat', 'crf'];
      
      for (const field of requiredFields) {
        const incomplete: Partial<CapturePreset> = {
          key: 'TEST',
          name: 'Test',
          description: 'Test',
          fps: 30,
          codec: 'libx264',
          pixelFormat: 'yuv420p',
          crf: 20,
        };
        
        // Remove the field
        delete (incomplete as any)[field];
        
        expect(validatePreset(incomplete)).toBe(false);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property 4: Command structure invariants
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property 4: Command structure invariants', () => {
    it.each(DEFAULT_PRESETS)(
      '$key command should have correct argument pairs',
      (preset) => {
        const params: StartRecordingParams = {
          mode: 'desktop',
          outputPath: '/tmp/test.mp4',
          preset: preset.key,
        };
        
        const command = ffmpeg.buildCommand(params, preset);
        const args = command.args;
        
        // Check that key arguments have values
        const codecIndex = args.indexOf('-c:v');
        expect(codecIndex).toBeGreaterThan(-1);
        expect(args[codecIndex + 1]).toBe(preset.codec);
        
        const pixFmtIndex = args.indexOf('-pix_fmt');
        expect(pixFmtIndex).toBeGreaterThan(-1);
        expect(args[pixFmtIndex + 1]).toBe(preset.pixelFormat);
        
        const crfIndex = args.indexOf('-crf');
        expect(crfIndex).toBeGreaterThan(-1);
        expect(args[crfIndex + 1]).toBe(String(preset.crf));
      }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property 5: Output path is always last argument
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property 5: Output path position', () => {
    it.each(DEFAULT_PRESETS)(
      '$key command should have output path as last argument',
      (preset) => {
        const outputPath = '/tmp/output_test.mp4';
        const params: StartRecordingParams = {
          mode: 'desktop',
          outputPath,
          preset: preset.key,
        };
        
        const command = ffmpeg.buildCommand(params, preset);
        const args = command.args;
        
        // Output path should be last argument
        expect(args[args.length - 1]).toBe(outputPath);
      }
    );
  });
});
