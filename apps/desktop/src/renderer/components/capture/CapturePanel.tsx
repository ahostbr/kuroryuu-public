/**
 * Capture Panel Component
 *
 * Human-controlled capture interface.
 * Connects to Kuroryuu MCP tools via gateway:
 * - Screenshots via k_capture (action: 'screenshot')
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
  AlertCircle,
  Download,
  ExternalLink,
  Crosshair,
  AppWindow,
  Scan,
  ChevronDown,
} from 'lucide-react';
import { toast } from '../ui/toast';
import { useCaptureStore } from '@/stores/capture-store';
import { useSettingsStore } from '@/stores/settings-store';
import { DRAGON_ASCII } from '@/constants/dragon-ascii';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

type CaptureMode = 'desktop' | 'monitor' | 'window';

const MODE_META: Record<CaptureMode, { icon: React.ReactNode; label: string }> = {
  desktop: { icon: <Monitor size={13} />, label: 'Desktop' },
  monitor: { icon: <Scan size={13} />, label: 'Monitor' },
  window: { icon: <AppWindow size={13} />, label: 'Window' },
};

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

  // Imperial mode setting
  const imperialMode = useSettingsStore((s) => s.appSettings.captureImperialMode);

  // Local UI state (not recording state - that's in global store)
  const [selectedMode, setSelectedMode] = useState<CaptureMode>('desktop');
  const [loading, setLoading] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [latestImage, setLatestImage] = useState<string | null>(null);
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null); // null = checking
  const [showInfo, setShowInfo] = useState(false);

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
      // Use k_capture for screenshots (uses default path: ai/capture/output/screenshots/)
      const result = await callMcpTool('k_capture', {
        action: 'screenshot',
        monitor_index: 0,
      });

      // Gateway returns result as string - parse it
      const data = typeof result === 'string' ? JSON.parse(result) : result;
      console.log('[CapturePanel] screenshot result:', data);

      if (data?.ok !== false) {
        toast.success(`Screenshot saved: ${data?.path || 'ai/capture/output/screenshots/'}`);

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
    <div
      className="capture-root h-full flex flex-col relative overflow-hidden"
      style={{
        background: isRecording
          ? 'radial-gradient(ellipse at center, color-mix(in srgb, var(--cp-crimson) 15%, transparent) 0%, transparent 70%)'
          : 'radial-gradient(ellipse at center, color-mix(in srgb, var(--cp-accent) 8%, transparent) 0%, transparent 70%)',
      }}
    >
      {/* Scanlines */}
      {imperialMode && (
        <div
          className="absolute inset-0 pointer-events-none z-[1]"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
          }}
        />
      )}
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-[2]"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)',
        }}
      />
      {/* Subtle dragon ghost */}
      {imperialMode && (
        <pre
          aria-hidden="true"
          className="absolute pointer-events-none select-none leading-[1.1] z-[1]"
          style={{
            fontSize: 'clamp(0.18rem, 0.35vw, 0.3rem)',
            color: 'color-mix(in srgb, var(--cp-crimson) 6%, transparent)',
            fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            whiteSpace: 'pre',
          }}
        >
          {DRAGON_ASCII}
        </pre>
      )}

      {/* ── Content layer ── */}
      <div className="relative z-[3] h-full flex flex-col">

        {/* Recording alert strip */}
        {isRecording && (
          <div
            className="flex items-center justify-center gap-3 px-4 py-2"
            style={{
              background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--cp-crimson) 35%, transparent), transparent)',
              borderBottom: '1px solid color-mix(in srgb, var(--cp-crimson) 40%, transparent)',
            }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: 'var(--cp-crimson)',
                boxShadow: '0 0 6px color-mix(in srgb, var(--cp-crimson) 60%, transparent)',
                animation: 'capturePulse 1.5s ease-in-out infinite',
              }}
            />
            <span
              className="font-mono text-[11px] uppercase tracking-[0.2em]"
              style={{ color: 'var(--cp-crimson)' }}
            >
              Recording Active
            </span>
            <span
              className="font-mono text-[11px] px-2 py-0.5"
              style={{
                color: 'var(--cp-crimson)',
                background: 'color-mix(in srgb, var(--cp-crimson) 20%, transparent)',
                border: '1px solid color-mix(in srgb, var(--cp-crimson) 30%, transparent)',
              }}
            >
              {formatDuration(recordingDuration)}
            </span>
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: 'var(--cp-crimson)',
                boxShadow: '0 0 6px color-mix(in srgb, var(--cp-crimson) 60%, transparent)',
                animation: 'capturePulse 1.5s ease-in-out infinite 0.75s',
              }}
            />
          </div>
        )}

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{
            borderBottom: isRecording
              ? '1px solid color-mix(in srgb, var(--cp-crimson) 25%, transparent)'
              : '1px solid color-mix(in srgb, var(--cp-accent) 8%, transparent)',
          }}
        >
          <div className="flex items-center gap-3">
            <Crosshair
              className="w-4 h-4"
              style={{ color: isRecording ? 'color-mix(in srgb, var(--cp-crimson) 80%, transparent)' : 'color-mix(in srgb, var(--cp-accent) 60%, transparent)' }}
            />
            <span
              className="font-mono text-sm uppercase tracking-[0.15em]"
              style={{ color: isRecording ? 'color-mix(in srgb, var(--cp-crimson) 80%, transparent)' : 'color-mix(in srgb, var(--cp-accent) 60%, transparent)' }}
            >
              {imperialMode ? '龍眼 Capture' : 'Capture'}
            </span>
            {isRecording && (
              <span
                className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5"
                style={{
                  color: 'var(--cp-crimson)',
                  border: '1px solid color-mix(in srgb, var(--cp-crimson) 50%, transparent)',
                  animation: 'capturePulse 2s ease-in-out infinite',
                }}
              >
                REC
              </span>
            )}
          </div>
          <button
            onClick={checkStatus}
            disabled={loading}
            className="cp-term-btn p-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* FFmpeg warning */}
          {ffmpegAvailable === false && (
            <div
              className="p-4"
              style={{
                border: '1px solid color-mix(in srgb, var(--cp-accent) 25%, transparent)',
                background: 'color-mix(in srgb, var(--cp-accent) 4%, transparent)',
              }}
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--cp-accent)' }} />
                <div className="flex-1">
                  <p className="font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--cp-accent)' }}>
                    FFmpeg Not Found
                  </p>
                  <p className="text-xs mt-1.5" style={{ color: 'color-mix(in srgb, var(--cp-accent) 60%, transparent)' }}>
                    Screen recording requires FFmpeg. Run{' '}
                    <code className="font-mono px-1" style={{ color: 'color-mix(in srgb, var(--cp-accent) 80%, transparent)', background: 'color-mix(in srgb, var(--cp-accent) 10%, transparent)' }}>
                      setup-project.ps1
                    </code>{' '}
                    to install automatically, or download manually:
                  </p>
                  <button
                    onClick={handleDownloadFfmpeg}
                    className="cp-term-btn cp-term-btn--gold mt-2.5 flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wider"
                  >
                    <Download size={12} />
                    &gt; Download FFmpeg
                    <ExternalLink size={10} />
                  </button>
                  <p className="text-[10px] mt-2 font-mono" style={{ color: 'color-mix(in srgb, var(--cp-muted) 40%, transparent)' }}>
                    Extract to: ffmpeg/win64/bin/
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Status panel */}
          {isRecording ? (
            <div
              className="p-4"
              style={{
                border: '1px solid color-mix(in srgb, var(--cp-crimson) 40%, transparent)',
                background: 'color-mix(in srgb, var(--cp-crimson) 8%, transparent)',
                animation: 'captureGlow 3s ease-in-out infinite',
              }}
            >
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <Circle className="w-5 h-5" fill="currentColor" style={{ color: 'var(--cp-crimson)' }} />
                  <Circle
                    className="w-5 h-5 absolute inset-0 opacity-40"
                    fill="currentColor"
                    style={{ color: 'var(--cp-crimson)', animation: 'capturePulse 1.5s ease-in-out infinite' }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--cp-crimson)' }}>
                    Recording In Progress
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'color-mix(in srgb, var(--cp-crimson) 50%, transparent)' }}>
                    Screen capture active &middot; VisualDigest updating every 10s
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono text-lg tabular-nums" style={{ color: 'var(--cp-crimson)' }}>
                    {formatDuration(recordingDuration)}
                  </p>
                  <p className="font-mono text-[10px] uppercase" style={{ color: 'color-mix(in srgb, var(--cp-crimson) 40%, transparent)' }}>
                    elapsed
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="p-4"
              style={{
                border: '1px solid color-mix(in srgb, var(--cp-accent) 10%, transparent)',
                background: 'color-mix(in srgb, var(--cp-accent) 2%, transparent)',
              }}
            >
              <div className="flex items-center gap-3">
                <Crosshair className="w-4 h-4" style={{ color: 'color-mix(in srgb, var(--cp-accent) 40%, transparent)' }} />
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider" style={{ color: 'color-mix(in srgb, var(--cp-accent) 60%, transparent)' }}>
                    Standby
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'color-mix(in srgb, var(--cp-muted) 40%, transparent)' }}>
                    Start recording to enable agent vision
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Mode selector */}
          <div>
            <span
              className="font-mono text-[10px] uppercase tracking-[0.2em] mb-2.5 block"
              style={{ color: 'color-mix(in srgb, var(--cp-accent) 40%, transparent)' }}
            >
              Capture Mode
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(['desktop', 'monitor', 'window'] as CaptureMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSelectedMode(mode)}
                  disabled={isRecording}
                  className={`cp-mode-btn flex items-center justify-center gap-2 py-2.5 ${
                    selectedMode === mode ? 'cp-mode-btn--active' : ''
                  }`}
                >
                  {MODE_META[mode].icon}
                  <span>&gt; {MODE_META[mode].label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Accent separator */}
          <div
            className="h-px"
            style={{
              background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--cp-accent) 15%, transparent) 30%, color-mix(in srgb, var(--cp-accent) 15%, transparent) 70%, transparent)',
            }}
          />

          {/* Action buttons */}
          <div className="space-y-2.5">
            {/* Screenshot */}
            <button
              onClick={handleScreenshot}
              disabled={loading}
              className="cp-term-btn cp-term-btn--gold w-full flex items-center justify-center gap-2 py-3"
            >
              <Camera size={14} />
              &gt; Capture Screenshot
            </button>

            {/* Record / Stop */}
            {!isRecording ? (
              <button
                onClick={handleStartRecording}
                disabled={loading}
                className="cp-term-btn cp-term-btn--crimson w-full flex items-center justify-center gap-2 py-3"
              >
                <Play size={14} />
                &gt; Begin Recording + VisualDigest
              </button>
            ) : (
              <button
                onClick={handleStopRecording}
                disabled={loading}
                className="cp-term-btn cp-term-btn--stop w-full flex items-center justify-center gap-2 py-4"
              >
                <StopCircle size={15} />
                {imperialMode ? '> Terminate Recording' : 'Stop Recording'}
              </button>
            )}

            {/* View Latest */}
            <button
              onClick={handleGetLatest}
              disabled={loading}
              className="cp-term-btn w-full flex items-center justify-center gap-2 py-3"
            >
              <Eye size={14} />
              &gt; View Latest Frame
            </button>
          </div>

          {/* Image preview — surveillance frame */}
          {latestImage && (
            <div className="space-y-2">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.2em] block"
                style={{ color: 'color-mix(in srgb, var(--cp-accent) 40%, transparent)' }}
              >
                Latest Frame
              </span>
              <div className="relative p-0.5" style={{ border: '1px solid color-mix(in srgb, var(--cp-accent) 12%, transparent)' }}>
                {/* Corner brackets */}
                <div className="absolute top-0 left-0 w-4 h-4" style={{ borderTop: '2px solid color-mix(in srgb, var(--cp-accent) 45%, transparent)', borderLeft: '2px solid color-mix(in srgb, var(--cp-accent) 45%, transparent)' }} />
                <div className="absolute top-0 right-0 w-4 h-4" style={{ borderTop: '2px solid color-mix(in srgb, var(--cp-accent) 45%, transparent)', borderRight: '2px solid color-mix(in srgb, var(--cp-accent) 45%, transparent)' }} />
                <div className="absolute bottom-0 left-0 w-4 h-4" style={{ borderBottom: '2px solid color-mix(in srgb, var(--cp-accent) 45%, transparent)', borderLeft: '2px solid color-mix(in srgb, var(--cp-accent) 45%, transparent)' }} />
                <div className="absolute bottom-0 right-0 w-4 h-4" style={{ borderBottom: '2px solid color-mix(in srgb, var(--cp-accent) 45%, transparent)', borderRight: '2px solid color-mix(in srgb, var(--cp-accent) 45%, transparent)' }} />

                {/* Image scanlines */}
                <div
                  className="absolute inset-0 pointer-events-none z-10"
                  style={{
                    background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 6px)',
                  }}
                />

                <img src={latestImage} alt="Latest capture" className="w-full h-auto relative z-0" />

                {/* Frame label */}
                <div
                  className="absolute bottom-1.5 right-1.5 font-mono text-[10px] px-1.5 py-0.5 z-20"
                  style={{
                    color: 'color-mix(in srgb, var(--cp-accent) 70%, transparent)',
                    background: 'rgba(0,0,0,0.7)',
                    border: '1px solid color-mix(in srgb, var(--cp-accent) 20%, transparent)',
                  }}
                >
                  LATEST FRAME
                </div>
              </div>
            </div>
          )}

          {/* Info panel — collapsible terminal */}
          <div style={{ borderTop: '1px solid color-mix(in srgb, var(--cp-accent) 6%, transparent)' }}>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="w-full flex items-center gap-2 py-2.5 group"
            >
              <ChevronDown
                size={12}
                style={{
                  color: 'color-mix(in srgb, var(--cp-muted) 40%, transparent)',
                  transform: showInfo ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 300ms ease',
                }}
              />
              <span
                className="font-mono text-[10px] uppercase tracking-[0.2em]"
                style={{ color: 'color-mix(in srgb, var(--cp-muted) 40%, transparent)' }}
              >
                System.Info
              </span>
              <div className="flex-1 h-px" style={{ background: 'color-mix(in srgb, var(--cp-muted) 10%, transparent)' }} />
            </button>

            {showInfo && (
              <div className="pb-3 space-y-1.5 pl-5">
                {[
                  { text: 'Human controls capture (agents never start recording)' },
                  { text: 'Screenshots use ', code: 'k_capture(action="screenshot")' },
                  { text: 'Recording uses ', code: 'k_capture(action="start/stop")' },
                  { text: 'VisualDigest writes to latest.jpg every 10 seconds' },
                  { text: 'Agents check via ', code: 'k_capture(action="get_latest")' },
                  { text: 'Screenshots saved to apps/mcp_core/ai/captures/' },
                ].map((line, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 font-mono text-[11px]"
                    style={{ color: 'color-mix(in srgb, var(--cp-muted) 45%, transparent)' }}
                  >
                    <span style={{ color: 'color-mix(in srgb, var(--cp-accent) 35%, transparent)' }}>$</span>
                    <span>
                      {line.text}
                      {line.code && (
                        <code style={{ color: 'color-mix(in srgb, var(--cp-accent) 60%, transparent)' }}>{line.code}</code>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CapturePanel;
