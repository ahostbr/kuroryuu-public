import dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';

export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Configure layout
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 120, // Horizontal spacing
    ranksep: 100, // Vertical spacing
    align: 'UL' // Align to upper-left
  });

  // Add nodes to dagre
  nodes.forEach((node) => {
    const width = node.data.isPrimary ? 240 : 200;
    const height = 80;
    dagreGraph.setNode(node.id, { width, height });
  });

  // Add edges to dagre
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Apply positions to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWithPosition.width / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2
      }
    };
  });

  return {
    nodes: layoutedNodes,
    edges
  };
}
