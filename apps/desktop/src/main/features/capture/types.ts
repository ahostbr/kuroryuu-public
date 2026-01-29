/**
 * Capture Module - Types
 * 
 * Type definitions for the capture feature module.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.6
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Capture Modes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Capture mode determines what gets captured
 */
export type CaptureMode = 
  | 'desktop'     // All monitors combined
  | 'primary'     // Primary monitor only  
  | 'window'      // Specific window by title
  | 'region';     // Custom region (x, y, width, height)

/**
 * Region specification for region capture mode
 */
export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Capture Presets
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Video codec options
 */
export type VideoCodec = 'libx264' | 'libx265' | 'h264_nvenc' | 'hevc_nvenc';

/**
 * Pixel format options (chroma subsampling)
 */
export type PixelFormat = 'yuv444p' | 'yuv420p' | 'nv12';

/**
 * Capture preset configuration
 * Requirements: 1.6
 */
export interface CapturePreset {
  /** Unique preset identifier */
  key: string;
  
  /** Human-readable name */
  name: string;
  
  /** Description of use case */
  description: string;
  
  /** Frames per second */
  fps: number;
  
  /** Video codec */
  codec: VideoCodec;
  
  /** Pixel format (chroma subsampling) */
  pixelFormat: PixelFormat;
  
  /** CRF value (lower = better quality, larger file) */
  crf: number;
  
  /** Optional resolution override (e.g., "1920x1080") */
  resolution?: string;
  
  /** Additional ffmpeg arguments */
  extraArgs?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Capture Actions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Actions supported by the capture module
 */
export type CaptureAction = 
  | 'screenshot'
  | 'start_recording'
  | 'stop_recording'
  | 'get_status'
  | 'list_presets';

/**
 * Screenshot request parameters
 */
export interface ScreenshotParams {
  mode: CaptureMode;
  outputPath: string;
  windowTitle?: string;  // Required for 'window' mode
  region?: CaptureRegion; // Required for 'region' mode
  format?: 'png' | 'jpg';
  quality?: number; // 1-100 for jpg
}

/**
 * Screenshot result
 */
export interface ScreenshotResult {
  filePath: string;
  width: number;
  height: number;
  format: string;
  fileSize: number;
  timestamp: number;
}

/**
 * Start recording request parameters
 */
export interface StartRecordingParams {
  mode: CaptureMode;
  outputPath: string;
  preset: string; // Preset key
  windowTitle?: string;
  region?: CaptureRegion;
  maxDuration?: number; // Max recording duration in seconds
}

/**
 * Start recording result
 */
export interface StartRecordingResult {
  sessionId: string;
  outputPath: string;
  preset: string;
  startTime: number;
}

/**
 * Stop recording result
 */
export interface StopRecordingResult {
  filePath: string;
  duration: number; // milliseconds
  fileSize: number;
  preset: string;
}

/**
 * Capture status
 */
export interface CaptureStatus {
  isRecording: boolean;
  sessionId?: string;
  outputPath?: string;
  preset?: string;
  startTime?: number;
  duration?: number; // Current duration in ms if recording
}

// ═══════════════════════════════════════════════════════════════════════════════
// FFmpeg Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FFmpeg command configuration
 */
export interface FFmpegCommand {
  executable: string;
  args: string[];
  fullCommand: string;
}

/**
 * FFmpeg availability check result
 */
export interface FFmpegCheck {
  available: boolean;
  path?: string;
  version?: string;
  error?: string;
}

/**
 * Active recording session
 */
export interface RecordingSession {
  id: string;
  pid: number;
  outputPath: string;
  preset: string;
  mode: CaptureMode;
  startTime: number;
  windowTitle?: string;
  region?: CaptureRegion;
}
