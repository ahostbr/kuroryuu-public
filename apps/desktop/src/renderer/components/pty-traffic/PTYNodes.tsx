/**
 * Custom React Flow nodes for PTY Traffic visualization
 * Themed to match the current visualization theme
 * QW-4: All node components wrapped with React.memo to prevent unnecessary re-renders
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Terminal, Bot, Server, Crown } from 'lucide-react';
import { usePTYTrafficStore } from '../../stores/pty-traffic-store';
import type { PTYVizTheme } from '../../types/pty-traffic';

// Theme-aware color palettes
const THEME_COLORS: Record<PTYVizTheme, {
  success: string;
  error: string;
  blocked: string;
  agent: string;
  leader: string;
  pty: string;
  mcpCore: string;
  nodeBg: string;
  nodeText: string;
  border: string;
  borderStyle: string;
  fontFamily: string;
}> = {
  cyberpunk: {
    success: '#00ff88',
    error: '#ff3366',
    blocked: '#ff9900',
    agent: '#9966ff',
    leader: '#ffcc00',
    pty: '#00ffff',
    mcpCore: '#ff00ff',
    nodeBg: 'rgba(0, 0, 0, 0.85)',
    nodeText: '#ffffff',
    border: '2px solid',
    borderStyle: 'solid',
    fontFamily: 'inherit',
  },
  kuroryuu: {
    success: '#c9a227', // Gold
    error: '#8b1e1e', // Deep red
    blocked: '#b8860b', // Dark gold
    agent: '#8b1e1e', // Dragon red
    leader: '#c9a227', // Imperial gold
    pty: '#c9a227', // Gold
    mcpCore: '#c9a227', // Gold
    nodeBg: 'rgba(20, 10, 5, 0.95)',
    nodeText: '#c9a227',
    border: '2px solid',
    borderStyle: 'solid',
    fontFamily: '"Reggae One", "MS Gothic", serif',
  },
  retro: {
    success: '#33ff00', // Phosphor green
    error: '#ff0000',
    blocked: '#ffcc00',
    agent: '#33ff00',
    leader: '#00ff00',
    pty: '#33ff00',
    mcpCore: '#33ff00',
    nodeBg: 'rgba(0, 10, 0, 0.95)',
    nodeText: '#33ff00',
    border: '2px dashed',
    borderStyle: 'dashed',
    fontFamily: '"VT323", "Courier New", monospace',
  },
  default: {
    success: '#22c55e',
    error: '#ef4444',
    blocked: '#f59e0b',
    agent: '#8b5cf6',
    leader: '#eab308',
    pty: '#06b6d4',
    mcpCore: '#a855f7',
    nodeBg: 'rgba(30, 30, 40, 0.95)',
    nodeText: '#e5e5e5',
    border: '1px solid',
    borderStyle: 'solid',
    fontFamily: 'inherit',
  },
};

// Helper to get current theme colors
function useThemeColors() {
  const vizTheme = usePTYTrafficStore((s) => s.vizTheme);
  return THEME_COLORS[vizTheme];
}

export interface AgentNodeData {
  label: string;
  agentId?: string;
  eventCount: number;
  errorCount: number;
  blockedCount: number;
  avgLatency: number;
  isLeader?: boolean;
}

export interface PTYSessionNodeData {
  label: string;
  sessionId?: string;
  eventCount: number;
  errorCount: number;
  blockedCount: number;
  avgLatency: number;
  cliType?: string;
}

export interface MCPCoreNodeData {
  label: string;
  eventCount: number;
  errorCount: number;
  blockedCount: number;
  avgLatency: number;
}

/**
 * Agent Node - represents an AI agent
 * QW-4: Wrapped with React.memo
 */
