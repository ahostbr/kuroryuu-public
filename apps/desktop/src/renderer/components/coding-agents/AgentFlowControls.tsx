/**
 * Agent Flow Controls - Control panel for the Agent Flow visualization
 * Follows the same pattern as PTYTrafficControls
 */
import React from 'react';
import {
  Wifi,
  WifiOff,
  Pause,
  Play,
  RotateCcw,
  RefreshCw,
  Circle,
  Layers,
  LayoutGrid,
  Plus,
} from 'lucide-react';
import { useAgentFlowStore, type AgentFlowTheme } from '../../stores/agent-flow-store';

interface AgentFlowControlsProps {
  isConnected: boolean;
  onReconnect: () => void;
  viewMode: 'graph' | 'list';
  onViewModeChange: (mode: 'graph' | 'list') => void;
  onSpawnAgent: () => void;
}

export function AgentFlowControls({
  isConnected,
  onReconnect,
  viewMode,
  onViewModeChange,
  onSpawnAgent,
}: AgentFlowControlsProps) {
  const isPaused = useAgentFlowStore((s) => s.isPaused);
  const togglePause = useAgentFlowStore((s) => s.togglePause);
  const clearGraph = useAgentFlowStore((s) => s.clearGraph);
  const theme = useAgentFlowStore((s) => s.theme);

  return (
    <div className="agent-flow-panel" data-agent-theme={theme}>
      {/* Panel Header */}
      <div className="agent-flow-panel-header">CONTROLS</div>

      {/* Panel Content */}
      <div className="agent-flow-panel-content">
        {/* Connection Status */}
        <div className="flex items-center gap-2 mb-4">
          {isConnected ? (
            <>
              <Wifi className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-400">CONNECTED</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400">DISCONNECTED</span>
            </>
          )}
        </div>

        {/* Pause/Resume Button */}
        <button
          onClick={togglePause}
          className={`agent-flow-button w-full mb-2 ${isPaused ? 'active' : ''}`}
        >
          {isPaused ? (
            <>
              <Play className="w-4 h-4" />
              <span>RESUME</span>
            </>
          ) : (
            <>
              <Pause className="w-4 h-4" />
              <span>PAUSE</span>
            </>
          )}
        </button>

        {/* Reset Button */}
        <button onClick={clearGraph} className="agent-flow-button w-full mb-2">
          <RotateCcw className="w-4 h-4" />
          <span>RESET</span>
        </button>

        {/* Reconnect Button */}
        <button onClick={onReconnect} className="agent-flow-button w-full mb-2">
          <RefreshCw className="w-4 h-4" />
          <span>RECONNECT</span>
        </button>

        {/* New Agent Button */}
        <button onClick={onSpawnAgent} className="agent-flow-button w-full mb-4 !bg-primary/20 !border-primary hover:!bg-primary/30">
          <Plus className="w-4 h-4" />
          <span>NEW AGENT</span>
        </button>

        {/* View Mode Section */}
        <div className="border-t border-gray-700 pt-4 mt-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
            <Layers className="w-3 h-3" />
            VIEW
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => onViewModeChange('graph')}
              className={`agent-flow-button flex-1 ${viewMode === 'graph' ? 'active' : ''}`}
            >
              <Circle className="w-3 h-3" />
              <span>Graph</span>
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`agent-flow-button flex-1 ${viewMode === 'list' ? 'active' : ''}`}
            >
              <LayoutGrid className="w-3 h-3" />
              <span>List</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentFlowControls;
