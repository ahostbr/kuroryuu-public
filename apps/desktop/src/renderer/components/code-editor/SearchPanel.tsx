/**
 * SearchPanel - Search across files in the project
 * Uses k_rag for indexed search
 */

import { useState, useCallback } from 'react';
import { Search, X, FileCode, Loader2, AlertCircle } from 'lucide-react';

interface SearchResult {
  file: string;
  line: number;
  content: string;
  score?: number;
}

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect?: (path: string, line?: number) => void;
  projectRoot?: string;
}

export function SearchPanel({ isOpen, onClose, onFileSelect, projectRoot }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTime, setSearchTime] = useState<number | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);
    setResults([]);
    const startTime = Date.now();

    try {
      // Use k_rag for searching
      const result = await window.electronAPI?.mcp?.call?.('k_rag', {
        action: 'query',
        query: query.trim(),
        top_k: 20,
        scope: 'project',
      });

      const resultData = result?.result as { results?: Array<{ file?: string; path?: string; line?: number; content?: string; text?: string; score?: number }> } | undefined;

      if (result?.ok && resultData?.results) {
        const searchResults: SearchResult[] = resultData.results.map((r) => ({
          file: r.file || r.path || 'unknown',
          line: r.line || 1,
          content: r.content || r.text || '',
          score: r.score,
        }));
        setResults(searchResults);
        setSearchTime(Date.now() - startTime);
      } else {
        setError(result?.error || 'No results found');
      }
    } catch (err) {
      console.error('[SearchPanel] Search failed:', err);
      setError('Search failed');
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleResultClick = (result: SearchResult) => {
    let fullPath = result.file;
    if (projectRoot && !fullPath.includes(':') && !fullPath.startsWith('/')) {
      fullPath = `${projectRoot}/${result.file}`.replace(/\\/g, '/');
    }
    onFileSelect?.(fullPath, result.line);
  };

  const shortenPath = (path: string) => {
    const parts = path.split(/[/\\]/);
    if (parts.length <= 3) return path;
    return `.../${parts.slice(-3).join('/')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Search
        </span>
        <button
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search input */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
            autoFocus
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-secondary border border-border rounded focus:outline-none focus:border-primary"
          />
          {isSearching && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Press Enter to search, Escape to close
        </p>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!error && results.length === 0 && !isSearching && query && (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            No results found
          </div>
        )}

        {!error && results.length === 0 && !query && (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            Enter a search term
          </div>
        )}

        {results.length > 0 && (
          <>
            {searchTime !== null && (
              <div className="px-3 py-1 text-[10px] text-muted-foreground border-b border-border">
                {results.length} results in {searchTime}ms
              </div>
            )}
            <div className="divide-y divide-border/50">
              {results.map((result, idx) => (
                <div
                  key={`${result.file}-${result.line}-${idx}`}
                  onClick={() => handleResultClick(result)}
                  className="px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    <span className="text-foreground truncate" title={result.file}>
                      {shortenPath(result.file)}
                    </span>
                    <span className="text-muted-foreground">:{result.line}</span>
                    {result.score !== undefined && (
                      <span className="text-[9px] text-muted-foreground ml-auto">
                        {(result.score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {result.content && (
                    <div className="mt-1 text-[11px] text-muted-foreground truncate font-mono">
                      {result.content.trim().substring(0, 100)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
