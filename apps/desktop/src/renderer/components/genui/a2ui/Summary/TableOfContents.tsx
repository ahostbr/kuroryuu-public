/**
 * TableOfContents Component
 * Displays a hierarchical outline with up to 4 levels of nesting.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';

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
    return `${safeLevel * 1.5}rem`;
  };

  const getAnchor = (item: TOCItem): string => {
    if (item.anchor) return item.anchor;
    return `#${item.title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')}`;
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base text-primary">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <nav>
          <ul className="space-y-2">
            {items.map((item, idx) => (
              <li
                key={idx}
                style={{ marginLeft: getIndentation(item.level) }}
                className="flex items-start justify-between gap-2 group"
              >
                <a
                  href={getAnchor(item)}
                  className="text-sm text-primary hover:text-primary/80 hover:underline flex-1 leading-relaxed transition-colors"
                >
                  {item.title}
                </a>
                {show_page_numbers && item.page !== undefined && (
                  <span className="text-xs text-muted-foreground shrink-0 font-mono">{item.page}</span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </CardContent>
    </Card>
  );
}

export default TableOfContents;
