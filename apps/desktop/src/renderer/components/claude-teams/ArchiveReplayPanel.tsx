/**
 * ArchiveReplayPanel - Read-only ReactFlow graph replay of archived team sessions.
 *
 * Converts ArchivedTeamSession data into a TeamSnapshot and renders it using
 * the same graph building functions as the live TeamFlowPanel, but in read-only mode.
 */
import { useState, useEffect, useMemo } from 'react';
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
import { Network, GitBranch, Clock, Loader2, Archive } from 'lucide-react';
import {
  useTeamFlowStore,
  buildHubSpokesGraph,
  buildHierarchyGraph,
  buildTimelineGraph,
  THEME_COLORS,
} from '../../stores/team-flow-store';
import { teamNodeTypes } from './TeamNodes';
import { TimelineView } from './timeline';
import type {
  ArchivedTeamSession,
  TeamSnapshot,
  TeamConfig,
  TeamTask,
  InboxMessage,
  FlowViewMode,
} from '../../types/claude-teams';
import '../../styles/claude-teams.css';

/** Convert an archived session back to a TeamSnapshot for graph rendering. */
function archiveToSnapshot(archive: ArchivedTeamSession): TeamSnapshot {
  return {
    config: archive.config as TeamConfig,
    tasks: archive.tasks as TeamTask[],
    inboxes: archive.inboxes as Record<string, InboxMessage[]>,
    teammates: [],
    lastUpdated: new Date(archive.archivedAt).getTime(),
  };
}

const REPLAY_VIEWS: { id: FlowViewMode; label: string; icon: React.ElementType }[] = [
  { id: 'hub-spokes', label: 'Hub', icon: Network },
  { id: 'hierarchy', label: 'Hierarchy', icon: GitBranch },
  { id: 'timeline', label: 'Timeline', icon: Clock },
];

const edgeMarker = {
  type: 'arrowclosed' as const,
  color: '#888',
};

export function ArchiveReplayPanel({ archiveId }: { archiveId: string }) {
  const [archive, setArchive] = useState<ArchivedTeamSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<FlowViewMode>('hub-spokes');
  const theme = useTeamFlowStore((s) => s.theme);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Load archive data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.electronAPI?.teamHistory?.loadArchive?.(archiveId).then((result) => {
      if (cancelled) return;
      if (result?.ok && result.archive) {
        setArchive(result.archive as ArchivedTeamSession);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [archiveId]);

  // Build graph from archived data
  const graphData = useMemo(() => {
    if (!archive) return null;
    const snapshot = archiveToSnapshot(archive);
    switch (viewMode) {
      case 'hierarchy':
        return buildHierarchyGraph(snapshot, theme);
      case 'timeline':
        return buildTimelineGraph(snapshot, theme);
      default:
        return buildHubSpokesGraph(snapshot, theme);
    }
  }, [archive, viewMode, theme]);

  // Sync graph data to ReactFlow state
  useEffect(() => {
    if (!graphData) return;

    const rfNodes: Node[] = graphData.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { data: n.data },
      draggable: false,
    }));
    setNodes(rfNodes);

    const rfEdges: Edge[] = graphData.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: false, // No animation for archived sessions
      style: { stroke: e.data.color, strokeWidth: 2 },
      markerEnd: edgeMarker,
    }));
    setEdges(rfEdges);
  }, [graphData, setNodes, setEdges]);

  if (loading) {
    return (
      <div className="h-[350px] flex items-center justify-center bg-black/50 rounded-lg">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!archive) {
    return (
      <div className="h-[350px] flex items-center justify-center text-red-400 text-sm bg-black/50 rounded-lg">
        Failed to load archive data.
      </div>
    );
  }

  return (
    <div
      className="h-[350px] flex flex-col rounded-lg overflow-hidden border border-border/40"
      data-team-theme={theme}
    >
      {/* View tabs + archive badge */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/30 border-b border-border/50">
        <div className="flex items-center gap-1">
          {REPLAY_VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                viewMode === v.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <v.icon className="w-3 h-3" />
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 text-[10px] text-amber-400/90 font-medium">
          <Archive className="w-3 h-3" />
          ARCHIVED
        </div>
      </div>

      {/* Graph / Timeline canvas */}
      <div className="flex-1 bg-black">
        {viewMode === 'timeline' ? (
          <TimelineView team={archive ? archiveToSnapshot(archive) : null} readOnly />
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={teamNodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#333" gap={20} size={1} />
            <Controls
              showZoom
              showFitView
              showInteractive={false}
              className="claude-teams-controls"
            />
            <MiniMap
              nodeColor={() => '#666'}
              maskColor="rgba(0, 0, 0, 0.8)"
              className="claude-teams-minimap"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
