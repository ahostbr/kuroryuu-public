/**
 * OrbGraphView - Cyberpunk animated neural network graph for Claude Teams
 *
 * Canvas 2D: glowing orb nodes (force-directed layout) + particle-trail edges.
 * Lead = large electric-cyan core. Workers = colored orbs per member color.
 * Particles flow along edges proportional to inbox message activity.
 */
import { useEffect, useRef } from 'react';
import { useClaudeTeamsStore } from '../../stores/claude-teams-store';
import { useTeamFlowStore } from '../../stores/team-flow-store';
import type { TeamSnapshot } from '../../types/claude-teams';

// ─── Internal types ───────────────────────────────────────────────────────────

interface OrbNode {
  id: string;
  label: string;
  role: 'lead' | 'worker';
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  activityLevel: number; // 0–1
}

interface Particle {
  t: number;      // 0–1 position along edge (from→to)
  speed: number;
  alpha: number;
}

interface OrbEdge {
  fromId: string;
  toId: string;
  fwdParticles: Particle[];
  revParticles: Particle[];
  messageCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEAD_RADIUS = 44;
const WORKER_RADIUS = 28;
const BG = '#060614';
const REST_LEN = 200;
const K_REP = 8000;
const K_SPR = 0.018;
const K_DAMP = 0.82;
const K_GRAVITY = 0.003;

const MEMBER_COLORS: Record<string, string> = {
  blue: '#60a5fa',
  green: '#4ade80',
  yellow: '#fbbf24',
  red: '#f87171',
  purple: '#c084fc',
  cyan: '#22d3ee',
  orange: '#fb923c',
  pink: '#f472b6',
  teal: '#2dd4bf',
  indigo: '#818cf8',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function nodeColor(colorStr: string | undefined, isLead: boolean): string {
  if (isLead) return '#00d4ff';
  return colorStr ? (MEMBER_COLORS[colorStr] ?? '#c084fc') : '#c084fc';
}

function lerpXY(
  fromNode: OrbNode,
  toNode: OrbNode,
  t: number,
): [number, number] {
  return [
    fromNode.x + (toNode.x - fromNode.x) * t,
    fromNode.y + (toNode.y - fromNode.y) * t,
  ];
}

// ─── Graph builder ────────────────────────────────────────────────────────────

function buildGraph(
  team: TeamSnapshot,
  w: number,
  h: number,
  prevNodes?: OrbNode[],
): { nodes: OrbNode[]; edges: OrbEdge[] } {
  const { members, leadAgentId } = team.config;
  const cx = w / 2;
  const cy = h / 2;
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  const workers = members.filter((m) => m.agentId !== leadAgentId);

  const nodes: OrbNode[] = members.map((m) => {
    const isLead = m.agentId === leadAgentId;
    const prev = prevNodes?.find((n) => n.id === m.agentId);

    const inbox = team.inboxes[m.name] ?? [];
    const recent = inbox.filter(
      (msg) => now - new Date(msg.timestamp).getTime() < fiveMin,
    ).length;
    const activityLevel = Math.min(1, recent / 8);

    // Initial position (overridden by prev if available)
    let initX = cx;
    let initY = cy;
    if (!isLead) {
      const idx = workers.findIndex((w2) => w2.agentId === m.agentId);
      const angle = (idx / Math.max(workers.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const r = Math.min(w, h) * 0.28;
      initX = cx + Math.cos(angle) * r;
      initY = cy + Math.sin(angle) * r;
    }

    return {
      id: m.agentId,
      label: m.name,
      role: isLead ? 'lead' : 'worker',
      color: nodeColor(m.color, isLead),
      x: prev?.x ?? initX,
      y: prev?.y ?? initY,
      vx: prev?.vx ?? 0,
      vy: prev?.vy ?? 0,
      radius: isLead ? LEAD_RADIUS : WORKER_RADIUS,
      activityLevel,
    };
  });

  // Edges: lead ↔ each worker (star topology)
  const leadNode = nodes.find((n) => n.role === 'lead');
  const workerNodes = nodes.filter((n) => n.role === 'worker');
  const edges: OrbEdge[] = [];

  if (leadNode) {
    for (const worker of workerNodes) {
      const inbox = team.inboxes[worker.label] ?? [];
      edges.push({
        fromId: leadNode.id,
        toId: worker.id,
        fwdParticles: [],
        revParticles: [],
        messageCount: inbox.length,
      });
    }
    // Cross-links for small teams (adds the spiderweb density)
    if (members.length <= 5 && workerNodes.length >= 2) {
      for (let i = 0; i < workerNodes.length; i++) {
        for (let j = i + 1; j < workerNodes.length; j++) {
          edges.push({
            fromId: workerNodes[i].id,
            toId: workerNodes[j].id,
            fwdParticles: [],
            revParticles: [],
            messageCount: 2,
          });
        }
      }
    }
  }

  return { nodes, edges };
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────

function drawEdge(
  ctx: CanvasRenderingContext2D,
  a: OrbNode,
  b: OrbNode,
  highlighted: boolean,
) {
  const alpha = highlighted ? 0.75 : 0.28;
  const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  grad.addColorStop(0, toRgba(a.color, alpha));
  grad.addColorStop(1, toRgba(b.color, alpha));

  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth = highlighted ? 2 : 1;
  ctx.shadowColor = highlighted ? a.color : '#3344aa';
  ctx.shadowBlur = highlighted ? 12 : 4;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawOrb(ctx: CanvasRenderingContext2D, node: OrbNode, hovered: boolean) {
  const { x, y, radius, color, activityLevel } = node;
  const boost = hovered ? 1.6 : 1.0;
  const pulse = radius * (1 + activityLevel * 0.12);

  // Outer glow
  const outerR = pulse * 3.2;
  const outerGrad = ctx.createRadialGradient(x, y, 0, x, y, outerR);
  outerGrad.addColorStop(0, toRgba(color, 0.22 * boost));
  outerGrad.addColorStop(0.4, toRgba(color, 0.08 * boost));
  outerGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(x, y, outerR, 0, Math.PI * 2);
  ctx.fill();

  // Mid halo
  const midGrad = ctx.createRadialGradient(x, y, 0, x, y, pulse * 1.6);
  midGrad.addColorStop(0, toRgba(color, 0.45 * boost));
  midGrad.addColorStop(0.5, toRgba(color, 0.18 * boost));
  midGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = midGrad;
  ctx.beginPath();
  ctx.arc(x, y, pulse * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Core orb with specular highlight
  const coreGrad = ctx.createRadialGradient(
    x - pulse * 0.25, y - pulse * 0.25, 0,
    x, y, pulse,
  );
  coreGrad.addColorStop(0, '#ffffff');
  coreGrad.addColorStop(0.25, color);
  coreGrad.addColorStop(0.65, toRgba(color, 0.85));
  coreGrad.addColorStop(1, toRgba(color, 0.3));

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 24 * boost;
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(x, y, pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, node: OrbNode, hovered: boolean) {
  const { x, y, radius, color, label, role } = node;
  ctx.save();
  ctx.font = role === 'lead' ? 'bold 12px monospace' : '11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 8;
  ctx.fillStyle = hovered ? '#ffffff' : toRgba(color, 0.9);
  ctx.fillText(label, x, y + radius * 1.7);
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(30,40,80,0.5)';
  ctx.lineWidth = 0.5;
  const step = 60;
  for (let gx = 0; gx < w; gx += step) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
  }
  for (let gy = 0; gy < h; gy += step) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
  }
  ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface OrbGraphViewProps {
  team: TeamSnapshot | null;
}

export function OrbGraphView({ team }: OrbGraphViewProps) {
  const selectTeammate = useTeamFlowStore((s) => s.selectTeammate);
  const teammateHealth = useClaudeTeamsStore((s) => s.teammateHealth);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<OrbNode[]>([]);
  const edgesRef = useRef<OrbEdge[]>([]);
  const hoveredIdRef = useRef<string | null>(null);
  const isSettledRef = useRef(false);
  const frameRef = useRef<number>(0);
  const teamKeyRef = useRef<string>('');

  // ── Rebuild graph when team / health changes ──────────────────────────────
  useEffect(() => {
    if (!team || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    const newKey = `${team.config.name}:${team.config.members.map((m) => m.agentId).join(',')}`;
    const membershipChanged = newKey !== teamKeyRef.current;
    teamKeyRef.current = newKey;

    const prev = membershipChanged ? undefined : nodesRef.current;
    const { nodes, edges } = buildGraph(team, w || 800, h || 600, prev);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    if (membershipChanged) isSettledRef.current = false;
  }, [team, teammateHealth]);

  // ── Canvas resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const resizer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        isSettledRef.current = false;

        // Recenter the graph on resize
        if (nodesRef.current.length > 0) {
          const cx = width / 2;
          const cy = height / 2;
          const lead = nodesRef.current.find((n) => n.role === 'lead');
          if (lead) {
            const dx = cx - lead.x;
            const dy = cy - lead.y;
            for (const n of nodesRef.current) {
              n.x += dx * 0.5;
              n.y += dy * 0.5;
            }
          }
        }
      }
    });

    resizer.observe(container);
    return () => resizer.disconnect();
  }, []);

  // ── Animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      // ── Force simulation ────────────────────────────────────────────────
      if (!isSettledRef.current && nodes.length > 1) {
        let maxV = 0;

        for (let i = 0; i < nodes.length; i++) {
          const ni = nodes[i];
          let fx = 0;
          let fy = 0;

          // Repulsion
          for (let j = 0; j < nodes.length; j++) {
            if (i === j) continue;
            const dx = ni.x - nodes[j].x;
            const dy = ni.y - nodes[j].y;
            const d2 = Math.max(dx * dx + dy * dy, 400);
            const d = Math.sqrt(d2);
            const f = K_REP / d2;
            fx += (dx / d) * f;
            fy += (dy / d) * f;
          }

          // Spring attraction along edges
          for (const edge of edges) {
            let otherId: string | null = null;
            if (edge.fromId === ni.id) otherId = edge.toId;
            else if (edge.toId === ni.id) otherId = edge.fromId;
            if (!otherId) continue;
            const other = nodes.find((n) => n.id === otherId);
            if (!other) continue;
            const dx = other.x - ni.x;
            const dy = other.y - ni.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const stretch = d - REST_LEN;
            fx += (dx / d) * stretch * K_SPR;
            fy += (dy / d) * stretch * K_SPR;
          }

          // Gravity toward center
          fx += (w / 2 - ni.x) * K_GRAVITY;
          fy += (h / 2 - ni.y) * K_GRAVITY;

          ni.vx = (ni.vx + fx) * K_DAMP;
          ni.vy = (ni.vy + fy) * K_DAMP;

          // Boundary clamp
          const margin = ni.radius * 2.5;
          ni.x = Math.max(margin, Math.min(w - margin, ni.x + ni.vx));
          ni.y = Math.max(margin, Math.min(h - margin, ni.y + ni.vy));

          const v = Math.sqrt(ni.vx * ni.vx + ni.vy * ni.vy);
          if (v > maxV) maxV = v;
        }

        if (maxV < 0.4) isSettledRef.current = true;
      }

      // ── Particle updates ────────────────────────────────────────────────
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      for (const edge of edges) {
        const spawnRate = Math.min(0.09, 0.012 + edge.messageCount * 0.003);

        if (Math.random() < spawnRate) {
          edge.fwdParticles.push({ t: 0, speed: 0.003 + Math.random() * 0.004, alpha: 1 });
        }
        if (Math.random() < spawnRate * 0.5) {
          edge.revParticles.push({ t: 0, speed: 0.003 + Math.random() * 0.004, alpha: 1 });
        }

        for (const p of edge.fwdParticles) {
          p.t += p.speed;
          p.alpha = p.t > 0.8 ? (1 - p.t) * 5 : 1;
        }
        for (const p of edge.revParticles) {
          p.t += p.speed;
          p.alpha = p.t > 0.8 ? (1 - p.t) * 5 : 1;
        }

        edge.fwdParticles = edge.fwdParticles.filter((p) => p.t < 1);
        edge.revParticles = edge.revParticles.filter((p) => p.t < 1);

        // Cap count to keep GPU happy
        if (edge.fwdParticles.length > 12) edge.fwdParticles.splice(0, edge.fwdParticles.length - 12);
        if (edge.revParticles.length > 6) edge.revParticles.splice(0, edge.revParticles.length - 6);
      }

      // ── Draw ────────────────────────────────────────────────────────────
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);
      drawGrid(ctx, w, h);

      if (nodes.length === 0) {
        ctx.fillStyle = 'rgba(100,120,180,0.5)';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No team data', w / 2, h / 2);
        frameRef.current = requestAnimationFrame(loop);
        return;
      }

      const hoveredId = hoveredIdRef.current;

      // Edges + particles (drawn under nodes)
      for (const edge of edges) {
        const fromNode = nodeMap.get(edge.fromId);
        const toNode = nodeMap.get(edge.toId);
        if (!fromNode || !toNode) continue;

        const highlighted = hoveredId === edge.fromId || hoveredId === edge.toId;
        drawEdge(ctx, fromNode, toNode, highlighted);

        // Forward particles
        for (const p of edge.fwdParticles) {
          const [px, py] = lerpXY(fromNode, toNode, p.t);
          drawParticle(ctx, px, py, toNode.color, p.alpha);
        }
        // Reverse particles
        for (const p of edge.revParticles) {
          const [px, py] = lerpXY(toNode, fromNode, p.t);
          drawParticle(ctx, px, py, fromNode.color, p.alpha);
        }
      }

      // Nodes on top
      for (const node of nodes) {
        drawOrb(ctx, node, hoveredId === node.id);
        drawLabel(ctx, node, hoveredId === node.id);
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, []); // reads from refs only — stable

  // ── Mouse interaction ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const hitTest = (mx: number, my: number): OrbNode | null => {
      for (const node of nodesRef.current) {
        const dx = mx - node.x;
        const dy = my - node.y;
        if (dx * dx + dy * dy <= (node.radius + 10) ** 2) return node;
      }
      return null;
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const node = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      hoveredIdRef.current = node?.id ?? null;
      canvas.style.cursor = node ? 'pointer' : 'default';
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const node = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (node) selectTeammate(node.label);
    };

    const onLeave = () => {
      hoveredIdRef.current = null;
      canvas.style.cursor = 'default';
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mouseleave', onLeave);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [selectTeammate]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="block" />
      {!team && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm text-muted-foreground font-mono">No team selected</span>
        </div>
      )}
    </div>
  );
}

export default OrbGraphView;
