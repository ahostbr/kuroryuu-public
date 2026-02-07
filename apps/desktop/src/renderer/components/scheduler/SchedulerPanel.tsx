import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    Calendar,
    Plus,
    Play,
    Pause,
    Trash2,
    Clock,
    Edit,
    AlertCircle,
    CheckCircle2,
    RefreshCw,
    Settings as SettingsIcon,
    ChevronRight,
    History,
    List,
    MapPin,
} from 'lucide-react';
import { useSchedulerStore } from '../../stores/scheduler-store';
import type { ScheduledJob, ScheduledEvent, Schedule, JobAction } from '../../types/scheduler';
import { JobEditor } from './JobEditor';
import { EventEditor } from './EventEditor';
import { JobHistoryPanel } from './JobHistoryPanel';
import { CalendarView } from './CalendarView';
import { DayModal } from './DayModal';

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function formatSchedule(schedule: Schedule): string {
    if (schedule.type === 'cron') {
        return `Cron: ${schedule.expression}`;
    }
    if (schedule.type === 'interval') {
        return `Every ${schedule.every} ${schedule.unit}`;
    }
    if (schedule.type === 'once') {
        return `Once at ${new Date(schedule.at).toLocaleString()}`;
    }
    return 'Unknown schedule';
}

function formatAction(action: JobAction): string {
    if (action.type === 'prompt') {
        return action.prompt.length > 40 ? action.prompt.slice(0, 40) + '...' : action.prompt;
    }
    if (action.type === 'team') {
        return `Team: ${action.teamId}`;
    }
    if (action.type === 'script') {
        return `Script: ${action.scriptPath}`;
    }
    return 'Unknown action';
}

