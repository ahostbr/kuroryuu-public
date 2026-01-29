/**
 * MemoryCard - Display a single memory node from Graphiti
 */

import { useState } from 'react';
import { Lightbulb, Tag, Clock, FileText, User, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

export interface MemoryNode {
  id: string;
  type: 'fact' | 'event' | 'entity' | 'preference';
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface MemoryCardProps {
  memory: MemoryNode;
  score?: number;
  onClick?: () => void;
}

const typeConfig = {
  fact: {
    icon: Lightbulb,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    label: 'Fact',
  },
  event: {
    icon: Clock,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    label: 'Event',
  },
  entity: {
    icon: User,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    label: 'Entity',
  },
  preference: {
    icon: Sparkles,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    label: 'Preference',
  },
};

export function MemoryCard({ memory, score, onClick }: MemoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = typeConfig[memory.type] || typeConfig.fact;
  const Icon = config.icon;

  // Check if content is long enough to need expansion (roughly 3 lines = ~200 chars)
  const isLongContent = memory.content.length > 200;

  const formattedDate = new Date(memory.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleClick = () => {
    if (isLongContent) {
      setIsExpanded(!isExpanded);
    }
    onClick?.();
  };

  return (
    <div
      onClick={handleClick}
      className={`p-4 rounded-lg border border-border bg-card/50 hover:bg-card transition-all duration-200 ${
        isLongContent ? 'cursor-pointer' : onClick ? 'cursor-pointer' : ''
      } ${isExpanded ? 'ring-1 ring-purple-500/30' : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded ${config.bgColor}`}>
            <Icon className={`w-3.5 h-3.5 ${config.color}`} />
          </div>
          <span className={`text-xs font-medium ${config.color}`}>
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {score !== undefined && (
            <span className="text-xs text-muted-foreground">
              {Math.round(score * 100)}% match
            </span>
          )}
          {isLongContent && (
            <button
              className="p-1 hover:bg-secondary rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <p className={`text-sm text-foreground transition-all duration-200 ${
        isExpanded ? '' : 'line-clamp-3'
      }`}>
        {memory.content}
      </p>

      {/* Expand hint for collapsed long content */}
      {isLongContent && !isExpanded && (
        <p className="text-xs text-purple-400 mt-1 opacity-70">
          Click to expand...
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span>{formattedDate}</span>
        {Array.isArray(memory.metadata?.tags) && memory.metadata.tags.length > 0 && (
          <>
            <span className="mx-1">|</span>
            <Tag className="w-3 h-3" />
            <span>{(memory.metadata.tags as string[]).slice(0, 2).join(', ')}</span>
          </>
        )}
      </div>
    </div>
  );
}
