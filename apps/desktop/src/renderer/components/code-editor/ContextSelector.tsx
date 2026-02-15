/**
 * ContextSelector - Enhanced context selection for AI chat
 *
 * Allows selecting:
 * - Specific line ranges from current file
 * - Additional files to include
 * - k_rag search results
 * - Git diff context
 * - Token count preview with truncation warning
 */

import { useState, useCallback, useMemo, memo } from 'react';
import { useAssistantChatStore } from '../../stores/assistant-store';
import { useCodeEditorStore } from '../../stores/code-editor-store';
import {
  FileCode,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Plus,
  X,
  GitCompareArrows,
  Search,
  Hash,
  Folder,
  Check,
} from 'lucide-react';

// Rough token estimation (4 chars per token average)
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

// Context types that can be included
interface AdditionalContext {
  id: string;
  type: 'file' | 'rag' | 'gitdiff' | 'selection';
  label: string;
  content: string;
  tokens: number;
}

interface LineRange {
  start: number;
  end: number;
}

interface ContextSelectorProps {
  onContextChange?: (contexts: AdditionalContext[]) => void;
}

// Line range selector component
function LineRangeSelector({
  totalLines,
  range,
  onChange,
}: {
  totalLines: number;
  range: LineRange | null;
  onChange: (range: LineRange | null) => void;
}) {
  const [start, setStart] = useState(range?.start?.toString() || '');
  const [end, setEnd] = useState(range?.end?.toString() || '');

  const handleApply = () => {
    const startNum = parseInt(start) || 1;
    const endNum = parseInt(end) || totalLines;

    if (startNum > 0 && endNum >= startNum && endNum <= totalLines) {
      onChange({ start: startNum, end: endNum });
    }
  };

  const handleClear = () => {
    setStart('');
    setEnd('');
    onChange(null);
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <Hash className="w-3 h-3 text-muted-foreground" />
      <span className="text-muted-foreground">Lines:</span>
      <input
        type="number"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        placeholder="1"
        min={1}
        max={totalLines}
        className="w-14 px-1.5 py-0.5 bg-background border border-border rounded text-center text-xs"
      />
      <span className="text-muted-foreground">-</span>
      <input
        type="number"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        placeholder={String(totalLines)}
        min={1}
        max={totalLines}
        className="w-14 px-1.5 py-0.5 bg-background border border-border rounded text-center text-xs"
      />
      <button
        onClick={handleApply}
        className="px-1.5 py-0.5 bg-primary/20 text-primary rounded text-[10px] hover:bg-primary/30"
      >
        Apply
      </button>
      {range && (
        <button
          onClick={handleClear}
          className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[10px] hover:bg-muted/80"
        >
          All
        </button>
      )}
    </div>
  );
}

// Token count display
function TokenDisplay({
  tokens,
  maxTokens,
  warning,
}: {
  tokens: number;
  maxTokens: number;
  warning: boolean;
}) {
  const percentage = Math.min((tokens / maxTokens) * 100, 100);
  const colorClass =
    percentage >= 80 ? 'text-red-500' : percentage >= 60 ? 'text-yellow-500' : 'text-green-500';

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Context:</span>
      <span className={colorClass}>
        ~{tokens.toLocaleString()} tokens
      </span>
      {warning && (
        <span className="flex items-center gap-1 text-yellow-500">
          <AlertTriangle className="w-3 h-3" />
          May be truncated
        </span>
      )}
    </div>
  );
}

