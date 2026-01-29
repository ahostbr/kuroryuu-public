/**
 * LiveMessagePanel - Real-time message panel showing request/response bodies
 * Displays actual JSON content flowing through the gateway
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Pause,
  Play,
  Download,
  Filter,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  PanelRightClose,
  Network,
  MessageSquare,
} from 'lucide-react';
import { useTrafficStore } from '../../stores/traffic-store';
import type { TrafficEvent, LogFilterLevel } from '../../types/traffic';
import { NetworkGraphPanel } from '../Inspector/NetworkGraphPanel';

type PanelView = 'messages' | 'network';

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

// Get status color class
const getStatusClass = (status?: number) => {
  if (!status) return 'text-gray-400';
  if (status >= 500) return 'text-red-400';
  if (status >= 400) return 'text-orange-400';
  if (status >= 300) return 'text-cyan-400';
  return 'text-green-400';
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

// JSON Syntax highlighter (memoized for performance)
function JsonDisplay({ data, maxLines = 12 }: { data: string; maxLines?: number }) {
  const [expanded, setExpanded] = useState(false);

  // Memoize JSON parsing and formatting (expensive operations)
  const { formatted, isJson, lines } = useMemo(() => {
    let result: string;
    let json = false;
    try {
      const parsed = JSON.parse(data);
      result = JSON.stringify(parsed, null, 2);
      json = true;
    } catch {
      result = data;
    }
    return { formatted: result, isJson: json, lines: result.split('\n') };
  }, [data]);

  const needsTruncation = lines.length > maxLines && !expanded;
  const displayLines = needsTruncation ? lines.slice(0, maxLines) : lines;
  const displayText = displayLines.join('\n');

  // Memoize syntax highlighting (regex operations)
  const highlightedHtml = useMemo(() => {
    if (!isJson) return displayText;
    return displayText
      .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
      .replace(/: "([^"]+)"/g, ': <span class="json-string">"$1"</span>')
      .replace(/: (\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
      .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
      .replace(/: (null)/g, ': <span class="json-null">$1</span>');
  }, [displayText, isJson]);

  return (
    <div className="json-display">
      <pre
        className="text-xs font-mono whitespace-pre-wrap break-all overflow-hidden"
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
      {needsTruncation && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-cyan-400 hover:text-cyan-300 mt-1 flex items-center gap-1"
        >
          <ChevronDown size={12} />
          Show {lines.length - maxLines} more lines
        </button>
      )}
      {expanded && lines.length > maxLines && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-cyan-400 hover:text-cyan-300 mt-1 flex items-center gap-1"
        >
          <ChevronRight size={12} />
          Collapse
        </button>
      )}
    </div>
  );
}

// Message Card Component (memoized for performance)
interface MessageCardProps {
  event: TrafficEvent;
  onInspect: (eventId: string) => void;
}

const MessageCard = React.memo(function MessageCard({ event, onInspect }: MessageCardProps) {
  const [showRequest, setShowRequest] = useState(false);
  const [showResponse, setShowResponse] = useState(true);

  const requestBody = event.metadata?.request_body_preview;
  const responseBody = event.metadata?.body_preview;
  const hasRequest = requestBody && requestBody.length > 0;
  const hasResponse = responseBody && responseBody.length > 0;

  const copyBody = useCallback(
    (body: string) => {
      navigator.clipboard.writeText(body);
    },
    []
  );

  // Determine if this is a request or response
  const isRequest = event.type === 'http_request';
  const eventTypeLabel = isRequest ? 'REQ' : 'RES';

  return (
    <div className={`message-card ${isRequest ? 'message-card-request' : ''}`}>
      {/* Header row */}
      <div className="message-header">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`message-type ${isRequest ? 'message-type-req' : 'message-type-res'}`}>
            {eventTypeLabel}
          </span>
          <span className="message-time">{formatTime(event.timestamp)}</span>
          <span className={`message-method ${getMethodClass(event.method)}`}>
            {event.method}
          </span>
          <span className="message-endpoint">{event.endpoint}</span>
        </div>
        <div className="flex items-center gap-2">
          {event.status && (
            <span className={`message-status ${getStatusClass(event.status)}`}>
              {event.status}
            </span>
          )}
          {event.duration !== undefined && (
            <span className="message-latency">{event.duration.toFixed(0)}ms</span>
          )}
          <button
            onClick={() => onInspect(event.id)}
            className="message-inspect-btn"
            title="Full details"
          >
            <ExternalLink size={12} />
          </button>
        </div>
      </div>

      {/* Request body (collapsible) */}
      {hasRequest && (
        <div className="message-body-section">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowRequest(!showRequest)}
            onKeyDown={(e) => e.key === 'Enter' && setShowRequest(!showRequest)}
            className="message-body-toggle"
          >
            {showRequest ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Request Body</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyBody(requestBody);
              }}
              className="message-copy-btn"
              title="Copy"
            >
              <Copy size={10} />
            </button>
          </div>
          {showRequest && (
            <div className="message-body-content">
              <JsonDisplay data={requestBody} />
            </div>
          )}
        </div>
      )}

      {/* Response body (expanded by default) */}
      {hasResponse && (
        <div className="message-body-section">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowResponse(!showResponse)}
            onKeyDown={(e) => e.key === 'Enter' && setShowResponse(!showResponse)}
            className="message-body-toggle"
          >
            {showResponse ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Response Body</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyBody(responseBody);
              }}
              className="message-copy-btn"
              title="Copy"
            >
              <Copy size={10} />
            </button>
          </div>
          {showResponse && (
            <div className="message-body-content">
              <JsonDisplay data={responseBody} />
            </div>
          )}
        </div>
      )}

      {/* No body indicator */}
      {!hasRequest && !hasResponse && (
        <div className="message-no-body">No body content</div>
      )}
    </div>
  );
}, (prev, next) => prev.event.id === next.event.id);

