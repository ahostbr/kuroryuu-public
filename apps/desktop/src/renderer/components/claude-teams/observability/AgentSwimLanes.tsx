/**
 * AgentSwimLanes - Side-by-side agent activity comparison
 * Shows events grouped by agent/session in horizontal lanes with SVG time axis
 */
import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Trash2, Download, ClipboardCheck, Copy } from 'lucide-react';
import { useObservabilityStore } from '../../../stores/observability-store';
import {
  HOOK_EVENT_EMOJIS,
  SESSION_COLORS,
} from '../../../types/observability';
import type { HookEvent } from '../../../types/observability';

// Event type colors for markers
const EVENT_TYPE_COLORS: Record<string, string> = {
  Stop: '#ef4444',
  PostToolUse: '#3b82f6',
  UserPromptSubmit: '#10b981',
  SubagentStop: '#f59e0b',
  Notification: '#8b5cf6',
  SessionStart: '#06b6d4',
  SessionEnd: '#ec4899',
  SubagentStart: '#14b8a6',
  PreCompact: '#64748b',
  PermissionRequest: '#f97316',
  PostToolUseFailure: '#dc2626',
  PreToolUse: '#6366f1',
};

function getSessionColor(sessionId: string): string {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
  }
  return SESSION_COLORS[Math.abs(hash) % SESSION_COLORS.length];
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

interface LaneData {
  key: string;
  label: string;
  sessionId: string;
  agentId?: string;
  events: HookEvent[];
  color: string;
  minTs: number;
  maxTs: number;
}

