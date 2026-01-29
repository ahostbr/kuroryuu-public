/**
 * ToolNode - MCP Tool node in Graphiti unified view
 * Displays as a hexagon-like shape with latency indicators
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { GraphitiNodeStatus, GraphitiTheme } from '../../../types/graphiti-event';

interface ToolNodeData {
  label: string;
  status: GraphitiNodeStatus;
  eventCount: number;
  errorCount: number;
  avgLatency?: number;
  lastEventTime?: string;
  theme: GraphitiTheme;
  selected?: boolean;
}

const STATUS_COLORS: Record<GraphitiNodeStatus, { bg: string; border: string }> = {
  idle: { bg: 'bg-zinc-800', border: 'border-zinc-600' },
  active: { bg: 'bg-purple-900/50', border: 'border-purple-400' },
  pending: { bg: 'bg-zinc-700', border: 'border-zinc-500' },
  success: { bg: 'bg-green-900/50', border: 'border-green-500' },
  error: { bg: 'bg-red-900/50', border: 'border-red-500' },
  blocked: { bg: 'bg-orange-900/50', border: 'border-orange-500' },
  timeout: { bg: 'bg-amber-900/50', border: 'border-amber-500' },
};

function formatLatency(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolNode({ data }: NodeProps) {
  const nodeData = data as unknown as ToolNodeData;
  const statusStyle = STATUS_COLORS[nodeData.status] || STATUS_COLORS.idle;
  const isSelected = nodeData.selected;
  const hasErrors = nodeData.errorCount > 0;

  return (
    <div
      className={`
        graphiti-node graphiti-tool-node
        relative flex flex-col items-center justify-center
        w-20 h-20
        ${statusStyle.bg} ${statusStyle.border} border-2
        ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
        transition-all duration-200 hover:scale-105
        cursor-pointer
      `}
      style={{
        // Hexagon-like shape using clip-path
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
      }}
    >
      {/* Tool icon */}
      <div className="text-lg mb-0.5">
        <svg
          className="w-5 h-5 text-purple-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </div>

      {/* Tool name */}
      <div className="text-[10px] font-medium text-center px-1 truncate max-w-[4rem]">
        {nodeData.label.replace('k_', '')}
      </div>

      {/* Latency indicator */}
      <div className="text-[9px] text-muted-foreground mt-0.5">
        {formatLatency(nodeData.avgLatency)}
      </div>
    </div>
  );
}

// Also export a regular rectangular version for non-clipped contexts
export function ToolNodeRect({ data }: NodeProps) {
  const nodeData = data as unknown as ToolNodeData;
  const statusStyle = STATUS_COLORS[nodeData.status] || STATUS_COLORS.idle;
  const isSelected = nodeData.selected;

  return (
    <div
      className={`
        graphiti-node graphiti-tool-node-rect
        relative flex flex-col items-center justify-center
        w-24 h-16 rounded-lg
        ${statusStyle.bg} ${statusStyle.border} border-2
        ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
        transition-all duration-200 hover:scale-105
        cursor-pointer
      `}
    >
      <div className="flex items-center gap-1 mb-1">
        <svg
          className="w-4 h-4 text-purple-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
        </svg>
        <span className="text-xs font-medium">{nodeData.label.replace('k_', '')}</span>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{nodeData.eventCount} calls</span>
        <span>{formatLatency(nodeData.avgLatency)}</span>
      </div>

      {/* Error indicator */}
      {nodeData.errorCount > 0 && (
        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] px-1 rounded-full">
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
