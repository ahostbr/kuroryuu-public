/**
 * AgentNode - Agent node in Graphiti unified view
 * Displays as a circle with status indicators
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { GraphitiNodeStatus, GraphitiTheme } from '../../../types/graphiti-event';

interface AgentNodeData {
  label: string;
  status: GraphitiNodeStatus;
  eventCount: number;
  errorCount: number;
  lastEventTime?: string;
  avgLatency?: number;
  theme: GraphitiTheme;
  selected?: boolean;
}

const STATUS_COLORS: Record<GraphitiNodeStatus, { bg: string; border: string; pulse?: string }> = {
  idle: { bg: 'bg-zinc-800', border: 'border-zinc-600' },
  active: { bg: 'bg-cyan-900/50', border: 'border-cyan-400', pulse: 'animate-pulse' },
  pending: { bg: 'bg-yellow-900/50', border: 'border-yellow-500' },
  success: { bg: 'bg-green-900/50', border: 'border-green-500' },
  error: { bg: 'bg-red-900/50', border: 'border-red-500', pulse: 'animate-pulse' },
  blocked: { bg: 'bg-orange-900/50', border: 'border-orange-500' },
  timeout: { bg: 'bg-purple-900/50', border: 'border-purple-500' },
};

export function AgentNode({ data }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData;
  const statusStyle = STATUS_COLORS[nodeData.status] || STATUS_COLORS.idle;
  const isSelected = nodeData.selected;

  return (
    <div
      className={`
        graphiti-node graphiti-agent-node
        relative flex flex-col items-center justify-center
        w-24 h-24 rounded-full
        ${statusStyle.bg} ${statusStyle.border} border-2
        ${statusStyle.pulse || ''}
        ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
        transition-all duration-200 hover:scale-105
        cursor-pointer
      `}
    >
      {/* Inner glow effect */}
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-white/5 to-transparent" />

      {/* Agent icon */}
      <div className="text-2xl mb-1">
        <svg
          className="w-6 h-6 text-current opacity-80"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </div>

      {/* Label */}
      <div className="text-xs font-medium text-center px-2 truncate max-w-[5rem]">
        {nodeData.label}
      </div>

      {/* Event count badge */}
      {nodeData.eventCount > 0 && (
        <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[1.25rem] text-center">
          {nodeData.eventCount > 99 ? '99+' : nodeData.eventCount}
        </div>
      )}

      {/* Error badge */}
      {nodeData.errorCount > 0 && (
        <div className="absolute -bottom-1 -right-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
          {nodeData.errorCount}
        </div>
      )}

      {/* Connection handles */}
      <Handle type="source" position={Position.Top} id="top" className="opacity-0 w-2 h-2" />
      <Handle type="target" position={Position.Top} id="top-target" className="opacity-0 w-2 h-2" />
      <Handle type="source" position={Position.Right} id="right" className="opacity-0 w-2 h-2" />
      <Handle type="target" position={Position.Right} id="right-target" className="opacity-0 w-2 h-2" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="opacity-0 w-2 h-2" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="opacity-0 w-2 h-2" />
      <Handle type="source" position={Position.Left} id="left" className="opacity-0 w-2 h-2" />
      <Handle type="target" position={Position.Left} id="left-target" className="opacity-0 w-2 h-2" />
    </div>
  );
}
