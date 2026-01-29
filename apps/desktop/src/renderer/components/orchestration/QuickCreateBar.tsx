/**
 * QuickCreateBar - Bottom inline task creation
 * Minimal, fast task entry
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Send, Loader2 } from 'lucide-react';

interface QuickCreateBarProps {
  onCreateTask: (title: string, description?: string) => Promise<void>;
  isCreating: boolean;
}

export function QuickCreateBar({ onCreateTask, isCreating }: QuickCreateBarProps) {
  const [title, setTitle] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isCreating) return;

    await onCreateTask(title.trim(), description.trim() || undefined);
    setTitle('');
    setDescription('');
    setExpanded(false);
  }, [title, description, isCreating, onCreateTask]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    if (e.key === 'Escape') {
      setExpanded(false);
      setDescription('');
    }
  }, [handleSubmit]);

  // Focus input when expanded
  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  return (
    <div className="border-t border-border bg-card/30">
      <form onSubmit={handleSubmit} className="p-3">
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
            title.trim() ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
          }`}>
            <Plus className="w-4 h-4" />
          </div>

          <input
            ref={inputRef}
            type="text"
            placeholder="New task..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setExpanded(true)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />

          {title.trim() && (
            <button
              type="submit"
              disabled={isCreating}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isCreating
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary text-background hover:bg-primary/90'
              }`}
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Create
                </>
              )}
            </button>
          )}
        </div>

        {/* Expanded description area */}
        {expanded && title.trim() && (
          <div className="mt-2 ml-10">
            <textarea
              placeholder="Add description (optional)... Press Enter to create, Escape to collapse"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none focus:border-primary/50 transition-colors"
            />
          </div>
        )}
      </form>
    </div>
  );
}
