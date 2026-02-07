/**
 * Calendar View Component
 * 
 * Month-view calendar grid showing scheduled jobs on their run dates.
 */

import React, { useState, useMemo } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon,
    Plus,
    Clock,
} from 'lucide-react';
import type { ScheduledJob, ScheduledEvent } from '../../types/scheduler';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface CalendarViewProps {
    jobs: ScheduledJob[];
    events: ScheduledEvent[];
    onDayClick?: (date: Date) => void;
    onJobClick?: (job: ScheduledJob) => void;
    onEventClick?: (event: ScheduledEvent) => void;
    onCreateJob?: (date: Date) => void;
    onCreateEvent?: (date: Date) => void;
}

interface CalendarDay {
    date: Date;
    isCurrentMonth: boolean;
    isToday: boolean;
    jobs: ScheduledJob[];
    events: ScheduledEvent[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function getMonthDays(
    year: number,
    month: number,
    jobs: ScheduledJob[],
    events: ScheduledEvent[]
): CalendarDay[] {
    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // First day of the month
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay();

    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();

    // Previous month days to fill the first week
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const date = new Date(year, month - 1, prevMonthLastDay - i);
        days.push({
            date,
            isCurrentMonth: false,
            isToday: false,
            jobs: getJobsForDate(date, jobs),
            events: getEventsForDate(date, events),
        });
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
        const date = new Date(year, month, day);
        date.setHours(0, 0, 0, 0);
        days.push({
            date,
            isCurrentMonth: true,
            isToday: date.getTime() === today.getTime(),
            jobs: getJobsForDate(date, jobs),
            events: getEventsForDate(date, events),
        });
    }

    // Next month days to complete the grid (6 rows = 42 cells)
    const remaining = 42 - days.length;
    for (let day = 1; day <= remaining; day++) {
        const date = new Date(year, month + 1, day);
        days.push({
            date,
            isCurrentMonth: false,
            isToday: false,
            jobs: getJobsForDate(date, jobs),
            events: getEventsForDate(date, events),
        });
    }

    return days;
}

function getJobsForDate(date: Date, jobs: ScheduledJob[]): ScheduledJob[] {
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);

    return jobs.filter(job => {
        if (!job.nextRun) return false;
        const jobDate = new Date(job.nextRun);
        return jobDate >= dateStart && jobDate <= dateEnd;
    });
}

function getEventsForDate(date: Date, events: ScheduledEvent[]): ScheduledEvent[] {
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);

    return events.filter((event) => {
        if (!event.nextRun) return false;
        const eventDate = new Date(event.nextRun);
        return eventDate >= dateStart && eventDate <= dateEnd;
    });
}

function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export function CalendarView({
    jobs,
    events,
    onDayClick,
    onJobClick,
    onEventClick,
    onCreateJob,
    onCreateEvent,
}: CalendarViewProps) {
    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const calendarDays = useMemo(
        () => getMonthDays(year, month, jobs, events),
        [year, month, jobs, events]
    );

    const goToPrevMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    const handleDayClick = (day: CalendarDay) => {
        setSelectedDate(day.date);
        onDayClick?.(day.date);
    };

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">
                        {MONTH_NAMES[month]} {year}
                    </h2>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={goToToday}
                        className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-secondary transition-colors"
                    >
                        Today
                    </button>
                    <button
                        onClick={goToPrevMonth}
                        className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={goToNextMonth}
                        className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 border-b border-border">
                {DAYS_OF_WEEK.map((day) => (
                    <div
                        key={day}
                        className="py-2 text-center text-sm font-medium text-muted-foreground"
                    >
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 grid grid-cols-7 grid-rows-6">
                {calendarDays.map((day, idx) => {
                    const isSelected = selectedDate &&
                        day.date.getTime() === selectedDate.getTime();

                    return (
                        <div
                            key={idx}
                            onClick={() => handleDayClick(day)}
                            className={`
                                relative border-b border-r border-border p-1 min-h-[80px] cursor-pointer
                                transition-colors hover:bg-secondary/50
                                ${!day.isCurrentMonth ? 'bg-secondary/30' : ''}
                                ${day.isToday ? 'bg-primary/10' : ''}
                                ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}
                            `}
                        >
                            {/* Day Number */}
                            <div className={`
                                w-7 h-7 flex items-center justify-center rounded-full text-sm
                                ${day.isToday ? 'bg-primary text-primary-foreground font-bold' : ''}
                                ${!day.isCurrentMonth ? 'text-muted-foreground/50' : 'text-foreground'}
                            `}>
                                {day.date.getDate()}
                            </div>

                            {/* Jobs + events for this day */}
                            <div className="mt-1 space-y-0.5 overflow-hidden">
                                {[...day.jobs.map((job) => ({
                                    key: `job-${job.id}`,
                                    time: job.nextRun ?? Number.MAX_SAFE_INTEGER,
                                    kind: 'job' as const,
                                    label: job.name,
                                    title: `${job.name} - ${formatTime(job.nextRun ?? Date.now())}`,
                                    className: job.status === 'running'
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : job.status === 'paused'
                                            ? 'bg-yellow-500/20 text-yellow-400'
                                            : 'bg-primary/20 text-primary',
                                    onClick: (e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        onJobClick?.(job);
                                    },
                                })), ...day.events.map((event) => ({
                                    key: `event-${event.id}`,
                                    time: event.nextRun ?? Number.MAX_SAFE_INTEGER,
                                    kind: 'event' as const,
                                    label: event.title,
                                    title: `${event.title} - ${formatTime(event.nextRun ?? Date.now())}`,
                                    className: 'bg-emerald-500/20 text-emerald-300',
                                    onClick: (e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        onEventClick?.(event);
                                    },
                                }))].sort((a, b) => a.time - b.time).slice(0, 3).map((item) => (
                                    <div
                                        key={item.key}
                                        onClick={item.onClick}
                                        className={`
                                            text-xs px-1.5 py-0.5 rounded truncate cursor-pointer
                                            ${item.className}
                                            hover:opacity-80 transition-opacity
                                        `}
                                        title={item.title}
                                    >
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3 flex-shrink-0" />
                                            <span className="truncate">{item.label}</span>
                                        </span>
                                    </div>
                                ))}
                                {(day.jobs.length + day.events.length) > 3 && (
                                    <div className="text-xs text-muted-foreground px-1.5">
                                        +{day.jobs.length + day.events.length - 3} more
                                    </div>
                                )}
                            </div>

                            {/* Add event button (shown on hover for current month) */}
                            {day.isCurrentMonth && (onCreateEvent || onCreateJob) && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onCreateEvent) {
                                            onCreateEvent(day.date);
                                        } else if (onCreateJob) {
                                            onCreateJob(day.date);
                                        }
                                    }}
                                    className="absolute bottom-1 right-1 p-0.5 rounded opacity-0 hover:opacity-100 
                                               group-hover:opacity-50 hover:bg-secondary transition-opacity"
                                    title="Add event"
                                >
                                    <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default CalendarView;
