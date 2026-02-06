/**
 * TableOfContents Component — Imperial navigation scroll
 * Hierarchical outline with gold accent links.
 */
import React from 'react';

export interface TOCItem {
  title: string;
  level?: number;
  anchor?: string;
  page?: number;
}

export interface TableOfContentsProps {
  items: TOCItem[];
  title?: string;
  show_page_numbers?: boolean;
}

export function TableOfContents({
  items,
  title = 'Table of Contents',
  show_page_numbers = false,
}: TableOfContentsProps): React.ReactElement {
  const getIndentation = (level: number = 0) => {
    const safeLevel = Math.min(Math.max(level, 0), 3);
    return `${safeLevel * 1.25}rem`;
  };

  const getAnchor = (item: TOCItem): string => {
    if (item.anchor) return item.anchor;
    if (!item.title) return '#';
    return `#${item.title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')}`;
  };

  return (
    <div className="genui-card genui-accent-left rounded-md overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3" style={{ borderBottom: '1px solid color-mix(in srgb, var(--g-accent) 8%, transparent)' }}>
        <h3 className="text-sm font-semibold tracking-wide" style={{ color: 'color-mix(in srgb, var(--g-accent) 75%, transparent)' }}>
          {title}
        </h3>
      </div>

      {/* Navigation items */}
      <nav className="px-5 py-4">
        <ul className="space-y-2">
          {(items || []).map((item, idx) => (
            <li
              key={idx}
              style={{ marginLeft: getIndentation(item.level) }}
              className="flex items-start justify-between gap-2 group"
            >
              <a
                href={getAnchor(item)}
                className="text-sm flex-1 leading-relaxed transition-all duration-300"
                style={{
                  color: 'color-mix(in srgb, var(--g-accent) 60%, transparent)',
                  fontFamily: item.level === 0 ? 'inherit' : "ui-monospace, 'Share Tech Mono', monospace",
                  fontSize: item.level === 0 ? '0.875rem' : '0.8rem',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.color = 'color-mix(in srgb, var(--g-accent) 95%, transparent)';
                  (e.target as HTMLElement).style.textShadow = '0 0 8px color-mix(in srgb, var(--g-accent) 20%, transparent)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.color = 'color-mix(in srgb, var(--g-accent) 60%, transparent)';
                  (e.target as HTMLElement).style.textShadow = 'none';
                }}
              >
                {item.title || 'Untitled'}
              </a>
              {show_page_numbers && item.page !== undefined && (
                <span className="genui-label shrink-0" style={{ fontSize: '0.6rem' }}>{item.page}</span>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export default TableOfContents;
