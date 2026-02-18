/**
 * Carousel Component
 * Scrollable carousel with scroll snap, optional auto-scroll, and navigation indicators.
 */
import React, { useState, useEffect, useRef } from 'react';

export interface CarouselProps {
  items: React.ReactNode[];
  autoScroll?: boolean;
  autoScrollInterval?: number;
  showIndicators?: boolean;
  showArrows?: boolean;
  gap?: string;
  className?: string;
}

export function Carousel({
  items,
  autoScroll = false,
  autoScrollInterval = 3000,
  showIndicators = true,
  showArrows = true,
  gap = '1rem',
  className,
}: CarouselProps): React.ReactElement {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToIndex = (index: number) => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const itemWidth = container.scrollWidth / items.length;
      container.scrollTo({ left: itemWidth * index, behavior: 'smooth' });
      setCurrentIndex(index);
    }
  };

  const handleNext = () => scrollToIndex((currentIndex + 1) % items.length);
  const handlePrev = () => scrollToIndex((currentIndex - 1 + items.length) % items.length);

  useEffect(() => {
    if (autoScroll) {
      const interval = setInterval(handleNext, autoScrollInterval);
      return () => clearInterval(interval);
    }
  }, [autoScroll, autoScrollInterval, currentIndex]);

  return (
    <div className={`relative ${className || ''}`}>
      <div
        ref={scrollContainerRef}
        className="flex overflow-x-auto snap-x snap-mandatory"
        style={{ gap, scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item, index) => (
          <div key={index} className="flex-shrink-0 w-full snap-center">
            {item}
          </div>
        ))}
      </div>

      {showArrows && items.length > 1 && (
        <>
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-card/90 backdrop-blur-sm border border-border text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary/40 transition-all shadow-lg p-2"
            onClick={handlePrev}
            aria-label="Previous slide"
          >
            {'\u2039'}
          </button>
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-card/90 backdrop-blur-sm border border-border text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary/40 transition-all shadow-lg p-2"
            onClick={handleNext}
            aria-label="Next slide"
          >
            {'\u203A'}
          </button>
        </>
      )}

      {showIndicators && items.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {items.map((_, index) => (
            <button
              key={index}
              onClick={() => scrollToIndex(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentIndex
                  ? 'bg-primary w-8 shadow-lg shadow-primary/50'
                  : 'bg-primary/20 w-2 hover:bg-primary/40'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}

      <style>{`.snap-x::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}

export default Carousel;
