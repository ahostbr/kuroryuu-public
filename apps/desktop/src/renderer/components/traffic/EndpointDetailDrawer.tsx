/**
 * EndpointDetailDrawer - Slide-in panel showing endpoint statistics and recent requests
 * Displays ECharts sparklines and status donut, plus clickable request list
 */
import React, { useMemo } from 'react';
import { X, Activity, AlertTriangle, Clock, Zap } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { useTrafficStore } from '../../stores/traffic-store';
import type { TrafficEventDetail } from '../../types/traffic';

// Status code colors
const STATUS_COLORS: Record<string, string> = {
  '2xx': '#00ff00',
  '3xx': '#00ffff',
  '4xx': '#ffaa00',
  '5xx': '#ff0000',
};

// Theme-aware chart colors
const THEME_COLORS = {
  cyberpunk: { primary: '#00ffff', secondary: '#ff00ff', gradient: ['#00ffff', '#0066ff'] },
  kuroryuu: { primary: '#c9a227', secondary: '#8b1e1e', gradient: ['#c9a227', '#9a7b1a'] },
  retro: { primary: '#33ff00', secondary: '#ffb000', gradient: ['#33ff00', '#228b00'] },
  default: { primary: '#6366f1', secondary: '#8b5cf6', gradient: ['#6366f1', '#4f46e5'] },
};

// ECharts Latency Sparkline Component
function LatencyChart({
  latencyData,
  colors,
}: {
  latencyData: { index: number; latency: number; timestamp: string }[];
  colors: { primary: string; secondary: string; gradient: string[] };
}) {
  const option: EChartsOption = useMemo(
    () => ({
      grid: { top: 5, right: 5, bottom: 5, left: 5, containLabel: false },
      xAxis: {
        type: 'category',
        show: false,
        data: latencyData.map((_, i) => i),
        boundaryGap: false,
      },
      yAxis: { type: 'value', show: false },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0,0,0,0.9)',
        borderColor: colors.primary,
        borderWidth: 1,
        textStyle: { color: colors.primary, fontSize: 12 },
        formatter: (params: unknown) => {
          const p = params as { value: number }[];
          return `${p[0]?.value?.toFixed(1) ?? '—'}ms`;
        },
      },
      series: [
        {
          type: 'line',
          data: latencyData.map((d) => d.latency),
          smooth: true,
          showSymbol: false,
          lineStyle: { color: colors.primary, width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: colors.primary + 'cc' },
                { offset: 1, color: colors.primary + '1a' },
              ],
            },
          },
        },
      ],
    }),
    [latencyData, colors]
  );

  return (
    <div className="chart-section">
      <div className="chart-label text-xs opacity-60 mb-2">
        LATENCY (last {latencyData.length} requests)
      </div>
      <div className="chart-container h-16 rounded-lg overflow-hidden">
        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  );
}

