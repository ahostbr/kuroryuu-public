import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { TeamConfig, TeamTask, InboxMessage, TeamAnalytics, TeammateHealthInfo } from '../../../types/claude-teams';
import { parseSystemMessage } from '../../../types/claude-teams';

interface OverviewTabProps {
  config: TeamConfig;
  tasks: TeamTask[];
  inboxes: Record<string, InboxMessage[]>;
  analytics: TeamAnalytics | null;
  teammateHealth: Record<string, TeammateHealthInfo>;
  onTabChange: (tab: string) => void;
}

export function OverviewTab({
  config,
  tasks,
  inboxes,
  analytics,
  teammateHealth,
  onTabChange,
}: OverviewTabProps) {
  // Filter out deleted and internal tasks
  const visibleTasks = tasks.filter(t => t.status !== 'deleted' && t.metadata?._internal !== true);

  // Task counts
  const taskCounts = {
    pending: visibleTasks.filter(t => t.status === 'pending').length,
    inProgress: visibleTasks.filter(t => t.status === 'in_progress').length,
    completed: visibleTasks.filter(t => t.status === 'completed').length,
  };

  const totalTasks = taskCounts.pending + taskCounts.inProgress + taskCounts.completed;

  // Recent messages (last 5, excluding idle notifications)
  const allMessages = Object.entries(inboxes)
    .flatMap(([agentName, msgs]) =>
      msgs.map(m => ({ ...m, _agent: agentName }))
    )
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .filter(msg => {
      const parsed = parseSystemMessage(msg.text);
      return !parsed || parsed.type !== 'idle_notification';
    })
    .slice(-5);

  // Derive member status
  const getMemberStatus = (member: typeof config.members[0]): 'active' | 'idle' | 'stopped' | 'presumed_dead' => {
    if (member.agentId === config.leadAgentId) return 'active';

    const health = teammateHealth[member.name];
    if (health?.exitedAt) return 'stopped';
    if (health?.isUnresponsive) return 'presumed_dead';

    const hasActiveTask = visibleTasks.some(t => t.status === 'in_progress' && t.owner === member.name);
    return hasActiveTask ? 'active' : 'idle';
  };

  // Extract model shortname
  const getModelShortname = (model: string): string => {
    if (model.includes('opus')) return 'OPUS';
    if (model.includes('sonnet')) return 'SONNET';
    if (model.includes('haiku')) return 'HAIKU';
    return model.split('-').pop()?.toUpperCase() ?? '';
  };

  // Format timestamp
  const formatTime = (ts: string): string => {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  // Truncate message text
  const truncateText = (text: string, maxLen: number = 80): string => {
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
  };

  // Status dot color
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active': return 'var(--success)';
      case 'idle': return 'var(--info)';
      case 'stopped': return 'var(--muted-foreground)';
      case 'presumed_dead': return 'var(--destructive)';
      default: return 'var(--muted-foreground)';
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Section 1: Agent Strip */}
      <div
        className="cursor-pointer hover:bg-secondary/30 rounded-lg p-2 -m-2 transition-colors"
        onClick={() => onTabChange('members')}
      >
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Team Members
        </div>
        <div className="flex flex-wrap gap-2">
          {config.members.map(member => {
            const status = getMemberStatus(member);
            return (
              <div
                key={member.agentId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-border/40 text-xs"
              >
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: member.color || '#6b7280' }}
                />
                <span className="font-medium text-foreground">{member.name}</span>
                <span className="text-[9px] px-1 py-0.5 rounded bg-secondary/60 text-muted-foreground">
                  {getModelShortname(member.model)}
                </span>
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getStatusColor(status) }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Task Progress */}
      <div
        className="cursor-pointer hover:bg-secondary/30 rounded-lg p-2 -m-2 transition-colors"
        onClick={() => onTabChange('tasks')}
      >
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Task Progress
        </div>
        {totalTasks > 0 ? (
          <>
            <div className="td-progress-bar flex h-2 rounded-full overflow-hidden bg-secondary/20">
              {taskCounts.pending > 0 && (
                <div
                  style={{
                    backgroundColor: 'var(--muted-foreground)',
                    flex: `${taskCounts.pending} ${taskCounts.pending} 0%`,
                  }}
                />
              )}
              {taskCounts.inProgress > 0 && (
                <div
                  style={{
                    backgroundColor: 'var(--info)',
                    flex: `${taskCounts.inProgress} ${taskCounts.inProgress} 0%`,
                  }}
                />
              )}
              {taskCounts.completed > 0 && (
                <div
                  style={{
                    backgroundColor: 'var(--success)',
                    flex: `${taskCounts.completed} ${taskCounts.completed} 0%`,
                  }}
                />
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
              <span>{taskCounts.pending} pending</span>
              <span>{taskCounts.inProgress} in progress</span>
              <span>{taskCounts.completed} completed</span>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">No tasks yet</div>
        )}
      </div>

      {/* Section 3: Recent Messages */}
      <div
        className="cursor-pointer hover:bg-secondary/30 rounded-lg p-2 -m-2 transition-colors"
        onClick={() => onTabChange('messages')}
      >
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Recent Activity
        </div>
        {allMessages.length > 0 ? (
          <div className="space-y-0.5">
            {allMessages.map((msg, idx) => {
              const parsed = parseSystemMessage(msg.text);
              return (
                <div key={idx} className="flex items-center gap-2 text-xs py-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: msg.color || '#888' }}
                  />
                  <span className="font-medium text-foreground">{msg.from}</span>
                  {parsed ? (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      parsed.type === 'task_completed' ? 'bg-success/15 text-success' :
                      parsed.type === 'shutdown_approved' ? 'bg-destructive/15 text-destructive' :
                      parsed.type === 'shutdown_request' ? 'bg-warning/15 text-warning' :
                      'bg-muted-foreground/15 text-muted-foreground'
                    }`}>
                      {parsed.type === 'task_completed' ? 'TASK DONE' :
                       parsed.type === 'shutdown_approved' ? 'SHUTDOWN' :
                       parsed.type === 'shutdown_request' ? 'SHUTDOWN REQ' :
                       parsed.type.toUpperCase().replace('_', ' ')}
                    </span>
                  ) : (
                    <span className="text-muted-foreground truncate flex-1">
                      {truncateText(msg.text)}
                    </span>
                  )}
                  <span className="text-muted-foreground/60 text-[10px] flex-shrink-0">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No recent messages</div>
        )}
      </div>

      {/* Section 4: Bottleneck Alerts */}
      {analytics && analytics.bottleneckTaskIds.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Bottlenecks
          </div>
          {analytics.bottleneckTaskIds.map(taskId => {
            const task = visibleTasks.find(t => t.id === taskId);
            if (!task) return null;
            return (
              <div
                key={taskId}
                className="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 flex items-center gap-2"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                <span className="text-xs font-medium text-warning flex-1">
                  {task.subject}
                </span>
                {task.owner && (
                  <span className="text-[10px] text-muted-foreground">
                    {task.owner}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
