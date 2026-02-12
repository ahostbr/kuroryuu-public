/**
 * AssistantDashboard — heartbeat config controls + status cards
 */

import { useEffect } from 'react';
import {
    Heart, Play, Settings, Clock, CheckCircle, XCircle,
    Zap, Shield, BookOpen, Calendar,
} from 'lucide-react';
import { useIdentityStore } from '../../stores/identity-store';
import type { ActionType, ActionExecutionMode } from '../../types/identity';

const ACTION_TYPE_INFO: { type: ActionType; label: string; icon: typeof Zap; description: string }[] = [
    { type: 'create_task', label: 'Create Task', icon: Zap, description: 'Create new tasks in ai/todo.md' },
    { type: 'update_identity', label: 'Update Identity', icon: Shield, description: 'Modify identity files' },
    { type: 'memory_update', label: 'Memory Update', icon: BookOpen, description: 'Update long-term memories' },
    { type: 'scheduler_job', label: 'Scheduler Job', icon: Calendar, description: 'Create/modify scheduled jobs' },
];

const INTERVAL_OPTIONS = [5, 10, 15, 30, 60, 120, 360, 720, 1440];

function formatInterval(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${minutes / 60}h`;
    return `${minutes / 1440}d`;
}

export function AssistantDashboard() {
    const {
        heartbeatConfig,
        heartbeatStatus,
        profile,
        loadHeartbeatConfig,
        loadProfile,
        setHeartbeatEnabled,
        setHeartbeatInterval,
        setPerActionMode,
        runHeartbeatNow,
    } = useIdentityStore();

    useEffect(() => {
        loadHeartbeatConfig();
        if (!profile) loadProfile();
    }, [loadHeartbeatConfig, loadProfile, profile]);

    const config = heartbeatConfig;
    const status = heartbeatStatus;

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            {/* Status Overview */}
            <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2">
                        <Heart className={`w-4 h-4 ${config?.enabled ? 'text-green-400' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-medium text-muted-foreground">Heartbeat</span>
                    </div>
                    <span className={`text-lg font-bold ${config?.enabled ? 'text-green-400' : 'text-muted-foreground'}`}>
                        {config?.enabled ? 'Active' : 'Off'}
                    </span>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">Interval</span>
                    </div>
                    <span className="text-lg font-bold text-foreground">
                        {config ? formatInterval(config.intervalMinutes) : '--'}
                    </span>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2">
                        {status?.jobStatus === 'running'
                            ? <Play className="w-4 h-4 text-blue-400" />
                            : <CheckCircle className="w-4 h-4 text-muted-foreground" />
                        }
                        <span className="text-xs font-medium text-muted-foreground">Job Status</span>
                    </div>
                    <span className="text-lg font-bold text-foreground">
                        {status?.jobStatus ?? 'No job'}
                    </span>
                </div>
            </div>

            {/* Last/Next Run */}
            {status && (status.lastRun || status.nextRun) && (
                <div className="p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {status.lastRun && (
                            <span>Last run: {new Date(status.lastRun).toLocaleString()}</span>
                        )}
                        {status.nextRun && (
                            <span>Next run: {new Date(status.nextRun).toLocaleString()}</span>
                        )}
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="p-4 rounded-lg border border-border bg-card space-y-4">
                <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold">Heartbeat Configuration</h3>
                </div>

                {/* Enable/Disable */}
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-sm text-foreground">Enable Heartbeat</span>
                        <p className="text-[10px] text-muted-foreground">
                            Proactively check tasks, project health, and update identity
                        </p>
                    </div>
                    <button
                        onClick={() => setHeartbeatEnabled(!config?.enabled)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${
                            config?.enabled ? 'bg-primary' : 'bg-secondary'
                        }`}
                    >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            config?.enabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                    </button>
                </div>

                {/* Interval */}
                <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">Check Interval</span>
                    <select
                        value={config?.intervalMinutes ?? 30}
                        onChange={e => setHeartbeatInterval(Number(e.target.value))}
                        className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
                    >
                        {INTERVAL_OPTIONS.map(v => (
                            <option key={v} value={v}>{formatInterval(v)}</option>
                        ))}
                    </select>
                </div>

                {/* Run Now */}
                <button
                    onClick={runHeartbeatNow}
                    className="flex items-center gap-2 px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm w-full justify-center"
                >
                    <Play className="w-4 h-4" />
                    Run Heartbeat Now
                </button>
            </div>

            {/* Per-Action Mode */}
            <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold">Action Execution Modes</h3>
                </div>
                <p className="text-[10px] text-muted-foreground">
                    Control whether the heartbeat executes actions directly or proposes them first.
                </p>
                {ACTION_TYPE_INFO.map(info => {
                    const Icon = info.icon;
                    const currentMode = config?.perActionMode[info.type] ?? 'proposal_first';
                    return (
                        <div key={info.type} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-2">
                                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                                <div>
                                    <span className="text-xs text-foreground">{info.label}</span>
                                    <p className="text-[10px] text-muted-foreground">{info.description}</p>
                                </div>
                            </div>
                            <select
                                value={currentMode}
                                onChange={e => setPerActionMode(info.type, e.target.value as ActionExecutionMode)}
                                className="bg-secondary border border-border rounded px-2 py-1 text-[10px] text-foreground"
                            >
                                <option value="direct">Direct</option>
                                <option value="proposal_first">Propose First</option>
                            </select>
                        </div>
                    );
                })}
            </div>

            {/* Identity Files Summary */}
            {profile && (
                <div className="p-4 rounded-lg border border-border bg-card space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-primary" />
                        Identity Files
                    </h3>
                    {(['soul', 'user', 'memory', 'heartbeat'] as const).map(key => {
                        const file = profile[key];
                        const lines = file.content.split('\n').length;
                        return (
                            <div key={key} className="flex items-center justify-between text-xs py-1">
                                <span className="text-foreground font-mono">{key}.md</span>
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <span>{lines} lines</span>
                                    <span>{new Date(file.lastModified).toLocaleDateString()}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
