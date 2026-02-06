/**
 * Server Card (Compact Row)
 *
 * Displays server health as a compact inline row with status, stats, and controls.
 */
import React, { useState } from 'react';
import { RefreshCw, AlertCircle, RotateCcw, Loader2 } from 'lucide-react';
import type { ServerHealth } from '../../../types/command-center';

interface ServerCardProps {
  server: ServerHealth;
  onPing: () => void;
  onRestart: () => Promise<{ ok: boolean; error?: string }>;
}

function getStatusColor(status: ServerHealth['status']): string {
  switch (status) {
    case 'connected':
      return 'bg-success';
    case 'connecting':
      return 'bg-warning animate-pulse';
    case 'disconnected':
      return 'bg-muted';
    case 'error':
      return 'bg-destructive';
    default:
      return 'bg-muted';
  }
}

function formatLastPing(lastPing?: string): string {
  if (!lastPing) return '--';

  const date = new Date(lastPing);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 60000) {
    return `${Math.floor(diffMs / 1000)}s ago`;
  }
  if (diffMs < 3600000) {
    return `${Math.floor(diffMs / 60000)}m ago`;
  }
  return date.toLocaleTimeString();
}

export function ServerCard({ server, onPing, onRestart }: ServerCardProps) {
  const { name, url, status, lastPing, responseTimeMs, toolCount, error } = server;
  const [isRestarting, setIsRestarting] = useState(false);

  const isConnecting = status === 'connecting';
  const metricVal = server.metricValue ?? toolCount;

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await onRestart();
    } finally {
      setIsRestarting(false);
    }
  };

  return (
    <div className="group">
      <div className="flex items-center gap-3 px-3 py-2 hover:bg-secondary/40 rounded-md transition-colors min-h-[40px]">
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(status)}`} />

        {/* Name */}
        <span className="text-sm font-medium text-foreground w-24 flex-shrink-0 truncate" title={name}>
          {name}
        </span>

        {/* URL */}
        <span className="text-xs text-muted-foreground font-mono truncate w-40 flex-shrink-0" title={url}>
          {url}
        </span>

        {/* Latency */}
        <span className="text-xs text-muted-foreground w-16 flex-shrink-0 text-right" title="Latency">
          {responseTimeMs !== undefined ? `${responseTimeMs}ms` : '--'}
        </span>

        {/* Last Ping */}
        <span className="text-xs text-muted-foreground w-16 flex-shrink-0 text-right" title="Last ping">
          {formatLastPing(lastPing)}
        </span>

        {/* Metric (tools/agents/etc) */}
        <span className="text-xs text-muted-foreground w-14 flex-shrink-0 text-right" title={server.metricLabel || 'Tools'}>
          {metricVal !== undefined ? `${metricVal} ${server.metricLabel || 'tools'}` : '--'}
        </span>

        {/* Error indicator */}
        {error && (
          <span className="flex-shrink-0" title={error}>
            <AlertCircle className="w-3.5 h-3.5 text-destructive" />
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Ping button */}
        <button
          onClick={onPing}
          disabled={isConnecting || isRestarting}
          className="flex-shrink-0 p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Ping"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
        </button>

        {/* Restart button */}
        <button
          onClick={handleRestart}
          disabled={isConnecting || isRestarting}
          className="flex-shrink-0 p-1 rounded hover:bg-amber-500/20 text-muted-foreground hover:text-amber-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Restart"
        >
          {isRestarting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Error detail row (only when error present) */}
      {error && (
        <div className="flex items-center gap-2 px-3 pb-1 ml-5">
          <p className="text-xs text-destructive/80 truncate" title={error}>{error}</p>
        </div>
      )}
    </div>
  );
}

export default ServerCard;
