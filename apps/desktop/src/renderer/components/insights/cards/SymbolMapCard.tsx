/**
 * SymbolMapCard - Rich visualization card for k_repo_intel symbol results
 *
 * Displays:
 * - Query and action performed
 * - Symbols grouped by kind (functions, classes, etc.)
 * - File paths with line numbers
 * - Signatures with syntax highlighting
 * - Click to navigate (via IPC to open file at line)
 * - Copy symbol paths action
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Code2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  FileCode,
  Box,
  Braces,
  Variable,
  Package,
  ExternalLink,
} from 'lucide-react';
import type { SymbolMapData, SymbolEntry, SymbolKind } from '../../../types/insights';

interface SymbolMapCardProps {
  data: SymbolMapData;
  collapsed?: boolean;
}

// Icon and color mapping for symbol kinds
const SYMBOL_KIND_CONFIG: Record<SymbolKind, { icon: React.ElementType; color: string; label: string }> = {
  function: { icon: Code2, color: 'text-purple-400', label: 'Functions' },
  class: { icon: Box, color: 'text-yellow-400', label: 'Classes' },
  interface: { icon: Braces, color: 'text-cyan-400', label: 'Interfaces' },
  variable: { icon: Variable, color: 'text-blue-400', label: 'Variables' },
  type: { icon: Braces, color: 'text-teal-400', label: 'Types' },
  method: { icon: Code2, color: 'text-indigo-400', label: 'Methods' },
  property: { icon: Variable, color: 'text-orange-400', label: 'Properties' },
  module: { icon: Package, color: 'text-green-400', label: 'Modules' },
  unknown: { icon: FileCode, color: 'text-muted-foreground', label: 'Other' },
};

function SymbolItem({ symbol, onNavigate }: { symbol: SymbolEntry; onNavigate: (file: string, line: number) => void }) {
  const config = SYMBOL_KIND_CONFIG[symbol.kind] || SYMBOL_KIND_CONFIG.unknown;
  const Icon = config.icon;

  const handleClick = () => {
    if (symbol.file && symbol.line) {
      onNavigate(symbol.file, symbol.line);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/30 transition-colors text-left group"
      title={symbol.docstring || `${symbol.name} in ${symbol.file}:${symbol.line}`}
    >
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-foreground truncate">
            {symbol.name}
          </span>
          {symbol.signature && (
            <span className="text-xs text-muted-foreground font-mono truncate hidden sm:inline">
              {symbol.signature.length > 60 ? symbol.signature.slice(0, 60) + '...' : symbol.signature}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-mono truncate">{symbol.file}</span>
          {symbol.line > 0 && (
            <span className="text-primary">:{symbol.line}</span>
          )}
          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </button>
  );
}

function SymbolGroup({
  kind,
  symbols,
  onNavigate,
  defaultExpanded = true,
}: {
  kind: SymbolKind;
  symbols: SymbolEntry[];
  onNavigate: (file: string, line: number) => void;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const config = SYMBOL_KIND_CONFIG[kind] || SYMBOL_KIND_CONFIG.unknown;
  const Icon = config.icon;

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors"
      >
        <Icon className={`w-4 h-4 ${config.color}`} />
        <span className="text-sm font-medium text-foreground">{config.label}</span>
        <span className="text-xs text-muted-foreground">({symbols.length})</span>
        <span className="flex-1" />
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {isExpanded && (
        <div className="px-1 pb-2 space-y-0.5 max-h-60 overflow-y-auto">
          {symbols.map((symbol, idx) => (
            <SymbolItem
              key={`${symbol.name}-${symbol.file}-${symbol.line}-${idx}`}
              symbol={symbol}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SymbolMapCard({ data, collapsed: initialCollapsed = false }: SymbolMapCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [copied, setCopied] = useState(false);

  // Group symbols by kind
  const groupedSymbols = useMemo(() => {
    const groups: Partial<Record<SymbolKind, SymbolEntry[]>> = {};
    for (const symbol of data.symbols) {
      const kind = symbol.kind || 'unknown';
      if (!groups[kind]) {
        groups[kind] = [];
      }
      groups[kind]!.push(symbol);
    }
    return groups;
  }, [data.symbols]);

  // Order for display (most important first)
  const kindOrder: SymbolKind[] = ['function', 'class', 'interface', 'type', 'method', 'variable', 'property', 'module', 'unknown'];
  const sortedKinds = kindOrder.filter(kind => groupedSymbols[kind]?.length);

  const handleNavigate = useCallback((file: string, line: number) => {
    // Use Electron IPC to open file at line
    (window as any).electronAPI?.fs?.openFileAtLine?.(file, line).catch((err: Error) => {
      console.warn('[SymbolMapCard] Failed to open file:', err);
    });
  }, []);

  const handleCopyPaths = useCallback(() => {
    const paths = data.symbols.map(s => s.line > 0 ? `${s.file}:${s.line}` : s.file).join('\n');
    navigator.clipboard.writeText(paths);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data.symbols]);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Code2 className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-foreground">Symbol Map</span>
        <span className="text-xs text-muted-foreground">
          ({data.totalSymbols || data.symbols.length} symbols)
        </span>
        {data.action && data.action !== 'symbols' && (
          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px]">
            {data.action}
          </span>
        )}
        <span className="flex-1" />
        <span className="text-muted-foreground">
          {isCollapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </span>
      </button>

      {/* Body */}
      {!isCollapsed && (
        <div className="p-3 space-y-3">
          {/* Query info */}
          {data.query && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono truncate">{data.query}</span>
            </div>
          )}

          {/* Symbol groups */}
          <div className="space-y-2">
            {sortedKinds.map((kind, idx) => (
              <SymbolGroup
                key={kind}
                kind={kind}
                symbols={groupedSymbols[kind]!}
                onNavigate={handleNavigate}
                defaultExpanded={idx < 2} // Expand first 2 groups by default
              />
            ))}
          </div>

          {/* Footer stats & actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Code2 className="w-3 h-3" />
                {data.symbols.length} symbols
              </span>
              {data.filesSearched !== undefined && (
                <span className="flex items-center gap-1">
                  <FileCode className="w-3 h-3" />
                  {data.filesSearched} files
                </span>
              )}
            </div>
            <button
              onClick={handleCopyPaths}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-green-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
