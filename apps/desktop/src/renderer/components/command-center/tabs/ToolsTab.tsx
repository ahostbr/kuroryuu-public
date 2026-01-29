/**
 * Tools Tab
 *
 * Card-based tool browser with MCPOverview visual style.
 * Displays servers in card row, tools in grid, and executor panel.
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  Wrench,
  Search,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Database,
  Inbox,
  FolderGit2,
  FileCheck,
  Brain,
  Terminal,
  Eye,
  MessageSquare,
  Palette,
  Camera,
  Users,
  Lock,
} from 'lucide-react';
import { useToolExecution } from '../../../hooks/useCommandCenter';
import { useMCPOverviewStore } from '../../../stores/mcp-overview-store';
import { ToolExecutor } from '../tools/ToolExecutor';
import { cn } from '../../../lib/utils';
import type { ToolSchema, ToolCategory } from '../../../types/command-center';

// ═══════════════════════════════════════════════════════════════════════════════
// Server Card Component (from MCPOverview)
// ═══════════════════════════════════════════════════════════════════════════════

interface ServerInfo {
  id: string;
  name: string;
  url: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  toolCount: number;
  error?: string;
}

function ServerCard({ server }: { server: ServerInfo }) {
  const statusConfig = {
    connected: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-500/30' },
    connecting: { icon: Loader2, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-500/30' },
    disconnected: { icon: XCircle, color: 'text-muted-foreground', bg: 'bg-muted-foreground/10', border: 'border-border' },
    error: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-500/30' },
  };

  const config = statusConfig[server.status];
  const StatusIcon = config.icon;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors',
        config.bg,
        config.border
      )}
      title={server.error || server.url}
    >
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', config.bg)}>
        <Server className={cn('w-4.5 h-4.5', config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{server.name}</span>
          <StatusIcon
            className={cn(
              'w-3.5 h-3.5 flex-shrink-0',
              config.color,
              server.status === 'connecting' && 'animate-spin'
            )}
          />
        </div>
        <p className="text-xs text-muted-foreground truncate">{server.toolCount} tools</p>
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
  const { servers, isLoading: serversLoading, refresh, isInitialized, initialize } = useMCPOverviewStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Initialize MCP store on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

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

  const isLoading = toolsLoading || serversLoading;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Server Cards Row */}
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
            onClick={refresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary hover:bg-muted transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {servers.map((server) => (
            <ServerCard key={server.id} server={server} />
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
