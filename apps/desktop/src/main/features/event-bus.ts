/**
 * Event Bus
 * 
 * Central event system for feature modules to emit events that
 * UI and agent harness can consume.
 * 
 * Requirements:
 * - 1.9: Capture completes emit event with file path
 * - 2.8: Voice input completes emit event with transcript
 * - 3.7: TTS completes emit event indicating completion
 * - 4.7: Feature_Module shall emit events
 */

import { EventEmitter } from 'events';
import {
  FeatureEventType,
  FeatureEventData,
  CaptureScreenshotCompleteEvent,
  CaptureRecordStartEvent,
  CaptureRecordStopEvent,
  VoiceInputCompleteEvent,
  TTSSpeakStartEvent,
  TTSSpeakCompleteEvent,
  FeatureErrorEvent,
} from './base';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event handler function type
 */
export type EventHandler<T extends FeatureEventData = FeatureEventData> = (data: T) => void;

/**
 * Subscription handle for unsubscribing
 */
export interface EventSubscription {
  unsubscribe: () => void;
}

/**
 * Event log entry for debugging
 */
export interface EventLogEntry {
  type: FeatureEventType;
  data: FeatureEventData;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Bus
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Central event bus for feature module events
 */
export class FeatureEventBus extends EventEmitter {
  private eventLog: EventLogEntry[] = [];
  private maxLogSize = 100;
  private isLogging = true;
  
