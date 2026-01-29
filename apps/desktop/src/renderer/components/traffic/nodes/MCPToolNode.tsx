/**
 * MCPToolNode - MCP tool nodes in traffic visualization
 * Displays MCP tools with magenta styling to distinguish from regular endpoints
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

interface MCPToolData {
  label?: string;
  errorCount?: number;
  avgLatency?: number;
  requestCount?: number;
}

export function MCPToolNode({ data }: NodeProps) {
  const nodeData = data as MCPToolData;
  const statusColor = (nodeData.errorCount ?? 0) > 0 ? '#ff0000' : '#ff00ff'; // Magenta for MCP
  const latency = nodeData.avgLatency ?? 0;

  return (
    <div className="mcp-tool-node">
      <Handle type="target" position={Position.Left} className="opacity-0" />

      <div className="mcp-tool-content">
        <div className="mcp-tool-label">{nodeData.label || 'MCP Tool'}</div>
        <div className="mcp-tool-stats">
          <span className="req-count">{nodeData.requestCount ?? 0}</span>
          {latency > 0 && <span className="latency">{Math.round(latency)}ms</span>}
        </div>
        <div className="mcp-tool-status" style={{ backgroundColor: statusColor }} />
      </div>
    </div>
  );
}
