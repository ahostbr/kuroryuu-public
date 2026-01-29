/**
 * NetworkGraphPanel - Force-directed graph of network endpoints
 * Shows all API endpoints with real-time traffic metrics
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { EndpointMetricNode, type EndpointMetricNodeData } from './nodes/EndpointMetricNode';
import { GatewayNode, type GatewayNodeData } from './nodes/GatewayNode';
import { RouterNode, type RouterNodeData } from './nodes/RouterNode';
import { TrafficFlowEdge, type TrafficFlowEdgeData } from './edges/TrafficFlowEdge';
import { RouterPopout } from './RouterPopout';
import { useTrafficStore } from '../../stores/traffic-store';
import { useTrafficFlow } from '../../hooks/useTrafficFlow';
import type { EndpointSummary } from '../../types/traffic';
import { RefreshCw, Loader2, WifiOff } from 'lucide-react';

// Router aggregation interface
interface RouterSummary {
  router: string;
  endpoints: EndpointSummary[];
  requestCount: number;
  errorCount: number;
  errorRate: number;
  avgLatency: number;
}

/**
 * Extract router prefix from endpoint path
 * /v1/agents/123/heartbeat -> /v1/agents
 * /v1/orchestration/tasks/456 -> /v1/orchestration
 */
function getRouterFromEndpoint(endpoint: string): string {
  const parts = endpoint.split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  if (parts[0] === 'v1' && parts.length >= 2) {
    return `/${parts[0]}/${parts[1]}`;
  }
  if (parts[0] === 'ws') return '/ws';
  if (parts[0] === 'api') return `/api/${parts[1] || ''}`;
  return `/${parts[0]}`;
}

/**
 * Group endpoints by router and aggregate stats
 */
function groupEndpointsByRouter(endpoints: EndpointSummary[]): RouterSummary[] {
  const routerMap = new Map<string, EndpointSummary[]>();

  for (const ep of endpoints) {
    const router = getRouterFromEndpoint(ep.endpoint);
    const existing = routerMap.get(router) || [];
    existing.push(ep);
    routerMap.set(router, existing);
  }

  return Array.from(routerMap.entries()).map(([router, eps]) => {
    const totalRequests = eps.reduce((sum, ep) => sum + ep.request_count, 0);
    const totalErrors = eps.reduce((sum, ep) => sum + ep.error_count, 0);
    const avgLatency = eps.length > 0
      ? eps.reduce((sum, ep) => sum + ep.avg_latency * ep.request_count, 0) / Math.max(totalRequests, 1)
      : 0;

    return {
      router,
      endpoints: eps,
      requestCount: totalRequests,
      errorCount: totalErrors,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      avgLatency,
    };
  }).sort((a, b) => b.requestCount - a.requestCount);
}

// Type for any node data (to satisfy @xyflow/react's generic constraints)
type AnyNodeData = Record<string, unknown>;
type AnyEdgeData = Record<string, unknown>;
type NetworkNode = Node<AnyNodeData>;
type NetworkEdge = Edge<AnyEdgeData>;

// Custom node types
const nodeTypes = {
  gateway: GatewayNode,
  endpoint: EndpointMetricNode,
  router: RouterNode,
};

// View mode - routers (simplified) or endpoints (detailed)
type ViewMode = 'routers' | 'endpoints';

// Custom edge types
const edgeTypes = {
  traffic: TrafficFlowEdge,
};

// Gateway API endpoint
const TRAFFIC_API = 'http://127.0.0.1:8200/v1/traffic';

// Force simulation parameters (tuned for 50+ nodes - maximum spread)
const FORCE_CONFIG = {
  centerStrength: 0.0005,     // nearly no center pull
  repulsionStrength: -10000,  // maximum repulsion
  linkStrength: 0.01,         // minimal link attraction
  linkDistance: 600,          // very large spacing
  collisionRadius: 20,        // minimal collision
  dampening: 0.65,            // fast settling
  minVelocity: 0.005,         // fine movement
};

