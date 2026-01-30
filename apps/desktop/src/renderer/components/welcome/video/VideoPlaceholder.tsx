import React, { useState, useCallback, useEffect } from 'react';
import { Video, Play, Upload, X, Loader2 } from 'lucide-react';
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
  const [isCopying, setIsCopying] = useState(false);
  const [projectRoot, setProjectRoot] = useState('');
  const { videoPaths, setVideoPath, clearVideoPath } = useWelcomeStore();
  const currentVideoPath = videoPaths[videoId];

  // Get project root on mount for resolving relative paths
  useEffect(() => {
    window.electronAPI?.app?.getProjectRoot?.().then(setProjectRoot).catch(() => {});
  }, []);

  // Resolve relative path to absolute file:// URL
  const resolvedVideoSrc = currentVideoPath
    ? currentVideoPath.startsWith('file:/') || currentVideoPath.startsWith('blob:') || currentVideoPath.startsWith('local-video:')
      ? currentVideoPath
      : `file:///${projectRoot.replace(/\\/g, '/')}/${currentVideoPath}`
    : '';

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

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    console.log('[VideoPlaceholder] Drop event, files:', files.length);
    if (files.length > 0) {
      const file = files[0];
      console.log('[VideoPlaceholder] File type:', file.type, 'path:', (file as any).path);
      // Check if it's a video file
      if (file.type.startsWith('video/')) {
        const rawPath = (file as any).path;
        console.log('[VideoPlaceholder] rawPath:', rawPath);
        console.log('[VideoPlaceholder] electronAPI.video:', window.electronAPI?.video);
        console.log('[VideoPlaceholder] copyToAssets fn:', window.electronAPI?.video?.copyToAssets);
        if (rawPath && window.electronAPI?.video?.copyToAssets) {
          // Copy to assets/videos/ for git tracking
          setIsCopying(true);
          console.log('[VideoPlaceholder] Calling IPC copyToAssets...');
          try {
            const result = await window.electronAPI.video.copyToAssets(rawPath, videoId);
            console.log('[VideoPlaceholder] IPC result:', result);
            if (result.ok && result.relativePath) {
              // Store relative path (e.g., "assets/videos/hero.mp4")
              setVideoPath(videoId, result.relativePath);
            } else {
              console.error('[Video] Copy failed:', result.error);
            }
          } catch (err) {
            console.error('[Video] Copy error:', err);
          } finally {
            setIsCopying(false);
          }
        } else {
          // Fallback to blob URL for non-Electron (won't persist)
          console.log('[VideoPlaceholder] FALLBACK to blob URL (no IPC available)');
          setVideoPath(videoId, URL.createObjectURL(file));
        }
      }
    }
  }, [videoId, setVideoPath]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    clearVideoPath(videoId);
  }, [videoId, clearVideoPath]);

  // If video is set, show video player
  if (currentVideoPath && resolvedVideoSrc) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <div className="relative w-full aspect-video rounded-xl overflow-hidden">
          <video
            src={resolvedVideoSrc}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex items-center justify-center gap-4">
          <span className="text-xs text-muted-foreground">{currentVideoPath}</span>
          <button
            onClick={handleClear}
            className="px-3 py-1 rounded-lg bg-background/80 hover:bg-destructive/20 border border-border text-muted-foreground hover:text-destructive text-xs transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Remove
          </button>
        </div>
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
          isDragging ? "animate-ping" : isCopying ? "" : "animate-pulse"
        )} />
        <div className="relative w-16 h-16 rounded-full bg-background/80 border border-border flex items-center justify-center">
          {isCopying ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : isDragging ? (
            <Upload className="w-8 h-8 text-primary" />
          ) : (
            <Video className="w-8 h-8 text-primary" />
          )}
        </div>
      </div>

      {/* Message */}
      <div className="text-center z-10">
        <p className="text-lg font-medium text-foreground">
          {isCopying ? 'Copying video...' : isDragging ? 'Drop video here' : message}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {isCopying ? 'Saving to assets/videos/' : isDragging ? 'Release to add video' : 'Drag & drop a video file here'}
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
