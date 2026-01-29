/**
 * Feature Error Types and Structured Responses
 * 
 * Provides structured error handling with error codes,
 * context preservation, and consistent error format.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Error Codes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standardized error codes for feature modules
 * Format: MODULE_ERROR_TYPE
 */
export enum FeatureErrorCode {
  // General errors (000-099)
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  INVALID_ACTION = 'INVALID_ACTION',
  INVALID_PARAMS = 'INVALID_PARAMS',
  TIMEOUT = 'TIMEOUT',
  CANCELLED = 'CANCELLED',
  
  // Capture errors (100-199)
  CAPTURE_FAILED = 'CAPTURE_FAILED',
  CAPTURE_NO_DISPLAY = 'CAPTURE_NO_DISPLAY',
  CAPTURE_PERMISSION_DENIED = 'CAPTURE_PERMISSION_DENIED',
  CAPTURE_INVALID_REGION = 'CAPTURE_INVALID_REGION',
  CAPTURE_FILE_WRITE_FAILED = 'CAPTURE_FILE_WRITE_FAILED',
  CAPTURE_FFMPEG_NOT_FOUND = 'CAPTURE_FFMPEG_NOT_FOUND',
  CAPTURE_PRESET_NOT_FOUND = 'CAPTURE_PRESET_NOT_FOUND',
  
  // Voice input errors (200-299)
  VOICE_INPUT_FAILED = 'VOICE_INPUT_FAILED',
  VOICE_INPUT_NO_MICROPHONE = 'VOICE_INPUT_NO_MICROPHONE',
  VOICE_INPUT_PERMISSION_DENIED = 'VOICE_INPUT_PERMISSION_DENIED',
  VOICE_INPUT_NOT_SUPPORTED = 'VOICE_INPUT_NOT_SUPPORTED',
  VOICE_INPUT_TIMEOUT = 'VOICE_INPUT_TIMEOUT',
  VOICE_INPUT_NO_SPEECH = 'VOICE_INPUT_NO_SPEECH',
  VOICE_INPUT_NETWORK_ERROR = 'VOICE_INPUT_NETWORK_ERROR',
  
  // TTS errors (300-399)
  TTS_FAILED = 'TTS_FAILED',
  TTS_BACKEND_UNAVAILABLE = 'TTS_BACKEND_UNAVAILABLE',
  TTS_VOICE_NOT_FOUND = 'TTS_VOICE_NOT_FOUND',
  TTS_INVALID_TEXT = 'TTS_INVALID_TEXT',
  TTS_AUDIO_OUTPUT_FAILED = 'TTS_AUDIO_OUTPUT_FAILED',
  TTS_RATE_LIMIT_EXCEEDED = 'TTS_RATE_LIMIT_EXCEEDED',
  
  // Config errors (400-499)
  CONFIG_LOAD_FAILED = 'CONFIG_LOAD_FAILED',
  CONFIG_SAVE_FAILED = 'CONFIG_SAVE_FAILED',
  CONFIG_VALIDATION_FAILED = 'CONFIG_VALIDATION_FAILED',
  CONFIG_FILE_NOT_FOUND = 'CONFIG_FILE_NOT_FOUND',
  CONFIG_PARSE_ERROR = 'CONFIG_PARSE_ERROR',
  
  // Resource errors (500-599)
  RESOURCE_BUSY = 'RESOURCE_BUSY',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
}

// ═══════════════════════════════════════════════════════════════════════════════
// Error Context
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Additional context for error tracking and debugging
 */
