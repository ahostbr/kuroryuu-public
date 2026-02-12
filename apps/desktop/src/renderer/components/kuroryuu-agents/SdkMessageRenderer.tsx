/**
 * SdkMessageRenderer - Renders SDK messages as structured cards
 * Shows assistant text, tool calls, results, and system messages
 */
import { useState, useEffect, useRef } from 'react';
import {
  Wrench,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  DollarSign,
  Clock,
  Cpu,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { useKuroryuuAgentsStore } from '../../stores/kuroryuu-agents-store';
import type { SerializedSDKMessage } from '../../types/sdk-agent';

interface SdkMessageRendererProps {
  sessionId: string;
  autoScroll?: boolean;
}

export function SdkMessageRenderer({ sessionId, autoScroll = true }: SdkMessageRendererProps) {
  const [messages, setMessages] = useState<SerializedSDKMessage[]>([]);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const { getMessages } = useKuroryuuAgentsStore();

  // Load messages and poll for updates
  useEffect(() => {
    let mounted = true;

    const fetchMessages = async () => {
      const msgs = await getMessages(sessionId, 0, 500);
      if (mounted) setMessages(msgs);
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [sessionId, getMessages]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const toggleTool = (id: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Waiting for messages...
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-auto p-4 space-y-3">
      {messages.map((msg) => {
        // Assistant text
        if (msg.type === 'assistant' && msg.text) {
          return (
            <div key={msg.uuid} className="flex gap-2">
              <MessageSquare className="w-4 h-4 text-primary flex-shrink-0 mt-1" />
              <div className="text-sm whitespace-pre-wrap break-words">{msg.text}</div>
            </div>
          );
        }

        // Tool use
        if (msg.type === 'assistant' && msg.toolUse) {
          const isExpanded = expandedTools.has(msg.toolUse.id);
          return (
            <div key={msg.uuid} className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleTool(msg.toolUse!.id)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary transition-colors text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
                <Wrench className="w-4 h-4 text-blue-400" />
                <span className="font-mono text-xs text-blue-400">{msg.toolUse.name}</span>
              </button>
              {isExpanded && (
                <pre className="p-3 text-xs font-mono overflow-auto max-h-60 bg-background/50">
                  {JSON.stringify(msg.toolUse.input, null, 2)}
                </pre>
              )}
            </div>
          );
        }

        // Tool result
        if (msg.type === 'user' && msg.toolResult) {
          const isExpanded = expandedTools.has(msg.toolResult.toolUseId);
          return (
            <div key={msg.uuid} className={`border rounded-lg overflow-hidden ${
              msg.toolResult.isError ? 'border-red-500/30' : 'border-green-500/30'
            }`}>
              <button
                onClick={() => toggleTool(msg.toolResult!.toolUseId)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
                {msg.toolResult.isError ? (
                  <XCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                )}
                <span className="text-xs text-muted-foreground">
                  {msg.toolResult.isError ? 'Error' : 'Result'}
                </span>
              </button>
              {isExpanded && (
                <pre className="p-3 text-xs font-mono overflow-auto max-h-60 bg-background/50 whitespace-pre-wrap">
                  {typeof msg.toolResult.output === 'string'
                    ? msg.toolResult.output
                    : JSON.stringify(msg.toolResult.output, null, 2)}
                </pre>
              )}
            </div>
          );
        }

        // Result summary
        if (msg.type === 'result' && msg.result) {
          const r = msg.result;
          return (
            <div key={msg.uuid} className={`border rounded-lg p-4 ${
              r.isError ? 'border-red-500/30 bg-red-500/5' : 'border-green-500/30 bg-green-500/5'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {r.isError ? (
                  <XCircle className="w-5 h-5 text-red-400" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                )}
                <span className="font-medium text-sm">
                  {r.isError ? 'Failed' : 'Completed'}
                </span>
              </div>
              {r.result && (
                <div className="text-sm mb-3 whitespace-pre-wrap break-words">{r.result}</div>
              )}
              {r.errors && r.errors.length > 0 && (
                <div className="text-sm text-red-400 mb-3">
                  {r.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  ${r.totalCostUsd.toFixed(4)}
                </span>
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  {r.numTurns} turns
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {(r.durationMs / 1000).toFixed(1)}s
                </span>
                <span>
                  {r.usage.inputTokens.toLocaleString()}in / {r.usage.outputTokens.toLocaleString()}out
                </span>
              </div>
            </div>
          );
        }

        // System / init
        if (msg.type === 'system' && msg.init) {
          return (
            <div key={msg.uuid} className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="w-3 h-3" />
                <span className="font-medium">Session initialized</span>
              </div>
              <div>Model: {msg.init.model} | Tools: {msg.init.tools.length} | Mode: {msg.init.permissionMode}</div>
            </div>
          );
        }

        // Tool progress
        if (msg.type === 'tool_progress' && msg.toolProgress) {
          return (
            <div key={msg.uuid} className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="font-mono">{msg.toolProgress.toolName}</span>
              <span>({msg.toolProgress.elapsedSeconds}s)</span>
            </div>
          );
        }

        // Streaming text delta
        if (msg.textDelta) {
          return (
            <span key={msg.uuid} className="text-sm">{msg.textDelta}</span>
          );
        }

        return null;
      })}
    </div>
  );
}
