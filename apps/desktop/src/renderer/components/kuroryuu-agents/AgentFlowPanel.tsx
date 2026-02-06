/**
 * Agent Flow Panel - Main visualization component for Kuroryuu Agents flow
 * Shows a network graph of coding agent sessions
 */
import React, { useEffect, useCallback, useMemo, useState } from 'react';
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
import { Bot, Activity, CheckCircle, XCircle, Play } from 'lucide-react';

import { useKuroryuuAgentsStore } from '../../stores/kuroryuu-agents-store';
import { useAgentFlowStore, type AgentFlowTheme } from '../../stores/agent-flow-store';
import { useSettingsStore } from '../../stores/settings-store';
import { agentNodeTypes } from './AgentNodes';
import { AgentFlowControls } from './AgentFlowControls';
import { AgentsEmptyState } from './AgentsEmptyState';
import { SpawnAgentDialog } from './SpawnAgentDialog';
import { SessionLogViewer } from './SessionLogViewer';
import { SessionManagerModal } from './SessionManagerModal';
import type { ThemeId } from '../../types/settings';
import '../../styles/agent-flow.css';

// Gateway MCP endpoint
const GATEWAY_MCP_URL = 'http://127.0.0.1:8200/v1/mcp/call';

// Map global ThemeId to AgentFlowTheme
const GLOBAL_TO_AGENT_THEME: Partial<Record<ThemeId, AgentFlowTheme>> = {
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

// Custom edge style
const edgeOptions = {
  style: { strokeWidth: 2 },
  markerEnd: {
    type: 'arrowclosed' as const,
    color: '#888',
  },
};

// Scanline overlay for retro theme
function ScanlineOverlay({ theme }: { theme: string }) {
  if (theme !== 'retro') return null;
  return (
    <>
      <div className="agent-flow-scanline-overlay" />
      <div className="agent-flow-crt-effect" />
    </>
  );
}

interface AgentFlowPanelProps {
  // Self-contained - no props needed
}

export function AgentFlowPanel(_props: AgentFlowPanelProps) {
  // Kuroryuu agents store
  const sessions = useKuroryuuAgentsStore((s) => s.sessions);
  const loadSessions = useKuroryuuAgentsStore((s) => s.loadSessions);
  const killSession = useKuroryuuAgentsStore((s) => s.killSession);
  const startPolling = useKuroryuuAgentsStore((s) => s.startPolling);
  const stopPolling = useKuroryuuAgentsStore((s) => s.stopPolling);

  // Local session selection state (self-contained, no tab switching)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  // Agent flow store
  const storeNodes = useAgentFlowStore((s) => s.nodes);
  const storeEdges = useAgentFlowStore((s) => s.edges);
  const buildGraphFromSessions = useAgentFlowStore((s) => s.buildGraphFromSessions);
  const theme = useAgentFlowStore((s) => s.theme);
  const setTheme = useAgentFlowStore((s) => s.setTheme);
  const isConnected = useAgentFlowStore((s) => s.isConnected);
  const setConnected = useAgentFlowStore((s) => s.setConnected);

  // Global settings theme
  const globalTheme = useSettingsStore((s) => s.appSettings.theme);

  // View mode state
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');

  // Spawn dialog state
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);

  // Session Manager modal state
  const [showSessionManager, setShowSessionManager] = useState(false);

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Sync theme to global theme
  useEffect(() => {
    const mappedTheme = GLOBAL_TO_AGENT_THEME[globalTheme];
    if (mappedTheme && mappedTheme !== theme) {
      setTheme(mappedTheme);
    }
  }, [globalTheme, theme, setTheme]);

  // Start polling on mount
  useEffect(() => {
    startPolling(5000);
    setConnected(true);
    return () => {
      stopPolling();
    };
  }, [startPolling, stopPolling, setConnected]);

  // Rebuild graph when sessions change
  useEffect(() => {
    buildGraphFromSessions(sessions);
  }, [sessions, buildGraphFromSessions]);

  // Sync store nodes/edges to ReactFlow state
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

  // Handle node click - select session locally (no tab switch)
  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    if (node.type === 'agent-session') {
      const sessionId = node.id.replace('session-', '');
      setSelectedSessionId(sessionId);
    } else if (node.type === 'session-manager') {
      // Click on Session Manager node opens the control modal
      setShowSessionManager(true);
    }
  }, []);

  // Kill session handler
  const handleKill = useCallback(async (sessionId: string) => {
    await killSession(sessionId);
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(null);
    }
  }, [killSession, selectedSessionId]);

  // Kill ALL running sessions
  const handleKillAll = useCallback(async () => {
    const runningSessions = sessions.filter((s) => s.running);
    await Promise.all(runningSessions.map((s) => killSession(s.id)));
    setSelectedSessionId(null);
    setShowSessionManager(false);
  }, [sessions, killSession]);

  // Reconnect handler
  const handleReconnect = useCallback(() => {
    loadSessions();
    setConnected(true);
  }, [loadSessions, setConnected]);

  // Spawn agent handler - calls k_bash via Gateway MCP
  const handleSpawn = useCallback(async (command: string, workdir: string, pty: boolean) => {
    try {
      const response = await fetch(GATEWAY_MCP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'k_bash',
          arguments: {
            command,
            workdir: workdir || undefined,
            background: true,
            pty,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gateway error: ${response.status}`);
      }

      // Refresh sessions to show the new agent
      setTimeout(() => loadSessions(), 1000);
      setShowSpawnDialog(false);
    } catch (error) {
      console.error('Failed to spawn agent:', error);
      throw error;
    }
  }, [loadSessions]);

  // Stats display
  const statsDisplay = useMemo(() => {
    return {
      total: sessions.length,
      running: sessions.filter((s) => s.running).length,
      completed: sessions.filter((s) => !s.running && s.exit_code === 0).length,
      failed: sessions.filter((s) => !s.running && s.exit_code !== 0 && s.exit_code !== null).length,
    };
  }, [sessions]);

  return (
    <div className="h-full flex flex-col bg-black relative overflow-hidden" data-agent-theme={theme}>
      {/* Scanline overlay for retro theme */}
      <ScanlineOverlay theme={theme} />

      {/* Stats bar */}
      <div className="agent-flow-stats-bar relative z-10">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 agent-flow-neon-cyan" />
          <span className="text-gray-400">Total:</span>
          <span className="agent-flow-neon-cyan font-medium">{statsDisplay.total}</span>
        </div>

        {statsDisplay.running > 0 && (
          <div className="flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 agent-flow-neon-cyan" />
            <span className="text-gray-400">Running:</span>
            <span className="agent-flow-neon-cyan font-medium">{statsDisplay.running}</span>
          </div>
        )}

        {statsDisplay.completed > 0 && (
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 agent-flow-neon-green" />
            <span className="text-gray-400">Completed:</span>
            <span className="agent-flow-neon-green font-medium">{statsDisplay.completed}</span>
          </div>
        )}

        {statsDisplay.failed > 0 && (
          <div className="flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 agent-flow-neon-red" />
            <span className="text-gray-400">Failed:</span>
            <span className="agent-flow-neon-red font-medium">{statsDisplay.failed}</span>
          </div>
        )}
      </div>

      {/* Main content - split view when session selected */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph panel */}
        <div className={`relative transition-all duration-300 ${selectedSession ? 'w-1/2' : 'flex-1'}`}>
          {/* Control panel (top left) */}
          <div className="absolute top-4 left-4 z-10">
            <AgentFlowControls
              isConnected={isConnected}
              onReconnect={handleReconnect}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onSpawnAgent={() => setShowSpawnDialog(true)}
              onKillAll={handleKillAll}
              runningCount={statsDisplay.running}
            />
          </div>

          {sessions.length === 0 ? (
            <AgentsEmptyState
              message="No Kuroryuu agent sessions"
              hint="Use k_bash with background=true to spawn agents"
            />
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodeTypes={agentNodeTypes}
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
                className="agent-flow-controls"
              />
              <MiniMap
                nodeColor={(node) => {
                  switch (node.type) {
                    case 'session-manager':
                      return theme === 'kuroryuu' ? '#c9a227' : theme === 'retro' ? '#33ff00' : '#ff00ff';
                    case 'agent-session':
                      return theme === 'kuroryuu' ? '#c9a227' : theme === 'retro' ? '#33ff00' : '#00ffff';
                    default:
                      return '#888';
                  }
                }}
                maskColor="rgba(0, 0, 0, 0.8)"
                className="agent-flow-minimap"
              />
            </ReactFlow>
          )}
        </div>

        {/* Log viewer panel - embedded when session selected */}
        {selectedSession && (
          <div className="w-1/2 border-l border-border bg-card">
            <SessionLogViewer
              session={selectedSession}
              onKill={() => handleKill(selectedSession.id)}
              onClose={() => setSelectedSessionId(null)}
            />
          </div>
        )}
      </div>

      {/* Spawn Agent Dialog */}
      <SpawnAgentDialog
        isOpen={showSpawnDialog}
        onClose={() => setShowSpawnDialog(false)}
        onSpawn={handleSpawn}
      />

      {/* Session Manager Modal */}
      <SessionManagerModal
        isOpen={showSessionManager}
        onClose={() => setShowSessionManager(false)}
        sessions={sessions}
        onKillSession={handleKill}
        onKillAll={handleKillAll}
        onSpawnAgent={() => {
          setShowSessionManager(false);
          setShowSpawnDialog(true);
        }}
        onSelectSession={(id) => {
          setShowSessionManager(false);
          setSelectedSessionId(id);
        }}
      />
    </div>
  );
}

export default AgentFlowPanel;
