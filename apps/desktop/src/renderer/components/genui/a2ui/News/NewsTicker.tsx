/**
 * NewsTicker Component
 * Displays a scrolling ticker of news items with source badges.
 */
import React from 'react';
import { Badge } from '../../../ui/badge';

export interface NewsTickerItem { source: string; headline: string; }

export interface NewsTickerProps { items: NewsTickerItem[]; }

export function NewsTicker({ items }: NewsTickerProps): React.ReactElement {
  if (!items || items.length === 0) {
    return (
      <div className="overflow-hidden bg-card border border-border rounded-lg p-3">
        <div className="text-sm text-muted-foreground text-center">No news items available</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-card border border-border rounded-lg p-3 hover:border-primary/40 transition-all duration-300">
      <div className="flex gap-6 whitespace-nowrap overflow-x-auto">
        {items.map((item, idx) => (
          <span key={idx} className="inline-flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">{item.source}</Badge>
            <span className="text-sm text-foreground">{item.headline}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default NewsTicker;
