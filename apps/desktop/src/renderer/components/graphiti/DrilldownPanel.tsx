/**
 * DrilldownPanel - Slide-in detail panel for selected node
 * Features:
 * - Node header with type badge and label
 * - Quick stats (status, event count, errors, latency)
 * - Collapsible timeline section
 * - Collapsible correlated entities section
 * - Click backdrop to close
 */
import React, { useCallback, useState, useMemo } from 'react';
import { X, ChevronLeft, ChevronDown, ArrowRight, Activity, Box, Cpu, Database } from 'lucide-react';
import { TimelineEntry } from './TimelineEntry';
import {
  useGraphitiStore,
  useGraphitiViewState,
  useGraphitiDrilldown,
  useGraphitiNodes,
} from '../../stores/graphiti-store';
import type { GraphitiNode, GraphitiEvent } from '../../types/graphiti-event';

interface DrilldownPanelProps {
  onClose: () => void;
  onFocusNode?: (nodeId: string) => void;
}

/**
 * Get icon for entity type
 */
function getEntityIcon(type: string): React.ReactNode {
  switch (type) {
    case 'agent':
      return <Cpu size={16} />;
    case 'task':
      return <Box size={16} />;
    case 'tool':
      return <Activity size={16} />;
    case 'memory':
      return <Database size={16} />;
    default:
      return <Box size={16} />;
  }
}

/**
 * Format timestamp for last seen
 */
function formatLastSeen(isoString?: string): string {
  if (!isoString) return 'Never';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString();
  } catch {
    return 'Unknown';
  }
}

/**
 * Get correlated nodes from events
 */
function getCorrelatedNodes(
  events: GraphitiEvent[],
  allNodes: GraphitiNode[],
  currentNodeId: string
): GraphitiNode[] {
  const relatedIds = new Set<string>();

  events.forEach((event) => {
    if (event.agentId) relatedIds.add(`agent:${event.agentId}`);
    if (event.taskId) relatedIds.add(`task:${event.taskId}`);
    if (event.sessionId) relatedIds.add(`session:${event.sessionId}`);
    if (event.category === 'tool' && event.payload?.toolName) {
      relatedIds.add(`tool:${event.payload.toolName}`);
    }
  });

  // Remove current node
  relatedIds.delete(currentNodeId);

  // Find matching nodes
  return allNodes.filter((n) => relatedIds.has(n.id));
}

