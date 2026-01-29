/**
 * SymbolOutlinePanel - Display symbols (functions/classes/variables) for current file
 * T420: Symbol Outline Panel
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCodeEditorStore } from '../../stores/code-editor-store';
import { toast } from '../ui/toaster';
import {
  Code2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
  Search,
  Filter,
  FunctionSquare,
  Box,
  Variable,
  Hash,
  Braces,
  FileCode,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';

// Symbol kinds with icons and colors
const SYMBOL_KIND_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  'function': { icon: FunctionSquare, color: 'text-blue-500', label: 'Functions' },
  'class': { icon: Box, color: 'text-yellow-500', label: 'Classes' },
  'component': { icon: Sparkles, color: 'text-purple-500', label: 'Components' },
  'variable': { icon: Variable, color: 'text-green-500', label: 'Variables' },
  'constant': { icon: Hash, color: 'text-orange-500', label: 'Constants' },
  'interface': { icon: Braces, color: 'text-cyan-500', label: 'Interfaces' },
  'type': { icon: FileCode, color: 'text-pink-500', label: 'Types' },
};

interface Symbol {
  app: string;
  exported: boolean;
  file: string;
  kind: string;
  line: number;
  module: string;
  name: string;
}

interface SymbolMapData {
  generated_at: string;
  schema_version: number;
  symbols: Symbol[];
}

interface SymbolOutlinePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToLine?: (line: number) => void;
}

export function SymbolOutlinePanel({ isOpen, onClose, onNavigateToLine }: SymbolOutlinePanelProps) {
  const { openFiles, activeFileIndex, projectRoot } = useCodeEditorStore();

  const [allSymbols, setAllSymbols] = useState<Symbol[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showExportedOnly, setShowExportedOnly] = useState(false);
  const [expandedKinds, setExpandedKinds] = useState<Set<string>>(new Set(['function', 'class', 'component']));

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  // Get relative path from active file
  const activeFilePath = useMemo(() => {
    if (!activeFile || !projectRoot) return null;
    // Convert absolute path to relative
    let relativePath = activeFile.path.replace(/\\/g, '/');
    const rootNorm = projectRoot.replace(/\\/g, '/');
    if (relativePath.startsWith(rootNorm)) {
      relativePath = relativePath.slice(rootNorm.length);
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.slice(1);
      }
    }
    return relativePath;
  }, [activeFile, projectRoot]);

  // Fetch all symbols from k_repo_intel
  const fetchSymbols = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI?.mcp?.call?.('k_repo_intel', {
        action: 'get',
        report: 'symbol_map',
        limit: 5000,
      });

      const resultData = result?.result as { data?: { symbols?: Symbol[] } } | undefined;
      if (result?.ok && resultData?.data?.symbols) {
        setAllSymbols(resultData.data.symbols);
      } else {
        toast.error('Failed to fetch symbols');
      }
    } catch (err) {
      console.error('[SymbolOutlinePanel] Fetch error:', err);
      toast.error('Failed to fetch symbols');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount and when panel opens
  useEffect(() => {
    if (isOpen && allSymbols.length === 0) {
      fetchSymbols();
    }
  }, [isOpen, allSymbols.length, fetchSymbols]);

  // Filter symbols for current file
  const fileSymbols = useMemo(() => {
    if (!activeFilePath || allSymbols.length === 0) return [];

    return allSymbols.filter(sym => {
      // Match file path
      const symPath = sym.file.replace(/\\/g, '/');
      if (!symPath.endsWith(activeFilePath) && !activeFilePath.endsWith(symPath)) {
        // Try partial match
        const symFileName = symPath.split('/').pop();
        const activeFileName = activeFilePath.split('/').pop();
        if (symFileName !== activeFileName) return false;
      }
      return true;
    });
  }, [allSymbols, activeFilePath]);

  // Apply filters
  const filteredSymbols = useMemo(() => {
    let symbols = fileSymbols;

    // Search filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      symbols = symbols.filter(sym =>
        sym.name.toLowerCase().includes(searchLower)
      );
    }

    // Kind filter
    if (selectedKinds.size > 0) {
      symbols = symbols.filter(sym => selectedKinds.has(sym.kind));
    }

    // Exported only filter
    if (showExportedOnly) {
      symbols = symbols.filter(sym => sym.exported);
    }

    // Sort by line number
    return symbols.sort((a, b) => a.line - b.line);
  }, [fileSymbols, searchQuery, selectedKinds, showExportedOnly]);

  // Group by kind
  const groupedSymbols = useMemo(() => {
    const groups: Record<string, Symbol[]> = {};
    filteredSymbols.forEach(sym => {
      if (!groups[sym.kind]) {
        groups[sym.kind] = [];
      }
      groups[sym.kind].push(sym);
    });
    return groups;
  }, [filteredSymbols]);

  // Get unique kinds from file symbols
  const availableKinds = useMemo(() => {
    const kinds = new Set<string>();
    fileSymbols.forEach(sym => kinds.add(sym.kind));
    return Array.from(kinds).sort();
  }, [fileSymbols]);

  // Toggle kind filter
  const toggleKind = (kind: string) => {
    setSelectedKinds(prev => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  // Toggle kind expansion
  const toggleKindExpand = (kind: string) => {
    setExpandedKinds(prev => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  // Handle symbol click
  const handleSymbolClick = (symbol: Symbol) => {
    if (onNavigateToLine) {
      onNavigateToLine(symbol.line);
    }
    toast.success(`Jump to line ${symbol.line}`);
  };

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-card/50 border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Outline</span>
          {fileSymbols.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({filteredSymbols.length}{selectedKinds.size > 0 || searchQuery || showExportedOnly ? ` / ${fileSymbols.length}` : ''})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1 rounded hover:bg-muted transition-colors ${showFilters ? 'bg-muted text-primary' : ''}`}
            title="Toggle filters"
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fetchSymbols}
            disabled={isLoading}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Current file */}
      {activeFile && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border/50 truncate">
          {activeFilePath || activeFile.path.split(/[/\\]/).pop()}
        </div>
      )}

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search symbols..."
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-3 py-2 border-b border-border/50 space-y-2">
          {/* Kind filters */}
          <div className="text-xs text-muted-foreground">Filter by type:</div>
          <div className="flex flex-wrap gap-1">
            {availableKinds.map(kind => {
              const config = SYMBOL_KIND_CONFIG[kind] || { icon: Code2, color: 'text-muted-foreground', label: kind };
              const Icon = config.icon;
              const isSelected = selectedKinds.has(kind);
              const count = fileSymbols.filter(s => s.kind === kind).length;

              return (
                <button
                  key={kind}
                  onClick={() => toggleKind(kind)}
                  className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded border transition-colors ${
                    isSelected
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'border-border hover:border-muted-foreground/50'
                  }`}
                >
                  <Icon className={`w-3 h-3 ${config.color}`} />
                  <span>{kind}</span>
                  <span className="text-muted-foreground">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Exported only toggle */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={showExportedOnly}
              onChange={(e) => setShowExportedOnly(e.target.checked)}
              className="rounded border-border"
            />
            <Eye className="w-3 h-3 text-muted-foreground" />
            Show exported only
          </label>

          {(selectedKinds.size > 0 || showExportedOnly) && (
            <button
              onClick={() => {
                setSelectedKinds(new Set());
                setShowExportedOnly(false);
              }}
              className="text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && allSymbols.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !activeFile ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No file open
          </div>
        ) : filteredSymbols.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            {searchQuery || selectedKinds.size > 0 || showExportedOnly
              ? 'No matching symbols'
              : 'No symbols found in this file'
            }
          </div>
        ) : (
          <div className="py-1">
            {Object.entries(groupedSymbols).map(([kind, symbols]) => {
              const config = SYMBOL_KIND_CONFIG[kind] || { icon: Code2, color: 'text-muted-foreground', label: kind };
              const Icon = config.icon;
              const isExpanded = expandedKinds.has(kind);

              return (
                <div key={kind} className="border-b border-border/30 last:border-b-0">
                  {/* Kind header */}
                  <button
                    onClick={() => toggleKindExpand(kind)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    )}
                    <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                    <span className="font-medium capitalize">{config.label || kind}</span>
                    <span className="text-muted-foreground ml-auto">({symbols.length})</span>
                  </button>

                  {/* Symbols list */}
                  {isExpanded && (
                    <div className="pl-6">
                      {symbols.map((symbol, idx) => (
                        <button
                          key={`${symbol.name}-${symbol.line}-${idx}`}
                          onClick={() => handleSymbolClick(symbol)}
                          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/30 transition-colors text-left group"
                        >
                          <Icon className={`w-3 h-3 ${config.color} opacity-50`} />
                          <span className="flex-1 truncate group-hover:text-primary transition-colors">
                            {symbol.name}
                          </span>
                          {symbol.exported && (
                            <span title="Exported">
                              <Eye className="w-3 h-3 text-green-500/70" />
                            </span>
                          )}
                          <span className="text-muted-foreground">:{symbol.line}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border flex items-center justify-between">
        <span>{filteredSymbols.length} symbols</span>
        <span className="text-muted-foreground/60">k_repo_intel</span>
      </div>
    </div>
  );
}
