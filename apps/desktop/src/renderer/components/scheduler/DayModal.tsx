/**
 * DayModal - Full day management modal with hour-by-hour timeline
 * 
 * Opens when clicking a day in the calendar. Features:
 * - Left panel: 24-hour timeline with job blocks
 * - Right panel: Tabbed job editor (Schedule | Action | Settings)
 * - Day navigation with prev/next arrows
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    ChevronLeft,
    ChevronRight,
    Calendar,
    Clock,
    Play,
    Settings,
    Plus,
    Trash2,
    Save,
    Bell,
    Tag,
    Terminal,
    Users,
    FileCode,
} from 'lucide-react';
import { useSchedulerStore } from '../../stores/scheduler-store';
import type {
    ScheduledJob,
    Schedule,
    JobAction,
    CreateJobParams,
    UpdateJobParams,
} from '../../types/scheduler';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface DayModalProps {
    date: Date;
    onClose: () => void;
    onNavigateDay: (direction: 'prev' | 'next') => void;
}

type EditorTab = 'schedule' | 'action' | 'settings';
type ScheduleType = 'cron' | 'interval' | 'once';
type ActionType = 'prompt' | 'team' | 'script';
type IntervalUnit = 'minutes' | 'hours' | 'days' | 'weeks';

interface HourSlot {
    hour: number; // 0-23
    jobs: ScheduledJob[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const HOUR_HEIGHT = 60; // Height per hour slot in pixels
const TIMELINE_HOURS = Array.from({ length: 24 }, (_, i) => i);

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

function formatHour(hour: number): string {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
}

function formatDateHeader(date: Date): string {
    const dayName = DAY_NAMES[date.getDay()];
    const monthName = MONTH_NAMES[date.getMonth()];
    return `${dayName}, ${monthName} ${date.getDate()}, ${date.getFullYear()}`;
}

function getJobsForHour(hour: number, date: Date, jobs: ScheduledJob[]): ScheduledJob[] {
    const startOfHour = new Date(date);
    startOfHour.setHours(hour, 0, 0, 0);
    const endOfHour = new Date(date);
    endOfHour.setHours(hour, 59, 59, 999);

    return jobs.filter(job => {
        if (!job.nextRun) return false;
        const jobTime = new Date(job.nextRun);
        return jobTime >= startOfHour && jobTime <= endOfHour;
    });
}

function getHourSlots(date: Date, jobs: ScheduledJob[]): HourSlot[] {
    return TIMELINE_HOURS.map(hour => ({
        hour,
        jobs: getJobsForHour(hour, date, jobs),
    }));
}

function isCurrentHour(hour: number, date: Date): boolean {
    const now = new Date();
    return (
        now.getFullYear() === date.getFullYear() &&
        now.getMonth() === date.getMonth() &&
        now.getDate() === date.getDate() &&
        now.getHours() === hour
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Timeline Component
// ═══════════════════════════════════════════════════════════════════════════════

interface TimelinePanelProps {
    date: Date;
    jobs: ScheduledJob[];
    selectedJobId: string | null;
    onSelectJob: (job: ScheduledJob) => void;
    onCreateAtHour: (hour: number) => void;
}

function TimelinePanel({ date, jobs, selectedJobId, onSelectJob, onCreateAtHour }: TimelinePanelProps) {
    const hourSlots = useMemo(() => getHourSlots(date, jobs), [date, jobs]);

    return (
        <div className="flex-1 overflow-y-auto border-r border-border bg-background/50">
            {/* Current time indicator would scroll to here */}
            <div className="relative">
                {hourSlots.map((slot) => {
                    const isCurrent = isCurrentHour(slot.hour, date);

                    return (
                        <div
                            key={slot.hour}
                            className={`
                                relative flex border-b border-border/50
                                ${isCurrent ? 'bg-primary/10' : 'hover:bg-secondary/30'}
                                transition-colors
                            `}
                            style={{ height: HOUR_HEIGHT }}
                        >
                            {/* Hour label */}
                            <div className="w-16 flex-shrink-0 flex items-start justify-end pr-3 pt-1">
                                <span className={`text-xs ${isCurrent ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                                    {formatHour(slot.hour)}
                                </span>
                            </div>

                            {/* Hour content area */}
                            <div
                                className="flex-1 relative cursor-pointer group"
                                onClick={() => onCreateAtHour(slot.hour)}
                            >
                                {/* Current time line */}
                                {isCurrent && (
                                    <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-primary z-10">
                                        <div className="absolute -left-1.5 -top-1 w-3 h-3 rounded-full bg-primary" />
                                    </div>
                                )}

                                {/* Jobs in this hour */}
                                <div className="absolute inset-1 flex flex-col gap-1">
                                    {slot.jobs.map((job) => (
                                        <motion.div
                                            key={job.id}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectJob(job);
                                            }}
                                            className={`
                                                px-2 py-1 rounded text-xs cursor-pointer
                                                transition-all duration-150
                                                ${selectedJobId === job.id
                                                    ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background'
                                                    : job.status === 'running'
                                                        ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                                                        : job.status === 'paused'
                                                            ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                                                            : 'bg-primary/20 text-primary hover:bg-primary/30'
                                                }
                                            `}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="w-3 h-3 flex-shrink-0" />
                                                <span className="truncate font-medium">{job.name}</span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Add button on hover */}
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="p-1 rounded bg-secondary hover:bg-secondary/80">
                                        <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Editor Panel Component
// ═══════════════════════════════════════════════════════════════════════════════

interface EditorPanelProps {
    job: ScheduledJob | null;
    selectedHour: number | null;
    date: Date;
    onSave: (params: CreateJobParams | UpdateJobParams) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onCancel: () => void;
}

function EditorPanel({ job, selectedHour, date, onSave, onDelete, onCancel }: EditorPanelProps) {
    const isEditing = !!job;

    // Active tab
    const [activeTab, setActiveTab] = useState<EditorTab>('schedule');

    // Form state
    const [name, setName] = useState(job?.name ?? '');
    const [description, setDescription] = useState(job?.description ?? '');
    const [enabled, setEnabled] = useState(job?.enabled ?? true);

    // Schedule state
    const getInitialOnceAt = () => {
        if (job?.schedule?.type === 'once') {
            return new Date(job.schedule.at).toISOString().slice(0, 16);
        }
        if (selectedHour !== null) {
            const d = new Date(date);
            d.setHours(selectedHour, 0, 0, 0);
            return d.toISOString().slice(0, 16);
        }
        return '';
    };

    const [scheduleType, setScheduleType] = useState<ScheduleType>(
        job?.schedule?.type ?? 'once'
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
    const [onceAt, setOnceAt] = useState(getInitialOnceAt());

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
    const [teamId, setTeamId] = useState(
        job?.action?.type === 'team' ? job.action.teamId : ''
    );
    const [scriptPath, setScriptPath] = useState(
        job?.action?.type === 'script' ? job.action.scriptPath : ''
    );

    // Settings state
    const [notifyOnStart, setNotifyOnStart] = useState(job?.notifyOnStart ?? false);
    const [notifyOnComplete, setNotifyOnComplete] = useState(job?.notifyOnComplete ?? true);
    const [notifyOnError, setNotifyOnError] = useState(job?.notifyOnError ?? true);
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

    // Build action object
    const buildAction = (): JobAction => {
        if (actionType === 'prompt') {
            return { type: 'prompt', prompt, workdir: workdir || undefined };
        }
        if (actionType === 'team') {
            return { type: 'team', teamId };
        }
        return { type: 'script', scriptPath };
    };

    // Handle save
    const handleSave = async () => {
        if (!name.trim()) return;
        setIsSaving(true);

        try {
            if (isEditing && job) {
                await onSave({
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
                } as UpdateJobParams);
            } else {
                await onSave({
                    name,
                    description: description || undefined,
                    schedule: buildSchedule(),
                    action: buildAction(),
                    enabled,
                    tags: tags.length > 0 ? tags : undefined,
                    notifyOnStart,
                    notifyOnComplete,
                    notifyOnError,
                } as CreateJobParams);
            }
            onCancel();
        } finally {
            setIsSaving(false);
        }
    };

    // Handle delete
    const handleDelete = async () => {
        if (job && confirm(`Delete job "${job.name}"?`)) {
            await onDelete(job.id);
            onCancel();
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

    const removeTag = (tag: string) => {
        setTags(tags.filter(t => t !== tag));
    };

    const tabs: { id: EditorTab; label: string; icon: React.ElementType }[] = [
        { id: 'schedule', label: 'Schedule', icon: Clock },
        { id: 'action', label: 'Action', icon: Play },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <div className="w-80 flex flex-col bg-card border-l border-border">
            {/* Editor Header */}
            <div className="px-4 py-3 border-b border-border">
                <h3 className="font-semibold text-foreground">
                    {isEditing ? 'Edit Job' : 'New Job'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {isEditing ? `Editing "${job?.name}"` : 'Create a new scheduled job'}
                </p>
            </div>

            {/* Job Name */}
            <div className="px-4 py-3 border-b border-border">
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Job name *"
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium
                                transition-colors border-b-2 -mb-px
                                ${activeTab === tab.id
                                    ? 'border-primary text-primary bg-primary/5'
                                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                                }
                            `}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4">
                <AnimatePresence mode="wait">
                    {activeTab === 'schedule' && (
                        <motion.div
                            key="schedule"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="space-y-4"
                        >
                            {/* Schedule Type */}
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Type</label>
                                <div className="flex gap-1">
                                    {(['once', 'interval', 'cron'] as const).map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => setScheduleType(type)}
                                            className={`flex-1 px-2 py-1.5 rounded text-xs capitalize transition-colors ${scheduleType === type
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-secondary text-foreground hover:bg-secondary/80'
                                                }`}
                                        >
                                            {type === 'once' ? 'One-time' : type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Once At */}
                            {scheduleType === 'once' && (
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Run At</label>
                                    <input
                                        type="datetime-local"
                                        value={onceAt}
                                        onChange={(e) => setOnceAt(e.target.value)}
                                        className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                                    />
                                </div>
                            )}

                            {/* Interval */}
                            {scheduleType === 'interval' && (
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Repeat</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">Every</span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={intervalValue}
                                            onChange={(e) => setIntervalValue(parseInt(e.target.value) || 1)}
                                            className="w-16 px-2 py-1.5 rounded border border-border bg-background text-foreground text-sm"
                                        />
                                        <select
                                            value={intervalUnit}
                                            onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                                            className="flex-1 px-2 py-1.5 rounded border border-border bg-background text-foreground text-sm"
                                        >
                                            <option value="minutes">minutes</option>
                                            <option value="hours">hours</option>
                                            <option value="days">days</option>
                                            <option value="weeks">weeks</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Cron */}
                            {scheduleType === 'cron' && (
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Cron Expression</label>
                                    <input
                                        type="text"
                                        value={cronExpression}
                                        onChange={(e) => setCronExpression(e.target.value)}
                                        placeholder="0 9 * * 1-5"
                                        className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Example: 0 9 * * 1-5 (weekdays at 9am)
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'action' && (
                        <motion.div
                            key="action"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="space-y-4"
                        >
                            {/* Action Type */}
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Action Type</label>
                                <div className="flex gap-1">
                                    {(['prompt', 'team', 'script'] as const).map((type) => {
                                        const Icon = type === 'prompt' ? Terminal : type === 'team' ? Users : FileCode;
                                        return (
                                            <button
                                                key={type}
                                                onClick={() => setActionType(type)}
                                                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs capitalize transition-colors ${actionType === type
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'bg-secondary text-foreground hover:bg-secondary/80'
                                                    }`}
                                            >
                                                <Icon className="w-3 h-3" />
                                                {type}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Prompt Action */}
                            {actionType === 'prompt' && (
                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground">Prompt *</label>
                                        <textarea
                                            value={prompt}
                                            onChange={(e) => setPrompt(e.target.value)}
                                            placeholder="Enter prompt for Claude..."
                                            rows={4}
                                            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground">Working Directory</label>
                                        <input
                                            type="text"
                                            value={workdir}
                                            onChange={(e) => setWorkdir(e.target.value)}
                                            placeholder="/path/to/project"
                                            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Team Action */}
                            {actionType === 'team' && (
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Team ID *</label>
                                    <input
                                        type="text"
                                        value={teamId}
                                        onChange={(e) => setTeamId(e.target.value)}
                                        placeholder="team-id"
                                        className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                                    />
                                </div>
                            )}

                            {/* Script Action */}
                            {actionType === 'script' && (
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Script Path *</label>
                                    <input
                                        type="text"
                                        value={scriptPath}
                                        onChange={(e) => setScriptPath(e.target.value)}
                                        placeholder="/path/to/script.sh"
                                        className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                                    />
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'settings' && (
                        <motion.div
                            key="settings"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="space-y-4"
                        >
                            {/* Description */}
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Optional description..."
                                    rows={2}
                                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none text-sm"
                                />
                            </div>

                            {/* Enabled toggle */}
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(e) => setEnabled(e.target.checked)}
                                    className="w-4 h-4 rounded border-border"
                                />
                                <span className="text-sm text-foreground">Enable this job</span>
                            </label>

                            {/* Notifications */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                    <Bell className="w-3.5 h-3.5" />
                                    Notifications
                                </div>
                                <div className="space-y-1.5">
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
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                    <Tag className="w-3.5 h-3.5" />
                                    Tags
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && addTag()}
                                        placeholder="Add tag..."
                                        className="flex-1 px-2 py-1.5 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-xs"
                                    />
                                    <button
                                        onClick={addTag}
                                        className="p-1.5 rounded bg-secondary hover:bg-secondary/80"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                {tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-xs"
                                            >
                                                {tag}
                                                <button onClick={() => removeTag(tag)} className="hover:text-red-400">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Footer Actions */}
            <div className="px-4 py-3 border-t border-border flex items-center gap-2">
                {isEditing && (
                    <button
                        onClick={handleDelete}
                        className="p-2 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
                <div className="flex-1" />
                <button
                    onClick={onCancel}
                    className="px-3 py-1.5 rounded text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={!name.trim() || isSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save className="w-3.5 h-3.5" />
                    {isSaving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main DayModal Component
// ═══════════════════════════════════════════════════════════════════════════════

export function DayModal({ date, onClose, onNavigateDay }: DayModalProps) {
    const { jobs, createJob, updateJob, deleteJob } = useSchedulerStore();

    // Filter jobs for this day
    const dayJobs = useMemo(() => {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        return jobs.filter(job => {
            if (!job.nextRun) return false;
            const jobDate = new Date(job.nextRun);
            return jobDate >= startOfDay && jobDate <= endOfDay;
        });
    }, [date, jobs]);

    // Editor state
    const [selectedJob, setSelectedJob] = useState<ScheduledJob | null>(null);
    const [selectedHour, setSelectedHour] = useState<number | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    const handleSelectJob = useCallback((job: ScheduledJob) => {
        setSelectedJob(job);
        setSelectedHour(null);
        setIsEditing(true);
    }, []);

    const handleCreateAtHour = useCallback((hour: number) => {
        setSelectedJob(null);
        setSelectedHour(hour);
        setIsEditing(true);
    }, []);

    const handleCancelEdit = useCallback(() => {
        setSelectedJob(null);
        setSelectedHour(null);
        setIsEditing(false);
    }, []);

    const handleSave = useCallback(async (params: CreateJobParams | UpdateJobParams) => {
        if ('id' in params) {
            await updateJob(params);
        } else {
            await createJob(params);
        }
    }, [createJob, updateJob]);

    const handleDelete = useCallback(async (id: string) => {
        await deleteJob(id);
    }, [deleteJob]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="bg-card border border-border rounded-xl shadow-2xl w-[900px] max-w-[95vw] h-[700px] max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/95 backdrop-blur">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => onNavigateDay('prev')}
                            className="p-1.5 rounded hover:bg-secondary transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold text-foreground">
                                {formatDateHeader(date)}
                            </h2>
                        </div>

                        <button
                            onClick={() => onNavigateDay('next')}
                            className="p-1.5 rounded hover:bg-secondary transition-colors"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                            {dayJobs.length} job{dayJobs.length !== 1 ? 's' : ''} scheduled
                        </span>
                        <button
                            onClick={onClose}
                            className="p-2 rounded hover:bg-secondary transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Timeline Panel */}
                    <TimelinePanel
                        date={date}
                        jobs={dayJobs}
                        selectedJobId={selectedJob?.id ?? null}
                        onSelectJob={handleSelectJob}
                        onCreateAtHour={handleCreateAtHour}
                    />

                    {/* Editor Panel */}
                    <AnimatePresence mode="wait">
                        {isEditing && (
                            <motion.div
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: 320, opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                className="overflow-hidden"
                            >
                                <EditorPanel
                                    job={selectedJob}
                                    selectedHour={selectedHour}
                                    date={date}
                                    onSave={handleSave}
                                    onDelete={handleDelete}
                                    onCancel={handleCancelEdit}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </motion.div>
    );
}

export default DayModal;
