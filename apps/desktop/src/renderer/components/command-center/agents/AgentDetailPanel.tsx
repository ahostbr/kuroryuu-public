/**
 * Agent Detail Panel
 *
 * Shows expanded information about a selected agent.
 */
import React from 'react';
import { X, Crown, HardHat, Clock, Heart, Terminal, Tag } from 'lucide-react';
import type { LiveAgent } from '../../../types/command-center';

interface AgentDetailPanelProps {
  agent: LiveAgent;
  onClose: () => void;
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

export function AgentDetailPanel({ agent, onClose }: AgentDetailPanelProps) {
  const isLeader = agent.role === 'leader';
  const RoleIcon = isLeader ? Crown : HardHat;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-foreground">Agent Details</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-secondary transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Role & Status */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              isLeader
                ? 'bg-amber-500/20 text-amber-500'
                : 'bg-blue-500/20 text-blue-500'
            }`}
          >
            <RoleIcon className="w-4 h-4" />
            <span className="font-medium">{isLeader ? 'Leader' : 'Worker'}</span>
          </div>

          <div
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              agent.status === 'idle'
                ? 'bg-success/20 text-success'
                : agent.status === 'busy'
                  ? 'bg-warning/20 text-warning'
                  : 'bg-destructive/20 text-destructive'
            }`}
          >
            {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
          </div>
        </div>

        {/* Agent ID */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">
            Agent ID
          </label>
          <div className="p-3 bg-secondary rounded-lg font-mono text-sm text-foreground break-all">
            {agent.id}
          </div>
        </div>

        {/* Model */}
        {agent.model && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              Model
            </label>
            <div className="p-3 bg-secondary rounded-lg text-sm text-foreground">
              {agent.model}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">Registered</div>
              <div className="text-foreground">{formatDateTime(agent.registeredAt)}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Heart className="w-4 h-4 text-red-400" />
            <div>
              <div className="text-muted-foreground">Last Heartbeat</div>
              <div className="text-foreground">{formatDateTime(agent.lastHeartbeat)}</div>
            </div>
          </div>
        </div>

        {/* PTY Session */}
        {agent.ptySessionId && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Terminal className="w-3 h-3" />
              PTY Session
            </label>
            <div className="p-3 bg-secondary rounded-lg font-mono text-sm text-foreground">
              {agent.ptySessionId}
            </div>
          </div>
        )}

        {/* Current Task */}
        {agent.currentTaskId && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              Current Task
            </label>
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg font-mono text-sm text-primary">
              {agent.currentTaskId}
            </div>
          </div>
        )}

        {/* Capabilities */}
        {agent.capabilities && agent.capabilities.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Tag className="w-3 h-3" />
              Capabilities
            </label>
            <div className="flex flex-wrap gap-2">
              {agent.capabilities.map((cap, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-secondary rounded text-xs text-foreground"
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        {agent.metadata && Object.keys(agent.metadata).length > 0 && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              Metadata
            </label>
            <pre className="p-3 bg-secondary rounded-lg text-xs text-foreground overflow-auto max-h-40">
              {JSON.stringify(agent.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentDetailPanel;
