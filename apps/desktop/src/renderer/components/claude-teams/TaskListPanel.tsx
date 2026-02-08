/**
 * TaskListPanel - Kanban-style task board with Pending / In Progress / Completed columns.
 * Filters out internal tasks and displays TaskCards organized by status.
 */
import { useState, useMemo } from 'react';
import {
  ListTodo,
  Circle,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { useClaudeTeamsStore } from '../../stores/claude-teams-store';
import type { TeamTask, TeamMember, TeamTaskStatus } from '../../types/claude-teams';
import { TaskCard } from './TaskCard';

const COLUMNS: {
  key: TeamTaskStatus;
  label: string;
  icon: typeof Circle;
  headerColor: string;
  countBg: string;
}[] = [
  {
    key: 'pending',
    label: 'Pending',
    icon: Circle,
    headerColor: 'text-gray-400',
    countBg: 'bg-gray-600/40 text-gray-300',
  },
  {
    key: 'in_progress',
    label: 'In Progress',
    icon: Loader2,
    headerColor: 'text-blue-400',
    countBg: 'bg-blue-600/40 text-blue-300',
  },
  {
    key: 'completed',
    label: 'Completed',
    icon: CheckCircle2,
    headerColor: 'text-green-400',
    countBg: 'bg-green-600/40 text-green-300',
  },
];

export function TaskListPanel() {
  const selectedTeamTasks = useClaudeTeamsStore((s) => s.selectedTeamTasks);
  const selectedTeam = useClaudeTeamsStore((s) => s.selectedTeam);
  const teamAnalytics = useClaudeTeamsStore((s) => s.teamAnalytics);
  const [collapsed, setCollapsed] = useState(false);

  const members: TeamMember[] = selectedTeam?.config.members ?? [];

  // Filter out internal tasks (teammate tracker)
  const visibleTasks = useMemo(
    () => selectedTeamTasks.filter((t) => t.metadata?._internal !== true),
    [selectedTeamTasks]
  );

  // Group by status
  const grouped = useMemo(() => {
    const map: Record<TeamTaskStatus, TeamTask[]> = {
      pending: [],
      in_progress: [],
      completed: [],
      deleted: [],
    };
    for (const task of visibleTasks) {
      map[task.status]?.push(task);
    }
    return map;
  }, [visibleTasks]);

  const totalCount = visibleTasks.length;
  const completedCount = grouped.completed.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col border border-white/10 rounded-lg bg-black/20 overflow-hidden">
      {/* Header */}
      <button
        className="flex items-center justify-between px-4 py-2.5 bg-white/5 hover:bg-white/[0.08] transition-colors w-full text-left"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <div className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-200">Tasks</span>
          {totalCount > 0 && (
            <span className="text-xs text-gray-500">
              {completedCount}/{totalCount} ({pct}%)
            </span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="p-3">
          {totalCount === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500">
              No tasks yet
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {COLUMNS.map((col) => {
                const Icon = col.icon;
                const tasks = grouped[col.key] ?? [];
                return (
                  <div key={col.key} className="flex flex-col min-w-0">
                    {/* Column header */}
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <Icon
                        className={`w-3.5 h-3.5 ${col.headerColor} ${col.key === 'in_progress' ? 'animate-spin' : ''}`}
                      />
                      <span className={`text-xs font-medium ${col.headerColor}`}>
                        {col.label}
                      </span>
                      <span
                        className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${col.countBg}`}
                      >
                        {tasks.length}
                      </span>
                    </div>

                    {/* Task cards */}
                    <div className="flex flex-col gap-2 overflow-y-auto max-h-[400px] pr-1">
                      {tasks.length === 0 ? (
                        <div className="text-xs text-gray-600 text-center py-4 border border-dashed border-white/10 rounded-lg">
                          None
                        </div>
                      ) : (
                        tasks.map((task) => {
                          const isBottleneck = teamAnalytics?.bottleneckTaskIds?.includes(task.id) ?? false;
                          return (
                            <div key={task.id}>
                              <div className={isBottleneck ? 'border-l-2 border-amber-500 rounded-lg' : ''}>
                                <TaskCard task={task} members={members} />
                              </div>
                              {isBottleneck && (
                                <div className="flex items-center gap-1 mt-1 ml-1 text-[10px] text-amber-500">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Bottleneck</span>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
