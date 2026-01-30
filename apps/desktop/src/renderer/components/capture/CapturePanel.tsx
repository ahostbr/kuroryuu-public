/**
 * Capture Panel Component
 *
 * Human-controlled capture interface.
 * Connects to Kuroryuu MCP tools via gateway:
 * - Screenshots via k_interact (action: 'screenshot')
 * - Screen recording via k_capture (start/stop/digest)
 * - Latest image via k_capture (get_latest)
 *
 * Agents do NOT run capture - they only check latest.jpg
 *
 * PLATFORM: Windows only - uses Win32 display APIs (gdigrab) for screen capture.
 * In Docker/Linux containers, k_capture is automatically disabled.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Camera,
  Monitor,
  Circle,
  RefreshCw,
  Eye,
  Play,
  StopCircle,
  Info,
  AlertCircle,
  Radio,
  Download,
  ExternalLink,
} from 'lucide-react';
import { toast } from '../ui/toast';
import { useCaptureStore } from '@/stores/capture-store';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

type CaptureMode = 'desktop' | 'monitor' | 'window';

// ═══════════════════════════════════════════════════════════════════════════════
// MCP Tool Helper
// ═══════════════════════════════════════════════════════════════════════════════

// Gateway URL (has CORS enabled)
const GATEWAY_URL = 'http://localhost:8200';

async function callMcpTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    // Call via gateway MCP proxy endpoint (avoids CORS issues)
    const response = await fetch(`${GATEWAY_URL}/v1/mcp/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: tool,
        arguments: args,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gateway error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error(`[CapturePanel] MCP call failed:`, error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export const CapturePanel: React.FC = () => {
  // Global capture store - SINGLE SOURCE OF TRUTH for recording state
  const isRecording = useCaptureStore((s) => s.isRecording);
  const recordingStartTime = useCaptureStore((s) => s.recordingStartTime);
  const isDigestActive = useCaptureStore((s) => s.isDigestActive);
  const globalStartRecording = useCaptureStore((s) => s.startRecording);
  const globalStopRecording = useCaptureStore((s) => s.stopRecording);
  const setDigestActive = useCaptureStore((s) => s.setDigestActive);

  // Local UI state (not recording state - that's in global store)
  const [selectedMode, setSelectedMode] = useState<CaptureMode>('desktop');
  const [loading, setLoading] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [latestImage, setLatestImage] = useState<string | null>(null);
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null); // null = checking

  // Duration timer - uses global store state
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && recordingStartTime) {
      interval = setInterval(() => {
        setRecordingDuration(Date.now() - recordingStartTime);
      }, 100);
    } else {
      setRecordingDuration(0);
    }
    return () => clearInterval(interval);
  }, [isRecording, recordingStartTime]);

  // Check status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  // Check FFmpeg availability on mount
  useEffect(() => {
    const checkFfmpeg = async () => {
      try {
        const projectRoot = await window.electronAPI?.app?.getProjectRoot?.();
        if (projectRoot) {
          const ffmpegPath = `${projectRoot}/ffmpeg/win64/bin/ffmpeg.exe`;
          const exists = await window.electronAPI?.fs?.exists?.(ffmpegPath);
          setFfmpegAvailable(exists ?? false);
        } else {
          setFfmpegAvailable(false);
        }
      } catch {
        setFfmpegAvailable(false);
      }
    };
    checkFfmpeg();
  }, []);

  // Open FFmpeg download page in default browser
  const handleDownloadFfmpeg = useCallback(() => {
    window.electronAPI?.shell?.openExternal?.(
      'https://github.com/BtbN/FFmpeg-Builds/releases'
    );
  }, []);

  // SAFETY: Stop recording on unmount or window close
  useEffect(() => {
    const stopRecordingOnExit = async () => {
      if (isRecording) {
        console.log('[CapturePanel] Stopping recording on exit...');
        try {
          await callMcpTool('k_capture', { action: 'stop' });
          globalStopRecording();
          console.log('[CapturePanel] Recording stopped on exit');
        } catch (error) {
          console.error('[CapturePanel] Failed to stop recording on exit:', error);
        }
      }
    };

    // Handle window/tab close
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRecording) {
        // Try to stop recording (may not complete)
        stopRecordingOnExit();
        // Show browser warning
        e.preventDefault();
        e.returnValue = 'Recording is active. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    // Handle visibility change (tab hidden/app minimized)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isRecording) {
        console.log('[CapturePanel] App hidden while recording - recording continues');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup on unmount - only remove listeners, DON'T stop recording
    // Recording should continue when navigating to other pages
    // Only beforeunload event handler should stop recording (on app close)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // NOTE: Do NOT call stopRecordingOnExit() here - it was incorrectly
      // stopping recording when user simply navigated away from Capture page
    };
  }, [isRecording, globalStopRecording]);

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes % 60)}:${pad(seconds % 60)}`;
    }
    return `${pad(minutes)}:${pad(seconds % 60)}`;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────────

  const checkStatus = useCallback(async () => {
    try {
      // Use 'poll' action which returns recording_active status
      const result = await callMcpTool('k_capture', { action: 'poll' });
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      console.log('[CapturePanel] poll status:', parsed);

      // k_capture returns {ok, data: {recording_active, latest, manifest, ...}, error}
      // IMPORTANT: Only trust recording_active (process-verified), NOT manifest.live (can be stale from previous session)
      const pollData = parsed?.data || parsed;
      const isRec = pollData?.recording_active || false;
      const isDigest = pollData?.manifest?.digest?.enabled || false;

      // Update global store (single source of truth)
      if (isRec) {
        globalStartRecording();
      } else {
        globalStopRecording();
      }
      setDigestActive(isDigest);
    } catch (error) {
      console.warn('[CapturePanel] Status check failed:', error);
    }
  }, [globalStartRecording, globalStopRecording, setDigestActive]);

  // Define handleGetLatest BEFORE handleScreenshot (since screenshot uses it)
  const handleGetLatest = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callMcpTool('k_capture', {
        action: 'get_latest',
        as_base64: true,
      });

      // Gateway returns result as string - parse it
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      console.log('[CapturePanel] get_latest result:', parsed);

      // k_capture returns {ok, data: {base64, path, ...}, error}
      const imageData = parsed?.data || parsed;

      if (imageData?.base64) {
        setLatestImage(`data:image/jpeg;base64,${imageData.base64}`);
        toast.success('Latest image loaded');
      } else if (imageData?.path) {
        toast.info(`Latest image at: ${imageData.path}`);
      } else if (parsed?.ok === false) {
        toast.warning(parsed.error || 'No image available');
      } else {
        toast.warning('No image data returned');
      }
    } catch (error) {
      toast.error('Failed to get latest image: ' + String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScreenshot = useCallback(async () => {
    setLoading(true);
    try {
      // Use k_interact for screenshots (human-in-the-loop tool)
      const result = await callMcpTool('k_interact', {
        action: 'screenshot',
        monitor: 0,
        output_path: `ai/captures/screenshot_${Date.now()}.png`,
      });

      // Gateway returns result as string - parse it
      const data = typeof result === 'string' ? JSON.parse(result) : result;
      console.log('[CapturePanel] screenshot result:', data);

      if (data?.ok !== false) {
        toast.success(`Screenshot saved: ${data?.path || 'apps/mcp_core/ai/captures/'}`);

        // Auto-load the screenshot for preview
        if (data?.base64) {
          setLatestImage(`data:image/png;base64,${data.base64}`);
        } else if (data?.path) {
          // Try to load the image via file path
          setTimeout(() => handleGetLatest(), 500);
        }
      } else {
        toast.error('Screenshot failed: ' + (data?.error || 'Unknown error'));
      }
      checkStatus();
    } catch (error) {
      toast.error('Screenshot failed: ' + String(error));
    } finally {
      setLoading(false);
    }
  }, [checkStatus, handleGetLatest]);

  const handleStartRecording = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callMcpTool('k_capture', {
        action: 'start',
        mode: selectedMode,
        fps: 1,
        digest: true,
        digest_fps: 0.1,
      });
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      console.log('[CapturePanel] start result:', parsed);

      if (parsed?.ok === false) {
        toast.error('Recording failed: ' + (parsed.error || 'Unknown error'));
        return;
      }

      // Update global store (single source of truth)
      globalStartRecording();
      setDigestActive(true);
      toast.success('Recording started');
    } catch (error) {
      toast.error('Failed to start recording: ' + String(error));
    } finally {
      setLoading(false);
    }
  }, [selectedMode, globalStartRecording, setDigestActive]);

  const handleStopRecording = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callMcpTool('k_capture', { action: 'stop' });
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      console.log('[CapturePanel] stop result:', parsed);

      // Update global store (single source of truth)
      globalStopRecording();
      setDigestActive(false);
      toast.success('Recording stopped');
    } catch (error) {
      toast.error('Failed to stop recording: ' + String(error));
    } finally {
      setLoading(false);
    }
  }, [globalStopRecording, setDigestActive]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className={`h-full flex flex-col bg-background relative ${
      isRecording ? 'ring-2 ring-red-500/50 ring-inset' : ''
    }`}>
      {/* Recording Alert Banner - Fixed at top */}
      {isRecording && (
        <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-3 animate-pulse">
          <Radio className="w-4 h-4 animate-ping" />
          <span className="font-bold text-sm uppercase tracking-wider">Recording Active</span>
          <span className="font-mono text-sm bg-red-700/50 px-2 py-0.5 rounded">{formatDuration(recordingDuration)}</span>
          <Radio className="w-4 h-4 animate-ping" />
        </div>
      )}

      {/* Header */}
      <div className={`flex items-center justify-between px-6 py-4 border-b ${
        isRecording ? 'border-red-500/30 bg-red-500/5' : 'border-border'
      }`}>
        <div className="flex items-center gap-3">
          <Camera className={`w-5 h-5 ${isRecording ? 'text-red-500' : 'text-primary'}`} />
          <h1 className="text-lg font-semibold text-foreground">Capture</h1>
          {isRecording && (
            <div className="flex items-center gap-2 px-2 py-1 bg-red-500/20 rounded-full border border-red-500/30">
              <Circle size={10} fill="currentColor" className="text-red-500 animate-pulse" />
              <span className="text-red-400 text-xs font-medium">REC</span>
            </div>
          )}
        </div>
        <button
          onClick={checkStatus}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-secondary transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* FFmpeg Missing Warning */}
        {ffmpegAvailable === false && (
          <div className="p-4 rounded-xl border border-amber-500/50 bg-amber-500/10">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-400">FFmpeg Not Found</p>
                <p className="text-xs text-amber-300/70 mt-1">
                  Screen recording requires FFmpeg. Run <code className="bg-amber-500/20 px-1 rounded">setup-project.ps1</code> to install automatically, or download manually:
                </p>
                <button
                  onClick={handleDownloadFfmpeg}
                  className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors text-sm"
                >
                  <Download size={14} />
                  Download FFmpeg
                  <ExternalLink size={12} />
                </button>
                <p className="text-xs text-muted-foreground mt-2">
                  Extract to: <code className="bg-secondary px-1 rounded">ffmpeg/win64/bin/</code>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Status Banner */}
        <div className={`p-4 rounded-xl border transition-all duration-300 ${
          isRecording
            ? 'bg-red-500/15 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
            : isDigestActive
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-secondary border-border'
        }`}>
          <div className="flex items-center gap-3">
            {isRecording ? (
              <>
                <div className="relative">
                  <Circle className="w-6 h-6 text-red-500" fill="currentColor" />
                  <Circle className="w-6 h-6 text-red-500 absolute inset-0 animate-ping opacity-50" fill="currentColor" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-red-400">⚠ RECORDING IN PROGRESS</p>
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  </div>
                  <p className="text-xs text-red-300/70">Screen is being captured • VisualDigest updating latest.jpg every 10s</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg text-red-400">{formatDuration(recordingDuration)}</p>
                  <p className="text-xs text-muted-foreground">elapsed</p>
                </div>
              </>
            ) : (
              <>
                <Info className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">Ready to Capture</p>
                  <p className="text-xs text-muted-foreground">Start recording to enable agent vision</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Capture Mode */}
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Capture Mode</label>
          <div className="grid grid-cols-3 gap-2">
            {(['desktop', 'monitor', 'window'] as CaptureMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setSelectedMode(mode)}
                disabled={isRecording}
                className={`
                  flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors
                  ${selectedMode === mode
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'bg-secondary text-foreground border border-border hover:border-primary/30'}
                  ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <Monitor size={16} />
                <span className="capitalize">{mode}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {/* Screenshot */}
          <button
            onClick={handleScreenshot}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-600 text-white font-medium hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Camera size={18} />
            Take Screenshot
          </button>

          {/* Record / Stop */}
          {!isRecording ? (
            <button
              onClick={handleStartRecording}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Play size={18} />
              Start Recording + VisualDigest
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-red-600/20 text-red-400 font-bold hover:bg-red-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-2 border-red-500/50 animate-pulse"
            >
              <StopCircle size={20} />
              STOP RECORDING
            </button>
          )}

          {/* Get Latest */}
          <button
            onClick={handleGetLatest}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary text-foreground font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-border"
          >
            <Eye size={18} />
            View Latest Image
          </button>
        </div>

        {/* Latest Image Preview */}
        {latestImage && (
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Latest Capture</label>
            <div className="relative rounded-xl overflow-hidden border border-border bg-secondary">
              <img
                src={latestImage}
                alt="Latest capture"
                className="w-full h-auto"
              />
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="p-4 bg-secondary/50 rounded-xl border border-border">
          <h3 className="text-sm font-medium text-foreground mb-2">How Capture Works</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>- Human controls capture (agents never start recording)</li>
            <li>- Screenshots use <code className="text-primary">k_interact(action="screenshot")</code></li>
            <li>- Recording uses <code className="text-primary">k_capture(action="start/stop")</code></li>
            <li>- VisualDigest writes to latest.jpg every 10 seconds</li>
            <li>- Agents check via <code className="text-primary">k_capture(action="get_latest")</code></li>
            <li>- Screenshots saved to apps/mcp_core/ai/captures/</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CapturePanel;
