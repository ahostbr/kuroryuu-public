import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { cn } from '../../../lib/utils';

// Helper to navigate to a view by dispatching a custom event
// App.tsx listens for 'navigate-to-view' and calls setActiveView
function navigateToView(route: string) {
  // Convert route to view name (e.g., "/kanban" -> "kanban")
  const viewName = route.replace(/^\//, '') || 'welcome';
  window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: viewName } }));
}

interface HotspotPanelProps {
  title: string;
  bodyMd: string;
  jumpRoute?: string;
  step: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  isVisible: boolean;
}

// Simple markdown-like parser for bold text and bullet points
function renderBody(md: string): React.ReactNode {
  const lines = md.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={i} className="h-2" />);
      return;
    }

    // Check for bullet points
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) {
      const content = trimmed.slice(2);
      elements.push(
        <li key={i} className="text-sm text-muted-foreground ml-4">
          {parseBold(content)}
        </li>
      );
      return;
    }

    // Check for headers (bold lines)
    if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      const content = trimmed.slice(2, -2);
      elements.push(
        <div key={i} className="text-sm font-semibold text-foreground mt-2 first:mt-0">
          {content}
        </div>
      );
      return;
    }

    // Regular paragraph with bold parsing
    elements.push(
      <p key={i} className="text-sm text-muted-foreground">
        {parseBold(trimmed)}
      </p>
    );
  });

  return elements;
}

function parseBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export function HotspotPanel({
  title,
  bodyMd,
  jumpRoute,
  step,
  total,
  onPrev,
  onNext,
  onClose,
  isVisible,
}: HotspotPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        onPrev();
      } else if (e.key === 'ArrowRight') {
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onPrev, onNext, onClose]);

  // Scroll into view when opened
  useEffect(() => {
    if (isVisible && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isVisible]);

  const handleJump = () => {
    if (jumpRoute) {
      navigateToView(jumpRoute);
    }
  };

  return (
    <div
      ref={panelRef}
      className={cn(
        'overflow-hidden transition-all duration-300 ease-out',
        isVisible ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
      )}
    >
      <div className="mt-4 p-4 rounded-xl bg-card border border-border shadow-lg">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 rounded-full bg-primary" />
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-border mb-3" />

        {/* Body content */}
        <div className="space-y-1">{renderBody(bodyMd)}</div>

        {/* Footer with actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          {/* Jump to live button */}
          {jumpRoute ? (
            <button
              onClick={handleJump}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'font-medium text-sm transition-colors'
              )}
            >
              Jump to live
              <ExternalLink className="w-4 h-4" />
            </button>
          ) : (
            <div />
          )}

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={onPrev}
              disabled={step === 0}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                step === 0
                  ? 'text-muted-foreground/50 cursor-not-allowed'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>

            <span className="px-2 text-sm text-muted-foreground tabular-nums">
              Step {step + 1}/{total}
            </span>

            <button
              onClick={onNext}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              {step === total - 1 ? 'Finish' : 'Next'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