export function DrilldownPanel({ onClose, onFocusNode }: DrilldownPanelProps) {
  const viewState = useGraphitiViewState();
  const events = useGraphitiDrilldown();
  const allNodes = useGraphitiNodes();
  const selectedNode = useGraphitiStore((s) =>
    s.nodes.find((n) => n.id === s.viewState.selectedNodeId)
  );

  const [timelineOpen, setTimelineOpen] = useState(true);
  const [correlatedOpen, setCorrelatedOpen] = useState(true);

  // Get correlated nodes
  const correlatedNodes = useMemo(
    () =>
      selectedNode
        ? getCorrelatedNodes(events, allNodes, selectedNode.id)
        : [],
    [events, allNodes, selectedNode]
  );

  // Handle click outside
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Handle focus on correlated node
  const handleFocusCorrelated = useCallback(
    (nodeId: string) => {
      onFocusNode?.(nodeId);
    },
    [onFocusNode]
  );

  if (!selectedNode) {
    return null;
  }

  // Extract node type from ID (e.g., "agent:worker-123" -> "AGENT")
  const nodeType = selectedNode.id.split(':')[0].toUpperCase();

  // Calculate stats
  const errorCount = events.filter(
    (e) => e.severity === 'error' || e.severity === 'critical'
  ).length;
  const avgLatency =
    events.filter((e) => e.duration).length > 0
      ? events
          .filter((e) => e.duration)
          .reduce((sum, e) => sum + (e.duration || 0), 0) /
        events.filter((e) => e.duration).length
      : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="graphiti-drilldown-backdrop"
        onClick={handleBackdropClick}
      />

      {/* Panel */}
      <div className="graphiti-drilldown">
        {/* Header */}
        <div className="graphiti-drilldown-header">
          <button className="graphiti-drilldown-back" onClick={onClose}>
            <ChevronLeft size={16} />
          </button>

          <div className="graphiti-drilldown-title-group">
            <div className="graphiti-drilldown-type">{nodeType}</div>
            <div className="graphiti-drilldown-title">{selectedNode.label}</div>
          </div>

          <button className="graphiti-drilldown-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Quick Stats */}
        <div className="graphiti-drilldown-stats">
          <div className="graphiti-drilldown-stat">
            <span className="graphiti-drilldown-stat-label">Status</span>
            <span
              className={`graphiti-drilldown-stat-value ${
                selectedNode.status === 'error'
                  ? 'graphiti-drilldown-stat-value--error'
                  : selectedNode.status === 'active'
                    ? 'graphiti-drilldown-stat-value--success'
                    : ''
              }`}
            >
              {selectedNode.status.toUpperCase()}
            </span>
          </div>

          <div className="graphiti-drilldown-stat">
            <span className="graphiti-drilldown-stat-label">Events</span>
            <span className="graphiti-drilldown-stat-value">{events.length}</span>
          </div>

          <div className="graphiti-drilldown-stat">
            <span className="graphiti-drilldown-stat-label">Last Seen</span>
            <span className="graphiti-drilldown-stat-value">
              {formatLastSeen(selectedNode.lastEventTime)}
            </span>
          </div>

          <div className="graphiti-drilldown-stat">
            <span className="graphiti-drilldown-stat-label">Avg Latency</span>
            <span className="graphiti-drilldown-stat-value">
              {avgLatency > 0 ? `${avgLatency.toFixed(0)}ms` : '—'}
            </span>
          </div>

          {errorCount > 0 && (
            <div className="graphiti-drilldown-stat">
              <span className="graphiti-drilldown-stat-label">Errors</span>
              <span className="graphiti-drilldown-stat-value graphiti-drilldown-stat-value--error">
                {errorCount}
              </span>
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="graphiti-drilldown-content">
          {/* Timeline Section */}
          <div className="graphiti-drilldown-section">
            <div
              className="graphiti-drilldown-section-header"
              onClick={() => setTimelineOpen(!timelineOpen)}
            >
              <span className="graphiti-drilldown-section-title">Timeline</span>
              <span
                className={`graphiti-drilldown-section-toggle ${
                  timelineOpen ? 'graphiti-drilldown-section-toggle--open' : ''
                }`}
              >
                <ChevronDown size={14} />
              </span>
            </div>

            {timelineOpen && (
              <div className="graphiti-drilldown-section-content">
                {events.length > 0 ? (
                  <div className="graphiti-timeline">
                    {events
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(b.timestamp).getTime() -
                          new Date(a.timestamp).getTime()
                      )
                      .slice(0, 50) // Limit to 50 most recent
                      .map((event) => (
                        <TimelineEntry key={event.id} event={event} />
                      ))}

                    {events.length > 50 && (
                      <div className="px-4 py-3 text-center text-xs text-[var(--g-muted)]">
                        Showing 50 of {events.length} events
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center text-xs text-[var(--g-muted)]">
                    No events found for this node
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Correlated Entities Section */}
          {correlatedNodes.length > 0 && (
            <div className="graphiti-drilldown-section">
              <div
                className="graphiti-drilldown-section-header"
                onClick={() => setCorrelatedOpen(!correlatedOpen)}
              >
                <span className="graphiti-drilldown-section-title">
                  Correlated ({correlatedNodes.length})
                </span>
                <span
                  className={`graphiti-drilldown-section-toggle ${
                    correlatedOpen ? 'graphiti-drilldown-section-toggle--open' : ''
                  }`}
                >
                  <ChevronDown size={14} />
                </span>
              </div>

              {correlatedOpen && (
                <div className="graphiti-drilldown-section-content">
                  <div className="graphiti-correlated-list">
                    {correlatedNodes.map((node) => {
                      const type = node.id.split(':')[0];
                      return (
                        <div
                          key={node.id}
                          className="graphiti-correlated-item"
                          onClick={() => handleFocusCorrelated(node.id)}
                        >
                          <div className="graphiti-correlated-icon">
                            {getEntityIcon(type)}
                          </div>
                          <div className="graphiti-correlated-body">
                            <div className="graphiti-correlated-type">
                              {type.toUpperCase()}
                            </div>
                            <div className="graphiti-correlated-label">
                              {node.label}
                            </div>
                          </div>
                          <span className="graphiti-correlated-arrow">
                            <ArrowRight size={14} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default DrilldownPanel;
