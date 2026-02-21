/**
 * Feature Module Base Classes and Interfaces
 * 
 * Provides the foundation for pluggable desktop features:
 * - Screen Capture (sidebar GUI)
 * - Voice Input (chatbot mic button)
 * - TTS (chatbot speak button)
 * 
 * Requirements: 4.5 - Feature_Module interface with lifecycle methods
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Response Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standard success response from a feature module
 */
export interface FeatureSuccess<T = unknown> {
  ok: true;
  result?: T;
}

/**
 * Standard error response from a feature module
 */
export interface FeatureError {
  ok: false;
  error: string;
  errorCode: FeatureErrorCode;
}

/**
 * Union type for all feature responses
 */
export type FeatureResponse<T = unknown> = FeatureSuccess<T> | FeatureError;

/**
 * Standard error codes for feature modules
 * Requirements: 6.2 - Structured error responses with error codes
 */
export enum FeatureErrorCode {
  // General
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  ALREADY_INITIALIZED = 'ALREADY_INITIALIZED',
  INVALID_ACTION = 'INVALID_ACTION',
  INVALID_PARAMS = 'INVALID_PARAMS',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  MODULE_NOT_INITIALIZED = 'MODULE_NOT_INITIALIZED',
  ACTION_NOT_SUPPORTED = 'ACTION_NOT_SUPPORTED',
  
  // Capture-specific
  FFMPEG_NOT_FOUND = 'FFMPEG_NOT_FOUND',
  CAPTURE_FAILED = 'CAPTURE_FAILED',
  RECORDING_IN_PROGRESS = 'RECORDING_IN_PROGRESS',
  NO_RECORDING_ACTIVE = 'NO_RECORDING_ACTIVE',
  RECORDING_ALREADY_ACTIVE = 'RECORDING_ALREADY_ACTIVE',
  INVALID_PRESET = 'INVALID_PRESET',
  NO_ACTIVE_RECORDING = 'NO_ACTIVE_RECORDING',
  RECORDING_START_FAILED = 'RECORDING_START_FAILED',
  RECORDING_STOP_FAILED = 'RECORDING_STOP_FAILED',
  
  // Voice-specific
  MICROPHONE_NOT_AVAILABLE = 'MICROPHONE_NOT_AVAILABLE',
  MICROPHONE_PERMISSION_DENIED = 'MICROPHONE_PERMISSION_DENIED',
  MICROPHONE_CHECK_FAILED = 'MICROPHONE_CHECK_FAILED',
  SPEECH_RECOGNITION_FAILED = 'SPEECH_RECOGNITION_FAILED',
  NO_SPEECH_DETECTED = 'NO_SPEECH_DETECTED',
  VOICE_INPUT_ALREADY_ACTIVE = 'VOICE_INPUT_ALREADY_ACTIVE',
  NO_ACTIVE_VOICE_INPUT = 'NO_ACTIVE_VOICE_INPUT',
  VOICE_INPUT_STOP_FAILED = 'VOICE_INPUT_STOP_FAILED',
  VOICE_INPUT_NETWORK_ERROR = 'VOICE_INPUT_NETWORK_ERROR',
  VOICE_INPUT_TIMEOUT = 'VOICE_INPUT_TIMEOUT',
  VOICE_INPUT_NO_SPEECH = 'VOICE_INPUT_NO_SPEECH',
  VOICE_INPUT_FAILED = 'VOICE_INPUT_FAILED',
  
  // TTS-specific
  TTS_BACKEND_UNAVAILABLE = 'TTS_BACKEND_UNAVAILABLE',
  TTS_ALL_BACKENDS_FAILED = 'TTS_ALL_BACKENDS_FAILED',
  VOICE_NOT_FOUND = 'VOICE_NOT_FOUND',
  TTS_SPEAK_FAILED = 'TTS_SPEAK_FAILED',
  TTS_NO_ACTIVE_SPEECH = 'TTS_NO_ACTIVE_SPEECH',
  TTS_STOP_FAILED = 'TTS_STOP_FAILED',
  
  // Config-specific
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_LOAD_FAILED = 'CONFIG_LOAD_FAILED',
  CONFIG_SAVE_FAILED = 'CONFIG_SAVE_FAILED',
  
  // Module-specific
  MODULE_LOAD_FAILED = 'MODULE_LOAD_FAILED',
  MODULE_NOT_FOUND = 'MODULE_NOT_FOUND',
}

// ═══════════════════════════════════════════════════════════════════════════════
// Feature Module Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base interface for all feature modules
 * Requirements: 4.5 - Standard lifecycle methods: initialize, execute, shutdown
 */
export interface IFeatureModule {
  /** Unique identifier for this module */
  readonly id: string;
  
  /** Human-readable name */
  readonly name: string;
  
  /** Module version */
  readonly version: string;
  
  /** Whether the module is currently initialized */
  readonly isInitialized: boolean;
  
  /**
   * Initialize the module
   * Requirements: 4.1 - Feature_Manager discovers and loads modules
   */
  initialize(): Promise<FeatureResponse<void>>;
  
  /**
   * Execute an action on this module
   * Requirements: 4.3 - Feature_Manager routes calls to appropriate modules
   * 
   * @param action - The action to execute (e.g., "screenshot", "listen", "speak")
   * @param params - Parameters for the action
   */
  execute<T = unknown>(action: string, params: Record<string, unknown>): Promise<FeatureResponse<T>>;
  
