/**
 * PTY Traffic Panel - Main visualization component for PTY traffic flow
 * Phase 1 MVP: Network graph showing agent-to-PTY data flow
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
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import {
  Wifi,
  WifiOff,
  Pause,
  Play,
  Trash2,
  RefreshCw,
  Radio,
  Activity,
  X,
  Terminal,
  Bot,
  Clock,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Ban,
} from 'lucide-react';

import { usePTYTrafficStore } from '../../stores/pty-traffic-store';
import { usePTYTrafficFlow } from '../../hooks/usePTYTrafficFlow';
import { useSettingsStore } from '../../stores/settings-store';
import { nodeTypes } from './PTYNodes';
import { PTYTrafficControls } from './PTYTrafficControls';
import type { PTYEvent, PTYVizTheme } from '../../types/pty-traffic';
import type { ThemeId } from '../../types/settings';
import '../../styles/pty-traffic.css';

// Map global ThemeId to PTYVizTheme
const GLOBAL_TO_VIZ_THEME: Partial<Record<ThemeId, PTYVizTheme>> = {
  'kuroryuu': 'kuroryuu',
  'retro': 'retro',
  'matrix': 'retro', // Matrix theme uses retro CRT style
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

// Event detail drawer component
function EventDetailDrawer({
  isOpen,
  onClose,
  selectedId,
  selectedType,
  events,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedId: string | null;
  selectedType: 'session' | 'agent' | null;
  events: PTYEvent[];
}) {
  if (!isOpen || !selectedId) return null;

  // Filter events for the selected session or agent
  const filteredEvents = events.filter((e) =>
    selectedType === 'session'
      ? e.session_id === selectedId
      : e.agent_id === selectedId
  );

  const formatTime = (timestamp: string | Date) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 pty-drawer flex flex-col z-50 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b pty-drawer-header">
        <div className="flex items-center gap-2">
          {selectedType === 'session' ? (
            <Terminal className="w-4 h-4 pty-neon-cyan" />
          ) : (
            <Bot className="w-4 h-4 pty-neon-purple" />
          )}
          <span className="text-sm font-medium truncate max-w-[180px]">
            {selectedId}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <X className="w-4 h-4 opacity-60" />
        </button>
      </div>

      {/* Stats summary */}
      <div className="px-3 py-2 border-b border-gray-700 bg-gray-800/50 text-xs">
        <div className="flex gap-4">
          <span className="text-gray-400">
            Events: <span className="text-cyan-400">{filteredEvents.length}</span>
          </span>
          <span className="text-gray-400">
            Errors:{' '}
            <span className="text-red-400">
              {filteredEvents.filter((e) => !e.success).length}
            </span>
          </span>
        </div>
      </div>

      {/* Events list - HP-4: Virtualized for performance */}
      <div className="flex-1 overflow-hidden">
        {filteredEvents.length === 0 ? (
          <div className="text-center text-gray-500 py-8 text-sm">
            No events recorded
          </div>
        ) : (
          <List
            height={400}
            itemCount={filteredEvents.length}
            itemSize={100}
            width="100%"
            className="divide-y divide-gray-800"
          >
            {({ index, style }: ListChildComponentProps) => {
              const event = filteredEvents[index];
              return (
                <div
                  style={style}
                  key={event.id}
                  className={`px-3 py-2 hover:bg-gray-800/50 transition-colors border-b border-gray-800 ${
                    !event.success ? 'bg-red-900/10' : ''
                  }`}
                >
                  {/* Event header */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {event.action === 'talk' || event.action === 'send_line' ? (
                        <ArrowRight className="w-3 h-3 text-green-400" />
                      ) : (
                        <ArrowLeft className="w-3 h-3 text-blue-400" />
                      )}
                      <span className="text-xs font-medium text-gray-300">
                        {event.action}
                      </span>
                      {!event.success && (
                        <AlertCircle className="w-3 h-3 text-red-400" />
                      )}
                      {(event as any).blocked && (
                        <Ban className="w-3 h-3 text-orange-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-gray-500">
                      <Clock className="w-3 h-3" />
                      {formatTime(event.timestamp)}
                    </div>
                  </div>

                  {/* Command preview */}
                  {event.command_preview && (
                    <div className="mt-1">
                      <div className="text-[10px] text-gray-500 mb-0.5">Command:</div>
                      <div className="text-xs font-mono bg-black/30 px-2 py-1 rounded text-green-300 break-all max-h-10 overflow-hidden">
                        {event.command_preview}
                      </div>
                    </div>
                  )}

                  {/* Response preview */}
                  {event.response_preview && (
                    <div className="mt-1">
                      <div className="text-[10px] text-gray-500 mb-0.5">Response:</div>
                      <div className="text-xs font-mono bg-black/30 px-2 py-1 rounded text-blue-300 break-all max-h-10 overflow-hidden">
                        {event.response_preview}
                      </div>
                    </div>
                  )}

                  {/* Duration */}
                  {event.duration && (
                    <div className="mt-1 text-[10px] text-gray-500">
                      Duration: {event.duration.toFixed(0)}ms
                    </div>
                  )}
                </div>
              );
            }}
          </List>
        )}
      </div>
    </div>
  );
}

// Scanline overlay for retro theme
function ScanlineOverlay({ theme }: { theme: string }) {
  if (theme !== 'retro') return null;
  return (
    <>
      <div className="pty-scanline-overlay" />
      <div className="pty-crt-effect" />
    </>
  );
}

export function PTYTrafficPanel() {
  // Store state
  const storeNodes = usePTYTrafficStore((s) => s.nodes);
  const storeEdges = usePTYTrafficStore((s) => s.edges);
  const events = usePTYTrafficStore((s) => s.events);
  const stats = usePTYTrafficStore((s) => s.stats);
  const isPaused = usePTYTrafficStore((s) => s.isPaused);
  const togglePause = usePTYTrafficStore((s) => s.togglePause);
  const clearEvents = usePTYTrafficStore((s) => s.clearEvents);
  const vizTheme = usePTYTrafficStore((s) => s.vizTheme);
  const setVizTheme = usePTYTrafficStore((s) => s.setVizTheme);

  // Global settings theme
  const globalTheme = useSettingsStore((s) => s.appSettings.theme);

  // Sync PTY viz theme to global theme
  useEffect(() => {
    const mappedTheme = GLOBAL_TO_VIZ_THEME[globalTheme];
    if (mappedTheme && mappedTheme !== vizTheme) {
      setVizTheme(mappedTheme);
    }
  }, [globalTheme, vizTheme, setVizTheme]);

  // WebSocket connection
  const { isConnected, reconnect } = usePTYTrafficFlow();

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Detail drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'session' | 'agent' | null>(null);

  // Handle node click - open detail drawer
  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    if (node.type === 'pty-session') {
      // Extract session ID from node ID (format: pty-{sessionId})
      const sessionId = node.id.replace('pty-', '');
      setSelectedId(sessionId);
      setSelectedType('session');
      setDrawerOpen(true);
    } else if (node.type === 'agent') {
      // Extract agent ID from node ID (format: agent-{agentId})
      const agentId = node.id.replace('agent-', '');
      setSelectedId(agentId);
      setSelectedType('agent');
      setDrawerOpen(true);
    } else if (node.type === 'mcp-core') {
      // Show all events
      setSelectedId('mcp-core');
      setSelectedType(null);
      setDrawerOpen(true);
    }
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedId(null);
    setSelectedType(null);
  }, []);

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

  // Stats display
  const statsDisplay = useMemo(() => {
    return {
      total: events.length,
      errors: events.filter((e) => !e.success).length,
      blocked: events.filter((e) => (e as any).blocked).length,
      agents: new Set(events.map((e) => e.agent_id).filter(Boolean)).size,
      sessions: new Set(events.map((e) => e.session_id)).size,
    };
  }, [events]);

  return (
    <div className="h-full flex flex-col bg-black relative overflow-hidden" data-pty-theme={vizTheme}>
      {/* Scanline overlay for retro theme */}
      <ScanlineOverlay theme={vizTheme} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/50 pty-header relative z-10">
        <div className="flex items-center gap-3">
          <Radio className="w-5 h-5 pty-neon-cyan" />
          <h2 className="text-sm font-semibold pty-header-title">PTY Traffic Flow</h2>

          {/* Connection status */}
          <div className="flex items-center gap-1.5 ml-4">
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4 pty-status-connected" />
                <span className="text-xs pty-status-connected">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 pty-status-disconnected" />
                <span className="text-xs pty-status-disconnected">Disconnected</span>
              </>
            )}
          </div>
        </div>

        {/* Quick Controls in header */}
        <div className="flex items-center gap-2">
          <button
            onClick={togglePause}
            className={`p-1.5 rounded transition-colors ${
              isPaused
                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          <button
            onClick={clearEvents}
            className="p-1.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            title="Clear events"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={reconnect}
            className="p-1.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            title="Reconnect"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-6 px-4 py-1.5 border-b border-gray-800 bg-gray-900/30 text-xs pty-stats-bar relative z-10">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 pty-neon-cyan" />
          <span className="text-gray-400">Events:</span>
          <span className="pty-neon-cyan font-medium">{statsDisplay.total}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">Agents:</span>
          <span className="pty-neon-purple font-medium">{statsDisplay.agents}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">Sessions:</span>
          <span className="pty-neon-cyan font-medium">{statsDisplay.sessions}</span>
        </div>

        {statsDisplay.errors > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Errors:</span>
            <span className="pty-neon-red font-medium">{statsDisplay.errors}</span>
          </div>
        )}

        {statsDisplay.blocked > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Blocked:</span>
            <span className="pty-neon-orange font-medium">{statsDisplay.blocked}</span>
          </div>
        )}
      </div>

      {/* Graph */}
      <div className="flex-1 relative">
        {/* Control panel (top left) */}
        <div className="absolute top-4 left-4 z-10">
          <PTYTrafficControls isConnected={isConnected} onReconnect={reconnect} />
        </div>

        {events.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center pty-empty-state">
              <Radio className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Waiting for PTY traffic...</p>
              <p className="text-xs mt-1 opacity-60">
                Events will appear as agents interact with PTY sessions
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
            nodeTypes={nodeTypes}
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
              className="pty-controls"
            />
            <MiniMap
              nodeColor={(node) => {
                switch (node.type) {
                  case 'agent':
                    return vizTheme === 'kuroryuu' ? '#8b1e1e' : '#9966ff';
                  case 'pty-session':
                    return vizTheme === 'kuroryuu' ? '#c9a227' : vizTheme === 'retro' ? '#33ff00' : '#00ffff';
                  case 'mcp-core':
                    return vizTheme === 'kuroryuu' ? '#c9a227' : vizTheme === 'retro' ? '#33ff00' : '#ff00ff';
                  default:
                    return '#888';
                }
              }}
              maskColor="rgba(0, 0, 0, 0.8)"
              className="pty-minimap"
            />
          </ReactFlow>
        )}

        {/* Event detail drawer */}
        <EventDetailDrawer
          isOpen={drawerOpen}
          onClose={closeDrawer}
          selectedId={selectedId}
          selectedType={selectedType}
          events={selectedType === null && selectedId === 'mcp-core' ? events : events}
        />
      </div>
    </div>
  );
}

export default PTYTrafficPanel;