// Simple 2D vector
interface Vec2 {
  x: number;
  y: number;
}

// Force simulation node
interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number; // fixed x
  fy?: number; // fixed y
  radius: number;
}

/**
 * Simple force-directed layout simulation
 * Implements: center force, repulsion, link attraction, collision
 */
function runForceSimulation(
  nodes: SimNode[],
  links: { source: string; target: string }[],
  centerX: number,
  centerY: number,
  iterations: number = 1
): SimNode[] {
  const cfg = FORCE_CONFIG;

  for (let iter = 0; iter < iterations; iter++) {
    // Center force - pull all nodes toward center
    for (const node of nodes) {
      if (node.fx !== undefined) continue; // skip fixed nodes
      const dx = centerX - node.x;
      const dy = centerY - node.y;
      node.vx += dx * cfg.centerStrength;
      node.vy += dy * cfg.centerStrength;
    }

    // Repulsion force - nodes push each other away
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        if (nodeA.fx !== undefined && nodeB.fx !== undefined) continue;

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 1;

        const force = cfg.repulsionStrength / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (nodeA.fx === undefined) {
          nodeA.vx -= fx;
          nodeA.vy -= fy;
        }
        if (nodeB.fx === undefined) {
          nodeB.vx += fx;
          nodeB.vy += fy;
        }
      }
    }

    // Link force - connected nodes attract
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (const link of links) {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (!source || !target) continue;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const diff = dist - cfg.linkDistance;

      const force = diff * cfg.linkStrength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (source.fx === undefined) {
        source.vx += fx;
        source.vy += fy;
      }
      if (target.fx === undefined) {
        target.vx -= fx;
        target.vy -= fy;
      }
    }

    // Collision detection - prevent overlap
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = nodeA.radius + nodeB.radius;

        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const fx = (dx / dist) * overlap;
          const fy = (dy / dist) * overlap;

          if (nodeA.fx === undefined) {
            nodeA.x -= fx;
            nodeA.y -= fy;
          }
          if (nodeB.fx === undefined) {
            nodeB.x += fx;
            nodeB.y += fy;
          }
        }
      }
    }

    // Apply velocity with dampening
    for (const node of nodes) {
      if (node.fx !== undefined) {
        node.x = node.fx;
        node.y = node.fy!;
        continue;
      }

      node.vx *= cfg.dampening;
      node.vy *= cfg.dampening;

      // Apply minimum velocity threshold
      if (Math.abs(node.vx) < cfg.minVelocity) node.vx = 0;
      if (Math.abs(node.vy) < cfg.minVelocity) node.vy = 0;

      node.x += node.vx;
      node.y += node.vy;
    }
  }

  return nodes;
}

