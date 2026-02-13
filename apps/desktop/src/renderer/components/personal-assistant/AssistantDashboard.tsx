/**
 * AssistantDashboard — heartbeat config controls + status cards
 */

import { useEffect, useState } from 'react';
import {
    Heart, Play, Settings, Clock, CheckCircle,
    Zap, Shield, BookOpen, Calendar, Bell, Github, RefreshCw, RotateCcw,
    User, Sliders,
} from 'lucide-react';
import { useIdentityStore } from '../../stores/identity-store';
import { BootstrapWelcome } from './BootstrapWelcome';
import type { ActionType, ActionExecutionMode, HeartbeatNotificationMode } from '../../types/identity';

const ACTION_TYPE_INFO: { type: ActionType; label: string; icon: typeof Zap; description: string }[] = [
    { type: 'create_task', label: 'Create Task', icon: Zap, description: 'Create new tasks in ai/todo.md' },
    { type: 'update_identity', label: 'Update Identity', icon: Shield, description: 'Modify identity files' },
    { type: 'memory_update', label: 'Memory Update', icon: BookOpen, description: 'Update long-term memories' },
    { type: 'scheduler_job', label: 'Scheduler Job', icon: Calendar, description: 'Create/modify scheduled jobs' },
];

const INTERVAL_OPTIONS = [5, 10, 15, 30, 60, 120, 360, 720, 1440];
const MAX_LINES_OPTIONS = [10, 25, 50, 75, 100, 150, 200, 500];
const MAX_TURNS_OPTIONS = [1, 3, 5, 10, 15, 20, 30, 50];
const TIMEOUT_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 30];