// Main component
export const ContextSelector = memo(function ContextSelector({
  onContextChange,
}: ContextSelectorProps) {
  const { editorContext, includeContext, setIncludeContext } = useAssistantChatStore();
  const { changedFiles } = useCodeEditorStore();

  const [isExpanded, setIsExpanded] = useState(false);
  const [lineRange, setLineRange] = useState<LineRange | null>(null);
  const [includeGitDiff, setIncludeGitDiff] = useState(false);
  const [includeRAG, setIncludeRAG] = useState(false);
  const [ragQuery, setRagQuery] = useState('');
  const [additionalFiles, setAdditionalFiles] = useState<string[]>([]);

  // Calculate context content with line range
  const contextContent = useMemo(() => {
    if (!editorContext || !includeContext) return '';

    const lines = editorContext.content.split('\n');
    if (lineRange) {
      return lines.slice(lineRange.start - 1, lineRange.end).join('\n');
    }
    return editorContext.content;
  }, [editorContext, includeContext, lineRange]);

  // Calculate total token estimate
  const totalTokens = useMemo(() => {
    let total = estimateTokens(contextContent);

    // Add git diff estimate (rough)
    if (includeGitDiff && changedFiles.length > 0) {
      total += 500; // Rough estimate for git diff
    }

    // Add RAG results estimate
    if (includeRAG && ragQuery) {
      total += 1000; // Rough estimate for RAG results
    }

    return total;
  }, [contextContent, includeGitDiff, changedFiles.length, includeRAG, ragQuery]);

  const maxTokens = 8192;
  const showWarning = totalTokens > maxTokens * 0.7;

  // Handle toggle changes
  const handleGitDiffToggle = useCallback((enabled: boolean) => {
    setIncludeGitDiff(enabled);
  }, []);

  const handleRAGToggle = useCallback((enabled: boolean) => {
    setIncludeRAG(enabled);
  }, []);

  if (!editorContext) return null;

  const totalLines = editorContext.content.split('\n').length;
  const selectedLines = lineRange
    ? `${lineRange.start}-${lineRange.end} (${lineRange.end - lineRange.start + 1} lines)`
    : `All (${totalLines} lines)`;

  return (
    <div className="border-t border-border bg-card/30">
      {/* Header - always visible */}
      <div className="flex items-center justify-between px-3 py-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <FileCode className="w-3.5 h-3.5" />
          <span className="truncate max-w-[120px]">{editorContext.filePath.split('/').pop()}</span>
          <span className="text-[10px] opacity-60">({selectedLines})</span>
        </button>

        <div className="flex items-center gap-2">
          <TokenDisplay tokens={totalTokens} maxTokens={maxTokens} warning={showWarning} />
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeContext}
              onChange={(e) => setIncludeContext(e.target.checked)}
              className="w-3 h-3 rounded border-border bg-background accent-primary"
            />
            <span className="text-[10px] text-muted-foreground">Include</span>
          </label>
        </div>
      </div>

      {/* Expanded options */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Line range selector */}
          <div className="p-2 bg-muted/30 rounded border border-border">
            <LineRangeSelector
              totalLines={totalLines}
              range={lineRange}
              onChange={setLineRange}
            />
          </div>

          {/* Context toggles */}
          <div className="space-y-2">
            {/* Git diff toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeGitDiff}
                onChange={(e) => handleGitDiffToggle(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border bg-background accent-primary"
              />
              <GitCompareArrows className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-xs">Include git diff</span>
              {changedFiles.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  ({changedFiles.length} changed files)
                </span>
              )}
            </label>

            {/* RAG search toggle */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeRAG}
                  onChange={(e) => handleRAGToggle(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-border bg-background accent-primary"
                />
                <Search className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs">Include k_rag search</span>
              </label>

              {includeRAG && (
                <input
                  type="text"
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  placeholder="Search query for relevant code..."
                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
            </div>
          </div>

          {/* File info */}
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <div>Language: {editorContext.language}</div>
            <div>Path: {editorContext.filePath}</div>
            {lineRange && (
              <div>Selected: {lineRange.end - lineRange.start + 1} of {totalLines} lines</div>
            )}
          </div>

          {/* Truncation warning */}
          {showWarning && (
            <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-500">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                Context is large ({totalTokens.toLocaleString()} tokens).
                Consider selecting a smaller line range.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ContextSelector;
