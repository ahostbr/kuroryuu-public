/**
 * TTS Module Types
 * 
 * Type definitions for Text-to-Speech functionality
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Service Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Supported TTS services
 */
export type TTSService = 'native' | 'google' | 'azure' | 'amazon';

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TTS configuration
 * Requirements: 3.4
 */
export interface TTSConfig {
  /** TTS service to use */
  service: TTSService;
  /** Voice identifier */
  voice: string;
  /** Speech rate (0.1-2.0, default 1.0) */
  rate: number;
  /** Pitch adjustment (0.5-2.0, default 1.0) */
  pitch: number;
  /** Volume (0.0-1.0, default 1.0) */
  volume: number;
  /** Language code (e.g., 'en-US') */
  language: string;
}

/**
 * Voice information
 */
export interface VoiceInfo {
  /** Voice identifier */
  id: string;
  /** Display name */
  name: string;
  /** Language code */
  language: string;
  /** Whether voice is local/native */
  isLocal: boolean;
  /** Sample audio URL (optional) */
  sampleUrl?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Action Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TTS module actions
 */
export type TTSAction = 
  | 'speak'
  | 'stop'
  | 'pause'
  | 'resume'
  | 'get_status'
  | 'list_voices'
  | 'set_voice';

// ═══════════════════════════════════════════════════════════════════════════════
// Request/Response Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parameters for speak action
 * Requirements: 3.1
 */
export interface SpeakParams {
  /** Text to speak */
  text: string;
  /** Override voice for this utterance */
  voice?: string;
  /** Override rate for this utterance */
  rate?: number;
  /** Override pitch for this utterance */
  pitch?: number;
  /** Override volume for this utterance */
  volume?: number;
  /** Priority level (higher = interrupt current speech) */
  priority?: number;
}

/**
 * Speech utterance tracking
 */
export interface SpeechUtterance {
  /** Unique identifier */
  id: string;
  /** Text being spoken */
  text: string;
  /** Voice being used */
  voice: string;
  /** Start time */
  startTime: number;
  /** Estimated duration in ms */
  estimatedDuration: number;
  /** Current state */
  state: 'pending' | 'speaking' | 'paused' | 'completed' | 'cancelled';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Status Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TTS module status
 * Requirements: 3.5
 */
export interface TTSStatus {
  /** Whether TTS is currently speaking */
  isSpeaking: boolean;
  /** Whether TTS is paused */
  isPaused: boolean;
  /** Current utterance if speaking */
  currentUtterance: SpeechUtterance | null;
  /** Queue of pending utterances */
  queueLength: number;
  /** Currently selected voice */
  currentVoice: string;
  /** TTS engine available */
  engineAvailable: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Error Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TTS-specific error types
 */
export enum TTSErrorType {
  /** TTS engine not available */
  ENGINE_NOT_AVAILABLE = 'ENGINE_NOT_AVAILABLE',
  /** Voice not found */
  VOICE_NOT_FOUND = 'VOICE_NOT_FOUND',
  /** Text is empty */
  EMPTY_TEXT = 'EMPTY_TEXT',
  /** Text too long */
  TEXT_TOO_LONG = 'TEXT_TOO_LONG',
  /** Speech synthesis failed */
  SYNTHESIS_FAILED = 'SYNTHESIS_FAILED',
  /** Already speaking (for non-queued requests) */
  ALREADY_SPEAKING = 'ALREADY_SPEAKING',
  /** No active speech to stop/pause */
  NO_ACTIVE_SPEECH = 'NO_ACTIVE_SPEECH',
  /** Network error (for cloud TTS) */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Rate limit exceeded */
  RATE_LIMIT = 'RATE_LIMIT',
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TTS speak start event data
 */
export interface TTSSpeakStartData {
  utteranceId: string;
  text: string;
  voice: string;
  estimatedDuration: number;
}

/**
 * TTS speak complete event data
 */
export interface TTSSpeakCompleteData {
  utteranceId: string;
  text: string;
  actualDuration: number;
  wasInterrupted: boolean;
}

/**
 * TTS error event data
 */
export interface TTSErrorData {
  utteranceId?: string;
  error: string;
  errorType: TTSErrorType;
}
