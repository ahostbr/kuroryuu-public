import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node
} from '@xyflow/react';
import { WorkflowGraphNode } from './WorkflowGraphNode';
import { WorkflowGraphEdge } from './WorkflowGraphEdge';
import { WorkflowGraphLegend } from './WorkflowGraphLegend';
import { buildWorkflowGraph, buildStarterWorkflowGraph } from './workflow-graph-data';
import { applyDagreLayout } from './workflow-graph-layout';
import { useSettingsStore } from '../../../stores/settings-store';
import { PRDStatus, WorkflowType } from '../../../types/prd';
import { ThemedFrame } from '../../ui/ThemedFrame';
import './workflow-graph.css';

interface WorkflowGraphProps {
  prdId?: string | null;
  currentStatus?: PRDStatus;
  onWorkflowExecute: (workflow: WorkflowType) => void;
  isExecuting: boolean;
  executingWorkflow: WorkflowType | null;
}

const nodeTypes = {
  workflowNode: WorkflowGraphNode
};

const edgeTypes = {
  workflowEdge: WorkflowGraphEdge
};

export function WorkflowGraph({
  prdId,
  currentStatus,
  onWorkflowExecute,
  isExecuting,
  executingWorkflow
}: WorkflowGraphProps) {
  // Get theme settings
  const { appSettings } = useSettingsStore();
  const { theme, enableAnimations, kuroryuuDecorativeFrames } = appSettings;

  // Build graph based on current status - use starter graph when no PRD selected
  const { nodes: initialNodes, edges: initialEdges } = prdId && currentStatus
    ? buildWorkflowGraph(
        currentStatus,
        executingWorkflow,
        isExecuting,
        enableAnimations
      )
    : buildStarterWorkflowGraph(enableAnimations);

  // Apply layout
  const layoutedGraph = applyDagreLayout(initialNodes, initialEdges);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedGraph.edges);

  // Auto-refresh graph when status or executing workflow changes
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = prdId && currentStatus
      ? buildWorkflowGraph(currentStatus, executingWorkflow, isExecuting, enableAnimations)
      : buildStarterWorkflowGraph(enableAnimations);
    const newLayouted = applyDagreLayout(newNodes, newEdges);
    setNodes(newLayouted.nodes);
    setEdges(newLayouted.edges);
  }, [currentStatus, executingWorkflow, isExecuting, prdId, enableAnimations, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.data.isAvailable && !isExecuting && node.data.workflow) {
        onWorkflowExecute(node.data.workflow as WorkflowType);
      }
    },
    [isExecuting, onWorkflowExecute]
  );

  // Optionally wrap in ThemedFrame for Kuroryuu theme
  const graphContent = (
    <div data-testid="workflow-graph" className="relative w-full h-full bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.5}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="hsl(var(--muted))" gap={20} size={1} variant={BackgroundVariant.Dots} />
        <Controls className="workflow-controls" />
        <MiniMap
          nodeColor={(node) => (node.data?.nodeColor as string) || '#888'}
          className="workflow-minimap"
          pannable
          zoomable
        />
      </ReactFlow>

      <WorkflowGraphLegend />
    </div>
  );

  // Wrap in decorative frame if Kuroryuu theme + frames enabled
  if (theme === 'kuroryuu' && kuroryuuDecorativeFrames) {
    return (
      <ThemedFrame variant="dragon" size="full">
        {graphContent}
      </ThemedFrame>
    );
  }

  return graphContent;
}
