/**
 * AgentSwimLanes - Side-by-side agent activity comparison
 * Shows events grouped by agent/session in horizontal lanes
 */
import { useMemo, useState, useCallback } from 'react';
import { Trash2, Download, ClipboardCheck, Copy } from 'lucide-react';
import { useObservabilityStore } from '../../../stores/observability-store';
import {
  HOOK_EVENT_EMOJIS,
  SESSION_COLORS,
} from '../../../types/observability';
import type { HookEvent } from '../../../types/observability';

function getSessionColor(sessionId: string): string {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
  }
  return SESSION_COLORS[Math.abs(hash) % SESSION_COLORS.length];
}

function getRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

interface LaneData {
  key: string;
  label: string;
  sessionId: string;
  agentId?: string;
  events: HookEvent[];
  color: string;
}

function LaneActions({ sessionId }: { sessionId: string }) {
  const deleteSessionEvents = useObservabilityStore((s) => s.deleteSessionEvents);
  const exportSessionEvents = useObservabilityStore((s) => s.exportSessionEvents);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const events = useObservabilityStore.getState().events.filter((e) => e.session_id === sessionId);
    navigator.clipboard.writeText(JSON.stringify(events, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [sessionId]);

  return (
    <div className="flex items-center gap-0.5 ml-auto">
      <button
        onClick={handleCopy}
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        title="Copy session events"
      >
        {copied
          ? <ClipboardCheck className="w-3 h-3 text-green-500" />
          : <Copy className="w-3 h-3" />}
      </button>
      <button
        onClick={() => exportSessionEvents(sessionId)}
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        title="Export session events"
      >
        <Download className="w-3 h-3" />
      </button>
      <button
        onClick={() => deleteSessionEvents(sessionId)}
        className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-secondary/60 transition-colors"
        title="Delete session events"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

export function AgentSwimLanes() {
  const events = useObservabilityStore((s) => s.events);
  const selectedAgentLanes = useObservabilityStore((s) => s.selectedAgentLanes);
  const toggleAgentLane = useObservabilityStore((s) => s.toggleAgentLane);
  const activeSessions = useObservabilityStore((s) => s.activeSessions);

  // Build lanes from sessions
  const lanes: LaneData[] = useMemo(() => {
    const laneMap = new Map<string, LaneData>();
    for (const event of events) {
      const key = event.agent_id || event.session_id;
      if (!laneMap.has(key)) {
        laneMap.set(key, {
          key,
          label: event.agent_id || event.session_id.slice(0, 8),
          sessionId: event.session_id,
          agentId: event.agent_id || undefined,
          events: [],
          color: getSessionColor(event.session_id),
        });
      }
      laneMap.get(key)!.events.push(event);
    }
    return Array.from(laneMap.values())
      .sort((a, b) => b.events.length - a.events.length)
      .slice(0, 10);
  }, [events]);

  // Filter to selected lanes (or show all if none selected)
  const visibleLanes = useMemo(() => {
    if (selectedAgentLanes.length === 0) return lanes;
    return lanes.filter((l) => selectedAgentLanes.includes(l.key));
  }, [lanes, selectedAgentLanes]);

  if (lanes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No agent sessions detected yet.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      {/* Lane selector */}
      <div className="flex flex-wrap gap-1.5">
        {lanes.map((lane) => {
          const isSelected = selectedAgentLanes.length === 0 || selectedAgentLanes.includes(lane.key);
          return (
            <button
              key={lane.key}
              onClick={() => toggleAgentLane(lane.key)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${lane.color}`} />
              {lane.label}
              <span className="opacity-60">({lane.events.length})</span>
            </button>
          );
        })}
      </div>

      {/* Swim lanes */}
      <div className="space-y-3">
        {visibleLanes.map((lane) => (
          <div key={lane.key} className="bg-card border border-border rounded-lg overflow-hidden">
            {/* Lane header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/30">
              <span className={`w-2.5 h-2.5 rounded-full ${lane.color}`} />
              <span className="text-xs font-semibold text-foreground">{lane.label}</span>
              <span className="text-xs text-muted-foreground">
                {lane.events.length} events
              </span>
              <LaneActions sessionId={lane.sessionId} />
            </div>

            {/* Lane events (horizontal scroll) */}
            <div className="flex gap-1 p-2 overflow-x-auto">
              {lane.events.slice(0, 50).map((event) => {
                const emoji = HOOK_EVENT_EMOJIS[event.hook_event_type] || '\u{2B55}';
                return (
                  <div
                    key={event.id}
                    className="flex flex-col items-center gap-0.5 px-1.5 py-1 bg-secondary/50 rounded shrink-0"
                    title={`${event.hook_event_type}${event.tool_name ? ` - ${event.tool_name}` : ''}`}
                  >
                    <span className="text-xs">{emoji}</span>
                    {event.tool_name && (
                      <span className="text-[9px] text-muted-foreground max-w-[60px] truncate">
                        {event.tool_name}
                      </span>
                    )}
                    <span className="text-[9px] text-muted-foreground">
                      {getRelativeTime(event.timestamp)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
