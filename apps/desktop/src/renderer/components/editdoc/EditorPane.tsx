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
import { syntaxHighlighting, defaultHighlightStyle, foldGutter, foldKeymap, bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
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

// Resolve a CSS variable to a usable color string (handles HSL values, hsl(), rgb(), hex)
function resolveCSSColor(styles: CSSStyleDeclaration, varName: string, fallback: string): string {
  const raw = styles.getPropertyValue(varName).trim();
  if (!raw) return fallback;
  // Already a full color function or hex
  if (raw.startsWith('hsl(') || raw.startsWith('rgb(') || raw.startsWith('#')) return raw;
  // Raw HSL values like "220 13% 10%" — wrap in hsl()
  return `hsl(${raw})`;
}

// Minimap component (T425 — rewritten with DPI scaling, ResizeObserver, drag-to-scroll)
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
  const [containerHeight, setContainerHeight] = useState(300);
  const isDraggingRef = useRef(false);

  // Track container height with ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Draw minimap with DPI-aware canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || containerHeight <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = 76;
    const cssHeight = containerHeight;

    // Set backing store size (sharp on HiDPI)
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    // Set CSS display size
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    // Scale context so drawing uses CSS pixels
    ctx.scale(dpr, dpr);

    // Resolve CSS colors robustly
    const styles = getComputedStyle(document.documentElement);
    const bgColor = resolveCSSColor(styles, '--card', 'hsl(0 0% 12%)');
    const lineColor = resolveCSSColor(styles, '--muted-foreground', 'hsl(0 0% 50%)');
    const vpFill = resolveCSSColor(styles, '--primary', 'hsl(210 100% 50%)');

    const lines = content.split('\n');
    // Scale line height so content fits vertically in container
    const minLineH = 1.5;
    const maxLineH = 3;
    const lineHeight = Math.max(minLineH, Math.min(maxLineH, cssHeight / Math.max(lines.length, 1)));

    // Clear canvas
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Draw line representations
    lines.forEach((line, i) => {
      const y = i * lineHeight;
      if (y > cssHeight) return; // clip beyond visible area
      const trimmed = line.trimStart();
      const indent = line.length - trimmed.length;
      const lineWidth = Math.min(trimmed.length * 0.8, cssWidth - 4);
      if (lineWidth > 0) {
        // Tint keywords/comments differently for slight syntax awareness
        const opacity = trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*') ? 0.15 : 0.35;
        ctx.globalAlpha = opacity;
        ctx.fillStyle = lineColor;
        ctx.fillRect(2 + indent * 0.8, y, lineWidth, Math.max(lineHeight - 0.5, 1));
      }
    });
    ctx.globalAlpha = 1;

    // Draw viewport indicator
    const contentRenderHeight = lines.length * lineHeight;
    const scale = contentRenderHeight > 0 ? Math.min(cssHeight / contentRenderHeight, 1) : 1;
    const vpTop = viewportTop * lineHeight * scale;
    const vpH = Math.max(viewportHeight * lineHeight * scale, 16);
    ctx.fillStyle = vpFill;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(0, vpTop, cssWidth, vpH);
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = vpFill;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, vpTop + 0.5, cssWidth - 1, vpH - 1);
    ctx.globalAlpha = 1;
  }, [content, viewportTop, viewportHeight, totalLines, containerHeight]);

  // Compute clicked line from mouse Y position
  const lineFromMouseY = useCallback((clientY: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    const ratio = y / rect.height;
    return Math.floor(ratio * totalLines);
  }, [totalLines]);

  // Click-to-jump
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    onScroll(lineFromMouseY(e.clientY));
  }, [onScroll, lineFromMouseY]);

  // Drag-to-scroll
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      onScroll(lineFromMouseY(e.clientY));
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onScroll, lineFromMouseY]);

  return (
    <div
      ref={containerRef}
      className="w-[80px] h-full border-l border-border bg-card/50 cursor-pointer overflow-hidden select-none"
      onMouseDown={handleMouseDown}
    >
      <canvas ref={canvasRef} />
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
      bracketMatching(),
      closeBrackets(),
      indentOnInput(),
      highlightSelectionMatches(),
      search(),
      getLanguageExtension(language),
      syntaxHighlighting(defaultHighlightStyle),
      oneDark,
      kuroryuuTheme,
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...closeBracketsKeymap, ...searchKeymap]),
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

    // Initialize minimap viewport state from initial geometry
    requestAnimationFrame(() => {
      if (view.scrollDOM) {
        const scrollTop = view.scrollDOM.scrollTop;
        const lineH = view.defaultLineHeight || 18;
        setViewportTop(Math.floor(scrollTop / lineH));
        setViewportHeight(Math.ceil(view.scrollDOM.clientHeight / lineH));
      }
    });

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