  constructor() {
    super();
    this.setMaxListeners(50); // Allow more listeners for complex apps
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Emit Events
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Emit a feature event
   * Requirements: 1.9, 2.8, 3.7, 4.7
   */
  emitEvent<T extends FeatureEventData>(type: FeatureEventType, data: T): void {
    // Add timestamp if not present
    const eventData = {
      ...data,
      timestamp: data.timestamp || Date.now(),
    };
    
    // Log event
    if (this.isLogging) {
      this.logEvent(type, eventData);
    }
    
    console.log(`[EventBus] Emitting ${type}:`, eventData.moduleId);
    
    // Emit to specific event listeners
    this.emit(type, eventData);
    
    // Also emit to wildcard listeners
    this.emit('*', type, eventData);
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Typed Emit Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Emit capture screenshot complete event
   * Requirements: 1.9
   */
  emitCaptureScreenshotComplete(data: Omit<CaptureScreenshotCompleteEvent, 'timestamp'>): void {
    this.emitEvent(FeatureEventType.CAPTURE_SCREENSHOT_COMPLETE, {
      ...data,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Emit capture record start event
   */
  emitCaptureRecordStart(data: Omit<CaptureRecordStartEvent, 'timestamp'>): void {
    this.emitEvent(FeatureEventType.CAPTURE_RECORD_START, {
      ...data,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Emit capture record stop event
   */
  emitCaptureRecordStop(data: Omit<CaptureRecordStopEvent, 'timestamp'>): void {
    this.emitEvent(FeatureEventType.CAPTURE_RECORD_STOP, {
      ...data,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Emit voice input start event
   */
  emitVoiceInputStart(moduleId: string): void {
    this.emitEvent(FeatureEventType.VOICE_INPUT_START, {
      moduleId,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Emit voice input complete event
   * Requirements: 2.8
   */
  emitVoiceInputComplete(data: Omit<VoiceInputCompleteEvent, 'timestamp'>): void {
    this.emitEvent(FeatureEventType.VOICE_INPUT_COMPLETE, {
      ...data,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Emit TTS speak start event
   */
  emitTTSSpeakStart(data: Omit<TTSSpeakStartEvent, 'timestamp'>): void {
    this.emitEvent(FeatureEventType.TTS_SPEAK_START, {
      ...data,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Emit TTS speak complete event
   * Requirements: 3.7
   */
  emitTTSSpeakComplete(data: Omit<TTSSpeakCompleteEvent, 'timestamp'>): void {
    this.emitEvent(FeatureEventType.TTS_SPEAK_COMPLETE, {
      ...data,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Emit error event
   */
  emitError(data: Omit<FeatureErrorEvent, 'timestamp'>): void {
    const eventType = this.getErrorEventType(data.moduleId);
    this.emitEvent(eventType, {
      ...data,
      timestamp: Date.now(),
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Subscribe to Events
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Subscribe to a specific event type
   * Returns subscription handle for unsubscribing
   */
  subscribe<T extends FeatureEventData>(
    type: FeatureEventType,
    handler: EventHandler<T>
  ): EventSubscription {
    this.on(type, handler);
    
    return {
      unsubscribe: () => this.off(type, handler),
    };
  }
  
  /**
   * Subscribe to all events (wildcard)
   */
  subscribeAll(
    handler: (type: FeatureEventType, data: FeatureEventData) => void
  ): EventSubscription {
    this.on('*', handler);
    
    return {
      unsubscribe: () => this.off('*', handler),
    };
  }
  
  /**
   * Subscribe to events from a specific module
   */
  subscribeModule(
    moduleId: string,
    handler: (type: FeatureEventType, data: FeatureEventData) => void
  ): EventSubscription {
    const moduleHandler = (type: FeatureEventType, data: FeatureEventData) => {
      if (data.moduleId === moduleId) {
        handler(type, data);
      }
    };
    
    this.on('*', moduleHandler);
    
    return {
      unsubscribe: () => this.off('*', moduleHandler),
    };
  }
  
  /**
   * Subscribe once to an event
   */
  subscribeOnce<T extends FeatureEventData>(
    type: FeatureEventType,
    handler: EventHandler<T>
  ): EventSubscription {
    this.once(type, handler);
    
    return {
      unsubscribe: () => this.off(type, handler),
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Event Log
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Log an event for debugging
   */
  private logEvent(type: FeatureEventType, data: FeatureEventData): void {
    this.eventLog.push({
      type,
      data,
      timestamp: Date.now(),
    });
    
    // Trim log if too large
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }
  }
  
  /**
   * Get event log
   */
  getEventLog(): EventLogEntry[] {
    return [...this.eventLog];
  }
  
  /**
   * Get events for a specific module
   */
  getModuleEvents(moduleId: string): EventLogEntry[] {
    return this.eventLog.filter(e => e.data.moduleId === moduleId);
  }
  
  /**
   * Get events of a specific type
   */
  getEventsByType(type: FeatureEventType): EventLogEntry[] {
    return this.eventLog.filter(e => e.type === type);
  }
  
  /**
   * Clear event log
   */
  clearEventLog(): void {
    this.eventLog = [];
  }
  
  /**
   * Enable/disable event logging
   */
  setLogging(enabled: boolean): void {
    this.isLogging = enabled;
  }
  
  /**
   * Set max log size
   */
  setMaxLogSize(size: number): void {
    this.maxLogSize = size;
    if (this.eventLog.length > size) {
      this.eventLog = this.eventLog.slice(-size);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get the appropriate error event type based on module ID
   */
  private getErrorEventType(moduleId: string): FeatureEventType {
    if (moduleId.includes('capture')) {
      return FeatureEventType.CAPTURE_ERROR;
    }
    if (moduleId.includes('voice')) {
      return FeatureEventType.VOICE_INPUT_ERROR;
    }
    if (moduleId.includes('tts')) {
      return FeatureEventType.TTS_ERROR;
    }
    return FeatureEventType.MODULE_ERROR;
  }
  
  /**
   * Wait for an event with timeout
   */
  waitForEvent<T extends FeatureEventData>(
    type: FeatureEventType,
    timeoutMs: number = 30000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(type, handler);
        reject(new Error(`Timeout waiting for event: ${type}`));
      }, timeoutMs);
      
      const handler = (data: T) => {
        clearTimeout(timer);
        resolve(data);
      };
      
      this.once(type, handler);
    });
  }
  
  /**
   * Remove all listeners and clear log
   */
  reset(): void {
    this.removeAllListeners();
    this.clearEventLog();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════════

let _instance: FeatureEventBus | null = null;

/**
 * Get the singleton Event Bus instance
 */
export function getEventBus(): FeatureEventBus {
  if (!_instance) {
    _instance = new FeatureEventBus();
  }
  return _instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetEventBus(): void {
  if (_instance) {
    _instance.reset();
  }
  _instance = null;
}