interface TooltipData {
  event: HookEvent;
  x: number;
  y: number;
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
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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
          minTs: event.timestamp,
          maxTs: event.timestamp,
        });
      }
      const lane = laneMap.get(key)!;
      lane.events.push(event);
      lane.minTs = Math.min(lane.minTs, event.timestamp);
      lane.maxTs = Math.max(lane.maxTs, event.timestamp);
    }
    return Array.from(laneMap.values())
      .sort((a, b) => b.events.length - a.events.length);
  }, [events]);

  // Filter to selected lanes (or show all if none selected)
  const visibleLanes = useMemo(() => {
    if (selectedAgentLanes.length === 0) return lanes;
    return lanes.filter((l) => selectedAgentLanes.includes(l.key));
  }, [lanes, selectedAgentLanes]);

  // Compute global time range across all visible lanes
  const { minTs, maxTs, duration } = useMemo(() => {
    if (visibleLanes.length === 0) return { minTs: 0, maxTs: 0, duration: 0 };
    const min = Math.min(...visibleLanes.map((l) => l.minTs));
    const max = Math.max(...visibleLanes.map((l) => l.maxTs));
    return { minTs: min, maxTs: max, duration: max - min };
  }, [visibleLanes]);

  // Hide tooltip when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (svgRef.current && !svgRef.current.contains(e.target as Node)) {
        setTooltip(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  if (lanes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No agent sessions detected yet.
      </div>
    );
  }

  // SVG layout constants
  const LANE_HEIGHT = 60;
  const MARGIN_LEFT = 150;
  const MARGIN_RIGHT = 50;
  const MARGIN_TOP = 30;
  const MARGIN_BOTTOM = 40;
  const CHART_WIDTH = 1000;
  const CHART_HEIGHT = visibleLanes.length * LANE_HEIGHT + MARGIN_TOP + MARGIN_BOTTOM;

  return (
    <div className="h-full overflow-auto p-3 space-y-4">
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

      {visibleLanes.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          No lanes selected.
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            className="bg-card border border-border rounded-lg"
          >
            {/* Time axis grid lines */}
            {duration > 0 && [0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const x = MARGIN_LEFT + frac * (CHART_WIDTH - MARGIN_LEFT - MARGIN_RIGHT);
              const ts = minTs + frac * duration;
              return (
                <g key={frac}>
                  <line
                    x1={x}
                    y1={MARGIN_TOP}
                    x2={x}
                    y2={CHART_HEIGHT - MARGIN_BOTTOM}
                    stroke="hsl(var(--border))"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                  />
                  <text
                    x={x}
                    y={CHART_HEIGHT - 10}
                    textAnchor="middle"
                    fill="hsl(var(--muted-foreground))"
                    fontSize="10"
                  >
                    {formatTimestamp(ts)}
                  </text>
                </g>
              );
            })}

            {/* Lane rows */}
            {visibleLanes.map((lane, laneIdx) => {
              const laneY = MARGIN_TOP + laneIdx * LANE_HEIGHT + LANE_HEIGHT / 2;

              return (
                <g key={lane.key}>
                  {/* Lane background */}
                  <rect
                    x={0}
                    y={MARGIN_TOP + laneIdx * LANE_HEIGHT}
                    width={CHART_WIDTH}
                    height={LANE_HEIGHT}
                    fill={laneIdx % 2 === 0 ? 'hsl(var(--secondary) / 0.3)' : 'transparent'}
                  />

                  {/* Lane label */}
                  <text
                    x={10}
                    y={laneY}
                    dominantBaseline="middle"
                    fill="hsl(var(--foreground))"
                    fontSize="12"
                    fontWeight="600"
                  >
                    {lane.label}
                  </text>
                  <text
                    x={10}
                    y={laneY + 12}
                    dominantBaseline="middle"
                    fill="hsl(var(--muted-foreground))"
                    fontSize="9"
                  >
                    {lane.events.length} events • {formatDuration(lane.maxTs - lane.minTs)}
                  </text>

                  {/* Lane actions */}
                  <foreignObject
                    x={CHART_WIDTH - 100}
                    y={MARGIN_TOP + laneIdx * LANE_HEIGHT + 15}
                    width={90}
                    height={30}
                  >
                    <LaneActions sessionId={lane.sessionId} />
                  </foreignObject>

                  {/* Event markers */}
                  {lane.events.map((event) => {
                    const x = duration > 0
                      ? MARGIN_LEFT + ((event.timestamp - minTs) / duration) * (CHART_WIDTH - MARGIN_LEFT - MARGIN_RIGHT)
                      : MARGIN_LEFT;

                    const color = EVENT_TYPE_COLORS[event.hook_event_type] || '#94a3b8';
                    const isFailure = event.hook_event_type.includes('Failure');
                    const radius = isFailure ? 6 : 4;

                    return (
                      <circle
                        key={event.id}
                        cx={x}
                        cy={laneY}
                        r={radius}
                        fill={color}
                        stroke="hsl(var(--background))"
                        strokeWidth="1"
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltip({
                            event,
                            x: rect.left + rect.width / 2,
                            y: rect.top - 10,
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })}
                </g>
              );
            })}

            {/* X-axis label */}
            <text
              x={CHART_WIDTH / 2}
              y={CHART_HEIGHT - 5}
              textAnchor="middle"
              fill="hsl(var(--muted-foreground))"
              fontSize="10"
              fontStyle="italic"
            >
              Timeline ({duration > 0 ? formatDuration(duration) : '0s'} total)
            </text>
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg px-3 py-2 max-w-xs pointer-events-none"
              style={{
                left: `${tooltip.x}px`,
                top: `${tooltip.y}px`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="text-xs font-semibold text-foreground mb-1">
                {HOOK_EVENT_EMOJIS[tooltip.event.hook_event_type]} {tooltip.event.hook_event_type}
              </div>
              {tooltip.event.tool_name && (
                <div className="text-xs text-muted-foreground">
                  Tool: {tooltip.event.tool_name}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {formatTimestamp(tooltip.event.timestamp)}
              </div>
              {tooltip.event.agent_id && (
                <div className="text-xs text-muted-foreground">
                  Agent: {tooltip.event.agent_id}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