// Grouped Card Component for bodyless requests
interface GroupedCardProps {
  item: GroupedEvent;
}

const GroupedCard = React.memo(function GroupedCard({ item }: GroupedCardProps) {
  return (
    <div className="grouped-card">
      <div className="flex items-center gap-2">
        <span className="message-type message-type-grouped">GRP</span>
        <span className="message-time">{formatTime(item.lastTimestamp)}</span>
        <span className={`message-method ${getMethodClass(item.method)}`}>
          {item.method}
        </span>
        <span className="message-endpoint">{item.endpoint}</span>
        <span className="grouped-count">×{item.count}</span>
      </div>
    </div>
  );
});

// Max events to display (performance optimization)
const MAX_DISPLAY_EVENTS = 30;

// Grouped event type for bodyless requests
interface GroupedEvent {
  type: 'grouped';
  key: string;
  method: string;
  endpoint: string;
  count: number;
  lastTimestamp: string;
}

// Union type for display items
type DisplayItem = TrafficEvent | GroupedEvent;

// Check if event has body content
const hasBody = (event: TrafficEvent) => {
  const requestBody = event.metadata?.request_body_preview;
  const responseBody = event.metadata?.body_preview;
  return (requestBody && requestBody.length > 0) || (responseBody && responseBody.length > 0);
};

