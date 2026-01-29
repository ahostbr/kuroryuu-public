import React from 'react';
import { Video, Play } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface VideoPlaceholderProps {
  message?: string;
  showPlayButton?: boolean;
  onPlayClick?: () => void;
  className?: string;
}

export function VideoPlaceholder({
  message = 'Video coming soon',
  showPlayButton = false,
  onPlayClick,
  className,
}: VideoPlaceholderProps) {
  return (
    <div
      className={cn(
        'relative w-full aspect-video rounded-xl overflow-hidden',
        'bg-gradient-to-br from-secondary via-secondary/80 to-secondary/50',
        'border border-border',
        'flex flex-col items-center justify-center gap-4',
        className
      )}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Icon */}
      <div className="relative">
        <div className="absolute -inset-4 rounded-full bg-primary/10 animate-pulse" />
        <div className="relative w-16 h-16 rounded-full bg-background/80 border border-border flex items-center justify-center">
          <Video className="w-8 h-8 text-primary" />
        </div>
      </div>

      {/* Message */}
      <div className="text-center z-10">
        <p className="text-lg font-medium text-foreground">{message}</p>
        <p className="text-sm text-muted-foreground mt-1">
          Drop your video file to see it here
        </p>
      </div>

      {/* Optional play button */}
      {showPlayButton && onPlayClick && (
        <button
          onClick={onPlayClick}
          className={cn(
            'mt-2 flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'font-medium text-sm transition-colors'
          )}
        >
          <Play className="w-4 h-4" />
          Play Video
        </button>
      )}
    </div>
  );
}