const NOTIFICATION_MODES: { value: HeartbeatNotificationMode; label: string; description: string }[] = [
    { value: 'toast', label: 'Toast', description: 'In-app toast notification' },
    { value: 'none', label: 'None', description: 'Silent — no notification' },
    { value: 'os', label: 'OS', description: 'System notification' },
    { value: 'tts', label: 'TTS', description: 'Text-to-speech announcement' },
];

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
        bootstrapStatus,
        memorySyncStatus,
        loadHeartbeatConfig,
        loadProfile,
        checkBootstrap,
        resetBootstrap,
        setHeartbeatEnabled,
        setHeartbeatInterval,
        setNotificationMode,
        setPerActionMode,
        setAgentName,
        setMaxLinesPerFile,
        setMaxTurns,
        setTimeoutMinutes,
        setExecutionBackend,
        setExecutionRendering,
        runHeartbeatNow,
        syncClaudeMemory,
        loadMemorySyncStatus,
    } = useIdentityStore();

    const [nameInput, setNameInput] = useState('');

    useEffect(() => {
        checkBootstrap();
        loadHeartbeatConfig();
        loadMemorySyncStatus();
        if (!profile) loadProfile();
    }, [checkBootstrap, loadHeartbeatConfig, loadMemorySyncStatus, loadProfile, profile]);

    // Sync name input with loaded config
    useEffect(() => {
        if (heartbeatConfig?.agentName && !nameInput) {
            setNameInput(heartbeatConfig.agentName);
        }
    }, [heartbeatConfig?.agentName, nameInput]);

    // Show bootstrap welcome if not yet bootstrapped
    if (bootstrapStatus && !bootstrapStatus.bootstrapped) {
        return <BootstrapWelcome />;
    }

    const config = heartbeatConfig;
    const status = heartbeatStatus;

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            {/* Status Overview */}
            <div className="grid grid-cols-4 gap-3">
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
                <div className="p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2">
                        <Github className={`w-4 h-4 ${status?.ghAvailable ? 'text-green-400' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-medium text-muted-foreground">GitHub CLI</span>
                    </div>
                    <span className={`text-lg font-bold ${status?.ghAvailable ? 'text-green-400' : 'text-yellow-400'}`}>
                        {status?.ghAvailable ? 'Ready' : 'N/A'}
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

            {/* Agent Identity */}
            <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold">Agent Identity</h3>
                </div>
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-sm text-foreground">Agent Name</span>
                        <p className="text-[10px] text-muted-foreground">
                            Name used in heartbeat prompt. Set after First Book.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={nameInput}
                            onChange={e => setNameInput(e.target.value)}
                            onBlur={() => {
                                if (nameInput !== (config?.agentName ?? 'Kuroryuu')) {
                                    setAgentName(nameInput);
                                }
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    setAgentName(nameInput);
                                    (e.target as HTMLInputElement).blur();
                                }
                            }}
                            placeholder="Kuroryuu"
                            className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground w-40"
                        />
                    </div>
                </div>
            </div>

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

                {/* Notification Mode */}
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-sm text-foreground flex items-center gap-1.5">
                            <Bell className="w-3.5 h-3.5" />
                            Notification Mode
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                            How to notify when heartbeat completes with actions
                        </p>
                    </div>
                    <select
                        value={config?.notificationMode ?? 'toast'}
                        onChange={e => setNotificationMode(e.target.value as HeartbeatNotificationMode)}
                        className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
                    >
                        {NOTIFICATION_MODES.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
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

            {/* Advanced Settings */}
            <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold">Advanced Settings</h3>
                </div>
                <p className="text-[10px] text-muted-foreground">
                    Fine-tune heartbeat prompt construction and execution limits.
                </p>

                {/* Execution Backend */}
                <div className="flex items-center justify-between py-1">
                    <div>
                        <span className="text-xs text-foreground">Execution Backend</span>
                        <p className="text-[10px] text-muted-foreground">CLI uses OAuth login (free with Max). SDK needs API key.</p>
                    </div>
                    <div className="flex items-center gap-1 bg-secondary/50 rounded p-0.5">
                        <button
                            onClick={() => setExecutionBackend('cli')}
                            className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                                (config?.executionBackend ?? 'cli') === 'cli'
                                    ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            CLI
                        </button>
                        <button
                            onClick={() => setExecutionBackend('sdk')}
                            className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                                config?.executionBackend === 'sdk'
                                    ? 'bg-violet-500/20 text-violet-400 shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            SDK
                        </button>
                    </div>
                </div>

                {/* Execution Rendering (CLI only) */}
                {(config?.executionBackend ?? 'cli') === 'cli' && (
                <div className="flex items-center justify-between py-1">
                    <div>
                        <span className="text-xs text-foreground">Output Mode</span>
                        <p className="text-[10px] text-muted-foreground">Terminal shows real xterm.js. Structured shows parsed messages.</p>
                    </div>
                    <div className="flex items-center gap-1 bg-secondary/50 rounded p-0.5">
                        <button
                            onClick={() => setExecutionRendering('pty')}
                            className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                                (config?.executionRendering ?? 'pty') === 'pty'
                                    ? 'bg-amber-500/20 text-amber-400 shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Terminal
                        </button>
                        <button
                            onClick={() => setExecutionRendering('jsonl')}
                            className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                                config?.executionRendering === 'jsonl'
                                    ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Structured
                        </button>
                    </div>
                </div>
                )}

                {/* Max Lines Per File */}
                <div className="flex items-center justify-between py-1">
                    <div>
                        <span className="text-xs text-foreground">Max Lines Per File</span>
                        <p className="text-[10px] text-muted-foreground">Identity file truncation limit in prompt</p>
                    </div>
                    <select
                        value={config?.maxLinesPerFile ?? 50}
                        onChange={e => setMaxLinesPerFile(Number(e.target.value))}
                        className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
                    >
                        {MAX_LINES_OPTIONS.map(v => (
                            <option key={v} value={v}>{v} lines</option>
                        ))}
                    </select>
                </div>

                {/* Max Turns */}
                <div className="flex items-center justify-between py-1">
                    <div>
                        <span className="text-xs text-foreground">Max Turns</span>
                        <p className="text-[10px] text-muted-foreground">Maximum agent turns per heartbeat run</p>
                    </div>
                    <select
                        value={config?.maxTurns ?? 10}
                        onChange={e => setMaxTurns(Number(e.target.value))}
                        className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
                    >
                        {MAX_TURNS_OPTIONS.map(v => (
                            <option key={v} value={v}>{v} turns</option>
                        ))}
                    </select>
                </div>

                {/* Timeout */}
                <div className="flex items-center justify-between py-1">
                    <div>
                        <span className="text-xs text-foreground">Timeout</span>
                        <p className="text-[10px] text-muted-foreground">Max execution time per heartbeat run</p>
                    </div>
                    <select
                        value={config?.timeoutMinutes ?? 5}
                        onChange={e => setTimeoutMinutes(Number(e.target.value))}
                        className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
                    >
                        {TIMEOUT_OPTIONS.map(v => (
                            <option key={v} value={v}>{v}m</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Claude Memory Sync */}
            <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-primary" />
                        Claude Memory Sync
                    </h3>
                    <button
                        onClick={syncClaudeMemory}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors text-foreground"
                    >
                        <RefreshCw className="w-3 h-3" />
                        Sync Now
                    </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                    Import new content from Claude's auto-memory into today's daily memory.
                </p>
                {memorySyncStatus && (
                    <div className="text-xs text-muted-foreground">
                        {memorySyncStatus.lastSyncAt
                            ? `Last synced: ${new Date(memorySyncStatus.lastSyncAt).toLocaleString()}`
                            : 'Never synced'
                        }
                    </div>
                )}
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

            {/* Reset First Book */}
            <div className="p-4 rounded-lg border border-border/50 bg-card/50 space-y-2">
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-xs text-muted-foreground">Reset First Book</span>
                        <p className="text-[10px] text-muted-foreground/70">
                            Restore seed content and re-run the bootstrap interview
                        </p>
                    </div>
                    <button
                        onClick={resetBootstrap}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                    </button>
                </div>
            </div>
        </div>
    );
}
