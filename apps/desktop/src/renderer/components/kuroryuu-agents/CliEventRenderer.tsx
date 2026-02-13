/**
 * CliEventRenderer - Renders observability events for CLI agent sessions.
 * Bridges CLI sessions to the hook event telemetry system via sdkSessionId.
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, Copy, ClipboardCheck, Loader2 } from 'lucide-react';
import { useObservabilityStore } from '../../stores/observability-store';
import { HOOK_EVENT_EMOJIS, TOOL_EMOJIS } from '../../types/observability';
import type { HookEvent } from '../../types/observability';

interface CliEventRendererProps {
  sessionId?: string;    // sdkSessionId (Claude Code's session_id) — direct match
  cliSessionId: string;  // cli-xxx ID — matches payload.kuroryuu_session_id from hooks
}

function getRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function truncatePayload(payload: Record<string, unknown>, maxLen = 150): string {
  const str = JSON.stringify(payload);
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

function EventCard({ event, tick }: { event: HookEvent; tick: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const emoji = HOOK_EVENT_EMOJIS[event.hook_event_type] || '\u{2B55}';
  const toolEmoji = event.tool_name ? TOOL_EMOJIS[event.tool_name] || '\u{1F6E0}\uFE0F' : '';

  void tick; // refresh relative times

  const copyPayload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(event.payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [event.payload]);

  return (
    <div
      className={`bg-card border rounded-lg transition-colors cursor-pointer ${
        expanded ? 'border-primary/40' : 'border-border hover:border-primary/30'
      }`}
      onClick={() => setExpanded(v => !v)}
    >
      <div className="flex items-start gap-2 p-2.5">
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />
          }
        </span>

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
            {event.model_name && (
              <span className="px-1.5 py-0.5 bg-secondary text-muted-foreground rounded text-xs">
                {event.model_name}
              </span>
            )}
          </div>

          {!expanded && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {truncatePayload(event.payload)}
            </p>
          )}
        </div>

        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {getRelativeTime(event.timestamp)}
        </span>
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-2 bg-secondary/30">
          <div className="relative">
            <button
              onClick={copyPayload}
              className="absolute top-1 right-1 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Copy payload"
            >
              {copied
                ? <ClipboardCheck className="w-3.5 h-3.5 text-green-500" />
                : <Copy className="w-3.5 h-3.5" />}
            </button>
            <pre className="text-xs font-mono overflow-auto max-h-60 whitespace-pre-wrap pr-8">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function CliEventRenderer({ sessionId, cliSessionId }: CliEventRendererProps) {
  const events = useObservabilityStore((s) => s.events);
  const isConnected = useObservabilityStore((s) => s.isConnected);
  const connect = useObservabilityStore((s) => s.connect);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);

  // Ensure observability WebSocket is connected
  useEffect(() => {
    if (!isConnected) {
      connect();
    }
  }, [isConnected, connect]);

  // Refresh relative timestamps every 10s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  // Discover the Claude Code session_id (for display + filtering).
  // Direct sdkSessionId if available, otherwise scan payload.kuroryuu_session_id bridge.
  const resolvedSessionId = useMemo(() => {
    if (sessionId) return sessionId;
    return events.find(
      e => (e.payload as Record<string, unknown>)?.kuroryuu_session_id === cliSessionId
    )?.session_id ?? null;
  }, [events, sessionId, cliSessionId]);

  // Filter events for this session
  const sessionEvents = useMemo(() => {
    if (!resolvedSessionId) return [];
    return events.filter(e => e.session_id === resolvedSessionId);
  }, [events, resolvedSessionId]);

  // Auto-scroll on new events
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [sessionEvents.length]);

  if (sessionEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {isConnected ? 'Waiting for events...' : 'Connecting to observability...'}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-auto p-3 space-y-2">
      <div className="text-xs text-muted-foreground mb-2">
        {sessionEvents.length} event{sessionEvents.length !== 1 ? 's' : ''} · {resolvedSessionId ? resolvedSessionId.slice(0, 8) : cliSessionId}
      </div>
      {sessionEvents.map((event) => (
        <EventCard key={event.id} event={event} tick={tick} />
      ))}
    </div>
  );
}
