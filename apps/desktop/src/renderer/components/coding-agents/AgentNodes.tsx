/**
 * Custom React Flow nodes for Agent Flow visualization
 * Themed to match the current visualization theme
 * All node components wrapped with React.memo to prevent unnecessary re-renders
 */
import React, { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Terminal, Server, Play, CheckCircle, XCircle, Clock, FileText, Square, Eye, Layers } from 'lucide-react';
import { useAgentFlowStore, THEME_COLORS, type AgentFlowTheme, type SessionManagerNodeData, type AgentSessionNodeData, type WaveGroupNodeData } from '../../stores/agent-flow-store';
import { useCodingAgentsStore } from '../../stores/coding-agents-store';

// Helper to get current theme colors
function useThemeColors() {
  const theme = useAgentFlowStore((s) => s.theme);
  return THEME_COLORS[theme];
}

// Get border style based on theme
function getBorderStyle(theme: AgentFlowTheme): string {
  return theme === 'retro' ? 'dashed' : 'solid';
}

// Get font family based on theme
function getFontFamily(theme: AgentFlowTheme): string {
  switch (theme) {
    case 'kuroryuu':
      return '"Reggae One", "MS Gothic", serif';
    case 'retro':
      return '"VT323", "Courier New", monospace';
    default:
      return 'inherit';
  }
}

/**
 * Session Manager Node - central hub showing aggregate stats
 */
