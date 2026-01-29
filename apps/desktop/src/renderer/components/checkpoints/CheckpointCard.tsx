/**
 * CheckpointCard - Individual checkpoint card component
 *
 * Displays checkpoint info with golden glow effects (dragon's hoard aesthetic)
 */
import { Clock, Database } from 'lucide-react';
import { type Checkpoint, extractTimeFromId, formatBytes } from '../../stores/checkpoints-store';

interface CheckpointCardProps {
  checkpoint: Checkpoint;
  isSelected: boolean;
  onClick: () => void;
}

export function CheckpointCard({ checkpoint, isSelected, onClick }: CheckpointCardProps) {
  const time = checkpoint.saved_at
    ? new Date(checkpoint.saved_at).toLocaleTimeString('en-US', { hour12: false })
    : extractTimeFromId(checkpoint.id);

  return (
    <div
      onClick={onClick}
      className={`
        group p-4 rounded-xl border cursor-pointer
        transition-all duration-300
        ${isSelected
          ? 'bg-secondary border-primary/50 ring-1 ring-primary/30 shadow-[0_0_25px_rgba(201,162,39,0.15)]'
          : 'bg-card border-border hover:border-primary/40 hover:bg-secondary/50 hover:shadow-[0_0_20px_rgba(201,162,39,0.1)]'
        }
      `}
    >
      {/* Name */}
      <h3 className="text-sm font-medium text-foreground mb-1.5 line-clamp-2">
        {checkpoint.name || 'Unnamed Checkpoint'}
      </h3>

      {/* Summary */}
      {checkpoint.summary && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
          {checkpoint.summary}
        </p>
      )}

      {/* Tags */}
      {Array.isArray(checkpoint.tags) && checkpoint.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {checkpoint.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="
                px-2 py-0.5 rounded-full text-[10px] font-medium
                bg-primary/10 text-primary border border-primary/20
                transition-all duration-200
                group-hover:bg-primary/15 group-hover:border-primary/30
                hover:bg-primary/20 hover:border-primary/40
                hover:shadow-[0_0_12px_rgba(201,162,39,0.3)]
              "
            >
              {tag}
            </span>
          ))}
          {checkpoint.tags.length > 4 && (
            <span className="px-2 py-0.5 text-[10px] text-muted-foreground">
              +{checkpoint.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Database className="w-3 h-3" />
          {formatBytes(checkpoint.size_bytes || 0)}
        </span>
        {time && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {time}
          </span>
        )}
      </div>

      {/* ID */}
      <div className="mt-2 text-[10px] text-muted-foreground/60 font-mono truncate">
        {checkpoint.id}
      </div>
    </div>
  );
}
