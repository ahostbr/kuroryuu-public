/**
 * HeartbeatCard — displays a single heartbeat run entry
 */

import { Heart, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { HeartbeatRun } from '../../types/identity';

const STATUS_CONFIG = {
    running: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/20', animate: 'animate-spin' },
    completed: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20', animate: '' },
    failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20', animate: '' },
};

interface HeartbeatCardProps {
    run: HeartbeatRun;
}

export function HeartbeatCard({ run }: HeartbeatCardProps) {
    const cfg = STATUS_CONFIG[run.status];
    const StatusIcon = cfg.icon;
    const duration = run.completedAt
        ? Math.round((run.completedAt - run.startedAt) / 1000)
        : null;

    return (
        <div className="p-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors">
            <div className="flex items-start gap-3">
                <div className={`p-1.5 rounded ${cfg.bg}`}>
                    <Heart className={`w-3.5 h-3.5 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground">
                            Heartbeat Run
                        </span>
                        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${cfg.bg} ${cfg.color}`}>
                            <StatusIcon className={`w-2.5 h-2.5 ${cfg.animate}`} />
                            {run.status}
                        </span>
                        {run.actionsGenerated > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px]">
                                {run.actionsGenerated} action{run.actionsGenerated !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
                        <span>{new Date(run.startedAt).toLocaleString()}</span>
                        {duration !== null && <span>{duration}s</span>}
                    </div>
                    {run.error && (
                        <p className="text-xs text-red-400 mt-1 line-clamp-1">
                            {run.error}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