export const SessionManagerNode = React.memo(function SessionManagerNode({
  data,
}: {
  data: { data: SessionManagerNodeData };
}) {
  const { label, totalSessions, activeCount, completedCount, failedCount } = data.data;
  const colors = useThemeColors();
  const theme = useAgentFlowStore((s) => s.theme);

  return (
    <div
      className="relative px-6 py-5 rounded-xl backdrop-blur-sm min-w-[160px]"
      style={{
        backgroundColor: colors.nodeBg,
        border: `3px ${getBorderStyle(theme)} ${colors.hub}`,
        boxShadow: `0 0 40px ${colors.hub}60, inset 0 0 20px ${colors.hub}20`,
        fontFamily: getFontFamily(theme),
      }}
    >
      <Handle
        type="source"
        position={Position.Top}
        className="!w-4 !h-4 !border-2"
        style={{ backgroundColor: colors.hub, borderColor: colors.nodeBg }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !border-2"
        style={{ backgroundColor: colors.hub, borderColor: colors.nodeBg }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-4 !h-4 !border-2"
        style={{ backgroundColor: colors.hub, borderColor: colors.nodeBg }}
      />
      <Handle
        type="source"
        position={Position.Left}
        className="!w-4 !h-4 !border-2"
        style={{ backgroundColor: colors.hub, borderColor: colors.nodeBg }}
      />

      <div className="flex items-center justify-center gap-2 mb-3">
        <Server className="w-6 h-6" style={{ color: colors.hub }} />
        <span className="text-sm font-bold tracking-wider" style={{ color: colors.hub }}>
          {label}
        </span>
      </div>

      <div className="text-center mb-2">
        <span className="text-2xl font-bold" style={{ color: colors.nodeText }}>
          {totalSessions}
        </span>
        <span className="text-xs ml-1" style={{ color: `${colors.nodeText}80` }}>
          sessions
        </span>
      </div>

      <div className="flex justify-center gap-4 text-[11px]">
        {activeCount > 0 && (
          <div className="flex items-center gap-1">
            <Play className="w-3 h-3" style={{ color: colors.running }} />
            <span style={{ color: colors.running }}>{activeCount}</span>
          </div>
        )}
        {completedCount > 0 && (
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" style={{ color: colors.success }} />
            <span style={{ color: colors.success }}>{completedCount}</span>
          </div>
        )}
        {failedCount > 0 && (
          <div className="flex items-center gap-1">
            <XCircle className="w-3 h-3" style={{ color: colors.error }} />
            <span style={{ color: colors.error }}>{failedCount}</span>
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Agent Session Node - represents a single coding agent session
 */
export const AgentSessionNode = React.memo(function AgentSessionNode({
  data,
  id,
}: {
  data: { data: AgentSessionNodeData };
  id: string;
}) {
  const { label, status, outputLines, duration, exitCode, pty, command, workdir } = data.data;
  const colors = useThemeColors();
  const theme = useAgentFlowStore((s) => s.theme);
  const killSession = useCodingAgentsStore((s) => s.killSession);

  // Extract session ID from node ID (format: "session-{id}")
  const sessionId = id.replace('session-', '');

  // Determine border color based on status
  let borderColor = colors.success;
  if (status === 'running') {
    borderColor = colors.running;
  } else if (status === 'failed') {
    borderColor = colors.error;
  }

  // Status icon
  const StatusIcon = status === 'running' ? Play : status === 'failed' ? XCircle : CheckCircle;

  // Kill handler - stop propagation to prevent node selection
  const handleKill = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    killSession(sessionId);
  }, [killSession, sessionId]);

  return (
    <div
      className="relative px-4 py-3 rounded-lg backdrop-blur-sm min-w-[130px]"
      style={{
        backgroundColor: colors.nodeBg,
        border: `2px ${getBorderStyle(theme)} ${borderColor}`,
        boxShadow: `0 0 20px ${borderColor}40`,
        fontFamily: getFontFamily(theme),
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Terminal className="w-4 h-4" style={{ color: borderColor }} />
        <span className="text-xs font-bold" style={{ color: borderColor }}>
          {label}
        </span>
        {pty && (
          <span
            className="px-1 py-0.5 rounded text-[8px] uppercase"
            style={{
              backgroundColor: `${borderColor}20`,
              color: borderColor,
            }}
          >
            PTY
          </span>
        )}
      </div>

      {/* Status Row */}
      <div className="flex items-center gap-2 mb-1">
        <StatusIcon
          className="w-3 h-3"
          style={{
            color: borderColor,
            animation: status === 'running' ? 'pulse 1.5s infinite' : 'none',
          }}
        />
        <span className="text-[10px] capitalize" style={{ color: `${colors.nodeText}90` }}>
          {status}
        </span>
        {exitCode !== null && exitCode !== 0 && (
          <span className="text-[10px]" style={{ color: colors.error }}>
            (exit: {exitCode})
          </span>
        )}
      </div>

      {/* Stats Row */}
      <div className="flex justify-between text-[10px]" style={{ color: `${colors.nodeText}70` }}>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{duration}</span>
        </div>
        <div className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          <span>{outputLines}</span>
        </div>
      </div>

      {/* Truncated workdir */}
      <div
        className="mt-1 text-[9px] truncate max-w-[120px]"
        style={{ color: `${colors.nodeText}50` }}
        title={workdir}
      >
        {workdir.split(/[/\\]/).slice(-2).join('/')}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1.5 mt-2 pt-2 border-t" style={{ borderColor: `${colors.nodeText}20` }}>
        {/* View Logs - clicking anywhere else on node also selects it */}
        <button
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[9px] transition-colors"
          style={{
            backgroundColor: `${borderColor}20`,
            color: borderColor,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = `${borderColor}40`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = `${borderColor}20`;
          }}
          title="View logs"
        >
          <Eye className="w-3 h-3" />
          <span>VIEW</span>
        </button>

        {/* Kill - only for running sessions */}
        {status === 'running' && (
          <button
            onClick={handleKill}
            className="flex items-center justify-center gap-1 px-2 py-1 rounded text-[9px] transition-colors"
            style={{
              backgroundColor: `${colors.error}20`,
              color: colors.error,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `${colors.error}40`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = `${colors.error}20`;
            }}
            title="Kill session"
          >
            <Square className="w-3 h-3" />
            <span>KILL</span>
          </button>
        )}
      </div>
    </div>
  );
});

/**
 * Wave Group Node - represents a wave of parallel tasks from /max-subagents-parallel
 */
export const WaveGroupNode = React.memo(function WaveGroupNode({
  data,
}: {
  data: { data: WaveGroupNodeData };
}) {
  const { label, waveId, sessionCount, activeCount, completedCount, failedCount } = data.data;
  const colors = useThemeColors();
  const theme = useAgentFlowStore((s) => s.theme);

  // Determine border color based on overall wave status
  let borderColor = colors.success;
  if (activeCount > 0) {
    borderColor = colors.running;
  } else if (failedCount > 0) {
    borderColor = colors.error;
  }

  return (
    <div
      className="relative px-5 py-4 rounded-lg backdrop-blur-sm min-w-[140px]"
      style={{
        backgroundColor: colors.nodeBg,
        border: `2px ${getBorderStyle(theme)} ${borderColor}`,
        boxShadow: `0 0 25px ${borderColor}50, inset 0 0 15px ${borderColor}15`,
        fontFamily: getFontFamily(theme),
      }}
    >
      {/* Input handle (from session manager or previous wave) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />

      {/* Output handle (to sessions or next wave) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />

      {/* Header */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <Layers className="w-5 h-5" style={{ color: borderColor }} />
        <span className="text-sm font-bold tracking-wider" style={{ color: borderColor }}>
          {label}
        </span>
      </div>

      {/* Session count */}
      <div className="text-center mb-2">
        <span className="text-xl font-bold" style={{ color: colors.nodeText }}>
          {sessionCount}
        </span>
        <span className="text-[10px] ml-1" style={{ color: `${colors.nodeText}80` }}>
          agents
        </span>
      </div>

      {/* Status breakdown */}
      <div className="flex justify-center gap-3 text-[10px]">
        {activeCount > 0 && (
          <div className="flex items-center gap-1">
            <Play className="w-3 h-3" style={{ color: colors.running }} />
            <span style={{ color: colors.running }}>{activeCount}</span>
          </div>
        )}
        {completedCount > 0 && (
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" style={{ color: colors.success }} />
            <span style={{ color: colors.success }}>{completedCount}</span>
          </div>
        )}
        {failedCount > 0 && (
          <div className="flex items-center gap-1">
            <XCircle className="w-3 h-3" style={{ color: colors.error }} />
            <span style={{ color: colors.error }}>{failedCount}</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {sessionCount > 0 && (
        <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${colors.nodeText}20` }}>
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${((completedCount + failedCount) / sessionCount) * 100}%`,
              backgroundColor: failedCount > 0 ? colors.error : colors.success,
            }}
          />
        </div>
      )}
    </div>
  );
});

// Export node types for ReactFlow
export const agentNodeTypes = {
  'session-manager': SessionManagerNode,
  'agent-session': AgentSessionNode,
  'wave-group': WaveGroupNode,
};
