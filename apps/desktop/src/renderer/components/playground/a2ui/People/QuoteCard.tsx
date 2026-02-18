/**
 * QuoteCard Component
 * Displays a quote with attribution, author title, and optional avatar.
 */
import React from 'react';
import { Card, CardContent } from '../../../ui/card';

export interface QuoteCardProps {
  quote: string;
  author: string;
  title?: string;
  context?: string;
  avatar_url?: string;
}

export function QuoteCard({ quote, author, title, context, avatar_url }: QuoteCardProps): React.ReactElement {
  return (
    <Card className="border-l-4 border-l-primary bg-card border-border">
      <CardContent className="pt-6">
        <blockquote className="text-lg italic mb-4 text-foreground relative">
          <span className="text-primary text-3xl absolute -top-2 -left-1 opacity-50">&ldquo;</span>
          <span className="pl-6">{quote}</span>
          <span className="text-primary text-3xl opacity-50">&rdquo;</span>
        </blockquote>
        <div className="flex items-center gap-3">
          {avatar_url ? (
            <img src={avatar_url} alt={author} className="w-10 h-10 rounded-full border border-border" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center">
              <span className="text-sm font-semibold text-muted-foreground">{author.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div>
            <div className="font-semibold text-foreground">{author}</div>
            {title && <div className="text-sm text-muted-foreground">{title}</div>}
          </div>
        </div>
        {context && <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border">{context}</p>}
      </CardContent>
    </Card>
  );
}

export default QuoteCard;
