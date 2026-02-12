/**
 * ActivityView — unified timeline of mutations, actions, and heartbeat runs
 */

import { useEffect } from 'react';
import { Clock, Filter } from 'lucide-react';
import { useIdentityStore } from '../../stores/identity-store';
import { ActionCard } from './ActionCard';
import { HeartbeatCard } from './HeartbeatCard';
import type { ActivityEntry } from '../../types/identity';

const TIME_WINDOWS = [
    { value: '24h' as const, label: '24h' },
    { value: '7d' as const, label: '7 days' },
    { value: '30d' as const, label: '30 days' },
];

function MutationEntry({ entry }: { entry: ActivityEntry & { entryType: 'mutation' } }) {
    const m = entry.data;
    return (
        <div className="p-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors">
            <div className="flex items-start gap-3">
                <div className="p-1.5 rounded bg-purple-500/20">
                    <Filter className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground">
                            {m.file}.md updated
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[10px]">
                            mutation
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-secondary text-[10px] text-muted-foreground">
                            {m.source}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                        {m.section}: {m.change}
                    </p>
                    {m.reason && (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5 italic">
                            {m.reason}
                        </p>
                    )}
                    <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                        {new Date(m.timestamp).toLocaleString()}
                    </span>
                </div>
            </div>
        </div>
    );
}

export function ActivityView() {
    const {
        activity,
        activityTimeWindow,
        loadActivity,
        setActivityTimeWindow,
    } = useIdentityStore();

    useEffect(() => {
        loadActivity();
    }, [loadActivity]);

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold">Activity Timeline</h2>
                    <span className="text-xs text-muted-foreground">
                        ({activity.length} entries)
                    </span>
                </div>
                <div className="flex items-center gap-1 bg-secondary/50 rounded-md p-0.5">
                    {TIME_WINDOWS.map(tw => (
                        <button
                            key={tw.value}
                            onClick={() => setActivityTimeWindow(tw.value)}
                            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                activityTimeWindow === tw.value
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {tw.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {activity.length === 0 ? (
                    <div className="text-center py-12">
                        <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">No activity yet</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                            Enable the heartbeat or edit identity files to see activity here
                        </p>
                    </div>
                ) : (
                    activity.map((entry, i) => {
                        switch (entry.entryType) {
                            case 'action':
                                return <ActionCard key={`a-${i}`} action={entry.data} />;
                            case 'heartbeat':
                                return <HeartbeatCard key={`h-${i}`} run={entry.data} />;
                            case 'mutation':
                                return <MutationEntry key={`m-${i}`} entry={entry} />;
                            default:
                                return null;
                        }
                    })
                )}
            </div>
        </div>
    );
}
