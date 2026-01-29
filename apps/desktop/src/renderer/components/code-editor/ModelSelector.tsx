/**
 * ModelSelector - Clean dropdown for AI model selection (Copilot-style)
 *
 * Inspired by VS Code Copilot's model picker:
 * - Clean flat list with subtle grouping dividers
 * - Rate/context info on the right
 * - Hover tooltips for details
 * - "Manage Models..." footer action
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Check,
  Settings2,
  Wrench,
} from 'lucide-react';
import { modelSupportsTools } from '../../services/model-registry';
import type { ModelInfo } from '../../types/domain-config';

// Source provider order (actual backend providers within CLI Proxy)
const SOURCE_ORDER = ['claude', 'openai', 'gemini', 'antigravity', 'github-copilot', 'kiro', 'qwen', 'deepseek', 'lmstudio', 'other'] as const;
type SourceKey = typeof SOURCE_ORDER[number];

// Source provider labels and colors - the ACTUAL backend serving the model
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  'antigravity': { label: 'Antigravity', color: '#f97316' },
  'claude': { label: 'Claude', color: '#d97706' },
  'openai': { label: 'OpenAI', color: '#10a37f' },
  'github-copilot': { label: 'Copilot', color: '#6e7681' },
  'copilot': { label: 'Copilot', color: '#6e7681' },  // Alias
  'kiro': { label: 'Kiro', color: '#ff9900' },
  'aws': { label: 'Kiro', color: '#ff9900' },  // API returns 'aws' for Kiro/CodeWhisperer
  'gemini': { label: 'Gemini', color: '#4285f4' },
  'google': { label: 'Gemini', color: '#4285f4' },  // Alias
  'qwen': { label: 'Qwen', color: '#6366f1' },
  'deepseek': { label: 'DeepSeek', color: '#3b82f6' },
  'lmstudio': { label: 'LM Studio', color: '#22c55e' },
  'gateway-auto': { label: 'Gateway', color: '#8b5cf6' },
  'other': { label: 'Other', color: '#6e6e6e' },
};

// Get the source label for display (actual backend provider)
function getSourceLabel(model: ModelInfo): { label: string; color: string } {
  // Use source if available (for cliproxyapi models), otherwise use provider directly
  const sourceKey = model.source || model.provider;
  return SOURCE_LABELS[sourceKey] || SOURCE_LABELS['other'];
}

// Normalize source aliases for consistent grouping
const SOURCE_ALIASES: Record<string, string> = {
  'aws': 'kiro',           // AWS/Kiro/CodeWhisperer
  'copilot': 'github-copilot',
  'google': 'gemini',
};

// Get source key for grouping (normalized)
function getSourceKey(model: ModelInfo): string {
  const rawSource = model.source || model.provider;
  return SOURCE_ALIASES[rawSource] || rawSource;
}

interface ModelSelectorProps {
  models: ModelInfo[];
  selectedModelId: string;
  selectedProvider?: string;
  onModelSelect: (modelId: string, provider: string) => void;
  disabled?: boolean;
  showToolsOnly?: boolean;
}

// Format context window for display
function formatContextWindow(tokens: number | undefined): string {
  if (!tokens) return '';
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

// Sort and group models by source provider (actual backend)
function sortModelsBySource(models: ModelInfo[]): { source: SourceKey; models: ModelInfo[] }[] {
  const groups = new Map<SourceKey, ModelInfo[]>();

  for (const model of models) {
    const source = getSourceKey(model) as SourceKey;
    if (!groups.has(source)) {
      groups.set(source, []);
    }
    groups.get(source)!.push(model);
  }

  // Return in defined order
  const result: { source: SourceKey; models: ModelInfo[] }[] = [];
  for (const source of SOURCE_ORDER) {
    if (groups.has(source) && groups.get(source)!.length > 0) {
      result.push({ source, models: groups.get(source)! });
    }
  }

  // Add any sources not in the predefined order
  for (const [source, sourceModels] of groups) {
    if (!SOURCE_ORDER.includes(source as SourceKey) && sourceModels.length > 0) {
      result.push({ source: source as SourceKey, models: sourceModels });
    }
  }

  return result;
}

export function ModelSelector({
  models,
  selectedModelId,
  selectedProvider,
  onModelSelect,
  disabled = false,
  showToolsOnly = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Find selected model
  const selectedModel = useMemo(
    () => models.find(m => m.id === selectedModelId),
    [models, selectedModelId]
  );

  // Filter and deduplicate models (keep unique source+modelId combos)
  const filteredModels = useMemo(() => {
    let result = models;

    // Filter by tool support if enabled
    if (showToolsOnly) {
      result = result.filter(m => modelSupportsTools(m.id));
    }

    // Deduplicate by source+modelId (same model from same source = duplicate)
    // This allows gpt-5 from 'openai' AND gpt-5 from 'github-copilot' to both appear
    const seen = new Set<string>();
    result = result.filter(m => {
      const source = getSourceKey(m);
      const key = `${source}:${m.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return result;
  }, [models, showToolsOnly]);

  // Group models by source provider
  const groupedModels = useMemo(
    () => sortModelsBySource(filteredModels),
    [filteredModels]
  );

  // Flatten for keyboard navigation
  const flatModels = useMemo(() => {
    const flat: ModelInfo[] = [];
    for (const group of groupedModels) {
      flat.push(...group.models);
    }
    return flat;
  }, [groupedModels]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < flatModels.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : flatModels.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && flatModels[highlightedIndex]) {
          const m = flatModels[highlightedIndex];
          onModelSelect(m.id, m.provider);
          setIsOpen(false);
        }
        break;
    }
  }, [isOpen, flatModels, highlightedIndex, onModelSelect]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-model-item]');
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  // Get hovered model for tooltip
  const hoveredModel = hoveredId ? models.find(m => m.id === hoveredId) : null;

  return (
    <div
      ref={containerRef}
      className="model-selector-container"
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`model-selector-trigger ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="model-selector-name">
          {selectedModel?.name || 'Select model'}
        </span>
        <ChevronDown className={`model-selector-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {/* Dropdown - opens upward from bottom bar */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="model-selector-dropdown"
          >
            {/* Model List */}
            <div ref={listRef} className="model-selector-list" role="listbox">
              {filteredModels.length === 0 ? (
                <div className="model-selector-empty">No models available</div>
              ) : (
                groupedModels.map((group, groupIndex) => (
                  <div key={group.source} className="model-selector-group">
                    {/* Divider with source name (except first) */}
                    {groupIndex > 0 && (
                      <div className="model-selector-divider">
                        <span>{SOURCE_LABELS[group.source]?.label || group.source}</span>
                      </div>
                    )}
                    {groupIndex === 0 && (
                      <div className="model-selector-divider first">
                        <span>{SOURCE_LABELS[group.source]?.label || group.source}</span>
                      </div>
                    )}

                    {/* Models in group */}
                    {group.models.map((model, idx) => {
                      // Check selection - match both ID and provider if provider specified
                      const isSelected = selectedProvider
                        ? model.id === selectedModelId && model.provider === selectedProvider
                        : model.id === selectedModelId;
                      const flatIndex = flatModels.indexOf(model);
                      const isHighlighted = flatIndex === highlightedIndex;
                      const supportsTools = modelSupportsTools(model.id);
                      // Use composite key to handle same model from multiple providers
                      const uniqueKey = `${model.provider}-${model.id}-${idx}`;

                      const sourceInfo = getSourceLabel(model);

                      return (
                        <button
                          key={uniqueKey}
                          data-model-item
                          onClick={() => {
                            onModelSelect(model.id, model.provider);
                            setIsOpen(false);
                          }}
                          onMouseEnter={() => setHoveredId(uniqueKey)}
                          onMouseLeave={() => setHoveredId(null)}
                          className={`model-selector-item ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                          role="option"
                          aria-selected={isSelected}
                        >
                          {/* Model name */}
                          <span className="model-selector-item-name">
                            {model.name}
                          </span>

                          {/* Right side: source badge, tools, context */}
                          <span className="model-selector-item-info">
                            {/* Source badge - shows actual backend provider */}
                            <span
                              className="model-selector-item-source"
                              style={{ color: sourceInfo.color }}
                            >
                              {sourceInfo.label}
                            </span>
                            {supportsTools && (
                              <Wrench className="model-selector-item-tools" />
                            )}
                            {model.contextWindow && (
                              <span className="model-selector-item-ctx">
                                {formatContextWindow(model.contextWindow)}
                              </span>
                            )}
                          </span>

                          {/* Check mark for selected */}
                          {isSelected && (
                            <Check className="model-selector-item-check" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Tooltip for hovered model */}
            <AnimatePresence>
              {hoveredModel && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="model-selector-tooltip"
                >
                  <span className="model-selector-tooltip-name">{hoveredModel.name}</span>
                  <span className="model-selector-tooltip-id">({hoveredModel.id})</span>
                  {hoveredModel.contextWindow && (
                    <span className="model-selector-tooltip-ctx">
                      {formatContextWindow(hoveredModel.contextWindow)} context
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer */}
            <div className="model-selector-footer">
              <button
                className="model-selector-manage"
                onClick={() => {
                  // Use Electron shell to open in default browser
                  const electronAPI = (window as any).electronAPI;
                  if (electronAPI?.shell?.openExternal) {
                    electronAPI.shell.openExternal('http://127.0.0.1:8317/management.html');
                  } else {
                    // Fallback for non-Electron or missing API
                    window.open('http://127.0.0.1:8317/management.html', '_blank');
                  }
                }}
              >
                <Settings2 className="w-3 h-3" />
                <span>Manage Models...</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ModelSelector;
