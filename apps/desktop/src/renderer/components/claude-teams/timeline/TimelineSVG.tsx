/**
 * TimelineSVG -- "Vertical Spine" timeline renderer
 *
 * One of 4 bake-off renderers. Draws a central vertical spine with
 * tasks alternating left/right as branching cards. The spine path
 * animates with a draw-on effect and cards stagger in from the sides.
 *
 * Dramatic themes (kuroryuu, matrix, retro, neo, grunge) get a
 * glowing spine trail, spring-overshoot card entrances, and pulsing
 * marker circles.
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { TimelineRendererProps } from './timeline-types';
import { TimelineTaskCard } from './TimelineTaskCard';
import {
  resolveNodeColor,
  computeLayout,
  isDramaticTheme,
  getThemeColors,
  mapToFlowTheme,
  formatDuration,
} from './timeline-utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIEW_BOX_WIDTH = 800;
const PADDING = 60;
const BRANCH_LENGTH = 40;
const CARD_WIDTH = 240;
const COLLAPSED_CARD_HEIGHT = 72;
const EXPANDED_CARD_HEIGHT = 220;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimelineSVG({
  data,
  colorMode,
  theme,
  onNodeClick,
  expandedNodeId,
  className,
}: TimelineRendererProps) {
  // ── Pre-computed values ──────────────────────────────────────────────
  const colors = useMemo(
    () =>
      data.nodes.map((node, i) =>
        resolveNodeColor(node, colorMode, i, data.nodes.length, data.agents)
      ),
    [data, colorMode]
  );

  const layout = useMemo(
    () => computeLayout(data.nodes.length),
    [data.nodes.length]
  );

  const dramatic = isDramaticTheme(theme);
  const flowTheme = mapToFlowTheme(theme);
  const themeColors = getThemeColors(flowTheme);
  const spineColor = themeColors.hub;

  // ── Layout geometry ─────────────────────────────────────────────────
  const spineX = VIEW_BOX_WIDTH / 2;
  const totalHeight =
    data.nodes.length > 0
      ? PADDING * 2 + (data.nodes.length - 1) * layout.spacing
      : 300;

  // ── Animation timing ────────────────────────────────────────────────
  const spineDuration = dramatic ? 1.5 : 0.8;
  const cardStaggerDelay = dramatic ? 0.15 : 0.1;

  const cardTransition = dramatic
    ? { type: 'spring' as const, stiffness: 200, damping: 15 }
    : { type: 'tween' as const, duration: 0.35, ease: 'easeOut' as const };

  // ── Empty state ─────────────────────────────────────────────────────
  if (data.nodes.length === 0) {
    return (
      <div className={`absolute inset-0 overflow-auto ${className ?? ''}`}>
        <svg
          width="100%"
          height="300"
          viewBox={`0 0 ${VIEW_BOX_WIDTH} 300`}
          preserveAspectRatio="xMidYMid meet"
        >
          <text
            x={VIEW_BOX_WIDTH / 2}
            y={150}
            textAnchor="middle"
            fill="rgba(200, 200, 200, 0.4)"
            fontSize={16}
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            No tasks to display
          </text>
        </svg>
      </div>
    );
  }

  // ── Spine path data ────────────────────────────────────────────────
  const spineStartY = PADDING;
  const spineEndY =
    data.nodes.length === 1 ? PADDING : PADDING + (data.nodes.length - 1) * layout.spacing;
  const spinePath = `M ${spineX} ${spineStartY} L ${spineX} ${spineEndY}`;

  // ── SVG filter IDs (scoped to avoid collisions) ────────────────────
  const glowFilterId = 'spine-glow-filter';

  return (
    <div className={`absolute inset-0 overflow-auto ${className ?? ''}`}>
      <svg
        width="100%"
        height={totalHeight}
        viewBox={`0 0 ${VIEW_BOX_WIDTH} ${totalHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', minHeight: totalHeight }}
      >
        {/* ── Filters ──────────────────────────────────────────────── */}
        {dramatic && (
          <defs>
            <filter id={glowFilterId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        )}

        {/* ── Glow spine (dramatic themes only) ────────────────────── */}
        {dramatic && (
          <motion.path
            d={spinePath}
            stroke={spineColor}
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
            opacity={0.25}
            filter={`url(#${glowFilterId})`}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: spineDuration, ease: 'easeInOut' }}
          />
        )}

        {/* ── Main spine ───────────────────────────────────────────── */}
        <motion.path
          d={spinePath}
          stroke={spineColor}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: spineDuration, ease: 'easeInOut' }}
        />

        {/* ── Task groups (branch + marker + card) ─────────────────── */}
        {data.nodes.map((node, i) => {
          const y = PADDING + i * layout.spacing;
          const isLeft = i % 2 === 0;
          const color = colors[i];
          const isExpanded = expandedNodeId === node.id;
          const cardHeight = isExpanded ? EXPANDED_CARD_HEIGHT : COLLAPSED_CARD_HEIGHT;

          // Branch endpoints
          const branchStartX = spineX;
          const branchEndX = isLeft
            ? spineX - BRANCH_LENGTH
            : spineX + BRANCH_LENGTH;

          // Card position
          const cardX = isLeft
            ? spineX - BRANCH_LENGTH - CARD_WIDTH
            : spineX + BRANCH_LENGTH;

          const cardY = y - cardHeight / 2;

          // Card entrance variants
          const cardInitialX = isLeft ? -30 : 30;

          return (
            <motion.g
              key={node.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: cardStaggerDelay * i, duration: 0.3 }}
            >
              {/* ── Horizontal branch line ──────────────────────────── */}
              <motion.line
                x1={branchStartX}
                y1={y}
                x2={branchEndX}
                y2={y}
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                opacity={0.6}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{
                  delay: cardStaggerDelay * i + 0.1,
                  duration: 0.25,
                  ease: 'easeOut',
                }}
              />

              {/* ── Marker circle on spine ─────────────────────────── */}
              <motion.circle
                cx={spineX}
                cy={y}
                r={layout.nodeSize / 2}
                fill={color}
                stroke="var(--background, #111)"
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
                whileHover={{ scale: 1.5, transition: { duration: 0.15 } }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  delay: 0.05 * i,
                  type: 'spring',
                  stiffness: 300,
                }}
              >
                {/* Pulse animation for dramatic themes */}
                {dramatic && (
                  <animate
                    attributeName="r"
                    values={`${layout.nodeSize / 2};${layout.nodeSize / 2 + 2};${layout.nodeSize / 2}`}
                    dur="2.5s"
                    repeatCount="indefinite"
                    begin={`${0.05 * i + spineDuration}s`}
                  />
                )}
              </motion.circle>

              {/* ── Card via foreignObject ──────────────────────────── */}
              <motion.g
                initial={{ opacity: 0, x: cardInitialX }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: cardStaggerDelay * i + 0.15,
                  ...cardTransition,
                }}
              >
                <foreignObject
                  x={cardX}
                  y={cardY}
                  width={isExpanded ? 320 : CARD_WIDTH}
                  height={cardHeight}
                  style={{ overflow: 'visible' }}
                >
                  <div title={`#${node.taskId} ${node.subject}\n${node.owner ?? 'Unassigned'} | ${formatDuration(node.duration)}\n${node.description?.slice(0, 100) ?? ''}`}>
                    <TimelineTaskCard
                      node={node}
                      color={color}
                      isExpanded={isExpanded}
                      onClick={() => onNodeClick?.(node.id)}
                    />
                  </div>
                </foreignObject>
              </motion.g>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
