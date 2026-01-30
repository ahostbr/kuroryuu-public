import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Pause, Play, AlertCircle } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { VideoPlaceholder } from './VideoPlaceholder';
import { useWelcomeStore } from '../../../stores/welcome-store';
import { fileLogger } from '../../../utils/file-logger';

interface VideoCaption {
  text: string;
  startTime: number; // in seconds
  endTime: number;
}

interface HeroVideoProps {
  src?: string;
  posterSrc?: string;
  captions?: VideoCaption[];
  className?: string;
  videoId?: string; // Unique ID for storing video path
}

export function HeroVideo({
  src,
  posterSrc,
  captions = [],
  className,
  videoId = 'hero',
}: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const didMountInit = useRef(false);
  const { videoPaused, togglePause, videoPaths, clearVideoPath } = useWelcomeStore();
  const [sessionBlobUrl, setSessionBlobUrl] = useState<string | null>(null);

  // Use stored path or prop src
  const storedPath = videoPaths[videoId] || src;

  fileLogger.log('HeroVideo', `Render: videoId=${videoId}, storedPath=${storedPath?.substring(0, 50)}, sessionBlob=${sessionBlobUrl?.substring(0, 30)}`);

  // On mount: if we have a saved relative path, load the video file
  useEffect(() => {
    if (didMountInit.current) return;
    didMountInit.current = true;

    const initVideo = async () => {
      // If relative path stored, load from file
      if (storedPath && !storedPath.startsWith('blob:') && window.electronAPI?.video?.loadFromAssets) {
        fileLogger.log('HeroVideo', `Loading saved video from: ${storedPath}`);
        try {
          const result = await window.electronAPI.video.loadFromAssets(videoId);
          if (result.ok && result.base64 && result.mimeType) {
            fileLogger.log('HeroVideo', `Loaded video (${result.base64.length} chars)`);
            const byteCharacters = atob(result.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: result.mimeType });
            const blobUrl = URL.createObjectURL(blob);
            fileLogger.log('HeroVideo', `Created blob URL: ${blobUrl.substring(0, 50)}`);
            setSessionBlobUrl(blobUrl);
          } else {
            fileLogger.log('HeroVideo', `Video file not found, clearing`);
            clearVideoPath(videoId);
          }
        } catch (err) {
          fileLogger.error('HeroVideo', `Load failed: ${err}`);
          clearVideoPath(videoId);
        }
      } else if (storedPath?.startsWith('blob:')) {
        // Stale blob URL - clear it
        fileLogger.log('HeroVideo', `Clearing stale blob URL`);
        clearVideoPath(videoId);
      }
    };

    initVideo();
  }, [videoId, storedPath, clearVideoPath]);

  // Use session blob URL for playback
  const effectiveSrc = sessionBlobUrl || '';

  const [videoState, setVideoState] = useState<'loading' | 'ready' | 'error' | 'placeholder'>(
    effectiveSrc ? 'loading' : 'placeholder'
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  // Update state when effectiveSrc changes
  useEffect(() => {
    fileLogger.log('HeroVideo', `effectiveSrc changed: ${effectiveSrc ? effectiveSrc.substring(0, 50) + '...' : 'empty'}`);
    if (effectiveSrc) {
      setVideoState('loading');
    } else {
      setVideoState('placeholder');
    }
  }, [effectiveSrc]);

  // Handle video load
  const handleCanPlay = useCallback(() => {
    fileLogger.log('HeroVideo', 'Video ready to play');
    setVideoState('ready');
  }, []);

  const handleError = useCallback(() => {
    fileLogger.error('HeroVideo', `Video load error, effectiveSrc: ${effectiveSrc?.substring(0, 50)}...`);
    setVideoState('error');
  }, [effectiveSrc]);

  // Sync video state with store
  useEffect(() => {
    const video = videoRef.current;
    if (!video || videoState !== 'ready') return;

    video.muted = true; // Always muted
    if (videoPaused) {
      video.pause();
    } else {
      video.play().catch(() => {
        // Autoplay failed, likely due to browser policy
      });
    }
  }, [videoPaused, videoState]);

  // Pause when page loses focus or is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      const video = videoRef.current;
      if (!video) return;

      if (document.hidden) {
        video.pause();
      } else if (!videoPaused) {
        video.play().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [videoPaused]);

  // Track current time for captions
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, []);

  // Get current caption
  const currentCaption = captions.find(
    (c) => currentTime >= c.startTime && currentTime < c.endTime
  );

  // Handle video drop from placeholder
  const handleVideoDrop = useCallback((blobUrl: string) => {
    fileLogger.log('HeroVideo', `Video dropped, setting blob URL: ${blobUrl.substring(0, 50)}`);
    setSessionBlobUrl(blobUrl);
  }, []);

  // Handle remove video
  const handleRemove = useCallback(() => {
    fileLogger.log('HeroVideo', `Removing video for ${videoId}`);
    setSessionBlobUrl(null);
    clearVideoPath(videoId);
  }, [videoId, clearVideoPath]);

  // Show placeholder if no source (with drag-drop support)
  if (!effectiveSrc || videoState === 'placeholder') {
    return (
      <VideoPlaceholder
        message="Hero Video Montage"
        className={className}
        videoId={videoId}
        onVideoDrop={handleVideoDrop}
      />
    );
  }

  return (
    <div
      className={cn('relative w-full aspect-video rounded-xl overflow-hidden', className)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Loading state */}
      {videoState === 'loading' && (
        <div className="absolute inset-0 bg-secondary flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error state */}
      {videoState === 'error' && (
        <div className="absolute inset-0 bg-secondary flex flex-col items-center justify-center gap-2 text-destructive">
          <AlertCircle className="w-12 h-12" />
          <span className="text-sm">Failed to load video</span>
          <button
            onClick={handleRemove}
            className="mt-2 px-3 py-1 text-xs rounded bg-background/80 hover:bg-background border border-border text-foreground"
          >
            Clear & Try Again
          </button>
        </div>
      )}

      {/* Video element */}
      <video
        ref={videoRef}
        src={effectiveSrc}
        poster={posterSrc}
        autoPlay
        muted
        loop
        playsInline
        onCanPlay={handleCanPlay}
        onError={handleError}
        className={cn(
          'w-full h-full object-cover',
          videoState !== 'ready' && 'invisible'
        )}
      />

      {/* Caption overlay */}
      {currentCaption && videoState === 'ready' && (
        <div className="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none">
          <div className="px-4 py-2 rounded-lg bg-background/80 backdrop-blur border border-border">
            <span className="text-lg font-medium text-foreground">
              {currentCaption.text}
            </span>
          </div>
        </div>
      )}

      {/* Controls overlay - visible on hover */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 p-4',
          'bg-gradient-to-t from-background/80 to-transparent',
          'transition-opacity duration-200',
          isHovering || videoPaused ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="flex items-center justify-end gap-2">
          {/* Play/Pause button */}
          <button
            onClick={togglePause}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'bg-background/80 hover:bg-background border border-border',
              'text-foreground'
            )}
            aria-label={videoPaused ? 'Play' : 'Pause'}
          >
            {videoPaused ? (
              <Play className="w-5 h-5" />
            ) : (
              <Pause className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
