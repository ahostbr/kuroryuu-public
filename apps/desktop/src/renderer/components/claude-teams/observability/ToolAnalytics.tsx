/**
 * ToolAnalytics - Tool usage breakdown with bar chart and table
 */
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useObservabilityStore, selectFilteredEvents } from '../../../stores/observability-store';
import { TOOL_EMOJIS } from '../../../types/observability';

export function ToolAnalytics() {
  const filteredEvents = useObservabilityStore(useShallow(selectFilteredEvents));
  const timeRange = useObservabilityStore((s) => s.timeRange);
  const setFilters = useObservabilityStore((s) => s.setFilters);
  const [sortMode, setSortMode] = useState<'count' | 'alpha'>('count');

  // Compute stats from filtered events
  const toolStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const event of filteredEvents) {
      if (event.tool_name) {
        counts[event.tool_name] = (counts[event.tool_name] || 0) + 1;
      }
    }
    return counts;
  }, [filteredEvents]);

  const eventTypeStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const event of filteredEvents) {
      counts[event.hook_event_type] = (counts[event.hook_event_type] || 0) + 1;
    }
    return counts;
  }, [filteredEvents]);

  const sortedTools = useMemo(() => {
    const entries = Object.entries(toolStats);
    if (sortMode === 'alpha') {
      return entries.sort(([a], [b]) => a.localeCompare(b)).slice(0, 20);
    }
    return entries.sort(([, a], [, b]) => b - a).slice(0, 20);
  }, [toolStats, sortMode]);

  const sortedEventTypes = useMemo(() => {
    const entries = Object.entries(eventTypeStats);
    if (sortMode === 'alpha') {
      return entries.sort(([a], [b]) => a.localeCompare(b));
    }
    return entries.sort(([, a], [, b]) => b - a);
  }, [eventTypeStats, sortMode]);

  const maxToolCount = sortedTools.length > 0 ? Math.max(...sortedTools.map(([, c]) => c)) : 1;
  const maxEventTypeCount = sortedEventTypes.length > 0 ? Math.max(...sortedEventTypes.map(([, c]) => c)) : 1;
  const totalToolCount = sortedTools.reduce((sum, [, count]) => sum + count, 0);

  if (sortedTools.length === 0 && sortedEventTypes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No tool data yet. Events will appear as hooks fire.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-6">
      {/* Sort toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSortMode(sortMode === 'count' ? 'alpha' : 'count')}
          className="px-2 py-1 rounded text-xs border border-border bg-card hover:bg-accent transition-colors"
        >
          Sort: {sortMode === 'count' ? 'By Count' : 'Alphabetical'}
        </button>
        <span className="text-xs text-muted-foreground">
          ({filteredEvents.length} events in {timeRange})
        </span>
      </div>

      {/* Tool Usage */}
      {sortedTools.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Tool Usage</h3>
          <div className="space-y-1.5">
            {sortedTools.map(([name, count]) => {
              const pct = (count / maxToolCount) * 100;
              const pctOfTotal = totalToolCount > 0 ? Math.round((count / totalToolCount) * 100) : 0;
              const emoji = TOOL_EMOJIS[name] || '\u{1F6E0}\uFE0F';
              return (
                <div
                  key={name}
                  className="flex items-center gap-2 cursor-pointer hover:bg-accent/30 rounded px-1 -mx-1 transition-colors"
                  onClick={() => setFilters({ toolName: name })}
                  title={`Click to filter by ${name}`}
                >
                  <span className="text-xs w-28 truncate text-foreground shrink-0">
                    {emoji} {name}
                  </span>
                  <div className="flex-1 bg-secondary rounded-full h-4 overflow-hidden relative">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] text-foreground/80 font-semibold">
                      {pctOfTotal}%
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Event Type Distribution */}
      {sortedEventTypes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Event Types</h3>
          <div className="space-y-1.5">
            {sortedEventTypes.map(([type, count]) => {
              const pct = (count / maxEventTypeCount) * 100;
              return (
                <div key={type} className="flex items-center gap-2">
                  <span className="text-xs w-36 truncate text-foreground shrink-0">{type}</span>
                  <div className="flex-1 bg-secondary rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full bg-primary/40 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
