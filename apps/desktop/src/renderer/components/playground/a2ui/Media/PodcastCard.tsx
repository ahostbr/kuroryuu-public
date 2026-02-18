/**
 * PodcastCard Component
 * Displays a podcast episode with thumbnail, host, episode number, duration, and description.
 */
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../../ui/card';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';

export interface PodcastCardProps {
  title: string;
  description?: string;
  host: string;
  episode_number?: number | string;
  duration?: string;
  thumbnail_url?: string;
  url?: string;
  published_at?: string | Date;
  categories?: string[];
}

export function PodcastCard({ title, description, host, episode_number, duration, thumbnail_url, url, published_at, categories }: PodcastCardProps): React.ReactElement {
  const formatDate = (date: string | Date): string => {
    try { return new Date(date).toLocaleDateString(); } catch { return String(date); }
  };

  return (
    <Card className="overflow-hidden bg-card border-border">
      {thumbnail_url && (
        <div className="relative group">
          <img src={thumbnail_url} alt={title} className="w-full h-48 object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
              <svg className="w-8 h-8 text-primary-foreground ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
          {duration && <Badge className="absolute bottom-2 right-2 bg-primary text-primary-foreground">{duration}</Badge>}
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-base line-clamp-2 text-foreground">{title}</CardTitle>
        <CardDescription className="text-muted-foreground">
          {host}{episode_number && ` \u2022 Episode ${episode_number}`}{published_at && ` \u2022 ${formatDate(published_at)}`}
        </CardDescription>
      </CardHeader>
      {(description || categories) && (
        <CardContent className="space-y-3">
          {description && <p className="text-sm text-muted-foreground line-clamp-3">{description}</p>}
          {categories && categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {categories.map((category, idx) => (
                <Badge key={idx} className="text-xs bg-primary/20 text-primary border-primary/30">{category}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      )}
      {url && (
        <CardFooter>
          <Button asChild className="w-full" variant="primary">
            <a href={url} target="_blank" rel="noopener noreferrer">Listen Now</a>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default PodcastCard;
