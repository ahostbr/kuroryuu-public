/**
 * HeadlineCard Component
 * Displays a news headline with title, summary, source, date, and optional image.
 */
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card';
import { Badge } from '../../../ui/badge';

export interface HeadlineCardProps {
  title: string;
  summary?: string;
  source?: string;
  published_at?: string | Date;
  publishedAt?: string | Date;
  sentiment?: 'positive' | 'negative' | 'neutral';
  image_url?: string;
  imageUrl?: string;
}

export function HeadlineCard({ title, summary, source, published_at, publishedAt, sentiment, image_url, imageUrl }: HeadlineCardProps): React.ReactElement {
  const displayImageUrl = image_url || imageUrl;
  const displayPublishedAt = published_at || publishedAt;

  const formatDate = (date: string | Date | undefined): string => {
    if (!date) return '';
    try { return new Date(date).toLocaleDateString(); } catch { return String(date); }
  };

  return (
    <Card className="bg-card border-border group cursor-pointer hover:border-primary/40 transition-all duration-300">
      {displayImageUrl && (
        <div className="overflow-hidden rounded-t-lg">
          <img src={displayImageUrl} alt={title} className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-105" />
        </div>
      )}
      <CardHeader>
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg text-foreground group-hover:text-primary transition-colors duration-200">{title}</CardTitle>
          {sentiment && sentiment !== 'neutral' && (
            <Badge variant="outline" className="shrink-0 border-border text-muted-foreground">{sentiment}</Badge>
          )}
        </div>
        {(source || displayPublishedAt) && (
          <CardDescription className="text-muted-foreground">
            {source}{source && displayPublishedAt ? ' \u2022 ' : ''}{formatDate(displayPublishedAt)}
          </CardDescription>
        )}
      </CardHeader>
      {summary && <CardContent><p className="text-sm text-foreground/70">{summary}</p></CardContent>}
    </Card>
  );
}

export default HeadlineCard;
