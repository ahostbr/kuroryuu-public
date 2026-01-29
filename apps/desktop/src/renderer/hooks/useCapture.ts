/**
 * Capture Hook - React Integration
 * 
 * Custom hook for integrating capture functionality with React components.
 * Handles IPC communication and event subscription.
 * 
 * Requirements: 1.9
 */

import { useState, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface CapturePreset {
  key: string;
  name: string;
  description: string;
  fps: number;
  codec: string;
  pixelFormat: string;
  crf: number;
  resolution?: string;
}

type CaptureMode = 'desktop' | 'primary' | 'window' | 'region';

interface CaptureStatus {
  isRecording: boolean;
  sessionId?: string;
  outputPath?: string;
  preset?: string;
  startTime?: number;
  duration?: number;
}

interface ScreenshotResult {
  filePath: string;
  width: number;
  height: number;
  format: string;
  fileSize: number;
  timestamp: number;
}

interface RecordingResult {
  filePath: string;
  duration: number;
  fileSize: number;
  preset: string;
}

interface UseCaptureOptions {
  onScreenshotComplete?: (result: ScreenshotResult) => void;
  onRecordingStart?: (sessionId: string) => void;
  onRecordingStop?: (result: RecordingResult) => void;
  onError?: (error: string) => void;
}

interface UseCaptureReturn {
  // State
  status: CaptureStatus;
  presets: CapturePreset[];
  isLoading: boolean;
  error: string | null;
  ffmpegAvailable: boolean;
  
  // Actions
  takeScreenshot: (mode: CaptureMode, outputPath: string, windowTitle?: string) => Promise<ScreenshotResult | null>;
  startRecording: (mode: CaptureMode, preset: string, outputPath: string, windowTitle?: string) => Promise<boolean>;
  stopRecording: () => Promise<RecordingResult | null>;
  refreshStatus: () => Promise<void>;
  refreshPresets: () => Promise<void>;
  
  // Utilities
  browseOutputDirectory: () => Promise<string | null>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for capture functionality
 * Integrates with main process via IPC
 */
export function useCapture(options: UseCaptureOptions = {}): UseCaptureReturn {
  const { onScreenshotComplete, onRecordingStart, onRecordingStop, onError } = options;
  
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────
  
  const [status, setStatus] = useState<CaptureStatus>({ isRecording: false });
  const [presets, setPresets] = useState<CapturePreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ffmpegAvailable, setFfmpegAvailable] = useState(true);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // IPC Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  
  const invokeCapture = useCallback(async <T>(action: string, params?: unknown): Promise<T | null> => {
    try {
      // @ts-expect-error - window.api is injected by preload
      const result = await window.api?.capture?.[action]?.(params);
      
      if (result?.success) {
        return result.data;
      } else if (result?.error) {
        setError(result.error.message);
        onError?.(result.error.message);
        return null;
      }
      
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      onError?.(message);
      return null;
    }
  }, [onError]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────────
  
  const takeScreenshot = useCallback(async (
    mode: CaptureMode,
    outputPath: string,
    windowTitle?: string
  ): Promise<ScreenshotResult | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await invokeCapture<ScreenshotResult>('screenshot', {
        mode,
        outputPath,
        windowTitle,
      });
      
      if (result) {
        onScreenshotComplete?.(result);
      }
      
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [invokeCapture, onScreenshotComplete]);
  
  const startRecording = useCallback(async (
    mode: CaptureMode,
    preset: string,
    outputPath: string,
    windowTitle?: string
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await invokeCapture<{ sessionId: string }>('start_recording', {
        mode,
        preset,
        outputPath,
        windowTitle,
      });
      
      if (result?.sessionId) {
        setStatus({
          isRecording: true,
          sessionId: result.sessionId,
          outputPath,
          preset,
          startTime: Date.now(),
        });
        onRecordingStart?.(result.sessionId);
        return true;
      }
      
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [invokeCapture, onRecordingStart]);
  
  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await invokeCapture<RecordingResult>('stop_recording', {});
      
      if (result) {
        setStatus({ isRecording: false });
        onRecordingStop?.(result);
      }
      
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [invokeCapture, onRecordingStop]);
  
  const refreshStatus = useCallback(async (): Promise<void> => {
    const result = await invokeCapture<CaptureStatus>('get_status', {});
    if (result) {
      setStatus(result);
    }
  }, [invokeCapture]);
  
  const refreshPresets = useCallback(async (): Promise<void> => {
    const result = await invokeCapture<CapturePreset[]>('list_presets', {});
    if (result) {
      setPresets(result);
    }
  }, [invokeCapture]);
  
  const browseOutputDirectory = useCallback(async (): Promise<string | null> => {
    try {
      // @ts-expect-error - window.api is injected by preload
      const result = await window.api?.dialog?.showOpenDialog?.({
        properties: ['openDirectory'],
        title: 'Select Output Directory',
      });
      
      if (result?.filePaths?.[0]) {
        return result.filePaths[0];
      }
      return null;
    } catch {
      return null;
    }
  }, []);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Event Subscriptions
  // ─────────────────────────────────────────────────────────────────────────────
  
  useEffect(() => {
    // Subscribe to capture events from main process
    // @ts-expect-error - window.api is injected by preload
    const unsubScreenshot = window.api?.capture?.onScreenshotComplete?.((result: ScreenshotResult) => {
      onScreenshotComplete?.(result);
    });
    
    // @ts-expect-error - window.api is injected by preload
    const unsubRecordStop = window.api?.capture?.onRecordingStop?.((result: RecordingResult) => {
      setStatus({ isRecording: false });
      onRecordingStop?.(result);
    });
    
    // @ts-expect-error - window.api is injected by preload  
    const unsubError = window.api?.capture?.onError?.((err: { message: string }) => {
      setError(err.message);
      onError?.(err.message);
    });
    
    return () => {
      unsubScreenshot?.();
      unsubRecordStop?.();
      unsubError?.();
    };
  }, [onScreenshotComplete, onRecordingStop, onError]);
  
  // Initial load
  useEffect(() => {
    refreshPresets();
    refreshStatus();
  }, [refreshPresets, refreshStatus]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Return
  // ─────────────────────────────────────────────────────────────────────────────
  
  return {
    status,
    presets,
    isLoading,
    error,
    ffmpegAvailable,
    takeScreenshot,
    startRecording,
    stopRecording,
    refreshStatus,
    refreshPresets,
    browseOutputDirectory,
  };
}

export default useCapture;
