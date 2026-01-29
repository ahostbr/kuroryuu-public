/**
 * Property Tests for Event Emission
 * 
 * Property 8: Event Emission Consistency
 * Verifies events are emitted for all successful operations.
 * 
 * Requirements: 1.9
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FeatureEventBus, resetEventBus } from '../../event-bus';
import { FeatureEventType, FeatureErrorCode } from '../../base';

// ═══════════════════════════════════════════════════════════════════════════════
// Property Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 8: Event Emission Consistency', () => {
  let eventBus: FeatureEventBus;
  
  beforeEach(() => {
    resetEventBus();
    eventBus = new FeatureEventBus();
  });
  
  afterEach(() => {
    eventBus.reset();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Screenshot events are always emitted with complete data
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Screenshot Event Properties', () => {
    it('should emit screenshot complete with all required fields', () => {
      const handler = vi.fn();
      eventBus.subscribe(FeatureEventType.CAPTURE_SCREENSHOT_COMPLETE, handler);
      
      // Emit multiple screenshots with varying data
      const testCases = [
        { moduleId: 'capture', filePath: '/a.png', width: 1920, height: 1080 },
        { moduleId: 'capture', filePath: '/b.png', width: 2560, height: 1440 },
        { moduleId: 'capture', filePath: '/c.png', width: 3840, height: 2160 },
        { moduleId: 'capture', filePath: '/screen.png', width: 800, height: 600 },
      ];
      
      for (const data of testCases) {
        eventBus.emitCaptureScreenshotComplete(data);
      }
      
      expect(handler).toHaveBeenCalledTimes(testCases.length);
      
      // Verify all calls have required fields
      for (let i = 0; i < testCases.length; i++) {
        const call = handler.mock.calls[i][0];
        expect(call).toHaveProperty('moduleId');
        expect(call).toHaveProperty('filePath');
        expect(call).toHaveProperty('width');
        expect(call).toHaveProperty('height');
        expect(call).toHaveProperty('timestamp');
        expect(typeof call.timestamp).toBe('number');
      }
    });
    
    it('should always add timestamp to screenshot events', () => {
      const handler = vi.fn();
      eventBus.subscribe(FeatureEventType.CAPTURE_SCREENSHOT_COMPLETE, handler);
      
      const before = Date.now();
      
      for (let i = 0; i < 10; i++) {
        eventBus.emitCaptureScreenshotComplete({
          moduleId: 'capture',
          filePath: `/screenshot_${i}.png`,
          width: Math.floor(Math.random() * 3000) + 800,
          height: Math.floor(Math.random() * 2000) + 600,
        });
      }
      
      const after = Date.now();
      
      for (const call of handler.mock.calls) {
        const event = call[0];
        expect(event.timestamp).toBeGreaterThanOrEqual(before);
        expect(event.timestamp).toBeLessThanOrEqual(after);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Recording events maintain consistency
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Recording Event Properties', () => {
    it('should emit record start with all required fields', () => {
      const handler = vi.fn();
      eventBus.subscribe(FeatureEventType.CAPTURE_RECORD_START, handler);
      
      const presets = ['OPTIMAL_BALANCED_444', 'CRISP_MAX_444', 'BALANCED_420', 'TINY_1080P'];
      const modes = ['desktop', 'primary', 'window', 'region'] as const;
      
      for (const preset of presets) {
        for (const mode of modes) {
          eventBus.emitCaptureRecordStart({
            moduleId: 'capture',
            preset,
            mode,
            outputPath: `/recording_${preset}_${mode}.mp4`,
          });
        }
      }
      
      expect(handler).toHaveBeenCalledTimes(presets.length * modes.length);
      
      for (const call of handler.mock.calls) {
        const event = call[0];
        expect(event).toHaveProperty('moduleId');
        expect(event).toHaveProperty('preset');
        expect(event).toHaveProperty('mode');
        expect(event).toHaveProperty('outputPath');
        expect(event).toHaveProperty('timestamp');
      }
    });
    
    it('should emit record stop with all required fields', () => {
      const handler = vi.fn();
      eventBus.subscribe(FeatureEventType.CAPTURE_RECORD_STOP, handler);
      
      // Simulate various recording durations
      const durations = [1000, 5000, 30000, 60000, 300000];
      const fileSizes = [1000000, 5000000, 15000000, 50000000, 100000000];
      
      for (let i = 0; i < durations.length; i++) {
        eventBus.emitCaptureRecordStop({
          moduleId: 'capture',
          filePath: `/recording_${i}.mp4`,
          duration: durations[i],
          fileSize: fileSizes[i],
        });
      }
      
      expect(handler).toHaveBeenCalledTimes(durations.length);
      
      for (const call of handler.mock.calls) {
        const event = call[0];
        expect(event).toHaveProperty('moduleId');
        expect(event).toHaveProperty('filePath');
        expect(event).toHaveProperty('duration');
        expect(event).toHaveProperty('fileSize');
        expect(event).toHaveProperty('timestamp');
        expect(typeof event.duration).toBe('number');
        expect(typeof event.fileSize).toBe('number');
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Error events are properly typed
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Error Event Properties', () => {
    it('should route errors to correct event type based on module', () => {
      const captureHandler = vi.fn();
      const voiceHandler = vi.fn();
      const ttsHandler = vi.fn();
      
      eventBus.subscribe(FeatureEventType.CAPTURE_ERROR, captureHandler);
      eventBus.subscribe(FeatureEventType.VOICE_INPUT_ERROR, voiceHandler);
      eventBus.subscribe(FeatureEventType.TTS_ERROR, ttsHandler);
      
      // Emit errors for different modules
      const moduleErrors = [
        { moduleId: 'capture', count: 3 },
        { moduleId: 'capture-module', count: 2 },
        { moduleId: 'voice', count: 4 },
        { moduleId: 'voice-input', count: 1 },
        { moduleId: 'tts', count: 5 },
        { moduleId: 'tts-module', count: 2 },
      ];
      
      for (const { moduleId, count } of moduleErrors) {
        for (let i = 0; i < count; i++) {
          eventBus.emitError({
            moduleId,
            error: `Error ${i} from ${moduleId}`,
            errorCode: (1000 + i) as unknown as FeatureErrorCode,
          });
        }
      }
      
      // Capture errors: 3 + 2 = 5
      expect(captureHandler).toHaveBeenCalledTimes(5);
      
      // Voice errors: 4 + 1 = 5
      expect(voiceHandler).toHaveBeenCalledTimes(5);
      
      // TTS errors: 5 + 2 = 7
      expect(ttsHandler).toHaveBeenCalledTimes(7);
    });
    
    it('should include error code in all error events', () => {
      const handler = vi.fn();
      eventBus.subscribe(FeatureEventType.CAPTURE_ERROR, handler);
      
      const errorCodes = [1001, 1002, 1003, 1004, 1005];

      for (const code of errorCodes) {
        eventBus.emitError({
          moduleId: 'capture',
          error: `Error with code ${code}`,
          errorCode: code as unknown as FeatureErrorCode,
        });
      }
      
      for (let i = 0; i < errorCodes.length; i++) {
        const event = handler.mock.calls[i][0];
        expect(event.errorCode).toBe(errorCodes[i]);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Event log preserves order
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Event Log Order Properties', () => {
    it('should preserve event emission order in log', () => {
      const eventTypes = [
        FeatureEventType.CAPTURE_RECORD_START,
        FeatureEventType.CAPTURE_SCREENSHOT_COMPLETE,
        FeatureEventType.CAPTURE_RECORD_STOP,
      ];
      
      // Emit events in specific order
      eventBus.emitCaptureRecordStart({
        moduleId: 'capture',
        preset: 'p1',
        mode: 'desktop',
        outputPath: '/a.mp4',
      });
      
      eventBus.emitCaptureScreenshotComplete({
        moduleId: 'capture',
        filePath: '/b.png',
        width: 1920,
        height: 1080,
      });
      
      eventBus.emitCaptureRecordStop({
        moduleId: 'capture',
        filePath: '/a.mp4',
        duration: 5000,
        fileSize: 1000000,
      });
      
      const log = eventBus.getEventLog();
      
      expect(log).toHaveLength(3);
      expect(log[0].type).toBe(eventTypes[0]);
      expect(log[1].type).toBe(eventTypes[1]);
      expect(log[2].type).toBe(eventTypes[2]);
      
      // Timestamps should be in ascending order
      expect(log[0].data.timestamp).toBeLessThanOrEqual(log[1].data.timestamp);
      expect(log[1].data.timestamp).toBeLessThanOrEqual(log[2].data.timestamp);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Wildcard subscriptions receive all events
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Wildcard Subscription Properties', () => {
    it('should receive all capture events via subscribeAll', () => {
      const wildcardHandler = vi.fn();
      eventBus.subscribeAll(wildcardHandler);
      
      // Emit various event types
      eventBus.emitCaptureScreenshotComplete({
        moduleId: 'capture',
        filePath: '/a.png',
        width: 1920,
        height: 1080,
      });
      
      eventBus.emitCaptureRecordStart({
        moduleId: 'capture',
        preset: 'p1',
        mode: 'desktop',
        outputPath: '/a.mp4',
      });
      
      eventBus.emitCaptureRecordStop({
        moduleId: 'capture',
        filePath: '/a.mp4',
        duration: 5000,
        fileSize: 1000000,
      });
      
      expect(wildcardHandler).toHaveBeenCalledTimes(3);
      
      // Verify each call received correct event type
      const types = wildcardHandler.mock.calls.map(call => call[0]);
      expect(types).toContain(FeatureEventType.CAPTURE_SCREENSHOT_COMPLETE);
      expect(types).toContain(FeatureEventType.CAPTURE_RECORD_START);
      expect(types).toContain(FeatureEventType.CAPTURE_RECORD_STOP);
    });
  });
});
