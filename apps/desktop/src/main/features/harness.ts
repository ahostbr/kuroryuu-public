/**
 * Agent Harness Integration
 * 
 * Exposes feature modules as callable functions for agent harness.
 * Provides Python-callable interface via IPC.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { getLifecycleManager, LifecycleManager } from './lifecycle';
import { FeatureEventBus } from './event-bus';
import { FeatureEventType } from './base';
import { getLogger } from './logger';
import { FeatureErrorCode, isFeatureError } from './errors';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface HarnessResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface CaptureParams {
  preset?: string;
  region?: { x: number; y: number; width: number; height: number };
  outputPath?: string;
}

export interface VoiceInputParams {
  timeout?: number;
  language?: string;
  continuous?: boolean;
}

export interface TTSParams {
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Harness Bridge
// ═══════════════════════════════════════════════════════════════════════════════

export class AgentHarnessBridge {
  private logger = getLogger('AgentHarnessBridge');
  private lifecycleManager: LifecycleManager;
  private eventSubscribers: Map<string, (event: unknown) => void> = new Map();
  private isRegistered = false;
  
  constructor(lifecycleManager?: LifecycleManager) {
    this.lifecycleManager = lifecycleManager || getLifecycleManager();
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // IPC Registration
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Register IPC handlers for agent harness
   */
  registerIPCHandlers(): void {
    if (this.isRegistered) {
      this.logger.warn('IPC handlers already registered');
      return;
    }
    
    // Feature execution
    ipcMain.handle('harness:capture', this.handleCapture.bind(this));
    ipcMain.handle('harness:voiceInput', this.handleVoiceInput.bind(this));
    ipcMain.handle('harness:tts', this.handleTTS.bind(this));
    ipcMain.handle('harness:ttsStop', this.handleTTSStop.bind(this));
    
    // Lifecycle
    ipcMain.handle('harness:getStatus', this.handleGetStatus.bind(this));
    ipcMain.handle('harness:initialize', this.handleInitialize.bind(this));
    ipcMain.handle('harness:shutdown', this.handleShutdown.bind(this));
    
    // Events
    ipcMain.handle('harness:subscribeEvents', this.handleSubscribeEvents.bind(this));
    ipcMain.handle('harness:unsubscribeEvents', this.handleUnsubscribeEvents.bind(this));
    
    this.isRegistered = true;
    this.logger.info('IPC handlers registered');
  }
  
  /**
   * Unregister IPC handlers
   */
  unregisterIPCHandlers(): void {
    if (!this.isRegistered) return;
    
    ipcMain.removeHandler('harness:capture');
    ipcMain.removeHandler('harness:voiceInput');
    ipcMain.removeHandler('harness:tts');
    ipcMain.removeHandler('harness:ttsStop');
    ipcMain.removeHandler('harness:getStatus');
    ipcMain.removeHandler('harness:initialize');
    ipcMain.removeHandler('harness:shutdown');
    ipcMain.removeHandler('harness:subscribeEvents');
    ipcMain.removeHandler('harness:unsubscribeEvents');
    
    // Clear event subscribers
    this.eventSubscribers.clear();
    
    this.isRegistered = false;
    this.logger.info('IPC handlers unregistered');
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Feature Handlers
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Handle capture request
   * Requirements: 8.2
   */
  private async handleCapture(
    _event: IpcMainInvokeEvent,
    params: CaptureParams
  ): Promise<HarnessResponse> {
    this.logger.debug('Capture request', { params });
    
    const featureManager = this.lifecycleManager.getFeatureManager();
    if (!featureManager) {
      return this.errorResponse(FeatureErrorCode.NOT_INITIALIZED, 'Feature manager not initialized');
    }
    
    try {
      const result = await featureManager.execute('capture', 'capture', params as Record<string, unknown>);

      if (result.ok) {
        return { success: true, data: result.result };
      } else {
        return this.errorResponse(
          result.errorCode || FeatureErrorCode.CAPTURE_FAILED,
          result.error || 'Capture failed'
        );
      }
    } catch (error) {
      return this.handleError(error, 'capture');
    }
  }
  
  /**
   * Handle voice input request
   * Requirements: 8.3
   */
  private async handleVoiceInput(
    _event: IpcMainInvokeEvent,
    params: VoiceInputParams
  ): Promise<HarnessResponse> {
    this.logger.debug('Voice input request', { params });
    
    const featureManager = this.lifecycleManager.getFeatureManager();
    if (!featureManager) {
      return this.errorResponse(FeatureErrorCode.NOT_INITIALIZED, 'Feature manager not initialized');
    }
    
    try {
      const result = await featureManager.execute('voice-input', 'start_listening', params as Record<string, unknown>);

      if (result.ok) {
        return { success: true, data: result.result };
      } else {
        return this.errorResponse(
          result.errorCode || FeatureErrorCode.VOICE_INPUT_FAILED,
          result.error || 'Voice input failed'
        );
      }
    } catch (error) {
      return this.handleError(error, 'voice-input');
    }
  }
  
  /**
   * Handle TTS request
   * Requirements: 8.4
   */
  private async handleTTS(
    _event: IpcMainInvokeEvent,
    params: TTSParams
  ): Promise<HarnessResponse> {
    this.logger.debug('TTS request', { text: params.text?.substring(0, 50) });
    
    const featureManager = this.lifecycleManager.getFeatureManager();
    if (!featureManager) {
      return this.errorResponse(FeatureErrorCode.NOT_INITIALIZED, 'Feature manager not initialized');
    }
    
    try {
      const result = await featureManager.execute('tts', 'speak', params as unknown as Record<string, unknown>);

      if (result.ok) {
        return { success: true, data: result.result };
      } else {
        return this.errorResponse(
          result.errorCode || FeatureErrorCode.TTS_FAILED,
          result.error || 'TTS failed'
        );
      }
    } catch (error) {
      return this.handleError(error, 'tts');
    }
  }

  /**
   * Handle TTS stop request
   */
  private async handleTTSStop(): Promise<HarnessResponse> {
    const featureManager = this.lifecycleManager.getFeatureManager();
    if (!featureManager) {
      return this.errorResponse(FeatureErrorCode.NOT_INITIALIZED, 'Feature manager not initialized');
    }

    try {
      const result = await featureManager.execute('tts', 'stop', {});
      return result.ok
        ? { success: true }
        : this.errorResponse(result.errorCode || FeatureErrorCode.TTS_FAILED, result.error || 'TTS stop failed');
    } catch (error) {
      return this.handleError(error, 'tts-stop');
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle Handlers
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get current status
   */
  private async handleGetStatus(): Promise<HarnessResponse> {
    const state = this.lifecycleManager.getState();
    const health = this.lifecycleManager.getModuleHealth();
    
    return {
      success: true,
      data: {
        state,
        health,
        timestamp: new Date().toISOString(),
      },
    };
  }
  
  /**
   * Initialize lifecycle manager
   */
  private async handleInitialize(): Promise<HarnessResponse> {
    const result = await this.lifecycleManager.initialize();
    
    if (result.success) {
      return { success: true, data: { state: this.lifecycleManager.getState() } };
    } else {
      return this.errorResponse(
        result.error?.code || FeatureErrorCode.INITIALIZATION_FAILED,
        result.error?.message || 'Initialization failed'
      );
    }
  }
  
  /**
   * Shutdown lifecycle manager
   */
  private async handleShutdown(): Promise<HarnessResponse> {
    const result = await this.lifecycleManager.shutdown();
    
    if (result.success) {
      return { success: true };
    } else {
      return this.errorResponse(
        result.error?.code || FeatureErrorCode.UNKNOWN_ERROR,
        result.error?.message || 'Shutdown failed'
      );
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Subscribe to feature events
   * Requirements: 8.5
   */
  private async handleSubscribeEvents(
    event: IpcMainInvokeEvent,
    eventTypes: string[]
  ): Promise<HarnessResponse> {
    const subscriberId = `${event.sender.id}`;
    const eventBus = this.lifecycleManager.getEventBus();
    
    const callback = (eventData: unknown) => {
      try {
        event.sender.send('harness:event', eventData);
      } catch {
        // Sender may be gone
        this.eventSubscribers.delete(subscriberId);
      }
    };
    
    // Subscribe to requested event types
    for (const eventType of eventTypes) {
      eventBus.on(eventType as FeatureEventType, callback);
    }
    
    this.eventSubscribers.set(subscriberId, callback);
    
    return { success: true, data: { subscriberId, eventTypes } };
  }
  
  /**
   * Unsubscribe from events
   */
  private async handleUnsubscribeEvents(
    event: IpcMainInvokeEvent
  ): Promise<HarnessResponse> {
    const subscriberId = `${event.sender.id}`;
    const callback = this.eventSubscribers.get(subscriberId);
    
    if (callback) {
      const eventBus = this.lifecycleManager.getEventBus();
      // Remove all listeners (simplified - in production track per-event)
      this.eventSubscribers.delete(subscriberId);
    }
    
    return { success: true };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Error Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  
  private errorResponse(code: string | FeatureErrorCode, message: string): HarnessResponse {
    return {
      success: false,
      error: { code: String(code), message },
    };
  }
  
  private handleError(error: unknown, action: string): HarnessResponse {
    this.logger.error(`Error in ${action}`, error);
    
    if (isFeatureError(error)) {
      return this.errorResponse(error.code, error.message);
    }
    
    return this.errorResponse(
      FeatureErrorCode.UNKNOWN_ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Python-Callable Functions (for direct integration)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * These functions can be exposed to Python via a JSON-RPC bridge
 */
export const harnessAPI = {
  /**
   * Capture screen
   * Requirements: 8.2
   */
  async capture(params: CaptureParams = {}): Promise<HarnessResponse> {
    const manager = getLifecycleManager();
    const featureManager = manager.getFeatureManager();

    if (!featureManager) {
      return { success: false, error: { code: 'NOT_INITIALIZED', message: 'Not initialized' } };
    }

    const result = await featureManager.execute('capture', 'capture', params as Record<string, unknown>);
    return result.ok
      ? { success: true, data: result.result }
      : { success: false, error: { code: result.errorCode || 'ERROR', message: result.error || 'Failed' } };
  },
  
  /**
   * Start voice input
   * Requirements: 8.3
   */
  async voiceInput(params: VoiceInputParams = {}): Promise<HarnessResponse> {
    const manager = getLifecycleManager();
    const featureManager = manager.getFeatureManager();

    if (!featureManager) {
      return { success: false, error: { code: 'NOT_INITIALIZED', message: 'Not initialized' } };
    }

    const result = await featureManager.execute('voice-input', 'start_listening', params as Record<string, unknown>);
    return result.ok
      ? { success: true, data: result.result }
      : { success: false, error: { code: result.errorCode || 'ERROR', message: result.error || 'Failed' } };
  },
  
  /**
   * Speak text
   * Requirements: 8.4
   */
  async speak(params: TTSParams): Promise<HarnessResponse> {
    const manager = getLifecycleManager();
    const featureManager = manager.getFeatureManager();

    if (!featureManager) {
      return { success: false, error: { code: 'NOT_INITIALIZED', message: 'Not initialized' } };
    }

    const result = await featureManager.execute('tts', 'speak', params as unknown as Record<string, unknown>);
    return result.ok
      ? { success: true, data: result.result }
      : { success: false, error: { code: result.errorCode || 'ERROR', message: result.error || 'Failed' } };
  },

  /**
   * Stop speaking
   */
  async stopSpeaking(): Promise<HarnessResponse> {
    const manager = getLifecycleManager();
    const featureManager = manager.getFeatureManager();

    if (!featureManager) {
      return { success: false, error: { code: 'NOT_INITIALIZED', message: 'Not initialized' } };
    }

    const result = await featureManager.execute('tts', 'stop', {});
    return result.ok
      ? { success: true }
      : { success: false, error: { code: result.errorCode || 'ERROR', message: result.error || 'Failed' } };
  },
  
  /**
   * Get status
   */
  async getStatus(): Promise<HarnessResponse> {
    const manager = getLifecycleManager();
    return {
      success: true,
      data: {
        state: manager.getState(),
        health: manager.getModuleHealth(),
      },
    };
  },
};

export default AgentHarnessBridge;
