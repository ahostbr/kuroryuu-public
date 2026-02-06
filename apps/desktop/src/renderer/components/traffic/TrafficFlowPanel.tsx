/**
 * TrafficFlowPanel - Main traffic flow visualization component
 * Network graph showing real-time traffic between gateway and endpoints
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
import { useTrafficStore } from '../../stores/traffic-store';
import { useTrafficFlow } from '../../hooks/useTrafficFlow';
import { useSettingsStore } from '../../stores/settings-store';
import { GatewayNode } from './nodes/GatewayNode';
import { EndpointNode } from './nodes/EndpointNode';
import { MCPToolNode } from './nodes/MCPToolNode';
import { TrafficEdge } from './edges/TrafficEdge';
import { TrafficFlowControls } from './TrafficFlowControls';
import { TrafficStatsPanel } from './TrafficStatsPanel';
import { MatrixParticles } from './effects/MatrixParticles';
import { ScanlineOverlay } from './effects/ScanlineOverlay';
import { EndpointDetailDrawer } from './EndpointDetailDrawer';
import { RequestInspector } from './RequestInspector';
import { LiveMessagePanel } from './LiveMessagePanel';
import { DefenseToolbar } from './DefenseToolbar';
import type { TrafficVizTheme } from '../../types/traffic';
import type { ThemeId } from '../../types/settings';
import '../../styles/traffic-flow.css';

// Map global ThemeId to TrafficVizTheme
const GLOBAL_TO_VIZ_THEME: Partial<Record<ThemeId, TrafficVizTheme>> = {
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

// Register custom node types
const nodeTypes = {
  gateway: GatewayNode,
  endpoint: EndpointNode,
  'mcp-tool': MCPToolNode,
};

// Register custom edge types
const edgeTypes = {
  traffic: TrafficEdge,
};

export function TrafficFlowPanel() {
  // Connect to WebSocket
  useTrafficFlow();

  // Get state from store
  const nodes = useTrafficStore((s) => s.nodes);
  const edges = useTrafficStore((s) => s.edges);
  const stats = useTrafficStore((s) => s.stats);
  const vizTheme = useTrafficStore((s) => s.vizTheme);
  const setVizTheme = useTrafficStore((s) => s.setVizTheme);
  const viewMode = useTrafficStore((s) => s.viewMode);
  const drawerOpen = useTrafficStore((s) => s.drawerOpen);
  const inspectorOpen = useTrafficStore((s) => s.inspectorOpen);
  const openDrawer = useTrafficStore((s) => s.openDrawer);
  const defenseMode = useTrafficStore((s) => s.defenseMode);

  // Global settings theme
  const globalTheme = useSettingsStore((s) => s.appSettings.theme);

  // Sync traffic viz theme to global theme
  useEffect(() => {
    const mappedTheme = GLOBAL_TO_VIZ_THEME[globalTheme];
    if (mappedTheme && mappedTheme !== vizTheme) {
      setVizTheme(mappedTheme);
    }
  }, [globalTheme, vizTheme, setVizTheme]);

  // ReactFlow state
  const [reactFlowNodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [reactFlowEdges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // QW-2: Memoize edge transformation to avoid creating new arrays on every render
  const edgesWithType = useMemo(() =>
    edges.map((edge) => ({ ...edge, type: 'traffic' })),
    [edges]
  );

  // Sync store nodes/edges to ReactFlow
  useEffect(() => {
    setNodes(nodes);
  }, [nodes, setNodes]);

  useEffect(() => {
    setEdges(edgesWithType);
  }, [edgesWithType, setEdges]);

  // Handle node click - open drawer for endpoint nodes
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Only open drawer for endpoint and mcp-tool nodes
      if (node.type === 'endpoint' || node.type === 'mcp-tool') {
        openDrawer(node.id);
      }
    },
    [openDrawer]
  );

  return (
    <div
      className={`relative w-full h-full bg-black overflow-hidden flex ${defenseMode ? 'defense-mode-active' : ''}`}
      data-traffic-theme={vizTheme}
    >
      {/* Defense Mode Toolbar */}
      {defenseMode && <DefenseToolbar />}

      {/* Defense Mode Red Overlay */}
      {defenseMode && (
        <div className="absolute inset-0 z-40 pointer-events-none">
          {/* Red tint overlay */}
          <div className="absolute inset-0 bg-red-950/30 animate-pulse" />
          {/* Scanning line */}
          <div
            className="absolute w-full h-0.5 bg-red-500/50"
            style={{
              animation: 'defense-scan 2s linear infinite',
            }}
          />
          {/* LOCKDOWN text */}
          <div className="absolute bottom-4 left-4 text-red-500/40 text-6xl font-bold tracking-widest opacity-30">
            LOCKDOWN
          </div>
        </div>
      )}

      {/* Left Panel - Graph (always shown) */}
      <div className={`relative ${viewMode === 'split' ? 'w-1/2' : 'w-full'} h-full transition-all duration-300`}>
        {/* Main ReactFlow canvas */}
        <ReactFlow
          nodes={reactFlowNodes}
          edges={reactFlowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          className="traffic-flow-canvas"
          minZoom={0.2}
          maxZoom={2}
          defaultEdgeOptions={{
            animated: true,
          }}
        >
          <Background color="#0a0a0a" gap={20} />
          <Controls className="cyberpunk-controls" />
          <MiniMap
            className="cyberpunk-minimap"
            nodeColor={(node) => {
              if (node.type === 'gateway') return '#00ffff';
              if (node.type === 'endpoint') return '#ffff00';
              if (node.type === 'mcp-tool') return '#ff00ff';
              return '#666666';
            }}
          />
        </ReactFlow>

        {/* Background effects — AFTER ReactFlow so they render on top of the canvas background */}
        <MatrixParticles />
        <ScanlineOverlay />

        {/* Control panel (top left) */}
        <div className="absolute top-4 left-4 z-10">
          <TrafficFlowControls />
        </div>

        {/* Stats panel (top right) */}
        <div className="absolute top-4 right-4 z-10">
          <TrafficStatsPanel stats={stats} />
        </div>

        {/* Empty state — dragon ASCII with traffic messaging */}
        {reactFlowNodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none select-none">
            {/* Vignette */}
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.45) 100%)' }}
            />
            <div className="relative z-10 flex flex-col items-center gap-1.5 px-4">
              {/* Kanji */}
              <div
                className="font-serif leading-none"
                style={{
                  fontSize: '2.2rem',
                  color: '#c9a227',
                  textShadow: '0 0 25px rgba(201,162,39,0.35), 0 0 50px rgba(201,162,39,0.12)',
                  letterSpacing: '0.15em',
                }}
              >
                黒龍幻霧
              </div>
              {/* Subtitle */}
              <div
                className="font-mono uppercase tracking-[0.25em]"
                style={{ fontSize: '9px', color: 'rgba(201,162,39,0.45)' }}
              >
                KURORYUU GENMU
              </div>
              {/* ASCII Dragon */}
              <pre
                aria-hidden="true"
                className="leading-[1.1] overflow-hidden text-center mt-1"
                style={{
                  fontSize: 'clamp(0.2rem, 0.4vw, 0.35rem)',
                  color: 'rgba(160,35,35,0.65)',
                  textShadow: '0 0 8px rgba(180,40,40,0.25)',
                  userSelect: 'none',
                  fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace',
                }}
              >{`                                ==++++++++++=
                            ====    -==+++++++==========
                        #+=+                     ====++++++++
                     ### %%                           ++******%%%
                  +**     %%        **                   #***#%%%%%
               +*+         %%        ##                      %%%%%%%%%
             +              %%%%     %%#%                  *** %%%%%%%%%
                             %%%      %%%                  *  #  #%%#%%%%%
                              %%%      %%%                ++* #    ###%%%%%%
                               %%%     %%%                  +##     #***##*#%
                        *%%     %%%% %% %%%% %%            **         +++*+*%%#
                           %%%% ##%%%%%% %%%%%%           *            ++*#%%***
                          ###%%####*#%%%%% %%%%%         #              *########*
              ++=++     #%%  *##%##%%%%%%%%%%%%%% #      %              **####**#+=
               ++         ##%%%%%%%#%%%%%##%%%%%%%###    %             =+**#####**##
                =     **%%%%%%%%%%%##%%%%%%%%%########*  #               +**#######*+
               ***#%#*+***#%%%%%%%%%###%%%%%%%##******## +*    =        ++**###%%%#%#
             *#**%%%%*+#%%%%%%%%%%%#####%%%%%###***#**#   ##             **++*#%%%%%##
             **##%%%%%%%#%%#%%%%%%%#%%#%%%%%%%%##**###%%%%%##          ++**=-*##%%##%*
               **%%%%%%%%%%%%%%%%%%%%%%%%%####%#****##%%%%%%%#         ++++-=+*#%%%%%#
      +**++   +#*#*#%%%%%%%%%%%%%####*#%%#%%%####**    ##%%%#*       == +**++*###%%%%%*
        +****++*** *%%%%%%%##%%#####*   #%%%  ##%#**#    ###       ==== ****#####%%%%%#
          ####**   +*#%%%%%%##**###             #%%%%%##           ==+ +***####%####%%%
       ######*++    ==#%%%%###***+ %       *  *   %%%%%%*           ++++***##%%%###*#%%
       ## %%%++    ===+#%%%%%###                 %%%%%%%      +     *****#####%%%%##%%%
       ## #** *#*   ==+*###****==           %##%%%%%%%%   *    *  ++*#####%%##%%#%%%%%%
          %%% +**   ==***##**+=+====                     ***#*==+***#####%#######%%#%%%
             +**    =+++*****#+==+*****                 =+****###***########%%%%%%%%%%%
+             ==     +++=-+*+++=+####*+*                 ==++**#####%%##%###########%%%
+               ++    =*#++*+=+*#%%%%###%               ++*+++++#%%##%%%%%%#%%%%##%%%##
                      +*##**+######%%#           #      %%%*++%%%%%%%%%%%##*#**#%#%%%##
                       #########%%%%%%%#+=    *%%*##%%%%%%%%%%%%%%%%%%%%%%%%#**#%%%%%#
  #%                    #%%%%%%%%%%%%%%%#*#%%%%%%%#%%%%#*%%%%%%%%%%%%%%%%%%%%%##+*#%%#
++         *             *###%%%%%%%%%%%%#####%%%%%####**%%%%%%%%%%%%%%%%%%%%%%%##%%%%
*+* ++         *       == ####*##%%%%%%%##*+*#%%%%%*+##%%%%%%%#%%%%%%%%%%%%%%%%%%%%%#+
   *++  #   *    ++     ==+++#*##%%%%%###**+++*###*+*+%#%%%%%%#%%%%%%%%%%%%%%%%%%%%#*=
      ==  * **%%% %%     ==   ###%%%%####***+++++++######%%%%##%%%%%%%%%%%%%%%%%%%%#
    *+ +****** %%##%%%#     #++ %%%%%#######**+++*#####%%%%%%%%##%%%%%%%%%%%%%%%%%##*
            =   %%%%%%%%#            %########***++#####%%%%%%%%%**#%%%%%%%%%%**#####
               %%%%%%%%%%%#               *##*+++**####%%%%%%%%%#++**#%%%%%%%%##++=
                *%%%%%%%%%%  =                  %%%  %%%%%% %%%##=++*%%%%%%%%%#*+
                 %%%%%%%%%%                    %%%%%%%%%%%  %%   +-*%%%%%%%%%#**=
                   %%%%%%%%                      %%%%%%%%%        #%%%%%%%%%%**+
                   #%#%%%%%#              *      %%% %% %%       %%%%%%%%%%#*+=
                        %###*             +       #  %%   #   *%%%%%%%%%%#++==
                           #####                            %%%%%%%%%%%#%##+
                             ######*%#                *+   %%###%%%%%%%%%#====
                               #####%###%%     #%%%#* *##+*#%%%*++#***#%%
                                  =*#%%%%%%%%%%%%%%%%%%#####%%%#`}</pre>
              {/* Brand */}
              <div
                className="font-mono tracking-[0.5em] text-xs mt-1"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              >
                K U R O R Y U U
              </div>
              {/* Separator */}
              <div
                className="w-28 h-px mt-2 mb-1.5"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(201,162,39,0.25), transparent)' }}
              />
              {/* Traffic message */}
              <div className="text-sm text-muted-foreground">
                Awaiting traffic
              </div>
              <div
                className="font-mono tracking-wider"
                style={{ fontSize: '10px', color: 'rgba(201,162,39,0.3)' }}
              >
                Make API requests to visualize network flow
              </div>
            </div>
          </div>
        )}

        {/* Endpoint Detail Drawer */}
        {drawerOpen && <EndpointDetailDrawer />}
      </div>

      {/* Right Panel - Live Messages (shown in split mode) */}
      {viewMode === 'split' && (
        <div className="w-1/2 h-full live-message-split-panel">
          <LiveMessagePanel />
        </div>
      )}

      {/* Request Inspector Modal - always on top */}
      {inspectorOpen && <RequestInspector />}
    </div>
  );
}