export function LiveMessagePanel() {
  const events = useTrafficStore((s) => s.events);
  const isPaused = useTrafficStore((s) => s.isPaused);
  const togglePause = useTrafficStore((s) => s.togglePause);
  const logFilterLevel = useTrafficStore((s) => s.logFilterLevel);
  const setLogFilterLevel = useTrafficStore((s) => s.setLogFilterLevel);
  const openInspector = useTrafficStore((s) => s.openInspector);
  const setViewMode = useTrafficStore((s) => s.setViewMode);

  const [searchQuery, setSearchQuery] = useState('');
  const [panelView, setPanelView] = useState<PanelView>('messages');
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom (only when not paused)
  useEffect(() => {
    if (!isPaused && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events, isPaused]);

  // Filter and group events for display
  const displayItems = useMemo((): DisplayItem[] => {
    // First filter events
    const filtered = events.filter((event) => {
      if (logFilterLevel === 'errors' && event.status && event.status < 400) return false;
      if (logFilterLevel === 'warnings' && event.status && event.status < 300) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          event.endpoint.toLowerCase().includes(query) ||
          event.method?.toLowerCase().includes(query) ||
          event.type.toLowerCase().includes(query)
        );
      }
      return true;
    });

    // Separate events with body and without body
    const withBody: TrafficEvent[] = [];
    const withoutBody: TrafficEvent[] = [];

    filtered.forEach(event => {
      if (hasBody(event)) {
        withBody.push(event);
      } else {
        withoutBody.push(event);
      }
    });

    // Group bodyless events by method+endpoint
    const groups = new Map<string, GroupedEvent>();
    withoutBody.forEach(event => {
      const key = `${event.method}:${event.endpoint}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        existing.lastTimestamp = event.timestamp;
      } else {
        groups.set(key, {
          type: 'grouped',
          key,
          method: event.method || 'GET',
          endpoint: event.endpoint,
          count: 1,
          lastTimestamp: event.timestamp,
        });
      }
    });

    // Combine: grouped items + events with body (limited)
    const groupedItems = Array.from(groups.values());
    const recentWithBody = withBody.slice(-MAX_DISPLAY_EVENTS);

    // Sort by timestamp (grouped uses lastTimestamp)
    const combined: DisplayItem[] = [...groupedItems, ...recentWithBody];
    combined.sort((a, b) => {
      const tsA = 'lastTimestamp' in a ? a.lastTimestamp : a.timestamp;
      const tsB = 'lastTimestamp' in b ? b.lastTimestamp : b.timestamp;
      return new Date(tsA).getTime() - new Date(tsB).getTime();
    });

    return combined.slice(-MAX_DISPLAY_EVENTS);
  }, [events, logFilterLevel, searchQuery]);

  // Export logs (exports raw events, not grouped)
  const exportLogs = useCallback(() => {
    const data = JSON.stringify(events, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traffic-messages-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [events]);

  return (
    <div className="live-message-panel">
      {/* Header */}
      <div className="message-panel-header">
        {/* View Toggle */}
        <div className="flex items-center gap-1 mr-3">
          <button
            onClick={() => setPanelView('messages')}
            className={`message-view-toggle ${panelView === 'messages' ? 'active' : ''}`}
            title="Live Messages"
          >
            <MessageSquare size={14} />
          </button>
          <button
            onClick={() => setPanelView('network')}
            className={`message-view-toggle ${panelView === 'network' ? 'active' : ''}`}
            title="Network Graph"
          >
            <Network size={14} />
          </button>
        </div>

        <span className="message-panel-title">
          {panelView === 'messages' ? 'LIVE MESSAGES' : 'NETWORK GRAPH'}
        </span>

        {/* Filter dropdown - only show for messages view */}
        {panelView === 'messages' && (
          <div className="flex items-center gap-2">
            <Filter size={12} className="opacity-50" />
            <select
              value={logFilterLevel}
              onChange={(e) => setLogFilterLevel(e.target.value as LogFilterLevel)}
              className="message-filter-select"
            >
              <option value="all">All</option>
              <option value="warnings">Warnings+</option>
              <option value="errors">Errors Only</option>
            </select>
          </div>
        )}

        {/* Search - only show for messages view */}
        {panelView === 'messages' && (
          <div className="message-search-container">
            <Search size={12} className="message-search-icon" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="message-search-input"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="message-search-clear">
                <X size={10} />
              </button>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-1 ml-auto">
          {panelView === 'messages' && (
            <>
              <button
                onClick={togglePause}
                className={`message-control-btn ${!isPaused ? 'active' : ''}`}
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? <Play size={12} /> : <Pause size={12} />}
              </button>
              <button
                onClick={exportLogs}
                className="message-control-btn"
                title="Export"
              >
                <Download size={12} />
              </button>
            </>
          )}
          <button
            onClick={() => setViewMode('graph')}
            className="message-control-btn message-collapse-btn"
            title="Collapse panel"
          >
            <PanelRightClose size={14} />
          </button>
        </div>
      </div>

      {/* Content - Messages or Network Graph */}
      {panelView === 'messages' ? (
        <>
          <div ref={containerRef} className="message-panel-content">
            {displayItems.length === 0 ? (
              <div className="message-empty">
                {events.length === 0
                  ? 'Waiting for traffic...'
                  : 'No events match filters'}
              </div>
            ) : (
              displayItems.map((item) =>
                item.type === 'grouped' ? (
                  <GroupedCard key={item.key} item={item} />
                ) : (
                  <MessageCard key={item.id} event={item} onInspect={openInspector} />
                )
              )
            )}
          </div>

          {/* Footer - only for messages */}
          <div className="message-panel-footer justify-end">
            <span className={isPaused ? 'text-yellow-400' : 'text-green-400'}>
              {isPaused ? 'Paused' : 'Live'}
            </span>
          </div>
        </>
      ) : (
        <div className="flex-1 min-h-0 w-full" style={{ minHeight: '500px', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <NetworkGraphPanel />
          </div>
        </div>
      )}
    </div>
  );
}
