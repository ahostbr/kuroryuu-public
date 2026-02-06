/**
 * Custom ReactFlow nodes for Claude Teams visualization.
 * LeadNode: central hub showing team lead info.
 * TeammateNode: spoke nodes showing individual teammate state.
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Crown, User, CheckCircle, Clock, XCircle, MessageSquare, Users, Hash } from 'lucide-react';
import { useTeamFlowStore, THEME_COLORS, type TeamFlowTheme } from '../../stores/team-flow-store';
import { useClaudeTeamsStore } from '../../stores/claude-teams-store';
import type { TeamNodeData } from '../../types/claude-teams';

function useThemeColors() {
  const theme = useTeamFlowStore((s) => s.theme);
  return THEME_COLORS[theme];
}

function getBorderStyle(theme: TeamFlowTheme): string {
  return theme === 'retro' ? 'dashed' : 'solid';
}

function getFontFamily(theme: TeamFlowTheme): string {
  switch (theme) {
    case 'kuroryuu':
      return '"Reggae One", "MS Gothic", serif';
    case 'retro':
      return '"VT323", "Courier New", monospace';
    default:
      return 'inherit';
  }
}

function getStatusColor(status: string, colors: typeof THEME_COLORS['default']): string {
  switch (status) {
    case 'active':
      return colors.active;
    case 'idle':
      return colors.idle;
    case 'stopped':
      return colors.error;
    default:
      return colors.idle;
  }
}

function getModelBadge(model: string): string {
  if (model.includes('opus')) return 'OPUS';
  if (model.includes('sonnet')) return 'SONNET';
  if (model.includes('haiku')) return 'HAIKU';
  return model.split('-').pop()?.toUpperCase() ?? 'MODEL';
}

/**
 * Lead Node - central hub for the team lead
 */
