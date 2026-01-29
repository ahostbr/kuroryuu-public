/**
 * FilterBar - Search and filter controls for Graphiti canvas
 * Features:
 * - Category multi-select dropdown
 * - Agent autocomplete search
 * - Severity toggle buttons
 * - Time range selector
 * - Active filter pills with removal
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Search, X, Filter, ChevronDown } from 'lucide-react';
import {
  useGraphitiStore,
  useGraphitiFilters,
} from '../../stores/graphiti-store';
import type { GraphitiEventCategory } from '../../types/graphiti-event';

type SeverityLevel = 'all' | 'info' | 'warn' | 'error';

interface FilterBarProps {
  /** List of unique agent IDs for autocomplete */
  availableAgents?: string[];
  className?: string;
}

const CATEGORIES: { value: GraphitiEventCategory; label: string }[] = [
  { value: 'traffic', label: 'Traffic' },
  { value: 'agent', label: 'Agent' },
  { value: 'task', label: 'Task' },
  { value: 'tool', label: 'Tool' },
  { value: 'memory', label: 'Memory' },
  { value: 'session', label: 'Session' },
  { value: 'system', label: 'System' },
];

const TIME_RANGES = [
  { value: '1m', label: '1 min', ms: 60 * 1000 },
  { value: '5m', label: '5 min', ms: 5 * 60 * 1000 },
  { value: '15m', label: '15 min', ms: 15 * 60 * 1000 },
  { value: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { value: 'all', label: 'All time', ms: 0 },
];

const SEVERITIES: { value: SeverityLevel; label: string }[] = [
  { value: 'all', label: 'all' },
  { value: 'info', label: 'info' },
  { value: 'warn', label: 'warn' },
  { value: 'error', label: 'error' },
];

export function FilterBar({ availableAgents = [], className = '' }: FilterBarProps) {
  const filters = useGraphitiFilters();
  const setFilters = useGraphitiStore((s) => s.setFilters);
  const resetFilters = useGraphitiStore((s) => s.resetFilters);

  // Local state for dropdowns
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');
  const [timeRange, setTimeRange] = useState('5m');
  const [severity, setSeverity] = useState<SeverityLevel>('all');

  // Filtered agent suggestions
  const agentSuggestions = useMemo(() => {
    if (!agentSearch) return [];
    const lower = agentSearch.toLowerCase();
    return availableAgents
      .filter((a) => a.toLowerCase().includes(lower) && !filters.agents.includes(a))
      .slice(0, 5);
  }, [agentSearch, availableAgents, filters.agents]);

  // Handle category toggle
  const handleCategoryToggle = useCallback(
    (category: GraphitiEventCategory) => {
      const current = filters.categories;
      const updated = current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category];
      setFilters({ categories: updated });
    },
    [filters.categories, setFilters]
  );

  // Handle time range change
  const handleTimeRangeChange = useCallback(
    (value: string) => {
      setTimeRange(value);
      const range = TIME_RANGES.find((r) => r.value === value);
      if (range && range.ms > 0) {
        const end = new Date();
        const start = new Date(end.getTime() - range.ms);
        setFilters({ timeWindow: [start, end] });
      } else {
        setFilters({ timeWindow: null });
      }
    },
    [setFilters]
  );

  // Handle severity change
  const handleSeverityChange = useCallback(
    (value: SeverityLevel) => {
      setSeverity(value);
      if (value === 'all') {
        setFilters({ severities: [], showErrors: false });
      } else if (value === 'error') {
        setFilters({ severities: ['error', 'critical'], showErrors: true });
      } else if (value === 'warn') {
        setFilters({ severities: ['warn', 'error', 'critical'], showErrors: false });
      } else {
        setFilters({ severities: ['info', 'debug'], showErrors: false });
      }
    },
    [setFilters]
  );

  // Handle search query
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilters({ searchQuery: e.target.value });
    },
    [setFilters]
  );

  // Handle adding an agent filter
  const handleAddAgent = useCallback(
    (agent: string) => {
      setFilters({ agents: [...filters.agents, agent] });
      setAgentSearch('');
    },
    [filters.agents, setFilters]
  );

  // Handle removing an agent filter
  const handleRemoveAgent = useCallback(
    (agent: string) => {
      setFilters({ agents: filters.agents.filter((a) => a !== agent) });
    },
    [filters.agents, setFilters]
  );

  // Handle removing a category filter
  const handleRemoveCategory = useCallback(
    (category: GraphitiEventCategory) => {
      setFilters({ categories: filters.categories.filter((c) => c !== category) });
    },
    [filters.categories, setFilters]
  );

  // Check if any filters are active
  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.agents.length > 0 ||
    severity !== 'all' ||
    filters.searchQuery;

  return (
    <div className={className}>
      {/* Main filter bar */}
      <div className="graphiti-filter-bar">
        {/* Category dropdown */}
        <div className="graphiti-filter-group">
          <div className="relative">
            <button
              className="graphiti-filter-select flex items-center gap-2"
              onClick={() => setCategoryOpen(!categoryOpen)}
              style={{ paddingRight: '10px' }}
            >
              <Filter size={12} />
              <span>Category</span>
              {filters.categories.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[9px] bg-[var(--g-primary)] text-[var(--g-bg)] rounded-full font-bold">
                  {filters.categories.length}
                </span>
              )}
              <ChevronDown size={12} className={`transition-transform ${categoryOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Category dropdown menu */}
            {categoryOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setCategoryOpen(false)}
                />
                <div className="absolute top-full left-0 mt-1 z-20 min-w-[160px] bg-[var(--g-bg)] border border-[var(--g-card-border)] rounded-[var(--g-border-radius)] shadow-lg overflow-hidden">
                  {CATEGORIES.map((cat) => (
                    <label
                      key={cat.value}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--g-card-bg)] transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={filters.categories.includes(cat.value)}
                        onChange={() => handleCategoryToggle(cat.value)}
                        className="w-3 h-3 accent-[var(--g-primary)]"
                      />
                      <span className="text-xs text-[var(--g-fg)]">{cat.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Agent search */}
        <div className="graphiti-filter-group relative">
          <div className="graphiti-filter-search">
            <Search className="graphiti-filter-search-icon" size={14} />
            <input
              type="text"
              className="graphiti-filter-search-input"
              placeholder="Filter by agent..."
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && agentSuggestions.length > 0) {
                  handleAddAgent(agentSuggestions[0]);
                }
              }}
            />
          </div>

          {/* Agent suggestions dropdown */}
          {agentSuggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 z-20 w-full bg-[var(--g-bg)] border border-[var(--g-card-border)] rounded-[var(--g-border-radius)] shadow-lg overflow-hidden">
              {agentSuggestions.map((agent) => (
                <button
                  key={agent}
                  className="w-full px-3 py-2 text-left text-xs text-[var(--g-fg)] hover:bg-[var(--g-card-bg)] transition-colors"
                  onClick={() => handleAddAgent(agent)}
                >
                  {agent}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Severity toggles */}
        <div className="graphiti-filter-toggle-group">
          {SEVERITIES.map((sev) => (
            <button
              key={sev.value}
              className={`graphiti-filter-toggle ${severity === sev.value ? 'graphiti-filter-toggle--active' : ''}`}
              onClick={() => handleSeverityChange(sev.value)}
            >
              <span
                className="graphiti-filter-toggle-dot"
                style={{
                  background:
                    sev.value === 'error'
                      ? 'var(--g-error)'
                      : sev.value === 'warn'
                        ? 'var(--g-warning)'
                        : sev.value === 'info'
                          ? 'var(--g-info)'
                          : 'var(--g-muted)',
                }}
              />
              {sev.label}
            </button>
          ))}
        </div>

        {/* Time range selector */}
        <div className="graphiti-filter-group">
          <select
            className="graphiti-filter-select"
            value={timeRange}
            onChange={(e) => handleTimeRangeChange(e.target.value)}
          >
            {TIME_RANGES.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
        </div>

        {/* Global search */}
        <div className="graphiti-filter-search flex-1">
          <Search className="graphiti-filter-search-icon" size={14} />
          <input
            type="text"
            className="graphiti-filter-search-input"
            placeholder="Search events..."
            value={filters.searchQuery || ''}
            onChange={handleSearchChange}
          />
          {filters.searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--g-muted)] hover:text-[var(--g-fg)]"
              onClick={() => setFilters({ searchQuery: '' })}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="graphiti-filter-pills">
          <span className="text-[10px] text-[var(--g-muted)] mr-2">Active:</span>

          {/* Category pills */}
          {filters.categories.map((cat) => (
            <span key={cat} className="graphiti-filter-pill">
              {cat}
              <button
                className="graphiti-filter-pill-remove"
                onClick={() => handleRemoveCategory(cat)}
              >
                <X size={10} />
              </button>
            </span>
          ))}

          {/* Agent pills */}
          {filters.agents.map((agent) => (
            <span key={agent} className="graphiti-filter-pill">
              agent:{agent}
              <button
                className="graphiti-filter-pill-remove"
                onClick={() => handleRemoveAgent(agent)}
              >
                <X size={10} />
              </button>
            </span>
          ))}

          {/* Severity pill */}
          {severity !== 'all' && (
            <span className="graphiti-filter-pill">
              {severity}
              <button
                className="graphiti-filter-pill-remove"
                onClick={() => handleSeverityChange('all')}
              >
                <X size={10} />
              </button>
            </span>
          )}

          {/* Search pill */}
          {filters.searchQuery && (
            <span className="graphiti-filter-pill">
              search: {filters.searchQuery}
              <button
                className="graphiti-filter-pill-remove"
                onClick={() => setFilters({ searchQuery: '' })}
              >
                <X size={10} />
              </button>
            </span>
          )}

          {/* Clear all */}
          <button className="graphiti-filter-clear" onClick={resetFilters}>
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

export default FilterBar;
