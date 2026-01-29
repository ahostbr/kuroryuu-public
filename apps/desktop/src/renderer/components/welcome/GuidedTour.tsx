import React, { useCallback, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Map } from 'lucide-react';
import { cn } from '../../lib/utils';
import { HotspotImage, hotspotData } from './hotspots';
import { useWelcomeStore } from '../../stores/welcome-store';

interface GuidedTourProps {
  className?: string;
}

export function GuidedTour({ className }: GuidedTourProps) {
  const {
    tourActive,
    tourStep,
    tourTotal,
    startTour,
    nextStep,
    prevStep,
    goToStep,
    endTour,
    activeHotspot,
    setActiveHotspot,
  } = useWelcomeStore();

  // Get current slide
  const currentSlide = hotspotData.slides[tourStep];

  // Keyboard navigation
  useEffect(() => {
    if (!tourActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if a hotspot panel is open (it handles its own keyboard)
      if (activeHotspot) return;

      if (e.key === 'Escape') {
        endTour();
      } else if (e.key === 'ArrowLeft') {
        prevStep();
      } else if (e.key === 'ArrowRight') {
        nextStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tourActive, activeHotspot, prevStep, nextStep, endTour]);

  // Handle next/prev with hotspot clearing
  const handleNext = useCallback(() => {
    setActiveHotspot(null);
    nextStep();
  }, [setActiveHotspot, nextStep]);

  const handlePrev = useCallback(() => {
    setActiveHotspot(null);
    prevStep();
  }, [setActiveHotspot, prevStep]);

  // Tour not active - show start button
  if (!tourActive) {
    return (
      <div className={cn('flex flex-col items-center gap-4', className)}>
        <button
          onClick={startTour}
          className={cn(
            'flex items-center gap-3 px-6 py-3 rounded-xl',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'font-semibold text-lg transition-all',
            'shadow-lg hover:shadow-xl hover:scale-105'
          )}
        >
          <Map className="w-5 h-5" />
          Start Tour
        </button>
        <p className="text-sm text-muted-foreground">
          Take a guided tour of Kuroryuu&apos;s features
        </p>
      </div>
    );
  }

  // Tour active - show current slide
  return (
    <div className={cn('w-full', className)}>
      {/* Tour header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Map className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">
            {currentSlide?.title || `Slide ${tourStep + 1}`}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Step indicator dots */}
          <div className="flex items-center gap-1.5 mr-4">
            {hotspotData.slides.map((slide, i) => (
              <button
                key={slide.id}
                onClick={() => {
                  setActiveHotspot(null);
                  goToStep(i);
                }}
                className={cn(
                  'w-2.5 h-2.5 rounded-full transition-all',
                  i === tourStep
                    ? 'bg-primary scale-125'
                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                )}
                aria-label={`Go to ${slide.title}`}
              />
            ))}
          </div>

          {/* Close button */}
          <button
            onClick={endTour}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="End tour"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Current slide content */}
      {currentSlide && (
        <HotspotImage
          imageSrc={currentSlide.imageSrc}
          hotspots={currentSlide.hotspots}
          activeHotspotId={activeHotspot}
          onHotspotSelect={setActiveHotspot}
          step={tourStep}
          total={tourTotal}
          onPrev={handlePrev}
          onNext={handleNext}
          placeholderLabel={currentSlide.title}
        />
      )}

      {/* Tour navigation - shown when no hotspot is active */}
      {!activeHotspot && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <button
            onClick={handlePrev}
            disabled={tourStep === 0}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
              tourStep === 0
                ? 'text-muted-foreground/50 cursor-not-allowed'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            <ChevronLeft className="w-5 h-5" />
            Previous
          </button>

          <span className="text-sm text-muted-foreground tabular-nums">
            Step {tourStep + 1} of {tourTotal}
          </span>

          <button
            onClick={handleNext}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {tourStep === tourTotal - 1 ? 'Finish Tour' : 'Next'}
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Keyboard hint */}
      <p className="mt-3 text-xs text-muted-foreground/60 text-center">
        Use arrow keys to navigate • Press Esc to exit
      </p>
    </div>
  );
}
