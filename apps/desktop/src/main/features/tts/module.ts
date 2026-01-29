/**
 * TTS Module - Core Implementation
 * 
 * Feature module for text-to-speech functionality.
 * Integrates with chatbot for speaking responses.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7
 */

import {
  FeatureModuleBase,
  ModuleMetadata,
  FeatureResponse,
  FeatureErrorCode,
} from '../base';
import { FeatureEventBus } from '../event-bus';
import { ConfigManager } from '../config-manager';
import { TTSEngine } from './tts-engine';
import {
  TTSAction,
  TTSConfig,
  TTSStatus,
  SpeakParams,
  SpeechUtterance,
  VoiceInfo,
  TTSErrorType,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Module Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TTSModule - Handles text-to-speech operations
 * Requirements: 3.1, 3.2, 3.3
 */
export class TTSModule extends FeatureModuleBase {
  readonly id = 'tts';
  readonly name = 'Text-to-Speech';
  readonly version = '1.0.0';
  
  private engine: TTSEngine;
  private configManager: ConfigManager;
  private config: TTSConfig;
  private currentUtterance: SpeechUtterance | null = null;
  private queue: SpeakParams[] = [];
  private engineAvailable: boolean = false;
  
  constructor(eventBus: FeatureEventBus, configManager: ConfigManager) {
    super(eventBus);
    this.configManager = configManager;
    this.engine = new TTSEngine();
    
    // Default config
    this.config = {
      service: 'native',
      voice: 'default',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      language: 'en-US',
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────────────────────────────────────
  
  getMetadata(): ModuleMetadata {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      description: 'Text-to-speech for chatbot responses',
      supportedActions: this.getSupportedActions(),
      enabled: true,
    };
  }
  
  getSupportedActions(): string[] {
    return ['speak', 'stop', 'pause', 'resume', 'get_status', 'list_voices', 'set_voice'];
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Initialize the TTS module
   * - Check engine availability
   * - Load config
   * Requirements: 3.4
   */
  async initialize(): Promise<FeatureResponse<void>> {
    try {
      // Check engine availability
      this.engineAvailable = this.engine.isAvailable();
      
      if (!this.engineAvailable) {
        console.warn('[TTSModule] TTS engine not available');
      }
      
      // Load config from file
      await this.configManager.load();
      const ttsConfig = this.configManager.getTTSConfig();
      
      // Map ConfigManager's TTSConfig to our internal config
      if (ttsConfig) {
        this.config.voice = ttsConfig.defaultVoice || this.config.voice;
        if (ttsConfig.rate !== undefined) this.config.rate = ttsConfig.rate;
        if (ttsConfig.volume !== undefined) this.config.volume = ttsConfig.volume;
      }
      
      console.log(`[TTSModule] Loaded config: voice=${this.config.voice}, rate=${this.config.rate}`);
      
      this._isInitialized = true;
      return this.success();
    } catch (error) {
      return this.error(
        `Failed to initialize TTS module: ${error instanceof Error ? error.message : 'Unknown error'}`,
        FeatureErrorCode.INITIALIZATION_FAILED
      );
    }
  }
  
  /**
   * Shutdown the TTS module
   */
  async shutdown(): Promise<FeatureResponse<void>> {
    try {
      // Stop any active speech
      this.engine.stop();
      this.queue = [];
      this.currentUtterance = null;
      
      this._isInitialized = false;
      return this.success();
    } catch (error) {
      return this.error(
        `Failed to shutdown TTS module: ${error instanceof Error ? error.message : 'Unknown error'}`,
        FeatureErrorCode.UNKNOWN_ERROR
      );
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Execute Actions
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Execute a TTS action
   */
  async execute<T = unknown>(
    action: string,
    params: Record<string, unknown>
  ): Promise<FeatureResponse<T>> {
    // Check initialization
    const initError = this.requireInitialized();
    if (initError) return initError as FeatureResponse<T>;
    
    // Validate action
    const actionError = this.validateAction(action);
    if (actionError) return actionError as FeatureResponse<T>;
    
    // Route to handler
    switch (action as TTSAction) {
      case 'speak':
        return this.speak(params as unknown as SpeakParams) as Promise<FeatureResponse<T>>;
      
      case 'stop':
        return this.stopSpeaking() as Promise<FeatureResponse<T>>;
      
      case 'pause':
        return this.pauseSpeaking() as Promise<FeatureResponse<T>>;
      
      case 'resume':
        return this.resumeSpeaking() as Promise<FeatureResponse<T>>;
      
      case 'get_status':
        return this.getStatus() as Promise<FeatureResponse<T>>;
      
      case 'list_voices':
        return this.listVoices() as Promise<FeatureResponse<T>>;
      
      case 'set_voice':
        return this.setVoice(params.voice as string) as Promise<FeatureResponse<T>>;
      
      default:
        return this.error(`Unknown action: ${action}`, FeatureErrorCode.INVALID_ACTION) as FeatureResponse<T>;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Action Handlers
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Speak text
   * Requirements: 3.1, 3.7
   */
  private async speak(params: SpeakParams): Promise<FeatureResponse<SpeechUtterance>> {
    // Validate text
    if (!params.text || params.text.trim().length === 0) {
      return this.error('Text is required', FeatureErrorCode.INVALID_PARAMS);
    }
    
    if (params.text.length > 5000) {
      return this.error('Text too long (max 5000 characters)', FeatureErrorCode.INVALID_PARAMS);
    }
    
    // Check engine
    if (!this.engineAvailable) {
      this.eventBus.emitError({
        moduleId: this.id,
        error: 'TTS engine not available',
        errorCode: FeatureErrorCode.TTS_BACKEND_UNAVAILABLE,
      });
      return this.error('TTS engine not available', FeatureErrorCode.TTS_BACKEND_UNAVAILABLE);
    }
    
    try {
      // Emit start event
      this.eventBus.emitTTSSpeakStart({
        moduleId: this.id,
        text: params.text.substring(0, 100),
        voice: params.voice || this.config.voice,
      });
      
      // Track start time for duration calculation
      const startTime = Date.now();
      
      // Speak
      const utterance = await this.engine.speak({
        text: params.text,
        voice: params.voice || this.config.voice,
        rate: params.rate || this.config.rate,
        pitch: params.pitch || this.config.pitch,
        volume: params.volume || this.config.volume,
        onStart: () => {
          // Note: utterance is assigned after this promise resolves
        },
        onEnd: () => {
          // Emit complete event
          this.eventBus.emitTTSSpeakComplete({
            moduleId: this.id,
            text: params.text.substring(0, 100),
            durationMs: Date.now() - startTime,
          });
          this.currentUtterance = null;
        },
        onError: (error) => {
          this.eventBus.emitError({
            moduleId: this.id,
            error: error.message,
            errorCode: FeatureErrorCode.TTS_SPEAK_FAILED,
          });
        },
      });
      
      this.currentUtterance = utterance;
      return this.success(utterance);
    } catch (error) {
      this.eventBus.emitError({
        moduleId: this.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: FeatureErrorCode.TTS_SPEAK_FAILED,
      });
      return this.error(
        `Failed to speak: ${error instanceof Error ? error.message : 'Unknown error'}`,
        FeatureErrorCode.TTS_SPEAK_FAILED
      );
    }
  }
  
  /**
   * Stop speaking
   * Requirements: 3.2
   */
  private async stopSpeaking(): Promise<FeatureResponse<void>> {
    if (!this.engine.getIsSpeaking()) {
      return this.error('No active speech', FeatureErrorCode.TTS_NO_ACTIVE_SPEECH);
    }
    
    const stopped = this.engine.stop();
    
    if (stopped) {
      this.currentUtterance = null;
      return this.success();
    }
    
    return this.error('Failed to stop speech', FeatureErrorCode.TTS_STOP_FAILED);
  }
  
  /**
   * Pause speaking
   * Requirements: 3.3
   */
  private async pauseSpeaking(): Promise<FeatureResponse<void>> {
    if (!this.engine.getIsSpeaking()) {
      return this.error('No active speech', FeatureErrorCode.TTS_NO_ACTIVE_SPEECH);
    }
    
    if (this.engine.getIsPaused()) {
      return this.error('Already paused', FeatureErrorCode.INVALID_ACTION);
    }
    
    const paused = this.engine.pause();
    
    if (paused) {
      return this.success();
    }
    
    return this.error('Pause not supported', FeatureErrorCode.INVALID_ACTION);
  }
  
  /**
   * Resume speaking
   * Requirements: 3.3
   */
  private async resumeSpeaking(): Promise<FeatureResponse<void>> {
    if (!this.engine.getIsPaused()) {
      return this.error('Not paused', FeatureErrorCode.INVALID_ACTION);
    }
    
    const resumed = this.engine.resume();
    
    if (resumed) {
      return this.success();
    }
    
    return this.error('Resume not supported', FeatureErrorCode.INVALID_ACTION);
  }
  
  /**
   * Get TTS status
   * Requirements: 3.5
   */
  private async getStatus(): Promise<FeatureResponse<TTSStatus>> {
    const status: TTSStatus = {
      isSpeaking: this.engine.getIsSpeaking(),
      isPaused: this.engine.getIsPaused(),
      currentUtterance: this.currentUtterance,
      queueLength: this.queue.length,
      currentVoice: this.config.voice,
      engineAvailable: this.engineAvailable,
    };
    
    return this.success(status);
  }
  
  /**
   * List available voices
   */
  private async listVoices(): Promise<FeatureResponse<VoiceInfo[]>> {
    const voices = this.engine.getVoices();
    return this.success(voices);
  }
  
  /**
   * Set current voice
   */
  private async setVoice(voice: string): Promise<FeatureResponse<void>> {
    if (!voice) {
      return this.error('Voice is required', FeatureErrorCode.INVALID_PARAMS);
    }
    
    const voices = this.engine.getVoices();
    const found = voices.find(v => v.id === voice || v.name === voice);
    
    if (!found) {
      return this.error(`Voice not found: ${voice}`, FeatureErrorCode.INVALID_PARAMS);
    }
    
    this.config.voice = voice;

    // Save to config
    await this.configManager.updateConfig('tts', this.config);

    return this.success();
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Public Accessors
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get current config
   */
  getConfig(): TTSConfig {
    return { ...this.config };
  }
}
