/**
 * Voice Input Module - Types
 * 
 * Type definitions for the voice input feature module.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Voice Input Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Voice input configuration
 */
export interface VoiceInputConfig {
  /** Listening timeout in seconds (1-15) */
  timeout: number;
  
  /** Speech recognition service to use */
  service: VoiceService;
  
  /** Language code (e.g., 'en-US') */
  language: string;
  
  /** Enable continuous listening mode */
  continuous: boolean;
  
  /** Minimum confidence threshold (0-1) */
  minConfidence: number;
}

/**
 * Available speech recognition services
 */
export type VoiceService = 
  | 'google'      // Google Speech Recognition (default)
  | 'whisper'     // OpenAI Whisper (local)
  | 'azure'       // Azure Speech Services
  | 'native';     // Native Web Speech API

// ═══════════════════════════════════════════════════════════════════════════════
// Voice Input Actions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Actions supported by the voice input module
 */
export type VoiceInputAction = 
  | 'start_listening'
  | 'stop_listening'
  | 'get_status'
  | 'check_microphone';

/**
 * Start listening request parameters
 */
export interface StartListeningParams {
  /** Override timeout (seconds) */
  timeout?: number;
  
  /** Language code override */
  language?: string;
  
  /** Enable continuous mode */
  continuous?: boolean;
}

/**
 * Transcription result
 */
export interface TranscriptionResult {
  /** The recognized text */
  transcript: string;
  
  /** Confidence score (0-1) */
  confidence?: number;
  
  /** Whether this is a final result */
  isFinal: boolean;
  
  /** Duration of audio processed (ms) */
  audioDuration?: number;
  
  /** Language detected */
  language?: string;
  
  /** Timestamp when transcription completed */
  timestamp: number;
}

/**
 * Voice input status
 */
export interface VoiceInputStatus {
  /** Whether currently listening */
  isListening: boolean;
  
  /** Current session ID */
  sessionId?: string;
  
  /** Time listening started */
  startTime?: number;
  
  /** Current duration (ms) */
  duration?: number;
  
  /** Whether microphone is available */
  microphoneAvailable: boolean;
  
  /** Current service being used */
  service: VoiceService;
}

/**
 * Microphone check result
 */
export interface MicrophoneCheckResult {
  /** Whether microphone is available */
  available: boolean;
  
  /** Microphone device name */
  deviceName?: string;
  
  /** Error message if unavailable */
  error?: string;
  
  /** List of available audio input devices */
  devices?: AudioInputDevice[];
}

/**
 * Audio input device info
 */
export interface AudioInputDevice {
  /** Device ID */
  id: string;
  
  /** Device name */
  name: string;
  
  /** Whether this is the default device */
  isDefault: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Voice Session Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Active voice input session
 */
export interface VoiceInputSession {
  /** Session ID */
  id: string;
  
  /** Session start time */
  startTime: number;
  
  /** Configured timeout (ms) */
  timeout: number;
  
  /** Language code */
  language: string;
  
  /** Whether continuous mode is enabled */
  continuous: boolean;
  
  /** Accumulated transcripts (for continuous mode) */
  transcripts: TranscriptionResult[];
}

/**
 * Voice input error types
 */
export enum VoiceInputErrorType {
  MICROPHONE_NOT_AVAILABLE = 'MICROPHONE_NOT_AVAILABLE',
  MICROPHONE_PERMISSION_DENIED = 'MICROPHONE_PERMISSION_DENIED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  NO_SPEECH_DETECTED = 'NO_SPEECH_DETECTED',
  RECOGNITION_FAILED = 'RECOGNITION_FAILED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Voice input error
 */
export interface VoiceInputError {
  type: VoiceInputErrorType;
  message: string;
  details?: string;
}
