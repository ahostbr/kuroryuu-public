import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Video, Play, Upload, X, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useWelcomeStore } from '../../../stores/welcome-store';
import { fileLogger } from '../../../utils/file-logger';

interface VideoPlaceholderProps {
  message?: string;
  showPlayButton?: boolean;
  onPlayClick?: () => void;
  className?: string;
  videoId?: string; // Unique ID for storing video path
  onVideoDrop?: (blobUrl: string) => void; // Callback when video is dropped
}

export function VideoPlaceholder({
  message = 'Video coming soon',
  showPlayButton = false,
  onPlayClick,
  className,
  videoId = 'default',
  onVideoDrop,
}: VideoPlaceholderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const { videoPaths, setVideoPath, clearVideoPath } = useWelcomeStore();
  const storedPath = videoPaths[videoId];
  const didMountCleanup = useRef(false);

  const [sessionBlobUrl, setSessionBlobUrl] = useState<string | null>(null);

  // On mount: if we have a saved path, try to load from file
  useEffect(() => {
    if (didMountCleanup.current) return;
    didMountCleanup.current = true;

    const initVideo = async () => {
      // If we have a saved relative path (not blob), try to load from file
      if (storedPath && !storedPath.startsWith('blob:') && window.electronAPI?.video?.loadFromAssets) {
        fileLogger.log('VideoPlaceholder', `Loading saved video from assets: ${storedPath}`);
        try {
          const result = await window.electronAPI.video.loadFromAssets(videoId);
          if (result.ok && result.base64 && result.mimeType) {
            fileLogger.log('VideoPlaceholder', `Loaded video (${result.base64.length} chars base64)`);
            // Convert base64 to blob URL
            const byteCharacters = atob(result.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: result.mimeType });
            const blobUrl = URL.createObjectURL(blob);
            fileLogger.log('VideoPlaceholder', `Created blob URL: ${blobUrl}`);
            setSessionBlobUrl(blobUrl);
          } else {
            fileLogger.log('VideoPlaceholder', `Video file not found, clearing stored path`);
            clearVideoPath(videoId);
          }
        } catch (err) {
          fileLogger.error('VideoPlaceholder', `Failed to load: ${err}`);
          clearVideoPath(videoId);
        }
      } else if (storedPath?.startsWith('blob:')) {
        // Stale blob URL from previous session - clear it
        fileLogger.log('VideoPlaceholder', `Clearing stale blob URL`);
        clearVideoPath(videoId);
      }
    };

    initVideo();
  }, [videoId, storedPath, clearVideoPath]);

  // Use session blob URL for playback (either from drop or loaded from file)
  const resolvedVideoSrc = sessionBlobUrl || '';

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
    fileLogger.log('VideoPlaceholder', `Drop event, files: ${files.length}`);
    if (files.length > 0) {
      const file = files[0];
      // Check if it's a video file
      if (file.type.startsWith('video/')) {
        // Use webUtils.getPathForFile via preload (Electron 29+ removed file.path)
        const rawPath = window.electronAPI?.video?.getFilePath?.(file);
        fileLogger.log('VideoPlaceholder', `File type: ${file.type}, rawPath: ${rawPath}`);

        // Create blob URL for playback (works without security issues)
        const blobUrl = URL.createObjectURL(file);
        fileLogger.log('VideoPlaceholder', `Created blob URL: ${blobUrl}`);

        if (rawPath && window.electronAPI?.video?.copyToAssets) {
          // Also copy to assets/videos/ for git tracking
          setIsCopying(true);
          fileLogger.log('VideoPlaceholder', 'Calling IPC copyToAssets...');
          try {
            const result = await window.electronAPI.video.copyToAssets(rawPath, videoId);
            fileLogger.log('VideoPlaceholder', `IPC result: ${JSON.stringify(result)}`);
            if (!result.ok) {
              fileLogger.error('VideoPlaceholder', `Copy failed: ${result.error}`);
            }
          } catch (err) {
            fileLogger.error('VideoPlaceholder', `Copy error: ${err}`);
          } finally {
            setIsCopying(false);
          }
        }

        // Store relative path for persistence, use local state for blob URL
        fileLogger.log('VideoPlaceholder', `Setting session blob URL and storing relative path`);
        setSessionBlobUrl(blobUrl);
        setVideoPath(videoId, `assets/videos/${videoId}.mp4`);
        // Notify parent
        onVideoDrop?.(blobUrl);
      }
    }
  }, [videoId, setVideoPath]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    fileLogger.log('VideoPlaceholder', `Clearing video for ${videoId}`);
    setSessionBlobUrl(null);
    clearVideoPath(videoId);
  }, [videoId, clearVideoPath]);

  // If video blob URL is set, show video player
  if (resolvedVideoSrc) {
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
          <span className="text-xs text-muted-foreground">assets/videos/{videoId}.mp4</span>
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
