import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, Pause, Play, AlertCircle, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { VideoPlaceholder } from './VideoPlaceholder';
import { useWelcomeStore } from '../../../stores/welcome-store';

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
  const { videoMuted, videoPaused, toggleMute, togglePause, videoPaths } = useWelcomeStore();
  const [projectRoot, setProjectRoot] = useState('');

  // Get project root on mount for resolving relative paths
  useEffect(() => {
    window.electronAPI?.app?.getProjectRoot?.().then(setProjectRoot).catch(() => {});
  }, []);

  // Use stored path or prop src
  const storedPath = videoPaths[videoId] || src;

  // Use video path directly (blob URLs work without resolution)
  const effectiveSrc = storedPath || '';

  const [videoState, setVideoState] = useState<'loading' | 'ready' | 'error' | 'placeholder'>(
    effectiveSrc ? 'loading' : 'placeholder'
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  // Update state when effectiveSrc changes
  useEffect(() => {
    if (effectiveSrc) {
      setVideoState('loading');
    } else {
      setVideoState('placeholder');
    }
  }, [effectiveSrc]);

  // Handle video load
  const handleCanPlay = useCallback(() => {
    setVideoState('ready');
  }, []);

  const handleError = useCallback(() => {
    setVideoState('error');
  }, []);

  // Sync video state with store
  useEffect(() => {
    const video = videoRef.current;
    if (!video || videoState !== 'ready') return;

    video.muted = videoMuted;
    if (videoPaused) {
      video.pause();
    } else {
      video.play().catch(() => {
        // Autoplay failed, likely due to browser policy
      });
    }
  }, [videoMuted, videoPaused, videoState]);

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

  // Show placeholder if no source (with drag-drop support)
  if (!effectiveSrc || videoState === 'placeholder') {
    return (
      <VideoPlaceholder
        message="Hero Video Montage"
        className={className}
        videoId={videoId}
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
            onClick={() => useWelcomeStore.getState().clearVideoPath(videoId)}
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
        muted={videoMuted}
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

          {/* Mute/Unmute button */}
          <button
            onClick={toggleMute}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'bg-background/80 hover:bg-background border border-border',
              'text-foreground'
            )}
            aria-label={videoMuted ? 'Unmute' : 'Mute'}
          >
            {videoMuted ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>

          {/* Remove video button */}
          <button
            onClick={() => useWelcomeStore.getState().clearVideoPath(videoId)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'bg-background/80 hover:bg-destructive/20 border border-border',
              'text-foreground hover:text-destructive'
            )}
            aria-label="Remove video"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
