/**
 * Leader Monitor Modal
 *
 * Displays minimal status indicator for leader (Ralph) monitoring.
 * Shows: status badge, last activity, last nudge, nudge count.
 * Features: start/stop buttons, opacity slider, draggable, X close.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Activity, AlertTriangle, CheckCircle, Clock, Play, Square, Pause, ChevronDown, Info } from 'lucide-react';

interface LeaderMonitorStatus {
  isMonitoring: boolean;
  leaderTerminalId: string | null;
  status: 'active' | 'idle' | 'nudged' | 'not_monitoring';
  lastActivityMs: number | null;
  idleDurationMs: number | null;
  lastNudgeMs: number | null;
  nudgeCount: number;
}

interface LeaderMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Timeout presets for logarithmic slider (5s to 24h)
const TIMEOUT_PRESETS = [
  { ms: 5000, label: '5s' },
  { ms: 10000, label: '10s' },
  { ms: 30000, label: '30s' },
  { ms: 60000, label: '1m' },
  { ms: 120000, label: '2m' },
  { ms: 300000, label: '5m' },
  { ms: 600000, label: '10m' },
  { ms: 900000, label: '15m' },
  { ms: 1800000, label: '30m' },
  { ms: 3600000, label: '1h' },
  { ms: 7200000, label: '2h' },
  { ms: 14400000, label: '4h' },
  { ms: 28800000, label: '8h' },
  { ms: 43200000, label: '12h' },
  { ms: 86400000, label: '24h' },
];

const msToSliderValue = (ms: number): number => {
  for (let i = 0; i < TIMEOUT_PRESETS.length; i++) {
    if (ms <= TIMEOUT_PRESETS[i].ms) return i;
  }
  return TIMEOUT_PRESETS.length - 1;
};

const sliderValueToMs = (value: number): number => {
  return TIMEOUT_PRESETS[Math.min(value, TIMEOUT_PRESETS.length - 1)].ms;
};

const formatTimeout = (ms: number): string => {
  const preset = TIMEOUT_PRESETS.find(p => p.ms === ms);
  if (preset) return preset.label;
  // Fallback formatting
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
};

export function LeaderMonitorModal({ isOpen, onClose }: LeaderMonitorModalProps) {
  const [status, setStatus] = useState<LeaderMonitorStatus | null>(null);
  const [opacity, setOpacity] = useState(0.95);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [inactivityTimeout, setInactivityTimeout] = useState(300000); // 5 min default
  const dragOffset = useRef({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch status periodically
  useEffect(() => {
    if (!isOpen) return;

    const fetchStatus = async () => {
      try {
        const result = await window.electronAPI.leaderMonitor.getStatus();
        if (result.ok && result.data) {
          setStatus(result.data);
        }
      } catch (error) {
        console.error('[LeaderMonitor] Failed to fetch status:', error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Listen for status updates via IPC
  useEffect(() => {
    if (!isOpen) return;

    const cleanup = window.electronAPI.onLeaderMonitorStatus?.((newStatus: LeaderMonitorStatus) => {
      setStatus(newStatus);
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [isOpen]);

  // Start monitoring
  const handleStart = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.leaderMonitor.start();
      if (!result.ok) {
        console.error('[LeaderMonitor] Start failed:', result.error);
      }
    } catch (error) {
      console.error('[LeaderMonitor] Start error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Stop monitoring
  const handleStop = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.leaderMonitor.stop();
      if (!result.ok) {
        console.error('[LeaderMonitor] Stop failed:', result.error);
      }
    } catch (error) {
      console.error('[LeaderMonitor] Stop error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update inactivity timeout config
  const handleTimeoutChange = async (ms: number) => {
    setInactivityTimeout(ms);
    try {
      await window.electronAPI.leaderMonitor.updateConfig?.({ inactivityTimeoutMs: ms });
    } catch (error) {
      console.error('[LeaderMonitor] Config update failed:', error);
    }
  };

  // Dragging handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    setIsDragging(true);
    const rect = modalRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!isOpen) return null;

  const formatTime = (ms: number | null) => {
    if (ms === null) return '--';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const formatTimeSince = (timestamp: number | null) => {
    if (timestamp === null) return '--';
    return formatTime(Date.now() - timestamp);
  };

  const getStatusColor = (s: LeaderMonitorStatus['status']) => {
    switch (s) {
      case 'active': return 'text-green-400';
      case 'idle': return 'text-yellow-400';
      case 'nudged': return 'text-orange-400';
      case 'not_monitoring': return 'text-gray-400';
    }
  };

  const getStatusIcon = (s: LeaderMonitorStatus['status']) => {
    switch (s) {
      case 'active': return <CheckCircle className="w-4 h-4" />;
      case 'idle': return <Clock className="w-4 h-4" />;
      case 'nudged': return <AlertTriangle className="w-4 h-4" />;
      case 'not_monitoring': return <Activity className="w-4 h-4" />;
    }
  };

  const getStatusBgColor = (s: LeaderMonitorStatus['status']) => {
    switch (s) {
      case 'active': return 'bg-green-500/20';
      case 'idle': return 'bg-yellow-500/20';
      case 'nudged': return 'bg-orange-500/20';
      case 'not_monitoring': return 'bg-gray-500/20';
    }
  };

  const hasLeader = status?.leaderTerminalId !== null;
  const isMonitoring = status?.isMonitoring ?? false;

  return (
    <div
      ref={modalRef}
      className="fixed z-50 select-none"
      style={{
        left: position.x,
        top: position.y,
        opacity,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-xl min-w-[260px]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Leader Monitor</span>
            {/* Info toggle - amber circle (i) icon */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowInfo(!showInfo);
              }}
              className="group relative flex items-center gap-1 ml-1"
              title="What is this?"
            >
              <div className={`
                w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200
                bg-amber-500/20 border border-amber-500/40
                group-hover:bg-amber-500/30 group-hover:border-amber-500/60
                ${showInfo ? 'bg-amber-500/40 border-amber-500/70' : ''}
              `}>
                <span className="text-[10px] font-bold text-amber-400">i</span>
              </div>
              <ChevronDown className={`w-3 h-3 text-amber-400/70 transition-transform duration-200 ${showInfo ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Opacity slider */}
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-16 h-1 accent-primary cursor-pointer"
              title="Opacity"
            />
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Info Panel - Expandable */}
        {showInfo && (
          <div className="px-3 pt-3 pb-3 border-b border-border bg-amber-500/5">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <Info className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-foreground mb-1">Inactivity Watchdog</h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
                  Monitors the leader terminal for extended silence. Sends a nudge message when inactive to prompt continuation.
                </p>

                {/* Feature bullets */}
                <div className="space-y-1 mb-3">
                  {[
                    'Detects when leader agent goes idle',
                    'Auto-sends nudge after configurable timeout',
                    'Alerts you after 3 consecutive nudges',
                    'Tracks activity timestamps & nudge count'
                  ].map((feature, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px]">
                      <div className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Timeout Configuration Slider */}
                <div className="p-2.5 rounded-lg bg-background/50 border border-border/50 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-muted-foreground">Nudge after inactivity:</span>
                    <span className="text-[11px] font-mono font-medium text-amber-400">
                      {formatTimeout(inactivityTimeout)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={TIMEOUT_PRESETS.length - 1}
                    step="1"
                    value={msToSliderValue(inactivityTimeout)}
                    onChange={(e) => handleTimeoutChange(sliderValueToMs(parseInt(e.target.value)))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                      bg-gradient-to-r from-amber-500/30 to-amber-500/10
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:w-3.5
                      [&::-webkit-slider-thumb]:h-3.5
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-amber-400
                      [&::-webkit-slider-thumb]:border-2
                      [&::-webkit-slider-thumb]:border-amber-500
                      [&::-webkit-slider-thumb]:shadow-md
                      [&::-webkit-slider-thumb]:hover:bg-amber-300
                      [&::-webkit-slider-thumb]:transition-colors
                    "
                  />
                  <div className="flex justify-between text-[9px] text-muted-foreground/60 mt-1">
                    <span>5s</span>
                    <span>5m</span>
                    <span>1h</span>
                    <span>24h</span>
                  </div>
                </div>

                {/* When to use */}
                <div className="pt-2 border-t border-border/50">
                  <p className="text-[10px] text-muted-foreground">
                    <span className="text-amber-400/80">Best for:</span> Long-running Ralph sessions where you want to ensure the leader stays active.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-3 space-y-3">
          {status ? (
            <>
              {/* Control buttons */}
              <div className="flex items-center gap-2">
                {!isMonitoring ? (
                  <button
                    onClick={handleStart}
                    disabled={isLoading || !hasLeader}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      hasLeader
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
                    }`}
                    title={hasLeader ? 'Start monitoring' : 'No leader terminal'}
                  >
                    <Play className="w-3 h-3" />
                    Start
                  </button>
                ) : (
                  <button
                    onClick={handleStop}
                    disabled={isLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                    title="Stop monitoring"
                  >
                    <Square className="w-3 h-3" />
                    Stop
                  </button>
                )}
              </div>

              {/* No leader warning */}
              {!hasLeader && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-yellow-500/10 text-yellow-400 text-xs">
                  <AlertTriangle className="w-3 h-3" />
                  <span>No leader terminal spawned</span>
                </div>
              )}

              {/* Status badge */}
              <div className={`flex items-center gap-2 px-2 py-1.5 rounded ${getStatusBgColor(status.status)}`}>
                <span className={getStatusColor(status.status)}>
                  {getStatusIcon(status.status)}
                </span>
                <span className={`text-sm font-medium capitalize ${getStatusColor(status.status)}`}>
                  {status.status.replace('_', ' ')}
                </span>
              </div>

              {/* Stats */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Leader terminal:</span>
                  <span className="font-mono">{status.leaderTerminalId ? status.leaderTerminalId.slice(0, 8) : '--'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last activity:</span>
                  <span className="font-mono">{formatTimeSince(status.lastActivityMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last nudge:</span>
                  <span className="font-mono">{formatTimeSince(status.lastNudgeMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nudge count:</span>
                  <span className={`font-mono ${status.nudgeCount > 0 ? 'text-orange-400' : ''}`}>
                    {status.nudgeCount}
                  </span>
                </div>
              </div>

              {/* Monitoring indicator */}
              <div className="flex items-center gap-1.5 text-xs border-t border-border pt-2">
                <span className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                <span className="text-muted-foreground">
                  {isMonitoring ? 'Monitoring active' : 'Monitoring stopped'}
                </span>
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              Loading status...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
