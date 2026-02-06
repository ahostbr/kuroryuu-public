/**
 * BookCard Component
 * Displays a book resource with cover image, title, author, rating, and description.
 */
import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../ui/card';
import { Button } from '../../../ui/button';

export interface BookCardProps {
  title: string;
  author: string;
  coverImage?: string;
  coverImageUrl?: string;
  rating?: number;
  year?: number;
  isbn?: string;
  description?: string;
  url?: string;
}

export function BookCard({ title, author, coverImage, coverImageUrl, rating, year, isbn, description, url }: BookCardProps): React.ReactElement {
  const [imageError, setImageError] = React.useState(false);
  const displayCoverImage = coverImage || coverImageUrl;

  const renderStars = () => {
    if (rating === undefined || rating === null) return null;
    const clamped = Math.min(5, Math.max(1, rating));
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(<span key={i} className={i <= clamped ? 'text-yellow-500' : 'text-muted-foreground/30'}>{'\u2605'}</span>);
    }
    return (
      <>
        <div className="flex items-center text-base leading-none">{stars}</div>
        <span className="text-xs text-muted-foreground">{rating}/5</span>
      </>
    );
  };

  return (
    <Card className="overflow-hidden bg-card border-border">
      {!imageError && displayCoverImage ? (
        <img src={displayCoverImage} alt={title} loading="lazy" className="w-full h-64 object-cover" onError={() => setImageError(true)} />
      ) : (
        <div className="w-full h-48 bg-secondary flex items-center justify-center">
          <div className="text-center p-4">
            <span className="text-5xl text-muted-foreground/30">{'\uD83D\uDCDA'}</span>
            <p className="text-xs text-muted-foreground mt-2">No cover available</p>
          </div>
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-base line-clamp-2 text-foreground">{title}</CardTitle>
        <CardDescription>
          <div className="space-y-1">
            <div className="text-muted-foreground">by {author}</div>
            <div className="flex items-center gap-2 flex-wrap">
              {renderStars()}
              {year && <><span className="text-xs text-muted-foreground">&bull;</span><span className="text-xs text-muted-foreground">{year}</span></>}
              {isbn && <><span className="text-xs text-muted-foreground">&bull;</span><span className="text-xs text-muted-foreground/60">ISBN: {isbn}</span></>}
            </div>
          </div>
        </CardDescription>
      </CardHeader>
      {description && <CardContent><p className="text-sm text-muted-foreground line-clamp-3">{description}</p></CardContent>}
      {url && (
        <CardFooter>
          <Button asChild variant="outline" className="w-full border-border text-muted-foreground hover:bg-primary/10 hover:text-foreground">
            <a href={url} target="_blank" rel="noopener noreferrer">Read More</a>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default BookCard;
