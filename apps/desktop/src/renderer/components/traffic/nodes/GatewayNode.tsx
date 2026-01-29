/**
 * GatewayNode - Central gateway node in traffic visualization
 * Displays as a pulsing cyan circle at the center of the network graph
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

interface GatewayNodeData {
  label?: string;
  requestCount?: number;
  errorCount?: number;
}

export function GatewayNode({ data }: NodeProps) {
  const nodeData = data as unknown as GatewayNodeData;
  return (
    <div className="gateway-node">
      <div className="gateway-core">
        <div className="gateway-pulse" />
        <div className="gateway-label">{nodeData.label || 'GATEWAY'}</div>
        <div className="gateway-stats">
          <span>{nodeData.requestCount || 0} req</span>
          {(nodeData.errorCount ?? 0) > 0 && (
            <span className="ml-2 text-red-400">{nodeData.errorCount} err</span>
          )}
        </div>
      </div>

      {/* Connection handles for all directions */}
      <Handle type="source" position={Position.Top} id="top" className="opacity-0" />
      <Handle type="source" position={Position.Right} id="right" className="opacity-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="opacity-0" />
      <Handle type="source" position={Position.Left} id="left" className="opacity-0" />
    </div>
  );
}
