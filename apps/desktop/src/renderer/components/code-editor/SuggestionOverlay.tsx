/**
 * SuggestionOverlay - Code suggestion UI with diff preview
 *
 * Parses code blocks from AI responses, provides "Apply to Editor"
 * functionality with visual diff preview.
 */

import { useState, useMemo, memo } from 'react';
import {
  Check,
  X,
  Copy,
  ArrowRight,
  FileCode,
  ChevronDown,
  ChevronRight,
  GitCompareArrows,
  CheckCircle2,
} from 'lucide-react';

export interface CodeSuggestion {
  id: string;
  code: string;
  language: string;
  fileHint?: string; // Detected file path from context
  startLine?: number;
  endLine?: number;
  applied?: boolean;
}

interface SuggestionOverlayProps {
  suggestion: CodeSuggestion;
  currentContent?: string; // Current file content for diff
  onApply: (suggestion: CodeSuggestion) => void;
  onReject?: (suggestion: CodeSuggestion) => void;
  onCopy?: (code: string) => void;
  compact?: boolean;
}

// Simple diff calculation
function computeDiff(original: string, modified: string): DiffLine[] {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const result: DiffLine[] = [];

  // Simple line-by-line comparison (not a full diff algorithm)
  const maxLen = Math.max(origLines.length, modLines.length);

  let origIdx = 0;
  let modIdx = 0;

  while (origIdx < origLines.length || modIdx < modLines.length) {
    const origLine = origLines[origIdx];
    const modLine = modLines[modIdx];

    if (origIdx >= origLines.length) {
      // Addition at end
      result.push({ type: 'add', content: modLine, lineNumber: modIdx + 1 });
      modIdx++;
    } else if (modIdx >= modLines.length) {
      // Deletion at end
      result.push({ type: 'remove', content: origLine, lineNumber: origIdx + 1 });
      origIdx++;
    } else if (origLine === modLine) {
      // Same line
      result.push({ type: 'same', content: origLine, lineNumber: origIdx + 1 });
      origIdx++;
      modIdx++;
    } else {
      // Changed - show as remove + add
      result.push({ type: 'remove', content: origLine, lineNumber: origIdx + 1 });
      result.push({ type: 'add', content: modLine, lineNumber: modIdx + 1 });
      origIdx++;
      modIdx++;
    }
  }

  return result;
}

interface DiffLine {
  type: 'add' | 'remove' | 'same';
  content: string;
  lineNumber: number;
}

// Diff view component
function DiffView({ original, modified }: { original: string; modified: string }) {
  const diff = useMemo(() => computeDiff(original, modified), [original, modified]);

  // Count changes
  const additions = diff.filter(l => l.type === 'add').length;
  const deletions = diff.filter(l => l.type === 'remove').length;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Stats header */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/30 border-b border-border text-xs">
        <span className="text-green-500">+{additions}</span>
        <span className="text-red-500">-{deletions}</span>
      </div>

      {/* Diff content */}
      <div className="max-h-60 overflow-auto bg-background">
        <pre className="text-xs font-mono">
          {diff.map((line, i) => (
            <div
              key={i}
              className={`px-2 py-0.5 ${
                line.type === 'add'
                  ? 'bg-green-500/10 text-green-400'
                  : line.type === 'remove'
                    ? 'bg-red-500/10 text-red-400'
                    : 'text-muted-foreground'
              }`}
            >
              <span className="inline-block w-6 text-right text-muted-foreground/50 mr-2">
                {line.lineNumber}
              </span>
              <span className="inline-block w-4">
                {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
              </span>
              {line.content}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

// Main component
export const SuggestionOverlay = memo(function SuggestionOverlay({
  suggestion,
  currentContent,
  onApply,
  onReject,
  onCopy,
  compact = false,
}: SuggestionOverlayProps) {
  const [showDiff, setShowDiff] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasDiff = currentContent !== undefined && currentContent !== suggestion.code;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(suggestion.code);
      setCopied(true);
      onCopy?.(suggestion.code);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleApply = () => {
    onApply(suggestion);
  };

  if (suggestion.applied) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-500 py-1">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Applied
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1 mt-1 pt-1 border-t border-border">
        <button
          onClick={handleApply}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-primary/20 hover:bg-primary/30 text-primary rounded transition-colors"
          title="Apply this code to the editor"
        >
          <ArrowRight className="w-3 h-3" />
          Apply
        </button>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground rounded transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </button>

        {hasDiff && (
          <button
            onClick={() => setShowDiff(!showDiff)}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground rounded transition-colors"
            title="Show diff"
          >
            <GitCompareArrows className="w-3 h-3" />
          </button>
        )}

        {suggestion.fileHint && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
            <FileCode className="w-3 h-3" />
            {suggestion.fileHint.split('/').pop()}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">Code Suggestion</span>
          {suggestion.language && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
              {suggestion.language}
            </span>
          )}
          {suggestion.fileHint && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <FileCode className="w-3 h-3" />
              {suggestion.fileHint}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Copy code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {hasDiff && (
            <button
              onClick={() => setShowDiff(!showDiff)}
              className={`p-1 rounded transition-colors ${
                showDiff
                  ? 'text-primary bg-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title="Toggle diff view"
            >
              <GitCompareArrows className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Diff view */}
      {showDiff && hasDiff && (
        <div className="p-2 border-b border-border">
          <DiffView original={currentContent} modified={suggestion.code} />
        </div>
      )}

      {/* Code preview (collapsed if showing diff) */}
      {!showDiff && (
        <div className="max-h-40 overflow-auto">
          <pre className="p-3 text-xs font-mono text-foreground/90 whitespace-pre-wrap">
            {suggestion.code.length > 500 ? suggestion.code.slice(0, 500) + '\n...' : suggestion.code}
          </pre>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 bg-muted/20 border-t border-border">
        {onReject && (
          <button
            onClick={() => onReject(suggestion)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 text-muted-foreground rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Dismiss
          </button>
        )}

        <button
          onClick={handleApply}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          Apply to Editor
        </button>
      </div>
    </div>
  );
});

// Parse code blocks from markdown content
export function parseCodeBlocks(content: string): CodeSuggestion[] {
  const suggestions: CodeSuggestion[] = [];

  // Match code blocks with optional language and file path hints
  // Supports: ```language filename.ext or ```language:filename.ext
  const codeBlockRegex = /```(\w+)?(?::?([^\n]+))?\n([\s\S]*?)```/g;

  let match;
  let index = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const [, language = '', fileHint = '', code] = match;

    // Clean up file hint (might have leading/trailing spaces)
    const cleanFileHint = fileHint.trim();

    suggestions.push({
      id: `suggestion_${index++}_${Date.now()}`,
      code: code.trim(),
      language: language.toLowerCase() || 'text',
      fileHint: cleanFileHint || undefined,
    });
  }

  return suggestions;
}

// Extract file path from content context (common patterns)
export function inferFilePathFromContext(content: string): string | undefined {
  // Look for common patterns like "in file.ts" or "in the file.ts file"
  const patterns = [
    /(?:in|for|from|modify|update|edit)\s+[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
    /file[:\s]+[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
    /[`"]([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?\s*:/,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

export default SuggestionOverlay;
