/**
 * MergeViewWrapper - CodeMirror 6 MergeView React wrapper for side-by-side diff
 * Uses @codemirror/merge for synchronized diff viewing
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { EditorView, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { MergeView } from '@codemirror/merge';
import { oneDark } from '@codemirror/theme-one-dark';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { getLanguageExtension } from '../editdoc/languageLoader';
import { ChevronUp, ChevronDown } from 'lucide-react';

// Shared theme matching kuroryuuTheme from EditorPane
const diffTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'var(--background)',
  },
  '.cm-content': {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    padding: '8px 0',
  },
  '.cm-gutters': {
    backgroundColor: 'hsl(var(--card))',
    color: 'hsl(var(--muted-foreground))',
    border: 'none',
    borderRight: '1px solid hsl(var(--border))',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 8px',
    minWidth: '32px',
    textAlign: 'right',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  },
  '.cm-line': {
    padding: '0 8px',
  },
  // Merge-specific styling
  '.cm-mergeView': {
    height: '100%',
  },
  '.cm-merge-spacer': {
    backgroundColor: 'hsl(var(--muted) / 0.2)',
  },
  // Change highlighting - deletions (original side)
  '.cm-deletedChunk': {
    backgroundColor: 'rgba(248, 81, 73, 0.15)',
  },
  '.cm-changedLine': {
    backgroundColor: 'rgba(248, 81, 73, 0.08)',
  },
  '.cm-deletedText': {
    backgroundColor: 'rgba(248, 81, 73, 0.35)',
    textDecoration: 'line-through',
    textDecorationColor: 'rgba(248, 81, 73, 0.6)',
  },
  // Change highlighting - additions (modified side)
  '.cm-insertedChunk': {
    backgroundColor: 'rgba(63, 185, 80, 0.15)',
  },
  '.cm-insertedLine': {
    backgroundColor: 'rgba(63, 185, 80, 0.08)',
  },
  '.cm-insertedText': {
    backgroundColor: 'rgba(63, 185, 80, 0.35)',
  },
  // Gutter change markers
  '.cm-changeGutter': {
    width: '4px',
  },
  '.cm-changeGutter .cm-gutterElement': {
    padding: '0',
  },
  '.cm-deletedGutter': {
    backgroundColor: 'rgba(248, 81, 73, 0.6)',
  },
  '.cm-insertedGutter': {
    backgroundColor: 'rgba(63, 185, 80, 0.6)',
  },
});

interface MergeViewWrapperProps {
  originalContent: string;
  modifiedContent: string;
  language?: string;
  originalLabel?: string;
  modifiedLabel?: string;
  className?: string;
}

export function MergeViewWrapper({
  originalContent,
  modifiedContent,
  language = 'text',
  originalLabel = 'Original',
  modifiedLabel = 'Modified',
  className = '',
}: MergeViewWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mergeViewRef = useRef<MergeView | null>(null);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  // Initialize MergeView
  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous instance
    if (mergeViewRef.current) {
      mergeViewRef.current.destroy();
    }

    // Common extensions for both editors
    const commonExtensions = [
      lineNumbers(),
      highlightActiveLine(),
      getLanguageExtension(language),
      syntaxHighlighting(defaultHighlightStyle),
      oneDark,
      diffTheme,
      EditorView.lineWrapping,
      EditorState.readOnly.of(true),
    ];

    // Create MergeView
    const mergeView = new MergeView({
      a: {
        doc: originalContent,
        extensions: commonExtensions,
      },
      b: {
        doc: modifiedContent,
        extensions: commonExtensions,
      },
      parent: containerRef.current,
      orientation: 'a-b', // Original left, Modified right
      highlightChanges: true,
      gutter: true,
    });

    mergeViewRef.current = mergeView;

    // Count chunks
    const chunks = mergeView.chunks;
    setTotalChunks(chunks.length);
    if (chunks.length > 0) {
      setCurrentChunkIndex(0);
    }

    return () => {
      mergeView.destroy();
      mergeViewRef.current = null;
    };
  }, [originalContent, modifiedContent, language]);

  // Navigate to previous change
  const goToPreviousChange = useCallback(() => {
    if (!mergeViewRef.current || totalChunks === 0) return;

    const newIndex = currentChunkIndex > 0 ? currentChunkIndex - 1 : totalChunks - 1;
    setCurrentChunkIndex(newIndex);

    const chunks = mergeViewRef.current.chunks;
    if (chunks[newIndex]) {
      const chunk = chunks[newIndex];
      // Scroll modified side (b) to the chunk
      mergeViewRef.current.b.dispatch({
        effects: EditorView.scrollIntoView(chunk.fromB, { y: 'center' }),
      });
    }
  }, [currentChunkIndex, totalChunks]);

  // Navigate to next change
  const goToNextChange = useCallback(() => {
    if (!mergeViewRef.current || totalChunks === 0) return;

    const newIndex = currentChunkIndex < totalChunks - 1 ? currentChunkIndex + 1 : 0;
    setCurrentChunkIndex(newIndex);

    const chunks = mergeViewRef.current.chunks;
    if (chunks[newIndex]) {
      const chunk = chunks[newIndex];
      // Scroll modified side (b) to the chunk
      mergeViewRef.current.b.dispatch({
        effects: EditorView.scrollIntoView(chunk.fromB, { y: 'center' }),
      });
    }
  }, [currentChunkIndex, totalChunks]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        goToPreviousChange();
      }
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        goToNextChange();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPreviousChange, goToNextChange]);

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header with labels */}
      <div className="flex border-b border-border bg-card/50">
        <div className="flex-1 px-3 py-1.5 text-xs font-medium text-muted-foreground border-r border-border">
          {originalLabel}
          <span className="ml-2 text-red-400">({originalContent.split('\n').length} lines)</span>
        </div>
        <div className="flex-1 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          {modifiedLabel}
          <span className="ml-2 text-green-400">({modifiedContent.split('\n').length} lines)</span>
        </div>
      </div>

      {/* MergeView container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        style={{ minHeight: 0 }}
      />

      {/* Navigation footer */}
      {totalChunks > 0 && (
        <div className="flex items-center justify-center gap-3 px-3 py-1.5 border-t border-border bg-card/50">
          <button
            onClick={goToPreviousChange}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Previous change (Alt+Up)"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground">
            Change {currentChunkIndex + 1} of {totalChunks}
          </span>
          <button
            onClick={goToNextChange}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Next change (Alt+Down)"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
