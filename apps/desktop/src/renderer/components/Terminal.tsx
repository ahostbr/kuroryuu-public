import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { toast } from './ui/toast';
import { TerminalSkeleton } from './ui/loading-skeleton';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useSettingsStore } from '../stores/settings-store';
import type { TerminalFont } from '../types/settings';
import { useTerminalEvents } from '../hooks/useTerminalEvents';
import { usePtyProcess } from '../hooks/usePtyProcess';
import { fileLogger } from '../utils/file-logger';
import { readTerminalBuffer, type BufferReadMode, type BufferReadOptions, type TerminalBufferSnapshot, type TerminalBufferSnapshotWithMarker } from './terminal-buffer-utils';
import '@xterm/xterm/css/xterm.css';

// Map terminal font setting to CSS font-family
const FONT_FAMILY_MAP: Record<TerminalFont, string> = {
  'jetbrains-mono': 'JetBrains Mono, Fira Code, Consolas, monospace',
  'fira-code': 'Fira Code, JetBrains Mono, Consolas, monospace',
  'cascadia-code': 'Cascadia Code, Consolas, monospace',
  'source-code-pro': 'Source Code Pro, Consolas, monospace',
  'menlo': 'Menlo, Monaco, Consolas, monospace',
  'share-tech-mono': 'Share Tech Mono, Consolas, monospace',
  'vt323': 'VT323, Consolas, monospace',
  'ocr-a': 'OCR A Std, OCR-A, Consolas, monospace',
  'reggae-one': 'Reggae One, cursive, monospace',
};

export interface TerminalRef {
  getSelection: () => string;
  dispatchKeyEvent: (key: string, modifiers?: { shift?: boolean; ctrl?: boolean; alt?: boolean }) => void;
  readBuffer: (mode: BufferReadMode, options?: BufferReadOptions) => TerminalBufferSnapshot | TerminalBufferSnapshotWithMarker | null;
}

interface TerminalProps {
  id?: string;  // PTY ID for reconnection (optional)
  terminalId: string;  // Stable terminal component ID (required for listener)
  onReady?: (termId: string, sessionId?: string) => void;
  onTermRef?: (ref: TerminalRef | null) => void;  // Expose xterm for copy, keyboard simulation, and buffer reading
  cwd?: string;
  cliConfig?: {
    cmd?: string;
    args?: string[];
    env?: Record<string, string>;
  };
}

// Constants for dimension validation
const MIN_COLS = 10;
const MIN_ROWS = 3;