export const AgentNode = React.memo(function AgentNode({ data }: { data: AgentNodeData }) {
  const { label, eventCount, errorCount, blockedCount, isLeader, avgLatency } = data;
  const colors = useThemeColors();

  const borderColor = errorCount > 0 ? colors.error : blockedCount > 0 ? colors.blocked : isLeader ? colors.leader : colors.agent;

  return (
    <div
      className="relative px-4 py-3 rounded-lg backdrop-blur-sm min-w-[120px]"
      style={{
        backgroundColor: colors.nodeBg,
        border: `${colors.border.split(' ')[0]} ${colors.borderStyle} ${borderColor}`,
        boxShadow: `0 0 20px ${borderColor}40`,
        fontFamily: colors.fontFamily,
      }}
    >
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />

      <div className="flex items-center gap-2 mb-1">
        {isLeader ? (
          <Crown className="w-4 h-4" style={{ color: colors.leader }} />
        ) : (
          <Bot className="w-4 h-4" style={{ color: colors.agent }} />
        )}
        <span className="text-xs font-bold" style={{ color: borderColor }}>
          {label}
        </span>
      </div>

      <div className="flex justify-between text-[10px]" style={{ color: `${colors.nodeText}80` }}>
        <span>{eventCount} events</span>
        {errorCount > 0 && (
          <span style={{ color: colors.error }}>{errorCount} err</span>
        )}
        {blockedCount > 0 && (
          <span style={{ color: colors.blocked }}>{blockedCount} blk</span>
        )}
      </div>

      {avgLatency > 0 && (
        <div className="text-[10px] mt-1" style={{ color: `${colors.nodeText}60` }}>
          {avgLatency.toFixed(0)}ms avg
        </div>
      )}
    </div>
  );
});

/**
 * PTY Session Node - represents a PTY terminal session
 * QW-4: Wrapped with React.memo
 */
export const PTYSessionNode = React.memo(function PTYSessionNode({ data }: { data: PTYSessionNodeData }) {
  const { label, eventCount, errorCount, blockedCount, avgLatency, cliType } = data;
  const colors = useThemeColors();

  const borderColor = errorCount > 0 ? colors.error : blockedCount > 0 ? colors.blocked : colors.pty;

  return (
    <div
      className="relative px-4 py-3 rounded-lg backdrop-blur-sm min-w-[120px]"
      style={{
        backgroundColor: colors.nodeBg,
        border: `${colors.border.split(' ')[0]} ${colors.borderStyle} ${borderColor}`,
        boxShadow: `0 0 20px ${borderColor}40`,
        fontFamily: colors.fontFamily,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />

      <div className="flex items-center gap-2 mb-1">
        <Terminal className="w-4 h-4" style={{ color: colors.pty }} />
        <span className="text-xs font-bold" style={{ color: borderColor }}>
          {label}
        </span>
      </div>

      <div className="flex justify-between text-[10px]" style={{ color: `${colors.nodeText}80` }}>
        <span>{eventCount} events</span>
        {errorCount > 0 && (
          <span style={{ color: colors.error }}>{errorCount} err</span>
        )}
      </div>

      {avgLatency > 0 && (
        <div className="text-[10px] mt-1" style={{ color: `${colors.nodeText}60` }}>
          {avgLatency.toFixed(0)}ms avg
        </div>
      )}

      {cliType && (
        <div className="text-[10px] mt-0.5" style={{ color: `${colors.nodeText}50` }}>
          {cliType}
        </div>
      )}
    </div>
  );
});

/**
 * MCP Core Node - central hub
 * QW-4: Wrapped with React.memo
 */
export const MCPCoreNode = React.memo(function MCPCoreNode({ data }: { data: MCPCoreNodeData }) {
  const { label, eventCount, errorCount, blockedCount } = data;
  const colors = useThemeColors();

  const borderColor = colors.mcpCore;

  return (
    <div
      className="relative px-5 py-4 rounded-xl backdrop-blur-sm min-w-[140px]"
      style={{
        backgroundColor: colors.nodeBg,
        border: `${colors.border.split(' ')[0]} ${colors.borderStyle} ${borderColor}`,
        boxShadow: `0 0 30px ${borderColor}60`,
        fontFamily: colors.fontFamily,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />

      <div className="flex items-center gap-2 mb-2">
        <Server className="w-5 h-5" style={{ color: colors.mcpCore }} />
        <span className="text-sm font-bold" style={{ color: borderColor }}>
          {label}
        </span>
      </div>

      <div className="flex gap-3 text-[10px]">
        <span style={{ color: `${colors.nodeText}80` }}>{eventCount} total</span>
        {errorCount > 0 && (
          <span style={{ color: colors.error }}>{errorCount} err</span>
        )}
        {blockedCount > 0 && (
          <span style={{ color: colors.blocked }}>{blockedCount} blk</span>
        )}
      </div>
    </div>
  );
});

// Export node types for ReactFlow
export const nodeTypes = {
  agent: AgentNode,
  'pty-session': PTYSessionNode,
  'mcp-core': MCPCoreNode,
};
