/**
 * ReferencesPanel - Find all references to a symbol using k_rag
 * T422: Find References
 */

import { useState, useCallback, useMemo } from 'react';
import { useCodeEditorStore } from '../../stores/code-editor-store';
import { toast } from '../ui/toaster';
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
  FileText,
  MapPin,
  ExternalLink,
  Copy,
} from 'lucide-react';

interface Reference {
  file: string;
  line: number;
  content: string;
  score?: number;
}

interface ReferencesByFile {
  [filePath: string]: Reference[];
}

interface ReferencesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialSymbol?: string;
  onNavigateToReference?: (filePath: string, line: number) => void;
}

export function ReferencesPanel({ isOpen, onClose, initialSymbol, onNavigateToReference }: ReferencesPanelProps) {
  const { projectRoot, openFile } = useCodeEditorStore();

  const [searchSymbol, setSearchSymbol] = useState(initialSymbol || '');
  const [references, setReferences] = useState<Reference[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [lastSearchedSymbol, setLastSearchedSymbol] = useState('');

  // Search for references using k_rag
  const searchReferences = useCallback(async (symbol?: string) => {
    const query = symbol || searchSymbol;
    if (!query.trim()) {
      toast.error('Please enter a symbol name');
      return;
    }

    setIsSearching(true);
    setLastSearchedSymbol(query);

    try {
      // Use k_rag to search for the symbol
      const result = await window.electronAPI?.mcp?.call?.('k_rag', {
        action: 'query',
        query: query,
        top_k: 50,
      });

      const resultData = result?.result as { results?: Array<{ file?: string; path?: string; line?: number; content?: string; text?: string; snippet?: string; score?: number }> } | undefined;
      if (result?.ok && resultData?.results) {
        const refs: Reference[] = resultData.results.map((r) => ({
          file: r.file || r.path || 'unknown',
          line: r.line || 1,
          content: r.content || r.text || r.snippet || '',
          score: r.score,
        }));

        setReferences(refs);

        // Auto-expand first few files
        const files = [...new Set(refs.map(r => r.file))].slice(0, 3);
        setExpandedFiles(new Set(files));

        if (refs.length === 0) {
          toast.info('No references found');
        } else {
          toast.success(`Found ${refs.length} references`);
        }
      } else {
        setReferences([]);
        toast.error('Search failed');
      }
    } catch (err) {
      console.error('[ReferencesPanel] Search error:', err);
      toast.error('Failed to search references');
      setReferences([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchSymbol]);

  // Group references by file
  const groupedReferences = useMemo(() => {
    const groups: ReferencesByFile = {};
    references.forEach(ref => {
      const file = ref.file;
      if (!groups[file]) {
        groups[file] = [];
      }
      groups[file].push(ref);
    });

    // Sort references within each file by line number
    Object.values(groups).forEach(refs => {
      refs.sort((a, b) => a.line - b.line);
    });

    return groups;
  }, [references]);

  // Toggle file expansion
  const toggleFile = (filePath: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  // Handle reference click
  const handleReferenceClick = async (ref: Reference) => {
    if (onNavigateToReference) {
      onNavigateToReference(ref.file, ref.line);
      return;
    }

    // Try to open the file
    let fullPath = ref.file;
    if (!fullPath.includes(':') && projectRoot) {
      fullPath = `${projectRoot}/${ref.file}`.replace(/\\/g, '/');
    }

    try {
      const content = await window.electronAPI?.fs?.readFile?.(fullPath);
      if (typeof content === 'string') {
        openFile(fullPath, content);
        toast.success(`Opened at line ${ref.line}`);
      }
    } catch (err) {
      toast.error('Failed to open file');
    }
  };

  // Copy reference location
  const copyReference = (ref: Reference) => {
    const text = `${ref.file}:${ref.line}`;
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  // Handle keyboard submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchReferences();
    }
  };

  // Get short file name
  const getShortPath = (path: string) => {
    const parts = path.split('/');
    if (parts.length > 3) {
      return `.../${parts.slice(-2).join('/')}`;
    }
    return path;
  };

  // Highlight the search term in content
  const highlightContent = (content: string, symbol: string) => {
    if (!symbol) return content;
    const regex = new RegExp(`(${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = content.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <span key={i} className="bg-yellow-500/30 text-yellow-200 font-medium">{part}</span>
      ) : (
        part
      )
    );
  };

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-card/50 border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">References</span>
          {references.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({references.length} in {Object.keys(groupedReferences).length} files)
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Symbol name..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
          <button
            onClick={() => searchReferences()}
            disabled={isSearching || !searchSymbol.trim()}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSearching ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              'Search'
            )}
          </button>
        </div>
        {lastSearchedSymbol && lastSearchedSymbol !== searchSymbol && (
          <div className="mt-1 text-[10px] text-muted-foreground">
            Results for: "{lastSearchedSymbol}"
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : references.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            {lastSearchedSymbol
              ? `No references found for "${lastSearchedSymbol}"`
              : 'Enter a symbol name to search'
            }
          </div>
        ) : (
          <div className="py-1">
            {Object.entries(groupedReferences).map(([filePath, refs]) => {
              const isExpanded = expandedFiles.has(filePath);

              return (
                <div key={filePath} className="border-b border-border/30 last:border-b-0">
                  {/* File header */}
                  <button
                    onClick={() => toggleFile(filePath)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    )}
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium truncate flex-1 text-left" title={filePath}>
                      {getShortPath(filePath)}
                    </span>
                    <span className="text-muted-foreground">({refs.length})</span>
                  </button>

                  {/* References list */}
                  {isExpanded && (
                    <div className="pl-6">
                      {refs.map((ref, idx) => (
                        <div
                          key={`${ref.line}-${idx}`}
                          className="flex items-start gap-2 px-3 py-1.5 text-xs hover:bg-muted/30 transition-colors group"
                        >
                          <button
                            onClick={() => handleReferenceClick(ref)}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-primary font-mono">:{ref.line}</span>
                              {ref.score && (
                                <span className="text-muted-foreground/50 text-[10px]">
                                  ({(ref.score * 100).toFixed(0)}%)
                                </span>
                              )}
                            </div>
                            <p className="text-muted-foreground truncate group-hover:text-foreground transition-colors font-mono text-[11px]">
                              {highlightContent(ref.content.trim().substring(0, 200), lastSearchedSymbol)}
                            </p>
                          </button>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => copyReference(ref)}
                              className="p-1 rounded hover:bg-muted"
                              title="Copy location"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleReferenceClick(ref)}
                              className="p-1 rounded hover:bg-muted"
                              title="Open file"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
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
        <span>k_rag search</span>
        <span className="text-muted-foreground/60">Enter to search</span>
      </div>
    </div>
  );
}
