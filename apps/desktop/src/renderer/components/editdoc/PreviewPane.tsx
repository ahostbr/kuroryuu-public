/**
 * PreviewPane - Rendered markdown preview
 * GitHub-flavored markdown with code highlighting
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PreviewPaneProps {
  content: string;
  className?: string;
}

export function PreviewPane({ content, className = '' }: PreviewPaneProps) {
  return (
    <div
      className={`h-full overflow-auto p-6 prose prose-invert prose-sm max-w-none ${className}`}
      style={{
        backgroundColor: 'hsl(var(--card))',
        color: 'hsl(var(--foreground))',
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headers
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-green-400 border-b border-border pb-2 mb-4">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold text-green-400 border-b border-border pb-1 mb-3 mt-6">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-medium text-green-400 mb-2 mt-4">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-medium text-green-400 mb-2 mt-3">
              {children}
            </h4>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className="text-foreground mb-3 leading-relaxed">{children}</p>
          ),

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),

          // Code blocks
          pre: ({ children }) => (
            <pre className="bg-background rounded-lg p-4 overflow-x-auto my-4 border border-border">
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="bg-muted px-1.5 py-0.5 rounded text-orange-400 text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className="text-sm font-mono text-foreground" {...props}>
                {children}
              </code>
            );
          },

          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-3 space-y-1 text-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-3 space-y-1 text-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-foreground">
              {children}
            </li>
          ),

          // Task lists (GFM)
          input: ({ checked, ...props }) => (
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className="mr-2 accent-primary"
              {...props}
            />
          ),

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-muted-foreground pl-4 my-4 italic text-muted-foreground">
              {children}
            </blockquote>
          ),

          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-border rounded-lg overflow-hidden">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-muted/50">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 text-left text-sm font-semibold text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 text-sm text-foreground">{children}</td>
          ),

          // Horizontal rule
          hr: () => <hr className="border-border my-6" />,

          // Images
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt || ''}
              className="max-w-full h-auto rounded-lg my-4"
            />
          ),

          // Strong/emphasis
          strong: ({ children }) => (
            <strong className="font-bold text-red-400">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-purple-400">{children}</em>
          ),
          del: ({ children }) => (
            <del className="line-through text-muted-foreground">{children}</del>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
