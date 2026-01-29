/**
 * GatewayNode - Central gateway node for network graph
 * Shows overall gateway stats
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Server, Wifi, WifiOff } from 'lucide-react';

export interface GatewayNodeData {
  label: string;
  isConnected: boolean;
  totalRequests: number;
  requestsPerSecond: number;
  avgLatency: number;
  errorRate: number;
}

export function GatewayNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as GatewayNodeData;

  return (
    <div
      className={`
        relative flex flex-col items-center justify-center
        w-24 h-24 rounded-full
        bg-gradient-to-br from-cyan-900/50 to-cyan-950/70
        border-2 ${nodeData.isConnected ? 'border-cyan-400' : 'border-zinc-600'}
        ${selected ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-background' : ''}
        transition-all duration-300
        shadow-lg shadow-cyan-500/20
        cursor-pointer hover:scale-105
      `}
    >
      {/* Pulsing ring when connected */}
      {nodeData.isConnected && (
        <div className="absolute inset-0 rounded-full border-2 border-cyan-400/50 animate-ping" />
      )}

      {/* Icon */}
      <Server className="w-6 h-6 text-cyan-400 mb-1" />

      {/* Label */}
      <span className="text-[10px] font-semibold text-cyan-300">Gateway</span>

      {/* Connection status */}
      <div className="flex items-center gap-1 mt-1">
        {nodeData.isConnected ? (
          <Wifi className="w-3 h-3 text-emerald-400" />
        ) : (
          <WifiOff className="w-3 h-3 text-red-400" />
        )}
        <span className={`text-[9px] ${nodeData.isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
          {nodeData.isConnected ? 'Live' : 'Offline'}
        </span>
      </div>

      {/* Stats */}
      <div className="absolute -bottom-6 text-center">
        <span className="text-[9px] text-muted-foreground">
          {nodeData.requestsPerSecond.toFixed(1)} req/s
        </span>
      </div>

      {/* Multi-directional handles for force layout */}
      <Handle type="source" position={Position.Top} id="top" className="!opacity-0" />
      <Handle type="source" position={Position.Right} id="right" className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!opacity-0" />
      <Handle type="source" position={Position.Left} id="left" className="!opacity-0" />
    </div>
  );
}

export default GatewayNode;
