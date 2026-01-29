/**
 * GraphitiCanvas - Unified observability canvas
 * Main visualization component for Graphiti unified view
 * Shows agents, tasks, tools, and traffic as interconnected nodes
 */
import React, { useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Activity } from 'lucide-react';
import {
  useGraphitiStore,
  useGraphitiEnabled,
  useGraphitiNodes,
  useGraphitiEdges,
  useGraphitiViewState,
} from '../../stores/graphiti-store';
import { AgentNode } from './nodes/AgentNode';
import { TaskNode } from './nodes/TaskNode';
import { ToolNode } from './nodes/ToolNode';
import { MemoryNode } from './nodes/MemoryNode';
import { GraphitiEdge } from './edges/GraphitiEdge';

// Import theme styles
import '../../styles/graphiti-themes.css';

// Register custom node types
const nodeTypes = {
  agent: AgentNode,
  task: TaskNode,
  tool: ToolNode,
  memory: MemoryNode,
  // Gateway and endpoint nodes can reuse existing traffic nodes
  gateway: AgentNode,  // Fallback to agent node style
  endpoint: TaskNode,  // Fallback to task node style
  session: AgentNode,  // Fallback to agent node style
};

// Register custom edge types
const edgeTypes = {
  graphiti: GraphitiEdge,
};

// Theme color mapping
const THEME_COLORS = {
  cyberpunk: {
    agent: '#00ffff',
    task: '#ffff00',
    tool: '#ff00ff',
    memory: '#00ff00',
    background: '#0a0a0a',
  },
  kuroryuu: {
    agent: '#c9a227',
    task: '#8b6914',
    tool: '#d4af37',
    memory: '#9a8a6a',
    background: '#0a0a0c',
  },
  retro: {
    agent: '#d97706',
    task: '#ea580c',
    tool: '#f59e0b',
    memory: '#fbbf24',
    background: '#100D0B',
  },
  default: {
    agent: '#3b82f6',
    task: '#22c55e',
    tool: '#a855f7',
    memory: '#06b6d4',
    background: '#1a1a1a',
  },
};

interface GraphitiCanvasProps {
  className?: string;
}

export function GraphitiCanvas({ className = '' }: GraphitiCanvasProps) {
  const enabled = useGraphitiEnabled();
  const storeNodes = useGraphitiNodes();
  const storeEdges = useGraphitiEdges();
  const viewState = useGraphitiViewState();
  const selectNode = useGraphitiStore((s) => s.selectNode);
  const setFocusedCorrelation = useGraphitiStore((s) => s.setFocusedCorrelation);

  // ReactFlow state
  const [reactFlowNodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [reactFlowEdges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Get theme colors
  const themeColors = useMemo(
    () => THEME_COLORS[viewState.theme] || THEME_COLORS.default,
    [viewState.theme]
  );

  // Convert store nodes to ReactFlow nodes
  useEffect(() => {
    if (!enabled) return;

    const flowNodes: Node[] = storeNodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position || { x: 0, y: 0 },
      data: {
        label: node.label,
        status: node.status,
        category: node.category,
        eventCount: node.eventCount,
        errorCount: node.errorCount,
        lastEventTime: node.lastEventTime,
        avgLatency: node.avgLatency,
        correlationKeys: node.correlationKeys,
        theme: viewState.theme,
        selected: viewState.selectedNodeId === node.id,
      },
    }));

    setNodes(flowNodes);
  }, [enabled, storeNodes, viewState.selectedNodeId, viewState.theme, setNodes]);

  // Convert store edges to ReactFlow edges
  useEffect(() => {
    if (!enabled) return;

    const flowEdges: Edge[] = storeEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'graphiti',
      animated: edge.animated,
      data: {
        type: edge.type,
        label: edge.label,
        eventCount: edge.eventCount,
        errorCount: edge.errorCount,
        avgLatency: edge.avgLatency,
        status: edge.status,
        theme: viewState.theme,
      },
    }));

    setEdges(flowEdges);
  }, [enabled, storeEdges, viewState.theme, setEdges]);

  // Handle node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id);

      // If node has correlation keys, focus on the first one
      const correlationKeys = node.data?.correlationKeys as string[] | undefined;
      if (correlationKeys && correlationKeys.length > 0) {
        setFocusedCorrelation(correlationKeys[0]);
      }
    },
    [selectNode, setFocusedCorrelation]
  );

  // Handle pane click (deselect)
  const handlePaneClick = useCallback(() => {
    selectNode(null);
    setFocusedCorrelation(null);
  }, [selectNode, setFocusedCorrelation]);

  // Node color function for minimap
  const getNodeColor = useCallback(
    (node: Node) => {
      const type = node.type as keyof typeof themeColors;
      return themeColors[type] || themeColors.agent;
    },
    [themeColors]
  );

  if (!enabled) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium mb-2">Graphiti is disabled</p>
          <p className="text-sm">Enable it in Settings → Graphiti to use the unified observability view</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      data-graphiti-theme={viewState.theme}
    >
      <ReactFlow
        nodes={reactFlowNodes}
        edges={reactFlowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        className="graphiti-canvas"
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{
          animated: true,
        }}
      >
        <Background color={themeColors.background} gap={20} />
        <Controls className="graphiti-controls" />
        <MiniMap
          className="graphiti-minimap"
          nodeColor={getNodeColor}
          maskColor="rgba(0, 0, 0, 0.8)"
        />
      </ReactFlow>

      {/* Empty state message - themed */}
      {reactFlowNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="graphiti-empty">
            <div className="graphiti-empty-icon">
              <Activity size={48} strokeWidth={1} />
            </div>
            <h2 className="graphiti-empty-title">AWAITING DATA</h2>
            <p className="graphiti-empty-message">
              Events will appear here as agents, tasks, and tools become active
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
