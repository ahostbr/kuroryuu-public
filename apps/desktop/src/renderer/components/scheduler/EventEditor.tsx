/**
 * Event Editor
 *
 * Modal for creating and editing regular scheduled events (non-job).
 */

import React, { useState } from 'react';
import { X, Calendar, Clock, Bell, Save, Plus, Tag } from 'lucide-react';
import { useSchedulerStore } from '../../stores/scheduler-store';
import type {
    ScheduledEvent,
    Schedule,
    CreateEventParams,
    UpdateEventParams,
} from '../../types/scheduler';

interface EventEditorProps {
    event?: ScheduledEvent | null;
    seedDate?: Date | null;
    onClose: () => void;
}

type ScheduleType = 'cron' | 'interval' | 'once';
type IntervalUnit = 'minutes' | 'hours' | 'days' | 'weeks';

function toLocalDateTimeValue(value: number): string {
    return new Date(value).toISOString().slice(0, 16);
}

export function EventEditor({ event, seedDate, onClose }: EventEditorProps) {
    const { createEvent, updateEvent } = useSchedulerStore();
    const isEditing = !!event;

    const [title, setTitle] = useState(event?.title ?? '');
    const [description, setDescription] = useState(event?.description ?? '');
    const [enabled, setEnabled] = useState(event?.enabled ?? true);
    const [location, setLocation] = useState(event?.location ?? '');
    const [allDay, setAllDay] = useState(event?.allDay ?? false);
    const [notify, setNotify] = useState(event?.notify ?? true);

    const [scheduleType, setScheduleType] = useState<ScheduleType>(
        event?.schedule?.type ?? 'once'
    );
    const [cronExpression, setCronExpression] = useState(
        event?.schedule?.type === 'cron' ? event.schedule.expression : '0 9 * * 1-5'
    );
    const [intervalValue, setIntervalValue] = useState(
        event?.schedule?.type === 'interval' ? event.schedule.every : 1
    );
    const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(
        event?.schedule?.type === 'interval' ? event.schedule.unit : 'days'
    );
    const [onceAt, setOnceAt] = useState(() => {
        if (event?.schedule?.type === 'once') {
            return toLocalDateTimeValue(event.schedule.at);
        }
        if (seedDate) {
            const d = new Date(seedDate);
            d.setHours(9, 0, 0, 0);
            return toLocalDateTimeValue(d.getTime());
        }
        return '';
    });

    const [tags, setTags] = useState<string[]>(event?.tags ?? []);
    const [newTag, setNewTag] = useState('');
    const [color, setColor] = useState(event?.color ?? '#10b981');
    const [isSaving, setIsSaving] = useState(false);

    const buildSchedule = (): Schedule => {
        if (scheduleType === 'cron') {
            return { type: 'cron', expression: cronExpression };
        }
        if (scheduleType === 'interval') {
            return { type: 'interval', every: intervalValue, unit: intervalUnit };
        }
        return { type: 'once', at: new Date(onceAt).getTime() };
    };

    const addTag = () => {
        const tag = newTag.trim().toLowerCase();
        if (tag && !tags.includes(tag)) {
            setTags([...tags, tag]);
            setNewTag('');
        }
    };

    const removeTag = (tag: string) => {
        setTags(tags.filter((t) => t !== tag));
    };

    const handleSave = async () => {
        if (!title.trim()) return;

        setIsSaving(true);
        try {
            if (isEditing && event) {
                const params: UpdateEventParams = {
                    id: event.id,
                    title,
                    description: description || undefined,
                    schedule: buildSchedule(),
                    enabled,
                    location: location || undefined,
                    allDay,
                    tags: tags.length > 0 ? tags : undefined,
                    notify,
                    color: color || undefined,
                };
                await updateEvent(params);
            } else {
                const params: CreateEventParams = {
                    title,
                    description: description || undefined,
                    schedule: buildSchedule(),
                    enabled,
                    location: location || undefined,
                    allDay,
                    tags: tags.length > 0 ? tags : undefined,
                    notify,
                    color: color || undefined,
                };
                await createEvent(params);
            }
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-emerald-400" />
                        <h2 className="text-lg font-semibold text-foreground">
                            {isEditing ? 'Edit Event' : 'New Scheduled Event'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                Event Title *
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Weekly planning sync"
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
                                placeholder="Optional details..."
                                rows={2}
                                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(e) => setEnabled(e.target.checked)}
                                    className="w-4 h-4 rounded border-border"
                                />
                                Enable event
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={allDay}
                                    onChange={(e) => setAllDay(e.target.checked)}
                                    className="w-4 h-4 rounded border-border"
                                />
                                All day
                            </label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Clock className="w-4 h-4" />
                            Schedule
                        </div>

                        <div className="flex gap-2">
                            {(['once', 'interval', 'cron'] as const).map((type) => (
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
                            </div>
                        )}

                        {scheduleType === 'interval' && (
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-muted-foreground">Every</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={intervalValue}
                                    onChange={(e) => setIntervalValue(parseInt(e.target.value, 10) || 1)}
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
                                    Starts at
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

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-muted-foreground mb-1.5">
                                Location
                            </label>
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="Conference Room A"
                                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-muted-foreground mb-1.5">
                                Color
                            </label>
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="w-14 h-9 rounded border border-border bg-background cursor-pointer"
                            />
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                            <Bell className="w-4 h-4" />
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={notify}
                                    onChange={(e) => setNotify(e.target.checked)}
                                    className="w-4 h-4 rounded border-border"
                                />
                                Notify when event is due
                            </label>
                        </div>

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
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!title.trim() || isSaving}
                        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? (
                            <>Saving...</>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                {isEditing ? 'Update Event' : 'Create Event'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default EventEditor;
