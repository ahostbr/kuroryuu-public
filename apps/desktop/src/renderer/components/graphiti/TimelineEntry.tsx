/**
 * TimelineEntry - Individual event in the drilldown timeline
 * Features:
 * - Color-coded icon based on event type
 * - Timestamp display
 * - Event type and details
 * - Result badge (OK/Error/Timeout)
 * - Expandable detail section
 */
import React, { useState, useMemo } from 'react';
import {
  Circle,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Zap,
  Activity,
  ChevronDown,
} from 'lucide-react';
import type { GraphitiEvent } from '../../types/graphiti-event';

interface TimelineEntryProps {
  event: GraphitiEvent;
  onClick?: () => void;
}

/**
 * Get icon component and class based on event type
 */
function getEventIcon(
  event: GraphitiEvent
): { icon: React.ReactNode; className: string } {
  const iconSize = 14;

  // Error events
  if (event.severity === 'error' || event.severity === 'critical') {
    return {
      icon: <XCircle size={iconSize} />,
      className: 'graphiti-timeline-icon--error',
    };
  }

  // Success/completed events
  if (
    event.type.includes('Result') ||
    event.type.includes('Complete') ||
    event.type.includes('Success')
  ) {
    return {
      icon: <CheckCircle size={iconSize} />,
      className: 'graphiti-timeline-icon--success',
    };
  }

  // Task events
  if (event.category === 'task') {
    return {
      icon: <Activity size={iconSize} />,
      className: 'graphiti-timeline-icon--task',
    };
  }

  // Tool events
  if (event.category === 'tool') {
    return {
      icon: <Zap size={iconSize} />,
      className: 'graphiti-timeline-icon--tool',
    };
  }

  // Session events
  if (event.category === 'session') {
    return {
      icon: <Circle size={iconSize} />,
      className: 'graphiti-timeline-icon--session',
    };
  }

  // Heartbeat/keep-alive events
  if (event.type.includes('Heartbeat') || event.type.includes('KeepAlive')) {
    return {
      icon: <Activity size={iconSize} />,
      className: 'graphiti-timeline-icon--heartbeat',
    };
  }

  // Warning events
  if (event.severity === 'warn') {
    return {
      icon: <AlertTriangle size={iconSize} />,
      className: 'graphiti-timeline-icon--tool',
    };
  }

  // Default
  return {
    icon: <Circle size={iconSize} />,
    className: 'graphiti-timeline-icon--task',
  };
}

/**
 * Format timestamp for display (HH:MM:SS.mmm)
 */
function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  } catch {
    return '--:--:--';
  }
}

/**
 * Get result badge component
 */
function getResultBadge(
  event: GraphitiEvent
): React.ReactNode | null {
  if (event.severity === 'error' || event.severity === 'critical') {
    return (
      <span className="graphiti-timeline-result graphiti-timeline-result--error">
        ERROR
      </span>
    );
  }

  // Check for timeout in payload
  const errorVal = event.payload?.error;
  const hasTimeoutError = typeof errorVal === 'string' && errorVal.includes('timeout');
  if (hasTimeoutError || event.payload?.timeout) {
    return (
      <span className="graphiti-timeline-result graphiti-timeline-result--timeout">
        <Clock size={10} />
        TIMEOUT
      </span>
    );
  }

  // Check for explicit OK/success
  if (
    event.type.includes('Result') ||
    event.type.includes('Complete') ||
    event.payload?.success === true
  ) {
    const duration = event.duration;
    return (
      <span className="graphiti-timeline-result graphiti-timeline-result--ok">
        OK{duration !== undefined ? ` (${duration}ms)` : ''}
      </span>
    );
  }

  return null;
}

/**
 * Get event detail string
 */
function getEventDetail(event: GraphitiEvent): string {
  const payload = event.payload || {};

  // Tool calls - show tool name and args preview
  if (event.category === 'tool') {
    const toolName = String(payload.toolName || event.type.replace('ToolCall', ''));
    const args = payload.args;
    if (args && typeof args === 'object') {
      const preview = JSON.stringify(args).slice(0, 50);
      return `${toolName}(${preview}${preview.length >= 50 ? '...' : ''})`;
    }
    return toolName;
  }

  // Task events - show task/subtask name
  if (event.category === 'task') {
    return String(payload.taskName || payload.subtaskName || event.taskId || '');
  }

  // Session events
  if (event.category === 'session') {
    return String(payload.sessionType || event.sessionId || '');
  }

  // Traffic events - show endpoint
  if (event.category === 'traffic') {
    const method = payload.method || '';
    const endpoint = payload.endpoint || payload.path || '';
    return `${method} ${endpoint}`;
  }

  // Generic - show type or first payload value
  const firstKey = Object.keys(payload)[0];
  if (firstKey && typeof payload[firstKey] === 'string') {
    return payload[firstKey].slice(0, 60);
  }

  return '';
}

export function TimelineEntry({ event, onClick }: TimelineEntryProps) {
  const [expanded, setExpanded] = useState(false);

  const { icon, className: iconClassName } = useMemo(
    () => getEventIcon(event),
    [event]
  );
  const timestamp = useMemo(() => formatTimestamp(event.timestamp), [event.timestamp]);
  const resultBadge = useMemo(() => getResultBadge(event), [event]);
  const detail = useMemo(() => getEventDetail(event), [event]);

  // Determine if this entry has expandable content
  const hasExpandableContent =
    event.payload && Object.keys(event.payload).length > 0;

  return (
    <div
      className="graphiti-timeline-entry"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Icon */}
      <div className={`graphiti-timeline-icon ${iconClassName}`}>
        {icon}
      </div>

      {/* Body */}
      <div className="graphiti-timeline-body">
        {/* Header: Time + Type + Badge */}
        <div className="graphiti-timeline-header">
          <span className="graphiti-timeline-time">{timestamp}</span>
          <span className="graphiti-timeline-type">{event.type}</span>
          {resultBadge}
        </div>

        {/* Detail line */}
        {detail && (
          <div className="graphiti-timeline-detail">{detail}</div>
        )}

        {/* Expandable payload */}
        {hasExpandableContent && expanded && (
          <div className="mt-2 p-2 bg-[var(--g-bg-secondary)] rounded-[var(--g-border-radius)] text-[10px] font-mono text-[var(--g-muted)] overflow-x-auto">
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Expand toggle */}
      {hasExpandableContent && (
        <button
          className="flex items-center justify-center w-6 h-6 text-[var(--g-muted)] hover:text-[var(--g-fg)] transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      )}
    </div>
  );
}

export default TimelineEntry;
