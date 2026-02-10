/**
 * ToolAnalytics - Tool usage breakdown with bar chart and table
 */
import { useMemo } from 'react';
import { useObservabilityStore } from '../../../stores/observability-store';
import { TOOL_EMOJIS } from '../../../types/observability';

export function ToolAnalytics() {
  const toolStats = useObservabilityStore((s) => s.toolStats);
  const eventTypeStats = useObservabilityStore((s) => s.eventTypeStats);

  const sortedTools = useMemo(() => {
    return Object.entries(toolStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20);
  }, [toolStats]);

  const sortedEventTypes = useMemo(() => {
    return Object.entries(eventTypeStats)
      .sort(([, a], [, b]) => b - a);
  }, [eventTypeStats]);

  const maxToolCount = sortedTools.length > 0 ? sortedTools[0][1] : 1;
  const maxEventTypeCount = sortedEventTypes.length > 0 ? sortedEventTypes[0][1] : 1;

  if (sortedTools.length === 0 && sortedEventTypes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No tool data yet. Events will appear as hooks fire.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-6">
      {/* Tool Usage */}
      {sortedTools.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Tool Usage</h3>
          <div className="space-y-1.5">
            {sortedTools.map(([name, count]) => {
              const pct = (count / maxToolCount) * 100;
              const emoji = TOOL_EMOJIS[name] || '\u{1F6E0}\uFE0F';
              return (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-xs w-28 truncate text-foreground shrink-0">
                    {emoji} {name}
                  </span>
                  <div className="flex-1 bg-secondary rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-all duration-300"
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
