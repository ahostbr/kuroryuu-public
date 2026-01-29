/**
 * Agent Card
 *
 * Displays a single agent with status indicator and role badge.
 */
import React from 'react';
import { Crown, HardHat, Heart } from 'lucide-react';
import type { LiveAgent } from '../../../types/command-center';

interface AgentCardProps {
  agent: LiveAgent;
  isSelected: boolean;
  onClick: () => void;
}

function getStatusColor(status: LiveAgent['status']): string {
  switch (status) {
    case 'idle':
      return 'bg-success';
    case 'busy':
      return 'bg-warning';
    case 'dead':
      return 'bg-destructive';
    default:
      return 'bg-muted';
  }
}

function getStatusLabel(status: LiveAgent['status']): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'busy':
      return 'Busy';
    case 'dead':
      return 'Dead';
    default:
      return 'Unknown';
  }
}

function formatTimeSince(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 1000) return 'just now';
  if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

export function AgentCard({ agent, isSelected, onClick }: AgentCardProps) {
  const isLeader = agent.role === 'leader';
  const RoleIcon = isLeader ? Crown : HardHat;

  return (
    <button
      onClick={onClick}
      className={`flex flex-col p-4 rounded-xl text-left transition-all ${
        isSelected
          ? 'bg-primary/10 border-2 border-primary shadow-lg'
          : 'bg-card border border-border hover:border-primary/50 hover:shadow-md'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${getStatusColor(agent.status)} ${
              agent.status === 'busy' ? 'animate-pulse' : ''
            }`}
          />
          <span className="text-xs text-muted-foreground">{getStatusLabel(agent.status)}</span>
        </div>

        {/* Role Badge */}
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            isLeader
              ? 'bg-amber-500/20 text-amber-500'
              : 'bg-blue-500/20 text-blue-500'
          }`}
        >
          <RoleIcon className="w-3 h-3" />
          {isLeader ? 'Leader' : 'Worker'}
        </div>
      </div>

      {/* Agent ID */}
      <div className="font-medium text-foreground truncate mb-1" title={agent.id}>
        {agent.id.length > 24 ? `${agent.id.substring(0, 24)}...` : agent.id}
      </div>

      {/* Model */}
      {agent.model && (
        <div className="text-sm text-muted-foreground mb-2">{agent.model}</div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
        {/* Heartbeat */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Heart
            className={`w-3 h-3 ${
              agent.status !== 'dead' ? 'text-red-400 animate-pulse' : 'text-muted-foreground'
            }`}
          />
          {formatTimeSince(agent.lastHeartbeat)}
        </div>

        {/* Task indicator */}
        {agent.currentTaskId && (
          <div className="text-xs text-primary truncate max-w-[100px]" title={agent.currentTaskId}>
            Task: {agent.currentTaskId.substring(0, 8)}...
          </div>
        )}
      </div>
    </button>
  );
}

export default AgentCard;
