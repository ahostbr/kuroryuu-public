/**
 * LiveLogStream - Real-time scrolling traffic log
 * Shows all traffic events with filtering, auto-scroll, and click-to-inspect
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Pause, Play, Download, Filter, Search, X } from 'lucide-react';
import { useTrafficStore } from '../../stores/traffic-store';
import type { TrafficEvent, LogFilterLevel } from '../../types/traffic';

// Format timestamp for log display
const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
};

// Format bytes for display
const formatBytes = (bytes?: number) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

// Get status color class
const getStatusClass = (status?: number) => {
  if (!status) return 'text-gray-400';
  if (status >= 500) return 'text-red-500 bg-red-500/10';
  if (status >= 400) return 'text-orange-400 bg-orange-500/10';
  if (status >= 300) return 'text-cyan-400 bg-cyan-500/10';
  return 'text-green-400 bg-green-500/10';
};

// Get method color class
const getMethodClass = (method?: string) => {
  switch (method) {
    case 'GET':
      return 'text-green-400';
    case 'POST':
      return 'text-blue-400';
    case 'PUT':
      return 'text-yellow-400';
    case 'PATCH':
      return 'text-purple-400';
    case 'DELETE':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
};

interface LogEntryProps {
  event: TrafficEvent;
  onInspect: (eventId: string) => void;
}

function LogEntry({ event, onInspect }: LogEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Only show response events (they have status and duration)
  if (event.type !== 'http_response') {
    return null;
  }

  return (
    <div className="log-entry group">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        onDoubleClick={() => onInspect(event.id)}
        className={`log-row w-full text-left px-3 py-1.5 font-mono text-xs flex items-center gap-3 hover:bg-white/5 transition-colors ${
          event.status && event.status >= 400 ? 'bg-red-500/5' : ''
        }`}
      >
        <span className="timestamp opacity-50 w-24 shrink-0">
          {formatTime(event.timestamp)}
        </span>
        <span className={`method w-12 shrink-0 font-bold ${getMethodClass(event.method)}`}>
          {event.method}
        </span>
        <span className="endpoint flex-1 truncate opacity-80">{event.endpoint}</span>
        <span
          className={`status w-10 text-center rounded px-1 ${getStatusClass(event.status)}`}
        >
          {event.status}
        </span>
        <span className="duration w-16 text-right opacity-60">
          {event.duration?.toFixed(0) || '—'}ms
        </span>
        <span className="size w-16 text-right opacity-40">
          {formatBytes(event.metadata?.body_size)}
        </span>
      </button>

      {/* Expanded inline preview */}
      {isExpanded && (
        <div className="log-expanded px-3 py-2 bg-black/30 border-l-2 border-cyan-400/50 ml-4 mb-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs opacity-60">Event ID: {event.id}</span>
            <button
              onClick={() => onInspect(event.id)}
              className="text-xs px-2 py-1 rounded bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20 transition-colors"
            >
              Full Details
            </button>
          </div>
          {event.metadata && (
            <div className="text-xs space-y-1 opacity-60">
              <div>Category: {event.metadata.category}</div>
              {event.metadata.error_type && (
                <div className="text-red-400">Error: {event.metadata.error_message}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LiveLogStream() {
  const events = useTrafficStore((s) => s.events);
  const logAutoScroll = useTrafficStore((s) => s.logAutoScroll);
  const logFilterLevel = useTrafficStore((s) => s.logFilterLevel);
  const toggleLogAutoScroll = useTrafficStore((s) => s.toggleLogAutoScroll);
  const setLogFilterLevel = useTrafficStore((s) => s.setLogFilterLevel);
  const openInspector = useTrafficStore((s) => s.openInspector);

  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (logAutoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events, logAutoScroll]);

  // Filter events based on filter level and search
  const filteredEvents = events.filter((event) => {
    // Only show response events
    if (event.type !== 'http_response') return false;

    // Filter by level
    if (logFilterLevel === 'errors' && event.status && event.status < 400) return false;
    if (logFilterLevel === 'warnings' && event.status && event.status < 300) return false;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        event.endpoint.toLowerCase().includes(query) ||
        event.method?.toLowerCase().includes(query)
      );
    }

    return true;
  });

  // Export logs as JSON
  const exportLogs = useCallback(() => {
    const data = JSON.stringify(filteredEvents, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traffic-logs-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEvents]);

  return (
    <div className="log-stream h-full flex flex-col">
      {/* Header */}
      <div className="log-header flex items-center gap-4 p-3 border-b border-white/10">
        <span className="text-sm font-bold opacity-80">LIVE TRAFFIC LOG</span>

        {/* Filter Dropdown */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="opacity-50" />
          <select
            value={logFilterLevel}
            onChange={(e) => setLogFilterLevel(e.target.value as LogFilterLevel)}
            className="bg-transparent border border-white/20 rounded px-2 py-1 text-xs"
          >
            <option value="all">All</option>
            <option value="warnings">Warnings+</option>
            <option value="errors">Errors Only</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-40" />
          <input
            type="text"
            placeholder="Search endpoints..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-8 py-1 text-xs placeholder:opacity-40"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Pause/Play */}
          <button
            onClick={toggleLogAutoScroll}
            className={`p-2 rounded-lg transition-colors ${
              logAutoScroll ? 'bg-green-500/20 text-green-400' : 'bg-white/5'
            }`}
            title={logAutoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
          >
            {logAutoScroll ? <Play size={14} /> : <Pause size={14} />}
          </button>

          {/* Export */}
          <button
            onClick={exportLogs}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            title="Export logs as JSON"
          >
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* Log Content */}
      <div ref={containerRef} className="log-content flex-1 overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm opacity-40">
            {events.length === 0
              ? 'Waiting for traffic...'
              : 'No events match current filters'}
          </div>
        ) : (
          filteredEvents.map((event) => (
            <LogEntry key={event.id} event={event} onInspect={openInspector} />
          ))
        )}
      </div>

      {/* Footer Stats */}
      <div className="log-footer px-3 py-2 border-t border-white/10 bg-black/20 text-xs opacity-60 flex items-center justify-between">
        <span>
          Showing {filteredEvents.length} of {events.length} events
        </span>
        <span className={logAutoScroll ? 'text-green-400' : 'text-yellow-400'}>
          {logAutoScroll ? 'Auto-scrolling' : 'Paused'}
        </span>
      </div>
    </div>
  );
}
