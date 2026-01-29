/**
 * Leader Monitor Modal
 *
 * Displays minimal status indicator for leader (Ralph) monitoring.
 * Shows: status badge, last activity, last nudge, nudge count.
 * Features: start/stop buttons, opacity slider, draggable, X close.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Activity, AlertTriangle, CheckCircle, Clock, Play, Square, Pause } from 'lucide-react';

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

export function LeaderMonitorModal({ isOpen, onClose }: LeaderMonitorModalProps) {
  const [status, setStatus] = useState<LeaderMonitorStatus | null>(null);
  const [opacity, setOpacity] = useState(0.95);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
