/**
 * MemoryPanel - Browse and search Graphiti memories with graph visualization
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Search,
  Brain,
  Loader2,
  RefreshCw,
  Filter,
  AlertCircle,
  Database,
  List,
  Share2,
  Sparkles,
  CalendarDays,
  User,
  Heart,
  Play,
  Square,
  Settings,
  Server,
  ExternalLink,
  Zap,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';
import { MemoryCard, type MemoryNode } from './MemoryCard';
import { ClaudeMemoryTab } from './ClaudeMemoryTab';
import { useSettings, type GraphitiSettings } from '../../hooks/useSettings';
import { useCaptureStore } from '../../stores/capture-store';
import { RecordingIndicator } from '../capture/RecordingIndicator';
import { CheckpointsPanel } from '../checkpoints/CheckpointsPanel';

type MemoryType = 'all' | 'fact' | 'event' | 'entity' | 'preference';
type ViewMode = 'list' | 'graph';
type MemoryTab = 'graphiti' | 'claude';

interface SearchResult {
  type: string;
  content: string;
  score: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Graph Node Styles
// ═══════════════════════════════════════════════════════════════════════════════

const memoryTypeStyles: Record<string, { bg: string; border: string; icon: React.ElementType }> = {
  fact: { bg: '#1e3a5f', border: '#3b82f6', icon: Sparkles },
  event: { bg: '#3b0764', border: '#a855f7', icon: CalendarDays },
  entity: { bg: '#14532d', border: '#22c55e', icon: User },
  preference: { bg: '#7c2d12', border: '#f97316', icon: Heart },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Custom Graph Node Component
// ═══════════════════════════════════════════════════════════════════════════════

interface MemoryGraphData extends Record<string, unknown> {
  label: string;
  memoryType: string;
  createdAt?: string;
}

function MemoryGraphNode({ data }: NodeProps<Node<MemoryGraphData, string>>) {
  const nodeData = data as MemoryGraphData;
  const styles = memoryTypeStyles[nodeData.memoryType] || memoryTypeStyles.fact;
  const Icon = styles.icon;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-2 !h-2" />
      <div
        className="px-3 py-2 rounded-lg shadow-lg min-w-[160px] max-w-[240px] transition-all hover:shadow-xl"
        style={{
          backgroundColor: styles.bg,
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: styles.border,
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-3.5 h-3.5" style={{ color: styles.border }} />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {nodeData.memoryType}
          </span>
        </div>
        <p className="text-sm text-foreground line-clamp-3">{nodeData.label}</p>
        {nodeData.createdAt && (
          <p className="text-[10px] text-muted-foreground mt-1.5 opacity-70">
            {new Date(nodeData.createdAt).toLocaleDateString()}
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500 !w-2 !h-2" />
    </>
  );
}

const nodeTypes = { memory: MemoryGraphNode };

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export function MemoryPanel() {
  const [activeTab, setActiveTab] = useState<MemoryTab>('graphiti');
  const [graphitiSettings] = useSettings<GraphitiSettings>('graphiti');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<MemoryType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'unhealthy' | 'checking'>('checking');
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchOutput, setLaunchOutput] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isRecording = useCaptureStore((s) => s.isRecording);

  // Get the launch command based on configured port
  const serverUrl = graphitiSettings?.serverUrl || 'http://localhost:8000';
  const port = new URL(serverUrl).port || '8000';
  const launchCommand = `cd SASgraphiti-server && docker-compose up -d`;
  const altCommand = `graphiti server --port ${port}`;

  // Copy command to clipboard
  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(launchCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = launchCommand;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ReactFlow state with proper typing
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<MemoryGraphData, string>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const enabled = graphitiSettings?.enabled ?? false;

  // Convert memories to graph nodes/edges
  const convertToGraph = useCallback((memoryList: MemoryNode[]) => {
    const graphNodes: Node<MemoryGraphData, string>[] = [];
    const graphEdges: Edge[] = [];

    // Grid layout for nodes
    const cols = 4;
    const nodeWidth = 260;
    const nodeHeight = 120;

    memoryList.forEach((memory, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;

      graphNodes.push({
        id: memory.id,
        type: 'memory',
        position: { x: col * nodeWidth + 50, y: row * nodeHeight + 50 },
        data: {
          label: memory.content,
          memoryType: memory.type,
          createdAt: memory.createdAt,
        },
      });
    });

    // Create edges between related memories (simple heuristic: same type, close in time)
    const sortedByDate = [...memoryList].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    for (let i = 0; i < sortedByDate.length - 1; i++) {
      const current = sortedByDate[i];
      const next = sortedByDate[i + 1];

      // Connect memories of the same type that are close in time
      if (current.type === next.type) {
        const timeDiff = Math.abs(
          new Date(next.createdAt).getTime() - new Date(current.createdAt).getTime()
        );
        // Within 24 hours
        if (timeDiff < 24 * 60 * 60 * 1000) {
          graphEdges.push({
            id: `${current.id}-${next.id}`,
            source: current.id,
            target: next.id,
            animated: true,
            style: { stroke: '#a855f7', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#a855f7' },
          });
        }
      }
    }

    setNodes(graphNodes);
    setEdges(graphEdges);
  }, [setNodes, setEdges]);

  // Check health on mount
  useEffect(() => {
    if (enabled) {
      checkHealth();
    }
  }, [enabled]);

  // Update graph when memories or view mode changes
  useEffect(() => {
    if (viewMode === 'graph' && memories.length > 0) {
      convertToGraph(memories);
    }
  }, [viewMode, memories, convertToGraph]);

  const checkHealth = async () => {
    setHealthStatus('checking');
    try {
      const result = await window.electronAPI.graphiti.health();
      setHealthStatus(result.ok ? 'healthy' : 'unhealthy');
      if (result.ok) {
        loadMemories();
      }
    } catch {
      setHealthStatus('unhealthy');
    }
  };

  // Load memories from Graphiti (entities from Neo4j)
  const loadMemories = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      // First try to load entities directly from Neo4j
      const entitiesResult = await window.electronAPI.graphiti.entities({
        limit: 50,
      });

      if (entitiesResult.error) {
        // Fallback to query if entities fails
        console.warn('Entities fetch failed, falling back to query:', entitiesResult.error);
        const queryResult = await window.electronAPI.graphiti.query({
          query: '*',
          limit: 50,
        });

        if (queryResult.error) {
          setError(queryResult.error);
          return;
        }

        const nodes: MemoryNode[] = (queryResult.nodes || []).map((node: { id: string; type: string; content: string; createdAt: string; metadata?: Record<string, unknown> }) => ({
          id: node.id,
          type: (node.type as MemoryNode['type']) || 'fact',
          content: node.content,
          createdAt: node.createdAt,
          metadata: node.metadata,
        }));

        setMemories(nodes);
        return;
      }

      // Transform entities to MemoryNode format
      const nodes: MemoryNode[] = (entitiesResult.nodes || []).map((node: { id: string; type: string; content: string; createdAt: string; metadata?: Record<string, unknown> }) => ({
        id: node.id,
        type: (node.type as MemoryNode['type']) || 'entity',
        content: node.content,
        createdAt: node.createdAt,
        metadata: node.metadata,
      }));

      setMemories(nodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  // Search memories
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim() || !enabled) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const result = await window.electronAPI.graphiti.search({
        query: query.trim(),
        topK: 20,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSearchResults(result.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [enabled]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  // Filter memories by type
  const filteredMemories = memories.filter(
    (m) => activeFilter === 'all' || m.type === activeFilter
  );

  // Display search results or filtered memories
  const displayItems = searchQuery.trim()
    ? searchResults.map((r, i) => ({
        id: `search-${i}`,
        type: r.type as MemoryNode['type'],
        content: r.content,
        createdAt: new Date().toISOString(),
        score: r.score,
      }))
    : filteredMemories;

  // Tab bar component (rendered at top of every view)
  const tabBar = (
    <div className="flex items-center border-b border-border bg-secondary/20">
      <button
        onClick={() => setActiveTab('graphiti')}
        className={`px-4 py-2 text-sm font-medium transition-colors relative ${
          activeTab === 'graphiti'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Graphiti
        {activeTab === 'graphiti' && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />
        )}
      </button>
      <button
        onClick={() => setActiveTab('claude')}
        className={`px-4 py-2 text-sm font-medium transition-colors relative ${
          activeTab === 'claude'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Claude Memory
        {activeTab === 'claude' && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
        )}
      </button>
    </div>
  );

  // Claude Memory tab selected - render it regardless of Graphiti state
  if (activeTab === 'claude') {
    return (
      <div className="flex flex-col h-full">
        {tabBar}
        <div className="flex-1 overflow-hidden">
          <ClaudeMemoryTab />
        </div>
      </div>
    );
  }

  // Not enabled state - show Checkpoints panel instead
  if (!enabled) {
    return (
      <div className="flex flex-col h-full">
        {tabBar}
        <div className="flex-1 overflow-hidden">
          <CheckpointsPanel />
        </div>
      </div>
    );
  }

  // Launch Graphiti server via Electron IPC
  const launchGraphitiServer = async () => {
    setIsLaunching(true);
    setLaunchOutput(null);
    setError(null);

    try {
      // Try to launch via IPC (if available)
      if (window.electronAPI?.graphiti?.launchServer) {
        const result = await window.electronAPI.graphiti.launchServer();
        if (result.success) {
          setLaunchOutput('Server starting...');
          // Poll for health a few times
          let attempts = 0;
          const pollHealth = async () => {
            attempts++;
            const health = await window.electronAPI.graphiti.health();
            if (health.ok) {
              setIsLaunching(false);
              setLaunchOutput(null);
              checkHealth();
            } else if (attempts < 10) {
              setTimeout(pollHealth, 2000);
            } else {
              setIsLaunching(false);
              setLaunchOutput('Server started but not responding. Check logs.');
            }
          };
          setTimeout(pollHealth, 3000);
          return;
        } else {
          setError(result.error || 'Failed to launch server');
          setLaunchOutput('manual'); // Show manual command on error
          setIsLaunching(false);
        }
      } else {
        // Fallback: Show command to run manually
        setLaunchOutput('manual');
        setIsLaunching(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch server');
      setLaunchOutput('manual'); // Also show manual command on error
      setIsLaunching(false);
    }
  };

  // Unhealthy state - Server Management Panel
  if (healthStatus === 'unhealthy') {
    return (
      <div className="flex flex-col h-full">
        {tabBar}
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-purple-400" />
            <h1 className="text-lg font-semibold text-foreground">Memory</h1>
            {isRecording && <RecordingIndicator variant="compact" />}
          </div>
        </div>

        {/* Server Management Panel */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
          <div className="w-full max-w-lg space-y-6">
            {/* Status Card with Launch Button */}
            <div className="relative overflow-hidden p-6 bg-gradient-to-br from-red-500/5 via-transparent to-purple-500/5 border border-red-500/30 rounded-xl">
              {/* Animated background pulse */}
              <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-purple-500/5 animate-pulse opacity-50" />

              <div className="relative">
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative">
                    <div className="p-2.5 bg-red-500/20 rounded-lg border border-red-500/30">
                      <Server className="w-5 h-5 text-red-400" />
                    </div>
                    {/* Status indicator dot */}
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-background animate-pulse" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Graphiti Server Offline</h2>
                    <p className="text-xs text-muted-foreground font-mono">
                      {graphitiSettings?.serverUrl || 'http://localhost:8000'}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-5">
                  The Graphiti memory server is not running. Start it to enable AI memory features.
                </p>

                {/* Action Buttons - Launch + Retry */}
                <div className="flex items-center gap-3">
                  {/* Primary Launch Server Button */}
                  <button
                    onClick={launchGraphitiServer}
                    disabled={isLaunching}
                    className="group relative flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed overflow-hidden bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40"
                  >
                    {/* Animated glow effect */}
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />

                    {isLaunching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Starting...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 group-hover:animate-pulse" />
                        <span>Launch Server</span>
                      </>
                    )}
                  </button>

                  {/* Secondary Retry Button */}
                  <button
                    onClick={checkHealth}
                    disabled={isLaunching}
                    className="flex items-center gap-2 px-4 py-2.5 bg-secondary/80 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary hover:border-purple-500/30 transition-all duration-200"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </button>
                </div>

                {/* Launch Output Message */}
                {launchOutput && launchOutput !== 'manual' && (
                  <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-purple-300">
                      <Terminal className="w-4 h-4" />
                      <span className="font-mono">{launchOutput}</span>
                    </div>
                  </div>
                )}

                {/* Manual Launch Command Box */}
                {launchOutput === 'manual' && (
                  <div className="mt-4 p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/30 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-sm text-purple-300">
                        <Terminal className="w-4 h-4" />
                        <span className="font-medium">Run in terminal (from Kuroryuu root):</span>
                      </div>
                      <button
                        onClick={copyCommand}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-md text-purple-300 hover:text-purple-200 transition-all"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <div className="p-3 bg-background/90 rounded-md font-mono text-sm text-purple-200 border border-purple-500/20 select-all cursor-text">
                      {launchCommand}
                    </div>
                    <div className="mt-3 pt-3 border-t border-purple-500/20">
                      <p className="text-xs text-muted-foreground mb-2">
                        Or if you have graphiti-core installed:
                      </p>
                      <div className="p-2 bg-background/60 rounded font-mono text-xs text-purple-300/80 select-all cursor-text">
                        {altCommand}
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {error && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      <span>{error}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Setup Instructions - Collapsible Style */}
            <div className="p-6 bg-secondary/30 border border-border/50 rounded-xl backdrop-blur-sm">
              <h3 className="font-medium text-foreground mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4 text-purple-400" />
                Setup Instructions
              </h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-gradient-to-br from-purple-500/30 to-purple-600/20 text-purple-400 rounded-md text-xs font-semibold flex items-center justify-center flex-shrink-0 border border-purple-500/20">1</span>
                  <p className="pt-0.5">Install Neo4j database (required for Graphiti)</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-gradient-to-br from-purple-500/30 to-purple-600/20 text-purple-400 rounded-md text-xs font-semibold flex items-center justify-center flex-shrink-0 border border-purple-500/20">2</span>
                  <p className="pt-0.5">Clone and run the Graphiti server:</p>
                </div>
                <div className="ml-9 p-3 bg-background/80 rounded-lg font-mono text-xs border border-border/50">
                  <code className="text-purple-300">pip install graphiti-core</code>
                  <br />
                  <code className="text-purple-300">graphiti server --port 8000</code>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-gradient-to-br from-purple-500/30 to-purple-600/20 text-purple-400 rounded-md text-xs font-semibold flex items-center justify-center flex-shrink-0 border border-purple-500/20">3</span>
                  <p className="pt-0.5">Configure server URL in Settings → Integrations</p>
                </div>
              </div>
              <button
                onClick={() => window.open('https://github.com/getzep/graphiti', '_blank')}
                className="mt-5 flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm transition-colors group"
              >
                <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                View Graphiti Documentation
              </button>
            </div>

            {/* Docker Quick Start */}
            <div className="p-4 bg-gradient-to-r from-secondary/40 to-secondary/20 border border-border/50 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-blue-500/20 rounded">
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <h4 className="text-sm font-medium text-foreground">Quick Start with Docker</h4>
              </div>
              <div className="p-3 bg-background/80 rounded-lg font-mono text-xs text-muted-foreground overflow-x-auto border border-border/50">
                <code className="text-blue-300">docker run -p 8000:8000 zepai/graphiti</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {tabBar}
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-purple-400" />
          <h1 className="text-lg font-semibold text-foreground">Memory</h1>
          <span className="text-xs text-muted-foreground">
            {memories.length} memories
          </span>
          {isRecording && <RecordingIndicator variant="compact" />}
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 p-1 bg-secondary rounded-lg">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'graph'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Graph view"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={loadMemories}
            disabled={loading}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
            title="Refresh memories"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="p-4 border-b border-border space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories..."
            className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:border-purple-500 focus:outline-none"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Type Filters */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {(['all', 'fact', 'event', 'entity', 'preference'] as MemoryType[]).map((type) => (
            <button
              key={type}
              onClick={() => setActiveFilter(type)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                activeFilter === type
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading && healthStatus === 'checking' ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <AlertCircle className="w-6 h-6 text-red-400 mb-2" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : viewMode === 'graph' ? (
          /* Graph View */
          <div className="h-full w-full">
            {nodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Share2 className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No memories to visualize</p>
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.2}
                maxZoom={2}
                defaultEdgeOptions={{
                  animated: true,
                  style: { stroke: '#a855f7', strokeWidth: 2 },
                }}
              >
                <Background color="#333" gap={20} />
                <Controls className="!bg-secondary !border-border" />
                <MiniMap
                  nodeColor={(node) => {
                    const styles = memoryTypeStyles[node.data?.memoryType as string];
                    return styles?.border || '#a855f7';
                  }}
                  className="!bg-secondary !border-border"
                />
              </ReactFlow>
            )}
          </div>
        ) : displayItems.length === 0 ? (
          /* List View - Empty */
          <div className="flex flex-col items-center justify-center h-32 text-center p-4">
            <Database className="w-6 h-6 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No results found' : 'No memories yet'}
            </p>
          </div>
        ) : (
          /* List View */
          <div className="overflow-y-auto h-full p-4 space-y-3">
            {displayItems.map((item) => (
              <MemoryCard
                key={item.id}
                memory={item as MemoryNode}
                score={'score' in item ? item.score : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
