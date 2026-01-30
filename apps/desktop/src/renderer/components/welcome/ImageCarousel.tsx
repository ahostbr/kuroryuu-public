import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ImageCarouselProps {
  images: string[];
  alt: string;
  className?: string;
}

export function ImageCarousel({ images, alt, className }: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (images.length === 0) return null;

  // Single image - no navigation needed
  if (images.length === 1) {
    return (
      <div className={cn('w-full rounded-lg overflow-hidden border border-border', className)}>
        <img
          src={images[0]}
          alt={alt}
          className="w-full h-auto"
        />
      </div>
    );
  }

  const goToPrevious = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className={cn('relative w-full rounded-lg overflow-hidden border border-border group', className)}>
      {/* Image */}
      <img
        src={images[currentIndex]}
        alt={`${alt} - ${currentIndex + 1} of ${images.length}`}
        className="w-full h-auto"
      />

      {/* Previous button */}
      <button
        onClick={goToPrevious}
        className={cn(
          'absolute left-2 top-1/2 -translate-y-1/2',
          'w-10 h-10 rounded-full',
          'bg-background/80 hover:bg-background border border-border',
          'flex items-center justify-center',
          'text-foreground hover:text-primary',
          'transition-all opacity-0 group-hover:opacity-100',
          'shadow-lg'
        )}
        aria-label="Previous image"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      {/* Next button */}
      <button
        onClick={goToNext}
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2',
          'w-10 h-10 rounded-full',
          'bg-background/80 hover:bg-background border border-border',
          'flex items-center justify-center',
          'text-foreground hover:text-primary',
          'transition-all opacity-0 group-hover:opacity-100',
          'shadow-lg'
        )}
        aria-label="Next image"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* Indicator dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        {images.map((_, index) => (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex(index);
            }}
            className={cn(
              'w-2 h-2 rounded-full transition-all',
              index === currentIndex
                ? 'bg-primary w-4'
                : 'bg-foreground/30 hover:bg-foreground/50'
            )}
            aria-label={`Go to image ${index + 1}`}
          />
        ))}
      </div>

      {/* Counter badge */}
      <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-background/80 border border-border text-xs text-muted-foreground">
        {currentIndex + 1} / {images.length}
      </div>
    </div>
  );
}