function formatNextRun(timestamp?: number): string {
    if (!timestamp) return 'Not scheduled';
    const now = Date.now();
    const diff = timestamp - now;

    if (diff < 0) return 'Overdue';
    if (diff < 60000) return 'Less than a minute';
    if (diff < 3600000) return `In ${Math.round(diff / 60000)} minutes`;
    if (diff < 86400000) return `In ${Math.round(diff / 3600000)} hours`;
    return new Date(timestamp).toLocaleString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Job Card Component
// ═══════════════════════════════════════════════════════════════════════════════

interface JobCardProps {
    job: ScheduledJob;
    onEdit: (job: ScheduledJob) => void;
    onRunNow: (id: string) => void;
    onPause: (id: string) => void;
    onResume: (id: string) => void;
    onDelete: (id: string) => void;
    onViewHistory: (id: string) => void;
}

function JobCard({ job, onEdit, onRunNow, onPause, onResume, onDelete, onViewHistory }: JobCardProps) {
    const statusColors = {
        idle: 'text-green-400',
        running: 'text-blue-400 animate-pulse',
        paused: 'text-yellow-400',
    };

    return (
        <div
            className={`
        bg-card border rounded-lg p-4 transition-all duration-200
        hover:border-primary/50 hover:shadow-md
        ${!job.enabled ? 'opacity-60' : ''}
      `}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${statusColors[job.status]}`}>
                        {job.status === 'running' ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : job.status === 'paused' ? (
                            <Pause className="w-4 h-4" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4" />
                        )}
                    </span>
                    <h3 className="font-semibold text-foreground">{job.name}</h3>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onEdit(job)}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onViewHistory(job.id)}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="View History"
                    >
                        <History className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onDelete(job.id)}
                        className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Delete"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Description */}
            {job.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {job.description}
                </p>
            )}

            {/* Schedule & Action Info */}
            <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatSchedule(job.schedule)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span className="truncate">{formatAction(job.action)}</span>
                </div>
                {job.nextRun && (
                    <div className="flex items-center gap-2 text-xs">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        <span className="text-primary">{formatNextRun(job.nextRun)}</span>
                    </div>
                )}
            </div>

            {/* Control Buttons */}
            <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                <button
                    onClick={() => onRunNow(job.id)}
                    disabled={job.status === 'running'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Play className="w-3.5 h-3.5" />
                    Run Now
                </button>
                {job.status === 'paused' ? (
                    <button
                        onClick={() => onResume(job.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors text-sm"
                    >
                        <Play className="w-3.5 h-3.5" />
                        Resume
                    </button>
                ) : (
                    <button
                        onClick={() => onPause(job.id)}
                        disabled={job.status === 'running'}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                    </button>
                )}
            </div>

            {/* Tags */}
            {job.tags && job.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                    {job.tags.map((tag) => (
                        <span
                            key={tag}
                            className="px-2 py-0.5 rounded-full bg-secondary text-xs text-muted-foreground"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

interface EventCardProps {
    event: ScheduledEvent;
    onEdit: (event: ScheduledEvent) => void;
    onDelete: (id: string) => void;
}

function EventCard({ event, onEdit, onDelete }: EventCardProps) {
    return (
        <div
            className={`
                bg-card border rounded-lg p-4 transition-all duration-200
                hover:border-emerald-400/50 hover:shadow-md
                ${!event.enabled ? 'opacity-60' : ''}
            `}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-300" />
                    <h3 className="font-semibold text-foreground">{event.title}</h3>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onEdit(event)}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onDelete(event.id)}
                        className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Delete"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {event.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {event.description}
                </p>
            )}

            <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatSchedule(event.schedule)}</span>
                </div>
                {event.location && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="truncate">{event.location}</span>
                    </div>
                )}
                {event.nextRun && (
                    <div className="flex items-center gap-2 text-xs">
                        <Clock className="w-3.5 h-3.5 text-emerald-300" />
                        <span className="text-emerald-300">{formatNextRun(event.nextRun)}</span>
                    </div>
                )}
            </div>

            {event.tags && event.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                    {event.tags.map((tag) => (
                        <span
                            key={tag}
                            className="px-2 py-0.5 rounded-full bg-secondary text-xs text-muted-foreground"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Panel
// ═══════════════════════════════════════════════════════════════════════════════

export function SchedulerPanel() {
    const {
        jobs,
        events,
        isLoading,
        error,
        isEditorOpen,
        editingJob,
        loadJobs,
        loadEvents,
        loadSettings,
        runJobNow,
        pauseJob,
        resumeJob,
        deleteJob,
        deleteEvent,
        openEditor,
        closeEditor,
        refresh,
    } = useSchedulerStore();

    // Compute derived values with useMemo to avoid creating new array refs
    const runningCount = useMemo(() => jobs.filter((j) => j.status === 'running').length, [jobs]);
    const pausedCount = useMemo(() => jobs.filter((j) => j.status === 'paused').length, [jobs]);
    const eventCount = useMemo(() => events.length, [events]);

    const [historyJobId, setHistoryJobId] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);
    const [isEventEditorOpen, setIsEventEditorOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<ScheduledEvent | null>(null);
    const [eventSeedDate, setEventSeedDate] = useState<Date | null>(null);

    // Day navigation handler for DayModal
    const handleNavigateDay = useCallback((direction: 'prev' | 'next') => {
        if (!selectedDay) return;
        const newDate = new Date(selectedDay);
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
        setSelectedDay(newDate);
    }, [selectedDay]);

    // Load data on mount
    useEffect(() => {
        loadJobs();
        loadEvents();
        loadSettings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Zustand store functions are stable, no deps needed

    const handleDelete = async (id: string) => {
        const job = jobs.find((j) => j.id === id);
        if (job && confirm(`Delete scheduled job "${job.name}"?`)) {
            await deleteJob(id);
        }
    };

    const handleDeleteEvent = async (id: string) => {
        const event = events.find((e) => e.id === id);
        if (event && confirm(`Delete event "${event.title}"?`)) {
            await deleteEvent(id);
        }
    };

    const openNewEvent = (seedDate?: Date) => {
        setEditingEvent(null);
        setEventSeedDate(seedDate ?? null);
        setIsEventEditorOpen(true);
    };

    const openExistingEvent = (event: ScheduledEvent) => {
        setEditingEvent(event);
        setEventSeedDate(null);
        setIsEventEditorOpen(true);
    };

    const closeEventEditor = () => {
        setIsEventEditorOpen(false);
        setEditingEvent(null);
        setEventSeedDate(null);
    };

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                    <Calendar className="w-6 h-6 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold text-foreground">Scheduler</h1>
                        <p className="text-sm text-muted-foreground">
                            Manage automated jobs and regular calendar events
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Status badges */}
                    <div className="flex items-center gap-4 text-sm">
                        {runningCount > 0 && (
                            <span className="flex items-center gap-1.5 text-blue-400">
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                {runningCount} running
                            </span>
                        )}
                        {pausedCount > 0 && (
                            <span className="flex items-center gap-1.5 text-yellow-400">
                                <Pause className="w-4 h-4" />
                                {pausedCount} paused
                            </span>
                        )}
                        {eventCount > 0 && (
                            <span className="flex items-center gap-1.5 text-emerald-300">
                                <Calendar className="w-4 h-4" />
                                {eventCount} event{eventCount === 1 ? '' : 's'}
                            </span>
                        )}
                    </div>

                    {/* View Toggle */}
                    <div className="flex items-center rounded-md border border-border bg-secondary/50">
                        <button
                            onClick={() => setViewMode('calendar')}
                            className={`p-2 rounded-l-md transition-colors ${viewMode === 'calendar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            title="Calendar View"
                        >
                            <Calendar className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-r-md transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            title="List View"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Actions */}
                    <button
                        onClick={refresh}
                        className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Settings"
                    >
                        <SettingsIcon className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => openEditor(null)}
                        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        New Job
                    </button>
                    <button
                        onClick={() => openNewEvent()}
                        className="flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        New Event
                    </button>
                </div>
            </div>

            {/* Error State */}
            {error && (
                <div className="mx-6 mt-4 flex items-center gap-2 px-4 py-3 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
                {isLoading && jobs.length === 0 && events.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : jobs.length === 0 && events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6">
                        <Calendar className="w-16 h-16 text-muted-foreground/50 mb-4" />
                        <h2 className="text-xl font-semibold text-foreground mb-2">
                            No scheduled items
                        </h2>
                        <p className="text-muted-foreground mb-6 max-w-md">
                            Create automated jobs or regular calendar events.
                        </p>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => openEditor(null)}
                                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Create Job
                            </button>
                            <button
                                onClick={() => openNewEvent()}
                                className="flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Create Event
                            </button>
                        </div>
                    </div>
                ) : viewMode === 'calendar' ? (
                    <CalendarView
                        jobs={jobs}
                        events={events}
                        onDayClick={(date) => setSelectedDay(date)}
                        onJobClick={(job) => openEditor(job)}
                        onEventClick={(event) => openExistingEvent(event)}
                        onCreateJob={(date) => setSelectedDay(date)}
                        onCreateEvent={(date) => openNewEvent(date)}
                    />
                ) : (
                    <div className="h-full overflow-y-auto p-6">
                        <div className="space-y-6">
                            {jobs.length > 0 && (
                                <div>
                                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                        Jobs
                                    </h2>
                                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                                        {jobs.map((job) => (
                                            <JobCard
                                                key={job.id}
                                                job={job}
                                                onEdit={openEditor}
                                                onRunNow={runJobNow}
                                                onPause={pauseJob}
                                                onResume={resumeJob}
                                                onDelete={handleDelete}
                                                onViewHistory={setHistoryJobId}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {events.length > 0 && (
                                <div>
                                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                        Events
                                    </h2>
                                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                                        {events.map((event) => (
                                            <EventCard
                                                key={event.id}
                                                event={event}
                                                onEdit={openExistingEvent}
                                                onDelete={handleDeleteEvent}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Job Editor Modal */}
            {isEditorOpen && (
                <JobEditor
                    job={editingJob}
                    onClose={closeEditor}
                />
            )}

            {/* Event Editor Modal */}
            {isEventEditorOpen && (
                <EventEditor
                    event={editingEvent}
                    seedDate={eventSeedDate}
                    onClose={closeEventEditor}
                />
            )}

            {/* Day Modal */}
            {selectedDay && (
                <DayModal
                    date={selectedDay}
                    onClose={() => setSelectedDay(null)}
                    onNavigateDay={handleNavigateDay}
                />
            )}

            {/* History Panel */}
            {historyJobId && (
                <JobHistoryPanel
                    jobId={historyJobId}
                    onClose={() => setHistoryJobId(null)}
                />
            )}
        </div>
    );
}

export default SchedulerPanel;
