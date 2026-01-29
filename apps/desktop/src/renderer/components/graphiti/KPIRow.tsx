/**
 * KPIRow - Dashboard row with 5 key performance indicators
 * Metrics:
 * 1. Requests/sec - Traffic throughput
 * 2. Avg Latency - Response time
 * 3. Error Rate - Failure percentage
 * 4. Active Agents - Live agent count
 * 5. Active Tasks - In-progress task count
 */
import React, { useMemo } from 'react';
import { KPICard, KPITrend, KPIStatus } from './KPICard';
import {
  useGraphitiMetrics,
  useGraphitiMetricsHistory,
} from '../../stores/graphiti-store';
import type { GraphitiMetricsSnapshot } from '../../types/graphiti-event';

/**
 * Extract sparkline data for a specific metric from history
 */
function extractSparklineData(
  history: GraphitiMetricsSnapshot[],
  metricKey: keyof GraphitiMetricsSnapshot['metrics'],
  maxPoints: number = 60
): number[] {
  const data = history
    .slice(-maxPoints)
    .map((h) => h.metrics[metricKey] ?? 0);
  return data;
}

/**
 * Calculate trend from historical data
 */
function calculateTrend(data: number[]): { trend: KPITrend; change: number } {
  if (data.length < 2) {
    return { trend: 'flat', change: 0 };
  }

  // Compare last value to average of previous values
  const lastValue = data[data.length - 1];
  const prevAvg = data.slice(0, -1).reduce((a, b) => a + b, 0) / (data.length - 1);

  if (prevAvg === 0) {
    return lastValue > 0 ? { trend: 'up', change: 100 } : { trend: 'flat', change: 0 };
  }

  const change = ((lastValue - prevAvg) / prevAvg) * 100;
  const threshold = 5; // 5% change threshold

  if (change > threshold) {
    return { trend: 'up', change };
  } else if (change < -threshold) {
    return { trend: 'down', change };
  }
  return { trend: 'flat', change };
}

/**
 * Determine health status for latency
 */
function getLatencyStatus(latency: number): KPIStatus {
  if (latency > 500) return 'error';
  if (latency > 100) return 'warning';
  return 'normal';
}

/**
 * Determine health status for error rate
 */
function getErrorRateStatus(errorRate: number): KPIStatus {
  if (errorRate > 0.05) return 'error'; // > 5%
  if (errorRate > 0.01) return 'warning'; // > 1%
  return 'normal';
}

/**
 * Determine health status for agent count
 */
function getAgentStatus(count: number): KPIStatus {
  if (count === 0) return 'error';
  return 'normal';
}

/**
 * Format latency value
 */
function formatLatency(ms: number): string {
  if (ms < 1) return '<1';
  if (ms >= 1000) return (ms / 1000).toFixed(1);
  if (ms >= 100) return Math.round(ms).toString();
  return ms.toFixed(1);
}

/**
 * Format error rate as percentage
 */
function formatErrorRate(rate: number): string {
  const percent = rate * 100;
  if (percent < 0.01) return '0.00';
  if (percent < 1) return percent.toFixed(2);
  if (percent < 10) return percent.toFixed(1);
  return Math.round(percent).toString();
}

interface KPIRowProps {
  className?: string;
}

export function KPIRow({ className = '' }: KPIRowProps) {
  const metrics = useGraphitiMetrics();
  const metricsHistory = useGraphitiMetricsHistory();

  // Extract sparkline data for each metric
  const reqSecHistory = useMemo(
    () => extractSparklineData(metricsHistory, 'requestsPerSecond'),
    [metricsHistory]
  );
  const latencyHistory = useMemo(
    () => extractSparklineData(metricsHistory, 'avgLatency'),
    [metricsHistory]
  );
  const errorRateHistory = useMemo(
    () => extractSparklineData(metricsHistory, 'errorRate'),
    [metricsHistory]
  );
  const agentsHistory = useMemo(
    () => extractSparklineData(metricsHistory, 'activeAgents'),
    [metricsHistory]
  );
  const tasksHistory = useMemo(
    () => extractSparklineData(metricsHistory, 'activeTasks'),
    [metricsHistory]
  );

  // Calculate trends
  const reqSecTrend = useMemo(() => calculateTrend(reqSecHistory), [reqSecHistory]);
  const latencyTrend = useMemo(() => calculateTrend(latencyHistory), [latencyHistory]);
  const errorRateTrend = useMemo(() => calculateTrend(errorRateHistory), [errorRateHistory]);
  const agentsTrend = useMemo(() => calculateTrend(agentsHistory), [agentsHistory]);
  const tasksTrend = useMemo(() => calculateTrend(tasksHistory), [tasksHistory]);

  return (
    <div className={`graphiti-kpi-row ${className}`}>
      {/* 1. Requests/sec */}
      <KPICard
        label="REQ/SEC"
        value={metrics.requestsPerSecond}
        history={reqSecHistory}
        trend={reqSecTrend.trend}
        trendValue={reqSecTrend.change}
        status={metrics.requestsPerSecond === 0 ? 'warning' : 'normal'}
      />

      {/* 2. Average Latency */}
      <KPICard
        label="AVG LATENCY"
        value={metrics.avgLatency}
        unit={metrics.avgLatency >= 1000 ? 's' : 'ms'}
        history={latencyHistory}
        trend={latencyTrend.trend}
        trendValue={latencyTrend.change}
        status={getLatencyStatus(metrics.avgLatency)}
        formatValue={formatLatency}
      />

      {/* 3. Error Rate */}
      <KPICard
        label="ERROR RATE"
        value={metrics.errorRate}
        unit="%"
        history={errorRateHistory}
        trend={errorRateTrend.trend}
        trendValue={errorRateTrend.change}
        status={getErrorRateStatus(metrics.errorRate)}
        formatValue={formatErrorRate}
      />

      {/* 4. Active Agents */}
      <KPICard
        label="AGENTS"
        value={metrics.activeAgents}
        unit="live"
        history={agentsHistory}
        trend={agentsTrend.trend}
        trendValue={agentsTrend.change}
        status={getAgentStatus(metrics.activeAgents)}
      />

      {/* 5. Active Tasks */}
      <KPICard
        label="TASKS"
        value={metrics.activeTasks}
        unit="active"
        history={tasksHistory}
        trend={tasksTrend.trend}
        trendValue={tasksTrend.change}
        status="normal"
      />
    </div>
  );
}

export default KPIRow;
