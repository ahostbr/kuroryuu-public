/**
 * TaskCard - Individual task card for the kanban board.
 * Shows task details, status, owner, dependencies, and expandable description.
 */
import { useState, useMemo } from 'react';
import {
  Hash,
  User,
  CheckCircle,
  AlertTriangle,
  GitBranch,
  Loader2,
} from 'lucide-react';
import type { TeamTask, TeamMember, TeamTaskStatus } from '../../types/claude-teams';

interface TaskCardProps {
  task: TeamTask;
  members: TeamMember[];
}

const STATUS_COLORS: Record<TeamTaskStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-gray-600/30', text: 'text-gray-400', label: 'Pending' },
  in_progress: { bg: 'bg-blue-600/30', text: 'text-blue-400', label: 'In Progress' },
  completed: { bg: 'bg-green-600/30', text: 'text-green-400', label: 'Completed' },
  deleted: { bg: 'bg-red-600/30', text: 'text-red-400', label: 'Deleted' },
};

export function TaskCard({ task, members }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusStyle = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending;

  const assignee = useMemo(() => {
    if (!task.owner) return null;
    return members.find((m) => m.name === task.owner) ?? null;
  }, [task.owner, members]);

  return (
    <div
      className="rounded-lg border border-white/10 bg-white/5 p-3 hover:bg-white/[0.08] transition-colors cursor-pointer"
      onClick={() => setExpanded((prev) => !prev)}
    >
      {/* Top row: ID badge + status pill */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 font-mono">
          <Hash className="w-3 h-3" />
          {task.id}
        </span>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}
        >
          {task.status === 'completed' && <CheckCircle className="w-3 h-3" />}
          {task.status === 'in_progress' && <Loader2 className="w-3 h-3 animate-spin" />}
          {statusStyle.label}
        </span>
      </div>

      {/* Subject */}
      <p
        className="text-sm font-semibold text-gray-200 truncate"
        title={task.subject}
      >
        {task.subject}
      </p>

      {/* Description (clamp or full) */}
      {task.description && (
        <p
          className={`mt-1 text-xs text-gray-400 ${expanded ? '' : 'line-clamp-2'}`}
        >
          {task.description}
        </p>
      )}

      {/* Active form spinner */}
      {task.activeForm && task.status === 'in_progress' && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-400">
          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
          <span className="truncate">{task.activeForm}</span>
        </div>
      )}

      {/* Owner / Assignee */}
      <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
        <User className="w-3 h-3 flex-shrink-0" />
        {assignee ? (
          <span className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: assignee.color ?? '#6b7280' }}
            />
            <span className="text-gray-300">{assignee.name}</span>
          </span>
        ) : (
          <span className="italic">Unassigned</span>
        )}
      </div>

      {/* Dependencies */}
      {task.blockedBy.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>
            Blocked by{' '}
            {task.blockedBy.map((id) => `#${id}`).join(', ')}
          </span>
        </div>
      )}
      {task.blocks.length > 0 && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
          <GitBranch className="w-3 h-3 flex-shrink-0" />
          <span>
            Blocks{' '}
            {task.blocks.map((id) => `#${id}`).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}