// ECharts Status Donut Component
function StatusDonutChart({
  statusData,
}: {
  statusData: { name: string; value: number }[];
}) {
  const option: EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(0,0,0,0.9)',
        borderColor: '#333',
        borderWidth: 1,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number; percent: number };
          return `${p.name}: ${p.value} (${p.percent?.toFixed(1)}%)`;
        },
      },
      series: [
        {
          type: 'pie',
          radius: ['50%', '80%'],
          center: ['50%', '50%'],
          padAngle: 2,
          itemStyle: { borderRadius: 4 },
          label: { show: false },
          data: statusData.map((entry) => ({
            name: entry.name,
            value: entry.value,
            itemStyle: { color: STATUS_COLORS[entry.name] || '#666' },
          })),
        },
      ],
    }),
    [statusData]
  );

  return (
    <div className="chart-section">
      <div className="chart-label text-xs opacity-60 mb-2">STATUS BREAKDOWN</div>
      <div className="flex items-center gap-4">
        <div className="w-24 h-24">
          <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          {statusData.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: STATUS_COLORS[entry.name] }}
              />
              <span className="opacity-60">{entry.name}:</span>
              <span className="font-mono">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EndpointDetailDrawer() {
  const selectedEndpoint = useTrafficStore((s) => s.selectedEndpoint);
  const endpointData = useTrafficStore((s) => s.endpointData);
  const endpointEvents = useTrafficStore((s) => s.endpointEvents);
  const closeDrawer = useTrafficStore((s) => s.closeDrawer);
  const openInspector = useTrafficStore((s) => s.openInspector);
  const vizTheme = useTrafficStore((s) => s.vizTheme);

  const colors = THEME_COLORS[vizTheme] || THEME_COLORS.default;

  // Prepare latency chart data from recent events
  const latencyData = useMemo(() => {
    return endpointEvents
      .filter((e) => e.duration !== undefined)
      .slice(-50)
      .map((e, i) => ({
        index: i,
        latency: e.duration || 0,
        timestamp: e.timestamp,
      }));
  }, [endpointEvents]);

  // Prepare status breakdown for pie chart
  const statusData = useMemo(() => {
    if (!endpointData?.status_breakdown) return [];

    const groups: Record<string, number> = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    Object.entries(endpointData.status_breakdown).forEach(([status, count]) => {
      const statusNum = parseInt(status);
      if (statusNum >= 200 && statusNum < 300) groups['2xx'] += count;
      else if (statusNum >= 300 && statusNum < 400) groups['3xx'] += count;
      else if (statusNum >= 400 && statusNum < 500) groups['4xx'] += count;
      else if (statusNum >= 500) groups['5xx'] += count;
    });

    return Object.entries(groups)
      .filter(([, count]) => count > 0)
      .map(([name, value]) => ({ name, value }));
  }, [endpointData]);

  // Format timestamp for display
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Format bytes
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  // Get status color class
  const getStatusColorClass = (status?: number) => {
    if (!status) return 'text-gray-400';
    if (status >= 500) return 'text-red-500';
    if (status >= 400) return 'text-orange-400';
    if (status >= 300) return 'text-cyan-400';
    return 'text-green-400';
  };

  return (
    <div className="endpoint-drawer absolute right-0 top-0 h-full w-[400px] z-30 flex flex-col">
      {/* Header */}
      <div className="drawer-header flex items-center justify-between p-4 border-b">
        <div className="flex-1 min-w-0">
          <h2 className="drawer-title text-lg font-bold truncate">
            {selectedEndpoint || 'Endpoint'}
          </h2>
          {endpointData && (
            <span className="drawer-badge text-xs px-2 py-0.5 rounded">
              [{endpointData.category}]
            </span>
          )}
        </div>
        <button
          onClick={closeDrawer}
          className="drawer-close p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="drawer-content flex-1 overflow-y-auto p-4 space-y-6">
        {/* Stats Grid */}
        {endpointData && (
          <div className="stats-grid grid grid-cols-2 gap-4">
            <div className="stat-card p-3 rounded-lg">
              <div className="stat-label text-xs opacity-60 flex items-center gap-1">
                <Activity size={12} />
                REQUESTS
              </div>
              <div className="stat-value text-2xl font-bold">
                {endpointData.request_count}
              </div>
            </div>
            <div className="stat-card p-3 rounded-lg">
              <div className="stat-label text-xs opacity-60 flex items-center gap-1">
                <AlertTriangle size={12} />
                ERRORS
              </div>
              <div className="stat-value text-2xl font-bold">
                {(endpointData.error_rate * 100).toFixed(1)}%
              </div>
            </div>
            <div className="stat-card p-3 rounded-lg">
              <div className="stat-label text-xs opacity-60 flex items-center gap-1">
                <Clock size={12} />
                AVG LATENCY
              </div>
              <div className="stat-value text-2xl font-bold">
                {endpointData.avg_latency.toFixed(0)}ms
              </div>
            </div>
            <div className="stat-card p-3 rounded-lg">
              <div className="stat-label text-xs opacity-60 flex items-center gap-1">
                <Zap size={12} />
                P95 LATENCY
              </div>
              <div className="stat-value text-2xl font-bold">
                {endpointData.p95_latency.toFixed(0)}ms
              </div>
            </div>
          </div>
        )}

        {/* Latency Sparkline */}
        {latencyData.length > 0 && (
          <LatencyChart latencyData={latencyData} colors={colors} />
        )}

        {/* Status Breakdown Donut */}
        {statusData.length > 0 && (
          <StatusDonutChart statusData={statusData} />
        )}

        {/* Recent Requests */}
        <div className="requests-section">
          <div className="section-label text-xs opacity-60 mb-2">
            RECENT REQUESTS ({endpointEvents.length})
          </div>
          <div className="requests-list space-y-2 max-h-[300px] overflow-y-auto">
            {endpointEvents.length === 0 ? (
              <div className="text-center text-sm opacity-40 py-4">No requests yet</div>
            ) : (
              endpointEvents.slice(0, 50).map((event) => (
                <button
                  key={event.id}
                  onClick={() => openInspector(event.id)}
                  className="request-item w-full text-left p-3 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="method-badge text-xs font-mono px-1.5 py-0.5 rounded">
                        {event.method}
                      </span>
                      <span className={`status font-mono ${getStatusColorClass(event.status)}`}>
                        {event.status}
                      </span>
                    </div>
                    <span className="timestamp text-xs opacity-40">
                      {formatTime(event.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs opacity-60">
                    <span>{event.duration?.toFixed(0) || '—'}ms</span>
                    <span>{formatBytes(event.response_body_size || 0)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Loading Overlay */}
      {!endpointData && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="loading-spinner w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
