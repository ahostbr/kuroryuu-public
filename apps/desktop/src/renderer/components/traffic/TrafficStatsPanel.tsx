/**
 * TrafficStatsPanel - Real-time statistics display
 * Shows req/sec, latency, error rate, and total requests
 */
import React from 'react';
import type { TrafficStats } from '../../types/traffic';

interface Props {
  stats: TrafficStats;
}

export function TrafficStatsPanel({ stats }: Props) {
  return (
    <div className="cyberpunk-panel">
      <div className="panel-header">SYSTEM STATUS</div>
      <div className="panel-content">
        {/* Requests per second */}
        <div className="stat-row">
          <span className="stat-label">REQ/SEC</span>
          <span className="stat-value neon-cyan">{stats.requestsPerSecond.toFixed(1)}</span>
        </div>

        {/* Average latency */}
        <div className="stat-row">
          <span className="stat-label">LATENCY</span>
          <span className="stat-value neon-yellow">{Math.round(stats.avgLatency)}ms</span>
        </div>

        {/* Error rate */}
        <div className="stat-row">
          <span className="stat-label">ERROR RATE</span>
          <span className="stat-value neon-red">{(stats.errorRate * 100).toFixed(1)}%</span>
        </div>

        {/* Total requests */}
        <div className="stat-row">
          <span className="stat-label">TOTAL</span>
          <span className="stat-value neon-green">{stats.totalRequests}</span>
        </div>
      </div>
    </div>
  );
}
