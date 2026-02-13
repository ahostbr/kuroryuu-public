import React from 'react';
import { MemberCard } from './MemberCard';
import type { TeamConfig, TeamTask, InboxMessage, TeammateHealthInfo } from '../../../types/claude-teams';

interface MembersTabProps {
  config: TeamConfig;
  tasks: TeamTask[];
  inboxes: Record<string, InboxMessage[]>;
  teammateHealth: Record<string, TeammateHealthInfo>;
  onSelectTeammate?: (name: string) => void;
}

function formatUptime(ms: number | undefined): string | undefined {
  if (!ms) return undefined;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

export function MembersTab({
  config,
  tasks,
  inboxes,
  teammateHealth,
  onSelectTeammate,
}: MembersTabProps) {
  // Filter out deleted tasks
  const visibleTasks = tasks.filter(t => t.status !== 'deleted');

  // Derive member status
  const getMemberStatus = (member: typeof config.members[0]): 'active' | 'idle' | 'stopped' | 'presumed_dead' => {
    if (member.agentId === config.leadAgentId) return 'active';

    const health = teammateHealth[member.name];
    if (health?.exitedAt) return 'stopped';
    if (health?.isUnresponsive) return 'presumed_dead';

    const hasActiveTask = visibleTasks.some(t => t.status === 'in_progress' && t.owner === member.name);
    return hasActiveTask ? 'active' : 'idle';
  };

  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {config.members.map(member => {
        const taskCount = visibleTasks.filter(t => t.owner === member.name).length;
        const messageCount = inboxes[member.name]?.length || 0;
        const status = getMemberStatus(member);
        const uptime = formatUptime(teammateHealth[member.name]?.uptime);
        const isLead = member.agentId === config.leadAgentId;
        const hasExited = !!teammateHealth[member.name]?.exitedAt;

        return (
          <MemberCard
            key={member.agentId}
            name={member.name}
            agentType={member.agentType}
            model={member.model}
            color={member.color}
            status={status}
            taskCount={taskCount}
            messageCount={messageCount}
            isLead={isLead}
            uptime={uptime}
            hasExited={hasExited}
            onClick={() => onSelectTeammate?.(member.name)}
          />
        );
      })}
    </div>
  );
}
