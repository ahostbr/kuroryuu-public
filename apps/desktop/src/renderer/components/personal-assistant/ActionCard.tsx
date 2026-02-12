/**
 * ActionCard — displays a single action record with status badge and details
 */

import { CheckCircle, XCircle, SkipForward, ListTodo, Brain, BookOpen, Calendar } from 'lucide-react';
import type { ActionRecord, ActionType } from '../../types/identity';

const ACTION_ICONS: Record<ActionType, typeof ListTodo> = {
    create_task: ListTodo,
    update_identity: Brain,
    memory_update: BookOpen,
    scheduler_job: Calendar,
};

const ACTION_LABELS: Record<ActionType, string> = {
    create_task: 'Task',
    update_identity: 'Identity',
    memory_update: 'Memory',
    scheduler_job: 'Scheduler',
};

const STATUS_CONFIG = {
    executed: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' },
    failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' },
    skipped: { icon: SkipForward, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
};

interface ActionCardProps {
    action: ActionRecord;
}

export function ActionCard({ action }: ActionCardProps) {
    const ActionIcon = ACTION_ICONS[action.type] || Brain;
    const statusCfg = STATUS_CONFIG[action.status];
    const StatusIcon = statusCfg.icon;

    return (
        <div className="p-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors">
            <div className="flex items-start gap-3">
                <div className={`p-1.5 rounded ${statusCfg.bg}`}>
                    <ActionIcon className={`w-3.5 h-3.5 ${statusCfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground truncate">
                            {action.title}
                        </span>
                        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${statusCfg.bg} ${statusCfg.color}`}>
                            <StatusIcon className="w-2.5 h-2.5" />
                            {action.status}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-secondary text-[10px] text-muted-foreground">
                            {ACTION_LABELS[action.type]}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                        {action.summary}
                    </p>
                    {action.error && (
                        <p className="text-xs text-red-400 mt-1 line-clamp-1">
                            {action.error}
                        </p>
                    )}
                    <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                        {new Date(action.createdAt).toLocaleString()}
                    </span>
                </div>
            </div>
        </div>
    );
}
