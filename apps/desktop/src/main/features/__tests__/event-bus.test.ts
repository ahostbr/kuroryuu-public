/**
 * Unit Tests for Event Bus
 * 
 * Tests:
 * - Event emission
 * - Event subscription
 * - Async handling
 * 
 * Requirements: 1.9, 2.8, 3.7
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FeatureEventBus,
  resetEventBus,
  getEventBus,
  EventSubscription,
} from '../event-bus';
import {
  FeatureEventType,
  FeatureEventData,
  CaptureScreenshotCompleteEvent,
  VoiceInputCompleteEvent,
  TTSSpeakCompleteEvent,
  FeatureErrorCode,
} from '../base';

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('FeatureEventBus', () => {
  let eventBus: FeatureEventBus;
  
  beforeEach(() => {
    resetEventBus();
    eventBus = new FeatureEventBus();
  });
  
  afterEach(() => {
    eventBus.reset();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Event Emission Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Event Emission', () => {
    it('should emit events to subscribers', () => {
      const handler = vi.fn();
      eventBus.subscribe(FeatureEventType.CAPTURE_SCREENSHOT_COMPLETE, handler);
      
      eventBus.emitCaptureScreenshotComplete({
        moduleId: 'capture',
        filePath: '/path/to/screenshot.png',
        width: 1920,
        height: 1080,
      });
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId: 'capture',
          filePath: '/path/to/screenshot.png',
          width: 1920,
          height: 1080,
        })
      );
    });
    
    it('should add timestamp to events', () => {
      const handler = vi.fn();
      eventBus.subscribe(FeatureEventType.VOICE_INPUT_COMPLETE, handler);
      
      const beforeEmit = Date.now();
      
      eventBus.emitVoiceInputComplete({
        moduleId: 'voice',
        transcript: 'Hello world',
      });
      
      const afterEmit = Date.now();
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      );
      
      const eventData = handler.mock.calls[0][0];
      expect(eventData.timestamp).toBeGreaterThanOrEqual(beforeEmit);
      expect(eventData.timestamp).toBeLessThanOrEqual(afterEmit);
    });
    
    it('should emit to wildcard listeners', () => {
      const wildcardHandler = vi.fn();
      eventBus.subscribeAll(wildcardHandler);
      
      eventBus.emitTTSSpeakComplete({
        moduleId: 'tts',
        text: 'Hello',
        duration: 1000,
      });
      
      expect(wildcardHandler).toHaveBeenCalledWith(
        FeatureEventType.TTS_SPEAK_COMPLETE,
        expect.objectContaining({
          moduleId: 'tts',
          text: 'Hello',
        })
      );
    });
    
    it('should support multiple subscribers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      
      eventBus.subscribe(FeatureEventType.CAPTURE_RECORD_START, handler1);
      eventBus.subscribe(FeatureEventType.CAPTURE_RECORD_START, handler2);
      eventBus.subscribe(FeatureEventType.CAPTURE_RECORD_START, handler3);
      
      eventBus.emitCaptureRecordStart({
        moduleId: 'capture',
        preset: 'p1',
        mode: 'desktop',
        outputPath: '/path/to/video.mp4',
      });
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Subscription Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Event Subscription', () => {
    it('should return subscription handle for unsubscribing', () => {
      const handler = vi.fn();
      const subscription = eventBus.subscribe(
        FeatureEventType.VOICE_INPUT_START,
        handler
      );
      
      eventBus.emitVoiceInputStart('voice');
      expect(handler).toHaveBeenCalledTimes(1);
      
      subscription.unsubscribe();
      
      eventBus.emitVoiceInputStart('voice');
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
    
    it('should support subscribeOnce for one-time handlers', () => {
      const handler = vi.fn();
      eventBus.subscribeOnce(FeatureEventType.TTS_SPEAK_START, handler);
      
      eventBus.emitTTSSpeakStart({
        moduleId: 'tts',
        text: 'First',
        backend: 'sapi',
      });
      
      eventBus.emitTTSSpeakStart({
        moduleId: 'tts',
        text: 'Second',
        backend: 'sapi',
      });
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'First' })
      );
    });
    
    it('should filter events by module ID with subscribeModule', () => {
      const handler = vi.fn();
      eventBus.subscribeModule('capture', handler);
      
      // Emit capture event
      eventBus.emitCaptureScreenshotComplete({
        moduleId: 'capture',
        filePath: '/path',
        width: 100,
        height: 100,
      });
      
      // Emit voice event (should not trigger handler)
      eventBus.emitVoiceInputComplete({
        moduleId: 'voice',
        transcript: 'test',
      });
      
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Typed Emit Tests (Requirements)
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Typed Emit Methods', () => {
    it('should emit capture screenshot complete (Req 1.9)', () => {
      const handler = vi.fn();
      eventBus.subscribe(FeatureEventType.CAPTURE_SCREENSHOT_COMPLETE, handler);
      
      eventBus.emitCaptureScreenshotComplete({
        moduleId: 'capture',
        filePath: '/screenshots/screen.png',
        width: 2560,
        height: 1440,
      });
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: '/screenshots/screen.png',
          width: 2560,
          height: 1440,
        })
      );
    });
    
    it('should emit voice input complete (Req 2.8)', () => {
      const handler = vi.fn();
      eventBus.subscribe(FeatureEventType.VOICE_INPUT_COMPLETE, handler);
      
      eventBus.emitVoiceInputComplete({
        moduleId: 'voice',
        transcript: 'Create a new file called test.ts',
        confidence: 0.95,
      });
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          transcript: 'Create a new file called test.ts',
          confidence: 0.95,
        })
      );
    });
    
    it('should emit TTS speak complete (Req 3.7)', () => {
      const handler = vi.fn();
      eventBus.subscribe(FeatureEventType.TTS_SPEAK_COMPLETE, handler);
      
      eventBus.emitTTSSpeakComplete({
        moduleId: 'tts',
        text: 'File created successfully',
        duration: 2500,
        filePath: '/audio/response.mp3',
      });
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'File created successfully',
          duration: 2500,
          filePath: '/audio/response.mp3',
        })
      );
    });
    
    it('should emit capture record start/stop events', () => {
      const startHandler = vi.fn();
      const stopHandler = vi.fn();
      
      eventBus.subscribe(FeatureEventType.CAPTURE_RECORD_START, startHandler);
      eventBus.subscribe(FeatureEventType.CAPTURE_RECORD_STOP, stopHandler);
      
      eventBus.emitCaptureRecordStart({
        moduleId: 'capture',
        preset: 'OPTIMAL_BALANCED_444',
        mode: 'desktop',
        outputPath: '/video/recording.mp4',
      });
      
      eventBus.emitCaptureRecordStop({
        moduleId: 'capture',
        filePath: '/video/recording.mp4',
        duration: 30000,
        fileSize: 15000000,
      });
      
      expect(startHandler).toHaveBeenCalledTimes(1);
      expect(stopHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: 30000,
          fileSize: 15000000,
        })
      );
    });
    
    it('should emit error events', () => {
      const captureErrorHandler = vi.fn();
      const voiceErrorHandler = vi.fn();
      const ttsErrorHandler = vi.fn();
      
      eventBus.subscribe(FeatureEventType.CAPTURE_ERROR, captureErrorHandler);
      eventBus.subscribe(FeatureEventType.VOICE_INPUT_ERROR, voiceErrorHandler);
      eventBus.subscribe(FeatureEventType.TTS_ERROR, ttsErrorHandler);
      
      eventBus.emitError({
        moduleId: 'capture-module',
        error: 'ffmpeg not found',
        errorCode: FeatureErrorCode.FFMPEG_NOT_FOUND,
      });
      
      eventBus.emitError({
        moduleId: 'voice-module',
        error: 'Microphone not available',
        errorCode: FeatureErrorCode.MICROPHONE_NOT_AVAILABLE,
      });
      
      eventBus.emitError({
        moduleId: 'tts-module',
        error: 'All backends failed',
        errorCode: FeatureErrorCode.TTS_ALL_BACKENDS_FAILED,
      });
      
      expect(captureErrorHandler).toHaveBeenCalledTimes(1);
      expect(voiceErrorHandler).toHaveBeenCalledTimes(1);
      expect(ttsErrorHandler).toHaveBeenCalledTimes(1);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Event Log Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Event Logging', () => {
    it('should log emitted events', () => {
      eventBus.emitVoiceInputStart('voice');
      eventBus.emitVoiceInputComplete({
        moduleId: 'voice',
        transcript: 'test',
      });
      
      const log = eventBus.getEventLog();
      
      expect(log).toHaveLength(2);
      expect(log[0].type).toBe(FeatureEventType.VOICE_INPUT_START);
      expect(log[1].type).toBe(FeatureEventType.VOICE_INPUT_COMPLETE);
    });
    
    it('should filter events by module', () => {
      eventBus.emitCaptureScreenshotComplete({
        moduleId: 'capture',
        filePath: '/path',
        width: 100,
        height: 100,
      });
      
      eventBus.emitVoiceInputComplete({
        moduleId: 'voice',
        transcript: 'test',
      });
      
      const captureEvents = eventBus.getModuleEvents('capture');
      const voiceEvents = eventBus.getModuleEvents('voice');
      
      expect(captureEvents).toHaveLength(1);
      expect(voiceEvents).toHaveLength(1);
    });
    
    it('should filter events by type', () => {
      eventBus.emitVoiceInputStart('voice');
      eventBus.emitVoiceInputComplete({ moduleId: 'voice', transcript: 'a' });
      eventBus.emitVoiceInputComplete({ moduleId: 'voice', transcript: 'b' });
      
      const completeEvents = eventBus.getEventsByType(FeatureEventType.VOICE_INPUT_COMPLETE);
      
      expect(completeEvents).toHaveLength(2);
    });
    
    it('should respect max log size', () => {
      eventBus.setMaxLogSize(5);
      
      for (let i = 0; i < 10; i++) {
        eventBus.emitVoiceInputStart('voice');
      }
      
      const log = eventBus.getEventLog();
      expect(log).toHaveLength(5);
    });
    
    it('should clear event log', () => {
      eventBus.emitVoiceInputStart('voice');
      eventBus.emitVoiceInputStart('voice');
      
      eventBus.clearEventLog();
      
      expect(eventBus.getEventLog()).toHaveLength(0);
    });
    
    it('should disable logging when configured', () => {
      eventBus.setLogging(false);
      
      eventBus.emitVoiceInputStart('voice');
      
      expect(eventBus.getEventLog()).toHaveLength(0);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Async Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Async Event Handling', () => {
    it('should wait for event with timeout', async () => {
      // Emit event after delay
      setTimeout(() => {
        eventBus.emitVoiceInputComplete({
          moduleId: 'voice',
          transcript: 'delayed message',
        });
      }, 50);
      
      const result = await eventBus.waitForEvent<VoiceInputCompleteEvent>(
        FeatureEventType.VOICE_INPUT_COMPLETE,
        1000
      );
      
      expect(result.transcript).toBe('delayed message');
    });
    
    it('should reject on timeout', async () => {
      await expect(
        eventBus.waitForEvent(FeatureEventType.TTS_SPEAK_COMPLETE, 50)
      ).rejects.toThrow('Timeout');
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Singleton Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Singleton', () => {
    it('should return same instance', () => {
      resetEventBus();
      
      const instance1 = getEventBus();
      const instance2 = getEventBus();
      
      expect(instance1).toBe(instance2);
    });
    
    it('should reset singleton', () => {
      const instance1 = getEventBus();
      instance1.emitVoiceInputStart('voice');
      
      resetEventBus();
      
      const instance2 = getEventBus();
      expect(instance2.getEventLog()).toHaveLength(0);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Reset Tests
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Reset', () => {
    it('should remove all listeners and clear log', () => {
      const handler = vi.fn();
      eventBus.subscribe(FeatureEventType.VOICE_INPUT_START, handler);
      eventBus.emitVoiceInputStart('voice');
      
      expect(eventBus.getEventLog()).toHaveLength(1);
      
      eventBus.reset();
      
      // After reset, log is cleared
      expect(eventBus.getEventLog()).toHaveLength(0);
      
      // Emit again - handlers are removed, so handler won't be called
      eventBus.emitVoiceInputStart('voice');
      
      expect(handler).toHaveBeenCalledTimes(1); // Only first call before reset
      expect(eventBus.getEventLog()).toHaveLength(1); // New event logged
    });
  });
});
