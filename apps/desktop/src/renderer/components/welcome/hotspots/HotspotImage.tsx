import React, { useState, useCallback } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { HotspotMarker } from './HotspotMarker';
import { HotspotPanel } from './HotspotPanel';
import type { Hotspot } from './types';

interface HotspotImageProps {
  imageSrc: string;
  hotspots: Hotspot[];
  activeHotspotId: string | null;
  onHotspotSelect: (id: string | null) => void;
  step: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  placeholderLabel?: string; // For placeholder mode
}

type ImageState = 'loading' | 'ready' | 'error' | 'placeholder';

export function HotspotImage({
  imageSrc,
  hotspots,
  activeHotspotId,
  onHotspotSelect,
  step,
  total,
  onPrev,
  onNext,
  placeholderLabel,
}: HotspotImageProps) {
  const [imageState, setImageState] = useState<ImageState>(
    imageSrc.startsWith('placeholder:') ? 'placeholder' : 'loading'
  );

  const handleImageLoad = useCallback(() => {
    setImageState('ready');
  }, []);

  const handleImageError = useCallback(() => {
    setImageState('error');
  }, []);

  const handleHotspotClick = useCallback(
    (id: string) => {
      // Toggle if clicking same hotspot
      if (activeHotspotId === id) {
        onHotspotSelect(null);
      } else {
        onHotspotSelect(id);
      }
    },
    [activeHotspotId, onHotspotSelect]
  );

  const handleClose = useCallback(() => {
    onHotspotSelect(null);
  }, [onHotspotSelect]);

  const activeHotspot = hotspots.find((h) => h.id === activeHotspotId);

  // Check if using placeholder mode
  const isPlaceholder = imageSrc.startsWith('placeholder:');
  const placeholderText = isPlaceholder
    ? imageSrc.replace('placeholder:', '')
    : placeholderLabel || 'Screenshot';

  return (
    <div className="w-full">
      {/* Image container with hotspots */}
      <div className="relative w-full aspect-video bg-secondary/50 rounded-xl overflow-hidden border border-border">
        {/* Loading state */}
        {imageState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
          </div>
        )}

        {/* Error state */}
        {imageState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageOff className="w-12 h-12" />
            <span className="text-sm">Failed to load image</span>
          </div>
        )}

        {/* Placeholder state - styled rectangle with label */}
        {(imageState === 'placeholder' || isPlaceholder) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-secondary to-secondary/50">
            <div className="px-6 py-3 rounded-lg bg-background/80 border border-border">
              <span className="text-lg font-medium text-foreground">
                {placeholderText}
              </span>
            </div>
            <span className="mt-2 text-sm text-muted-foreground">
              Screenshot coming soon
            </span>
          </div>
        )}

        {/* Actual image (hidden when placeholder) */}
        {!isPlaceholder && (
          <img
            src={imageSrc}
            alt="Feature screenshot"
            className={cn(
              'w-full h-full object-contain',
              imageState !== 'ready' && 'invisible'
            )}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}

        {/* Hotspot markers overlay */}
        <div className="absolute inset-0">
          {hotspots.map((hotspot) => (
            <HotspotMarker
              key={hotspot.id}
              x={hotspot.x}
              y={hotspot.y}
              w={hotspot.w}
              h={hotspot.h}
              label={hotspot.title}
              isActive={activeHotspotId === hotspot.id}
              onClick={() => handleHotspotClick(hotspot.id)}
            />
          ))}
        </div>
      </div>

      {/* Inline expansion panel - appears below image */}
      <HotspotPanel
        title={activeHotspot?.title || ''}
        bodyMd={activeHotspot?.bodyMd || ''}
        jumpRoute={activeHotspot?.jumpRoute}
        step={step}
        total={total}
        onPrev={onPrev}
        onNext={onNext}
        onClose={handleClose}
        isVisible={!!activeHotspot}
      />
    </div>
  );
}
