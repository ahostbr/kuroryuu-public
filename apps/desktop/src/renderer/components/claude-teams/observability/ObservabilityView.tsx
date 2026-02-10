/**
 * ObservabilityView - Main view with sub-tabs and filter bar
 * Rendered inside ClaudeTeams when the Observability tab is active
 */
import { useEffect, useMemo } from 'react';
import {
  Activity,
  BarChart3,
  Wrench,
  Rows3,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useObservabilityStore } from '../../../stores/observability-store';
import { EventTimeline } from './EventTimeline';
import { PulseChart } from './PulseChart';
import { ToolAnalytics } from './ToolAnalytics';
import { AgentSwimLanes } from './AgentSwimLanes';
import { EventSearch } from './EventSearch';
import type { ObservabilitySubTab, ObservabilityTimeRange } from '../../../types/observability';

const SUB_TABS: { id: ObservabilitySubTab; label: string; icon: React.ElementType }[] = [
  { id: 'timeline', label: 'Timeline', icon: Activity },
  { id: 'pulse', label: 'Pulse', icon: BarChart3 },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'swimlanes', label: 'Swim Lanes', icon: Rows3 },
];

const TIME_RANGES: ObservabilityTimeRange[] = ['1m', '3m', '5m', '10m'];

export function ObservabilityView() {
  const connect = useObservabilityStore((s) => s.connect);
  const disconnect = useObservabilityStore((s) => s.disconnect);
  const isConnected = useObservabilityStore((s) => s.isConnected);
  const activeSubTab = useObservabilityStore((s) => s.activeSubTab);
  const setActiveSubTab = useObservabilityStore((s) => s.setActiveSubTab);
  const filters = useObservabilityStore((s) => s.filters);
  const setFilters = useObservabilityStore((s) => s.setFilters);
  const timeRange = useObservabilityStore((s) => s.timeRange);
  const setTimeRange = useObservabilityStore((s) => s.setTimeRange);
  const isPaused = useObservabilityStore((s) => s.isPaused);
  const togglePause = useObservabilityStore((s) => s.togglePause);
  const clearEvents = useObservabilityStore((s) => s.clearEvents);
  const loadRecentEvents = useObservabilityStore((s) => s.loadRecentEvents);
  const loadStats = useObservabilityStore((s) => s.loadStats);
  const events = useObservabilityStore((s) => s.events);
  const stats = useObservabilityStore((s) => s.stats);
  const activeSessions = useObservabilityStore((s) => s.activeSessions);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Periodically refresh stats
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadStats]);

  // Build filter option lists from active sessions
  const filterOptions = useMemo(() => {
    const sourceApps = new Set<string>();
    const sessionIds = new Set<string>();
    for (const [, info] of activeSessions) {
      sourceApps.add(info.sourceApp);
      sessionIds.add(info.sessionId);
    }
    return {
      sourceApps: Array.from(sourceApps),
      sessionIds: Array.from(sessionIds),
    };
  }, [activeSessions]);

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        {/* Connection indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className="text-xs text-muted-foreground">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <span className="text-border">|</span>

        {/* Session filter */}
        <select
          value={filters.sessionId}
          onChange={(e) => setFilters({ sessionId: e.target.value })}
          className="text-xs bg-secondary border border-border rounded px-1.5 py-1 text-foreground"
        >
          <option value="">All Sessions</option>
          {filterOptions.sessionIds.map((s) => (
            <option key={s} value={s}>{s.slice(0, 12)}...</option>
          ))}
        </select>

        {/* Source filter */}
        <select
          value={filters.sourceApp}
          onChange={(e) => setFilters({ sourceApp: e.target.value })}
          className="text-xs bg-secondary border border-border rounded px-1.5 py-1 text-foreground"
        >
          <option value="">All Sources</option>
          {filterOptions.sourceApps.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Time range */}
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as ObservabilityTimeRange)}
          className="text-xs bg-secondary border border-border rounded px-1.5 py-1 text-foreground"
        >
          {TIME_RANGES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {/* Search */}
        <div className="flex-1 min-w-[140px] max-w-[250px]">
          <EventSearch />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={togglePause}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => loadRecentEvents()}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={clearEvents}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Clear"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeSubTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}

        {/* Stats summary */}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>{events.length} events</span>
          {stats && (
            <>
              <span className="text-border">|</span>
              <span>{stats.events_per_minute}/min</span>
              <span className="text-border">|</span>
              <span>{stats.active_sessions} sessions</span>
            </>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {activeSubTab === 'timeline' && <EventTimeline />}
        {activeSubTab === 'pulse' && <PulseChart />}
        {activeSubTab === 'tools' && <ToolAnalytics />}
        {activeSubTab === 'swimlanes' && <AgentSwimLanes />}
      </div>
    </div>
  );
}
