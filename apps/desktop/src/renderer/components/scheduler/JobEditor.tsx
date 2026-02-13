/**
 * Job Editor
 * 
 * Modal for creating and editing scheduled jobs.
 */

import React, { useState, useEffect } from 'react';
import {
    X,
    Calendar,
    Clock,
    Play,
    Terminal,
    Users,
    FileCode,
    Bell,
    Save,
    Plus,
    Tag,
    ChevronDown,
    ChevronRight,
    Settings,
} from 'lucide-react';
import { useSchedulerStore } from '../../stores/scheduler-store';
import type {
    ScheduledJob,
    Schedule,
    JobAction,
    CreateJobParams,
    UpdateJobParams,
    ExecutionMode,
    ExecutionBackend,
} from '../../types/scheduler';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface JobEditorProps {
    job?: ScheduledJob | null;
    onClose: () => void;
}

type ScheduleType = 'cron' | 'interval' | 'once';
type ActionType = 'prompt' | 'team' | 'script';
type IntervalUnit = 'minutes' | 'hours' | 'days' | 'weeks';

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export function JobEditor({ job, onClose }: JobEditorProps) {
    const { createJob, updateJob } = useSchedulerStore();
    const isEditing = !!job;

    // Form state
    const [name, setName] = useState(job?.name ?? '');
    const [description, setDescription] = useState(job?.description ?? '');
    const [enabled, setEnabled] = useState(job?.enabled ?? true);

    // Schedule state
    const [scheduleType, setScheduleType] = useState<ScheduleType>(
        job?.schedule?.type ?? 'interval'
    );
    const [cronExpression, setCronExpression] = useState(
        job?.schedule?.type === 'cron' ? job.schedule.expression : '0 9 * * 1-5'
    );
    const [intervalValue, setIntervalValue] = useState(
        job?.schedule?.type === 'interval' ? job.schedule.every : 1
    );
    const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(
        job?.schedule?.type === 'interval' ? job.schedule.unit : 'hours'
    );
    const [onceAt, setOnceAt] = useState(
        job?.schedule?.type === 'once' ? new Date(job.schedule.at).toISOString().slice(0, 16) : ''
    );

    // Action state
    const [actionType, setActionType] = useState<ActionType>(
        job?.action?.type ?? 'prompt'
    );
    const [prompt, setPrompt] = useState(
        job?.action?.type === 'prompt' ? job.action.prompt : ''
    );
    const [workdir, setWorkdir] = useState(
        job?.action?.type === 'prompt' ? job.action.workdir ?? '' : ''
    );
    const [executionMode, setExecutionMode] = useState<ExecutionMode>(
        job?.action?.type === 'prompt' ? job.action.executionMode ?? 'background' : 'background'
    );
    const [executionBackend, setExecutionBackend] = useState<ExecutionBackend>(
        job?.action?.type === 'prompt' ? (job.action as { executionBackend?: ExecutionBackend }).executionBackend ?? 'cli' : 'cli'
    );
    const [teamId, setTeamId] = useState(
        job?.action?.type === 'team' ? job.action.teamId : ''
    );
    const [scriptPath, setScriptPath] = useState(
        job?.action?.type === 'script' ? job.action.scriptPath : ''
    );
    const [scriptTimeoutMinutes, setScriptTimeoutMinutes] = useState(
        job?.action?.type === 'script' ? job.action.timeoutMinutes ?? 60 : 60
    );

    // Advanced SDK options (for prompt actions)
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [systemPrompt, setSystemPrompt] = useState(
        job?.action?.type === 'prompt' ? (job.action as { systemPrompt?: string }).systemPrompt ?? '' : ''
    );
    const [permissionMode, setPermissionMode] = useState(
        job?.action?.type === 'prompt' ? (job.action as { permissionMode?: string }).permissionMode ?? 'bypassPermissions' : 'bypassPermissions'
    );
    const [maxTurns, setMaxTurns] = useState(
        job?.action?.type === 'prompt' ? (job.action as { maxTurns?: number }).maxTurns ?? 0 : 0
    );
    const [maxBudgetUsd, setMaxBudgetUsd] = useState(
        job?.action?.type === 'prompt' ? (job.action as { maxBudgetUsd?: number }).maxBudgetUsd ?? 0 : 0
    );
    const [promptTimeoutMinutes, setPromptTimeoutMinutes] = useState(
        job?.action?.type === 'prompt' ? (job.action as { timeoutMinutes?: number }).timeoutMinutes ?? 60 : 60
    );

    // Notification state
    const [notifyOnStart, setNotifyOnStart] = useState(job?.notifyOnStart ?? false);
    const [notifyOnComplete, setNotifyOnComplete] = useState(job?.notifyOnComplete ?? true);
    const [notifyOnError, setNotifyOnError] = useState(job?.notifyOnError ?? true);

    // Tags state
    const [tags, setTags] = useState<string[]>(job?.tags ?? []);
    const [newTag, setNewTag] = useState('');

    const [isSaving, setIsSaving] = useState(false);

    // Build schedule object
    const buildSchedule = (): Schedule => {
        if (scheduleType === 'cron') {
            return { type: 'cron', expression: cronExpression };
        }
        if (scheduleType === 'interval') {
            return { type: 'interval', every: intervalValue, unit: intervalUnit };
        }
        return { type: 'once', at: new Date(onceAt).getTime() };
    };

    const buildAction = (): JobAction => {
        if (actionType === 'prompt') {
            return {
                type: 'prompt',
                prompt,
                workdir: workdir || undefined,
                executionMode,
                executionBackend: executionMode === 'background' ? executionBackend : undefined,
                systemPrompt: systemPrompt || undefined,
                permissionMode: permissionMode !== 'bypassPermissions' ? permissionMode as 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' : undefined,
                maxTurns: maxTurns > 0 ? maxTurns : undefined,
                maxBudgetUsd: maxBudgetUsd > 0 ? maxBudgetUsd : undefined,
                timeoutMinutes: promptTimeoutMinutes !== 60 ? promptTimeoutMinutes : undefined,
            };
        }
        if (actionType === 'team') {
            return { type: 'team', teamId };
        }
        return {
            type: 'script',
            scriptPath,
            timeoutMinutes: scriptTimeoutMinutes,
        };
    };

    // Handle save
    const handleSave = async () => {
        if (!name.trim()) return;

        setIsSaving(true);

        try {
            if (isEditing && job) {
                const params: UpdateJobParams = {
                    id: job.id,
                    name,
                    description: description || undefined,
                    schedule: buildSchedule(),
                    action: buildAction(),
                    enabled,
                    tags: tags.length > 0 ? tags : undefined,
                    notifyOnStart,
                    notifyOnComplete,
                    notifyOnError,
                };
                await updateJob(params);
            } else {
                const params: CreateJobParams = {
                    name,
                    description: description || undefined,
                    schedule: buildSchedule(),
                    action: buildAction(),
                    enabled,
                    tags: tags.length > 0 ? tags : undefined,
                    notifyOnStart,
                    notifyOnComplete,
                    notifyOnError,
                };
                await createJob(params);
            }
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    // Add tag
    const addTag = () => {
        const tag = newTag.trim().toLowerCase();
        if (tag && !tags.includes(tag)) {
            setTags([...tags, tag]);
            setNewTag('');
        }
    };

    // Remove tag
    const removeTag = (tag: string) => {
        setTags(tags.filter((t) => t !== tag));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold text-foreground">
                            {isEditing ? 'Edit Job' : 'New Scheduled Job'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                Job Name *
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Daily backup check"
                                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                Description
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Optional description..."
                                rows={2}
                                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="enabled"
                                checked={enabled}
                                onChange={(e) => setEnabled(e.target.checked)}
                                className="w-4 h-4 rounded border-border"
                            />
                            <label htmlFor="enabled" className="text-sm text-foreground">
                                Enable this job
                            </label>
                        </div>
                    </div>

                    {/* Schedule */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Clock className="w-4 h-4" />
                            Schedule
                        </div>

                        <div className="flex gap-2">
                            {(['cron', 'interval', 'once'] as const).map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setScheduleType(type)}
                                    className={`px-3 py-1.5 rounded-md text-sm capitalize transition-colors ${scheduleType === type
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-secondary text-foreground hover:bg-secondary/80'
                                        }`}
                                >
                                    {type === 'once' ? 'One-time' : type}
                                </button>
                            ))}
                        </div>

                        {scheduleType === 'cron' && (
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1.5">
                                    Cron Expression
                                </label>
                                <input
                                    type="text"
                                    value={cronExpression}
                                    onChange={(e) => setCronExpression(e.target.value)}
                                    placeholder="0 9 * * 1-5"
                                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Example: 0 9 * * 1-5 (weekdays at 9am)
                                </p>
                            </div>
                        )}

                        {scheduleType === 'interval' && (
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-muted-foreground">Every</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={intervalValue}
                                    onChange={(e) => setIntervalValue(parseInt(e.target.value) || 1)}
                                    className="w-20 px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                                <select
                                    value={intervalUnit}
                                    onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                                    className="px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                    <option value="minutes">minutes</option>
                                    <option value="hours">hours</option>
                                    <option value="days">days</option>
                                    <option value="weeks">weeks</option>
                                </select>
                            </div>
                        )}

                        {scheduleType === 'once' && (
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1.5">
                                    Run At
                                </label>
                                <input
                                    type="datetime-local"
                                    value={onceAt}
                                    onChange={(e) => setOnceAt(e.target.value)}
                                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                        )}
                    </div>

                    {/* Action */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Play className="w-4 h-4" />
                            Action
                        </div>

                        <div className="flex gap-2">
                            {(['prompt', 'team', 'script'] as const).map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setActionType(type)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm capitalize transition-colors ${actionType === type
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-secondary text-foreground hover:bg-secondary/80'
                                        }`}
                                >
                                    {type === 'prompt' && <Terminal className="w-3.5 h-3.5" />}
                                    {type === 'team' && <Users className="w-3.5 h-3.5" />}
                                    {type === 'script' && <FileCode className="w-3.5 h-3.5" />}
                                    {type}
                                </button>
                            ))}
                        </div>

                        {actionType === 'prompt' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm text-muted-foreground mb-1.5">
                                        Prompt *
                                    </label>
                                    <textarea
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder="Enter the prompt to send to Claude..."
                                        rows={4}
                                        className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-mono text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-muted-foreground mb-1.5">
                                        Working Directory (optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={workdir}
                                        onChange={(e) => setWorkdir(e.target.value)}
                                        placeholder="/path/to/project"
                                        className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-muted-foreground mb-1.5">
                                        Execution Mode
                                    </label>
                                    <div className="flex gap-2 p-1 bg-secondary/30 rounded-md">
                                        <button
                                            onClick={() => setExecutionMode('background')}
                                            className={`flex-1 flex flex-col items-center gap-0.5 px-3 py-2 rounded text-xs transition-colors ${executionMode === 'background'
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                                                }`}
                                        >
                                            <span className="font-medium">Background</span>
                                            <span className="text-[10px] opacity-80">Silent & Auto-close</span>
                                        </button>
                                        <button
                                            onClick={() => setExecutionMode('interactive')}
                                            className={`flex-1 flex flex-col items-center gap-0.5 px-3 py-2 rounded text-xs transition-colors ${executionMode === 'interactive'
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                                                }`}
                                        >
                                            <span className="font-medium">Interactive</span>
                                            <span className="text-[10px] opacity-80">Visible & Stays Open</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Execution Backend (visible when Background) */}
                                {executionMode === 'background' && (
                                    <div>
                                        <label className="block text-sm text-muted-foreground mb-1.5">
                                            Execution Backend
                                        </label>
                                        <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
                                            <button
                                                type="button"
                                                onClick={() => setExecutionBackend('cli')}
                                                className={`flex-1 flex flex-col items-center gap-0.5 px-3 py-2 rounded text-xs transition-colors ${executionBackend === 'cli'
                                                    ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                                                    }`}
                                            >
                                                <span className="font-medium">CLI</span>
                                                <span className="text-[10px] opacity-80">OAuth (free)</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setExecutionBackend('sdk')}
                                                className={`flex-1 flex flex-col items-center gap-0.5 px-3 py-2 rounded text-xs transition-colors ${executionBackend === 'sdk'
                                                    ? 'bg-violet-500/20 text-violet-400 shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                                                    }`}
                                            >
                                                <span className="font-medium">SDK</span>
                                                <span className="text-[10px] opacity-80">API Key</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Advanced SDK Options */}
                                <div className="border border-border/50 rounded-md">
                                    <button
                                        type="button"
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {showAdvanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                        <Settings className="w-3.5 h-3.5" />
                                        Advanced Options
                                    </button>
                                    {showAdvanced && (
                                        <div className="px-3 pb-3 space-y-3 border-t border-border/50">
                                            <div className="pt-3">
                                                <label className="block text-sm text-muted-foreground mb-1.5">
                                                    System Prompt (appended)
                                                </label>
                                                <textarea
                                                    value={systemPrompt}
                                                    onChange={(e) => setSystemPrompt(e.target.value)}
                                                    placeholder="Additional instructions for the agent..."
                                                    rows={2}
                                                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-mono text-xs"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm text-muted-foreground mb-1.5">
                                                    Permission Mode
                                                </label>
                                                <select
                                                    value={permissionMode}
                                                    onChange={(e) => setPermissionMode(e.target.value)}
                                                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                                                >
                                                    <option value="bypassPermissions">Bypass Permissions (auto)</option>
                                                    <option value="acceptEdits">Accept Edits</option>
                                                    <option value="default">Default (ask)</option>
                                                    <option value="plan">Plan Mode</option>
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div>
                                                    <label className="block text-xs text-muted-foreground mb-1">
                                                        Max Turns
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={maxTurns}
                                                        onChange={(e) => setMaxTurns(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                                        placeholder="0 = no limit"
                                                        className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-muted-foreground mb-1">
                                                        Budget (USD)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step={0.1}
                                                        value={maxBudgetUsd}
                                                        onChange={(e) => setMaxBudgetUsd(Math.max(0, parseFloat(e.target.value) || 0))}
                                                        placeholder="0 = no limit"
                                                        className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-muted-foreground mb-1">
                                                        Timeout (min)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={promptTimeoutMinutes}
                                                        onChange={(e) => setPromptTimeoutMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                                        className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground/70">
                                                0 = unlimited. Background jobs use Claude Agent SDK natively.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {actionType === 'team' && (
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1.5">
                                    Team ID *
                                </label>
                                <input
                                    type="text"
                                    value={teamId}
                                    onChange={(e) => setTeamId(e.target.value)}
                                    placeholder="Enter team ID..."
                                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                        )}

                        {actionType === 'script' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm text-muted-foreground mb-1.5">
                                        Script Path *
                                    </label>
                                    <input
                                        type="text"
                                        value={scriptPath}
                                        onChange={(e) => setScriptPath(e.target.value)}
                                        placeholder="/path/to/script.sh"
                                        className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-muted-foreground mb-1.5">
                                        Timeout (minutes)
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={scriptTimeoutMinutes}
                                        onChange={(e) => setScriptTimeoutMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                        className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Set to 0 to disable timeout.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Notifications */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Bell className="w-4 h-4" />
                            Notifications
                        </div>

                        <div className="flex flex-wrap gap-4">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={notifyOnStart}
                                    onChange={(e) => setNotifyOnStart(e.target.checked)}
                                    className="w-4 h-4 rounded border-border"
                                />
                                On start
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={notifyOnComplete}
                                    onChange={(e) => setNotifyOnComplete(e.target.checked)}
                                    className="w-4 h-4 rounded border-border"
                                />
                                On complete
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={notifyOnError}
                                    onChange={(e) => setNotifyOnError(e.target.checked)}
                                    className="w-4 h-4 rounded border-border"
                                />
                                On error
                            </label>
                        </div>
                    </div>

                    {/* Tags */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Tag className="w-4 h-4" />
                            Tags
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addTag()}
                                placeholder="Add tag..."
                                className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                            />
                            <button
                                onClick={addTag}
                                className="p-2 rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>

                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="flex items-center gap-1 px-2 py-1 rounded-full bg-secondary text-sm text-foreground"
                                    >
                                        {tag}
                                        <button
                                            onClick={() => removeTag(tag)}
                                            className="p-0.5 hover:text-red-400"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!name.trim() || isSaving}
                        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? (
                            <>Saving...</>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                {isEditing ? 'Update Job' : 'Create Job'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default JobEditor;
