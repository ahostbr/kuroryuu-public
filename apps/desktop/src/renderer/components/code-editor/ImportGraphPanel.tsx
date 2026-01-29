/**
 * ImportGraphPanel - Visualize module import graph using ReactFlow
 * T419: Import Graph Visualization
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
  Position,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from '../ui/toaster';
import {
  Network,
  RefreshCw,
  X,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
  FileCode,
} from 'lucide-react';

interface ModuleInfo {
  imports: string[];
  exports: string[];
}

interface ModuleGraphData {
  [modulePath: string]: ModuleInfo;
}

interface ImportGraphPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// Color palette for different app directories
const APP_COLORS: Record<string, string> = {
  'desktop': '#3b82f6',  // blue
  'gateway': '#22c55e',  // green
  'web': '#f59e0b',      // amber
  'mcp_core': '#8b5cf6', // purple
  'tray_companion': '#ec4899', // pink
  'root': '#6b7280',     // gray
};

// Get app name from path
function getAppFromPath(path: string): string {
  if (path.startsWith('apps/')) {
    const parts = path.split('/');
    return parts[1] || 'root';
  }
  return 'root';
}

// Get node color based on app
function getNodeColor(path: string): string {
  const app = getAppFromPath(path);
  return APP_COLORS[app] || APP_COLORS['root'];
}

// Shorten path for display
function shortenPath(path: string): string {
  const parts = path.split('/');
  if (parts.length > 3) {
    return `.../${parts.slice(-2).join('/')}`;
  }
  return path;
}

export function ImportGraphPanel({ isOpen, onClose }: ImportGraphPanelProps) {
  const [graphData, setGraphData] = useState<ModuleGraphData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Fetch module graph from k_repo_intel
  const fetchGraph = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI?.mcp?.call?.('k_repo_intel', {
        action: 'get',
        report: 'module_graph',
        limit: 500,
      });

      const resultData = result?.result as { data?: ModuleGraphData } | undefined;
      if (result?.ok && resultData?.data) {
        setGraphData(resultData.data);
      } else {
        toast.error('Failed to fetch module graph');
      }
    } catch (err) {
      console.error('[ImportGraphPanel] Fetch error:', err);
      toast.error('Failed to fetch module graph');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount and when panel opens
  useEffect(() => {
    if (isOpen && !graphData) {
      fetchGraph();
    }
  }, [isOpen, graphData, fetchGraph]);

  // Get unique apps from graph
  const availableApps = useMemo(() => {
    if (!graphData) return [];
    const apps = new Set<string>();
    Object.keys(graphData).forEach(path => {
      apps.add(getAppFromPath(path));
    });
    return Array.from(apps).sort();
  }, [graphData]);

  // Build nodes and edges when data changes
  useEffect(() => {
    if (!graphData) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Filter modules based on search and app filter
    const filteredModules = Object.entries(graphData).filter(([path]) => {
      // App filter
      if (selectedApp && getAppFromPath(path) !== selectedApp) {
        return false;
      }
      // Search filter
      if (searchQuery && !path.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });

    // Limit to prevent performance issues
    const maxNodes = 50;
    const limitedModules = filteredModules.slice(0, maxNodes);

    // Create a set of visible module paths
    const visiblePaths = new Set(limitedModules.map(([path]) => path));

    // Build nodes with force-directed layout approximation
    const nodeCount = limitedModules.length;
    const cols = Math.ceil(Math.sqrt(nodeCount));
    const spacing = 220;

    const newNodes: Node[] = limitedModules.map(([path, info], idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;

      // Add some randomness to make it look more organic
      const jitterX = (Math.random() - 0.5) * 40;
      const jitterY = (Math.random() - 0.5) * 40;

      return {
        id: path,
        position: {
          x: col * spacing + jitterX + 50,
          y: row * spacing + jitterY + 50,
        },
        data: {
          label: (
            <div className="text-[10px] text-center">
              <div className="font-medium truncate max-w-[150px]" title={path}>
                {shortenPath(path)}
              </div>
              <div className="text-[9px] text-gray-400 mt-0.5">
                {(info.imports?.length ?? 0)} imports, {(info.exports?.length ?? 0)} exports
              </div>
            </div>
          ),
        },
        style: {
          background: getNodeColor(path),
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '10px',
          minWidth: '120px',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });

    // Build edges (only between visible nodes)
    const newEdges: Edge[] = [];
    limitedModules.forEach(([sourcePath, info]) => {
      (info.imports ?? []).forEach((importPath, idx) => {
        // Only create edge if target is visible
        if (visiblePaths.has(importPath)) {
          newEdges.push({
            id: `${sourcePath}->${importPath}-${idx}`,
            source: sourcePath,
            target: importPath,
            animated: false,
            style: { stroke: '#64748b', strokeWidth: 1 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#64748b',
              width: 15,
              height: 15,
            },
          });
        }
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [graphData, searchQuery, selectedApp, setNodes, setEdges]);

  // Stats
  const stats = useMemo(() => {
    if (!graphData) return { modules: 0, imports: 0, exports: 0 };
    let imports = 0;
    let exports = 0;
    Object.values(graphData).forEach(info => {
      if (info && Array.isArray(info.imports)) {
        imports += info.imports.length;
      }
      if (info && Array.isArray(info.exports)) {
        exports += info.exports.length;
      }
    });
    return {
      modules: Object.keys(graphData).length,
      imports,
      exports,
    };
  }, [graphData]);

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-card/50 border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Import Graph</span>
          <span className="text-xs text-muted-foreground">
            ({nodes.length} modules)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchGraph}
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

      {/* Search and filters */}
      <div className="px-3 py-2 border-b border-border/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search modules..."
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

        {/* App filter */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground mr-1">Filter:</span>
          <button
            onClick={() => setSelectedApp(null)}
            className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
              !selectedApp
                ? 'bg-primary/20 border-primary text-primary'
                : 'border-border hover:border-muted-foreground/50'
            }`}
          >
            All
          </button>
          {availableApps.map(app => (
            <button
              key={app}
              onClick={() => setSelectedApp(selectedApp === app ? null : app)}
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                selectedApp === app
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'border-border hover:border-muted-foreground/50'
              }`}
              style={{
                borderColor: selectedApp === app ? APP_COLORS[app] : undefined,
                color: selectedApp === app ? APP_COLORS[app] : undefined,
              }}
            >
              {app}
            </button>
          ))}
        </div>
      </div>

      {/* Graph area */}
      <div className="flex-1 relative w-full" style={{ minHeight: 0 }}>
        {isLoading && !graphData ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            {searchQuery || selectedApp ? 'No matching modules' : 'No module data available'}
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            minZoom={0.1}
            maxZoom={2}
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#374151" />
            <Controls
              showInteractive={false}
              className="!bg-card !border-border !rounded-lg !shadow-lg"
            />
          </ReactFlow>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border flex items-center justify-between">
        <span>
          {stats.modules} modules, {stats.imports} imports
        </span>
        <div className="flex items-center gap-3">
          {Object.entries(APP_COLORS).slice(0, 5).map(([app, color]) => (
            <div key={app} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded" style={{ backgroundColor: color }} />
              <span className="text-[10px]">{app}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
