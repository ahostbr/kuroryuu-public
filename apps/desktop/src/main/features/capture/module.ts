/**
 * Capture Module - Core Implementation
 * 
 * Feature module for desktop/window/region screenshots and video recording.
 * Uses ffmpeg for capture operations.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.5, 1.7, 1.9
 */

import {
  FeatureModuleBase,
  ModuleMetadata,
  FeatureResponse,
  FeatureErrorCode,
} from '../base';
import { FeatureEventBus } from '../event-bus';
import { ConfigManager, CapturePreset as ConfigCapturePreset } from '../config-manager';
import { FFmpegWrapper } from './ffmpeg-wrapper';
import {
  CaptureAction,
  CapturePreset,
  CaptureStatus,
  ScreenshotParams,
  ScreenshotResult,
  StartRecordingParams,
  StartRecordingResult,
  StopRecordingResult,
  RecordingSession,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Module Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CaptureModule - Handles desktop capture operations
 * Requirements: 1.1, 1.2, 1.3
 */
export class CaptureModule extends FeatureModuleBase {
  readonly id = 'capture';
  readonly name = 'Desktop Capture';
  readonly version = '1.0.0';

  private ffmpeg: FFmpegWrapper;
  private configManager: ConfigManager;
  private presets: Map<string, CapturePreset> = new Map();
  private activeSession: RecordingSession | null = null;
  private ffmpegAvailable: boolean = false;

  constructor(eventBus: FeatureEventBus, configManager: ConfigManager) {
    super(eventBus);
    this.configManager = configManager;
    this.ffmpeg = new FFmpegWrapper();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────────────────────────────────────

  getMetadata(): ModuleMetadata {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      description: 'Screenshot and video recording for desktop, windows, and regions',
      supportedActions: this.getSupportedActions(),
      enabled: true,
    };
  }
  
  getSupportedActions(): string[] {
    return ['screenshot', 'start_recording', 'stop_recording', 'get_status', 'list_presets'];
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Initialize the capture module
   * - Check ffmpeg availability
   * - Load presets from config
   * Requirements: 1.7
   */
  async initialize(): Promise<FeatureResponse<void>> {
    try {
      // Check ffmpeg availability
      const ffmpegCheck = await this.ffmpeg.checkAvailability();

      if (!ffmpegCheck.available) {
        console.warn('[CaptureModule] ffmpeg not available:', ffmpegCheck.error);
        this.ffmpegAvailable = false;
        // Don't fail initialization, but operations will fail
      } else {
        this.ffmpegAvailable = true;
        console.log(`[CaptureModule] ffmpeg available: ${ffmpegCheck.version}`);
      }

      // Load config and presets
      await this.configManager.load();
      this.loadPresets();

      this._isInitialized = true;

      return this.success();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown initialization error';
      return this.error(
        `Failed to initialize capture module: ${message}`,
        FeatureErrorCode.INITIALIZATION_FAILED
      );
    }
  }
  
  /**
   * Execute a capture action
   * Requirements: 1.1, 1.2, 1.3
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

    const captureAction = action as CaptureAction;

    switch (captureAction) {
      case 'screenshot':
        return this.takeScreenshot(params as unknown as ScreenshotParams) as Promise<FeatureResponse<T>>;

      case 'start_recording':
        return this.startRecording(params as unknown as StartRecordingParams) as Promise<FeatureResponse<T>>;

      case 'stop_recording':
        return this.stopRecording() as Promise<FeatureResponse<T>>;

      case 'get_status':
        return this.getStatus() as Promise<FeatureResponse<T>>;

      case 'list_presets':
        return this.listPresets() as Promise<FeatureResponse<T>>;

      default:
        return this.error(`Unsupported action: ${action}`, FeatureErrorCode.ACTION_NOT_SUPPORTED) as FeatureResponse<T>;
    }
  }
  
  /**
   * Shutdown the capture module
   * - Stop any active recording
   */
  async shutdown(): Promise<FeatureResponse<void>> {
    try {
      if (this.activeSession) {
        console.log('[CaptureModule] Stopping active recording before shutdown');
        await this.stopRecording();
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
   * Take a screenshot
   * Requirements: 1.1, 1.9
   */
  private async takeScreenshot(params: ScreenshotParams): Promise<FeatureResponse<ScreenshotResult>> {
    if (!this.ffmpegAvailable) {
      return this.error(
        'ffmpeg is not available. Please install ffmpeg and ensure it is in PATH.',
        FeatureErrorCode.FFMPEG_NOT_FOUND
      );
    }

    try {
      const result = await this.ffmpeg.captureScreenshot(params);

      // Emit event
      this.eventBus.emitCaptureScreenshotComplete({
        moduleId: this.id,
        filePath: result.filePath,
        width: result.width,
        height: result.height,
      });

      return this.success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Screenshot failed';

      this.eventBus.emitError({
        moduleId: this.id,
        error: message,
        errorCode: FeatureErrorCode.CAPTURE_FAILED,
      });

      return this.error(message, FeatureErrorCode.CAPTURE_FAILED);
    }
  }
  
  /**
   * Start video recording
   * Requirements: 1.2, 1.6, 1.9
   */
  private async startRecording(params: StartRecordingParams): Promise<FeatureResponse<StartRecordingResult>> {
    if (!this.ffmpegAvailable) {
      return this.error(
        'ffmpeg is not available. Please install ffmpeg and ensure it is in PATH.',
        FeatureErrorCode.FFMPEG_NOT_FOUND
      );
    }

    if (this.activeSession) {
      return this.error('A recording is already in progress', FeatureErrorCode.RECORDING_ALREADY_ACTIVE);
    }

    // Get preset
    const preset = this.presets.get(params.preset);
    if (!preset) {
      return this.error(`Unknown preset: ${params.preset}`, FeatureErrorCode.INVALID_PRESET);
    }

    try {
      const session = await this.ffmpeg.startRecording(params, preset);
      this.activeSession = session;

      // Emit event
      this.eventBus.emitCaptureRecordStart({
        moduleId: this.id,
        preset: params.preset,
        mode: params.mode,
        outputPath: params.outputPath,
      });

      return this.success({
        sessionId: session.id,
        outputPath: session.outputPath,
        preset: params.preset,
        startTime: session.startTime,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start recording';

      this.eventBus.emitError({
        moduleId: this.id,
        error: message,
        errorCode: FeatureErrorCode.RECORDING_START_FAILED,
      });

      return this.error(message, FeatureErrorCode.RECORDING_START_FAILED);
    }
  }
  
  /**
   * Stop video recording
   * Requirements: 1.3, 1.9
   */
  private async stopRecording(): Promise<FeatureResponse<StopRecordingResult>> {
    if (!this.activeSession) {
      return this.error('No recording is currently active', FeatureErrorCode.NO_ACTIVE_RECORDING);
    }

    try {
      const result = await this.ffmpeg.stopRecording(this.activeSession);
      this.activeSession = null;

      // Emit event
      this.eventBus.emitCaptureRecordStop({
        moduleId: this.id,
        filePath: result.filePath,
        duration: result.duration,
        fileSize: result.fileSize,
      });

      return this.success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop recording';

      this.eventBus.emitError({
        moduleId: this.id,
        error: message,
        errorCode: FeatureErrorCode.RECORDING_STOP_FAILED,
      });

      return this.error(message, FeatureErrorCode.RECORDING_STOP_FAILED);
    }
  }
  
  /**
   * Get current capture status
   */
  private async getStatus(): Promise<FeatureResponse<CaptureStatus>> {
    const status: CaptureStatus = {
      isRecording: this.activeSession !== null,
    };

    if (this.activeSession) {
      status.sessionId = this.activeSession.id;
      status.outputPath = this.activeSession.outputPath;
      status.preset = this.activeSession.preset;
      status.startTime = this.activeSession.startTime;
      status.duration = Date.now() - this.activeSession.startTime;
    }

    return this.success(status);
  }

  /**
   * List available presets
   */
  private async listPresets(): Promise<FeatureResponse<CapturePreset[]>> {
    return this.success(Array.from(this.presets.values()));
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Load presets from config
   */
  private loadPresets(): void {
    const captureConfig = this.configManager.getCaptureConfig();

    for (const configPreset of captureConfig.presets) {
      const preset = this.convertConfigPreset(configPreset);
      this.presets.set(preset.key, preset);
    }

    console.log(`[CaptureModule] Loaded ${this.presets.size} presets`);
  }

  /**
   * Convert config-manager preset to capture module preset
   */
  private convertConfigPreset(configPreset: ConfigCapturePreset): CapturePreset {
    return {
      key: configPreset.key,
      name: configPreset.name,
      description: configPreset.description ?? '',
      fps: configPreset.overrides.fps,
      codec: 'libx264', // Default codec, x264_preset determines encoding speed
      pixelFormat: configPreset.overrides.pix_fmt as 'yuv444p' | 'yuv420p' | 'nv12',
      crf: configPreset.overrides.crf,
      resolution: configPreset.overrides.resolution
        ? `${configPreset.overrides.resolution.width}x${configPreset.overrides.resolution.height}`
        : undefined,
      extraArgs: ['-preset', configPreset.overrides.x264_preset],
    };
  }
  
  /**
   * Check if ffmpeg is available
   */
  isFFmpegAvailable(): boolean {
    return this.ffmpegAvailable;
  }
  
  /**
   * Get preset by key
   */
  getPreset(key: string): CapturePreset | undefined {
    return this.presets.get(key);
  }
}
