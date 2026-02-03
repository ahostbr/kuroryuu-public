/**
 * RichVizPopupLayer - Floating modal overlay for terminal tool visualizations
 *
 * Renders rich visualization popups over the terminal grid.
 * Popups appear near the worker that triggered them.
 * Dismissible via X button or click-outside.
 */

import { useEffect, useRef, useCallback } from 'react';
import { X, Terminal, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useRichVizStore, type RichVizPopup } from '../stores/rich-viz-store';
import { useSettingsStore } from '../stores/settings-store';
import { RichCardRenderer } from './insights/RichCardRenderer';
import type { RichCard, RAGResultsData, FileTreeData, ToolOutputData } from '../types/insights';

interface PopupCardProps {
  popup: RichVizPopup;
  onDismiss: () => void;
}

function PopupCard({ popup, onDismiss }: PopupCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Click outside to dismiss
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    // Delay adding listener to prevent immediate dismiss
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 100);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handler);
    };
  }, [onDismiss]);

  // Escape key to dismiss
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onDismiss]);

  // Build RichCard from popup data
  const richCard: RichCard = {
    id: popup.id,
    type: popup.type,
    toolCallId: popup.id,
    data: popup.data as RAGResultsData | FileTreeData | ToolOutputData,
  };

  // Copy data handler
  const handleCopy = useCallback(() => {
    let text = '';
    if (popup.type === 'rag-results') {
      const data = popup.data as RAGResultsData;
      text = data.matches.map(m => m.line ? `${m.path}:${m.line}` : m.path).join('\n');
    } else if (popup.type === 'file-tree') {
      const data = popup.data as FileTreeData;
      text = data.files.map(f => f.path).join('\n');
    } else if (popup.type === 'tool-output') {
      const data = popup.data as ToolOutputData;
      text = data.output;
    }
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [popup]);

  // Position style (defaults to center-right if no position)
  const positionStyle = popup.position
    ? {
        position: 'absolute' as const,
        left: popup.position.x,
        top: popup.position.y,
      }
    : {};

  return (
    <div
      ref={cardRef}
      className="bg-card border border-border rounded-lg shadow-2xl overflow-hidden max-w-md animate-in slide-in-from-right-5 fade-in duration-200"
      style={positionStyle}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 border-b border-border">
        <Terminal className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground flex-1">
          {popup.toolName}
        </span>
        {popup.workerLabel && (
          <span className="text-xs text-muted-foreground">
            {popup.workerLabel}
          </span>
        )}
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Copy"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={onDismiss}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Dismiss (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-2 max-h-[400px] overflow-y-auto">
        <RichCardRenderer card={richCard} collapsed={false} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/30 border-t border-border text-xs text-muted-foreground">
        <span>
          {new Date(popup.timestamp).toLocaleTimeString()}
        </span>
        <button
          onClick={onDismiss}
          className="px-2 py-1 rounded hover:bg-muted/50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function RichVizPopupLayer() {
  const popups = useRichVizStore((state) => state.popups);
  const dismissPopup = useRichVizStore((state) => state.dismissPopup);
  const enableRichToolVisualizations = useSettingsStore(
    (state) => state.appSettings.enableRichToolVisualizations
  );

  // Don't render anything if disabled
  if (!enableRichToolVisualizations || popups.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      <div className="absolute top-4 right-4 space-y-3 pointer-events-auto">
        {popups.map((popup) => (
          <PopupCard
            key={popup.id}
            popup={popup}
            onDismiss={() => dismissPopup(popup.id)}
          />
        ))}
      </div>
    </div>
  );
}