export function Terminal({ id: initialId, terminalId, onReady, onTermRef, cwd, cliConfig }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initStartedRef = useRef(false); // Prevent double initialization
  const onTermRefRef = useRef(onTermRef); // Store callback ref to avoid cleanup dep issues
  const [termId, setTermId] = useState<string | null>(initialId ?? null);

  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [initAttempts, setInitAttempts] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // Dimension readiness state (for skipCreation gate)
  const [readyDimensions, setReadyDimensions] = useState<{cols: number, rows: number} | null>(null);

  // Get font settings from store
  const terminalFont = useSettingsStore((s) => s.appSettings.terminalFont);
  const terminalFontSize = useSettingsStore((s) => s.appSettings.terminalFontSize);
  const theme = useSettingsStore((s) => s.appSettings.theme);

  // Log mount/unmount for debugging terminal lifecycle (using ref to avoid stale closure)
  const termIdRef = useRef(termId);
  termIdRef.current = termId;

  // Safe fit wrapper - validates container and handles errors
  const safeFit = useCallback(() => {
    if (!containerRef.current || !fitAddonRef.current || !termRef.current) {
      return false;
    }
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }
    try {
      fitAddonRef.current.fit();
      return true;
    } catch (e) {
      console.warn('[Terminal] Fit failed:', e);
      return false;
    }
  }, []);

  // Log mount/unmount for lifecycle debugging (runs once)
  useEffect(() => {
    fileLogger.log('Terminal', 'Component mounted', { terminalId, initialPtyId: initialId });
    return () => {
      fileLogger.log('Terminal', 'Component unmounted', { terminalId });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = mount/unmount only

  // Keep onTermRefRef synced (but don't put in deps - causes cleanup loops)
  useEffect(() => {
    onTermRefRef.current = onTermRef;
  }, [onTermRef]);

  // Compute validated dimensions (useMemo to avoid recreating on every render)
  const ptyDimensions = useMemo(() => {
    if (readyDimensions) return readyDimensions;

    // Fallback to current dimensions if valid
    if (termRef.current) {
      const { cols, rows } = termRef.current;
      if (cols >= MIN_COLS && rows >= MIN_ROWS) {
        return { cols, rows };
      }
    }

    return null;  // Not ready yet
  }, [readyDimensions]);

  // PTY lifecycle hook (waits for dimensions via skipCreation)
  const { prepareForRecreate, resetForRecreate } = usePtyProcess({
    terminalId: termId ?? 'temp',  // Use PTY ID once set, temp placeholder initially
    cwd,
    cols: ptyDimensions?.cols ?? 80,
    rows: ptyDimensions?.rows ?? 24,
    cliConfig,
    skipCreation: !ptyDimensions,  // Don't create until dimensions ready
    initialPtyId: initialId,  // For reconnection
    onCreated: (ptyId, sessionId) => {
      setTermId(ptyId);
      setIsConnecting(false);
      setError(null);
      onReady?.(ptyId, sessionId);
    },
    onError: (errorMsg) => {
      setError(errorMsg);
      setIsConnecting(false);
      toast.error(`Terminal failed: ${errorMsg}`);
    },
  });

  // Memoized callbacks for useTerminalEvents (prevents listener re-attachment spam)
  const handleOutput = useCallback((data: string) => {
    if (termRef.current?.element) {
      termRef.current.write(data);
    }
  }, []);

  const handleExit = useCallback((exitCode: number) => {
    termRef.current?.write(`\r\n[Process exited with code ${exitCode}]\r\n`);
  }, []);

  // Data listener hook - only attach when xterm is initialized AND termId is set
  useTerminalEvents({
    terminalId: initialized ? termId : null,
    onOutput: handleOutput,
    onExit: handleExit,
  });

  useEffect(() => {
    return () => {
      // Cleanup on unmount
    };
  }, []); // Empty deps - only on mount/unmount

  // Initialize terminal only when container is visible and has dimensions
  const initTerminal = useCallback(() => {
    // Prevent double initialization (ref check is synchronous, state is async)
    if (!containerRef.current || initialized || initStartedRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    // Need both width AND height > 0 for xterm to work properly
    if (rect.width < 10 || rect.height < 10) {
      setInitAttempts(prev => prev + 1);
      return;
    }

    // Mark as started BEFORE async operations
    initStartedRef.current = true;

    // Get theme-specific colors
    const isMatrixTheme = theme === 'matrix';
    const termTheme = isMatrixTheme
      ? {
          background: '#0D0208',
          foreground: '#00FF41',
          cursor: '#00FF41',
          cursorAccent: '#0D0208',
          selectionBackground: '#00FF4140',
        }
      : {
          background: '#0a0a0b',
          foreground: '#fafafa',
          cursor: '#facc15',
          cursorAccent: '#0a0a0b',
          selectionBackground: '#facc1540',
        };

    const term = new XTerm({
      cursorBlink: true,
      fontSize: terminalFontSize,
      fontFamily: FONT_FAMILY_MAP[terminalFont] || FONT_FAMILY_MAP['jetbrains-mono'],
      theme: termTheme,
      allowProposedApi: true // Required for clipboard operations
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Defer open to next frame to ensure container is fully painted
    // This prevents the viewport dimensions race condition
    requestAnimationFrame(() => {
      if (!containerRef.current) {
        term.dispose();
        initStartedRef.current = false; // Allow retry
        setInitAttempts(prev => prev + 1);
        return;
      }

      try {
        term.open(containerRef.current);
      } catch (e) {
        console.warn('[Terminal] Failed to open, will retry:', e);
        term.dispose();
        initStartedRef.current = false; // Allow retry
        setInitAttempts(prev => prev + 1);
        return;
      }

      // Store refs and mark initialized after successful open
      termRef.current = term;
      fitAddonRef.current = fitAddon;
      setInitialized(true);

      // Expose terminal ref for copy operations, keyboard simulation, and buffer reading
      onTermRefRef.current?.({
        getSelection: () => term.getSelection(),
        dispatchKeyEvent: (key: string, modifiers?: { shift?: boolean; ctrl?: boolean; alt?: boolean }) => {
          if (term.textarea) {
            const event = new KeyboardEvent('keydown', {
              key,
              code: key === 'Tab' ? 'Tab' : `Key${key.toUpperCase()}`,
              keyCode: key === 'Tab' ? 9 : key.charCodeAt(0),
              shiftKey: modifiers?.shift ?? false,
              ctrlKey: modifiers?.ctrl ?? false,
              altKey: modifiers?.alt ?? false,
              bubbles: true,
              cancelable: true,
            });
            console.log('[Terminal] Dispatching synthetic KeyboardEvent:', { key, modifiers });
            term.textarea.dispatchEvent(event);
          }
        },
        readBuffer: (mode: BufferReadMode, options?: BufferReadOptions) => {
          if (!term) return null;
          return readTerminalBuffer(term, mode, options);
        },
      });

      // Double-RAF to ensure xterm's internal viewport is ready before fit
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();

          // Signal dimensions are ready (triggers PTY creation via usePtyProcess)
          if (term.cols >= MIN_COLS && term.rows >= MIN_ROWS) {
            console.log('[Terminal] Dimensions ready:', { cols: term.cols, rows: term.rows });
            setReadyDimensions({ cols: term.cols, rows: term.rows });
          } else {
            console.warn('[Terminal] Invalid dimensions after fit:', { cols: term.cols, rows: term.rows });
          }
        } catch (e) {
          console.warn('[Terminal] Fit failed:', e);
        }
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Other deps handled by usePtyProcess
  }, [initialized]);

  // Initialization effect - try to init terminal
  useEffect(() => {
    if (initialized) return; // Already done

    // Try to initialize immediately
    initTerminal();

    // Also try on next frame in case container isn't ready yet
    const frame = requestAnimationFrame(initTerminal);

    // Keep retrying until initialized (handles lazy-loaded containers)
    const retryInterval = setInterval(() => {
      if (!initStartedRef.current) {
        initTerminal();
      }
    }, 100); // Retry every 100ms

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(retryInterval);
    };
  }, [initTerminal, initialized]);

  // Update terminal font when settings change (reactive to App Settings)
  useEffect(() => {
    if (termRef.current && initialized) {
      termRef.current.options.fontSize = terminalFontSize;
      termRef.current.options.fontFamily = FONT_FAMILY_MAP[terminalFont] || FONT_FAMILY_MAP['jetbrains-mono'];
      safeFit(); // Use safeFit to handle dimension edge cases
    }
  }, [terminalFontSize, terminalFont, initialized, safeFit]);

  // Cleanup effect - only on actual unmount (empty deps prevents re-run on parent re-render)
  useEffect(() => {
    return () => {
      onTermRefRef.current?.(null);  // Clear ref on unmount
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, []);  // Empty deps = only runs on true unmount

  // Force a refit after initialization to fix black screen on initial render
  useEffect(() => {
    if (!initialized || !fitAddonRef.current) return;
    
    // Multiple fit attempts to handle race conditions
    // Also sync PTY dimensions (critical for pre-existing PTYs where termId is set on mount)
    const doFit = () => {
      try {
        fitAddonRef.current?.fit();
        const currentTermId = termIdRef.current;
        if (currentTermId && termRef.current) {
          window.electronAPI.pty.resize(currentTermId, termRef.current.cols, termRef.current.rows);
        }
      } catch (e) {
        // Ignore fit errors during initialization
      }
    };
    
    const timers = [
      setTimeout(doFit, 50),
      setTimeout(doFit, 150),
      setTimeout(doFit, 300),
    ];
    
    return () => timers.forEach(t => clearTimeout(t));
  }, [initialized]);

  // Sync resize to PTY when termId available
  useEffect(() => {
    if (!termRef.current || !termId || !fitAddonRef.current) return;

    const term = termRef.current;

    // Fit immediately when PTY connects - this ensures content renders
    // Use safeFit to handle cases where container dimensions are not ready
    if (safeFit()) {
      window.electronAPI.pty.resize(termId, term.cols, term.rows);
    }

    // Debounce resize to avoid excessive IPC calls during window resize
    let resizeTimer: NodeJS.Timeout | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Use ref to get CURRENT termId (avoids stale closure after navigation)
        const currentTermId = termIdRef.current;
        if (!currentTermId || !termRef.current) return;

        // Use safeFit to handle container dimension edge cases
        if (safeFit()) {
          window.electronAPI.pty.resize(currentTermId, termRef.current.cols, termRef.current.rows);
        }
      }, 50); // 50ms debounce
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
    };
  // Depends on [termId, safeFit, initialized] because when initialId is pre-set,
  // termId never changes, so we need initialized to trigger re-run after xterm opens.
  // Without this, ResizeObserver never attaches and pty.resize() never fires for pre-existing PTYs.
  }, [termId, safeFit, initialized]);

  // Handle input - uses ref to avoid stale closure after navigation
  // Depends on [termId, initialized] because when initialId is pre-set,
  // termId never changes, so we need initialized to trigger re-run after xterm opens
  useEffect(() => {
    if (!termRef.current || !termId) return;

    const disposable = termRef.current.onData((data) => {
      // Use ref to get CURRENT termId (avoids stale closure after navigation)
      const currentTermId = termIdRef.current;
      if (currentTermId) {
        window.electronAPI.pty.write(currentTermId, data);
      }
    });

    return () => disposable.dispose();
  }, [termId, initialized]);

  // Handle keyboard shortcuts: copy (Ctrl+C), paste (Ctrl+V), and special keys (Shift+Tab)
  // Depends on [termId, initialized] for same reason as onData effect above
  useEffect(() => {
    if (!termRef.current || !termId) return;

    const term = termRef.current;

    // Custom key handler for clipboard operations and special keys
    term.attachCustomKeyEventHandler((event) => {
      // Only handle keydown events (ignore keyup to prevent double-firing)
      if (event.type !== 'keydown') return true;

      // Shift+Tab: handled by document capture listener (writes CSI Z to PTY)
      // Return false so xterm doesn't also process it
      if (event.shiftKey && event.key === 'Tab') {
        return false;
      }

      // Ctrl+C with selection = copy to clipboard
      if (event.ctrlKey && (event.key === 'c' || event.key === 'C')) {
        const selection = term.getSelection();
        if (selection) {
          event.preventDefault();
          navigator.clipboard.writeText(selection);
          return false;
        }
        // No selection, let ^C pass through to terminal for SIGINT
        return true;
      }

      // Ctrl+V = paste from clipboard (handle ourselves to prevent duplication)
      if (event.ctrlKey && (event.key === 'v' || event.key === 'V')) {
        event.preventDefault();
        navigator.clipboard.readText().then((text) => {
          // Use ref to get CURRENT termId (avoids stale closure after navigation)
          const currentTermId = termIdRef.current;
          if (text && currentTermId) {
            window.electronAPI.pty.write(currentTermId, text);
          }
        }).catch(() => {
          // Clipboard read failed - silently ignore
        });
        return false;
      }

      return true; // Let all other keys pass through to xterm
    });
  }, [termId, initialized]);

  // Document-level capture listener for Shift+Tab
  // Chromium captures Shift+Tab for focus navigation before xterm can see it
  // We intercept at capture phase, kill the browser behavior, and forward to PTY
  useEffect(() => {
    if (!termId) return;

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Only handle if terminal container has focus
      if (!containerRef.current?.contains(document.activeElement)) return;

      if (event.shiftKey && event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        // Forward Shift+Tab escape sequence (CSI Z) directly to PTY
        const currentTermId = termIdRef.current;
        if (currentTermId) {
          window.electronAPI.pty.write(currentTermId, '\x1b[Z');
        }
      }
    };

    // Capture phase runs before bubble phase, before browser focus handling
    document.addEventListener('keydown', handleGlobalKeyDown, { capture: true });

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
    };
  }, [termId]);

  // Fetch buffered data when termId is set AND xterm is initialized
  // Both conditions must be true - adding `initialized` ensures we retry when xterm becomes ready
  useEffect(() => {
    if (!termId || !termRef.current || !initialized) return;

    fileLogger.log('Terminal', 'Fetching buffered data', { terminalId, ptyId: termId });

    // Fetch any buffered data that arrived before we had termId
    window.electronAPI.pty.getBufferedData(termId).then((bufferedData) => {
      fileLogger.log('Terminal', 'Received buffered data', { terminalId, ptyId: termId, dataLength: bufferedData?.length || 0 });
      if (bufferedData && termRef.current?.element) {
        fileLogger.log('Terminal', 'Writing buffered data to xterm', { terminalId, ptyId: termId, dataLength: bufferedData.length });
        termRef.current.write(bufferedData);
      } else if (bufferedData && !termRef.current?.element) {
        // Only warn if we have data but terminal isn't ready (actual issue)
        fileLogger.warn('Terminal', 'Buffered data available but xterm not ready', { terminalId, ptyId: termId, dataLength: bufferedData.length });
      }
      // No data and terminal not ready is normal - don't log
    }).catch(err => {
      fileLogger.error('Terminal', 'Failed to fetch buffered data', { terminalId, ptyId: termId, error: err instanceof Error ? err.message : String(err) });
    });
  }, [termId, initialized]);  // Re-run when xterm becomes ready

  // Retry handler for error state
  const handleRetry = useCallback(() => {
    setError(null);
    setIsConnecting(true);
    setInitialized(false);
    initStartedRef.current = false; // Allow retry
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }
    // Reinitialize on next frame
    requestAnimationFrame(initTerminal);
  }, [initTerminal]);

  // ============================================
  // PERSISTENCE: Serialize xterm buffer for recovery
  // ============================================
  const serializeBuffer = useCallback((): string => {
    if (!termRef.current) return '';

    try {
      const buffer = termRef.current.buffer.active;
      const lines: string[] = [];

      // Get the full scrollback + visible buffer
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          lines.push(line.translateToString());
        }
      }

      return lines.join('\n');
    } catch (err) {
      console.warn('[Terminal] Buffer serialization failed:', err);
      return '';
    }
  }, []);

  // Periodic buffer save (every 5 seconds when terminal has content)
  useEffect(() => {
    if (!termId || !initialized) return;

    const saveBuffer = async () => {
      const content = serializeBuffer();
      if (content && content.length > 0) {
        try {
          await window.electronAPI?.pty?.saveBuffer?.(termId, content);
        } catch (err) {
          // Silently ignore save errors - non-critical
        }
      }
    };

    // Save immediately on mount
    saveBuffer();

    // Then save periodically
    const interval = setInterval(saveBuffer, 5000); // 5 seconds

    // Save on unmount
    return () => {
      clearInterval(interval);
      // Final save before unmount
      saveBuffer();
    };
  }, [termId, initialized, serializeBuffer]);

  // Drag-and-drop handlers for file path insertion
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Check if dragging files (OS) or text/plain (internal file explorer)
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/plain')) {
      setIsDragOver(true);
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!termId) return;

    // First try to get text/plain data (from internal file explorer)
    const textData = e.dataTransfer.getData('text/plain');
    if (textData) {
      // Quote path if it contains spaces
      const path = textData.includes(' ') ? `"${textData}"` : textData;
      window.electronAPI.pty.write(termId, path);
      return;
    }

    // Fallback: Get dropped files from OS file manager
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // Build path string - quote paths with spaces, join multiple with spaces
      // In Electron, dropped files have a 'path' property added to the File interface
      const paths = files.map(file => {
        const filePath = (file as File & { path: string }).path;
        // Quote path if it contains spaces
        return filePath.includes(' ') ? `"${filePath}"` : filePath;
      }).join(' ');

      // Write the path(s) to the terminal
      window.electronAPI.pty.write(termId, paths);
    }
  }, [termId]);

  // Always render container so it gets dimensions, overlay loading/error states
  return (
    <div
      className="w-full h-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* The actual terminal container - always rendered to get dimensions */}
      <div
        ref={containerRef}
        className={`w-full h-full bg-background rounded-lg overflow-auto ${
          error ? 'invisible' : ''
        }`}
        style={{ scrollbarWidth: 'thin' }}
      />

      {/* Drag-and-drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary/50 rounded-lg flex items-center justify-center pointer-events-none z-20">
          <div className="bg-card/90 px-4 py-2 rounded-lg text-sm text-primary font-medium">
            Drop to paste file path
          </div>
        </div>
      )}
      
      {/* Loading overlay */}
      {isConnecting && !initialized && (
        <div className="absolute inset-0">
          {initAttempts > 20 ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-background rounded-lg p-4">
              <div className="text-xs text-muted-foreground text-center">
                Waiting for terminal initialization...
                <br />
                <span className="text-muted-foreground">({initAttempts} attempts)</span>
              </div>
            </div>
          ) : (
            <TerminalSkeleton />
          )}
        </div>
      )}
      
      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background rounded-lg">
          <AlertCircle className="w-10 h-10 text-red-500" />
          <div className="text-center">
            <p className="text-sm text-foreground font-medium">Terminal failed to start</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">{error}</p>
          </div>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-muted text-foreground rounded text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
