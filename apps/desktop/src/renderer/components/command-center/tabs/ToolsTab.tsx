/**
 * Tools Tab
 *
 * Card-based tool browser with real-time server health data.
 * Displays servers in compact grid, tools in list, and executor panel.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Wrench,
  Search,
  Server,
  Loader2,
  RefreshCw,
  Database,
  Inbox,
  FileCheck,
  Brain,
  Terminal,
  Eye,
  MessageSquare,
  Palette,
  Camera,
  Users,
  Lock,
  Activity,
  Clock,
  RotateCcw,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useToolExecution } from '../../../hooks/useCommandCenter';
import { useCommandCenterStore } from '../../../stores/command-center-store';
import { ToolExecutor } from '../tools/ToolExecutor';
import { cn } from '../../../lib/utils';
import type { ToolSchema, ToolCategory, ServerHealth } from '../../../types/command-center';

// Auto-refresh interval (30 seconds)
const SERVER_REFRESH_INTERVAL = 30000;

// ═══════════════════════════════════════════════════════════════════════════════
// Server Card Component (compact, real data)
// ═══════════════════════════════════════════════════════════════════════════════

function formatLastPing(lastPing?: string): string {
  if (!lastPing) return 'Never';
  const diffMs = Date.now() - new Date(lastPing).getTime();
  if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  return new Date(lastPing).toLocaleTimeString();
}

function getMetricIcon(serverId: string): React.ReactNode {
  const cls = 'w-3 h-3';
  switch (serverId) {
    case 'mcp-core': return <Wrench className={cls} />;
    case 'gateway': return <Users className={cls} />;
    case 'pty-daemon': return <Terminal className={cls} />;
    case 'cliproxy': return <Sparkles className={cls} />;
    default: return <Wrench className={cls} />;
  }
}

interface CompactServerCardProps {
  server: ServerHealth;
  onPing: () => void;
  onRestart: () => Promise<{ ok: boolean; error?: string }>;
}

function CompactServerCard({ server, onPing, onRestart }: CompactServerCardProps) {
  const [isRestarting, setIsRestarting] = useState(false);
  const { id, name, url, status, lastPing, responseTimeMs, error } = server;
  const isConnecting = status === 'connecting';

  const handleRestart = async () => {
    setIsRestarting(true);
    try { await onRestart(); } finally { setIsRestarting(false); }
  };

  const borderColor = status === 'connected'
    ? 'border-green-500/30'
    : status === 'error'
      ? 'border-red-500/30'
      : 'border-border';

  const bgColor = status === 'connected'
    ? 'bg-green-400/5'
    : status === 'error'
      ? 'bg-red-400/5'
      : 'bg-card/40';

  const dotColor = status === 'connected'
    ? 'bg-green-400'
    : status === 'connecting'
      ? 'bg-amber-400 animate-pulse'
      : status === 'error'
        ? 'bg-red-400'
        : 'bg-muted-foreground/50';

  const statusLabel = status === 'connected' ? 'Connected'
    : status === 'connecting' ? 'Connecting...'
    : status === 'error' ? 'Error'
    : 'Disconnected';

  return (
    <div className={cn('rounded-xl border p-4 transition-all', borderColor, bgColor)}>
      {/* Header: icon + name + status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'p-1.5 rounded-lg',
            status === 'connected' ? 'bg-green-400/15 text-green-400'
              : status === 'error' ? 'bg-red-400/15 text-red-400'
              : 'bg-secondary text-muted-foreground'
          )}>
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground leading-tight">{name}</h4>
            <p className="text-[10px] text-muted-foreground font-mono">{url}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', dotColor)} />
          <span className="text-[11px] text-muted-foreground">{statusLabel}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Activity className="w-3 h-3" />
          <span className="text-xs">Latency</span>
          <span className="text-xs font-semibold text-foreground ml-0.5">
            {responseTimeMs !== undefined ? `${responseTimeMs}ms` : '--'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span className="text-xs">Ping</span>
          <span className="text-xs font-semibold text-foreground ml-0.5">
            {formatLastPing(lastPing)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          {getMetricIcon(id)}
          <span className="text-xs">{server.metricLabel || 'Tools'}</span>
          <span className="text-xs font-semibold text-foreground ml-0.5">
            {(server.metricValue ?? server.toolCount) !== undefined
              ? (server.metricValue ?? server.toolCount)
              : '--'}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-1.5 p-2 mb-3 bg-red-400/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
          <p className="text-[11px] text-red-400 truncate">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={onPing}
          disabled={isConnecting || isRestarting}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
            isConnecting || isRestarting
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-secondary hover:bg-secondary/80 text-foreground'
          )}
        >
          <RefreshCw className={cn('w-3 h-3', isConnecting && 'animate-spin')} />
          Ping
        </button>
        <button
          onClick={handleRestart}
          disabled={isConnecting || isRestarting}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
            isConnecting || isRestarting
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30'
          )}
        >
          {isRestarting ? (
            <><Loader2 className="w-3 h-3 animate-spin" />Restarting</>
          ) : (
            <><RotateCcw className="w-3 h-3" />Restart</>
          )}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Category Icon (from MCPOverview)
// ═══════════════════════════════════════════════════════════════════════════════

function ToolCategoryIcon({ category, className }: { category: ToolCategory | string; className?: string }) {
  const iconClass = cn('w-4 h-4', className);

  switch (category) {
    case 'rag':
    case 'repo_intel':
      return <Search className={cn(iconClass, 'text-purple-400')} />;
    case 'inbox':
      return <Inbox className={cn(iconClass, 'text-blue-400')} />;
    case 'checkpoint':
      return <Database className={cn(iconClass, 'text-green-400')} />;
    case 'memory':
      return <Brain className={cn(iconClass, 'text-pink-400')} />;
    case 'files':
      return <FileCheck className={cn(iconClass, 'text-cyan-400')} />;
    case 'session':
      return <Terminal className={cn(iconClass, 'text-orange-400')} />;
    case 'canvas':
      return <Palette className={cn(iconClass, 'text-indigo-400')} />;
    case 'capture':
      return <Camera className={cn(iconClass, 'text-rose-400')} />;
    case 'pty':
      return <Terminal className={cn(iconClass, 'text-emerald-400')} />;
    case 'interact':
      return <MessageSquare className={cn(iconClass, 'text-sky-400')} />;
    case 'collective':
      return <Users className={cn(iconClass, 'text-violet-400')} />;
    case 'thinker':
      return <Eye className={cn(iconClass, 'text-amber-400')} />;
    default:
      return <Wrench className={cn(iconClass, 'text-muted-foreground')} />;
  }
}

// Category colors for card backgrounds
const categoryColors: Record<string, string> = {
  rag: 'hover:border-purple-500/40 hover:bg-purple-500/5',
  repo_intel: 'hover:border-purple-500/40 hover:bg-purple-500/5',
  inbox: 'hover:border-blue-500/40 hover:bg-blue-500/5',
  checkpoint: 'hover:border-green-500/40 hover:bg-green-500/5',
  memory: 'hover:border-pink-500/40 hover:bg-pink-500/5',
  files: 'hover:border-cyan-500/40 hover:bg-cyan-500/5',
  session: 'hover:border-orange-500/40 hover:bg-orange-500/5',
  canvas: 'hover:border-indigo-500/40 hover:bg-indigo-500/5',
  capture: 'hover:border-rose-500/40 hover:bg-rose-500/5',
  pty: 'hover:border-emerald-500/40 hover:bg-emerald-500/5',
  interact: 'hover:border-sky-500/40 hover:bg-sky-500/5',
  collective: 'hover:border-violet-500/40 hover:bg-violet-500/5',
  thinker: 'hover:border-amber-500/40 hover:bg-amber-500/5',
  other: 'hover:border-muted-foreground/40 hover:bg-muted/5',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Card Component (adapted from MCPOverview for selection)
// ═══════════════════════════════════════════════════════════════════════════════

interface ToolCardProps {
  tool: ToolSchema;
  isSelected: boolean;
  onClick: () => void;
}

function ToolCard({ tool, isSelected, onClick }: ToolCardProps) {
  const category = tool.category || 'other';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all duration-200 text-left group',
        isSelected
          ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
          : cn('border-border/60 bg-card/40', categoryColors[category])
      )}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
          isSelected ? 'bg-primary/20' : 'bg-secondary/80 group-hover:bg-secondary'
        )}
      >
        <ToolCategoryIcon category={category} className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-mono font-medium text-foreground truncate">
            {tool.name}
          </span>
          {tool.leaderOnly && (
            <span title="Leader only">
              <Lock className="w-3 h-3 text-amber-400 flex-shrink-0" />
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {tool.description || 'No description'}
        </p>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Category Filter Pills
// ═══════════════════════════════════════════════════════════════════════════════

interface CategoryPillsProps {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
  counts: Record<string, number>;
}

function CategoryPills({ categories, selected, onSelect, counts }: CategoryPillsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect('all')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
          selected === 'all'
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
        )}
      >
        All
        <span className="opacity-70">({Object.values(counts).reduce((a, b) => a + b, 0)})</span>
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
            selected === cat
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          <ToolCategoryIcon category={cat} className="w-3.5 h-3.5" />
          <span className="capitalize">{cat.replace('_', ' ')}</span>
          <span className="opacity-70">({counts[cat] || 0})</span>
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export function ToolsTab() {
  const { tools, selectedToolName, selectTool, isLoading: toolsLoading } = useToolExecution();
  const servers = useCommandCenterStore((s) => s.servers);
  const pingServer = useCommandCenterStore((s) => s.pingServer);
  const pingAllServers = useCommandCenterStore((s) => s.pingAllServers);
  const restartServer = useCommandCenterStore((s) => s.restartServer);
  const storeInitialized = useCommandCenterStore((s) => s.isInitialized);
  const storeInitialize = useCommandCenterStore((s) => s.initialize);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  // Initialize command center store on mount
  useEffect(() => {
    if (!storeInitialized) {
      storeInitialize();
    }
  }, [storeInitialized, storeInitialize]);

  // Auto-refresh servers every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      pingAllServers();
    }, SERVER_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [pingAllServers]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await pingAllServers();
    setRefreshing(false);
  }, [pingAllServers]);

  const selectedTool = tools.find((t) => t.name === selectedToolName);

  // Get unique categories and counts
  const { categories, categoryCounts } = useMemo(() => {
    const counts: Record<string, number> = {};
    tools.forEach((tool) => {
      const cat = tool.category || 'other';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return {
      categories: Object.keys(counts).sort(),
      categoryCounts: counts,
    };
  }, [tools]);

  // Filter tools by search and category
  const filteredTools = useMemo(() => {
    return tools.filter((tool) => {
      // Category filter
      if (selectedCategory !== 'all' && tool.category !== selectedCategory) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          tool.name.toLowerCase().includes(query) ||
          tool.description?.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [tools, selectedCategory, searchQuery]);

  const isLoading = toolsLoading;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Server Cards Grid */}
      <div className="px-6 py-4 border-b border-border bg-card/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">MCP Servers</span>
            <span className="text-xs text-muted-foreground">
              ({servers.filter((s) => s.status === 'connected').length}/{servers.length} connected)
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary hover:bg-muted transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            Ping All
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {servers.map((server) => (
            <CompactServerCard
              key={server.id}
              server={server}
              onPing={() => pingServer(server.id)}
              onRestart={() => restartServer(server.id)}
            />
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tool Cards Panel */}
        <div className="w-[420px] flex flex-col border-r border-border">
          {/* Header with Search */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Tools</span>
                <span className="text-xs text-muted-foreground">
                  ({filteredTools.length} available)
                </span>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools..."
                className="w-full pl-10 pr-4 py-2.5 bg-secondary/80 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
              />
            </div>

            {/* Category Pills */}
            <CategoryPills
              categories={categories}
              selected={selectedCategory}
              onSelect={setSelectedCategory}
              counts={categoryCounts}
            />
          </div>

          {/* Tool Cards Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : filteredTools.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <Wrench className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No tools match your search' : 'No tools available'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredTools.map((tool) => (
                  <ToolCard
                    key={tool.name}
                    tool={tool}
                    isSelected={tool.name === selectedToolName}
                    onClick={() => selectTool(tool.name)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tool Executor Panel */}
        <div className="flex-1 overflow-hidden">
          {selectedTool ? (
            <ToolExecutor tool={selectedTool} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6">
                <Wrench className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Select a Tool</h3>
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                Choose a tool from the list to view its parameters and execute it.
                Use the search bar or category filters to find specific tools.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ToolsTab;