export function NetworkGraphPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const animFrameRef = useRef<number | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<NetworkNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<NetworkEdge>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpointData, setEndpointData] = useState<EndpointSummary[]>([]);
  const [requestHistory, setRequestHistory] = useState<Map<string, number[]>>(new Map());
  const [viewMode, setViewMode] = useState<ViewMode>('routers'); // Default to simplified view
  const [selectedRouter, setSelectedRouter] = useState<string | null>(null);
  const [routerSummaries, setRouterSummaries] = useState<RouterSummary[]>([]);

  // Traffic store for live updates
  const stats = useTrafficStore((s) => s.stats);
  const events = useTrafficStore((s) => s.events);
  const { isConnected } = useTrafficFlow();

  // Track active endpoints (received event in last 2s)
  const [activeEndpoints, setActiveEndpoints] = useState<Set<string>>(new Set());

  /**
   * Fetch endpoint summaries from API
   */
  const fetchEndpoints = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${TRAFFIC_API}/endpoints`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      // Handle both array response and object with endpoints property
      const endpoints: EndpointSummary[] = Array.isArray(data)
        ? data
        : (data?.endpoints ?? data?.data ?? []);
      setEndpointData(endpoints);
    } catch (err) {
      console.error('[NetworkGraph] Failed to fetch endpoints:', err);
      setError(err instanceof Error ? err.message : 'Failed to load endpoints');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchEndpoints();
  }, [fetchEndpoints]);

  /**
   * Track active endpoints from traffic events
   */
  useEffect(() => {
    if (events.length === 0) return;

    const recentEvent = events[events.length - 1];
    if (!recentEvent?.endpoint) return;

    // Mark endpoint as active
    setActiveEndpoints((prev) => {
      const next = new Set(prev);
      next.add(recentEvent.endpoint);
      return next;
    });

    // Update request history for sparklines
    setRequestHistory((prev) => {
      const next = new Map(prev);
      const history = next.get(recentEvent.endpoint) || [];
      const newHistory = [...history.slice(-19), 1]; // Keep last 20 points
      next.set(recentEvent.endpoint, newHistory);
      return next;
    });

    // Clear active status after 2s
    const timeout = setTimeout(() => {
      setActiveEndpoints((prev) => {
        const next = new Set(prev);
        next.delete(recentEvent.endpoint);
        return next;
      });
    }, 2000);

    return () => clearTimeout(timeout);
  }, [events]);

  // Track if graph has been built - only build once per session
  const graphBuiltRef = useRef(false);
  const endpointDataRef = useRef<EndpointSummary[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    endpointDataRef.current = endpointData;
  }, [endpointData]);

  /**
   * Build graph structure when endpoints first load
   * Supports two modes: routers (simplified, ~38 nodes) or endpoints (detailed, 190+ nodes)
   */
  const buildGraph = useCallback((forceRebuild = false) => {
    if (!containerRef.current) return;
    if (graphBuiltRef.current && !forceRebuild) return;
    if (endpointDataRef.current.length === 0) return;

    graphBuiltRef.current = true;
    const data = endpointDataRef.current;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Create gateway node (fixed at center)
    const gatewayNode: NetworkNode = {
      id: 'gateway',
      type: 'gateway',
      position: { x: centerX - 48, y: centerY - 48 },
      data: {
        label: 'Gateway',
        isConnected: false,
        totalRequests: 0,
        requestsPerSecond: 0,
        avgLatency: 0,
        errorRate: 0,
      } as AnyNodeData,
    };

    if (viewMode === 'routers') {
      // SIMPLIFIED VIEW: Group by router (~38 nodes)
      const routers = groupEndpointsByRouter(data);
      setRouterSummaries(routers);

      const routerNodes: NetworkNode[] = routers.map((rs, index) => {
        const angle = (index / routers.length) * 2 * Math.PI - Math.PI / 2;
        const radius = Math.max(300, routers.length * 25);

        return {
          id: `router-${rs.router}`,
          type: 'router',
          position: {
            x: centerX + Math.cos(angle) * radius - 70,
            y: centerY + Math.sin(angle) * radius - 40,
          },
          data: {
            router: rs.router,
            endpointCount: rs.endpoints.length,
            requestCount: rs.requestCount,
            requestsPerSecond: 0,
            errorCount: rs.errorCount,
            errorRate: rs.errorRate,
            avgLatency: rs.avgLatency,
            isActive: false,
            endpoints: rs.endpoints.map(e => e.endpoint),
          } as AnyNodeData,
        };
      });

      const routerEdges: NetworkEdge[] = routers.map((rs) => ({
        id: `edge-gateway-${rs.router}`,
        source: 'gateway',
        target: `router-${rs.router}`,
        type: 'traffic',
        data: {
          requestCount: rs.requestCount,
          errorCount: rs.errorCount,
          avgLatency: rs.avgLatency,
          isActive: false,
        } as AnyEdgeData,
      }));

      simNodesRef.current = [
        {
          id: 'gateway',
          x: centerX,
          y: centerY,
          vx: 0,
          vy: 0,
          fx: centerX,
          fy: centerY,
          radius: 60,
        },
        ...routerNodes.map((node) => ({
          id: node.id,
          x: node.position.x + 70,
          y: node.position.y + 40,
          vx: 0,
          vy: 0,
          radius: 90,
        })),
      ];

      console.log('[NetworkGraph] Built router view with', routers.length, 'routers');
      setNodes([gatewayNode, ...routerNodes]);
      setEdges(routerEdges);
    } else {
      // DETAILED VIEW: Show all endpoints (190+ nodes)
      const endpointNodes: NetworkNode[] = data.map((ep, index) => {
        const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2;
        const radius = Math.max(500, data.length * 18);

        return {
          id: `ep-${ep.endpoint}`,
          type: 'endpoint',
          position: {
            x: centerX + Math.cos(angle) * radius - 70,
            y: centerY + Math.sin(angle) * radius - 50,
          },
          data: {
            endpoint: ep.endpoint,
            category: ep.category || 'unknown',
            method: ep.methods_used?.[0] || 'GET',
            requestCount: ep.request_count,
            errorCount: ep.error_count,
            errorRate: ep.error_rate,
            avgLatency: ep.avg_latency,
            p95Latency: ep.p95_latency,
            minLatency: ep.min_latency,
            maxLatency: ep.max_latency,
            totalRequestBytes: 0,
            totalResponseBytes: 0,
            requestHistory: [],
            isActive: false,
          } as AnyNodeData,
        };
      });

      const graphEdges: NetworkEdge[] = data.map((ep) => ({
        id: `edge-gateway-${ep.endpoint}`,
        source: 'gateway',
        target: `ep-${ep.endpoint}`,
        type: 'traffic',
        data: {
          requestCount: ep.request_count,
          errorCount: ep.error_count,
          avgLatency: ep.avg_latency,
          isActive: false,
        } as AnyEdgeData,
      }));

      simNodesRef.current = [
        {
          id: 'gateway',
          x: centerX,
          y: centerY,
          vx: 0,
          vy: 0,
          fx: centerX,
          fy: centerY,
          radius: 60,
        },
        ...endpointNodes.map((node) => ({
          id: node.id,
          x: node.position.x + 70,
          y: node.position.y + 50,
          vx: 0,
          vy: 0,
          radius: 80,
        })),
      ];

      console.log('[NetworkGraph] Built endpoint view with', data.length, 'endpoints');
      setNodes([gatewayNode, ...endpointNodes]);
      setEdges(graphEdges);
    }
  }, [setNodes, setEdges, viewMode]);

  // Rebuild graph when view mode changes
  useEffect(() => {
    if (endpointData.length > 0) {
      graphBuiltRef.current = false;
      animStartedRef.current = false;
      buildGraph(true);
    }
  }, [viewMode]);

  // Build graph ONCE when container is ready and data is available
  useEffect(() => {
    if (endpointData.length === 0 || !containerRef.current) return;
    if (graphBuiltRef.current) return; // Already built

    // Wait for container to have dimensions, then build once
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        buildGraph(); // Has guard, will only run once
        observer.disconnect(); // Stop observing after first build
      }
    });

    observer.observe(containerRef.current);

    // Try building immediately if container already has dimensions
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      buildGraph();
      return () => observer.disconnect();
    }

    return () => observer.disconnect();
  }, [endpointData.length, buildGraph]); // Only depend on length, not full array

  // Track if animation has started - only start once
  const animStartedRef = useRef(false);

  /**
   * Run force simulation animation ONCE after graph is built
   */
  useEffect(() => {
    if (simNodesRef.current.length === 0 || !containerRef.current) return;
    if (animStartedRef.current) return; // Already running
    animStartedRef.current = true;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Build links from simNodes (not from endpointData which changes)
    const links = simNodesRef.current
      .filter((n) => n.id !== 'gateway')
      .map((n) => ({
        source: 'gateway',
        target: n.id,
      }));

    let frameCount = 0;
    const maxFrames = 300;
    const nodeCount = simNodesRef.current.length;

    const animate = () => {
      frameCount++;
      const iterations = frameCount < maxFrames
        ? Math.min(8, Math.ceil(nodeCount / 15))
        : 1;

      simNodesRef.current = runForceSimulation(
        simNodesRef.current,
        links,
        centerX,
        centerY,
        iterations
      );

      // Update React Flow node positions
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          const simNode = simNodesRef.current.find((sn) => sn.id === node.id);
          if (!simNode) return node;

          return {
            ...node,
            position: {
              x: simNode.x - (node.id === 'gateway' ? 48 : 70),
              y: simNode.y - (node.id === 'gateway' ? 48 : 50),
            },
          };
        })
      );

      // Continue animation at reduced rate after initial settling
      if (frameCount < maxFrames) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Slow updates after settling
        animFrameRef.current = window.setTimeout(() => {
          animFrameRef.current = requestAnimationFrame(animate);
        }, 100) as unknown as number;
      }
    };

    console.log('[NetworkGraph] Starting animation with', nodeCount, 'nodes (one-time)');
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [nodes.length, setNodes]); // Only trigger on node count change

  /**
   * Update node data when stats change (without rebuilding positions)
   */
  useEffect(() => {
    setNodes((prevNodes) =>
      prevNodes.map((node) => {
        if (node.id === 'gateway') {
          return {
            ...node,
            data: {
              ...node.data,
              isConnected,
              totalRequests: stats.totalRequests,
              requestsPerSecond: stats.requestsPerSecond,
              avgLatency: stats.avgLatency,
              errorRate: stats.errorRate,
            },
          };
        }

        // Router node update
        if (node.type === 'router') {
          const routerPath = node.id.replace('router-', '');
          const routerEndpoints = endpointData.filter(
            ep => getRouterFromEndpoint(ep.endpoint) === routerPath
          );
          const isRouterActive = routerEndpoints.some(ep => activeEndpoints.has(ep.endpoint));
          const totalReqs = routerEndpoints.reduce((sum, ep) => sum + ep.request_count, 0);
          const totalErrs = routerEndpoints.reduce((sum, ep) => sum + ep.error_count, 0);
          const avgLat = routerEndpoints.length > 0
            ? routerEndpoints.reduce((sum, ep) => sum + ep.avg_latency, 0) / routerEndpoints.length
            : 0;

          return {
            ...node,
            data: {
              ...node.data,
              requestCount: totalReqs,
              errorCount: totalErrs,
              errorRate: totalReqs > 0 ? totalErrs / totalReqs : 0,
              avgLatency: avgLat,
              isActive: isRouterActive,
            },
          };
        }

        // Update endpoint data and active state
        const endpoint = node.id.replace('ep-', '');
        const ep = endpointData.find((e) => e.endpoint === endpoint);
        if (ep) {
          return {
            ...node,
            data: {
              ...node.data,
              requestCount: ep.request_count,
              errorCount: ep.error_count,
              errorRate: ep.error_rate,
              avgLatency: ep.avg_latency,
              p95Latency: ep.p95_latency,
              isActive: activeEndpoints.has(endpoint),
              requestHistory: requestHistory.get(endpoint) || [],
            },
          };
        }

        return node;
      })
    );

    // Update edge data and active state
    setEdges((prevEdges) =>
      prevEdges.map((edge) => {
        if (edge.target.startsWith('router-')) {
          // Router edge
          const routerPath = edge.target.replace('router-', '');
          const routerEndpoints = endpointData.filter(
            ep => getRouterFromEndpoint(ep.endpoint) === routerPath
          );
          const isRouterActive = routerEndpoints.some(ep => activeEndpoints.has(ep.endpoint));
          const totalReqs = routerEndpoints.reduce((sum, ep) => sum + ep.request_count, 0);
          const totalErrs = routerEndpoints.reduce((sum, ep) => sum + ep.error_count, 0);

          return {
            ...edge,
            data: {
              ...edge.data,
              requestCount: totalReqs,
              errorCount: totalErrs,
              isActive: isRouterActive,
            },
          };
        }

        // Endpoint edge
        const endpoint = edge.target.replace('ep-', '');
        const ep = endpointData.find((e) => e.endpoint === endpoint);
        return {
          ...edge,
          data: {
            ...edge.data,
            requestCount: ep?.request_count ?? 0,
            errorCount: ep?.error_count ?? 0,
            avgLatency: ep?.avg_latency ?? 0,
            isActive: activeEndpoints.has(endpoint),
          },
        };
      })
    );
  }, [stats, isConnected, activeEndpoints, requestHistory, endpointData, setNodes, setEdges]);

  // Handle node click for router popout - MUST be before early returns (React Rules of Hooks)
  const handleNodeClick = useCallback((_: React.MouseEvent, node: NetworkNode) => {
    if (node.type === 'router') {
      const routerPath = node.id.replace('router-', '');
      setSelectedRouter(prev => prev === routerPath ? null : routerPath);
    }
  }, []);

  // Get endpoints for selected router - MUST be before early returns (React Rules of Hooks)
  const selectedRouterEndpoints = useMemo(() => {
    if (!selectedRouter) return [];
    return endpointData.filter(ep => getRouterFromEndpoint(ep.endpoint) === selectedRouter);
  }, [selectedRouter, endpointData]);

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading endpoints...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3 text-center px-4">
          <WifiOff className="w-8 h-8 text-red-400" />
          <span className="text-sm text-red-400">Failed to load network data</span>
          <span className="text-xs text-muted-foreground">{error}</span>
          <button
            onClick={fetchEndpoints}
            className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (endpointData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3 text-center px-4">
          <span className="text-sm text-muted-foreground">No endpoints recorded yet</span>
          <span className="text-xs text-zinc-500">Make some API calls to see traffic</span>
          <button
            onClick={fetchEndpoints}
            className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full bg-zinc-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="network-graph"
      >
        <Background color="#333" gap={20} />
        <Controls
          className="!bg-zinc-800 !border-zinc-700 !rounded-lg"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-zinc-900 !border-zinc-700"
          nodeColor={(node) => {
            if (node.type === 'gateway') return '#22d3ee';
            const data = node.data as AnyNodeData;
            if ((data?.errorRate as number) > 0.1) return '#ef4444';
            if (data?.isActive) return '#22c55e';
            return '#64748b';
          }}
          maskColor="rgba(0, 0, 0, 0.7)"
        />
      </ReactFlow>

      {/* View mode toggle */}
      <div className="absolute top-4 left-4 flex items-center gap-1 bg-zinc-800/90 rounded-lg p-1">
        <button
          onClick={() => setViewMode('routers')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            viewMode === 'routers'
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Routers ({routerSummaries.length || '...'})
        </button>
        <button
          onClick={() => setViewMode('endpoints')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            viewMode === 'endpoints'
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Endpoints ({endpointData.length})
        </button>
      </div>

      {/* Connection status indicator */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 px-2 py-1 bg-zinc-900/80 rounded text-xs">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
        <span className="text-muted-foreground">
          {isConnected ? 'Live' : 'Disconnected'}
        </span>
        <span className="text-zinc-500">|</span>
        <span className="text-muted-foreground">
          {viewMode === 'routers' ? `${routerSummaries.length} routers` : `${endpointData.length} endpoints`}
        </span>
      </div>

      {/* Refresh button */}
      <button
        onClick={fetchEndpoints}
        className="absolute top-4 right-4 p-2 rounded bg-zinc-800/80 hover:bg-zinc-700 transition-colors"
        title="Refresh endpoints"
      >
        <RefreshCw className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Router popout when clicking a router node */}
      {selectedRouter && viewMode === 'routers' && (
        <RouterPopout
          router={selectedRouter}
          endpoints={selectedRouterEndpoints}
          onClose={() => setSelectedRouter(null)}
        />
      )}
    </div>
  );
}

export default NetworkGraphPanel;
