/**
 * EndpointMetricNode - Network endpoint node with mini-dashboard
 * Displays comprehensive metrics: requests, latency, errors, throughput
 */
import React, { useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Activity, AlertTriangle, Clock, Database } from 'lucide-react';
import { SparkLine } from '../../graphiti/SparkLine';

export interface EndpointMetricNodeData {
  endpoint: string;
  category: string;
  method: string;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  avgLatency: number;
  p95Latency?: number;
  minLatency?: number;
  maxLatency?: number;
  totalRequestBytes: number;
  totalResponseBytes: number;
  requestHistory: number[]; // Recent request counts for sparkline
  lastActive?: string;
  isActive?: boolean;
}

// Method colors
const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/80',
  POST: 'bg-blue-500/80',
  PUT: 'bg-amber-500/80',
  DELETE: 'bg-red-500/80',
  PATCH: 'bg-purple-500/80',
  OPTIONS: 'bg-zinc-500/80',
  HEAD: 'bg-zinc-500/80',
};

// Health status based on error rate
function getHealthStatus(errorRate: number): { color: string; border: string } {
  if (errorRate === 0) return { color: 'bg-emerald-900/30', border: 'border-emerald-500/50' };
  if (errorRate < 0.05) return { color: 'bg-emerald-900/20', border: 'border-emerald-500/30' };
  if (errorRate < 0.1) return { color: 'bg-amber-900/30', border: 'border-amber-500/50' };
  return { color: 'bg-red-900/30', border: 'border-red-500/50' };
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Format latency
function formatLatency(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// Format number with K/M suffix
function formatCount(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1000000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1000000).toFixed(1)}M`;
}

// Get shortened endpoint path
function shortenEndpoint(endpoint: string, maxLen: number = 20): string {
  if (endpoint.length <= maxLen) return endpoint;
  // Keep /v1/ prefix and last part
  const parts = endpoint.split('/');
  if (parts.length <= 3) return endpoint.slice(0, maxLen - 2) + '..';
  return `/..${parts.slice(-2).join('/')}`.slice(0, maxLen);
}

export function EndpointMetricNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as EndpointMetricNodeData;
  const healthStatus = getHealthStatus(nodeData.errorRate);

  // Calculate node width based on traffic (80-160px)
  const nodeWidth = useMemo(() => {
    const baseWidth = 140;
    const scale = Math.min(Math.log10(nodeData.requestCount + 1) / 4, 1);
    return baseWidth + scale * 40;
  }, [nodeData.requestCount]);

  const methodColor = METHOD_COLORS[nodeData.method] || METHOD_COLORS.GET;
  const totalBytes = nodeData.totalRequestBytes + nodeData.totalResponseBytes;

  return (
    <div
      className={`
        relative rounded-lg border-2 transition-all duration-200
        ${healthStatus.color} ${healthStatus.border}
        ${selected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-105' : ''}
        ${nodeData.isActive ? 'animate-pulse' : ''}
        hover:scale-105 cursor-pointer
        shadow-lg shadow-black/20
      `}
      style={{ width: nodeWidth, minHeight: 100 }}
    >
      {/* Header: Method + Endpoint */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/10">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${methodColor} text-white`}>
          {nodeData.method}
        </span>
        <span className="text-[10px] font-mono text-foreground/90 truncate flex-1" title={nodeData.endpoint}>
          {shortenEndpoint(nodeData.endpoint)}
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="px-2 py-1.5 space-y-1">
        {/* Row 1: Requests + Sparkline */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] text-muted-foreground">Reqs:</span>
            <span className="text-[10px] font-semibold text-foreground">{formatCount(nodeData.requestCount)}</span>
          </div>
          {nodeData.requestHistory.length > 1 && (
            <SparkLine
              data={nodeData.requestHistory}
              width={40}
              height={14}
              showDot={true}
              showFill={false}
              strokeWidth={1}
            />
          )}
        </div>

        {/* Row 2: Latency */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] text-muted-foreground">Avg:</span>
            <span className="text-[10px] font-semibold text-foreground">{formatLatency(nodeData.avgLatency)}</span>
          </div>
          {nodeData.p95Latency !== undefined && (
            <span className="text-[9px] text-muted-foreground">
              p95: {formatLatency(nodeData.p95Latency)}
            </span>
          )}
        </div>

        {/* Row 3: Errors */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <AlertTriangle className={`w-3 h-3 ${nodeData.errorCount > 0 ? 'text-red-400' : 'text-zinc-500'}`} />
            <span className="text-[10px] text-muted-foreground">Errs:</span>
            <span className={`text-[10px] font-semibold ${nodeData.errorCount > 0 ? 'text-red-400' : 'text-foreground'}`}>
              {nodeData.errorCount}
            </span>
          </div>
          <span className={`text-[9px] ${nodeData.errorRate > 0.05 ? 'text-red-400' : 'text-muted-foreground'}`}>
            ({(nodeData.errorRate * 100).toFixed(1)}%)
          </span>
        </div>

        {/* Row 4: Throughput */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Database className="w-3 h-3 text-purple-400" />
            <span className="text-[10px] text-muted-foreground">Data:</span>
            <span className="text-[10px] font-semibold text-foreground">{formatBytes(totalBytes)}</span>
          </div>
        </div>
      </div>

      {/* Category badge */}
      <div className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 rounded text-[8px] text-muted-foreground">
        {nodeData.category}
      </div>

      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-cyan-500 !border-cyan-300"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-cyan-500 !border-cyan-300"
      />
    </div>
  );
}

export default EndpointMetricNode;
