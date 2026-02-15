/**
 * EventTimeline - Scrollable event list with auto-scroll
 * Renders hook events as cards with emoji, tool name, session dot, and timestamp
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Copy, ClipboardCheck } from 'lucide-react';
import { useObservabilityStore, selectFilteredEvents } from '../../../stores/observability-store';
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

function EventRow({ event, tick }: { event: HookEvent; tick: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const emoji = HOOK_EVENT_EMOJIS[event.hook_event_type] || '\u{2B55}';
  const toolEmoji = event.tool_name ? TOOL_EMOJIS[event.tool_name] || '\u{1F6E0}\uFE0F' : '';
  const sessionColor = getSessionColor(event.session_id);

  const copyPayload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(event.payload, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 1500);
  }, [event.payload]);

  const copyFull = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(event, null, 2));
    setCopiedFull(true);
    setTimeout(() => setCopiedFull(false), 1500);
  }, [event]);

  // Use tick to keep relative time fresh
  void tick;

  return (
    <div
      className={`bg-card border rounded-lg transition-colors cursor-pointer ${
        expanded ? 'border-primary/40' : 'border-border hover:border-primary/30'
      }`}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-2 p-3">
        {/* Expand chevron */}
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />
          }
        </span>

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

          {/* Payload preview (collapsed) */}
          {!expanded && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {truncatePayload(event.payload)}
            </p>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {getRelativeTime(event.timestamp)}
        </span>
      </div>

      {/* Expanded payload */}
      {expanded && (
        <div className="border-t border-border px-3 py-2 bg-secondary/30">
          <div className="relative">
            <div className="absolute top-1 right-1 flex items-center gap-1">
              <button
                onClick={copyPayload}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Copy payload"
              >
                {copiedPayload
                  ? <ClipboardCheck className="w-3.5 h-3.5 text-green-500" />
                  : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={copyFull}
                className="px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border"
                title="Copy full event"
              >
                {copiedFull ? 'Copied!' : 'Copy All'}
              </button>
            </div>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all font-mono leading-relaxed max-h-64 overflow-y-auto pr-20">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/60">
            <span>ID: {event.id}</span>
            <span>Session: {event.session_id}</span>
            <span>{new Date(event.timestamp).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function EventTimeline() {
  const filteredEvents = useObservabilityStore(selectFilteredEvents);
  const isPaused = useObservabilityStore((s) => s.isPaused);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScroll = useRef(true);
  const [tick, setTick] = useState(0);

  // Live relative timestamps — tick every 10s
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

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
        <EventRow key={event.id} event={event} tick={tick} />
      ))}
    </div>
  );
}