export interface ErrorContext {
  /** Module that generated the error */
  module: string;
  /** Action being performed when error occurred */
  action?: string;
  /** Input parameters that caused the error */
  params?: Record<string, unknown>;
  /** Stack trace (in development) */
  stack?: string;
  /** Timestamp of error */
  timestamp: string;
  /** Request/correlation ID for tracing */
  requestId?: string;
  /** Previous error in chain */
  cause?: ErrorContext;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Structured Error Response
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Structured error response following consistent format
 * Requirements: 7.2, 7.6
 */
export interface FeatureError {
  /** Error code for programmatic handling */
  code: FeatureErrorCode;
  /** Human-readable error message */
  message: string;
  /** Detailed context for debugging */
  context: ErrorContext;
  /** Whether error is recoverable */
  recoverable: boolean;
  /** Suggested recovery action */
  suggestion?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Error Factory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a structured feature error
 */
export function createFeatureError(
  code: FeatureErrorCode,
  message: string,
  module: string,
  options: {
    action?: string;
    params?: Record<string, unknown>;
    cause?: Error | FeatureError;
    recoverable?: boolean;
    suggestion?: string;
    requestId?: string;
  } = {}
): FeatureError {
  const { action, params, cause, recoverable = false, suggestion, requestId } = options;
  
  let causeContext: ErrorContext | undefined;
  if (cause) {
    if ('context' in cause) {
      causeContext = cause.context;
    } else {
      causeContext = {
        module: 'unknown',
        timestamp: new Date().toISOString(),
        stack: cause.stack,
      };
    }
  }
  
  return {
    code,
    message,
    context: {
      module,
      action,
      params: sanitizeParams(params),
      stack: process.env.NODE_ENV === 'development' ? new Error().stack : undefined,
      timestamp: new Date().toISOString(),
      requestId,
      cause: causeContext,
    },
    recoverable,
    suggestion,
  };
}

/**
 * Sanitize parameters to remove sensitive data
 */
function sanitizeParams(params?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!params) return undefined;
  
  const sensitiveKeys = ['password', 'token', 'key', 'secret', 'apiKey', 'api_key'];
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(params)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 1000) {
      sanitized[key] = `[STRING:${value.length} chars]`;
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Error Predicates
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if error is a FeatureError
 */
export function isFeatureError(error: unknown): error is FeatureError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'context' in error &&
    'recoverable' in error
  );
}

/**
 * Check if error code is from a specific module
 */
export function isModuleError(code: FeatureErrorCode, module: 'capture' | 'voice' | 'tts' | 'config'): boolean {
  const prefixMap = {
    capture: 'CAPTURE_',
    voice: 'VOICE_INPUT_',
    tts: 'TTS_',
    config: 'CONFIG_',
  };
  return code.startsWith(prefixMap[module]);
}

/**
 * Get recovery suggestion for common errors
 */
export function getErrorSuggestion(code: FeatureErrorCode): string | undefined {
  const suggestions: Partial<Record<FeatureErrorCode, string>> = {
    [FeatureErrorCode.CAPTURE_PERMISSION_DENIED]: 'Grant screen capture permission in system settings',
    [FeatureErrorCode.CAPTURE_FFMPEG_NOT_FOUND]: 'Install FFmpeg and ensure it is in PATH',
    [FeatureErrorCode.VOICE_INPUT_NO_MICROPHONE]: 'Connect a microphone and check system settings',
    [FeatureErrorCode.VOICE_INPUT_PERMISSION_DENIED]: 'Grant microphone permission in system settings',
    [FeatureErrorCode.VOICE_INPUT_NOT_SUPPORTED]: 'Use a browser/environment that supports Web Speech API',
    [FeatureErrorCode.TTS_BACKEND_UNAVAILABLE]: 'Check TTS service configuration or try native backend',
    [FeatureErrorCode.TTS_VOICE_NOT_FOUND]: 'Select a different voice or use system default',
    [FeatureErrorCode.CONFIG_FILE_NOT_FOUND]: 'Reset settings to defaults',
    [FeatureErrorCode.RESOURCE_BUSY]: 'Wait for current operation to complete',
  };
  return suggestions[code];
}

export default {
  FeatureErrorCode,
  createFeatureError,
  isFeatureError,
  isModuleError,
  getErrorSuggestion,
};
