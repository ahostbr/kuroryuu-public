/**
 * TaskQueue - Left sidebar showing pending and completed tasks
 * Slim rows, expand on click, contextual actions on hover
 */

import { ChevronRight, X, Zap, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { OrchestrationTask, statusColors } from './types';

interface TaskQueueProps {
  tasks: OrchestrationTask[];
  selectedTaskId: string | null;
  onSelectTask: (task: OrchestrationTask) => void;
  onBreakdown: (taskId: string) => void;
  onCancel: (taskId: string) => void;
}

function StatusDot({ status }: { status: string }) {
  const colors = statusColors[status] || statusColors.pending;
  return (
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
  );
}

export function TaskQueue({
  tasks,
  selectedTaskId,
  onSelectTask,
  onBreakdown,
  onCancel,
}: TaskQueueProps) {
  const pendingTasks = tasks.filter(t =>
    !['completed', 'failed', 'cancelled'].includes(t.status)
  );
  const completedTasks = tasks.filter(t =>
    ['completed', 'failed', 'cancelled'].includes(t.status)
  );

  return (
    <div className="h-full flex flex-col bg-card/30 border-r border-border">
      {/* Pending Section */}
      <div className="flex-1 overflow-auto">
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50">
          Queue ({pendingTasks.length})
        </div>

        {pendingTasks.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No pending tasks
          </div>
        ) : (
          <div className="py-1">
            {pendingTasks.map((task) => (
              <TaskRow
                key={task.task_id}
                task={task}
                isSelected={selectedTaskId === task.task_id}
                onSelect={() => onSelectTask(task)}
                onBreakdown={() => onBreakdown(task.task_id)}
                onCancel={() => onCancel(task.task_id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Completed Section */}
      {completedTasks.length > 0 && (
        <div className="border-t border-border/50 max-h-[30%] overflow-auto">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50 sticky top-0 bg-card/50 backdrop-blur-sm">
            Done ({completedTasks.length})
          </div>
          <div className="py-1">
            {completedTasks.slice(0, 10).map((task) => (
              <TaskRow
                key={task.task_id}
                task={task}
                isSelected={selectedTaskId === task.task_id}
                onSelect={() => onSelectTask(task)}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TaskRowProps {
  task: OrchestrationTask;
  isSelected: boolean;
  onSelect: () => void;
  onBreakdown?: () => void;
  onCancel?: () => void;
  compact?: boolean;
}

function TaskRow({
  task,
  isSelected,
  onSelect,
  onBreakdown,
  onCancel,
  compact = false,
}: TaskRowProps) {
  const title = task.title || task.description.slice(0, 40);
  const subtaskCount = task.subtasks?.length || 0;
  const completedSubtasks = task.subtasks?.filter(s => s.status === 'completed').length || 0;

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-primary/10 border-l-2 border-primary'
          : 'hover:bg-muted/50 border-l-2 border-transparent'
      }`}
      onClick={onSelect}
    >
      {/* Status indicator */}
      <StatusDot status={task.status} />

      {/* Task info */}
      <div className="flex-1 min-w-0">
        <div className={`truncate ${compact ? 'text-xs' : 'text-sm'} ${
          task.status === 'completed' ? 'text-muted-foreground line-through' :
          task.status === 'failed' ? 'text-red-400' :
          'text-foreground'
        }`}>
          {title}
        </div>
        {!compact && subtaskCount > 0 && (
          <div className="text-xs text-muted-foreground">
            {completedSubtasks}/{subtaskCount} subtasks
          </div>
        )}
      </div>

      {/* Actions (show on hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.status === 'pending' && onBreakdown && (
          <button
            onClick={(e) => { e.stopPropagation(); onBreakdown(); }}
            className="p-1 rounded hover:bg-primary/20 text-primary"
            title="Break down task"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
        )}
        {!['completed', 'failed', 'cancelled'].includes(task.status) && onCancel && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
            title="Cancel task"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <ChevronRight className="w-4 h-4 text-primary flex-shrink-0" />
      )}
    </div>
  );
}
