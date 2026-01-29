/**
 * RouterNode - Simplified node showing aggregated router stats
 * Displays: router name, endpoint count, request rate, error rate
 * Click to expand endpoints in popout
 */
import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Server, AlertCircle, Zap } from 'lucide-react';

export interface RouterNodeData {
  router: string;           // e.g., "/v1/agents"
  endpointCount: number;    // Number of endpoints in this router
  requestCount: number;     // Total requests
  requestsPerSecond: number;
  errorCount: number;
  errorRate: number;
  avgLatency: number;
  isActive: boolean;        // Had activity in last 2s
  endpoints: string[];      // List of endpoint paths for popout
}

// Color mapping for routers
const ROUTER_COLORS: Record<string, string> = {
  '/v1/agents': '#8b5cf6',      // purple
  '/v1/inbox': '#f59e0b',       // amber
  '/v1/orchestration': '#3b82f6', // blue
  '/v1/chat': '#22d3ee',        // cyan
  '/v1/harness': '#10b981',     // emerald
  '/v1/hooks': '#ec4899',       // pink
  '/v1/leader': '#6366f1',      // indigo
  '/v1/sessions': '#14b8a6',    // teal
  '/v1/worktrees': '#84cc16',   // lime
  '/v1/artifacts': '#f97316',   // orange
  '/v1/traffic': '#06b6d4',     // cyan-500
  '/v1/pty-traffic': '#0891b2', // cyan-600
  '/v1/linear': '#4f46e5',      // indigo-600
  '/ws': '#a855f7',             // purple-500
  '/mcp': '#22c55e',            // green
  '/ipc': '#eab308',            // yellow
  'default': '#64748b',         // slate
};

function getRouterColor(router: string): string {
  return ROUTER_COLORS[router] || ROUTER_COLORS['default'];
}

function getRouterLabel(router: string): string {
  // Convert /v1/agents -> agents, /ws -> WebSocket, etc.
  if (router === '/ws') return 'WebSocket';
  if (router === '/mcp') return 'MCP';
  if (router === '/ipc') return 'IPC';
  const parts = router.split('/').filter(Boolean);
  return parts[parts.length - 1] || router;
}

export const RouterNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as RouterNodeData;
  const color = getRouterColor(nodeData.router);
  const label = getRouterLabel(nodeData.router);
  const hasErrors = nodeData.errorRate > 0.05;

  return (
    <div
      className={`
        relative px-4 py-3 rounded-lg border-2 min-w-[140px]
        bg-zinc-900/95 backdrop-blur-sm
        transition-all duration-200
        ${selected ? 'ring-2 ring-cyan-400' : ''}
        ${nodeData.isActive ? 'shadow-lg shadow-cyan-500/30' : ''}
      `}
      style={{
        borderColor: hasErrors ? '#ef4444' : color,
        boxShadow: nodeData.isActive ? `0 0 20px ${color}40` : undefined
      }}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-zinc-600 !border-zinc-500"
      />

      {/* Header with icon and label */}
      <div className="flex items-center gap-2 mb-2">
        <Server
          className="w-4 h-4"
          style={{ color }}
        />
        <span className="font-semibold text-sm text-zinc-100 truncate max-w-[100px]">
          {label}
        </span>
        {/* Endpoint count badge */}
        <span
          className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold"
          style={{ backgroundColor: `${color}30`, color }}
        >
          {nodeData.endpointCount}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[10px]">
        {/* Request rate */}
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3 text-emerald-400" />
          <span className="text-zinc-400">
            {nodeData.requestsPerSecond > 0
              ? `${nodeData.requestsPerSecond.toFixed(1)}/s`
              : `${nodeData.requestCount}`
            }
          </span>
        </div>

        {/* Latency */}
        <div className="text-zinc-500">
          {nodeData.avgLatency > 0 ? `${Math.round(nodeData.avgLatency)}ms` : '-'}
        </div>

        {/* Error indicator */}
        {hasErrors && (
          <div className="flex items-center gap-1 text-red-400">
            <AlertCircle className="w-3 h-3" />
            <span>{(nodeData.errorRate * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>

      {/* Activity indicator */}
      {nodeData.isActive && (
        <div
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-ping"
          style={{ backgroundColor: color }}
        />
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-zinc-600 !border-zinc-500"
      />
    </div>
  );
});

RouterNode.displayName = 'RouterNode';

export default RouterNode;