  /**
   * Gracefully shutdown the module
   * Requirements: 4.8 - Feature_Manager gracefully shuts down modules
   */
  shutdown(): Promise<FeatureResponse<void>>;
  
  /**
   * Get list of supported actions
   */
  getSupportedActions(): string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event types emitted by feature modules
 * Requirements: 4.7 - Feature_Module shall emit events
 */
export enum FeatureEventType {
  // Module lifecycle
  MODULE_INITIALIZED = 'module:initialized',
  MODULE_SHUTDOWN = 'module:shutdown',
  MODULE_ERROR = 'module:error',
  
  // Capture events
  CAPTURE_SCREENSHOT_COMPLETE = 'capture:screenshot:complete',
  CAPTURE_RECORD_START = 'capture:record:start',
  CAPTURE_RECORD_STOP = 'capture:record:stop',
  CAPTURE_ERROR = 'capture:error',
  
  // Voice input events
  VOICE_INPUT_START = 'voice:input:start',
  VOICE_INPUT_COMPLETE = 'voice:input:complete',
  VOICE_INPUT_ERROR = 'voice:input:error',
  
  // TTS events
  TTS_SPEAK_START = 'tts:speak:start',
  TTS_SPEAK_COMPLETE = 'tts:speak:complete',
  TTS_ERROR = 'tts:error',
}

/**
 * Base event data structure
 */
export interface FeatureEventData {
  moduleId: string;
  timestamp: number;
}

/**
 * Capture screenshot complete event
 */
export interface CaptureScreenshotCompleteEvent extends FeatureEventData {
  filePath: string;
  width: number;
  height: number;
}

/**
 * Capture record start event
 */
export interface CaptureRecordStartEvent extends FeatureEventData {
  preset: string;
  mode: string;
  outputPath: string;
}

/**
 * Capture record stop event
 */
export interface CaptureRecordStopEvent extends FeatureEventData {
  filePath: string;
  duration: number;
  fileSize: number;
}

/**
 * Voice input complete event
 */
export interface VoiceInputCompleteEvent extends FeatureEventData {
  transcript: string;
  confidence?: number;
}

/**
 * TTS speak start event
 */
export interface TTSSpeakStartEvent extends FeatureEventData {
  text: string;
  voice?: string;
  backend: string;
}

/**
 * TTS speak complete event
 */
export interface TTSSpeakCompleteEvent extends FeatureEventData {
  text: string;
  duration: number;
  filePath?: string;
}

/**
 * Error event data
 */
export interface FeatureErrorEvent extends FeatureEventData {
  error: string;
  errorCode: FeatureErrorCode;
  action?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Module Registration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Module metadata for registration
 */
export interface ModuleMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  supportedActions: string[];
  enabled: boolean;
}

/**
 * Module factory function type
 */
export type ModuleFactory = () => IFeatureModule;

// ═══════════════════════════════════════════════════════════════════════════════
// Abstract Base Class
// ═══════════════════════════════════════════════════════════════════════════════

// Forward declaration for EventBus to avoid circular imports
export interface IEventBus {
  emitEvent(type: string, data: unknown): void;
  emitCaptureScreenshotComplete(data: unknown): void;
  emitCaptureRecordStart(data: unknown): void;
  emitCaptureRecordStop(data: unknown): void;
  emitVoiceInputStart(moduleId: string): void;
  emitVoiceInputComplete(data: unknown): void;
  emitTTSSpeakStart(data: unknown): void;
  emitTTSSpeakComplete(data: unknown): void;
  emitError(data: unknown): void;
}

/**
 * Abstract base class for feature modules
 * Provides common functionality and enforces interface compliance
 */
export abstract class FeatureModuleBase implements IFeatureModule {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly version: string;
  
  protected _isInitialized = false;
  protected eventBus: IEventBus;
  
  constructor(eventBus: IEventBus) {
    this.eventBus = eventBus;
  }
  
  get isInitialized(): boolean {
    return this._isInitialized;
  }
  
  abstract initialize(): Promise<FeatureResponse<void>>;
  abstract execute<T = unknown>(action: string, params: Record<string, unknown>): Promise<FeatureResponse<T>>;
  abstract shutdown(): Promise<FeatureResponse<void>>;
  abstract getSupportedActions(): string[];
  
  /**
   * Helper to create success response
   */
  protected success<T>(result?: T): FeatureSuccess<T> {
    return { ok: true, result };
  }
  
  /**
   * Helper to create error response
   */
  protected error(message: string, code: FeatureErrorCode = FeatureErrorCode.UNKNOWN_ERROR): FeatureError {
    return { ok: false, error: message, errorCode: code };
  }
  
  /**
   * Check if module is initialized before executing
   */
  protected requireInitialized(): FeatureError | null {
    if (!this._isInitialized) {
      return this.error('Module not initialized', FeatureErrorCode.MODULE_NOT_INITIALIZED);
    }
    return null;
  }
  
  /**
   * Validate action is supported
   */
  protected validateAction(action: string): FeatureError | null {
    if (!this.getSupportedActions().includes(action)) {
      return this.error(`Unknown action: ${action}`, FeatureErrorCode.ACTION_NOT_SUPPORTED);
    }
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Type Guards
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type guard to check if response is success
 */
export function isSuccess<T>(response: FeatureResponse<T>): response is FeatureSuccess<T> {
  return response.ok === true;
}

/**
 * Type guard to check if response is error
 */
export function isError(response: FeatureResponse<unknown>): response is FeatureError {
  return response.ok === false;
}
