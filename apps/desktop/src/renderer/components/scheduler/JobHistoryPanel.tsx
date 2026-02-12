/**
 * Job History Panel
 * 
 * Slide-out panel showing execution history for a specific job.
 */

import React, { useEffect } from 'react';
import {
    X,
    History,
    CheckCircle2,
    XCircle,
    Clock,
    AlertCircle,
    Play,
    DollarSign,
    Copy,
} from 'lucide-react';
import { useSchedulerStore } from '../../stores/scheduler-store';
import type { JobRun, JobRunStatus } from '../../types/scheduler';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface JobHistoryPanelProps {
    jobId: string;
    onClose: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function getStatusIcon(status: JobRunStatus) {
    switch (status) {
        case 'completed':
            return <CheckCircle2 className="w-4 h-4 text-green-400" />;
        case 'failed':
            return <XCircle className="w-4 h-4 text-red-400" />;
        case 'running':
            return <Clock className="w-4 h-4 text-blue-400 animate-pulse" />;
        case 'cancelled':
            return <AlertCircle className="w-4 h-4 text-yellow-400" />;
        default:
            return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
}

function formatDuration(start: number, end?: number): string {
    if (!end) return 'Running...';
    const diff = end - start;

    if (diff < 1000) return `${diff}ms`;
    if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
    return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Run Item Component
// ═══════════════════════════════════════════════════════════════════════════════

function RunItem({ run }: { run: JobRun }) {
    const [expanded, setExpanded] = React.useState(false);
    const [showFullOutput, setShowFullOutput] = React.useState(false);

    const costUsd = run.costUsd;
    const sessionId = run.sessionId;
    const usage = run.usage;

    const copySessionId = () => {
        if (sessionId) {
            navigator.clipboard.writeText(sessionId);
        }
    };

    return (
        <div className="border border-border rounded-lg overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors"
            >
                {getStatusIcon(run.status)}

                <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                            {new Date(run.startedAt).toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                            ({run.triggeredBy})
                        </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                        Duration: {formatDuration(run.startedAt, run.completedAt)}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {costUsd != null && costUsd > 0 && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px]">
                            <DollarSign className="w-3 h-3" />
                            {costUsd.toFixed(4)}
                        </span>
                    )}
                    <span
                        className={`px-2 py-0.5 rounded text-xs capitalize ${run.status === 'completed'
                                ? 'bg-green-500/20 text-green-400'
                                : run.status === 'failed'
                                    ? 'bg-red-500/20 text-red-400'
                                    : run.status === 'running'
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : 'bg-yellow-500/20 text-yellow-400'
                            }`}
                    >
                        {run.status}
                    </span>
                </div>
            </button>

            {expanded && (
                <div className="px-4 pb-3 pt-1 border-t border-border/50 space-y-2">
                    {/* SDK metadata */}
                    {(sessionId || usage) && (
                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                            {sessionId && (
                                <button
                                    onClick={copySessionId}
                                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                                    title="Copy session ID"
                                >
                                    <Copy className="w-3 h-3" />
                                    Session: {sessionId.slice(0, 8)}...
                                </button>
                            )}
                            {usage && (
                                <span>
                                    Tokens: {usage.inputTokens.toLocaleString()} in / {usage.outputTokens.toLocaleString()} out
                                </span>
                            )}
                        </div>
                    )}

                    {run.output && (
                        <div>
                            <span className="text-xs text-muted-foreground">Output:</span>
                            <pre className={`mt-1 p-2 rounded bg-background text-xs text-foreground overflow-x-auto font-mono ${showFullOutput ? '' : 'max-h-40'}`}>
                                {showFullOutput ? run.output : run.output.slice(0, 500)}
                                {!showFullOutput && run.output.length > 500 && '...'}
                            </pre>
                            {run.output.length > 500 && (
                                <button
                                    onClick={() => setShowFullOutput(!showFullOutput)}
                                    className="text-[10px] text-primary hover:underline mt-1"
                                >
                                    {showFullOutput ? 'Show less' : 'Show more'}
                                </button>
                            )}
                        </div>
                    )}
                    {run.error && (
                        <div>
                            <span className="text-xs text-red-400">Error:</span>
                            <pre className="mt-1 p-2 rounded bg-red-500/10 text-xs text-red-300 overflow-x-auto font-mono">
                                {run.error}
                            </pre>
                        </div>
                    )}
                    {!run.output && !run.error && (
                        <p className="text-xs text-muted-foreground italic">No output captured</p>
                    )}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export function JobHistoryPanel({ jobId, onClose }: JobHistoryPanelProps) {
    const { jobs, history, loadHistory } = useSchedulerStore();
    const job = jobs.find((j) => j.id === jobId);
    const jobHistory = history.filter((h) => h.jobId === jobId);

    useEffect(() => {
        loadHistory({ jobId, limit: 50 });
    }, [jobId, loadHistory]);

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative w-full max-w-md bg-card border-l border-border shadow-xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <History className="w-5 h-5 text-primary" />
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">
                                Run History
                            </h2>
                            {job && (
                                <p className="text-sm text-muted-foreground">{job.name}</p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {jobHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
                            <Play className="w-12 h-12 text-muted-foreground/30 mb-4" />
                            <p className="text-muted-foreground">No runs yet</p>
                            <p className="text-sm text-muted-foreground/70">
                                Execution history will appear here
                            </p>
                        </div>
                    ) : (
                        jobHistory.map((run) => <RunItem key={run.id} run={run} />)
                    )}
                </div>

                {/* Footer Stats */}
                {jobHistory.length > 0 && (
                    <div className="px-6 py-3 border-t border-border bg-secondary/30">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                                {jobHistory.filter((r) => r.status === 'completed').length} successful
                            </span>
                            <span>
                                {jobHistory.filter((r) => r.status === 'failed').length} failed
                            </span>
                            <span>{jobHistory.length} total runs</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default JobHistoryPanel;
