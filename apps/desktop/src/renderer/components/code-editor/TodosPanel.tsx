/**
 * TodosPanel - Display TODO/FIXME/HACK comments from codebase
 * T416: TODO Scanner Integration
 * T417: TODO Filters and Search
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCodeEditorStore } from '../../stores/code-editor-store';
import { toast } from '../ui/toaster';
import {
  ListTodo,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Filter,
  Search,
  X,
  AlertTriangle,
  Bug,
  Lightbulb,
  MessageSquare,
  Wrench,
  User,
  AlertCircle,
} from 'lucide-react';

// Pattern categories with icons and colors
const PATTERN_CONFIG: Record<string, { icon: React.ElementType; color: string; priority: number }> = {
  'TODO': { icon: ListTodo, color: 'text-blue-500', priority: 2 },
  'FIXME': { icon: AlertTriangle, color: 'text-red-500', priority: 1 },
  'BUG': { icon: Bug, color: 'text-red-500', priority: 1 },
  'HACK': { icon: Wrench, color: 'text-orange-500', priority: 2 },
  'XXX': { icon: AlertCircle, color: 'text-yellow-500', priority: 2 },
  'NOTE:': { icon: Lightbulb, color: 'text-green-500', priority: 3 },
  'WARN:': { icon: AlertTriangle, color: 'text-yellow-500', priority: 2 },
  '@Ryan': { icon: User, color: 'text-purple-500', priority: 1 },
  '@Buddy': { icon: User, color: 'text-cyan-500', priority: 1 },
  '@AI': { icon: User, color: 'text-pink-500', priority: 1 },
};

interface TodoItem {
  line: number;
  pattern: string;
  text: string;
}

interface TodosByFile {
  [filePath: string]: TodoItem[];
}

interface TodosByApp {
  [appName: string]: TodosByFile;
}

interface TodosData {
  total_matches: number;
  by_pattern: Record<string, number>;
  by_app: Record<string, number>;
  backlog: TodosByApp;
}

interface TodosPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TodosPanel({ isOpen, onClose }: TodosPanelProps) {
  const { projectRoot, openFile } = useCodeEditorStore();

  const [todosData, setTodosData] = useState<TodosData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set(['desktop', 'gateway']));
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // T417: Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatterns, setSelectedPatterns] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Fetch TODOs from k_repo_intel
  const fetchTodos = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI?.mcp?.call?.('k_repo_intel', {
        action: 'get',
        report: 'todos',
        limit: 500,
      });

      const resultData = result?.result as { data?: TodosData } | undefined;
      if (result?.ok && resultData?.data) {
        setTodosData(resultData.data);
      } else {
        toast.error('Failed to fetch TODOs');
      }
    } catch (err) {
      console.error('[TodosPanel] Fetch error:', err);
      toast.error('Failed to fetch TODOs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount and when panel opens
  useEffect(() => {
    if (isOpen && !todosData) {
      fetchTodos();
    }
  }, [isOpen, todosData, fetchTodos]);

  // Handle file click - open file at line
  const handleTodoClick = useCallback(async (appName: string, filePath: string, line: number) => {
    // Build full path
    let fullPath = filePath;
    if (appName !== 'root') {
      fullPath = `apps/${appName}/${filePath}`;
    }
    fullPath = `${projectRoot}/${fullPath}`.replace(/\\/g, '/');

    try {
      const content = await window.electronAPI?.fs?.readFile?.(fullPath);
      if (typeof content === 'string') {
        openFile(fullPath, content);
        // TODO: Jump to line (would need editor integration)
        toast.success(`Opened at line ${line}`);
      }
    } catch (err) {
      toast.error('Failed to open file');
    }
  }, [projectRoot, openFile]);

  // Toggle app expansion
  const toggleApp = (appName: string) => {
    setExpandedApps(prev => {
      const next = new Set(prev);
      if (next.has(appName)) {
        next.delete(appName);
      } else {
        next.add(appName);
      }
      return next;
    });
  };

  // Toggle file expansion
  const toggleFile = (fileKey: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileKey)) {
        next.delete(fileKey);
      } else {
        next.add(fileKey);
      }
      return next;
    });
  };

  // Toggle pattern filter
  const togglePattern = (pattern: string) => {
    setSelectedPatterns(prev => {
      const next = new Set(prev);
      if (next.has(pattern)) {
        next.delete(pattern);
      } else {
        next.add(pattern);
      }
      return next;
    });
  };

  // Filter TODOs based on search and pattern filters
  const filteredData = useMemo(() => {
    if (!todosData) return null;

    const filtered: TodosByApp = {};
    const searchLower = searchQuery.toLowerCase();

    for (const [appName, files] of Object.entries(todosData.backlog)) {
      const filteredFiles: TodosByFile = {};

      for (const [filePath, todos] of Object.entries(files)) {
        const filteredTodos = todos.filter(todo => {
          // Pattern filter
          if (selectedPatterns.size > 0 && !selectedPatterns.has(todo.pattern)) {
            return false;
          }
          // Search filter
          if (searchQuery && !todo.text.toLowerCase().includes(searchLower) &&
              !filePath.toLowerCase().includes(searchLower)) {
            return false;
          }
          return true;
        });

        if (filteredTodos.length > 0) {
          filteredFiles[filePath] = filteredTodos;
        }
      }

      if (Object.keys(filteredFiles).length > 0) {
        filtered[appName] = filteredFiles;
      }
    }

    return filtered;
  }, [todosData, searchQuery, selectedPatterns]);

  // Count filtered items
  const filteredCount = useMemo(() => {
    if (!filteredData) return 0;
    let count = 0;
    for (const files of Object.values(filteredData)) {
      for (const todos of Object.values(files)) {
        count += todos.length;
      }
    }
    return count;
  }, [filteredData]);

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-card/50 border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">TODOs</span>
          {todosData && (
            <span className="text-xs text-muted-foreground">
              ({filteredCount}{selectedPatterns.size > 0 || searchQuery ? ` / ${todosData.total_matches}` : ''})
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
            onClick={fetchTodos}
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

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search TODOs..."
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

      {/* Pattern filters */}
      {showFilters && todosData && (
        <div className="px-3 py-2 border-b border-border/50 space-y-2">
          <div className="text-xs text-muted-foreground">Filter by type:</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(todosData.by_pattern).map(([pattern, count]) => {
              const config = PATTERN_CONFIG[pattern] || { icon: MessageSquare, color: 'text-muted-foreground', priority: 3 };
              const Icon = config.icon;
              const isSelected = selectedPatterns.has(pattern);

              return (
                <button
                  key={pattern}
                  onClick={() => togglePattern(pattern)}
                  className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded border transition-colors ${
                    isSelected
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'border-border hover:border-muted-foreground/50'
                  }`}
                >
                  <Icon className={`w-3 h-3 ${config.color}`} />
                  <span>{pattern}</span>
                  <span className="text-muted-foreground">({count})</span>
                </button>
              );
            })}
          </div>
          {selectedPatterns.size > 0 && (
            <button
              onClick={() => setSelectedPatterns(new Set())}
              className="text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && !todosData ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !filteredData || Object.keys(filteredData).length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            {searchQuery || selectedPatterns.size > 0 ? 'No matching TODOs' : 'No TODOs found'}
          </div>
        ) : (
          <div className="py-1">
            {Object.entries(filteredData).map(([appName, files]) => {
              const appExpanded = expandedApps.has(appName);
              const fileCount = Object.keys(files).length;
              const todoCount = Object.values(files).reduce((sum, todos) => sum + todos.length, 0);

              return (
                <div key={appName} className="border-b border-border/30 last:border-b-0">
                  {/* App header */}
                  <button
                    onClick={() => toggleApp(appName)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                  >
                    {appExpanded ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    )}
                    <span className="font-medium">{appName === 'root' ? 'Project Root' : `apps/${appName}`}</span>
                    <span className="text-muted-foreground ml-auto">
                      {todoCount} in {fileCount} file{fileCount !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {/* Files */}
                  {appExpanded && (
                    <div className="pl-4">
                      {Object.entries(files).map(([filePath, todos]) => {
                        const fileKey = `${appName}/${filePath}`;
                        const fileExpanded = expandedFiles.has(fileKey);

                        return (
                          <div key={fileKey}>
                            {/* File header */}
                            <button
                              onClick={() => toggleFile(fileKey)}
                              className="flex items-center gap-2 w-full px-3 py-1 text-xs hover:bg-muted/30 transition-colors"
                            >
                              {fileExpanded ? (
                                <ChevronDown className="w-3 h-3 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                              )}
                              <FileText className="w-3 h-3 text-muted-foreground" />
                              <span className="truncate flex-1 text-left">{filePath}</span>
                              <span className="text-muted-foreground">({todos.length})</span>
                            </button>

                            {/* TODO items */}
                            {fileExpanded && (
                              <div className="pl-8">
                                {todos.map((todo, idx) => {
                                  const config = PATTERN_CONFIG[todo.pattern] || { icon: MessageSquare, color: 'text-muted-foreground', priority: 3 };
                                  const Icon = config.icon;

                                  return (
                                    <button
                                      key={idx}
                                      onClick={() => handleTodoClick(appName, filePath, todo.line)}
                                      className="flex items-start gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/30 transition-colors text-left group"
                                    >
                                      <Icon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${config.color}`} />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className={`font-medium ${config.color}`}>{todo.pattern}</span>
                                          <span className="text-muted-foreground">:{todo.line}</span>
                                        </div>
                                        <p className="text-muted-foreground truncate group-hover:text-foreground transition-colors">
                                          {todo.text.replace(new RegExp(`^.*?${todo.pattern}:?\\s*`, 'i'), '').substring(0, 100)}
                                        </p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {todosData && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border flex items-center justify-between">
          <span>{todosData.total_matches} TODOs across {Object.keys(todosData.by_app).length} apps</span>
          <div className="flex items-center gap-2">
            {todosData.by_pattern['FIXME'] && (
              <span className="text-red-500">{todosData.by_pattern['FIXME']} FIXME</span>
            )}
            {todosData.by_pattern['BUG'] && (
              <span className="text-red-500">{todosData.by_pattern['BUG']} BUG</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
