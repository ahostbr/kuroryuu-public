/**
 * Voice Input Module - Core Implementation
 * 
 * Feature module for speech-to-text functionality.
 * Integrates with chatbot for voice input.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.8
 */

import {
  FeatureModuleBase,
  ModuleMetadata,
  FeatureResponse,
  FeatureErrorCode,
} from '../base';
import { FeatureEventBus } from '../event-bus';
import { ConfigManager } from '../config-manager';
import { SpeechRecognizer } from './speech-recognizer';
import {
  VoiceInputAction,
  VoiceInputConfig,
  VoiceInputStatus,
  VoiceInputSession,
  TranscriptionResult,
  StartListeningParams,
  MicrophoneCheckResult,
  VoiceInputErrorType,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Module Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * VoiceInputModule - Handles speech-to-text operations
 * Requirements: 2.1, 2.2, 2.3
 */
export class VoiceInputModule extends FeatureModuleBase {
  readonly id = 'voice-input';
  readonly name = 'Voice Input';
  readonly version = '1.0.0';

  private recognizer: SpeechRecognizer;
  private configManager: ConfigManager;
  private config: VoiceInputConfig;
  private activeSession: VoiceInputSession | null = null;
  private microphoneAvailable: boolean = false;

  constructor(eventBus: FeatureEventBus, configManager: ConfigManager) {
    super(eventBus);
    this.configManager = configManager;
    this.recognizer = new SpeechRecognizer();

    // Default config
    this.config = {
      timeout: 5,
      service: 'google',
      language: 'en-US',
      continuous: false,
      minConfidence: 0.5,
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
      description: 'Speech-to-text for chatbot voice input',
      supportedActions: this.getSupportedActions(),
      enabled: true,
    };
  }
  
  getSupportedActions(): string[] {
    return ['start_listening', 'stop_listening', 'get_status', 'check_microphone'];
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Initialize the voice input module
   * - Check microphone availability
   * - Load config
   * Requirements: 2.1
   */
  async initialize(): Promise<FeatureResponse<void>> {
    try {
      // Load config
      await this.configManager.load();
      this.loadConfig();

      // Check microphone availability
      const micCheck = await this.recognizer.checkMicrophone();
      this.microphoneAvailable = micCheck.available;

      if (!micCheck.available) {
        console.warn('[VoiceInputModule] Microphone not available:', micCheck.error);
      } else {
        console.log(`[VoiceInputModule] Microphone available: ${micCheck.deviceName}`);
      }

      this._isInitialized = true;

      return this.success();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown initialization error';
      return this.error(
        `Failed to initialize voice input module: ${message}`,
        FeatureErrorCode.INITIALIZATION_FAILED
      );
    }
  }
  
  /**
   * Execute a voice input action
   * Requirements: 2.1, 2.2, 2.3
   */
  async execute<T>(action: string, params?: Record<string, unknown>): Promise<FeatureResponse<T>> {
    const initError = this.requireInitialized();
    if (initError) {
      return initError as FeatureResponse<T>;
    }

    const actionError = this.validateAction(action);
    if (actionError) {
      return actionError as FeatureResponse<T>;
    }

    const voiceAction = action as VoiceInputAction;

    switch (voiceAction) {
      case 'start_listening':
        return this.startListening(params as unknown as StartListeningParams) as Promise<FeatureResponse<T>>;

      case 'stop_listening':
        return this.stopListening() as Promise<FeatureResponse<T>>;

      case 'get_status':
        return this.getStatus() as Promise<FeatureResponse<T>>;

      case 'check_microphone':
        return this.checkMicrophone() as Promise<FeatureResponse<T>>;

      default:
        return this.error(`Unsupported action: ${action}`, FeatureErrorCode.ACTION_NOT_SUPPORTED) as FeatureResponse<T>;
    }
  }
  
  /**
   * Shutdown the voice input module
   * - Stop any active listening session
   */
  async shutdown(): Promise<FeatureResponse<void>> {
    try {
      if (this.activeSession) {
        console.log('[VoiceInputModule] Stopping active session before shutdown');
        await this.stopListening();
      }
      this._isInitialized = false;
      return this.success();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown shutdown error';
      return this.error(message, FeatureErrorCode.UNKNOWN_ERROR);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Start listening for voice input
   * Requirements: 2.1, 2.2, 2.5, 2.8
   */
  private async startListening(params?: StartListeningParams): Promise<FeatureResponse<TranscriptionResult>> {
    if (!this.microphoneAvailable) {
      this.eventBus.emitError({
        moduleId: this.id,
        error: 'Microphone not available',
        errorCode: FeatureErrorCode.MICROPHONE_NOT_AVAILABLE,
      });

      return this.error(
        'Microphone is not available. Please check your audio settings.',
        FeatureErrorCode.MICROPHONE_NOT_AVAILABLE
      );
    }

    if (this.activeSession) {
      return this.error('Voice input session is already active', FeatureErrorCode.VOICE_INPUT_ALREADY_ACTIVE);
    }

    // Create session
    const timeout = params?.timeout ?? this.config.timeout;
    const language = params?.language ?? this.config.language;
    const continuous = params?.continuous ?? this.config.continuous;

    const sessionId = `voice_${Date.now()}`;
    this.activeSession = {
      id: sessionId,
      startTime: Date.now(),
      timeout: timeout * 1000,
      language,
      continuous,
      transcripts: [],
    };

    // Emit start event
    this.eventBus.emitVoiceInputStart(this.id);

    try {
      // Start recognition
      const result = await this.recognizer.listen({
        timeout: timeout * 1000,
        language,
        continuous,
      });

      // Emit complete event
      this.eventBus.emitVoiceInputComplete({
        moduleId: this.id,
        transcript: result.transcript,
        confidence: result.confidence,
      });

      this.activeSession = null;

      return this.success(result);
    } catch (error) {
      this.activeSession = null;

      const message = error instanceof Error ? error.message : 'Recognition failed';
      const errorType = this.categorizeError(error);

      this.eventBus.emitError({
        moduleId: this.id,
        error: message,
        errorCode: this.mapErrorTypeToCode(errorType),
      });

      return this.error(message, this.mapErrorTypeToCode(errorType));
    }
  }
  
  /**
   * Stop listening
   * Requirements: 2.3
   */
  private async stopListening(): Promise<FeatureResponse<TranscriptionResult | null>> {
    if (!this.activeSession) {
      return this.error('No active voice input session', FeatureErrorCode.NO_ACTIVE_VOICE_INPUT);
    }

    try {
      const result = await this.recognizer.stop();

      if (result) {
        this.eventBus.emitVoiceInputComplete({
          moduleId: this.id,
          transcript: result.transcript,
          confidence: result.confidence,
        });
      }

      this.activeSession = null;

      return this.success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop listening';

      this.activeSession = null;

      return this.error(message, FeatureErrorCode.VOICE_INPUT_STOP_FAILED);
    }
  }
  
  /**
   * Get current voice input status
   */
  private async getStatus(): Promise<FeatureResponse<VoiceInputStatus>> {
    const status: VoiceInputStatus = {
      isListening: this.activeSession !== null,
      microphoneAvailable: this.microphoneAvailable,
      service: this.config.service,
    };

    if (this.activeSession) {
      status.sessionId = this.activeSession.id;
      status.startTime = this.activeSession.startTime;
      status.duration = Date.now() - this.activeSession.startTime;
    }

    return this.success(status);
  }

  /**
   * Check microphone availability
   */
  private async checkMicrophone(): Promise<FeatureResponse<MicrophoneCheckResult>> {
    try {
      const result = await this.recognizer.checkMicrophone();
      this.microphoneAvailable = result.available;
      return this.success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check microphone';
      return this.error(message, FeatureErrorCode.MICROPHONE_CHECK_FAILED);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Load config from config manager
   */
  private loadConfig(): void {
    const voiceConfig = this.configManager.getVoiceInputConfig();

    this.config = {
      timeout: voiceConfig.timeout,
      service: 'google', // Default service
      language: 'en-US', // Default language (not in config-manager's VoiceInputConfig)
      continuous: false,
      minConfidence: 0.5,
    };

    console.log(`[VoiceInputModule] Loaded config: timeout=${this.config.timeout}s, language=${this.config.language}`);
  }
  
  /**
   * Categorize error type
   */
  private categorizeError(error: unknown): VoiceInputErrorType {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      
      if (msg.includes('microphone') || msg.includes('audio')) {
        return VoiceInputErrorType.MICROPHONE_NOT_AVAILABLE;
      }
      if (msg.includes('permission')) {
        return VoiceInputErrorType.MICROPHONE_PERMISSION_DENIED;
      }
      if (msg.includes('network') || msg.includes('connection')) {
        return VoiceInputErrorType.NETWORK_ERROR;
      }
      if (msg.includes('timeout')) {
        return VoiceInputErrorType.TIMEOUT;
      }
      if (msg.includes('no speech') || msg.includes('silence')) {
        return VoiceInputErrorType.NO_SPEECH_DETECTED;
      }
    }
    
    return VoiceInputErrorType.RECOGNITION_FAILED;
  }
  
  /**
   * Map error type to feature error code
   */
  private mapErrorTypeToCode(type: VoiceInputErrorType): FeatureErrorCode {
    switch (type) {
      case VoiceInputErrorType.MICROPHONE_NOT_AVAILABLE:
        return FeatureErrorCode.MICROPHONE_NOT_AVAILABLE;
      case VoiceInputErrorType.MICROPHONE_PERMISSION_DENIED:
        return FeatureErrorCode.MICROPHONE_PERMISSION_DENIED;
      case VoiceInputErrorType.NETWORK_ERROR:
        return FeatureErrorCode.VOICE_INPUT_NETWORK_ERROR;
      case VoiceInputErrorType.TIMEOUT:
        return FeatureErrorCode.VOICE_INPUT_TIMEOUT;
      case VoiceInputErrorType.NO_SPEECH_DETECTED:
        return FeatureErrorCode.VOICE_INPUT_NO_SPEECH;
      default:
        return FeatureErrorCode.VOICE_INPUT_FAILED;
    }
  }
  
  /**
   * Check if microphone is available
   */
  isMicrophoneAvailable(): boolean {
    return this.microphoneAvailable;
  }
  
  /**
   * Get current config
   */
  getConfig(): VoiceInputConfig {
    return { ...this.config };
  }
}
