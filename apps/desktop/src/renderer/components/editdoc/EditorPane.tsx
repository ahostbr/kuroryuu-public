/**
 * EditorPane - CodeMirror-based markdown editor
 * VSCode-style with syntax highlighting and line numbers
 * T421: Added Go to Definition (Ctrl+Click) support
 * T424: Added Code Folding support
 * T425: Added Minimap support
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter, foldKeymap } from '@codemirror/language';
import { getLanguageExtension } from './languageLoader';

interface EditorPaneProps {
  content: string;
  onChange: (content: string) => void;
  onCursorChange?: (line: number, column: number) => void;
  onSave?: () => void;
  onGoToDefinition?: (symbol: string, line: number, column: number) => void;
  onFindReferences?: (symbol: string) => void;
  language?: string;
  className?: string;
  showMinimap?: boolean;
  showFoldGutter?: boolean;
  readOnly?: boolean;
}

// Helper to extract word at position
function getWordAtPosition(doc: string, pos: number): { word: string; start: number; end: number } | null {
  const wordRegex = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
  let match;
  while ((match = wordRegex.exec(doc)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (pos >= start && pos <= end) {
      return { word: match[0], start, end };
    }
    if (start > pos) break;
  }
  return null;
}

// Custom theme to match Kuroryuu
const kuroryuuTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'var(--background)',
  },
  '.cm-content': {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    padding: '8px 0',
    caretColor: 'var(--primary)',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--primary)',
    borderLeftWidth: '2px',
  },
  '.cm-gutters': {
    backgroundColor: 'hsl(var(--card))',
    color: 'hsl(var(--muted-foreground))',
    border: 'none',
    borderRight: '1px solid hsl(var(--border))',
  },
  '.cm-gutter': {
    minWidth: '48px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 12px 0 8px',
    minWidth: '40px',
    textAlign: 'right',
  },
  '.cm-activeLine': {
    backgroundColor: 'hsl(var(--muted) / 0.3)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'hsl(var(--muted) / 0.5)',
    color: 'hsl(var(--foreground))',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'hsl(var(--primary) / 0.3) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'hsl(var(--primary) / 0.3) !important',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  },
  '.cm-line': {
    padding: '0 8px',
  },
  // Markdown syntax colors
  '.cm-header': {
    color: '#7ee787',
    fontWeight: 'bold',
  },
  '.cm-header-1': { fontSize: '1.4em' },
  '.cm-header-2': { fontSize: '1.2em' },
  '.cm-header-3': { fontSize: '1.1em' },
  '.cm-link': {
    color: '#58a6ff',
    textDecoration: 'underline',
  },
  '.cm-url': {
    color: '#8b949e',
  },
  '.cm-emphasis': {
    fontStyle: 'italic',
    color: '#d2a8ff',
  },
  '.cm-strong': {
    fontWeight: 'bold',
    color: '#ff7b72',
  },
  '.cm-strikethrough': {
    textDecoration: 'line-through',
    color: '#8b949e',
  },
  '.cm-quote': {
    color: '#8b949e',
    fontStyle: 'italic',
    borderLeft: '3px solid hsl(var(--border))',
    paddingLeft: '12px',
  },
  '.cm-list': {
    color: '#79c0ff',
  },
  '.cm-meta': {
    color: '#ffa657',
  },
  // Fold gutter styling (T424)
  '.cm-foldGutter': {
    width: '16px',
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 2px',
    cursor: 'pointer',
    color: 'hsl(var(--muted-foreground))',
    fontSize: '10px',
    lineHeight: '1.6',
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: 'hsl(var(--primary))',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'hsl(var(--muted) / 0.5)',
    border: '1px solid hsl(var(--border))',
    borderRadius: '3px',
    padding: '0 4px',
    margin: '0 2px',
    color: 'hsl(var(--muted-foreground))',
    cursor: 'pointer',
  },
});

// Minimap component (T425)
interface MinimapProps {
  content: string;
  viewportTop: number;
  viewportHeight: number;
  totalLines: number;
  onScroll: (line: number) => void;
}

function Minimap({ content, viewportTop, viewportHeight, totalLines, onScroll }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Draw minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resolve CSS variables from computed styles (canvas can't parse CSS vars directly)
    const styles = getComputedStyle(document.documentElement);
    const cardColor = styles.getPropertyValue('--card').trim() || '0 0% 12%';
    const mutedFgColor = styles.getPropertyValue('--muted-foreground').trim() || '0 0% 50%';
    const primaryColor = styles.getPropertyValue('--primary').trim() || '210 100% 50%';

    const lines = content.split('\n');
    const lineHeight = 2;
    const width = canvas.width;
    const height = lines.length * lineHeight;

    // Set canvas height
    canvas.height = Math.max(height, 100);

    // Clear canvas with background color
    ctx.fillStyle = `hsl(${cardColor})`;
    ctx.fillRect(0, 0, width, canvas.height);

    // Draw lines representation
    ctx.fillStyle = `hsl(${mutedFgColor} / 0.3)`;
    lines.forEach((line, i) => {
      const trimmed = line.trimStart();
      const indent = line.length - trimmed.length;
      const lineWidth = Math.min(trimmed.length * 0.8, width - 4);
      if (lineWidth > 0) {
        ctx.fillRect(2 + indent * 0.5, i * lineHeight, lineWidth, lineHeight - 0.5);
      }
    });

    // Draw viewport indicator
    const vpTop = (viewportTop / totalLines) * canvas.height;
    const vpHeight = Math.max((viewportHeight / totalLines) * canvas.height, 20);
    ctx.fillStyle = `hsl(${primaryColor} / 0.2)`;
    ctx.fillRect(0, vpTop, width, vpHeight);
    ctx.strokeStyle = `hsl(${primaryColor} / 0.5)`;
    ctx.strokeRect(0, vpTop, width, vpHeight);
  }, [content, viewportTop, viewportHeight, totalLines]);

  // Handle click to scroll
  const handleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const clickedLine = Math.floor((y / canvas.height) * totalLines);
    onScroll(clickedLine);
  };

  return (
    <div
      ref={containerRef}
      className="w-[80px] h-full border-l border-border bg-card/50 cursor-pointer overflow-hidden"
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        width={76}
        className="w-full"
      />
    </div>
  );
}

export function EditorPane({
  content,
  onChange,
  onCursorChange,
  onSave,
  onGoToDefinition,
  onFindReferences,
  language,
  className = '',
  showMinimap = false,
  showFoldGutter = true,
  readOnly = false,
}: EditorPaneProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Minimap viewport state
  const [viewportTop, setViewportTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(30);
  const totalLines = content.split('\n').length;

  // Create save keymap
  const saveKeymap = keymap.of([
    {
      key: 'Mod-s',
      run: () => {
        onSave?.();
        return true;
      },
    },
  ]);

  // Handle Ctrl+Click for Go to Definition
  const handleEditorClick = useCallback((e: MouseEvent) => {
    if (!viewRef.current || !e.ctrlKey) return;

    const view = viewRef.current;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos === null) return;

    const doc = view.state.doc.toString();
    const wordInfo = getWordAtPosition(doc, pos);
    if (!wordInfo) return;

    const line = view.state.doc.lineAt(pos);
    const column = pos - line.from + 1;

    if (onGoToDefinition) {
      e.preventDefault();
      e.stopPropagation();
      onGoToDefinition(wordInfo.word, line.number, column);
    }
  }, [onGoToDefinition]);

  // Handle F12 for Go to Definition and Shift+F12 for Find References
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!viewRef.current) return;

    const view = viewRef.current;
    const pos = view.state.selection.main.head;
    const doc = view.state.doc.toString();
    const wordInfo = getWordAtPosition(doc, pos);

    if (e.key === 'F12' && !e.shiftKey && wordInfo && onGoToDefinition) {
      e.preventDefault();
      const line = view.state.doc.lineAt(pos);
      onGoToDefinition(wordInfo.word, line.number, pos - line.from + 1);
    }

    if (e.key === 'F12' && e.shiftKey && wordInfo && onFindReferences) {
      e.preventDefault();
      onFindReferences(wordInfo.word);
    }
  }, [onGoToDefinition, onFindReferences]);

  // Update listener
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      onChange(update.state.doc.toString());
    }
    if (update.selectionSet && onCursorChange) {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      onCursorChange(line.number, pos - line.from + 1);
    }
    // Update minimap viewport
    if (update.geometryChanged || update.viewportChanged) {
      const view = update.view;
      const scrollTop = view.scrollDOM.scrollTop;
      const lineHeight = view.defaultLineHeight;
      const topLine = Math.floor(scrollTop / lineHeight);
      const visibleLines = Math.ceil(view.scrollDOM.clientHeight / lineHeight);
      setViewportTop(topLine);
      setViewportHeight(visibleLines);
    }
  });

  // Handle minimap scroll
  const handleMinimapScroll = useCallback((line: number) => {
    if (!viewRef.current) return;
    const view = viewRef.current;
    const lineInfo = view.state.doc.line(Math.min(line + 1, view.state.doc.lines));
    view.dispatch({
      effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }),
    });
  }, []);

  // Initialize editor
  useEffect(() => {
    if (!editorRef.current) return;

    // Build extensions array
    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      getLanguageExtension(language),
      syntaxHighlighting(defaultHighlightStyle),
      oneDark,
      kuroryuuTheme,
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
      saveKeymap,
      updateListener,
      EditorView.lineWrapping,
    ];

    // Add fold gutter if enabled (T424)
    if (showFoldGutter) {
      extensions.push(foldGutter({
        closedText: '▶',
        openText: '▼',
      }));
    }

    // Read-only mode (Phase 16)
    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
      extensions.push(EditorView.editable.of(false));
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Add event listeners for Go to Definition
    const editorDom = editorRef.current;
    editorDom?.addEventListener('click', handleEditorClick);
    editorDom?.addEventListener('keydown', handleKeyDown);

    return () => {
      editorDom?.removeEventListener('click', handleEditorClick);
      editorDom?.removeEventListener('keydown', handleKeyDown);
      view.destroy();
      viewRef.current = null;
    };
  }, [language, handleEditorClick, handleKeyDown, showFoldGutter, readOnly]); // Recreate editor when language, fold gutter, or readOnly changes

  // Update content when it changes externally
  useEffect(() => {
    if (viewRef.current && viewRef.current.state.doc.toString() !== content) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: content,
        },
      });
    }
  }, [content]);

  return (
    <div className={`h-full flex overflow-hidden ${className}`}>
      <div
        ref={editorRef}
        className="flex-1 h-full overflow-hidden"
        style={{ backgroundColor: 'var(--background)' }}
      />
      {showMinimap && (
        <Minimap
          content={content}
          viewportTop={viewportTop}
          viewportHeight={viewportHeight}
          totalLines={totalLines}
          onScroll={handleMinimapScroll}
        />
      )}
    </div>
  );
}