export const LeadNode = React.memo(function LeadNode({
  data,
}: {
  data: { data: TeamNodeData };
}) {
  const { label, model, taskCount, unreadCount, agentType } = data.data;
  const colors = useThemeColors();
  const theme = useTeamFlowStore((s) => s.theme);

  return (
    <div
      className="relative px-6 py-5 rounded-xl backdrop-blur-sm min-w-[160px]"
      style={{
        backgroundColor: colors.nodeBg,
        border: `3px ${getBorderStyle(theme)} ${colors.hub}`,
        boxShadow: `0 0 40px ${colors.hub}60, inset 0 0 20px ${colors.hub}20`,
        fontFamily: getFontFamily(theme),
      }}
    >
      <Handle
        type="source"
        position={Position.Top}
        className="!w-4 !h-4 !border-2"
        style={{ backgroundColor: colors.hub, borderColor: colors.nodeBg }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !border-2"
        style={{ backgroundColor: colors.hub, borderColor: colors.nodeBg }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-4 !h-4 !border-2"
        style={{ backgroundColor: colors.hub, borderColor: colors.nodeBg }}
      />
      <Handle
        type="source"
        position={Position.Left}
        className="!w-4 !h-4 !border-2"
        style={{ backgroundColor: colors.hub, borderColor: colors.nodeBg }}
      />

      {/* Header */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <Crown className="w-6 h-6" style={{ color: colors.hub }} />
        <span className="text-sm font-bold tracking-wider uppercase" style={{ color: colors.hub }}>
          {label}
        </span>
      </div>

      {/* Model badge */}
      <div className="flex justify-center mb-2">
        <span
          className="px-2 py-0.5 rounded text-[10px] font-bold"
          style={{
            backgroundColor: `${colors.hub}25`,
            color: colors.hub,
            border: `1px solid ${colors.hub}40`,
          }}
        >
          {getModelBadge(model)}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex justify-center gap-4 text-[11px]">
        {taskCount > 0 && (
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" style={{ color: colors.success }} />
            <span style={{ color: colors.success }}>{taskCount} tasks</span>
          </div>
        )}
        {unreadCount > 0 && (
          <div className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" style={{ color: colors.active }} />
            <span style={{ color: colors.active }}>{unreadCount}</span>
          </div>
        )}
      </div>

      {/* Role */}
      <div className="text-center mt-2">
        <span className="text-[10px]" style={{ color: `${colors.nodeText}60` }}>
          {agentType}
        </span>
      </div>
    </div>
  );
});

/**
 * Teammate Node - individual spoke for a team member
 */
export const TeammateNode = React.memo(function TeammateNode({
  data,
}: {
  data: { data: TeamNodeData };
}) {
  const { label, status, model, color, taskCount, unreadCount, agentType } = data.data;
  const colors = useThemeColors();
  const theme = useTeamFlowStore((s) => s.theme);
  const healthInfo = useClaudeTeamsStore((s) => s.teammateHealth[label]);

  const statusColor = getStatusColor(status, colors);

  const StatusIcon = status === 'active' ? CheckCircle : status === 'idle' ? Clock : XCircle;

  // Health dot: green = active recently, yellow = idle >2min, red = unresponsive (>5min with active task)
  let healthDotColor = colors.success; // green
  if (healthInfo?.isUnresponsive) {
    healthDotColor = colors.error; // red
  } else if (status === 'idle') {
    healthDotColor = colors.idle; // yellow
  }

  return (
    <div
      className="relative px-4 py-3 rounded-lg backdrop-blur-sm min-w-[130px]"
      style={{
        backgroundColor: colors.nodeBg,
        border: `2px ${getBorderStyle(theme)} ${statusColor}`,
        boxShadow: `0 0 20px ${statusColor}40`,
        fontFamily: getFontFamily(theme),
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2"
        style={{ backgroundColor: statusColor, borderColor: colors.nodeBg }}
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2"
        style={{ backgroundColor: statusColor, borderColor: colors.nodeBg }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <User className="w-4 h-4" style={{ color: statusColor }} />
        <span className="text-xs font-bold" style={{ color: statusColor }}>
          {label}
        </span>
        {color && (
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        {/* Health dot */}
        <div
          className="w-2.5 h-2.5 rounded-full ml-auto shrink-0"
          style={{
            backgroundColor: healthDotColor,
            boxShadow: `0 0 6px ${healthDotColor}80`,
          }}
          title={
            healthInfo?.isUnresponsive
              ? 'Unresponsive (no activity >5min with active task)'
              : status === 'idle'
                ? 'Idle'
                : 'Healthy'
          }
        />
      </div>

      {/* Status Row */}
      <div className="flex items-center gap-2 mb-1">
        <StatusIcon
          className="w-3 h-3"
          style={{
            color: statusColor,
            animation: status === 'active' ? 'pulse 1.5s infinite' : 'none',
          }}
        />
        <span className="text-[10px] capitalize" style={{ color: `${colors.nodeText}90` }}>
          {status}
        </span>
      </div>

      {/* Model badge */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
          style={{
            backgroundColor: `${statusColor}20`,
            color: statusColor,
          }}
        >
          {getModelBadge(model)}
        </span>
      </div>

      {/* Stats Row */}
      <div className="flex justify-between text-[10px]" style={{ color: `${colors.nodeText}70` }}>
        {taskCount > 0 && (
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            <span>{taskCount}</span>
          </div>
        )}
        {unreadCount > 0 && (
          <div className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            <span>{unreadCount}</span>
          </div>
        )}
      </div>

      {/* Role */}
      <div
        className="mt-1 text-[9px] truncate max-w-[120px]"
        style={{ color: `${colors.nodeText}50` }}
        title={agentType}
      >
        {agentType}
      </div>
    </div>
  );
});

/**
 * Team Root Node - top-level team node for hierarchy and timeline views
 */
export const TeamRootNode = React.memo(function TeamRootNode({
  data,
}: {
  data: { data: TeamNodeData };
}) {
  // taskCount = completed tasks, unreadCount = member count (overloaded from layout builder)
  const { label, taskCount: completedCount, unreadCount: memberCount } = data.data;
  const colors = useThemeColors();
  const theme = useTeamFlowStore((s) => s.theme);

  return (
    <div
      className="relative px-8 py-6 rounded-xl backdrop-blur-sm min-w-[200px]"
      style={{
        backgroundColor: colors.nodeBg,
        border: `3px ${getBorderStyle(theme)} ${colors.hub}`,
        boxShadow: `0 0 50px ${colors.hub}70, inset 0 0 25px ${colors.hub}25`,
        fontFamily: getFontFamily(theme),
      }}
    >
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-4 !h-4 !border-2"
        style={{ backgroundColor: colors.hub, borderColor: colors.nodeBg }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !border-2"
        style={{ backgroundColor: colors.hub, borderColor: colors.nodeBg }}
      />

      {/* Team Name */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <Crown className="w-7 h-7" style={{ color: colors.hub }} />
        <span className="text-base font-bold tracking-wider uppercase" style={{ color: colors.hub }}>
          {label}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: `${colors.nodeText}20` }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: memberCount > 0 ? '100%' : '0%',
              backgroundColor: colors.success,
              // completedCount is overloaded as completed tasks count in the layout builder
            }}
          />
        </div>
        <div className="text-center mt-1">
          <span className="text-[10px]" style={{ color: `${colors.nodeText}80` }}>
            {completedCount} tasks completed
          </span>
        </div>
      </div>

      {/* Member count badge */}
      <div className="flex justify-center">
        <div className="flex items-center gap-1">
          <Users className="w-4 h-4" style={{ color: colors.active }} />
          <span className="text-xs font-bold" style={{ color: colors.active }}>
            {memberCount} members
          </span>
        </div>
      </div>
    </div>
  );
});

/**
 * Task Node - compact node for individual tasks in hierarchy/timeline views
 */
export const TaskNode = React.memo(function TaskNode({
  data,
}: {
  data: { data: TeamNodeData };
}) {
  // agentId = task ID, agentType = task status, label = subject, model = owner name
  const { label, agentId: taskId, agentType: taskStatus, model: ownerName } = data.data;
  const colors = useThemeColors();
  const theme = useTeamFlowStore((s) => s.theme);

  // Border color based on task status
  let borderColor: string;
  switch (taskStatus) {
    case 'in_progress':
      borderColor = colors.active;
      break;
    case 'completed':
      borderColor = colors.success;
      break;
    default:
      borderColor = `${colors.nodeText}40`;
  }

  // Status badge
  const statusLabel = taskStatus === 'in_progress' ? 'IN PROGRESS' : taskStatus.toUpperCase();

  return (
    <div
      className="relative px-3 py-2 rounded-md backdrop-blur-sm min-w-[120px] max-w-[180px]"
      style={{
        backgroundColor: colors.nodeBg,
        border: `1.5px ${getBorderStyle(theme)} ${borderColor}`,
        boxShadow: `0 0 10px ${borderColor}30`,
        fontFamily: getFontFamily(theme),
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !border-2"
        style={{ backgroundColor: borderColor, borderColor: colors.nodeBg }}
      />

      {/* Header: ID badge + subject */}
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="px-1 py-0.5 rounded text-[8px] font-bold shrink-0"
          style={{
            backgroundColor: `${borderColor}20`,
            color: borderColor,
          }}
        >
          <Hash className="w-2.5 h-2.5 inline" />
          {taskId}
        </span>
        <span
          className="text-[10px] font-medium truncate"
          style={{ color: colors.nodeText }}
          title={label}
        >
          {label}
        </span>
      </div>

      {/* Status badge */}
      <div className="flex items-center justify-between">
        <span
          className="px-1 py-0.5 rounded text-[7px] font-bold uppercase"
          style={{
            backgroundColor: `${borderColor}15`,
            color: borderColor,
            border: `1px solid ${borderColor}30`,
          }}
        >
          {statusLabel}
        </span>
        {ownerName && (
          <span
            className="text-[8px] truncate max-w-[60px]"
            style={{ color: `${colors.nodeText}60` }}
            title={ownerName}
          >
            {ownerName}
          </span>
        )}
      </div>
    </div>
  );
});

// Export node types for ReactFlow
export const teamNodeTypes = {
  lead: LeadNode,
  teammate: TeammateNode,
  'team-root': TeamRootNode,
  task: TaskNode,
};
