/**
 * FFmpeg Wrapper
 * 
 * Handles ffmpeg command generation and execution for capture operations.
 * Supports multiple capture modes: desktop, primary, window, region.
 * 
 * Requirements: 1.6, 1.7, 1.8
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import { stat } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import {
  CapturePreset,
  CaptureMode,
  CaptureRegion,
  ScreenshotParams,
  ScreenshotResult,
  StartRecordingParams,
  StopRecordingResult,
  RecordingSession,
  FFmpegCommand,
  FFmpegCheck,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// FFmpeg Wrapper Implementation
// ═══════════════════════════════════════════════════════════════════════════════

export class FFmpegWrapper {
  private ffmpegPath: string = 'ffmpeg';
  private platform: NodeJS.Platform;
  
  constructor() {
    this.platform = process.platform;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Availability Check
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Check if ffmpeg is available
   * Requirements: 1.7
   */
  async checkAvailability(): Promise<FFmpegCheck> {
    try {
      const output = execSync(`${this.ffmpegPath} -version`, {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      });
      
      // Parse version from first line
      const versionMatch = output.match(/ffmpeg version (\S+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';
      
      return {
        available: true,
        path: this.ffmpegPath,
        version,
      };
    } catch (error) {
      return {
        available: false,
        error: 'ffmpeg not found in PATH. Please install ffmpeg.',
      };
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Screenshot Capture
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Capture a screenshot
   * Requirements: 1.1
   */
  async captureScreenshot(params: ScreenshotParams): Promise<ScreenshotResult> {
    const command = this.buildScreenshotCommand(params);
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const proc = spawn(command.executable, command.args, {
        windowsHide: true,
      });
      
      let stderr = '';
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg failed with code ${code}: ${stderr}`));
          return;
        }
        
        try {
          // Get file info
          const stats = await stat(params.outputPath);
          
          // Parse dimensions from stderr (ffmpeg outputs stream info)
          const dimensions = this.parseDimensions(stderr);
          
          resolve({
            filePath: params.outputPath,
            width: dimensions.width,
            height: dimensions.height,
            format: params.format || 'png',
            fileSize: stats.size,
            timestamp: startTime,
          });
        } catch (error) {
          reject(new Error(`Failed to read screenshot file: ${error}`));
        }
      });
      
      proc.on('error', (error) => {
        reject(new Error(`Failed to spawn ffmpeg: ${error.message}`));
      });
    });
  }
  
  /**
   * Build ffmpeg command for screenshot
   */
  private buildScreenshotCommand(params: ScreenshotParams): FFmpegCommand {
    const args: string[] = [];
    
    // Input source based on platform
    if (this.platform === 'win32') {
      args.push('-f', 'gdigrab');
      args.push(...this.getWindowsInputArgs(params.mode, params.windowTitle, params.region));
    } else if (this.platform === 'darwin') {
      args.push('-f', 'avfoundation');
      args.push(...this.getMacInputArgs(params.mode));
    } else {
      args.push('-f', 'x11grab');
      args.push(...this.getLinuxInputArgs(params.mode, params.region));
    }
    
    // Single frame
    args.push('-frames:v', '1');
    
    // Output format
    if (params.format === 'jpg') {
      args.push('-q:v', String(Math.max(1, Math.min(31, Math.round((100 - (params.quality || 90)) / 3)))));
    }
    
    // Overwrite output
    args.push('-y');
    
    // Output file
    args.push(params.outputPath);
    
    return {
      executable: this.ffmpegPath,
      args,
      fullCommand: `${this.ffmpegPath} ${args.join(' ')}`,
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Video Recording
  // ─────────────────────────────────────────────────────────────────────────────
  
  private activeProcesses: Map<string, ChildProcess> = new Map();
  
  /**
   * Start video recording
   * Requirements: 1.2, 1.6
   */
  async startRecording(params: StartRecordingParams, preset: CapturePreset): Promise<RecordingSession> {
    const command = this.buildRecordingCommand(params, preset);
    const sessionId = uuidv4();
    
    const proc = spawn(command.executable, command.args, {
      windowsHide: true,
      detached: false,
    });
    
    // Store process for later termination
    this.activeProcesses.set(sessionId, proc);
    
    // Log stderr for debugging
    proc.stderr.on('data', (data) => {
      console.log(`[ffmpeg:${sessionId}] ${data.toString().trim()}`);
    });
    
    proc.on('error', (error) => {
      console.error(`[ffmpeg:${sessionId}] Error: ${error.message}`);
      this.activeProcesses.delete(sessionId);
    });
    
    proc.on('close', (code) => {
      console.log(`[ffmpeg:${sessionId}] Process exited with code ${code}`);
      this.activeProcesses.delete(sessionId);
    });
    
    return {
      id: sessionId,
      pid: proc.pid!,
      outputPath: params.outputPath,
      preset: preset.key,
      mode: params.mode,
      startTime: Date.now(),
      windowTitle: params.windowTitle,
      region: params.region,
    };
  }
  
  /**
   * Stop video recording
   * Requirements: 1.3
   */
  async stopRecording(session: RecordingSession): Promise<StopRecordingResult> {
    const proc = this.activeProcesses.get(session.id);
    
    if (!proc) {
      throw new Error(`No active recording found for session ${session.id}`);
    }
    
    return new Promise((resolve, reject) => {
      const stopTime = Date.now();
      
      // Send 'q' to ffmpeg to gracefully stop
      proc.stdin?.write('q');
      
      // Fallback: force kill after timeout
      const killTimeout = setTimeout(() => {
        console.warn(`[ffmpeg:${session.id}] Force killing process`);
        proc.kill('SIGKILL');
      }, 5000);
      
      proc.on('close', async (code) => {
        clearTimeout(killTimeout);
        this.activeProcesses.delete(session.id);
        
        try {
          // Wait a bit for file to be finalized
          await new Promise(r => setTimeout(r, 500));
          
          const stats = await stat(session.outputPath);
          
          resolve({
            filePath: session.outputPath,
            duration: stopTime - session.startTime,
            fileSize: stats.size,
            preset: session.preset,
          });
        } catch (error) {
          reject(new Error(`Failed to read recording file: ${error}`));
        }
      });
    });
  }
  
  /**
   * Build ffmpeg command for video recording
   * Requirements: 1.6
   */
  private buildRecordingCommand(params: StartRecordingParams, preset: CapturePreset): FFmpegCommand {
    const args: string[] = [];
    
    // Input source based on platform
    if (this.platform === 'win32') {
      args.push('-f', 'gdigrab');
      args.push('-framerate', String(preset.fps));
      args.push(...this.getWindowsInputArgs(params.mode, params.windowTitle, params.region));
    } else if (this.platform === 'darwin') {
      args.push('-f', 'avfoundation');
      args.push('-framerate', String(preset.fps));
      args.push(...this.getMacInputArgs(params.mode));
    } else {
      args.push('-f', 'x11grab');
      args.push('-framerate', String(preset.fps));
      args.push(...this.getLinuxInputArgs(params.mode, params.region));
    }
    
    // Video codec
    args.push('-c:v', preset.codec);
    
    // Pixel format
    args.push('-pix_fmt', preset.pixelFormat);
    
    // CRF quality
    args.push('-crf', String(preset.crf));
    
    // Resolution override
    if (preset.resolution) {
      args.push('-s', preset.resolution);
    }
    
    // Extra args from preset
    if (preset.extraArgs) {
      args.push(...preset.extraArgs);
    }
    
    // Max duration
    if (params.maxDuration) {
      args.push('-t', String(params.maxDuration));
    }
    
    // Overwrite output
    args.push('-y');
    
    // Output file
    args.push(params.outputPath);
    
    return {
      executable: this.ffmpegPath,
      args,
      fullCommand: `${this.ffmpegPath} ${args.join(' ')}`,
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Platform-Specific Input Args
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get Windows-specific input arguments (gdigrab)
   */
  private getWindowsInputArgs(mode: CaptureMode, windowTitle?: string, region?: CaptureRegion): string[] {
    const args: string[] = [];
    
    switch (mode) {
      case 'desktop':
        args.push('-i', 'desktop');
        break;
        
      case 'primary':
        // gdigrab captures primary by default
        args.push('-i', 'desktop');
        break;
        
      case 'window':
        if (!windowTitle) {
          throw new Error('Window title is required for window capture mode');
        }
        args.push('-i', `title=${windowTitle}`);
        break;
        
      case 'region':
        if (!region) {
          throw new Error('Region is required for region capture mode');
        }
        args.push('-offset_x', String(region.x));
        args.push('-offset_y', String(region.y));
        args.push('-video_size', `${region.width}x${region.height}`);
        args.push('-i', 'desktop');
        break;
    }
    
    return args;
  }
  
  /**
   * Get macOS-specific input arguments (avfoundation)
   */
  private getMacInputArgs(mode: CaptureMode): string[] {
    // macOS captures the main screen with avfoundation
    // Device index 1 is typically the screen
    return ['-i', '1:none'];
  }
  
  /**
   * Get Linux-specific input arguments (x11grab)
   */
  private getLinuxInputArgs(mode: CaptureMode, region?: CaptureRegion): string[] {
    const args: string[] = [];
    const display = process.env.DISPLAY || ':0';
    
    if (mode === 'region' && region) {
      args.push('-video_size', `${region.width}x${region.height}`);
      args.push('-i', `${display}+${region.x},${region.y}`);
    } else {
      // Full screen capture
      args.push('-i', display);
    }
    
    return args;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Parse video dimensions from ffmpeg stderr output
   */
  private parseDimensions(stderr: string): { width: number; height: number } {
    // Look for "Video: ... WxH" pattern
    const match = stderr.match(/(\d{2,5})x(\d{2,5})/);
    
    if (match) {
      return {
        width: parseInt(match[1], 10),
        height: parseInt(match[2], 10),
      };
    }
    
    // Default fallback
    return { width: 0, height: 0 };
  }
  
  /**
   * Build command for external use (e.g., GUI preview)
   */
  buildCommand(params: ScreenshotParams | StartRecordingParams, preset?: CapturePreset): FFmpegCommand {
    if ('preset' in params && preset) {
      return this.buildRecordingCommand(params as StartRecordingParams, preset);
    }
    return this.buildScreenshotCommand(params as ScreenshotParams);
  }
  
  /**
   * Check if a recording session is active
   */
  isRecording(sessionId: string): boolean {
    return this.activeProcesses.has(sessionId);
  }
  
  /**
   * Get active recording count
   */
  getActiveRecordingCount(): number {
    return this.activeProcesses.size;
  }
}
