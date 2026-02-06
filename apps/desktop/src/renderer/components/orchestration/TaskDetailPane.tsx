/**
 * TaskDetailPane - Center panel showing selected task details
 * Progress visualization, subtask list, error display
 */

import { Clock, User, CheckCircle2, Circle, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import { DragonBackdrop } from '../shared/DragonBackdrop';
import { OrchestrationTask, Subtask, statusColors } from './types';

interface TaskDetailPaneProps {
  task: OrchestrationTask | null;
}

function StatusBadge({ status }: { status: string }) {
  const colors = statusColors[status] || statusColors.pending;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function SubtaskIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    case 'in_progress':
      return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
    case 'claimed':
      return <User className="w-4 h-4 text-blue-400" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-400" />;
    default:
      return <Circle className="w-4 h-4 text-muted-foreground" />;
  }
}

export function TaskDetailPane({ task }: TaskDetailPaneProps) {
  if (!task) {
    return (
      <DragonBackdrop subtitle="Select a task">
        <p className="text-sm text-muted-foreground">Select a task to view details</p>
      </DragonBackdrop>
    );
  }

  const subtasks = task.subtasks || [];
  const completedCount = subtasks.filter(s => s.status === 'completed').length;
  const progressPercent = subtasks.length > 0
    ? Math.round((completedCount / subtasks.length) * 100)
    : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Task header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">
              {task.title || task.description.slice(0, 60)}
            </h2>
            {task.title && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}
          </div>
          <StatusBadge status={task.status} />
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {new Date(task.created_at).toLocaleString()}
          </span>
          {task.submitted_by && (
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {task.submitted_by}
            </span>
          )}
        </div>

        {/* Progress bar (segmented) */}
        {subtasks.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-foreground font-medium">{progressPercent}%</span>
            </div>
            <div className="flex gap-0.5 h-2 rounded overflow-hidden bg-muted/30">
              {subtasks.map((st, i) => (
                <div
                  key={st.id || i}
                  className={`flex-1 transition-all duration-300 ${
                    st.status === 'completed' ? 'bg-green-500' :
                    st.status === 'in_progress' ? 'bg-yellow-500 animate-pulse' :
                    st.status === 'claimed' ? 'bg-blue-500/50' :
                    st.status === 'failed' ? 'bg-red-500' :
                    'bg-muted/50'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {task.error && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">Task Failed</p>
              <p className="text-xs text-red-400/80 mt-1">{task.error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Subtasks list */}
      <div className="flex-1 overflow-auto p-4">
        {subtasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No subtasks yet</p>
            <p className="text-xs mt-1">Break down the task to create subtasks</p>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Subtasks ({completedCount}/{subtasks.length})
            </div>
            {subtasks.map((subtask, idx) => (
              <SubtaskRow key={subtask.id || idx} subtask={subtask} index={idx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SubtaskRowProps {
  subtask: Subtask;
  index: number;
}

function SubtaskRow({ subtask, index }: SubtaskRowProps) {
  return (
    <div
      className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${
        subtask.status === 'in_progress' ? 'bg-yellow-500/5' :
        subtask.status === 'completed' ? 'bg-green-500/5' :
        subtask.status === 'failed' ? 'bg-red-500/5' :
        'hover:bg-muted/30'
      }`}
    >
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-muted-foreground w-4 text-right">{index + 1}</span>
        <SubtaskIcon status={subtask.status} />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm ${
          subtask.status === 'completed' ? 'text-muted-foreground line-through' :
          subtask.status === 'failed' ? 'text-red-400' :
          'text-foreground'
        }`}>
          {subtask.description}
        </p>
        {subtask.assigned_to && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <User className="w-3 h-3" />
            {subtask.assigned_to}
          </p>
        )}
      </div>

      <StatusBadge status={subtask.status} />
    </div>
  );
}
