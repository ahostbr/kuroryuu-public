/**
 * PTYTrafficControls - Control panel for PTY traffic flow visualization
 * Pause/resume playback, clear events, and theme selection
 */
import React from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  Wifi,
  WifiOff,
  Palette,
  Zap,
  Crown,
  Monitor,
  MonitorDot,
} from 'lucide-react';
import { usePTYTrafficStore } from '../../stores/pty-traffic-store';
import type { PTYVizTheme } from '../../types/pty-traffic';

const THEME_OPTIONS: { value: PTYVizTheme; label: string; icon: React.ReactNode }[] = [
  { value: 'cyberpunk', label: 'Cyberpunk', icon: <Zap size={12} /> },
  { value: 'kuroryuu', label: 'Kuroryuu', icon: <Crown size={12} /> },
  { value: 'retro', label: 'Retro CRT', icon: <MonitorDot size={12} /> },
  { value: 'default', label: 'Modern', icon: <Monitor size={12} /> },
];

interface PTYTrafficControlsProps {
  isConnected: boolean;
  onReconnect: () => void;
}

export function PTYTrafficControls({ isConnected, onReconnect }: PTYTrafficControlsProps) {
  const isPaused = usePTYTrafficStore((s) => s.isPaused);
  const vizTheme = usePTYTrafficStore((s) => s.vizTheme);
  const togglePause = usePTYTrafficStore((s) => s.togglePause);
  const clearEvents = usePTYTrafficStore((s) => s.clearEvents);
  const setVizTheme = usePTYTrafficStore((s) => s.setVizTheme);

  return (
    <div className="pty-panel">
      <div className="pty-panel-header">CONTROLS</div>
      <div className="pty-panel-content">
        {/* Connection status */}
        <div className="flex items-center gap-2 text-xs mb-2">
          {isConnected ? (
            <>
              <Wifi size={12} className="pty-status-connected" />
              <span className="pty-status-connected">CONNECTED</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="pty-status-disconnected" />
              <span className="pty-status-disconnected">DISCONNECTED</span>
            </>
          )}
        </div>

        {/* Pause/Resume button */}
        <button onClick={togglePause} className="pty-button w-full">
          {isPaused ? <Play size={16} /> : <Pause size={16} />}
          <span>{isPaused ? 'Resume' : 'Pause'}</span>
        </button>

        {/* Reset button */}
        <button onClick={clearEvents} className="pty-button w-full">
          <RotateCcw size={16} />
          <span>Reset</span>
        </button>

        {/* Reconnect button */}
        <button onClick={onReconnect} className="pty-button w-full">
          <Wifi size={16} />
          <span>Reconnect</span>
        </button>

        {/* HIDDEN: Theme selector - using global themes now. Uncomment to restore.
        <div className="mt-4 pt-3 border-t border-current/20">
          <div className="flex items-center gap-2 text-xs mb-2 opacity-70">
            <Palette size={12} />
            <span>THEME</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setVizTheme(option.value)}
                className={`pty-theme-btn ${vizTheme === option.value ? 'active' : ''}`}
                title={option.label}
              >
                {option.icon}
                <span className="text-[10px]">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
        */}
      </div>
    </div>
  );
}
