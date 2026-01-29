/**
 * MarkdownRenderer - Full markdown rendering for AI chat messages
 *
 * Uses react-markdown with remark-gfm for GitHub Flavored Markdown support.
 * Integrates with CodeBlock component for syntax-highlighted code blocks.
 * Supports inline code suggestions with "Apply to Editor" functionality.
 */

import { useState, useCallback, memo, createContext, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, ArrowRight, CheckCircle2 } from 'lucide-react';

// Context for passing onApplyCode callback to code blocks
interface CodeApplyContextValue {
  onApplyCode?: (code: string, language: string) => void;
  appliedBlocks: Set<string>;
  markApplied: (blockId: string) => void;
}

const CodeApplyContext = createContext<CodeApplyContextValue>({
  appliedBlocks: new Set(),
  markApplied: () => {},
});

// Generate a stable ID for a code block based on its content
function generateBlockId(code: string, language: string): string {
  // Simple hash based on content
  let hash = 0;
  const str = code + language;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `block_${Math.abs(hash)}`;
}

// Code block component with syntax highlighting, copy, and apply buttons
// Uses Copilot theme CSS variables for consistent styling
const CodeBlock = memo(function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  const { onApplyCode, appliedBlocks, markApplied } = useContext(CodeApplyContext);

  const blockId = generateBlockId(code, language);
  const isApplied = appliedBlocks.has(blockId);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handleApply = useCallback(() => {
    if (onApplyCode && !isApplied) {
      onApplyCode(code, language);
      markApplied(blockId);
    }
  }, [code, language, onApplyCode, isApplied, blockId, markApplied]);

  return (
    <div
      className="relative my-2 rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--cp-bg-primary, #1e1e1e)',
        border: '1px solid var(--cp-border-default, #3c3c3c)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{
          backgroundColor: 'var(--cp-bg-secondary, #252526)',
          borderBottom: '1px solid var(--cp-border-default, #3c3c3c)',
        }}
      >
        <span
          className="text-xs font-mono"
          style={{ color: 'var(--cp-text-muted, #6e6e6e)' }}
        >
          {language || 'text'}
        </span>
        <div className="flex items-center gap-1">
          {/* Apply button - only show if callback is provided */}
          {onApplyCode && (
            isApplied ? (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 text-[10px]"
                style={{ color: 'var(--cp-accent-green, #4ec9b0)' }}
              >
                <CheckCircle2 className="w-3 h-3" />
                Applied
              </span>
            ) : (
              <button
                onClick={handleApply}
                className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded transition-colors hover:bg-white/5"
                style={{ color: 'var(--cp-text-muted, #6e6e6e)' }}
                title="Apply to editor"
              >
                <ArrowRight className="w-3 h-3" />
                Apply
              </button>
            )
          )}
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="p-1 transition-colors hover:bg-white/5 rounded"
            style={{ color: copied ? 'var(--cp-accent-green, #4ec9b0)' : 'var(--cp-text-muted, #6e6e6e)' }}
            title="Copy code"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
      <pre className="p-3 overflow-x-auto text-sm">
        <code
          className="font-mono"
          style={{ color: 'var(--cp-text-secondary, #9d9d9d)' }}
        >
          {code}
        </code>
      </pre>
    </div>
  );
});

// Inline code styling - uses Copilot theme variables
const InlineCode = memo(function InlineCode({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <code
      className="px-1.5 py-0.5 rounded text-[0.9em] font-mono"
      style={{
        backgroundColor: 'var(--cp-bg-tertiary, #2d2d30)',
        color: 'var(--cp-accent-orange, #ce9178)',
        border: '1px solid var(--cp-border-default, #3c3c3c)',
      }}
    >
      {children}
    </code>
  );
});

// Custom components for react-markdown
const markdownComponents = {
  // Code blocks (fenced and inline)
  code: ({
    inline,
    className,
    children,
    ...props
  }: {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
  }) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const code = String(children).replace(/\n$/, '');

    if (!inline && (match || code.includes('\n'))) {
      return <CodeBlock language={language} code={code} />;
    }

    return <InlineCode>{children}</InlineCode>;
  },

  // Paragraphs
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),

  // Headers
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0 text-foreground">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-bold mb-2 mt-3 first:mt-0 text-foreground">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-bold mb-1.5 mt-2 first:mt-0 text-foreground">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-sm font-semibold mb-1 mt-2 first:mt-0 text-foreground">{children}</h4>
  ),

  // Lists
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-2 space-y-0.5 ml-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-2 space-y-0.5 ml-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-sm">{children}</li>
  ),

  // Blockquotes
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">
      {children}
    </blockquote>
  ),

  // Links
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {children}
    </a>
  ),

  // Emphasis
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),

  // Horizontal rule
  hr: () => <hr className="my-3 border-border" />,

  // Tables (GFM)
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-sm border border-border rounded">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-muted/50">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody className="divide-y divide-border">{children}</tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="hover:bg-muted/30">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-2 py-1.5 text-left font-medium text-foreground border-b border-border">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-2 py-1.5 text-muted-foreground">{children}</td>
  ),

  // Strikethrough (GFM)
  del: ({ children }: { children?: React.ReactNode }) => (
    <del className="line-through text-muted-foreground">{children}</del>
  ),

  // Task lists (GFM)
  input: ({ checked, ...props }: { checked?: boolean }) => (
    <input
      type="checkbox"
      checked={checked}
      readOnly
      className="mr-1.5 accent-primary"
      {...props}
    />
  ),
};

// Main MarkdownRenderer component
export interface MarkdownRendererProps {
  content: string;
  onApplyCode?: (code: string, language: string) => void;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  onApplyCode,
}: MarkdownRendererProps) {
  // Track which code blocks have been applied
  const [appliedBlocks, setAppliedBlocks] = useState<Set<string>>(new Set());

  const markApplied = useCallback((blockId: string) => {
    setAppliedBlocks(prev => new Set(prev).add(blockId));
  }, []);

  const contextValue: CodeApplyContextValue = {
    onApplyCode,
    appliedBlocks,
    markApplied,
  };

  return (
    <CodeApplyContext.Provider value={contextValue}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents as any}
      >
        {content}
      </ReactMarkdown>
    </CodeApplyContext.Provider>
  );
});

export default MarkdownRenderer;
