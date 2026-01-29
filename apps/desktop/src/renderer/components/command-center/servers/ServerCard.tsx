/**
 * Server Card
 *
 * Displays server health status with ping and restart controls.
 */
import React, { useState } from 'react';
import { Server, RefreshCw, Clock, Activity, AlertCircle, Wrench, RotateCcw, Loader2, Users, Terminal, Sparkles } from 'lucide-react';
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

function getStatusLabel(status: ServerHealth['status']): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'disconnected':
      return 'Disconnected';
    case 'error':
      return 'Error';
    default:
      return 'Unknown';
  }
}

function getMetricIcon(serverId: string): React.ReactNode {
  const iconClass = "w-3.5 h-3.5";
  switch (serverId) {
    case 'mcp-core':
      return <Wrench className={iconClass} />;
    case 'gateway':
      return <Users className={iconClass} />;
    case 'pty-daemon':
      return <Terminal className={iconClass} />;
    case 'cliproxy':
      return <Sparkles className={iconClass} />;
    default:
      return <Wrench className={iconClass} />;
  }
}

function formatLastPing(lastPing?: string): string {
  if (!lastPing) return 'Never';

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
  const { id, name, url, status, lastPing, responseTimeMs, toolCount, error } = server;
  const [isRestarting, setIsRestarting] = useState(false);

  const isConnecting = status === 'connecting';

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await onRestart();
    } finally {
      setIsRestarting(false);
    }
  };

  return (
    <div
      className={`p-5 rounded-xl border transition-all ${
        status === 'connected'
          ? 'border-success/30 bg-success/5'
          : status === 'error'
            ? 'border-destructive/30 bg-destructive/5'
            : 'border-border bg-card'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              status === 'connected'
                ? 'bg-success/20 text-success'
                : status === 'error'
                  ? 'bg-destructive/20 text-destructive'
                  : 'bg-secondary text-muted-foreground'
            }`}
          >
            <Server className="w-5 h-5" />
          </div>

          <div>
            <h3 className="font-semibold text-foreground">{name}</h3>
            <p className="text-xs text-muted-foreground font-mono">{url}</p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(status)}`} />
          <span className="text-sm text-muted-foreground">{getStatusLabel(status)}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Response Time */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
            <Activity className="w-3.5 h-3.5" />
            <span className="text-xs">Latency</span>
          </div>
          <p className="text-lg font-semibold text-foreground">
            {responseTimeMs !== undefined ? `${responseTimeMs}ms` : '--'}
          </p>
        </div>

        {/* Last Ping */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs">Last Ping</span>
          </div>
          <p className="text-lg font-semibold text-foreground">{formatLastPing(lastPing)}</p>
        </div>

        {/* Server-Specific Metric */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
            {getMetricIcon(id)}
            <span className="text-xs">{server.metricLabel || 'Tools'}</span>
          </div>
          <p className="text-lg font-semibold text-foreground">
            {(server.metricValue ?? toolCount) !== undefined
              ? (server.metricValue ?? toolCount)
              : '--'}
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-3 mb-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {/* Ping Button */}
        <button
          onClick={onPing}
          disabled={isConnecting || isRestarting}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            isConnecting || isRestarting
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-secondary hover:bg-secondary/80 text-foreground'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${isConnecting ? 'animate-spin' : ''}`} />
          {isConnecting ? 'Pinging...' : 'Ping'}
        </button>

        {/* Restart Button */}
        <button
          onClick={handleRestart}
          disabled={isConnecting || isRestarting}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            isConnecting || isRestarting
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30'
          }`}
        >
          {isRestarting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Restarting...
            </>
          ) : (
            <>
              <RotateCcw className="w-4 h-4" />
              Restart
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default ServerCard;
