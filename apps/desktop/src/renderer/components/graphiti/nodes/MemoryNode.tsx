/**
 * MemoryNode - Knowledge/Memory node in Graphiti unified view
 * Displays as a diamond shape with memory type indicators
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { GraphitiNodeStatus, GraphitiTheme } from '../../../types/graphiti-event';

interface MemoryNodeData {
  label: string;
  status: GraphitiNodeStatus;
  eventCount: number;
  errorCount: number;
  lastEventTime?: string;
  theme: GraphitiTheme;
  selected?: boolean;
  memoryType?: 'entity' | 'relation' | 'episode' | 'fact';
}

const STATUS_COLORS: Record<GraphitiNodeStatus, { bg: string; border: string }> = {
  idle: { bg: 'bg-zinc-800', border: 'border-zinc-600' },
  active: { bg: 'bg-emerald-900/50', border: 'border-emerald-400' },
  pending: { bg: 'bg-zinc-700', border: 'border-zinc-500' },
  success: { bg: 'bg-green-900/50', border: 'border-green-500' },
  error: { bg: 'bg-red-900/50', border: 'border-red-500' },
  blocked: { bg: 'bg-orange-900/50', border: 'border-orange-500' },
  timeout: { bg: 'bg-purple-900/50', border: 'border-purple-500' },
};

const MEMORY_TYPE_ICONS: Record<string, string> = {
  entity: '◆',
  relation: '↔',
  episode: '◎',
  fact: '✦',
};

export function MemoryNode({ data }: NodeProps) {
  const nodeData = data as unknown as MemoryNodeData;
  const statusStyle = STATUS_COLORS[nodeData.status] || STATUS_COLORS.idle;
  const isSelected = nodeData.selected;
  const memoryIcon = MEMORY_TYPE_ICONS[nodeData.memoryType || 'entity'] || '◆';

  return (
    <div
      className={`
        graphiti-node graphiti-memory-node
        relative flex flex-col items-center justify-center
        w-20 h-20
        ${statusStyle.bg} ${statusStyle.border} border-2
        ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
        transition-all duration-200 hover:scale-105
        cursor-pointer
      `}
      style={{
        // Diamond shape using rotation
        transform: 'rotate(45deg)',
      }}
    >
      {/* Content rotated back to be readable */}
      <div
        className="flex flex-col items-center justify-center"
        style={{ transform: 'rotate(-45deg)' }}
      >
        {/* Memory type icon */}
        <div className="text-xl text-emerald-400 mb-0.5">
          {memoryIcon}
        </div>

        {/* Label */}
        <div className="text-[10px] font-medium text-center px-1 truncate max-w-[3.5rem]">
          {nodeData.label}
        </div>

        {/* Event count */}
        <div className="text-[9px] text-muted-foreground">
          {nodeData.eventCount} ops
        </div>
      </div>

      {/* Error indicator */}
      {nodeData.errorCount > 0 && (
        <div
          className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] px-1 rounded-full"
          style={{ transform: 'rotate(-45deg)' }}
        >
          {nodeData.errorCount}
        </div>
      )}
    </div>
  );
}

// Export a rectangular version for non-rotated contexts
export function MemoryNodeRect({ data }: NodeProps) {
  const nodeData = data as unknown as MemoryNodeData;
  const statusStyle = STATUS_COLORS[nodeData.status] || STATUS_COLORS.idle;
  const isSelected = nodeData.selected;
  const memoryIcon = MEMORY_TYPE_ICONS[nodeData.memoryType || 'entity'] || '◆';

  return (
    <div
      className={`
        graphiti-node graphiti-memory-node-rect
        relative flex flex-col items-center justify-center
        w-24 h-16 rounded-lg
        ${statusStyle.bg} ${statusStyle.border} border-2
        ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
        transition-all duration-200 hover:scale-105
        cursor-pointer
      `}
    >
      <div className="flex items-center gap-1 mb-1">
        <span className="text-lg text-emerald-400">{memoryIcon}</span>
        <span className="text-xs font-medium truncate max-w-[4rem]">{nodeData.label}</span>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{nodeData.eventCount} ops</span>
        {nodeData.memoryType && (
          <span className="text-emerald-400">{nodeData.memoryType}</span>
        )}
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
