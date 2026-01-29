/**
 * EndpointNode - Endpoint nodes in traffic visualization
 * Displays API endpoints with request stats and error indicators
 * Click to open endpoint detail drawer
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

interface EndpointNodeData {
  label?: string;
  category?: string;
  requestCount?: number;
  errorCount?: number;
  avgLatency?: number;
}

export function EndpointNode({ data }: NodeProps) {
  const nodeData = data as unknown as EndpointNodeData;
  const statusColor = (nodeData.errorCount ?? 0) > 0 ? '#ff0000' : '#00ff00';
  const latency = nodeData.avgLatency || 0;

  return (
    <div className="endpoint-node cursor-pointer hover:scale-105 transition-transform">
      <Handle type="target" position={Position.Left} className="opacity-0" />

      <div className="endpoint-content">
        <div className="endpoint-label">{nodeData.label || 'Unknown'}</div>
        <div className="endpoint-category text-xs opacity-60">[{nodeData.category || 'other'}]</div>
        <div className="endpoint-stats">
          <span className="req-count">{nodeData.requestCount || 0}</span>
          {latency > 0 && <span className="latency">{Math.round(latency)}ms</span>}
        </div>
        <div className="endpoint-status" style={{ backgroundColor: statusColor }} />
      </div>
    </div>
  );
}
