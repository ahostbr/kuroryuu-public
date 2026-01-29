/**
 * TrafficFlowControls - Control panel for traffic flow visualization
 * Pause/resume playback, clear events, and theme selection
 */
import React from 'react';
import { Pause, Play, RotateCcw, Wifi, WifiOff, Palette, Zap, Crown, Monitor, MonitorDot, Network, PanelRight, GitBranch, Circle, Shield, RefreshCw } from 'lucide-react';
import { useTrafficStore } from '../../stores/traffic-store';
import { useTrafficFlow } from '../../hooks/useTrafficFlow';
import type { TrafficVizTheme, TrafficViewMode, GraphLayout } from '../../types/traffic';
import { gatewayWebSocket } from '../../lib/websocket-client';

const THEME_OPTIONS: { value: TrafficVizTheme; label: string; icon: React.ReactNode }[] = [
  { value: 'cyberpunk', label: 'Cyberpunk', icon: <Zap size={12} /> },
  { value: 'kuroryuu', label: 'Kuroryuu', icon: <Crown size={12} /> },
  { value: 'retro', label: 'Retro CRT', icon: <MonitorDot size={12} /> },
  { value: 'default', label: 'Modern', icon: <Monitor size={12} /> },
];

const VIEW_MODE_OPTIONS: { value: TrafficViewMode; label: string; icon: React.ReactNode }[] = [
  { value: 'graph', label: 'Graph', icon: <Network size={12} /> },
  { value: 'split', label: 'Split', icon: <PanelRight size={12} /> },
];

const GRAPH_LAYOUT_OPTIONS: { value: GraphLayout; label: string; icon: React.ReactNode }[] = [
  { value: 'flat', label: 'Flat', icon: <Circle size={12} /> },
  { value: 'hierarchical', label: 'Tree', icon: <GitBranch size={12} /> },
];

export function TrafficFlowControls() {
  const isPaused = useTrafficStore((s) => s.isPaused);
  const isConnected = useTrafficStore((s) => s.isConnected);
  const vizTheme = useTrafficStore((s) => s.vizTheme);
  const viewMode = useTrafficStore((s) => s.viewMode);
  const graphLayout = useTrafficStore((s) => s.graphLayout);
  const togglePause = useTrafficStore((s) => s.togglePause);
  const clearEvents = useTrafficStore((s) => s.clearEvents);
  const setVizTheme = useTrafficStore((s) => s.setVizTheme);
  const setViewMode = useTrafficStore((s) => s.setViewMode);
  const setGraphLayout = useTrafficStore((s) => s.setGraphLayout);
  const { reconnect } = useTrafficFlow();

  return (
    <div className="cyberpunk-panel">
      <div className="panel-header">CONTROLS</div>
      <div className="panel-content">
        {/* Connection status */}
        <div className="flex items-center gap-2 text-xs mb-2">
          {isConnected ? (
            <>
              <Wifi size={12} className="text-green-400" />
              <span className="text-green-400">CONNECTED</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-red-400" />
              <span className="text-red-400">DISCONNECTED</span>
            </>
          )}
        </div>

        {/* Reconnect button - shown when disconnected */}
        {!isConnected && (
          <button onClick={reconnect} className="cyber-button w-full mb-2 !border-yellow-500 !text-yellow-400 hover:!bg-yellow-500/20">
            <RefreshCw size={16} />
            <span>Reconnect</span>
          </button>
        )}

        {/* Pause/Resume button */}
        <button onClick={togglePause} className="cyber-button w-full">
          {isPaused ? <Play size={16} /> : <Pause size={16} />}
          <span>{isPaused ? 'Resume' : 'Pause'}</span>
        </button>

        {/* Reset button */}
        <button onClick={clearEvents} className="cyber-button w-full">
          <RotateCcw size={16} />
          <span>Reset</span>
        </button>

        {/* View mode toggle */}
        <div className="mt-4 pt-3 border-t border-current/20">
          <div className="flex items-center gap-2 text-xs mb-2 opacity-70">
            <Network size={12} />
            <span>VIEW</span>
          </div>
          <div className="flex gap-1">
            {VIEW_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setViewMode(option.value)}
                className={`view-mode-btn flex-1 ${viewMode === option.value ? 'active' : ''}`}
                title={option.label}
              >
                {option.icon}
                <span className="text-[10px]">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Graph layout toggle */}
        <div className="mt-3 pt-3 border-t border-current/20">
          <div className="flex items-center gap-2 text-xs mb-2 opacity-70">
            <GitBranch size={12} />
            <span>LAYOUT</span>
          </div>
          <div className="flex gap-1">
            {GRAPH_LAYOUT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setGraphLayout(option.value)}
                className={`view-mode-btn flex-1 ${graphLayout === option.value ? 'active' : ''}`}
                title={option.label}
              >
                {option.icon}
                <span className="text-[10px]">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

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
                className={`theme-selector-btn ${vizTheme === option.value ? 'active' : ''}`}
                title={option.label}
              >
                {option.icon}
                <span className="text-[10px]">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
        */}

        {/* Test Security Alert */}
        <div className="mt-4 pt-3 border-t border-current/20">
          <div className="flex items-center gap-2 text-xs mb-2 opacity-70">
            <Shield size={12} />
            <span>SECURITY TEST</span>
          </div>
          <button
            onClick={() => {
              // Simulate a security alert via WebSocket
              gatewayWebSocket.emit('security_alert', {
                severity: 'critical',
                event_id: 'test-' + Date.now(),
                client_ip: '203.0.113.42',
                user_agent: 'Mozilla/5.0 (Test) Suspicious/1.0',
                endpoint: '/v1/chat/stream',
                method: 'POST',
                headers: {
                  'host': 'localhost:8200',
                  'content-type': 'application/json',
                  'x-forwarded-for': '203.0.113.42',
                },
                auto_blocked: true,
                message: 'TEST ALERT: Simulated external connection',
              });
            }}
            className="cyber-button w-full !border-red-500 !text-red-400 hover:!bg-red-500/20"
          >
            <Shield size={16} />
            <span>Test Alert</span>
          </button>
        </div>
      </div>
    </div>
  );
}
