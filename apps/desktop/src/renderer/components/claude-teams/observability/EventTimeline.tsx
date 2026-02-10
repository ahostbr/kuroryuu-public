/**
 * EventTimeline - Scrollable event list with auto-scroll
 * Renders hook events as cards with emoji, tool name, session dot, and timestamp
 */
import { useEffect, useRef, useMemo } from 'react';
import { useObservabilityStore } from '../../../stores/observability-store';
import {
  HOOK_EVENT_EMOJIS,
  TOOL_EMOJIS,
  SESSION_COLORS,
} from '../../../types/observability';
import type { HookEvent } from '../../../types/observability';

function getRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function getSessionColor(sessionId: string): string {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
  }
  return SESSION_COLORS[Math.abs(hash) % SESSION_COLORS.length];
}

function truncatePayload(payload: Record<string, unknown>, maxLen = 120): string {
  const str = JSON.stringify(payload);
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

function EventRow({ event }: { event: HookEvent }) {
  const emoji = HOOK_EVENT_EMOJIS[event.hook_event_type] || '\u{2B55}';
  const toolEmoji = event.tool_name ? TOOL_EMOJIS[event.tool_name] || '\u{1F6E0}\uFE0F' : '';
  const sessionColor = getSessionColor(event.session_id);

  return (
    <div className="bg-card border border-border rounded-lg p-3 hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-2">
        {/* Session color dot */}
        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${sessionColor}`} />

        {/* Event info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm">{emoji}</span>
            <span className="text-xs font-semibold text-foreground">
              {event.hook_event_type}
            </span>
            {event.tool_name && (
              <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">
                {toolEmoji} {event.tool_name}
              </span>
            )}
            {event.agent_id && (
              <span className="px-1.5 py-0.5 bg-secondary text-muted-foreground rounded text-xs">
                {event.agent_id}
              </span>
            )}
            {event.model_name && (
              <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">
                {event.model_name}
              </span>
            )}
          </div>

          {/* Payload preview */}
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {truncatePayload(event.payload)}
          </p>
        </div>

        {/* Timestamp */}
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {getRelativeTime(event.timestamp)}
        </span>
      </div>
    </div>
  );
}

export function EventTimeline() {
  const events = useObservabilityStore((s) => s.events);
  const filters = useObservabilityStore((s) => s.filters);
  const searchQuery = useObservabilityStore((s) => s.searchQuery);
  const isPaused = useObservabilityStore((s) => s.isPaused);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScroll = useRef(true);

  // Filter events
  const filteredEvents = useMemo(() => {
    let result = events;
    if (filters.sourceApp) {
      result = result.filter((e) => e.source_app === filters.sourceApp);
    }
    if (filters.sessionId) {
      result = result.filter((e) => e.session_id === filters.sessionId);
    }
    if (filters.eventType) {
      result = result.filter((e) => e.hook_event_type === filters.eventType);
    }
    if (filters.toolName) {
      result = result.filter((e) => e.tool_name?.includes(filters.toolName));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      try {
        const regex = new RegExp(searchQuery, 'i');
        result = result.filter(
          (e) =>
            regex.test(e.hook_event_type) ||
            regex.test(e.tool_name || '') ||
            regex.test(JSON.stringify(e.payload))
        );
      } catch {
        result = result.filter(
          (e) =>
            e.hook_event_type.toLowerCase().includes(q) ||
            (e.tool_name || '').toLowerCase().includes(q) ||
            JSON.stringify(e.payload).toLowerCase().includes(q)
        );
      }
    }
    return result;
  }, [events, filters, searchQuery]);

  // Auto-scroll to top on new events
  useEffect(() => {
    if (isAutoScroll.current && scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = 0;
    }
  }, [filteredEvents.length, isPaused]);

  const handleScroll = () => {
    if (scrollRef.current) {
      isAutoScroll.current = scrollRef.current.scrollTop < 10;
    }
  };

  if (filteredEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No events yet. Enable observability hooks to start streaming.
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto space-y-1.5 p-2"
    >
      {filteredEvents.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  );
}
