/**
 * VideoCard Component
 * Displays a video with thumbnail, title, description, duration, and platform.
 */
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../../ui/card';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';

export interface VideoCardProps {
  title: string;
  description?: string;
  thumbnail_url?: string;
  duration?: string;
  platform?: string;
  url?: string;
  youtube_id?: string;
  embed?: boolean;
}

export function VideoCard({ title, description, thumbnail_url, duration, platform, url, youtube_id, embed = false }: VideoCardProps): React.ReactElement {
  const extractYouTubeId = (videoUrl: string): string | null => {
    const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/, /youtube\.com\/embed\/([^&\s]+)/];
    for (const pattern of patterns) { const match = videoUrl.match(pattern); if (match) return match[1]; }
    return null;
  };

  const videoId = youtube_id || (url ? extractYouTubeId(url) : null);
  const showEmbed = embed && videoId;

  return (
    <Card className="overflow-hidden bg-card border-border">
      {showEmbed ? (
        <div className="relative w-full pt-[56.25%]">
          <iframe className="absolute top-0 left-0 w-full h-full" src={`https://www.youtube.com/embed/${videoId}`} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      ) : (
        <div className="relative group">
          {thumbnail_url && <img src={thumbnail_url} alt={title} className="w-full h-48 object-cover" loading="lazy" />}
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
        {platform && <CardDescription className="text-muted-foreground">{platform}</CardDescription>}
      </CardHeader>
      {description && <CardContent><p className="text-sm text-muted-foreground line-clamp-2">{description}</p></CardContent>}
      {url && !showEmbed && (
        <CardFooter>
          <Button asChild variant="outline" className="w-full border-border text-muted-foreground hover:bg-primary/10 hover:text-foreground">
            <a href={url} target="_blank" rel="noopener noreferrer">Watch Video</a>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default VideoCard;
