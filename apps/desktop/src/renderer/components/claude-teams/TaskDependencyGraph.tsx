/**
 * TaskDependencyGraph - Mini ReactFlow visualization of task dependency edges.
 * Renders tasks as colored nodes with directed edges based on blocks/blockedBy.
 */
import { useMemo } from 'react';
import { ReactFlow, Background, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { TeamTask, TeamTaskStatus } from '../../types/claude-teams';

interface TaskDependencyGraphProps {
  tasks: TeamTask[];
}

const STATUS_COLORS: Record<TeamTaskStatus, string> = {
  pending: '#6b7280',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  deleted: '#ef4444',
};

const NODE_WIDTH = 170;
const NODE_HEIGHT = 40;
const H_SPACING = 200;
const V_SPACING = 100;

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '\u2026' : str;
}

/**
 * Topological layering: assign each task to a "row" depth.
 * Row 0 = tasks with no blockedBy. Row N = blocked only by tasks in rows < N.
 */
function computeLayers(tasks: TeamTask[]): Map<string, number> {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const layers = new Map<string, number>();
  const taskIds = new Set(tasks.map((t) => t.id));

  // BFS-style layering
  const queue: string[] = [];

  // Root tasks: nothing blocking them (or blockedBy references tasks not in the set)
  for (const task of tasks) {
    const realBlockers = task.blockedBy.filter((id) => taskIds.has(id));
    if (realBlockers.length === 0) {
      layers.set(task.id, 0);
      queue.push(task.id);
    }
  }

  // Process remaining via BFS
  let processed = 0;
  while (processed < queue.length) {
    const currentId = queue[processed++];
    const currentLayer = layers.get(currentId) ?? 0;
    const current = taskMap.get(currentId);
    if (!current) continue;

    for (const blockedId of current.blocks) {
      if (!taskIds.has(blockedId)) continue;
      const existing = layers.get(blockedId);
      const newLayer = currentLayer + 1;
      if (existing === undefined || newLayer > existing) {
        layers.set(blockedId, newLayer);
      }
      // Only enqueue if all blockers are assigned
      const blocked = taskMap.get(blockedId);
      if (blocked) {
        const allBlockersAssigned = blocked.blockedBy
          .filter((id) => taskIds.has(id))
          .every((id) => layers.has(id));
        if (allBlockersAssigned && !queue.includes(blockedId)) {
          queue.push(blockedId);
        }
      }
    }
  }

  // Assign any remaining unplaced tasks to row 0 (disconnected)
  for (const task of tasks) {
    if (!layers.has(task.id)) {
      layers.set(task.id, 0);
    }
  }

  return layers;
}

export function TaskDependencyGraph({ tasks }: TaskDependencyGraphProps) {
  const { nodes, edges } = useMemo(() => {
    if (tasks.length === 0) return { nodes: [], edges: [] };

    const layers = computeLayers(tasks);

    // Group tasks by layer for x positioning
    const layerGroups = new Map<number, TeamTask[]>();
    for (const task of tasks) {
      const layer = layers.get(task.id) ?? 0;
      const group = layerGroups.get(layer) ?? [];
      group.push(task);
      layerGroups.set(layer, group);
    }

    // Build nodes with positions
    const builtNodes: Node[] = [];
    for (const [layer, group] of layerGroups) {
      group.forEach((task, idx) => {
        const color = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending;
        builtNodes.push({
          id: task.id,
          position: {
            x: idx * H_SPACING,
            y: layer * V_SPACING,
          },
          data: {
            label: `#${task.id}: ${truncate(task.subject, 30)}`,
          },
          style: {
            background: color,
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 500,
            padding: '6px 10px',
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            display: 'flex',
            alignItems: 'center',
          },
        });
      });
    }

    // Build edges from blocks relationships
    const taskIdSet = new Set(tasks.map((t) => t.id));
    const builtEdges: Edge[] = [];
    for (const task of tasks) {
      for (const blockedId of task.blocks) {
        if (!taskIdSet.has(blockedId)) continue;
        builtEdges.push({
          id: `${task.id}->${blockedId}`,
          source: task.id,
          target: blockedId,
          animated: task.status === 'in_progress',
          style: {
            stroke: STATUS_COLORS[task.status] ?? '#6b7280',
            strokeWidth: 1.5,
          },
        });
      }
    }

    return { nodes: builtNodes, edges: builtEdges };
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-xs text-gray-600 border border-dashed border-white/10 rounded-lg">
        No task dependencies to display
      </div>
    );
  }

  return (
    <div className="h-[200px] rounded-lg overflow-hidden border border-white/10">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.5}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#333" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
