/**
 * TeamFlowPanel - ReactFlow canvas for Claude Teams hub+spokes visualization.
 * Shows team lead at center with teammates radiating outward.
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
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Users, Activity, CheckCircle, XCircle, Clock } from 'lucide-react';

import { useClaudeTeamsStore } from '../../stores/claude-teams-store';
import { useTeamFlowStore, type TeamFlowTheme } from '../../stores/team-flow-store';
import { useSettingsStore } from '../../stores/settings-store';
import { teamNodeTypes } from './TeamNodes';
import type { ThemeId } from '../../types/settings';
import '../../styles/claude-teams.css';

// Map global ThemeId to TeamFlowTheme
const GLOBAL_TO_TEAM_THEME: Partial<Record<ThemeId, TeamFlowTheme>> = {
  'kuroryuu': 'kuroryuu',
  'retro': 'retro',
  'matrix': 'retro',
  'oscura-midnight': 'cyberpunk',
  'neo': 'cyberpunk',
  'dusk': 'default',
  'lime': 'default',
  'ocean': 'default',
  'forest': 'default',
  'grunge': 'default',
};

const edgeOptions = {
  style: { strokeWidth: 2 },
  markerEnd: {
    type: 'arrowclosed' as const,
    color: '#888',
  },
};

function ScanlineOverlay({ theme }: { theme: string }) {
  if (theme !== 'retro') return null;
  return (
    <>
      <div className="claude-teams-scanline-overlay" />
      <div className="claude-teams-crt-effect" />
    </>
  );
}

export function TeamFlowPanel() {
  // Claude teams store
  const selectedTeam = useClaudeTeamsStore((s) => s.selectedTeam);

  // Team flow store
  const storeNodes = useTeamFlowStore((s) => s.nodes);
  const storeEdges = useTeamFlowStore((s) => s.edges);
  const buildGraphFromTeam = useTeamFlowStore((s) => s.buildGraphFromTeam);
  const theme = useTeamFlowStore((s) => s.theme);
  const viewMode = useTeamFlowStore((s) => s.viewMode);
  const setTheme = useTeamFlowStore((s) => s.setTheme);
  const selectTeammate = useTeamFlowStore((s) => s.selectTeammate);

  // Global settings theme
  const globalTheme = useSettingsStore((s) => s.appSettings.theme);

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Sync theme to global theme
  useEffect(() => {
    const mappedTheme = GLOBAL_TO_TEAM_THEME[globalTheme];
    if (mappedTheme && mappedTheme !== theme) {
      setTheme(mappedTheme);
    }
  }, [globalTheme, theme, setTheme]);

  // Rebuild graph when selected team or view mode changes
  useEffect(() => {
    if (selectedTeam) {
      buildGraphFromTeam(selectedTeam);
    }
  }, [selectedTeam, buildGraphFromTeam, viewMode]);

  // Sync store nodes to ReactFlow state
  useEffect(() => {
    const rfNodes: Node[] = storeNodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { data: n.data },
      draggable: true,
    }));
    setNodes(rfNodes);
  }, [storeNodes, setNodes]);

  useEffect(() => {
    const rfEdges: Edge[] = storeEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.animated,
      style: {
        stroke: e.data.color,
        strokeWidth: 2,
      },
      markerEnd: edgeOptions.markerEnd,
    }));
    setEdges(rfEdges);
  }, [storeEdges, setEdges]);

  // Handle node click - select teammate
  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    // Extract name from node id (format: "lead-{name}" or "teammate-{name}")
    const name = node.id.replace(/^(lead|teammate)-/, '');
    selectTeammate(name);
  }, [selectTeammate]);

  // Stats display
  const stats = useMemo(() => {
    if (!selectedTeam) return { total: 0, active: 0, idle: 0, stopped: 0 };
    const members = selectedTeam.config.members;
    return {
      total: members.length,
      active: storeNodes.filter((n) => n.data.status === 'active').length,
      idle: storeNodes.filter((n) => n.data.status === 'idle').length,
      stopped: storeNodes.filter((n) => n.data.status === 'stopped').length,
    };
  }, [selectedTeam, storeNodes]);

  return (
    <div className="h-full flex flex-col bg-black relative overflow-hidden" data-team-theme={theme}>
      <ScanlineOverlay theme={theme} />

      {/* Stats bar */}
      <div className="claude-teams-stats-bar relative z-10">
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 claude-teams-neon-cyan" />
          <span className="text-gray-400">Members:</span>
          <span className="claude-teams-neon-cyan font-medium">{stats.total}</span>
        </div>

        {stats.active > 0 && (
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 claude-teams-neon-green" />
            <span className="text-gray-400">Active:</span>
            <span className="claude-teams-neon-green font-medium">{stats.active}</span>
          </div>
        )}

        {stats.idle > 0 && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 claude-teams-neon-yellow" />
            <span className="text-gray-400">Idle:</span>
            <span className="claude-teams-neon-yellow font-medium">{stats.idle}</span>
          </div>
        )}

        {stats.stopped > 0 && (
          <div className="flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 claude-teams-neon-red" />
            <span className="text-gray-400">Stopped:</span>
            <span className="claude-teams-neon-red font-medium">{stats.stopped}</span>
          </div>
        )}
      </div>

      {/* ReactFlow canvas */}
      <div className="flex-1">
        {!selectedTeam || storeNodes.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center claude-teams-empty-state">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No team selected</p>
              <p className="text-xs mt-1 opacity-60">
                Create a team or select an existing one
              </p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={teamNodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2}
            defaultEdgeOptions={edgeOptions}
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
              nodeColor={(node) => {
                switch (node.type) {
                  case 'lead':
                    return theme === 'kuroryuu' ? '#c9a227' : theme === 'retro' ? '#33ff00' : '#ff00ff';
                  case 'teammate':
                    return theme === 'kuroryuu' ? '#c9a227' : theme === 'retro' ? '#33ff00' : '#00ffff';
                  default:
                    return '#888';
                }
              }}
              maskColor="rgba(0, 0, 0, 0.8)"
              className="claude-teams-minimap"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

export default TeamFlowPanel;
