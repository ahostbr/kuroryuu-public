/**
 * ToolCallCard - Visual display for tool calls in AI chat
 *
 * Shows tool name, arguments, execution status, and results
 * with expandable details and syntax highlighting.
 */

import { useState, memo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';

export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error';

export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
}

interface ToolCallCardProps {
  toolCall: ToolCallData;
  compact?: boolean;
}

// Status badge component
function StatusBadge({ status }: { status: ToolCallStatus }) {
  const config = {
    pending: { icon: Loader2, class: 'text-muted-foreground bg-muted', animate: false },
    running: { icon: Loader2, class: 'text-primary bg-primary/20', animate: true },
    success: { icon: CheckCircle2, class: 'text-green-500 bg-green-500/20', animate: false },
    error: { icon: XCircle, class: 'text-red-500 bg-red-500/20', animate: false },
  }[status];

  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.class}`}>
      <Icon className={`w-3 h-3 ${config.animate ? 'animate-spin' : ''}`} />
      {status}
    </span>
  );
}

// JSON syntax highlighter (simple version)
function JsonHighlight({ data, maxLines = 10 }: { data: unknown; maxLines?: number }) {
  const [copied, setCopied] = useState(false);

  let jsonString: string;
  try {
    jsonString = JSON.stringify(data, null, 2);
  } catch {
    jsonString = String(data);
  }

  const lines = jsonString.split('\n');
  const truncated = lines.length > maxLines;
  const displayLines = truncated ? lines.slice(0, maxLines) : lines;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Simple syntax highlighting
  const highlightLine = (line: string) => {
    // Highlight keys
    return line.replace(
      /"([^"]+)":/g,
      '<span class="text-cyan-400">"$1"</span>:'
    ).replace(
      /: "([^"]*)"/g,
      ': <span class="text-green-400">"$1"</span>'
    ).replace(
      /: (true|false|null)/g,
      ': <span class="text-purple-400">$1</span>'
    ).replace(
      /: (\d+\.?\d*)/g,
      ': <span class="text-yellow-400">$1</span>'
    );
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-1 right-1 p-1 rounded bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy JSON"
      >
        {copied ? (
          <Check className="w-3 h-3 text-green-500" />
        ) : (
          <Copy className="w-3 h-3 text-muted-foreground" />
        )}
      </button>
      <pre className="text-[11px] leading-relaxed overflow-x-auto">
        {displayLines.map((line, i) => (
          <div
            key={i}
            className="hover:bg-white/5"
            dangerouslySetInnerHTML={{ __html: highlightLine(line) }}
          />
        ))}
        {truncated && (
          <div className="text-muted-foreground italic">
            ... {lines.length - maxLines} more lines
          </div>
        )}
      </pre>
    </div>
  );
}

// Tool name badge with icon
function ToolNameBadge({ name }: { name: string }) {
  // Map common tool prefixes to colors
  const getToolColor = (toolName: string) => {
    if (toolName.startsWith('k_rag')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (toolName.startsWith('k_repo')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    if (toolName.startsWith('k_checkpoint')) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (toolName.startsWith('k_inbox')) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (toolName.startsWith('k_session')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    if (toolName.startsWith('k_files')) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    if (toolName.startsWith('k_memory')) return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
    if (toolName.startsWith('mcp__')) return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
    return 'bg-muted text-muted-foreground border-border';
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono border ${getToolColor(name)}`}>
      <Wrench className="w-3 h-3" />
      {name}
    </span>
  );
}

// Main ToolCallCard component
export const ToolCallCard = memo(function ToolCallCard({ toolCall, compact = false }: ToolCallCardProps) {
  const [isArgsExpanded, setIsArgsExpanded] = useState(!compact);
  const [isResultExpanded, setIsResultExpanded] = useState(false);

  const hasResult = toolCall.result !== undefined || toolCall.error !== undefined;
  const duration = toolCall.startTime && toolCall.endTime
    ? toolCall.endTime - toolCall.startTime
    : null;

  return (
    <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2">
          <ToolNameBadge name={toolCall.name} />
          <StatusBadge status={toolCall.status} />
        </div>
        {duration !== null && (
          <span className="text-[10px] text-muted-foreground">
            {duration}ms
          </span>
        )}
      </div>

      {/* Arguments section */}
      <div className="border-b border-border">
        <button
          onClick={() => setIsArgsExpanded(!isArgsExpanded)}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {isArgsExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          Arguments
          {!isArgsExpanded && Object.keys(toolCall.arguments).length > 0 && (
            <span className="text-[10px] opacity-60">
              ({Object.keys(toolCall.arguments).length} params)
            </span>
          )}
        </button>

        {isArgsExpanded && (
          <div className="px-3 pb-2">
            {Object.keys(toolCall.arguments).length > 0 ? (
              <JsonHighlight data={toolCall.arguments} maxLines={8} />
            ) : (
              <span className="text-xs text-muted-foreground italic">No arguments</span>
            )}
          </div>
        )}
      </div>

      {/* Result section */}
      {hasResult && (
        <div>
          <button
            onClick={() => setIsResultExpanded(!isResultExpanded)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isResultExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            {toolCall.error ? 'Error' : 'Result'}
          </button>

          {isResultExpanded && (
            <div className="px-3 pb-2">
              {toolCall.error ? (
                <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1.5">
                  {toolCall.error}
                </div>
              ) : (
                <JsonHighlight data={toolCall.result} maxLines={15} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Running indicator */}
      {toolCall.status === 'running' && (
        <div className="px-3 py-2 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-primary">
            <Loader2 className="w-3 h-3 animate-spin" />
            Executing...
          </div>
        </div>
      )}
    </div>
  );
});

// Compact inline version for message bubbles
export function ToolCallInline({ toolCall }: { toolCall: ToolCallData }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <ToolNameBadge name={toolCall.name} />
      <StatusBadge status={toolCall.status} />
    </div>
  );
}

export default ToolCallCard;
