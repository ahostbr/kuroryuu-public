/**
 * GraphitiPanel - Main wrapper component for Graphiti unified observability hub
 * Integrates:
 * - Header with title, theme selector, settings
 * - KPI row with 5 metric cards
 * - Filter bar with search and filters
 * - Canvas area (passed as children)
 * - Drilldown panel for selected nodes
 */
import React, { useCallback, useMemo, useEffect } from 'react';
import { Settings, Zap, Skull, Terminal, Moon, Sun } from 'lucide-react';
import { KPIRow } from './KPIRow';
import { FilterBar } from './FilterBar';
import { DrilldownPanel } from './DrilldownPanel';
import {
  useGraphitiStore,
  useGraphitiEnabled,
  useGraphitiViewState,
} from '../../stores/graphiti-store';
import type { GraphitiTheme } from '../../types/graphiti-event';

// Import the theme styles
import '../../styles/graphiti-themes.css';

interface GraphitiPanelProps {
  children: React.ReactNode;
  className?: string;
  /** Hide KPI row */
  hideKPI?: boolean;
  /** Hide filter bar */
  hideFilters?: boolean;
  /** Available agent IDs for filter autocomplete */
  availableAgents?: string[];
}

/**
 * Theme button configuration
 */
const THEMES: { value: GraphitiTheme; icon: React.ReactNode; label: string }[] = [
  { value: 'cyberpunk', icon: <Zap size={14} />, label: 'Cyberpunk' },
  { value: 'kuroryuu', icon: <Skull size={14} />, label: 'Kuroryuu' },
  { value: 'retro', icon: <Terminal size={14} />, label: 'Retro' },
  { value: 'default', icon: <Moon size={14} />, label: 'Default' },
];

export function GraphitiPanel({
  children,
  className = '',
  hideKPI = false,
  hideFilters = false,
  availableAgents = [],
}: GraphitiPanelProps) {
  const enabled = useGraphitiEnabled();
  const viewState = useGraphitiViewState();
  const setTheme = useGraphitiStore((s) => s.setTheme);
  const selectNode = useGraphitiStore((s) => s.selectNode);
  const events = useGraphitiStore((s) => s.events);

  // Extract unique agent IDs from events if not provided
  const agentIds = useMemo(() => {
    if (availableAgents.length > 0) return availableAgents;
    const ids = new Set<string>();
    events.forEach((e) => {
      if (e.agentId) ids.add(e.agentId);
    });
    return Array.from(ids);
  }, [availableAgents, events]);

  // Handle theme change
  const handleThemeChange = useCallback(
    (theme: GraphitiTheme) => {
      setTheme(theme);
    },
    [setTheme]
  );

  // Handle drilldown close
  const handleDrilldownClose = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  // Handle focus on node from drilldown
  const handleFocusNode = useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
    },
    [selectNode]
  );

  // Disabled state
  if (!enabled) {
    return (
      <div className={`graphiti-panel ${className}`} data-graphiti-theme="default">
        <div className="graphiti-empty">
          <div className="graphiti-empty-icon">
            <Zap size={64} strokeWidth={1} />
          </div>
          <h2 className="graphiti-empty-title">GRAPHITI OFFLINE</h2>
          <p className="graphiti-empty-message">
            Enable Graphiti in Settings to access the unified observability hub.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`graphiti-panel ${className}`}
      data-graphiti-theme={viewState.theme}
    >
      {/* Header */}
      <div className="graphiti-panel-header">
        <h1 className="graphiti-panel-title">GRAPHITI</h1>

        <div className="graphiti-panel-controls">
          {/* Theme Selector */}
          <div className="graphiti-theme-selector">
            {THEMES.map((theme) => (
              <button
                key={theme.value}
                className={`graphiti-theme-btn ${
                  viewState.theme === theme.value ? 'graphiti-theme-btn--active' : ''
                }`}
                onClick={() => handleThemeChange(theme.value)}
                title={theme.label}
              >
                {theme.icon}
              </button>
            ))}
          </div>

          {/* Settings button (placeholder for future settings dropdown) */}
          <button className="graphiti-settings-btn" title="Settings">
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="graphiti-panel-body">
        {/* KPI Row */}
        {!hideKPI && <KPIRow />}

        {/* Filter Bar */}
        {!hideFilters && <FilterBar availableAgents={agentIds} />}

        {/* Canvas Area */}
        <div className="graphiti-canvas-container">
          {children}
        </div>
      </div>

      {/* Drilldown Panel */}
      {viewState.selectedNodeId && (
        <DrilldownPanel
          onClose={handleDrilldownClose}
          onFocusNode={handleFocusNode}
        />
      )}
    </div>
  );
}

export default GraphitiPanel;
