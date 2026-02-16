/**
 * PulseChart - Canvas-based real-time bar chart showing events per second
 * Reads theme colors at render time via CSS custom properties
 */
import { useEffect, useRef, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useObservabilityStore, selectFilteredEvents } from '../../../stores/observability-store';
import type { ObservabilityTimeRange } from '../../../types/observability';

const TIME_RANGE_SECONDS: Record<ObservabilityTimeRange, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '10m': 600,
  '30m': 1800,
  '1h': 3600,
  '6h': 21600,
  '24h': 86400,
};

// Adaptive bucket sizes: keeps chart readable at any zoom level
function getBucketSizeMs(timeRange: ObservabilityTimeRange): number {
  const secs = TIME_RANGE_SECONDS[timeRange];
  if (secs > 21600) return 300_000; // >6h → 5 min buckets
  if (secs > 3600) return 60_000;   // >1h → 60s buckets
  if (secs > 600) return 10_000;    // >10m → 10s buckets
  return 1000;                       // ≤10m → 1s buckets
}

function getThemeColor(el: HTMLElement, varName: string, fallback: string): string {
  const val = getComputedStyle(el).getPropertyValue(varName).trim();
  // Detect bare HSL values (e.g. "0 0% 4%") and wrap in hsl()
  if (val && /^\d+\s+\d+%\s+\d+%$/.test(val)) {
    return `hsl(${val})`;
  }
  return val || fallback;
}

export function PulseChart() {
  const filteredEvents = useObservabilityStore(useShallow(selectFilteredEvents));
  const timeRange = useObservabilityStore((s) => s.timeRange);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, forceRender] = useState(0);

  // Build time-series buckets with adaptive sizing
  const bucketSizeMs = getBucketSizeMs(timeRange);
  const buckets = useMemo(() => {
    if (filteredEvents.length === 0) return [];

    // Derive time range from actual event timestamps instead of Date.now()
    const timestamps = filteredEvents.map((e) => e.timestamp);
    const maxTs = Math.max(...timestamps);
    const rangeMs = TIME_RANGE_SECONDS[timeRange] * 1000;
    const startMs = maxTs - rangeMs;
    const numBuckets = Math.ceil(rangeMs / bucketSizeMs);
    const result = new Array(numBuckets).fill(0);

    for (const event of filteredEvents) {
      if (event.timestamp >= startMs) {
        const idx = Math.floor((event.timestamp - startMs) / bucketSizeMs);
        if (idx >= 0 && idx < numBuckets) {
          result[idx]++;
        }
      }
    }
    return result;
  }, [filteredEvents, timeRange, bucketSizeMs]);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Theme colors
    const bgColor = getThemeColor(container, '--background', '#0a0a0a');
    const primaryColor = getThemeColor(container, '--primary', '#3b82f6');
    const mutedColor = getThemeColor(container, '--muted-foreground', '#666');
    const borderColor = getThemeColor(container, '--border', '#333');

    // Clear
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    if (buckets.length === 0) return;

    const maxVal = Math.max(...buckets, 1);
    const barWidth = Math.max(1, w / buckets.length - 1);
    const padding = { top: 20, bottom: 25, left: 5, right: 5 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Draw grid lines
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }

    // Draw bars
    const bw = chartW / buckets.length;
    for (let i = 0; i < buckets.length; i++) {
      const val = buckets[i];
      if (val === 0) continue;

      const barH = (val / maxVal) * chartH;
      const x = padding.left + i * bw;
      const y = padding.top + chartH - barH;

      // Gradient-like opacity based on recency
      const recency = i / buckets.length;
      const alpha = 0.3 + recency * 0.7;

      ctx.fillStyle = `color-mix(in srgb, ${primaryColor} ${Math.round(alpha * 100)}%, transparent)`;
      ctx.fillRect(x, y, Math.max(bw - 1, 1), barH);
    }

    // Y-axis label — show unit based on bucket size
    const bucketLabel = bucketSizeMs >= 300_000 ? '/5m'
      : bucketSizeMs >= 60_000 ? '/min'
      : bucketSizeMs >= 10_000 ? '/10s'
      : '/s';
    ctx.fillStyle = mutedColor;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`max: ${maxVal}${bucketLabel}`, padding.left, padding.top - 5);

    // X-axis time label
    ctx.textAlign = 'right';
    ctx.fillText('now', w - padding.right, h - 5);
    ctx.textAlign = 'left';
    ctx.fillText(`-${timeRange}`, padding.left, h - 5);
  }, [buckets, timeRange, bucketSizeMs]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      forceRender(n => n + 1);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[200px]">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
