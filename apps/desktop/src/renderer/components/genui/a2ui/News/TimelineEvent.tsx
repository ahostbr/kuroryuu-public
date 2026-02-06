/**
 * TimelineEvent Component
 * Displays a single event in a timeline with timestamp, title, description, and optional badges.
 */
import React from 'react';
import { Badge } from '../../../ui/badge';

export interface TimelineEventProps {
  timestamp: string | Date;
  title: string;
  description: string;
  category?: string;
  status?: string;
}

export function TimelineEvent({ timestamp, title, description, category, status }: TimelineEventProps): React.ReactElement {
  const formatTimestamp = (ts: string | Date): string => {
    try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
  };

  return (
    <div className="flex gap-4 pb-4 border-l-2 border-primary/30 pl-4 relative group">
      <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-primary border-4 border-background shadow-lg group-hover:shadow-primary/30 transition-shadow duration-300" aria-hidden="true" />
      <div className="flex-1 bg-card border border-border rounded-lg p-3 hover:border-primary/40 transition-all duration-300">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {category && <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">{category}</Badge>}
          {status && <Badge variant="outline" className="text-xs bg-secondary text-muted-foreground border-border">{status}</Badge>}
        </div>
        <div className="text-xs text-muted-foreground mb-1">{formatTimestamp(timestamp)}</div>
        <p className="text-sm text-foreground/70">{description}</p>
      </div>
    </div>
  );
}

export default TimelineEvent;
