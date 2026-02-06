/**
 * PlaylistCard Component
 * Displays a playlist or collection of media items.
 */
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../../ui/card';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';

export interface PlaylistCardProps {
  title: string;
  description?: string;
  item_count?: number;
  thumbnail_url?: string;
  platform?: string;
  url?: string;
  creator?: string;
  total_duration?: string;
}

export function PlaylistCard({ title, description, item_count, thumbnail_url, platform, url, creator, total_duration }: PlaylistCardProps): React.ReactElement {
  return (
    <Card className="overflow-hidden bg-card border-border hover:border-primary/40 transition-colors">
      {thumbnail_url && (
        <div className="relative group">
          <img src={thumbnail_url} alt={title} className="w-full h-40 object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
          <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-foreground ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
          {item_count !== undefined && <Badge className="absolute top-2 right-2 bg-primary text-primary-foreground">{item_count} {item_count === 1 ? 'item' : 'items'}</Badge>}
          {total_duration && <Badge className="absolute bottom-2 left-2 bg-primary text-primary-foreground">{total_duration}</Badge>}
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-base line-clamp-2 text-foreground">{title}</CardTitle>
        <CardDescription className="text-muted-foreground">
          {platform && <span>{platform}</span>}{platform && creator && ' \u2022 '}{creator && <span>{creator}</span>}
        </CardDescription>
      </CardHeader>
      {description && <CardContent><p className="text-sm text-muted-foreground line-clamp-2">{description}</p></CardContent>}
      {url && (
        <CardFooter>
          <Button asChild variant="outline" className="w-full border-border text-muted-foreground hover:bg-primary/10 hover:text-foreground">
            <a href={url} target="_blank" rel="noopener noreferrer">Open Playlist</a>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default PlaylistCard;
