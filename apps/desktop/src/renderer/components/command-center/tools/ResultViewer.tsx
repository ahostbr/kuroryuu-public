/**
 * Result Viewer
 *
 * Displays tool execution results with JSON formatting.
 */
import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Loader,
} from 'lucide-react';
import type { ToolExecution } from '../../../types/command-center';

interface ResultViewerProps {
  execution: ToolExecution | null;
}

export function ResultViewer({ execution }: ResultViewerProps) {
  const [copied, setCopied] = useState(false);

  if (!execution) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <div className="text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Execute a tool to see results here</p>
        </div>
      </div>
    );
  }

  const { status, result, error, startTime, endTime, durationMs, toolName, args } = execution;

  const handleCopy = async () => {
    const content = error || JSON.stringify(result, null, 2);
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          {status === 'running' ? (
            <Loader className="w-5 h-5 text-primary animate-spin" />
          ) : status === 'success' ? (
            <CheckCircle className="w-5 h-5 text-success" />
          ) : (
            <XCircle className="w-5 h-5 text-destructive" />
          )}

          <div>
            <h3 className="font-medium text-foreground">
              {status === 'running' ? 'Executing...' : status === 'success' ? 'Success' : 'Error'}
            </h3>
            {durationMs !== undefined && (
              <p className="text-xs text-muted-foreground">{durationMs}ms</p>
            )}
          </div>
        </div>

        {(result || error) && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-success" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {status === 'running' ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <Loader className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Executing {toolName}...</p>
            </div>
          </div>
        ) : error ? (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <pre className="text-sm text-destructive whitespace-pre-wrap break-words font-mono">
              {error}
            </pre>
          </div>
        ) : result ? (
          <JSONTree data={result} />
        ) : (
          <p className="text-sm text-muted-foreground italic">No result returned</p>
        )}
      </div>

      {/* Request Details (collapsed) */}
      <CollapsibleSection title="Request Details">
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Tool: </span>
            <span className="text-foreground font-mono">{toolName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Started: </span>
            <span className="text-foreground">{new Date(startTime).toLocaleString()}</span>
          </div>
          {endTime && (
            <div>
              <span className="text-muted-foreground">Ended: </span>
              <span className="text-foreground">{new Date(endTime).toLocaleString()}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Arguments: </span>
            <pre className="mt-1 p-2 bg-secondary rounded text-xs font-mono overflow-auto">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {title}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

interface JSONTreeProps {
  data: unknown;
  level?: number;
}

function JSONTree({ data, level = 0 }: JSONTreeProps) {
  const [expanded, setExpanded] = useState(level < 2);

  if (data === null) {
    return <span className="text-muted-foreground">null</span>;
  }

  if (data === undefined) {
    return <span className="text-muted-foreground">undefined</span>;
  }

  if (typeof data === 'boolean') {
    return <span className="text-purple-400">{data.toString()}</span>;
  }

  if (typeof data === 'number') {
    return <span className="text-amber-400">{data}</span>;
  }

  if (typeof data === 'string') {
    // Truncate long strings
    if (data.length > 200) {
      return (
        <span className="text-green-400">
          "{data.substring(0, 200)}..."
          <button
            onClick={() => navigator.clipboard.writeText(data)}
            className="ml-2 text-xs text-muted-foreground hover:text-foreground"
          >
            (copy full)
          </button>
        </span>
      );
    }
    return <span className="text-green-400">"{data}"</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-muted-foreground">[]</span>;
    }

    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
          <span className="ml-1">Array ({data.length})</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-border pl-3 mt-1 space-y-1">
            {data.map((item, index) => (
              <div key={index}>
                <span className="text-muted-foreground text-xs">{index}: </span>
                <JSONTree data={item} level={level + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return <span className="text-muted-foreground">{'{}'}</span>;
    }

    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
          <span className="ml-1">Object ({keys.length} keys)</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-border pl-3 mt-1 space-y-1">
            {keys.map((key) => (
              <div key={key}>
                <span className="text-blue-400">"{key}"</span>
                <span className="text-muted-foreground">: </span>
                <JSONTree data={(data as Record<string, unknown>)[key]} level={level + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <span className="text-foreground">{String(data)}</span>;
}

export default ResultViewer;
