import React from 'react';
import { Circle, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { TeamTask, TeamMember } from '../../../types/claude-teams';
import { TaskCard } from '../TaskCard';

interface TasksTabProps {
  tasks: TeamTask[];
  members: TeamMember[];
  bottleneckTaskIds?: string[];
}

const COLUMNS = [
  { key: 'pending', label: 'Pending', icon: Circle, color: 'text-muted-foreground', countBg: 'bg-muted-foreground/20 text-muted-foreground' },
  { key: 'in_progress', label: 'In Progress', icon: Loader2, color: 'text-info', countBg: 'bg-info/20 text-info' },
  { key: 'completed', label: 'Completed', icon: CheckCircle2, color: 'text-success', countBg: 'bg-success/20 text-success' },
] as const;

export const TasksTab: React.FC<TasksTabProps> = ({ tasks, members, bottleneckTaskIds }) => {
  const filteredTasks = tasks.filter(
    t => t.status !== 'deleted' && t.metadata?._internal !== true
  );

  const tasksByStatus = {
    pending: filteredTasks.filter(t => t.status === 'pending'),
    in_progress: filteredTasks.filter(t => t.status === 'in_progress'),
    completed: filteredTasks.filter(t => t.status === 'completed'),
  };

  const totalTasks = filteredTasks.length;
  const pendingCount = tasksByStatus.pending.length;
  const inProgressCount = tasksByStatus.in_progress.length;
  const completedCount = tasksByStatus.completed.length;

  const pendingPercentage = totalTasks > 0 ? (pendingCount / totalTasks) * 100 : 0;
  const inProgressPercentage = totalTasks > 0 ? (inProgressCount / totalTasks) * 100 : 0;
  const completedPercentage = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;

  return (
    <div className="max-h-[500px] overflow-y-auto">
      {/* Progress bar */}
      <div className="td-progress-bar mb-2">
        <div
          className="td-progress-bar__segment"
          style={{ flexBasis: `${pendingPercentage}%`, backgroundColor: 'var(--muted-foreground)' }}
        />
        <div
          className="td-progress-bar__segment"
          style={{ flexBasis: `${inProgressPercentage}%`, backgroundColor: 'var(--info)' }}
        />
        <div
          className="td-progress-bar__segment"
          style={{ flexBasis: `${completedPercentage}%`, backgroundColor: 'var(--success)' }}
        />
      </div>

      {/* Progress stats */}
      <div className="flex items-center gap-4 mt-1.5 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          <span>{pendingCount} pending</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-info" />
          <span>{inProgressCount} in progress</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-success" />
          <span>{completedCount} completed</span>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-3 gap-3 mt-3">
        {COLUMNS.map(column => {
          const Icon = column.icon;
          const columnTasks = tasksByStatus[column.key];
          const count = columnTasks.length;

          return (
            <div key={column.key}>
              {/* Column header */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <Icon
                  className={`w-3.5 h-3.5 ${column.color} ${column.key === 'in_progress' ? 'animate-spin' : ''}`}
                />
                <span className="text-xs font-medium">{column.label}</span>
                <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${column.countBg}`}>
                  {count}
                </span>
              </div>

              {/* Cards area */}
              <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
                {count === 0 ? (
                  <div className="text-xs text-muted-foreground/50 text-center py-4 border border-dashed border-border/30 rounded-lg">
                    None
                  </div>
                ) : (
                  columnTasks.map(task => {
                    const isBottleneck = bottleneckTaskIds?.includes(task.id);

                    return (
                      <div key={task.id}>
                        {isBottleneck ? (
                          <div className="border-l-2 border-warning rounded-lg">
                            <TaskCard task={task} members={members} />
                            <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-warning">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Bottleneck</span>
                            </div>
                          </div>
                        ) : (
                          <TaskCard task={task} members={members} />
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
    </div>
  );
};
