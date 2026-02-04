/**
 * SessionLogViewer - Real-time log viewer for a coding agent session
 * Uses WebSocket streaming for live output when session is running
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Send, ArrowDown, Trash2, X, Radio, Terminal, FolderOpen, Clock } from 'lucide-react';
import { useCodingAgentsStore, type CodingAgentSession } from '../../stores/coding-agents-store';
import { useBashOutputStream } from '../../hooks/useBashOutputStream';

interface SessionLogViewerProps {
  session: CodingAgentSession;
  onKill: () => void;
  onClose: () => void;
}

export function SessionLogViewer({ session, onKill, onClose }: SessionLogViewerProps) {
  const [log, setLog] = useState('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { getSessionLog, sendInput } = useCodingAgentsStore();

  // Real-time streaming hook - only active when session is running
  const {
    output: streamOutput,
    isConnected: streamConnected,
  } = useBashOutputStream(session.running ? session.id : null);

  // Combine polled log with streaming output
  const displayLog = session.running && streamOutput
    ? streamOutput  // When streaming, prefer stream output (more real-time)
    : log;          // When not running, use polled log

  // Fetch log
  const fetchLog = useCallback(async () => {
    setIsLoading(true);
    try {
      const output = await getSessionLog(session.id, 0, 2000);
      setLog(output);
    } finally {
      setIsLoading(false);
    }
  }, [session.id, getSessionLog]);

  // Initial fetch and polling
  useEffect(() => {
    fetchLog();

    // Poll every 2s if session is running
    if (session.running) {
      pollIntervalRef.current = setInterval(fetchLog, 2000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [session.id, session.running, fetchLog]);

  // Auto-scroll to bottom (triggered by both polled log and stream output)
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [displayLog, autoScroll]);

  // Handle scroll - disable auto-scroll if user scrolls up
  const handleScroll = () => {
    if (!logRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  // Send input
  const handleSendInput = async () => {
    if (!input.trim()) return;
    const success = await sendInput(session.id, input);
    if (success) {
      setInput('');
      // Fetch log immediately to see the input effect
      setTimeout(fetchLog, 500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendInput();
    }
  };

  // Format time helper
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString();
    } catch {
      return isoString;
    }
  };

  return (
    <div className="h-full flex flex-col bg-card rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-primary">{session.id}</span>
          {session.running ? (
            <>
              <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs">
                Running
              </span>
              {streamConnected && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs">
                  <Radio className="w-3 h-3 animate-pulse" />
                  LIVE
                </span>
              )}
            </>
          ) : (
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              session.exit_code === 0
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              Exit {session.exit_code}
            </span>
          )}
          {session.pty && (
            <span className="px-2 py-0.5 rounded bg-secondary text-xs text-muted-foreground">
              PTY
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLog}
            disabled={isLoading}
            className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                if (logRef.current) {
                  logRef.current.scrollTop = logRef.current.scrollHeight;
                }
              }}
              className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              title="Scroll to bottom"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          )}
          {session.running && (
            <button
              onClick={onKill}
              className="p-1.5 rounded hover:bg-red-500/20 transition-colors text-red-400"
              title="Kill session"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Session Metadata */}
      <div className="px-4 py-2 bg-secondary/30 border-b border-border space-y-1">
        <div className="flex items-start gap-2">
          <Terminal className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <code className="text-xs text-foreground break-all">{session.command}</code>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1" title={session.workdir}>
            <FolderOpen className="w-3 h-3" />
            {session.workdir}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(session.started_at)}
          </span>
          <span className="ml-auto">{session.output_lines} lines</span>
        </div>
      </div>

      {/* Log output */}
      <pre
        ref={logRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-4 font-mono text-xs text-foreground/90 bg-background/50 whitespace-pre-wrap"
      >
        {displayLog || (
          <span className="text-muted-foreground italic">No output yet...</span>
        )}
      </pre>

      {/* Input (only if running and PTY) */}
      {session.running && session.pty && (
        <div className="flex items-center gap-2 p-2 border-t border-border">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send input to session..."
            className="flex-1 px-3 py-2 rounded bg-secondary border border-border text-sm focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleSendInput}
            disabled={!input.trim()}
            className="p-2 rounded bg-primary text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
