/**
 * TeamsAnalyticsPanel - Collapsible analytics dashboard for Claude Teams.
 * Shows team summary metrics, per-agent stats, and bottleneck warnings.
 */
import { useState, useMemo } from 'react';
import {
  Zap,
  BarChart3,
  MessageSquare,
  Radio,
  Timer,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useClaudeTeamsStore } from '../../stores/claude-teams-store';

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function TeamsAnalyticsPanel() {
  const teamAnalytics = useClaudeTeamsStore((s) => s.teamAnalytics);
  const selectedTeam = useClaudeTeamsStore((s) => s.selectedTeam);
  const selectedTeamTasks = useClaudeTeamsStore((s) => s.selectedTeamTasks);
  const teammateHealth = useClaudeTeamsStore((s) => s.teammateHealth);
  const [collapsed, setCollapsed] = useState(false);

  // Per-agent data: non-lead members with health info
  const agentStats = useMemo(() => {
    if (!selectedTeam) return [];
    return selectedTeam.config.members
      .filter((m) => m.agentType !== 'team-lead')
      .map((m) => ({
        name: m.name,
        health: teammateHealth[m.name],
      }))
      .filter((a) => a.health);
  }, [selectedTeam, teammateHealth]);

  // Max values for proportional bars
  const maxUptime = useMemo(
    () => Math.max(1, ...agentStats.map((a) => a.health?.uptime ?? 0)),
    [agentStats]
  );
  const maxMessages = useMemo(
    () => Math.max(1, ...agentStats.map((a) => a.health?.messageCount ?? 0)),
    [agentStats]
  );

  // Bottleneck tasks
  const bottleneckTasks = useMemo(() => {
    if (!teamAnalytics || teamAnalytics.bottleneckTaskIds.length === 0) return [];
    return teamAnalytics.bottleneckTaskIds
      .map((id) => selectedTeamTasks.find((t) => t.id === id))
      .filter(Boolean);
  }, [teamAnalytics, selectedTeamTasks]);

  if (!teamAnalytics) return null;

  const summaryMetrics = [
    {
      icon: Zap,
      label: 'Velocity',
      value: `${teamAnalytics.velocity.toFixed(1)}/min`,
      color: 'text-cyan-400',
    },
    {
      icon: BarChart3,
      label: 'Completion',
      value: `${Math.round(teamAnalytics.completionPct)}%`,
      color: 'text-green-400',
    },
    {
      icon: MessageSquare,
      label: 'Messages',
      value: `${teamAnalytics.totalMessages}`,
      color: 'text-blue-400',
    },
    {
      icon: Radio,
      label: 'Msg Rate',
      value: `${teamAnalytics.messageRate.toFixed(1)}/min`,
      color: 'text-purple-400',
    },
    {
      icon: Timer,
      label: 'Avg Latency',
      value: formatLatency(teamAnalytics.avgResponseLatency),
      color: 'text-yellow-400',
    },
    {
      icon: Clock,
      label: 'Uptime',
      value: formatDuration(teamAnalytics.teamUptime),
      color: 'text-gray-300',
    },
  ];

  return (
    <div className="flex flex-col border border-white/10 rounded-lg bg-black/20 overflow-hidden">
      {/* Header */}
      <button
        className="flex items-center justify-between px-4 py-2.5 bg-white/5 hover:bg-white/[0.08] transition-colors w-full text-left"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-gray-200">Analytics</span>
          <span className="text-xs text-gray-500">
            {teamAnalytics.velocity.toFixed(1)} tasks/min | {Math.round(teamAnalytics.completionPct)}% done
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="p-3 overflow-y-auto space-y-4">
          {/* Team Summary - 6 metrics grid */}
          <div>
            <h3 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Team Summary</h3>
            <div className="grid grid-cols-3 gap-2">
              {summaryMetrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <div
                    key={metric.label}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/5"
                  >
                    <Icon className={`w-3.5 h-3.5 ${metric.color} flex-shrink-0`} />
                    <div className="min-w-0">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{metric.label}</div>
                      <div className={`text-sm font-semibold ${metric.color}`}>{metric.value}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per Agent */}
          {agentStats.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Per Agent</h3>
              <div className="space-y-2">
                {agentStats.map((agent) => {
                  const uptimePct = ((agent.health?.uptime ?? 0) / maxUptime) * 100;
                  const msgPct = ((agent.health?.messageCount ?? 0) / maxMessages) * 100;
                  return (
                    <div key={agent.name} className="px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                      <div className="text-xs font-medium text-gray-300 mb-1.5">{agent.name}</div>
                      <div className="space-y-1">
                        {/* Uptime bar */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500 w-14">Uptime</span>
                          <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-cyan-500 rounded-full transition-all"
                              style={{ width: `${uptimePct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 w-12 text-right">
                            {formatDuration(agent.health?.uptime ?? 0)}
                          </span>
                        </div>
                        {/* Messages bar */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500 w-14">Messages</span>
                          <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-cyan-500 rounded-full transition-all"
                              style={{ width: `${msgPct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 w-12 text-right">
                            {agent.health?.messageCount ?? 0}
                          </span>
                        </div>
                        {/* Avg response time */}
                        {agent.health?.avgResponseTime != null && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 w-14">Avg Resp</span>
                            <span className="text-[10px] text-gray-400">
                              {formatLatency(agent.health.avgResponseTime)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottlenecks */}
          {bottleneckTasks.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-amber-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Bottlenecks
              </h3>
              <div className="space-y-1.5">
                {bottleneckTasks.map((task) => {
                  if (!task) return null;
                  const blockerCount = task.blockedBy.length;
                  return (
                    <div
                      key={task.id}
                      className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-amber-300 truncate">
                          #{task.id}: {task.subject}
                        </div>
                        <div className="text-[10px] text-amber-400/70">
                          {blockerCount > 0
                            ? `Blocked by ${blockerCount} task${blockerCount !== 1 ? 's' : ''}`
                            : task.status === 'in_progress'
                              ? 'Long-running in-progress task'
                              : 'Potential bottleneck'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
