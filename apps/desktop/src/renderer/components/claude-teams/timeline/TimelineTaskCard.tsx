/**
 * TimelineTaskCard — Shared inline-expandable task card
 *
 * Used by all 4 timeline renderers. Supports progressive disclosure:
 *   Collapsed: task ID, subject, status dot, owner, elapsed time
 *   Expanded:  + full description, blocks/blockedBy, model, timestamps
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Clock, AlertCircle, Pause, User, Link2, ArrowRight } from 'lucide-react';
import type { TimelineNode } from './timeline-types';
import { formatDuration, formatTime } from './timeline-utils';

interface TimelineTaskCardProps {
  node: TimelineNode;
  color: string;
  isExpanded: boolean;
  onClick?: () => void;
  className?: string;
}

const STATUS_ICONS: Record<string, React.ElementType> = {
  completed: CheckCircle,
  in_progress: Clock,
  pending: Pause,
  deleted: AlertCircle,
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  pending: 'Pending',
  deleted: 'Deleted',
};

function getModelBadge(model: string): string {
  if (model.includes('opus')) return 'OPUS';
  if (model.includes('sonnet')) return 'SONNET';
  if (model.includes('haiku')) return 'HAIKU';
  return model.split('-').pop()?.toUpperCase() ?? 'MODEL';
}

export function TimelineTaskCard({
  node,
  color,
  isExpanded,
  onClick,
  className = '',
}: TimelineTaskCardProps) {
  const StatusIcon = STATUS_ICONS[node.status] ?? Pause;

  return (
    <motion.div
      layout
      onClick={onClick}
      className={`
        rounded-lg border backdrop-blur-sm
        cursor-pointer select-none
        transition-colors duration-150
        hover:border-opacity-80
        ${className}
      `}
      style={{
        borderColor: color,
        background: 'var(--card, rgba(30, 30, 40, 0.95))',
        color: 'var(--card-foreground, #e5e5e5)',
        maxWidth: isExpanded ? 320 : 240,
        minWidth: 160,
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Collapsed view — always visible */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Task ID badge */}
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: color, color: '#000' }}
        >
          #{node.taskId}
        </span>

        {/* Subject */}
        <span className="text-xs font-medium truncate flex-1">
          {node.subject}
        </span>

        {/* Status dot */}
        <StatusIcon size={14} style={{ color, flexShrink: 0 }} />
      </div>

      {/* Owner + duration (collapsed) */}
      <div className="flex items-center gap-2 px-3 pb-2 text-[11px] text-muted-foreground">
        {node.owner && (
          <span className="flex items-center gap-1">
            <User size={10} />
            {node.owner}
          </span>
        )}
        <span className="ml-auto">{formatDuration(node.duration)}</span>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div
              className="border-t px-3 py-2 space-y-1.5"
              style={{ borderColor: `${color}33` }}
            >
              {/* Status + label */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-medium" style={{ color }}>
                  {STATUS_LABELS[node.status] ?? node.status}
                </span>
              </div>

              {/* Agent model */}
              {node.agent && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Model:</span>
                  <span
                    className="text-[10px] font-bold px-1 py-0.5 rounded"
                    style={{
                      background: `${color}22`,
                      color,
                      border: `1px solid ${color}44`,
                    }}
                  >
                    {getModelBadge(node.agent.model)}
                  </span>
                </div>
              )}

              {/* Time */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Created:</span>
                <span>{formatTime(node.timestamp)}</span>
              </div>

              {/* Description */}
              {node.description && (
                <div className="text-xs text-muted-foreground mt-1">
                  <div className="line-clamp-3">{node.description}</div>
                </div>
              )}

              {/* Dependencies */}
              {node.blocks.length > 0 && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Link2 size={10} />
                  <span>Blocks:</span>
                  {node.blocks.map((id) => (
                    <span key={id} className="font-mono">
                      #{id}
                    </span>
                  ))}
                </div>
              )}
              {node.blockedBy.length > 0 && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ArrowRight size={10} />
                  <span>Blocked by:</span>
                  {node.blockedBy.map((id) => (
                    <span key={id} className="font-mono">
                      #{id}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
