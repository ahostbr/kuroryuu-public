/**
 * TaskNode - Task/Subtask node in Graphiti unified view
 * Displays as a rectangle with status indicators
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { GraphitiNodeStatus, GraphitiTheme } from '../../../types/graphiti-event';

interface TaskNodeData {
  label: string;
  status: GraphitiNodeStatus;
  eventCount: number;
  errorCount: number;
  lastEventTime?: string;
  theme: GraphitiTheme;
  selected?: boolean;
}

const STATUS_COLORS: Record<GraphitiNodeStatus, { bg: string; border: string; text: string }> = {
  idle: { bg: 'bg-zinc-800', border: 'border-zinc-600', text: 'text-zinc-400' },
  active: { bg: 'bg-yellow-900/50', border: 'border-yellow-500', text: 'text-yellow-400' },
  pending: { bg: 'bg-zinc-700', border: 'border-zinc-500', text: 'text-zinc-300' },
  success: { bg: 'bg-green-900/50', border: 'border-green-500', text: 'text-green-400' },
  error: { bg: 'bg-red-900/50', border: 'border-red-500', text: 'text-red-400' },
  blocked: { bg: 'bg-orange-900/50', border: 'border-orange-500', text: 'text-orange-400' },
  timeout: { bg: 'bg-purple-900/50', border: 'border-purple-500', text: 'text-purple-400' },
};

const STATUS_ICONS: Record<GraphitiNodeStatus, string> = {
  idle: '○',
  active: '◉',
  pending: '◔',
  success: '✓',
  error: '✕',
  blocked: '⊘',
  timeout: '⏱',
};

export function TaskNode({ data }: NodeProps) {
  const nodeData = data as unknown as TaskNodeData;
  const statusStyle = STATUS_COLORS[nodeData.status] || STATUS_COLORS.idle;
  const statusIcon = STATUS_ICONS[nodeData.status] || STATUS_ICONS.idle;
  const isSelected = nodeData.selected;

  return (
    <div
      className={`
        graphiti-node graphiti-task-node
        relative flex flex-col
        min-w-[120px] max-w-[180px] p-3 rounded-lg
        ${statusStyle.bg} ${statusStyle.border} border-2
        ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
        transition-all duration-200 hover:scale-105
        cursor-pointer
        shadow-lg
      `}
    >
      {/* Header row with status icon */}
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-lg ${statusStyle.text}`}>{statusIcon}</span>
        <span className={`text-[10px] uppercase tracking-wider ${statusStyle.text}`}>
          {nodeData.status}
        </span>
      </div>

      {/* Task label */}
      <div className="text-sm font-medium text-foreground truncate">
        {nodeData.label}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
        <span>{nodeData.eventCount} events</span>
        {nodeData.errorCount > 0 && (
          <span className="text-red-400">{nodeData.errorCount} err</span>
        )}
      </div>

      {/* Progress indicator for active tasks */}
      {nodeData.status === 'active' && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700 rounded-b overflow-hidden">
          <div className="h-full bg-yellow-500 animate-pulse" style={{ width: '60%' }} />
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
