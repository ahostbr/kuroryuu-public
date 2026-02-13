import React from 'react';
import {
  Crown,
  User,
  ListTodo,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';

interface MemberCardProps {
  name: string;
  agentType: string;
  model: string; // e.g. "claude-opus-4-6"
  color?: string; // hex color for dot
  isLead: boolean;
  status: 'active' | 'idle' | 'stopped' | 'presumed_dead';
  taskCount: number;
  messageCount: number;
  uptime?: string; // pre-formatted e.g. "5h 23m"
  hasExited?: boolean; // true if agent has left
  onClick?: () => void;
}

function getModelBadge(model: string): string {
  if (model.includes('opus')) return 'OPUS';
  if (model.includes('sonnet')) return 'SONNET';
  if (model.includes('haiku')) return 'HAIKU';
  return model.split('-').pop()?.toUpperCase() ?? '';
}

interface StatusConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}

const statusConfigs: Record<
  'active' | 'idle' | 'stopped' | 'presumed_dead',
  StatusConfig
> = {
  active: {
    label: 'Active',
    icon: CheckCircle,
    className: 'bg-success/15 text-success',
  },
  idle: {
    label: 'Idle',
    icon: Clock,
    className: 'bg-info/15 text-info',
  },
  stopped: {
    label: 'Stopped',
    icon: XCircle,
    className: 'bg-muted-foreground/15 text-muted-foreground',
  },
  presumed_dead: {
    label: 'Dead',
    icon: AlertTriangle,
    className: 'bg-destructive/15 text-destructive',
  },
};

export function MemberCard({
  name,
  agentType,
  model,
  color,
  isLead,
  status,
  taskCount,
  messageCount,
  uptime,
  hasExited,
  onClick,
}: MemberCardProps) {
  const statusConfig = statusConfigs[status];
  const StatusIcon = statusConfig.icon;
  const modelBadge = getModelBadge(model);

  const cardClasses = [
    'td-member-card',
    'rounded-lg',
    'border',
    'border-border/40',
    'bg-card',
    'p-3',
    'cursor-pointer',
    hasExited && 'opacity-50',
    isLead && 'border-l-2 border-l-primary/40',
  ]
    .filter(Boolean)
    .join(' ');

  const dotClasses = [
    'w-[10px]',
    'h-[10px]',
    'rounded-full',
    'flex-shrink-0',
    status === 'active' && 'td-health-pulse',
    status === 'presumed_dead' && 'td-health-pulse--danger',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClasses} onClick={onClick}>
      {/* Top row */}
      <div className="flex items-center gap-2">
        {/* Color dot */}
        <div
          className={dotClasses}
          style={{ backgroundColor: color || '#6b7280' }}
        />

        {/* Name */}
        <span className="text-sm font-semibold text-foreground truncate">
          {name}
        </span>

        {/* Crown for lead */}
        {isLead && <Crown className="w-3.5 h-3.5 text-primary" />}

        {/* Model badge */}
        <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold bg-secondary/80 text-muted-foreground">
          {modelBadge}
        </span>
      </div>

      {/* Status row */}
      <div className="mt-1.5 flex items-center gap-1.5">
        {/* Status badge */}
        <div
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusConfig.className}`}
        >
          <StatusIcon className="w-3 h-3" />
          <span>{statusConfig.label}</span>
        </div>

        {/* Agent type */}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {agentType}
        </span>
      </div>

      {/* Bottom row - stats */}
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        {/* Tasks */}
        <div className="inline-flex items-center gap-1">
          <ListTodo className="w-3 h-3" />
          <span>{taskCount}</span>
        </div>

        {/* Messages */}
        <div className="inline-flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          <span>{messageCount}</span>
        </div>

        {/* Uptime */}
        {uptime && (
          <div className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{uptime}</span>
          </div>
        )}
      </div>
    </div>
  );
}
