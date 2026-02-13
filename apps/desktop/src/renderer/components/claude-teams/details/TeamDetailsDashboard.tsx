/**
 * TeamDetailsDashboard - Tabbed dashboard replacing the old chevron-toggle Details section.
 * Shows stats ribbon + 4 tabs (Overview, Members, Tasks, Messages).
 * Works in both live team and archive replay contexts via props.
 */
import { useState, useMemo } from 'react';
import {
  Activity,
  Users,
  ListTodo,
  MessageSquare,
} from 'lucide-react';
import type {
  TeamConfig,
  TeamTask,
  InboxMessage,
  TeamAnalytics,
  TeammateHealthInfo,
} from '../../../types/claude-teams';
import { StatsRibbon } from './StatsRibbon';
import { OverviewTab } from './OverviewTab';
import { MembersTab } from './MembersTab';
import { TasksTab } from './TasksTab';
import { MessagesTab } from './MessagesTab';

type DashboardTab = 'overview' | 'members' | 'tasks' | 'messages';

interface TeamDetailsDashboardProps {
  mode: 'live' | 'archive';
  config: TeamConfig;
  tasks: TeamTask[];
  inboxes: Record<string, InboxMessage[]>;
  analytics: TeamAnalytics | null;
  teammateHealth: Record<string, TeammateHealthInfo>;
  onSelectTeammate?: (name: string) => void;
}

const TABS: { id: DashboardTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
];

export function TeamDetailsDashboard({
  mode,
  config,
  tasks,
  inboxes,
  analytics,
  teammateHealth,
  onSelectTeammate,
}: TeamDetailsDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  // Compute stats for the ribbon
  const visibleTasks = useMemo(
    () => tasks.filter(t => t.status !== 'deleted' && t.metadata?._internal !== true),
    [tasks]
  );
  const completedCount = visibleTasks.filter(t => t.status === 'completed').length;
  const completionPct = visibleTasks.length > 0
    ? (completedCount / visibleTasks.length) * 100
    : 0;
  const totalMessages = useMemo(
    () => Object.values(inboxes).reduce((sum, msgs) => sum + msgs.length, 0),
    [inboxes]
  );

  return (
    <div className="flex flex-col">
      {/* Stats Ribbon */}
      <div className="px-4 pt-3 pb-2">
        <StatsRibbon
          memberCount={config.members.length}
          taskCompleted={completedCount}
          taskTotal={visibleTasks.length}
          messageCount={totalMessages}
          completionPct={completionPct}
        />
      </div>

      {/* Tab Bar */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-0.5 bg-secondary/40 rounded-lg p-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="td-tab-content min-h-0" key={activeTab}>
        {activeTab === 'overview' && (
          <OverviewTab
            config={config}
            tasks={tasks}
            inboxes={inboxes}
            analytics={analytics}
            teammateHealth={teammateHealth}
            onTabChange={(tab) => setActiveTab(tab as DashboardTab)}
          />
        )}
        {activeTab === 'members' && (
          <MembersTab
            config={config}
            tasks={tasks}
            inboxes={inboxes}
            teammateHealth={teammateHealth}
            onSelectTeammate={onSelectTeammate}
          />
        )}
        {activeTab === 'tasks' && (
          <div className="px-4 pb-4">
            <TasksTab
              tasks={tasks}
              members={config.members}
              bottleneckTaskIds={analytics?.bottleneckTaskIds}
            />
          </div>
        )}
        {activeTab === 'messages' && (
          <div className="px-4 pb-4">
            <MessagesTab
              inboxes={inboxes}
              members={config.members.map(m => ({
                name: m.name,
                color: m.color,
                agentType: m.agentType,
              }))}
              mode={mode}
            />
          </div>
        )}
      </div>
    </div>
  );
}
