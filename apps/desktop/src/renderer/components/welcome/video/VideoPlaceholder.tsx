import React, { useState, useCallback } from 'react';
import { Video, Play, Upload, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useWelcomeStore } from '../../../stores/welcome-store';

interface VideoPlaceholderProps {
  message?: string;
  showPlayButton?: boolean;
  onPlayClick?: () => void;
  className?: string;
  videoId?: string; // Unique ID for storing video path
}

export function VideoPlaceholder({
  message = 'Video coming soon',
  showPlayButton = false,
  onPlayClick,
  className,
  videoId = 'default',
}: VideoPlaceholderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { videoPaths, setVideoPath, clearVideoPath } = useWelcomeStore();
  const currentVideoPath = videoPaths[videoId];

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // Check if it's a video file
      if (file.type.startsWith('video/')) {
        // Use the file path (Electron provides this)
        const filePath = (file as any).path || URL.createObjectURL(file);
        setVideoPath(videoId, filePath);
      }
    }
  }, [videoId, setVideoPath]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    clearVideoPath(videoId);
  }, [videoId, clearVideoPath]);

  // If video is set, show video player
  if (currentVideoPath) {
    return (
      <div className={cn('relative w-full aspect-video rounded-xl overflow-hidden', className)}>
        <video
          src={currentVideoPath}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        <button
          onClick={handleClear}
          className="absolute top-2 right-2 p-2 rounded-lg bg-background/80 hover:bg-background border border-border text-foreground transition-colors"
          aria-label="Remove video"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative w-full aspect-video rounded-xl overflow-hidden',
        'bg-gradient-to-br from-secondary via-secondary/80 to-secondary/50',
        'border-2 border-dashed',
        isDragging ? 'border-primary bg-primary/10' : 'border-border',
        'flex flex-col items-center justify-center gap-4',
        'transition-colors cursor-pointer',
        className
      )}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
        <div className={cn(
          "absolute -inset-4 rounded-full bg-primary/10",
          isDragging ? "animate-ping" : "animate-pulse"
        )} />
        <div className="relative w-16 h-16 rounded-full bg-background/80 border border-border flex items-center justify-center">
          {isDragging ? (
            <Upload className="w-8 h-8 text-primary" />
          ) : (
            <Video className="w-8 h-8 text-primary" />
          )}
        </div>
      </div>

      {/* Message */}
      <div className="text-center z-10">
        <p className="text-lg font-medium text-foreground">
          {isDragging ? 'Drop video here' : message}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {isDragging ? 'Release to add video' : 'Drag & drop a video file here'}
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
